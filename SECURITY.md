# Security checklist

The code-level protections live in `shared/security.ts`, `worker/src/index.ts` and `functions/api/**`.
The steps below can't be done from code: do them once in your Cloudflare account.

## 1. Admin password (required)

```bash
# Worker (API + email + admin)
cd worker && npx wrangler secret put ADMIN_PASSWORD
```

- Use a **long random password (16+ characters)**. Passwords shorter than 12 characters are rejected: the admin stays disabled.
- Repeat `wrangler secret put ADMIN_PASSWORD` for the root `wrangler.jsonc` Worker if you deploy that one too.
- Never put the password in `wrangler.toml`, `wrangler.jsonc`, `.env*` or the repo.
- 8 wrong attempts from one IP locks that IP out for 15 minutes.

## 2. Put the admin behind Cloudflare Access (strongly recommended)

Zero Trust -> Access -> Applications -> Add -> Self-hosted. Protect both:

- `yourdomain/admin`
- `yourdomain/api/admin/*`

Allow only your own email (one-time PIN login). This is free for up to 50 users, and means attackers never even reach the admin login.

## 3. Rate limiting (WAF)

Security -> WAF -> Rate limiting rules -> create a rule for URI path starts with `/api/` ,
e.g. 30 requests / 10 seconds per IP -> Block. This slows down inbox-address guessing and flooding.

## 4. Restrict CORS (if the frontend and API are on different origins)

Set a variable `ALLOWED_ORIGINS` (comma separated) on the Worker and on the Pages project, e.g.

```
ALLOWED_ORIGINS=https://yourdomain.com,https://your-project.pages.dev
```

If it is not set, the public API answers any origin (the old behaviour). The admin API never sends CORS headers.

## 5. Other

- Enable DMARC on every domain (see README).
- Rotate `ADMIN_PASSWORD` if you ever suspect it leaked.
- Run `npm audit` now and then and update dependencies.
- Know the design limit: **anyone who knows an address can read that inbox**. Random addresses are safe, but custom/short usernames (`john@...`) are guessable. Don't use this inbox for anything sensitive.
