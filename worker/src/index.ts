import {
  ALLOWED_DOMAINS,
  LIMITS,
  attachmentResponse,
  corsHeaders as buildCorsHeaders,
  isUuid,
  jsonResponse,
  normalizeMailbox,
  toBase64,
} from "../../shared/security";

export interface Env {
  DB: D1Database;
  /** Admin login secret. Set with: npx wrangler secret put ADMIN_PASSWORD (min 12 chars). */
  ADMIN_PASSWORD?: string;
  /** Optional, comma separated list of origins allowed to call the public API (CORS). */
  ALLOWED_ORIGINS?: string;
}

// ---------------------------------------------------------------------------
// Admin auth (constant-time compare + per-IP lockout stored in D1)
// ---------------------------------------------------------------------------

const ADMIN_MIN_PASSWORD_LENGTH = 12;
const ADMIN_MAX_FAILURES = 8;
const ADMIN_WINDOW_MS = 15 * 60 * 1000;

async function isAdmin(request: Request, env: Env): Promise<boolean> {
  const expected = env.ADMIN_PASSWORD;
  if (!expected) return false; // admin disabled until the secret is set
  if (expected.length < ADMIN_MIN_PASSWORD_LENGTH) {
    console.error(`ADMIN_PASSWORD is shorter than ${ADMIN_MIN_PASSWORD_LENGTH} characters; admin is disabled.`);
    return false;
  }
  const header = request.headers.get("Authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

let authTableReady = false;

async function ensureAuthTable(env: Env) {
  if (authTableReady) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS admin_failures (ip TEXT NOT NULL, at INTEGER NOT NULL)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_admin_failures_ip_at ON admin_failures(ip, at)"),
  ]);
  authTableReady = true;
}

async function isLockedOut(env: Env, ip: string): Promise<boolean> {
  await ensureAuthTable(env);
  const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM admin_failures WHERE ip = ? AND at > ?")
    .bind(ip, Date.now() - ADMIN_WINDOW_MS)
    .first<{ c: number }>();
  return (row?.c ?? 0) >= ADMIN_MAX_FAILURES;
}

async function recordFailure(env: Env, ip: string) {
  await env.DB.prepare("INSERT INTO admin_failures (ip, at) VALUES (?, ?)").bind(ip, Date.now()).run();
}

// ---------------------------------------------------------------------------
// MIME / email parsing
// ---------------------------------------------------------------------------

function decodeQuotedPrintable(str: string): string {
  return str
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

function decodeBase64(str: string): string {
  try {
    const binary = atob(str.replace(/\s/g, ""));
    try {
      return decodeURIComponent(
        binary.split("").map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
      );
    } catch {
      return binary;
    }
  } catch {
    return "";
  }
}

function decodeHeaderWord(value: string): string {
  return value.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_, charset, encoding, encoded) => {
      try {
        if (encoding.toUpperCase() === "B") {
          const binary = atob(encoded);
          return decodeURIComponent(
            binary.split("").map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
          );
        } else {
          return decodeURIComponent(
            encoded.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => "%" + hex)
          );
        }
      } catch {
        return encoded;
      }
    }
  );
}

interface Attachment {
  filename: string;
  contentType: string;
  contentBase64: string;
  size: number;
}

interface ParsedEmail {
  subject: string;
  fromAddress: string;
  fromName: string;
  textContent: string;
  htmlContent: string;
  preview: string;
  attachments: Attachment[];
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePartHeaders(headerStr: string): Record<string, string> {
  const map: Record<string, string> = {};
  const unfolded = headerStr.replace(/\n[ \t]+/g, " ");
  for (const line of unfolded.split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim().toLowerCase();
      const val = line.slice(idx + 1).trim();
      if (!map[key]) map[key] = val;
    }
  }
  return map;
}

