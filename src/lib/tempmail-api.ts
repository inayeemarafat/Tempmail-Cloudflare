export const DOMAINS = [
  "aflii.club", "daboss.website", "gabrielgil.online", "rehbir.online", "solomusic.net", "technostarworld.com", "waverecords.xyz"
];

   const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

export interface TempEmail {
  address: string;
  domain: string;
}

export interface EmailAttachment {
  id: string;
  filename: string;
  content_type: string;
  size: number;
}

export interface EmailMessage {
  id: string;
  from_address: string;
  from_name: string;
  to_address: string;
  subject: string;
  preview: string;
  text_content?: string;
  html_content?: string;
  received_at: string;
  is_read: boolean;
  has_attachments: boolean;
  attachments?: EmailAttachment[];
}

// Cryptographically secure random integer in [0, max). The mailbox address is the only
// "secret" protecting an inbox, so it must not come from Math.random().
function secureRandomInt(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max; // rejection sampling, no modulo bias
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % max;
}

function generateRandomString(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(secureRandomInt(chars.length));
  }
  return result;
}

export function generateTempEmail(): TempEmail {
  const username = generateRandomString(10);
  const domain = DOMAINS[secureRandomInt(DOMAINS.length)];
  return { address: `${username}@${domain}`, domain };
}

let namesCache: string[] | null = null;

async function loadNames(): Promise<string[]> {
  if (namesCache) return namesCache;
  try {
    const res = await fetch("/names.json");
    namesCache = await res.json();
    return namesCache!;
  } catch {
    return ["user", "mail", "temp", "inbox"];
  }
}

export async function generateNaturalEmail(): Promise<TempEmail> {
  const names = await loadNames();
  const name = names[secureRandomInt(names.length)].toLowerCase().replace(/[^a-z0-9]/g, "");
  const digits = secureRandomInt(900) + 100;
  // "name + 3 digits" alone is easy to enumerate, so add a random suffix.
  const username = `${name}${digits}${generateRandomString(5)}`;
  const domain = DOMAINS[secureRandomInt(DOMAINS.length)];
  return { address: `${username}@${domain}`, domain };
}

export function generateCustomEmail(username: string, domain: string): TempEmail {
  const safeDomain = DOMAINS.includes(domain) ? domain : DOMAINS[0];
  const safeUser = username.trim().toLowerCase().replace(/[^a-z0-9._+-]/g, "").slice(0, 64);
  return { address: `${safeUser}@${safeDomain}`, domain: safeDomain };
}

const STORAGE_KEY = "ahcmail_current_email";
const STORAGE_MODE_KEY = "ahcmail_email_mode";

export function saveEmailToStorage(email: TempEmail, mode: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(email));
  localStorage.setItem(STORAGE_MODE_KEY, mode);
}

export function loadEmailFromStorage(): { email: TempEmail; mode: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const mode = localStorage.getItem(STORAGE_MODE_KEY) || "random";
    if (raw) {
      const parsed = JSON.parse(raw);
      // localStorage is user-editable: only accept a well-formed address on one of our domains.
      if (
        parsed &&
        typeof parsed.address === "string" &&
        typeof parsed.domain === "string" &&
        DOMAINS.includes(parsed.domain) &&
        parsed.address.endsWith(`@${parsed.domain}`)
      ) {
        return { email: { address: parsed.address, domain: parsed.domain }, mode };
      }
    }
  } catch {}
  return null;
}

export function clearEmailStorage() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_MODE_KEY);
}

export async function fetchMessages(email: string): Promise<EmailMessage[]> {
  if (!API_BASE) return [];
  try {
    const res = await fetch(`${API_BASE}/api/messages?email=${encodeURIComponent(email)}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchMessage(email: string, id: string): Promise<EmailMessage | null> {
  if (!API_BASE) return null;
  try {
    const res = await fetch(`${API_BASE}/api/messages/${id}?email=${encodeURIComponent(email)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function getAttachmentUrl(emailId: string, attachmentId: string, mailbox: string): string {
  return `${API_BASE}/api/messages/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}?email=${encodeURIComponent(mailbox)}`;
}

export async function deleteEmail(email: string): Promise<void> {
  if (!API_BASE) return;
  try {
    await fetch(`${API_BASE}/api/messages?email=${encodeURIComponent(email)}`, { method: "DELETE" });
  } catch {}
}
