import { ArrowLeft, Clock, User, Paperclip, Download, FileText, Image as ImageIcon, File } from "lucide-react";
import { motion } from "framer-motion";
import { EmailMessage, EmailAttachment, getAttachmentUrl } from "@/lib/tempmail-api";
import { formatEmailDate } from "@/lib/time";

interface EmailViewerProps {
  message: EmailMessage;
  onBack: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(contentType: string) {
  if (contentType.startsWith("image/")) return <ImageIcon className="w-4 h-4 text-primary" />;
  if (contentType.includes("pdf")) return <FileText className="w-4 h-4 text-destructive" />;
  return <File className="w-4 h-4 text-muted-foreground" />;
}

function extractBodyFromRaw(content: string): string {
  const lines = content.split("\n");
  let inHeader = true;
  const bodyLines: string[] = [];
  for (const line of lines) {
    if (inHeader) {
      if (line.trim() === "") inHeader = false;
      continue;
    }
    if (line.startsWith("--")) continue;
    if (/^(Received|ARC-|DKIM-|X-|MIME-|From:|Date:|Message-ID:|Subject:|To:|Content-Type:|Content-Transfer-Encoding:)/i.test(line.trim())) {
      inHeader = true;
      continue;
    }
    if (/^\s/.test(line) && inHeader) continue;
    inHeader = false;
    bodyLines.push(line);
  }
  return bodyLines.join("\n").trim();
}

function getInitial(name: string) {
  return (name || "?").trim().charAt(0).toUpperCase();
}

const AttachmentItem = ({ attachment, emailId, mailbox }: { attachment: EmailAttachment; emailId: string; mailbox: string }) => {
  const downloadUrl = getAttachmentUrl(emailId, attachment.id, mailbox);
  return (
    <a
      href={downloadUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-3 py-2.5 bg-secondary/60 rounded-xl border border-border/50 hover:bg-secondary hover:border-border transition-all active:scale-[0.98] group"
    >
      <div className="w-9 h-9 rounded-lg bg-background flex items-center justify-center border border-border/50 shrink-0">
        {getFileIcon(attachment.content_type)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{attachment.filename}</p>
        <p className="text-[10px] text-muted-foreground font-mono">{formatFileSize(attachment.size)}</p>
      </div>
      <Download className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
    </a>
  );
};

const EmailViewer = ({ message, onBack }: EmailViewerProps) => {
  const renderHtml = (html: string) => {
    // Second layer on top of the iframe sandbox: the email can't run scripts, load frames/objects,
    // open connections or submit forms, even if the sandbox attribute were ever loosened.
    const csp = "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:; form-action 'none'";
    const injected = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><meta charset="utf-8"><style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;word-wrap:break-word}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`;
    const blob = new Blob([injected], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    return (
      <iframe
        src={url}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        className="w-full min-h-[300px] border-0 bg-background rounded-lg"
        onLoad={(e) => {
          const iframe = e.currentTarget;
          try {
            const doc = iframe.contentDocument;
            const body = doc?.body;
            if (body) iframe.style.height = body.scrollHeight + "px";
            doc?.querySelectorAll("a").forEach((a) => {
              a.setAttribute("target", "_blank");
              a.setAttribute("rel", "noopener noreferrer");
            });
          } catch {}
          URL.revokeObjectURL(url);
        }}
      />
    );
  };

  const hasAttachments = message.attachments && message.attachments.length > 0;
  let displayHtml = message.html_content;
  let displayText = message.text_content;
  if (displayText && displayText.startsWith("Received:")) {
    displayText = extractBodyFromRaw(displayText);
  }
  if (!displayHtml && !displayText && message.preview) {
    displayText = message.preview;
  }

  const displayName = message.from_name || message.from_address.split("@")[0];

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.25 }}
      className="w-full"
    >
      {/* Sticky sub-header */}
      <div className="sticky top-14 z-20 bg-background/85 backdrop-blur-xl border-b border-border px-4 py-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>

      <div className="px-4 py-4 space-y-3">
        {/* Header */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden glow-card">
          <div className="p-4">
            <h2 className="text-lg font-bold font-display leading-tight mb-4">
              {message.subject || "(No subject)"}
            </h2>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-base shrink-0">
                {getInitial(displayName)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate font-mono">
                  {message.from_address}
                </p>
                <div className="flex items-center gap-1.5 text-muted-foreground mt-1">
                  <Clock className="w-3 h-3 shrink-0" />
                  <span className="text-[10px] font-mono">
                    {formatEmailDate(message.received_at)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Attachments */}
          {hasAttachments && (
            <div className="px-4 py-3 border-t border-border bg-secondary/30">
              <div className="flex items-center gap-2 mb-2">
                <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                  {message.attachments!.length} attachment{message.attachments!.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="grid gap-2">
                {message.attachments!.map((att) => (
                  <AttachmentItem key={att.id} attachment={att} emailId={message.id} mailbox={message.to_address} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="bg-card border border-border rounded-2xl p-4 glow-card">
          {displayHtml ? (
            renderHtml(displayHtml)
          ) : (
            <pre className="text-sm text-foreground/85 whitespace-pre-wrap font-sans leading-relaxed">
              {displayText || "No content"}
            </pre>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default EmailViewer;
