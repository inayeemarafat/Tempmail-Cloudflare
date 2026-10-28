// GET /api/messages/:id/attachments/:attachmentId?email=...
import {
  attachmentResponse,
  corsHeaders as buildCors,
  isUuid,
  jsonResponse,
  normalizeMailbox,
} from "../../../../../shared/security";

interface Env {
  DB: D1Database;
  /** Optional, comma separated list of origins allowed to call this API (CORS). */
  ALLOWED_ORIGINS?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const cors = buildCors(request, env.ALLOWED_ORIGINS);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, cors);
  }

  const emailId = params.id as string;
  const attachmentId = params.attachmentId as string;
  const email = normalizeMailbox(new URL(request.url).searchParams.get("email"));

  if (!isUuid(emailId) || !isUuid(attachmentId) || !email) {
    return jsonResponse({ error: "Invalid request" }, 400, cors);
  }

  // Ownership check: the attachment must belong to a message in THIS mailbox.
  const attachment = await env.DB.prepare(
    `SELECT a.filename, a.content_base64
     FROM attachments a JOIN emails e ON e.id = a.email_id
     WHERE a.id = ? AND a.email_id = ? AND e.to_address = ?`
  ).bind(attachmentId, emailId, email).first();

  if (!attachment) return jsonResponse({ error: "Not found" }, 404, cors);

  return attachmentResponse(attachment, cors);
};
