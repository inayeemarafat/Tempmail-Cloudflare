import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Download } from "lucide-react";
import { toast } from "sonner";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "ahcm.pwa.dismissed";

const PWAInstallBanner = () => {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // If already installed / running in standalone, hide.
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    if (sessionStorage.getItem(DISMISS_KEY) === "1") return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setVisible(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // Also show on iOS (no beforeinstallprompt) after a short delay so users
    // see install instructions.
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const timer = window.setTimeout(() => {
      if (isIOS && !installed) setVisible(true);
    }, 1200);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.clearTimeout(timer);
    };
  }, [installed]);

  const handleInstall = async () => {
    if (deferred) {
      try {
        await deferred.prompt();
        const { outcome } = await deferred.userChoice;
        if (outcome === "accepted") {
          setVisible(false);
        }
        setDeferred(null);
      } catch {
        toast.error("Install failed. Try again.");
      }
    } else {
      // iOS / unsupported: show helper toast
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isIOS) {
        toast("Tap the Share icon, then 'Add to Home Screen' to install.", { duration: 5000 });
      } else {
        toast("Open your browser menu and choose 'Install app' to install Temp Mail.", { duration: 5000 });
      }
    }
  };

  const handleClose = () => {
    setVisible(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <AnimatePresence>
      {visible && !installed && (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="fixed inset-x-3 bottom-20 z-50 pointer-events-none"
        >
          <div
            role="dialog"
            aria-label="Install Temp Mail"
            className="pointer-events-auto mx-auto max-w-md rounded-2xl px-3 py-3 flex items-center gap-3 shadow-2xl backdrop-blur-xl border border-white/10"
            style={{
              background:
                "linear-gradient(135deg, hsl(170 70% 18%) 0%, hsl(160 75% 22%) 55%, hsl(150 70% 28%) 100%)",
            }}
          >
            {/* Left: icon + close */}
            <div className="relative shrink-0">
              <img
                src="/favicon.png"
                alt="Temp Mail"
                className="w-12 h-12 rounded-xl object-cover bg-white/10 ring-1 ring-white/20"
              />
              <button
                onClick={handleClose}
                aria-label="Dismiss install banner"
                className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-white text-emerald-900 flex items-center justify-center shadow-md hover:scale-110 active:scale-95 transition-transform"
              >
                <X className="w-3 h-3" strokeWidth={3} />
              </button>
            </div>

            {/* Center: text */}
            <div className="flex-1 min-w-0 leading-tight">
              <p className="font-display font-bold text-white text-sm tracking-wide">
                TEMP MAIL
              </p>
              <p className="text-[11px] text-white/80">Download Now!</p>
            </div>

            {/* Right: install */}
            <button
              onClick={handleInstall}
              className="shrink-0 flex items-center gap-1.5 px-3.5 h-9 rounded-full font-semibold text-[13px] text-emerald-950 shadow-md hover:brightness-110 active:scale-95 transition-all"
              style={{
                background: "linear-gradient(135deg, #d9ff4d 0%, #a3ff3d 100%)",
              }}
            >
              <Download className="w-4 h-4" strokeWidth={2.5} />
              Download
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PWAInstallBanner;
