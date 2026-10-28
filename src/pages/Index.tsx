import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import {
  generateTempEmail,
  generateNaturalEmail,
  generateCustomEmail,
  fetchMessages,
  fetchMessage,
  deleteEmail,
  saveEmailToStorage,
  loadEmailFromStorage,
  clearEmailStorage,
  TempEmail,
  EmailMessage,
} from "@/lib/tempmail-api";
import { decodeEmailParam } from "@/lib/share";
import { useTheme } from "@/hooks/use-theme";

import Preloader from "@/components/Preloader";
import TopBar from "@/components/mobile/TopBar";
import BottomNav, { Tab } from "@/components/mobile/BottomNav";
import InboxView from "@/components/mobile/InboxView";
import NewView, { EmailMode } from "@/components/mobile/NewView";
import SettingsView from "@/components/mobile/SettingsView";
import PWAInstallBanner from "@/components/mobile/PWAInstallBanner";
import notifySound from "@/assets/notify.mp3.asset.json";

const Index = () => {
  const [currentEmail, setCurrentEmail] = useState<TempEmail | null>(null);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [emailMode, setEmailMode] = useState<EmailMode>("random");
  const [activeTab, setActiveTab] = useState<Tab>("inbox");
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const { theme, toggleTheme } = useTheme();

  // Preload notification sound
  
  useEffect(() => {
  const a = new Audio("/notify.mp3");
  a.preload = "auto";
  a.volume = 0.85;
  audioRef.current = a;
}, []);

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("email");
    const shared = param ? decodeEmailParam(param) : null;
    if (shared) {
      const email: TempEmail = { address: shared, domain: shared.split("@")[1] || "" };
      setCurrentEmail(email);
      setEmailMode("custom");
      saveEmailToStorage(email, "custom");
      window.history.replaceState({}, "", window.location.pathname);
    } else {
      const saved = loadEmailFromStorage();
      if (saved) {
        setCurrentEmail(saved.email);
        setEmailMode(saved.mode as EmailMode);
      } else {
        handleGenerate("random");
      }
    }
    // Preloader for 1.4s minimum for stylish feel
    const t = setTimeout(() => setIsLoading(false), 1400);
    return () => clearTimeout(t);
  }, []);


  const refreshMessages = useCallback(async () => {
    if (!currentEmail) return;
    setIsRefreshing(true);
    try {
      const msgs = await fetchMessages(currentEmail.address);
      // Detect newly-arrived messages and play a notification sound.
      const known = knownIdsRef.current;
      const incomingIds = msgs.map((m) => m.id);
      const newOnes = msgs.filter((m) => !known.has(m.id));
      if (initializedRef.current && newOnes.length > 0 && audioRef.current) {
        try {
          audioRef.current.currentTime = 0;
          void audioRef.current.play().catch(() => undefined);
        } catch {
          /* ignore */
        }
        const first = newOnes[0];
        const sender = first.from_name || first.from_address;
        toast.success(
          newOnes.length === 1
            ? `New email from ${sender}`
            : `${newOnes.length} new emails`,
        );
      }
      knownIdsRef.current = new Set(incomingIds);
      initializedRef.current = true;
      setMessages(msgs);
    } catch {
    } finally {
      setIsRefreshing(false);
    }
  }, [currentEmail]);

  useEffect(() => {
    if (!currentEmail) return;
    refreshMessages();
    intervalRef.current = setInterval(refreshMessages, 10000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [currentEmail, refreshMessages]);

  const setAndSaveEmail = (email: TempEmail, mode: EmailMode) => {
    // reset "seen" tracking so initial fetch of new inbox is silent
    knownIdsRef.current = new Set();
    initializedRef.current = false;
    setCurrentEmail(email);
    setSelectedMessage(null);
    setMessages([]);
    saveEmailToStorage(email, mode);
    toast.success("New email ready!");
  };

  const handleGenerate = async (mode?: EmailMode) => {
    const m = mode || emailMode;
    if (m === "natural") {
      const email = await generateNaturalEmail();
      setAndSaveEmail(email, m);
    } else {
      const email = generateTempEmail();
      setAndSaveEmail(email, m);
    }
    setActiveTab("inbox");
  };

  const handleCustomGenerate = (username: string, domain: string) => {
    const email = generateCustomEmail(username, domain);
    setAndSaveEmail(email, "custom");
    setActiveTab("inbox");
  };

  const handleModeChange = (mode: EmailMode) => {
    setEmailMode(mode);
  };

  const handleDelete = async () => {
    if (currentEmail) {
      await deleteEmail(currentEmail.address);
    }
    clearEmailStorage();
    setMessages([]);
    setSelectedMessage(null);
    handleGenerate();
    toast.success("Inbox reset");
  };

  const handleOpenMessage = async (id: string) => {
    if (!currentEmail) return;
    try {
      const msg = await fetchMessage(currentEmail.address, id);
      if (msg) {
        setSelectedMessage(msg);
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, is_read: true } : m))
        );
      }
    } catch {
      toast.error("Failed to load message.");
    }
  };

  const unreadCount = messages.filter((m) => !m.is_read).length;

  const getSubtitle = () => {
    if (activeTab === "inbox") return selectedMessage ? "Reading email" : `${messages.length} messages`;
    if (activeTab === "new") return "Generate address";
    return "Preferences";
  };

  return (
    <>
      <AnimatePresence>{isLoading && <Preloader />}</AnimatePresence>

      {/* App Shell */}
      <div className="min-h-screen bg-background flex justify-center">
        {/* Mobile-app container: full width on mobile, framed on desktop */}
        <div className="w-full max-w-md relative min-h-screen bg-background md:border-x md:border-border flex flex-col">
          <TopBar
            title="Temp Mail"
            subtitle={getSubtitle()}
            theme={theme}
            onToggleTheme={toggleTheme}
          />

          {/* Content area - scrollable */}
          <main className="flex-1 overflow-y-auto pb-24">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab + (selectedMessage?.id ?? "")}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === "inbox" && (
                  <InboxView
                    email={currentEmail?.address ?? null}
                    messages={messages}
                    isRefreshing={isRefreshing}
                    onRefresh={refreshMessages}
                    onOpenMessage={handleOpenMessage}
                    selectedMessage={selectedMessage}
                    onBack={() => setSelectedMessage(null)}
                    onRegenerate={() => handleGenerate()}
                  />
                )}
                {activeTab === "new" && (
                  <NewView
                    mode={emailMode}
                    onModeChange={handleModeChange}
                    onGenerate={() => handleGenerate()}
                    onCustomGenerate={handleCustomGenerate}
                  />
                )}
                {activeTab === "settings" && (
                  <SettingsView
                    theme={theme}
                    onToggleTheme={toggleTheme}
                    onDelete={handleDelete}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </main>

          <BottomNav active={activeTab} onChange={setActiveTab} unreadCount={unreadCount} />
          <PWAInstallBanner />
        </div>
      </div>
    </>
  );
};

export default Index;
