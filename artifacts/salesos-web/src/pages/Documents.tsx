import { useState } from "react";
import {
  useListDocuments,
  useUpdateDocument,
  getListDocumentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { FileText, Send, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "sent", label: "Sent" },
  { key: "approved", label: "Approved" },
] as const;

export default function Documents() {
  const [filter, setFilter] = useState<"all" | "draft" | "sent" | "approved">("all");
  const { data, isLoading } = useListDocuments();
  const update = useUpdateDocument();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
  const docs = filter === "all" ? data ?? [] : (data ?? []).filter((d) => d.status === filter);

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle={isLoading ? "Loading…" : `${data?.length ?? 0} proposals & contracts`}
      />
      <div className="px-4 md:px-8 mb-3 flex gap-1.5 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1.5 rounded-full text-[12px] font-bold uppercase tracking-wider transition-colors flex-shrink-0",
              filter === f.key
                ? "bg-secondary text-secondary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="px-4 md:px-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {docs.length === 0 && !isLoading && (
          <div className="text-center py-12 text-muted-foreground col-span-full text-[13px]">
            {filter === "all" ? "No documents yet." : `No ${filter} documents.`}
          </div>
        )}
        {docs.map((d, i) => (
          <motion.div
            key={d.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="rounded-2xl bg-card border border-card-border p-4 hover:border-primary/40 transition-colors"
            data-testid={`doc-${d.id}`}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary grid place-items-center flex-shrink-0">
                <FileText size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                  {d.type.replace("_", " ")}
                </div>
                <div className="text-[14px] font-semibold truncate mt-0.5">{d.title}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {relativeTime(d.createdAt)}
                </div>
              </div>
              <span
                className={cn(
                  "text-[10px] uppercase font-bold px-2 py-0.5 rounded-full",
                  d.status === "draft"
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    : d.status === "sent"
                      ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
                      : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                )}
              >
                {d.status}
              </span>
            </div>
            {d.content && (
              <div className="mt-3 text-[12px] text-muted-foreground line-clamp-3 bg-muted/30 rounded-md p-2">
                {d.content}
              </div>
            )}
            {d.status !== "approved" && (
              <div className="flex gap-1.5 mt-3">
                {d.status === "draft" && (
                  <button
                    onClick={() => update.mutate({ id: d.id, data: { status: "sent" } }, { onSettled: refresh })}
                    className="flex-1 flex items-center justify-center gap-1 text-[11.5px] font-semibold bg-primary/10 text-primary py-1.5 rounded-md hover:bg-primary/20"
                    data-testid={`mark-sent-${d.id}`}
                  >
                    <Send size={11} /> Mark sent
                  </button>
                )}
                {d.status === "sent" && (
                  <button
                    onClick={() => update.mutate({ id: d.id, data: { status: "approved" } }, { onSettled: refresh })}
                    className="flex-1 flex items-center justify-center gap-1 text-[11.5px] font-semibold bg-emerald-500/10 text-emerald-600 py-1.5 rounded-md hover:bg-emerald-500/20"
                    data-testid={`mark-approved-${d.id}`}
                  >
                    <CheckCircle2 size={11} /> Mark approved
                  </button>
                )}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