function parseMimeParts(
  body: string,
  boundary: string,
  attachments: Attachment[],
  textRef: { text: string; html: string },
  depth = 0
) {
  // Hostile senders can nest multiparts (or create thousands of parts) to burn CPU.
  if (depth > LIMITS.MAX_MIME_DEPTH) return;

  const parts = body
    .split(new RegExp(`--${escapeRegex(boundary)}(?:--)?`))
    .slice(0, LIMITS.MAX_MIME_PARTS);

  for (const part of parts) {
    const splitIdx = part.indexOf("\n\n");
    if (splitIdx < 0) continue;
    const hdrStr = part.slice(0, splitIdx);
    const partBody = part.slice(splitIdx + 2).trim();
    const hdrs = parsePartHeaders(hdrStr);

    const ct = hdrs["content-type"] || "";
    const encoding = (hdrs["content-transfer-encoding"] || "").toLowerCase();
    const disposition = hdrs["content-disposition"] || "";

    // Check for nested multipart
    const nestedBoundary = ct.match(/boundary="?([^";\s]+)"?/i);
    if (nestedBoundary) {
      parseMimeParts(partBody, nestedBoundary[1], attachments, textRef, depth + 1);
      continue;
    }

    // Check if it's an attachment
    const filenameMatch = (disposition + " " + ct).match(/(?:file)?name="?([^";\n]+)"?/i);

    const isAttachment =
      disposition.includes("attachment") ||
      disposition.includes("inline") ||
      filenameMatch !== null;

    if (isAttachment && filenameMatch) {
      // Skip (don't even decode) anything past the attachment limit.
      if (attachments.length >= LIMITS.MAX_ATTACHMENTS) continue;

      const filename = decodeHeaderWord(filenameMatch[1].trim());
      let base64Data: string;
      if (encoding === "base64") {
        base64Data = partBody.replace(/\s/g, "");
      } else {
        base64Data = toBase64(partBody);
      }
      // Too large to store in a D1 row: drop it instead of failing the whole email.
      if (base64Data.length > LIMITS.MAX_ATTACHMENT_B64_CHARS) continue;

      const size = Math.ceil(base64Data.length * 3 / 4);
      attachments.push({
        filename,
        contentType: ct.split(";")[0].trim() || "application/octet-stream",
        contentBase64: base64Data,
        size,
      });
    } else if (ct.includes("text/plain") && !textRef.text) {
      if (encoding === "quoted-printable") {
        textRef.text = decodeQuotedPrintable(partBody);
      } else if (encoding === "base64") {
        textRef.text = decodeBase64(partBody);
      } else {
        textRef.text = partBody;
      }
    } else if (ct.includes("text/html") && !textRef.html) {
      if (encoding === "quoted-printable") {
        textRef.html = decodeQuotedPrintable(partBody);
      } else if (encoding === "base64") {
        textRef.html = decodeBase64(partBody);
      } else {
        textRef.html = partBody;
      }
    }
  }
}

function parseRawEmail(raw: string): ParsedEmail {
  const normalized = raw.replace(/\r\n/g, "\n");
  const headerBodySplit = normalized.indexOf("\n\n");
  const rawHeaders = headerBodySplit >= 0 ? normalized.slice(0, headerBodySplit) : normalized;
  const rawBody = headerBodySplit >= 0 ? normalized.slice(headerBodySplit + 2) : "";

  const headerMap: Record<string, string> = {};
  const unfoldedHeaders = rawHeaders.replace(/\n[ \t]+/g, " ");
  for (const line of unfoldedHeaders.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim().toLowerCase();
      const val = line.slice(colonIdx + 1).trim();
      if (!headerMap[key]) headerMap[key] = val;
    }
  }

  const subject = decodeHeaderWord(headerMap["subject"] || "");
  const fromRaw = decodeHeaderWord(headerMap["from"] || "");
  const contentType = headerMap["content-type"] || "text/plain";

  let fromName = "";
  let fromAddress = "";
  const fromMatch = fromRaw.match(/^"?([^"<]*?)"?\s*<([^>]+)>$/);
  if (fromMatch) {
    fromName = fromMatch[1].trim();
    fromAddress = fromMatch[2].trim();
  } else {
    fromAddress = fromRaw.trim();
  }

  const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/i);
  const boundary = boundaryMatch ? boundaryMatch[1] : null;

  const attachments: Attachment[] = [];
  const textRef = { text: "", html: "" };

  if (boundary) {
    parseMimeParts(rawBody, boundary, attachments, textRef);
  } else {
    const encoding = (headerMap["content-transfer-encoding"] || "").toLowerCase();
    let body: string;
    if (encoding === "quoted-printable") body = decodeQuotedPrintable(rawBody);
    else if (encoding === "base64") body = decodeBase64(rawBody);
    else body = rawBody;

    if (contentType.includes("text/html")) {
      textRef.html = body;
    } else {
      textRef.text = body;
    }
  }

  const preview = (textRef.text || textRef.html.replace(/<[^>]+>/g, ""))
    .trim()
    .slice(0, 200)
    .replace(/\s+/g, " ");

  return {
    subject,
    fromAddress,
    fromName,
    textContent: textRef.text,
    htmlContent: textRef.html,
    preview,
    attachments,
  };
}

