import { useState } from "react";
import { useAuth } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Trash2,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { getApiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AdminGuard } from "./AdminLayout";

interface ErrorRow {
  id: string;
  message: string;
  stack: string | null;
  pageUrl: string;
  userAgent: string | null;
  status: string;
  createdAt: string;
  userEmail: string | null;
  orgName: string | null;
}

interface ErrorsResponse {
  rows: ErrorRow[];
  total: number;
  page: number;
  limit: number;
}

const STATUS_COLORS: Record<string, string> = {
  new: "bg-red-500/15 text-red-400",
  investigated: "bg-yellow-500/15 text-yellow-400",
  fixed: "bg-emerald-500/15 text-emerald-400",
  ignored: "bg-muted text-muted-foreground",
};

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusLabel(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function AdminErrors() {
  return (
    <AdminGuard>
      <ErrorsTable />
    </AdminGuard>
  );
}

function ErrorsTable() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [pageUrlFilter, setPageUrlFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const queryKey = ["admin-errors", page, statusFilter, pageUrlFilter, dateFrom, dateTo];

  const { data, isLoading } = useQuery<ErrorsResponse>({
    queryKey,
    queryFn: async () => {
      const token = await getToken();
      const p = new URLSearchParams({ page: String(page) });
      if (statusFilter) p.set("status", statusFilter);
      if (pageUrlFilter) p.set("pageUrl", pageUrlFilter);
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo) p.set("dateTo", dateTo);
      const res = await fetch(getApiUrl(`/api/admin/errors?${p}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const patchStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const token = await getToken();
      const res = await fetch(getApiUrl(`/api/admin/errors/${id}`), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-errors"] }),
  });

  const deleteError = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      const res = await fetch(getApiUrl(`/api/admin/errors/${id}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-errors"] }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div>
      <PageHeader
        title="Errors"
        subtitle={data ? `${data.total} errors across all orgs` : "Loading…"}
      />

      <div className="px-4 md:px-8 mb-4 flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-8 rounded-lg border border-border bg-muted px-2.5 text-[12px] font-medium text-foreground focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="new">New</option>
          <option value="investigated">Investigated</option>
          <option value="fixed">Fixed</option>
          <option value="ignored">Ignored</option>
        </select>

        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Filter by page URL…"
            value={pageUrlFilter}
            onChange={(e) => { setPageUrlFilter(e.target.value); setPage(1); }}
            className="h-8 rounded-lg border border-border bg-muted pl-7 pr-2.5 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none w-48"
          />
        </div>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="h-8 rounded-lg border border-border bg-muted px-2.5 text-[12px] text-foreground focus:outline-none"
        />
        <span className="self-center text-muted-foreground text-[12px]">→</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="h-8 rounded-lg border border-border bg-muted px-2.5 text-[12px] text-foreground focus:outline-none"
        />

        {(statusFilter || pageUrlFilter || dateFrom || dateTo) && (
          <button
            onClick={() => { setStatusFilter(""); setPageUrlFilter(""); setDateFrom(""); setDateTo(""); setPage(1); }}
            className="h-8 px-2.5 rounded-lg text-[12px] text-muted-foreground hover:text-foreground border border-border bg-muted flex items-center gap-1"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      <div className="px-4 md:px-8">
        <div className="rounded-xl border border-card-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-card-border bg-muted/30">
                  {["Time", "User / Org", "Page", "Error message", "Stack", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Loading…</td>
                  </tr>
                )}
                {!isLoading && data?.rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No errors found</td>
                  </tr>
                )}
                <AnimatePresence initial={false}>
                  {data?.rows.map((row) => (
                    <>
                      <tr
                        key={row.id}
                        className="border-b border-card-border/50 hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{relTime(row.createdAt)}</td>
                        <td className="px-3 py-2.5 min-w-[130px]">
                          {row.userEmail ? (
                            <>
                              <div className="font-medium truncate max-w-[130px]">{row.userEmail}</div>
                              <div className="text-muted-foreground truncate max-w-[130px]">{row.orgName ?? "—"}</div>
                            </>
                          ) : (
                            <span className="text-muted-foreground/50">Anonymous</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 max-w-[140px]">
                          <span className="truncate block max-w-[140px] text-muted-foreground font-mono text-[11px]" title={row.pageUrl}>
                            {row.pageUrl.replace(/^https?:\/\/[^/]+/, "") || "/"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 max-w-[240px]">
                          <span className="block truncate max-w-[240px] text-rose-400" title={row.message}>
                            {row.message}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {row.stack ? (
                            <button
                              onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors font-medium"
                            >
                              {expandedId === row.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              {expandedId === row.id ? "Hide" : "Show"}
                            </button>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={cn("px-2 py-0.5 rounded-full font-medium capitalize", STATUS_COLORS[row.status] ?? "bg-muted text-muted-foreground")}>
                            {statusLabel(row.status)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {row.status === "new" && (
                              <button
                                onClick={() => patchStatus.mutate({ id: row.id, status: "investigated" })}
                                title="Mark Investigated"
                                className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors"
                              >
                                Investigate
                              </button>
                            )}
                            {row.status !== "fixed" && row.status !== "ignored" && (
                              <button
                                onClick={() => patchStatus.mutate({ id: row.id, status: "fixed" })}
                                title="Mark Fixed"
                                className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                              >
                                Fixed
                              </button>
                            )}
                            {row.status !== "ignored" && row.status !== "fixed" && (
                              <button
                                onClick={() => patchStatus.mutate({ id: row.id, status: "ignored" })}
                                title="Mark Ignored"
                                className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                              >
                                Ignore
                              </button>
                            )}
                            <button
                              onClick={() => {
                                if (confirm("Delete this error entry?")) deleteError.mutate(row.id);
                              }}
                              title="Delete"
                              className="p-1.5 rounded-lg hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === row.id && row.stack && (
                        <motion.tr
                          key={`${row.id}-stack`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          <td colSpan={7} className="px-3 pb-3 border-b border-card-border/50 bg-muted/20">
                            <pre className="text-[10px] leading-relaxed font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto p-3 rounded-lg bg-background/50 border border-card-border/50">
                              {row.stack}
                            </pre>
                          </td>
                        </motion.tr>
                      )}
                    </>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between text-[12px] text-muted-foreground">
            <span>Page {page} of {totalPages} · {data?.total} total</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
