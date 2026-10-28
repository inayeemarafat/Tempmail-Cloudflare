import { Sun, Moon } from "lucide-react";

interface TopBarProps {
  title: string;
  subtitle?: string;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

const TopBar = ({ subtitle, theme, onToggleTheme }: TopBarProps) => {
  return (
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-xl border-b border-border pt-safe">
      <div className="flex items-center justify-between h-14 px-4">
        {/* Left: Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center glow-primary">
            <span className="text-primary-foreground text-xs font-bold font-display">T</span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-display font-bold text-sm">
              <span className="text-gradient-primary">Temp</span>{" "}
              <span className="text-foreground">Mail</span>
            </span>
            {subtitle && (
              <span className="text-[10px] text-muted-foreground font-mono">{subtitle}</span>
            )}
          </div>
        </div>

        {/* Right: Theme toggle */}
        <button
          onClick={onToggleTheme}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all active:scale-95"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4 text-primary" />
          ) : (
            <Moon className="w-4 h-4 text-primary" />
          )}
        </button>
      </div>
    </header>
  );
};

export default TopBar;