// ---------------------------------------------------------------------------
// Worker entry points
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const isAdminPath = path.startsWith("/api/admin/");

      // The admin API never sends CORS headers (it is same-origin only).
      const cors = isAdminPath ? {} : buildCorsHeaders(request, env.ALLOWED_ORIGINS);
      const send = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
        jsonResponse(data, status, { ...cors, ...extra });

      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }

      // ---- Admin API (requires ADMIN_PASSWORD secret) ----
      if (isAdminPath) {
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";

        // Lockout is checked BEFORE the password, so a locked IP can't keep guessing.
        if (await isLockedOut(env, ip)) {
          return send({ error: "Too many failed attempts. Try again later." }, 429, { "Retry-After": "900" });
        }
        if (!(await isAdmin(request, env))) {
          await recordFailure(env, ip);
          return send({ error: "Unauthorized" }, 401);
        }

        // GET /api/admin/emails?q=&limit=&offset=
        if (path === "/api/admin/emails" && request.method === "GET") {
          const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
          const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 100);
          const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);
          const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
          const where = q
            ? "WHERE to_address LIKE ?1 ESCAPE '\\' OR from_address LIKE ?1 ESCAPE '\\' OR from_name LIKE ?1 ESCAPE '\\' OR subject LIKE ?1 ESCAPE '\\' OR preview LIKE ?1 ESCAPE '\\'"
            : "";
          const countStmt = q
            ? env.DB.prepare(`SELECT COUNT(*) AS c FROM emails ${where}`).bind(like)
            : env.DB.prepare("SELECT COUNT(*) AS c FROM emails");
          const listSql = `SELECT id, to_address, from_address, from_name, subject, preview, has_attachments, received_at FROM emails ${where} ORDER BY received_at DESC LIMIT ${limit} OFFSET ${offset}`;
          const listStmt = q ? env.DB.prepare(listSql).bind(like) : env.DB.prepare(listSql);
          const [count, list] = await Promise.all([countStmt.first<{ c: number }>(), listStmt.all()]);
          return send({ total: count?.c ?? 0, items: list.results || [] });
        }

        const m = path.match(/^\/api\/admin\/emails\/([^/]+)$/);
        if (m && isUuid(m[1])) {
          // GET /api/admin/emails/:id
          if (request.method === "GET") {
            const email = await env.DB.prepare("SELECT * FROM emails WHERE id = ?").bind(m[1]).first();
            if (!email) return send({ error: "Not found" }, 404);
            const { results: attachments } = await env.DB.prepare(
              "SELECT id, filename, content_type, size FROM attachments WHERE email_id = ?"
            ).bind(m[1]).all();
            return send({ ...email, attachments: attachments || [] });
          }

          // DELETE /api/admin/emails/:id
          if (request.method === "DELETE") {
            await env.DB.batch([
              env.DB.prepare("DELETE FROM attachments WHERE email_id = ?").bind(m[1]),
              env.DB.prepare("DELETE FROM emails WHERE id = ?").bind(m[1]),
            ]);
            return send({ ok: true });
          }
        }

        return send({ error: "Not found" }, 404);
      }

      // GET /api/messages?email=...
      if (path === "/api/messages" && request.method === "GET") {
        const email = normalizeMailbox(url.searchParams.get("email"));
        if (!email) return send({ error: "Invalid email" }, 400);

        const { results } = await env.DB.prepare(
          `SELECT id, to_address, from_address, from_name, subject, preview, has_attachments, is_read, received_at
           FROM emails WHERE to_address = ?
           ORDER BY received_at DESC
           LIMIT 50`
        ).bind(email).all();

        return send(results || []);
      }

      // DELETE /api/messages?email=...
      if (path === "/api/messages" && request.method === "DELETE") {
        const email = normalizeMailbox(url.searchParams.get("email"));
        if (!email) return send({ error: "Invalid email" }, 400);

        // Delete attachments first, then emails
        await env.DB.batch([
          env.DB.prepare(
            `DELETE FROM attachments WHERE email_id IN (SELECT id FROM emails WHERE to_address = ?)`
          ).bind(email),
          env.DB.prepare(`DELETE FROM emails WHERE to_address = ?`).bind(email),
        ]);

        return send({ ok: true });
      }

      // GET /api/messages/:id/attachments/:attachmentId?email=...
      const attMatch = path.match(/^\/api\/messages\/([^/]+)\/attachments\/([^/]+)$/);
      if (attMatch && request.method === "GET") {
        const [, emailId, attachmentId] = attMatch;
        const email = normalizeMailbox(url.searchParams.get("email"));
        if (!isUuid(emailId) || !isUuid(attachmentId) || !email) return send({ error: "Invalid request" }, 400);

        // Ownership check: the attachment must belong to a message in THIS mailbox.
        const attachment = await env.DB.prepare(
          `SELECT a.filename, a.content_base64
           FROM attachments a JOIN emails e ON e.id = a.email_id
           WHERE a.id = ? AND a.email_id = ? AND e.to_address = ?`
        ).bind(attachmentId, emailId, email).first();

        if (!attachment) return send({ error: "Not found" }, 404);
        return attachmentResponse(attachment, cors);
      }

      // GET /api/messages/:id?email=...
      const msgMatch = path.match(/^\/api\/messages\/([^/]+)$/);
      if (msgMatch && request.method === "GET") {
        const id = msgMatch[1];
        const email = normalizeMailbox(url.searchParams.get("email"));
        if (!isUuid(id) || !email) return send({ error: "Invalid request" }, 400);

        // Ownership check: only return the message if it belongs to this mailbox.
        const result = await env.DB.prepare(
          `SELECT * FROM emails WHERE id = ? AND to_address = ?`
        ).bind(id, email).first();

        if (!result) return send({ error: "Not found" }, 404);

        await env.DB.prepare(`UPDATE emails SET is_read = 1 WHERE id = ?`).bind(id).run();

        // Also fetch attachments metadata (without content)
        const { results: attachments } = await env.DB.prepare(
          `SELECT id, filename, content_type, size FROM attachments WHERE email_id = ?`
        ).bind(id).all();

        return send({ ...result, attachments: attachments || [] });
      }

      return send({ error: "Not found" }, 404);

    } catch (err) {
      console.error("Fetch handler error:", err);
      return jsonResponse({ error: "Internal error" }, 500);
    }
  },

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
    try {
      const to = (message.to || "").trim().toLowerCase();
      const domain = to.split("@")[1];

      if (!to || to.length > 254 || !domain || !ALLOWED_DOMAINS.includes(domain)) {
        message.setReject("Unknown domain");
        return;
      }

      // Refuse oversized mail before reading it into memory.
      if (message.rawSize > LIMITS.MAX_RAW_EMAIL_BYTES) {
        message.setReject("Message too large");
        return;
      }

      // Stop one mailbox from being flooded (protects the D1 quota).
      const existing = await env.DB.prepare("SELECT COUNT(*) AS c FROM emails WHERE to_address = ?")
        .bind(to)
        .first<{ c: number }>();
      if ((existing?.c ?? 0) >= LIMITS.MAX_EMAILS_PER_ADDRESS) {
        message.setReject("Mailbox full");
        return;
      }

      const rawEmail = await new Response(message.raw).text();
      const parsed = parseRawEmail(rawEmail);

      const id = crypto.randomUUID();
      const hasAttachments = parsed.attachments.length > 0 ? 1 : 0;

      await env.DB.prepare(`
        INSERT INTO emails
        (id, to_address, from_address, from_name, subject, preview, text_content, html_content, has_attachments, received_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        id,
        to,
        (parsed.fromAddress || message.from || "").slice(0, 320),
        parsed.fromName.slice(0, 200),
        (parsed.subject || message.headers.get("subject") || "").slice(0, 500),
        parsed.preview,
        parsed.textContent.slice(0, LIMITS.MAX_TEXT_CHARS),
        parsed.htmlContent.slice(0, LIMITS.MAX_HTML_CHARS),
        hasAttachments
      ).run();

      // Save attachments (one failing attachment must not lose the others)
      for (const att of parsed.attachments) {
        try {
          const attId = crypto.randomUUID();
          await env.DB.prepare(`
            INSERT INTO attachments (id, email_id, filename, content_type, size, content_base64)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(attId, id, att.filename.slice(0, 255), att.contentType.slice(0, 100), att.size, att.contentBase64).run();
        } catch (e) {
          console.error("Attachment insert error:", e);
        }
      }

    } catch (e) {
      console.error("Email handler error:", e);
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    try {
      await env.DB.prepare(
        "DELETE FROM attachments WHERE email_id IN (SELECT id FROM emails WHERE received_at < datetime('now', '-1 hour'))"
      ).run();
      await env.DB.prepare(
        "DELETE FROM emails WHERE received_at < datetime('now', '-1 hour')"
      ).run();
    } catch (e) {
      console.error("Cleanup error:", e);
    }

    // Housekeeping for the admin lockout table (it may not exist yet; that's fine).
    try {
      await env.DB.prepare("DELETE FROM admin_failures WHERE at < ?").bind(Date.now() - ADMIN_WINDOW_MS).run();
    } catch {
      /* table not created yet */
    }
  }

} satisfies ExportedHandler<Env>;
