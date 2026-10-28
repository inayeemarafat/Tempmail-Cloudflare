import { corsHeaders as buildCors, isUuid, jsonResponse, normalizeMailbox } from "../../../shared/security";

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

  const id = params.id as string;
  const url = new URL(request.url);
  const email = normalizeMailbox(url.searchParams.get("email"));

  if (!email || !isUuid(id)) return jsonResponse({ error: "Invalid request" }, 400, cors);

  // Ownership check: only return the message if it belongs to this mailbox.
  const result = await env.DB.prepare(
    "SELECT * FROM emails WHERE id = ? AND to_address = ?"
  ).bind(id, email).first();

  if (!result) return jsonResponse({ error: "Not found" }, 404, cors);

  await env.DB.prepare(
    "UPDATE emails SET is_read = 1 WHERE id = ?"
  ).bind(id).run();

  // Fetch attachments metadata
  const { results: attachments } = await env.DB.prepare(
    "SELECT id, filename, content_type, size FROM attachments WHERE email_id = ?"
  ).bind(id).all();

  return jsonResponse({ ...result, attachments: attachments || [] }, 200, cors);
};
