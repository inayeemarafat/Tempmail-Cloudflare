import { motion } from "framer-motion";
import { Sun, Moon, Trash2, Info, Shield, Clock, Github, ExternalLink } from "lucide-react";
import { DOMAINS } from "@/lib/tempmail-api";

interface SettingsViewProps {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onDelete: () => void;
}

const SettingsView = ({ theme, onToggleTheme, onDelete }: SettingsViewProps) => {
  return (
    <div className="px-4 py-4 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="pt-2 pb-1"
      >
        <h2 className="text-2xl font-bold font-display tracking-tight mb-1">
          Settings
        </h2>
        <p className="text-sm text-muted-foreground">
          Manage preferences & inbox
        </p>
      </motion.div>

      {/* Appearance */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">
          Appearance
        </h3>
        <button
          onClick={onToggleTheme}
          className="w-full flex items-center gap-3 p-4 rounded-2xl bg-card border border-border hover:border-border/80 transition-all active:scale-[0.99]"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            {theme === "dark" ? (
              <Sun className="w-4 h-4 text-primary" />
            ) : (
              <Moon className="w-4 h-4 text-primary" />
            )}
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold">Theme</p>
            <p className="text-xs text-muted-foreground">
              Currently: {theme === "dark" ? "Dark" : "Light"}
            </p>
          </div>
          <div className="relative w-11 h-6 rounded-full bg-secondary border border-border">
            <motion.div
              animate={{ x: theme === "dark" ? 20 : 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-primary shadow-sm"
            />
          </div>
        </button>
      </motion.section>

      {/* Inbox */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">
          Inbox
        </h3>
        <button
          onClick={onDelete}
          className="w-full flex items-center gap-3 p-4 rounded-2xl bg-card border border-border hover:border-destructive/40 hover:bg-destructive/5 transition-all active:scale-[0.99]"
        >
          <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
            <Trash2 className="w-4 h-4 text-destructive" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-destructive">Reset Inbox</p>
            <p className="text-xs text-muted-foreground">
              Delete current email & generate new
            </p>
          </div>
        </button>
      </motion.section>

      {/* Info */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">
          About
        </h3>
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-border">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">100% Anonymous</p>
              <p className="text-xs text-muted-foreground">No tracking, no data collection</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 border-b border-border">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Auto-Deleted</p>
              <p className="text-xs text-muted-foreground">
                Emails wiped after 1 hour
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Info className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">{DOMAINS.length} Domains</p>
              <p className="text-xs text-muted-foreground">
                Available for random selection
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Domains list */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">
          Available Domains
        </h3>
        <div className="rounded-2xl bg-card border border-border p-3 flex flex-wrap gap-1.5">
          {DOMAINS.map((d) => (
            <span
              key={d}
              className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-secondary text-muted-foreground border border-border/50"
            >
              @{d}
            </span>
          ))}
        </div>
      </motion.section>

      {/* Footer */}
      <motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ delay: 0.25 }}
  className="pt-4 pb-2 text-center"
>
  <p className="text-[11px] text-muted-foreground/60 font-mono">
    <a href="/" className="hover:underline">
      TEMP MAIL
    </a>{" "}
    |{" "}
    <a
      href="https://github.com/botolmehedi/tempmail-cloudflare"
      target="_blank"
      rel="noopener noreferrer"
      className="hover:underline"
    >
      GITHUB
    </a>
  </p>
</motion.div>
    </div>
  );
};

export default SettingsView;
