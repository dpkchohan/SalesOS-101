import { Link } from "wouter";
import {
  useGetDashboardSummary,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  TrendingUp,
  Calendar,
  ArrowUpRight,
  Activity,
} from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { formatCurrency, relativeTime, STAGE_META, STAGES } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { data, isLoading } = useGetDashboardSummary();
  const qc = useQueryClient();

  if (isLoading) return <DashboardSkeleton />;

  const pipelineMax = Math.max(1, ...(data?.pipeline.map((p) => p.count) ?? [1]));
  const totalDeals = data?.pipeline.reduce((s, p) => s + p.count, 0) ?? 0;

  return (
    <div>
      <PageHeader
        title="Today"
        subtitle={new Date().toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
      />
      <div className="px-4 md:px-8 grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 rounded-2xl bg-card border border-card-border p-5 md:p-6 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold">
                Active pipeline
              </div>
              <div className="mt-2 text-[34px] md:text-[42px] font-bold leading-none tracking-tight">
                {formatCurrency(data?.totalPipelineValue ?? 0)}
              </div>
              <div className="text-[12px] text-muted-foreground mt-1.5">
                across {totalDeals} open deals
              </div>
            </div>
            <Link to="/pipeline" className="text-[12px] font-semibold text-primary flex items-center gap-1 hover:underline" data-testid="link-pipeline">
                Open board <ArrowUpRight size={14} />
              </Link>
          </div>
          <div className="mt-6 grid grid-cols-6 gap-2 md:gap-3">
            {STAGES.map((stage, idx) => {
              const col = data?.pipeline.find((p) => p.stage === stage);
              const count = col?.count ?? 0;
              const pct = (count / pipelineMax) * 100;
              const meta = STAGE_META[stage];
              return (
                <motion.div
                  key={stage}
                  initial={{ height: 0 }}
                  animate={{ height: "auto" }}
                  transition={{ delay: idx * 0.04 }}
                  className="flex flex-col items-center gap-1.5"
                >
                  <div className="w-full h-24 md:h-28 rounded-md bg-muted/50 flex items-end overflow-hidden">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max(6, pct)}%` }}
                      transition={{ delay: 0.1 + idx * 0.05, duration: 0.5, ease: "easeOut" }}
                      className={cn("w-full rounded-t-md", meta.bar)}
                    />
                  </div>
                  <div className="text-center">
                    <div className="text-[18px] font-bold leading-none">{count}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1 truncate w-full">
                      {meta.label}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl bg-gradient-to-br from-secondary to-[hsl(244_47%_15%)] text-white p-5 md:p-6 shadow-sm relative overflow-hidden"
        >
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-primary/40 blur-3xl pointer-events-none" />
          <div className="flex items-center justify-between gap-2 relative">
            <div className="text-[12px] uppercase tracking-wider opacity-80 font-semibold flex items-center gap-1.5">
              <AlertTriangle size={13} /> Red flags
            </div>
            <div className="text-[10px] opacity-80">{data?.activeSignals.length ?? 0} active</div>
          </div>
          <div className="mt-4 space-y-2.5 max-h-[260px] overflow-y-auto relative">
            {(data?.activeSignals ?? []).length === 0 && (
              <div className="text-[13px] opacity-70 py-4 text-center">No red flags. Pipeline is healthy.</div>
            )}
            {data?.activeSignals.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.08 + i * 0.04 }}
              >
                <Link to={`/leads/${s.leadId}`}
                    className="block p-2.5 rounded-lg bg-white/8 hover:bg-white/15 transition-colors"
                    data-testid={`signal-${s.id}`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          s.severity === "high" ? "bg-rose-400" : s.severity === "medium" ? "bg-amber-400" : "bg-blue-400",
                        )}
                      />
                      <span className="text-[11px] uppercase tracking-wider opacity-80 font-semibold">
                        {s.signalType.replace(/_/g, " ")}
                      </span>
                      <span className="ml-auto text-[10px] opacity-60">{s.leadContactName}</span>
                    </div>
                    <div className="text-[12.5px] leading-snug">{s.message}</div>
                  </Link>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 rounded-2xl bg-card border border-card-border p-5 md:p-6 shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-bold tracking-tight flex items-center gap-2">
              <Calendar size={16} className="text-primary" /> Today's tasks
            </h2>
            <Link to="/tasks" className="text-[12px] font-semibold text-primary hover:underline" data-testid="link-tasks">
                See all
              </Link>
          </div>
          <div className="space-y-1.5">
            {(data?.todaysTasks ?? []).length === 0 && (
              <div className="text-[13px] text-muted-foreground py-6 text-center">
                Nothing due today. Take the win.
              </div>
            )}
            {data?.todaysTasks.slice(0, 6).map((t, i) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.04 }}
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
              >
                <span
                  className={cn(
                    "w-1 h-7 rounded-full",
                    t.priority === "high" ? "bg-rose-500" : t.priority === "medium" ? "bg-amber-500" : "bg-blue-500",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium truncate">{t.title}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {t.leadContactName ? `${t.leadContactName} · ` : ""}
                    {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "no due date"}
                  </div>
                </div>
                {t.leadId && (
                  <Link to={`/leads/${t.leadId}`} className="opacity-0 group-hover:opacity-100 text-[11px] font-semibold text-primary transition-opacity">
                      Open
                    </Link>
                )}
              </motion.div>
            ))}
          </div>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() })}
            className="mt-4 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Refresh
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl bg-card border border-card-border p-5 md:p-6 shadow-sm"
        >
          <h2 className="text-[15px] font-bold tracking-tight flex items-center gap-2 mb-4">
            <Activity size={16} className="text-primary" /> Recent activity
          </h2>
          <div className="space-y-3">
            {(data?.recentInteractions ?? []).length === 0 && (
              <div className="text-[13px] text-muted-foreground py-6 text-center">
                No interactions logged yet.
              </div>
            )}
            {data?.recentInteractions?.slice(0, 5).map((i) => (
              <Link key={i.id} to={`/leads/${i.leadId}`} className="block p-2 -mx-2 rounded-lg hover:bg-muted/50 transition-colors" data-testid={`activity-${i.id}`}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-primary">{i.type}</span>
                    <TrendingUp size={11} className="text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground ml-auto">{relativeTime(i.createdAt)}</span>
                  </div>
                  <div className="text-[12.5px] leading-snug line-clamp-2">{i.gist}</div>
                </Link>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div>
      <PageHeader title="Today" subtitle="Loading…" />
      <div className="px-4 md:px-8 grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "rounded-2xl bg-card border border-card-border h-48 animate-pulse",
              i === 1 && "lg:col-span-2",
              i === 3 && "lg:col-span-2",
            )}
          />
        ))}
      </div>
    </div>
  );
}
