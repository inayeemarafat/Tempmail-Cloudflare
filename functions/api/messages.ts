import { corsHeaders as buildCors, jsonResponse, normalizeMailbox } from "../../shared/security";

interface Env {
  DB: D1Database;
  /** Optional, comma separated list of origins allowed to call this API (CORS). */
  ALLOWED_ORIGINS?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const cors = buildCors(request, env.ALLOWED_ORIGINS);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(request.url);
  const email = normalizeMailbox(url.searchParams.get("email"));
  if (!email) return jsonResponse({ error: "Invalid email" }, 400, cors);

  if (request.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT id, to_address, from_address, from_name, subject, preview, has_attachments, is_read, received_at FROM emails WHERE to_address = ? ORDER BY received_at DESC LIMIT 50"
    ).bind(email).all();
    return jsonResponse(results || [], 200, cors);
  }

  if (request.method === "DELETE") {
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM attachments WHERE email_id IN (SELECT id FROM emails WHERE to_address = ?)"
      ).bind(email),
      env.DB.prepare("DELETE FROM emails WHERE to_address = ?").bind(email),
    ]);
    return jsonResponse({ success: true }, 200, cors);
  }

  return jsonResponse({ error: "Method not allowed" }, 405, cors);
};
