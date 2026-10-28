export interface Env {
  DB: D1Database;
  ADMIN_PASSWORD?: string;
}

const ALLOWED_DOMAINS = ["aflii.club", "daboss.website", "gabrielgil.online", "rehbir.online", "solomusic.net", "technostarworld.com", "waverecords.xyz"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}


function adminJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders },
  });
}

async function isAdmin(request: Request, env: Env): Promise<boolean> {
  const expected = env.ADMIN_PASSWORD;
  if (!expected) return false; // admin disabled until the secret is set
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
    return decodeURIComponent(
      binary.split("").map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
    );
  } catch {
    return atob(str.replace(/\s/g, ""));
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

function parseMimeParts(body: string, boundary: string, attachments: Attachment[], textRef: { text: string; html: string }) {
  const parts = body.split(new RegExp(`--${escapeRegex(boundary)}(?:--)?`));
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
      parseMimeParts(partBody, nestedBoundary[1], attachments, textRef);
      continue;
    }

    // Check if it's an attachment
    const filenameMatch = (disposition + " " + ct).match(/(?:file)?name="?([^";\n]+)"?/i);

const isAttachment =
  disposition.includes("attachment") ||
  disposition.includes("inline") ||
  filenameMatch !== null;
  
  
   if (isAttachment && filenameMatch) {
   
      const filename = decodeHeaderWord(filenameMatch ? filenameMatch[1].trim() : "attachment");
      let base64Data: string;
      if (encoding === "base64") {
        base64Data = partBody.replace(/\s/g, "");
      } else {
        base64Data = btoa(partBody);
      }
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }


      // ---- Admin API (requires ADMIN_PASSWORD secret) ----
      if (path.startsWith("/api/admin/")) {
        if (!(await isAdmin(request, env))) return adminJson({ error: "Unauthorized" }, 401);

        // GET /api/admin/emails?q=&limit=&offset=
        if (path === "/api/admin/emails" && request.method === "GET") {
          const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
          const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 100);
          const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);
          const like = `%${q}%`;
          const where = q ? "WHERE to_address LIKE ?1 OR from_address LIKE ?1 OR from_name LIKE ?1 OR subject LIKE ?1 OR preview LIKE ?1" : "";
          const countStmt = q
            ? env.DB.prepare(`SELECT COUNT(*) AS c FROM emails ${where}`).bind(like)
            : env.DB.prepare("SELECT COUNT(*) AS c FROM emails");
          const listSql = `SELECT id, to_address, from_address, from_name, subject, preview, has_attachments, received_at FROM emails ${where} ORDER BY received_at DESC LIMIT ${limit} OFFSET ${offset}`;
          const listStmt = q ? env.DB.prepare(listSql).bind(like) : env.DB.prepare(listSql);
          const [count, list] = await Promise.all([countStmt.first<{ c: number }>(), listStmt.all()]);
          return adminJson({ total: count?.c ?? 0, items: list.results || [] });
        }

        // GET /api/admin/emails/:id
        const m = path.match(/^\/api\/admin\/emails\/([^/]+)$/);
        if (m && request.method === "GET") {
          const email = await env.DB.prepare("SELECT * FROM emails WHERE id = ?").bind(m[1]).first();
          if (!email) return adminJson({ error: "Not found" }, 404);
          const { results: attachments } = await env.DB.prepare(
            "SELECT id, filename, content_type, size FROM attachments WHERE email_id = ?"
          ).bind(m[1]).all();
          return adminJson({ ...email, attachments: attachments || [] });
        }

        // DELETE /api/admin/emails/:id
        if (m && request.method === "DELETE") {
          await env.DB.prepare("DELETE FROM attachments WHERE email_id = ?").bind(m[1]).run();
          await env.DB.prepare("DELETE FROM emails WHERE id = ?").bind(m[1]).run();
          return adminJson({ ok: true });
        }

        return adminJson({ error: "Not found" }, 404);
      }

      // GET /api/messages?email=...
      if (path === "/api/messages" && request.method === "GET") {
        const email = url.searchParams.get("email");
        if (!email) return json({ error: "Missing email" }, 400);

        const { results } = await env.DB.prepare(
          `SELECT id, to_address, from_address, from_name, subject, preview, has_attachments, is_read, received_at
           FROM emails WHERE to_address = ?
           ORDER BY received_at DESC
           LIMIT 50`
        ).bind(email).all();

        return json(results || []);
      }

      // DELETE /api/messages?email=...
      if (path === "/api/messages" && request.method === "DELETE") {
        const email = url.searchParams.get("email");
        if (!email) return json({ error: "Missing email" }, 400);

        // Delete attachments first, then emails
        await env.DB.prepare(
          `DELETE FROM attachments WHERE email_id IN (SELECT id FROM emails WHERE to_address = ?)`
        ).bind(email).run();
        await env.DB.prepare(
          `DELETE FROM emails WHERE to_address = ?`
        ).bind(email).run();

        return json({ ok: true });
      }

      // GET /api/messages/:id
      if (path.startsWith("/api/messages/") && !path.includes("/attachments") && request.method === "GET") {
        const id = path.split("/api/messages/")[1];
        if (!id) return json({ error: "Missing id" }, 400);

        const result = await env.DB.prepare(
          `SELECT * FROM emails WHERE id = ?`
        ).bind(id).first();

        if (!result) return json({ error: "Not found" }, 404);

        // Also fetch attachments metadata (without content)
        const { results: attachments } = await env.DB.prepare(
          `SELECT id, filename, content_type, size FROM attachments WHERE email_id = ?`
        ).bind(id).all();

        return json({ ...result, attachments: attachments || [] });
      }

      // GET /api/messages/:id/attachments/:attachmentId
      if (path.match(/^\/api\/messages\/[^/]+\/attachments\/[^/]+$/) && request.method === "GET") {
        const parts = path.split("/");
        const attachmentId = parts[parts.length - 1];

        const attachment = await env.DB.prepare(
          `SELECT * FROM attachments WHERE id = ?`
        ).bind(attachmentId).first();

        if (!attachment) return json({ error: "Not found" }, 404);

        const binary = Uint8Array.from(atob(attachment.content_base64 as string), c => c.charCodeAt(0));
        return new Response(binary, {
          headers: {
            "Content-Type": attachment.content_type as string,
            "Content-Disposition": `attachment; filename="${attachment.filename}"`,
            ...corsHeaders,
          },
        });
      }

      return json({ error: "Not found" }, 404);

    } catch (err) {
      console.error("Fetch handler error:", err);
      return json({ error: "Internal error" }, 500);
    }
  },

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
    try {
      const to = message.to;
      const domain = to.split("@")[1];

      if (!ALLOWED_DOMAINS.includes(domain)) {
        message.setReject("Unknown domain");
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
        parsed.fromAddress || message.from,
        parsed.fromName,
        parsed.subject || (message.headers.get("subject") || ""),
        parsed.preview,
        parsed.textContent,
        parsed.htmlContent,
        hasAttachments
      ).run();

      // Save attachments
      for (const att of parsed.attachments) {
        const attId = crypto.randomUUID();
        await env.DB.prepare(`
          INSERT INTO attachments (id, email_id, filename, content_type, size, content_base64)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(attId, id, att.filename, att.contentType, att.size, att.contentBase64).run();
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
  }

} satisfies ExportedHandler<Env>;
