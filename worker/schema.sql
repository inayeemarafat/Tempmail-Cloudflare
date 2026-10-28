CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  to_address TEXT NOT NULL,
  from_address TEXT NOT NULL,
  from_name TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  preview TEXT DEFAULT '',
  text_content TEXT DEFAULT '',
  html_content TEXT DEFAULT '',
  has_attachments INTEGER DEFAULT 0,
  is_read INTEGER DEFAULT 0,
  received_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  email_id TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT DEFAULT 'application/octet-stream',
  size INTEGER DEFAULT 0,
  content_base64 TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_emails_to_address ON emails(to_address);
CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_attachments_email_id ON attachments(email_id);

-- Failed admin logins (used for per-IP lockout). The Worker also creates this lazily.
CREATE TABLE IF NOT EXISTS admin_failures (
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_failures_ip_at ON admin_failures(ip, at);
