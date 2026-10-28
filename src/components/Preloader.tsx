import { motion } from "framer-motion";
import { Mail } from "lucide-react";

const Preloader = () => {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
    >
      {/* Background glow */}
      <div className="absolute inset-0 bg-dots opacity-40" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-primary/10 blur-[100px]" />

      <div className="relative flex flex-col items-center gap-8">
        {/* Envelope with pulsing rings */}
        <div className="relative w-24 h-24 flex items-center justify-center">
          {/* Pulse rings */}
          <div className="absolute inset-0 rounded-full border-2 border-primary/40 animate-pulse-ring" />
          <div
            className="absolute inset-0 rounded-full border-2 border-primary/40 animate-pulse-ring"
            style={{ animationDelay: "0.5s" }}
          />
          <div
            className="absolute inset-0 rounded-full border-2 border-primary/40 animate-pulse-ring"
            style={{ animationDelay: "1s" }}
          />

          {/* Orbiting dot */}
          <div className="absolute w-2.5 h-2.5 rounded-full bg-primary animate-orbit shadow-[0_0_10px_hsl(var(--primary))]" />

          {/* Center envelope */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center glow-primary"
          >
            <Mail className="w-7 h-7 text-primary-foreground" strokeWidth={2.5} />
          </motion.div>
        </div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="text-center"
        >
          <h1 className="text-2xl font-bold font-display tracking-tight">
            <span className="text-gradient-primary">Temp</span>{" "}
            <span className="text-foreground">Mail</span>
          </h1>
          <p className="text-[11px] text-muted-foreground mt-1 tracking-widest uppercase font-mono">
            Loading inbox
          </p>
        </motion.div>

        {/* Bouncing dots */}
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce-dot"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default Preloader;
