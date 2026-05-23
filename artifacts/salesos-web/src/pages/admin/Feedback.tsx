import { useState } from "react";
import { useAuth } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Trash2,
  CheckCheck,
  Eye,
  Image as ImageIcon,
} from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { getApiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AdminGuard } from "./AdminLayout";

interface FeedbackRow {
  id: string;
  type: string;
  criticality: number;
  description: string;
  screenshotUrl: string | null;
  pageUrl: string;
  status: string;
  createdAt: string;
  userEmail: string;
  userName: string;
  orgName: string;
}

interface FeedbackResponse {
  rows: FeedbackRow[];
  total: number;
  page: number;
  limit: number;
}

const CRITICALITY_COLORS: Record<number, string> = {
  1: "bg-emerald-500/15 text-emerald-400",
  2: "bg-yellow-500/15 text-yellow-400",
  3: "bg-orange-500/15 text-orange-400",
  4: "bg-red-500/15 text-red-400",
  5: "bg-rose-600/20 text-rose-400",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/15 text-blue-400",
  reviewed: "bg-yellow-500/15 text-yellow-400",
  resolved: "bg-emerald-500/15 text-emerald-400",
};

function statusLabel(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AdminFeedback() {
  return (
    <AdminGuard>
      <FeedbackTable />
    </AdminGuard>
  );
}

function FeedbackTable() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [critFilter, setCritFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [descModal, setDescModal] = useState<FeedbackRow | null>(null);
  const [imgModal, setImgModal] = useState<string | null>(null);

  const queryKey = ["admin-feedback", page, statusFilter, typeFilter, critFilter, dateFrom, dateTo];

  const { data, isLoading } = useQuery<FeedbackResponse>({
    queryKey,
    queryFn: async () => {
      const token = await getToken();
      const p = new URLSearchParams({ page: String(page) });
      if (statusFilter) p.set("status", statusFilter);
      if (typeFilter) p.set("type", typeFilter);
      if (critFilter) p.set("criticality", critFilter);
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo) p.set("dateTo", dateTo);
      const res = await fetch(getApiUrl(`/api/admin/feedback?${p}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const patchStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const token = await getToken();
      const res = await fetch(getApiUrl(`/api/admin/feedback/${id}`), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-feedback"] }),
  });

  const deleteFeedback = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      const res = await fetch(getApiUrl(`/api/admin/feedback/${id}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-feedback"] }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div>
      <PageHeader
        title="Feedback"
        subtitle={data ? `${data.total} reports across all orgs` : "Loading…"}
      />

      <div className="px-4 md:px-8 mb-4 flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-8 rounded-lg border border-border bg-muted px-2.5 text-[12px] font-medium text-foreground focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="reviewed">Reviewed</option>
          <option value="resolved">Resolved</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="h-8 rounded-lg border border-border bg-muted px-2.5 text-[12px] font-medium text-foreground focus:outline-none"
        >
          <option value="">All types</option>
          <option value="bug">Bug</option>
          <option value="feature">Feature</option>
          <option value="feedback">Feedback</option>
        </select>
        <select
          value={critFilter}
          onChange={(e) => { setCritFilter(e.target.value); setPage(1); }}
          className="h-8 rounded-lg border border-border bg-muted px-2.5 text-[12px] font-medium text-foreground focus:outline-none"
        >
          <option value="">All severity</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>{n} — {["Trivial","Low","Medium","High","Critical"][n - 1]}</option>
          ))}
        </select>
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
        {(statusFilter || typeFilter || critFilter || dateFrom || dateTo) && (
          <button
            onClick={() => { setStatusFilter(""); setTypeFilter(""); setCritFilter(""); setDateFrom(""); setDateTo(""); setPage(1); }}
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
                  {["Time", "User / Org", "Type", "Sev", "Description", "Screenshot", "Page", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Loading…</td>
                  </tr>
                )}
                {!isLoading && data?.rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No feedback found</td>
                  </tr>
                )}
                {data?.rows.map((row) => (
                  <tr key={row.id} className="border-b border-card-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{relTime(row.createdAt)}</td>
                    <td className="px-3 py-2.5 min-w-[140px]">
                      <div className="font-medium truncate max-w-[140px]">{row.userEmail}</div>
                      <div className="text-muted-foreground truncate max-w-[140px]">{row.orgName}</div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium capitalize">{row.type}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("px-2 py-0.5 rounded-full font-bold", CRITICALITY_COLORS[row.criticality] ?? "bg-muted text-muted-foreground")}>
                        {row.criticality}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 max-w-[220px]">
                      <button
                        onClick={() => setDescModal(row)}
                        className="text-left truncate block max-w-[220px] hover:text-primary transition-colors"
                        title={row.description}
                      >
                        {row.description.slice(0, 80)}{row.description.length > 80 ? "…" : ""}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      {row.screenshotUrl ? (
                        <button
                          onClick={() => setImgModal(row.screenshotUrl!)}
                          className="w-10 h-7 rounded overflow-hidden border border-card-border hover:border-primary transition-colors flex items-center justify-center bg-muted"
                        >
                          <img
                            src={row.screenshotUrl}
                            alt="screenshot"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                              (e.target as HTMLImageElement).parentElement!.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                            }}
                          />
                        </button>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 max-w-[140px]">
                      <span className="truncate block max-w-[140px] text-muted-foreground" title={row.pageUrl}>
                        {row.pageUrl.replace(/^https?:\/\/[^/]+/, "")}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={cn("px-2 py-0.5 rounded-full font-medium capitalize", STATUS_COLORS[row.status] ?? "bg-muted text-muted-foreground")}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {row.status !== "reviewed" && (
                          <button
                            onClick={() => patchStatus.mutate({ id: row.id, status: "reviewed" })}
                            title="Mark Reviewed"
                            className="p-1.5 rounded-lg hover:bg-yellow-500/15 text-muted-foreground hover:text-yellow-400 transition-colors"
                          >
                            <Eye size={13} />
                          </button>
                        )}
                        {row.status !== "resolved" && (
                          <button
                            onClick={() => patchStatus.mutate({ id: row.id, status: "resolved" })}
                            title="Mark Resolved"
                            className="p-1.5 rounded-lg hover:bg-emerald-500/15 text-muted-foreground hover:text-emerald-400 transition-colors"
                          >
                            <CheckCheck size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm("Delete this feedback entry?")) deleteFeedback.mutate(row.id);
                          }}
                          title="Delete"
                          className="p-1.5 rounded-lg hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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

      <AnimatePresence>
        {descModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setDescModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-card-border rounded-2xl p-6 max-w-lg w-full shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="font-bold text-[15px]">Feedback description</div>
                  <div className="text-[12px] text-muted-foreground mt-0.5">
                    {descModal.userEmail} · {descModal.orgName}
                  </div>
                </div>
                <button onClick={() => setDescModal(null)} className="p-1.5 rounded-lg hover:bg-muted">
                  <X size={16} />
                </button>
              </div>
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/90">
                {descModal.description}
              </p>
              <div className="mt-4 text-[11px] text-muted-foreground">
                Page: <span className="font-mono">{descModal.pageUrl}</span>
              </div>
            </motion.div>
          </motion.div>
        )}

        {imgModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setImgModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-3xl w-full"
            >
              <button
                onClick={() => setImgModal(null)}
                className="absolute -top-10 right-0 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
              >
                <X size={16} />
              </button>
              <img
                src={imgModal}
                alt="Screenshot"
                className="w-full rounded-xl border border-card-border shadow-2xl"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
