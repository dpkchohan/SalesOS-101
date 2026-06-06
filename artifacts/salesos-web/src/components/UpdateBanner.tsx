import { RefreshCw } from "lucide-react";

export function UpdateBanner({ show }: { show: boolean }) {
  if (!show) return null;

  return (
    <div className="fixed bottom-20 md:bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-secondary text-secondary-foreground px-4 py-3 rounded-xl shadow-xl border border-white/10 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <span className="text-sm font-medium whitespace-nowrap">
        Update available
      </span>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 active:scale-95 transition-all"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Refresh
      </button>
    </div>
  );
}
