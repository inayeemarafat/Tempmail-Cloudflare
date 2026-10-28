import { Inbox, Clock, Paperclip, ChevronRight, MailOpen, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { EmailMessage } from "@/lib/tempmail-api";
import { timeAgo } from "@/lib/time";

interface EmailInboxProps {
  messages: EmailMessage[];
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenMessage: (id: string) => void;
  selectedMessage: EmailMessage | null;
  onBack: () => void;
}

function getInitial(name: string) {
  return (name || "?").trim().charAt(0).toUpperCase();
}

function avatarColor(seed: string): string {
  const colors = [
    "bg-blue-500/15 text-blue-500",
    "bg-violet-500/15 text-violet-500",
    "bg-rose-500/15 text-rose-500",
    "bg-amber-500/15 text-amber-500",
    "bg-emerald-500/15 text-emerald-500",
    "bg-cyan-500/15 text-cyan-500",
    "bg-pink-500/15 text-pink-500",
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

const EmailInbox = ({ messages, isRefreshing, onRefresh, onOpenMessage }: EmailInboxProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full"
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <Inbox className="w-3.5 h-3.5 text-muted-foreground" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Inbox
          </h2>
          <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full font-mono">
            {messages.length}
          </span>
        </div>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-primary transition-colors px-2.5 py-1 rounded-full hover:bg-secondary active:scale-95 disabled:opacity-60"
          aria-label="Refresh inbox"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          <span className="uppercase tracking-wider">Refresh</span>
        </button>
      </div>


      <div className="bg-card border border-border rounded-2xl overflow-hidden glow-card">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center px-6">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: "spring", bounce: 0.3 }}
              className="relative w-20 h-20 mb-5"
            >
              <div className="absolute inset-0 rounded-full bg-primary/5 animate-pulse-ring" />
              <div className="relative w-full h-full rounded-2xl bg-secondary flex items-center justify-center">
                <MailOpen className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />
              </div>
            </motion.div>
            <p className="text-sm font-semibold text-foreground mb-1">Inbox is empty</p>
            <p className="text-xs text-muted-foreground max-w-[240px] leading-relaxed">
              New emails will appear here in real time
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {messages.map((msg, i) => {
              const displayName = msg.from_name || msg.from_address.split("@")[0];
              return (
                <motion.button
                  key={msg.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => onOpenMessage(msg.id)}
                  className="w-full text-left px-4 py-3.5 hover:bg-secondary/40 active:bg-secondary/60 transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-semibold text-sm ${avatarColor(
                        msg.from_address
                      )}`}
                    >
                      {getInitial(displayName)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span
                          className={`text-sm truncate ${
                            msg.is_read ? "font-medium text-foreground/80" : "font-semibold text-foreground"
                          }`}
                        >
                          {displayName}
                        </span>
                        <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                          {!msg.is_read && (
                            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          )}
                          <Clock className="w-3 h-3" />
                          <span className="text-[10px] font-mono">
                            {timeAgo(msg.received_at)}
                          </span>
                        </div>
                      </div>
                      <p
                        className={`text-sm truncate mb-0.5 ${
                          msg.is_read ? "text-foreground/70" : "text-foreground font-medium"
                        }`}
                      >
                        {msg.subject || "(No subject)"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate leading-relaxed">
                        {msg.preview}
                      </p>
                      {!!msg.has_attachments && (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <Paperclip className="w-3 h-3 text-primary/60" />
                          <span className="text-[10px] text-primary/70 font-medium">
                            Attachment
                          </span>
                        </div>
                      )}
                    </div>

                    <ChevronRight className="w-4 h-4 text-muted-foreground/20 mt-3 shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default EmailInbox;
