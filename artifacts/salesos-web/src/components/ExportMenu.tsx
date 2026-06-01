import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getApiUrl } from "@/lib/api";

export function ExportMenu({
  resource,
  testIdPrefix = "export",
}: {
  resource: "contacts" | "leads";
  testIdPrefix?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function download(format: "csv" | "xlsx") {
    const url = getApiUrl(`/api/export/${resource}?format=${format}`);
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 bg-card border border-card-border text-foreground font-semibold text-[13px] px-3 py-2 rounded-lg hover:bg-muted transition-colors"
        data-testid={`${testIdPrefix}-button`}
      >
        <Download size={14} /> <span className="hidden sm:inline">Export</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 mt-1.5 w-48 rounded-lg bg-popover border border-border shadow-xl overflow-hidden z-30"
          >
            <button
              onClick={() => download("csv")}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] hover:bg-muted transition-colors text-left"
              data-testid={`${testIdPrefix}-csv`}
            >
              <FileText size={14} className="text-muted-foreground" />
              <div>
                <div className="font-medium">CSV</div>
                <div className="text-[11px] text-muted-foreground">Comma-separated</div>
              </div>
            </button>
            <button
              onClick={() => download("xlsx")}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] hover:bg-muted transition-colors text-left border-t border-border"
              data-testid={`${testIdPrefix}-xlsx`}
            >
              <FileSpreadsheet size={14} className="text-emerald-400" />
              <div>
                <div className="font-medium">Excel</div>
                <div className="text-[11px] text-muted-foreground">.xlsx workbook</div>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
