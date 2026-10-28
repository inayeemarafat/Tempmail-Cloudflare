// Shared security helpers used by BOTH the Worker (worker/src/index.ts)
// and the Pages Functions (functions/api/**), so the two stay consistent.

export const ALLOWED_DOMAINS = [
  "aflii.club",
  "daboss.website",
  "gabrielgil.online",
  "rehbir.online",
  "solomusic.net",
  "technostarworld.com",
  "waverecords.xyz",
];

export const LIMITS = {
  // Cloudflare Email Routing allows up to 25 MiB; we refuse anything bigger than this
  // (it could not be stored in D1 anyway, and parsing it would burn CPU).
  MAX_RAW_EMAIL_BYTES: 5 * 1024 * 1024,
  MAX_EMAILS_PER_ADDRESS: 100,
  MAX_ATTACHMENTS: 5,
  // D1 rows are capped at ~2 MB, keep every row safely below that.
  MAX_ATTACHMENT_B64_CHARS: 1_400_000,
  MAX_HTML_CHARS: 400_000,
  MAX_TEXT_CHARS: 200_000,
  MAX_MIME_DEPTH: 5,
  MAX_MIME_PARTS: 50,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL_PART_RE = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/;

export function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

/** Returns a lower-cased, validated mailbox on one of our domains, or null. */
export function normalizeMailbox(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value.length > 254) return null;
  const at = value.lastIndexOf("@");
  if (at < 1) return null;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!ALLOWED_DOMAINS.includes(domain)) return null;
  if (!LOCAL_PART_RE.test(local)) return null;
  return value;
}

/**
 * CORS for the PUBLIC inbox API.
 * - ALLOWED_ORIGINS unset  -> "*" (legacy behaviour, so existing deployments keep working)
 * - ALLOWED_ORIGINS set    -> only those origins (comma separated) get CORS headers
 * The admin API never sends CORS headers.
 */
export function corsHeaders(request: Request, allowedOrigins?: string): Record<string, string> {
  const base = {
    "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  if (!allowedOrigins || !allowedOrigins.trim()) {
    return { ...base, "Access-Control-Allow-Origin": "*" };
  }
  const list = allowedOrigins.split(",").map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get("Origin") || "";
  if (origin && list.includes(origin)) {
    return { ...base, "Access-Control-Allow-Origin": origin, Vary: "Origin" };
  }
  return { Vary: "Origin" };
}

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      ...extraHeaders,
    },
  });
}

function safeFilename(name: string): string {
  const cleaned = (name || "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f"\\/:*?<>|]/g, "_")
    .trim()
    .slice(0, 150);
  return cleaned || "attachment";
}

/**
 * Attachments come from untrusted senders. Always serve them as a forced download
 * with a neutral content type so a hostile HTML/SVG file can never run on our origin.
 */
export function attachmentResponse(
  attachment: { filename: unknown; content_base64: unknown },
  extraHeaders: Record<string, string> = {}
): Response {
  let bytes: Uint8Array;
  try {
    const binary = atob(String(attachment.content_base64));
    bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return jsonResponse({ error: "Corrupt attachment" }, 500, extraHeaders);
  }
  const name = safeFilename(String(attachment.filename));
  const ascii = name.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      ...extraHeaders,
    },
  });
}

/** UTF-8 safe base64 (plain btoa() throws on non-Latin1 characters). */
export function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
