import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Lock, LogOut, Paperclip, RefreshCw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TOKEN_KEY = "tm_admin_token";
const PAGE_SIZE = 50;

interface AdminItem {
  id: string;
  to_address: string;
  from_address: string;
  from_name: string;
  subject: string;
  preview: string;
  has_attachments: number;
  received_at: string;
}

interface AdminDetail extends AdminItem {
  text_content: string;
  html_content: string;
  attachments: { id: string; filename: string; content_type: string; size: number }[];
}

function readToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

// Stored times are UTC "YYYY-MM-DD HH:MM:SS"
function formatTime(value: string): string {
  const d = new Date(value.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

const Admin = () => {
  const [token, setToken] = useState<string>(readToken());
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [items, setItems] = useState<AdminItem[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [detail, setDetail] = useState<AdminDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showHtml, setShowHtml] = useState(true);

  const tokenRef = useRef(token);
  tokenRef.current = token;

  // Keep admin page out of search engines
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Admin";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      document.title = prevTitle;
      document.head.removeChild(meta);
    };
  }, []);

  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    setToken("");
    setItems([]);
    setTotal(0);
    setDetail(null);
  }, []);

  const api = useCallback(
    async (path: string, init?: RequestInit, authToken?: string) => {
      const res = await fetch(path, {
        ...init,
        headers: { ...(init?.headers || {}), Authorization: `Bearer ${authToken ?? tokenRef.current}` },
      });
      return res;
    },
    [],
  );

  const load = useCallback(
    async (offset: number, append: boolean) => {
      if (!tokenRef.current) return;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
        if (debouncedQuery) params.set("q", debouncedQuery);
        const res = await api(`/api/admin/emails?${params.toString()}`);
        if (res.status === 401) {
          logout();
          return;
        }
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = (await res.json()) as { total: number; items: AdminItem[] };
        setTotal(data.total);
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    },
    [api, debouncedQuery, logout],
  );

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  // Initial load, reload on search change, auto refresh every 15s
  useEffect(() => {
    if (!token) return;
    load(0, false);
    const id = setInterval(() => load(0, false), 15000);
    return () => clearInterval(id);
  }, [token, load]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput) return;
    setLoggingIn(true);
    setLoginError("");
    try {
      const res = await api("/api/admin/emails?limit=1", undefined, passwordInput);
      if (res.status === 401) {
        setLoginError("Wrong password");
        return;
      }
      if (!res.ok) {
        setLoginError(`Server error (${res.status})`);
        return;
      }
      try {
        sessionStorage.setItem(TOKEN_KEY, passwordInput);
      } catch {
        /* ignore */
      }
      setToken(passwordInput);
      setPasswordInput("");
    } catch {
      setLoginError("Network error");
    } finally {
      setLoggingIn(false);
    }
  };

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await api(`/api/admin/emails/${id}`);
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as AdminDetail;
      setDetail(data);
      setShowHtml(!!data.html_content);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open email");
    } finally {
      setDetailLoading(false);
    }
  };

  const deleteEmail = async (id: string) => {
    if (!window.confirm("Delete this email permanently?")) return;
    const res = await api(`/api/admin/emails/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((prev) => prev.filter((m) => m.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      setDetail(null);
    } else {
      setError(`Delete failed (${res.status})`);
    }
  };

  // ---------- Login screen ----------
  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4 bg-card border border-border rounded-3xl p-6">
          <div className="flex items-center gap-2 text-foreground">
            <Lock className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold">Admin</h1>
          </div>
          <Input
            type="password"
            autoFocus
            autoComplete="current-password"
            placeholder="Password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
          />
          {loginError && <p className="text-sm text-destructive">{loginError}</p>}
          <Button type="submit" className="w-full" disabled={loggingIn || !passwordInput}>
            {loggingIn ? "Checking..." : "Sign in"}
          </Button>
        </form>
      </div>
    );
  }

  // ---------- Email detail ----------
  if (detail || detailLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto p-4 space-y-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            {detail && (
              <Button variant="destructive" size="sm" onClick={() => deleteEmail(detail.id)}>
                <Trash2 className="w-4 h-4 mr-1" /> Delete
              </Button>
            )}
          </div>

          {detailLoading && !detail && <p className="text-sm text-muted-foreground">Loading...</p>}

          {detail && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <h2 className="text-lg font-semibold text-foreground break-words">{detail.subject || "(No subject)"}</h2>
              <div className="text-xs text-muted-foreground space-y-1 font-mono break-all">
                <p>
                  <span className="text-foreground/70">From:</span> {detail.from_name ? `${detail.from_name} ` : ""}
                  &lt;{detail.from_address}&gt;
                </p>
                <p>
                  <span className="text-foreground/70">To:</span> {detail.to_address}
                </p>
                <p>
                  <span className="text-foreground/70">Received:</span> {formatTime(detail.received_at)}
                </p>
              </div>

              {detail.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {detail.attachments.map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1 text-xs bg-secondary rounded-full px-2.5 py-1 text-foreground/80"
                    >
                      <Paperclip className="w-3 h-3" /> {a.filename}
                    </span>
                  ))}
                </div>
              )}

              {detail.html_content && detail.text_content && (
                <div className="flex gap-2">
                  <Button size="sm" variant={showHtml ? "default" : "secondary"} onClick={() => setShowHtml(true)}>
                    HTML
                  </Button>
                  <Button size="sm" variant={!showHtml ? "default" : "secondary"} onClick={() => setShowHtml(false)}>
                    Text
                  </Button>
                </div>
              )}

              {showHtml && detail.html_content ? (
                <iframe
                  title="Email content"
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                  srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; form-action 'none'">${detail.html_content}`}
                  className="w-full h-[28rem] rounded-xl border border-border bg-white"
                />
              ) : (
                <pre className="whitespace-pre-wrap break-words text-sm text-foreground bg-secondary/50 rounded-xl p-3">
                  {detail.text_content || detail.preview || "(empty)"}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- List ----------
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Admin</h1>
            <p className="text-xs text-muted-foreground font-mono">{total} emails</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => load(0, false)} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="secondary" size="sm" onClick={logout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search address, sender, subject..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="space-y-2">
          {items.map((m) => (
            <div key={m.id} className="bg-card border border-border rounded-2xl p-3 flex items-start gap-2">
              <button onClick={() => openDetail(m.id)} className="flex-1 min-w-0 text-left">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {m.from_name || m.from_address}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                    {formatTime(m.received_at)}
                  </span>
                </div>
                <p className="text-xs font-mono text-primary truncate">to: {m.to_address}</p>
                <p className="text-sm text-foreground truncate">{m.subject || "(No subject)"}</p>
                <p className="text-xs text-muted-foreground truncate">{m.preview}</p>
                {!!m.has_attachments && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-primary/70 mt-1">
                    <Paperclip className="w-3 h-3" /> Attachment
                  </span>
                )}
              </button>
              <button
                onClick={() => deleteEmail(m.id)}
                aria-label="Delete email"
                className="p-2 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {!loading && items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">No emails found.</p>
          )}
        </div>

        {items.length < total && (
          <Button variant="secondary" className="w-full" disabled={loading} onClick={() => load(items.length, true)}>
            {loading ? "Loading..." : `Load more (${total - items.length} left)`}
          </Button>
        )}
      </div>
    </div>
  );
};

export default Admin;
