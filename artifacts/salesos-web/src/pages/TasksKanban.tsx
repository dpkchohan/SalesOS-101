import { Link } from "wouter";
import {
  useListTasks,
  useUpdateTask,
  getListTasksQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { TasksTabs } from "./Tasks";
import { shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function localToday(): string {
  return localIsoDate(new Date());
}

type Task = {
  id: string;
  leadId: string | null;
  leadContactName: string | null;
  title: string;
  dueDate: Date | string | null;
  completedAt: Date | string | null;
  priority: "low" | "medium" | "high";
};

const PRIORITY_PILL: Record<Task["priority"], string> = {
  high: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
  medium: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  low: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
};

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localIsoDate(d);
}

function dueIso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") return d.slice(0, 10);
  return localIsoDate(d);
}

function bucket(tasks: Task[]) {
  const today = localToday();
  const tomorrow = tomorrowIso();
  const buckets: Record<"today" | "tomorrow" | "pending" | "finished", Task[]> = {
    today: [],
    tomorrow: [],
    pending: [],
    finished: [],
  };
  for (const t of tasks) {
    if (t.completedAt) {
      buckets.finished.push(t);
      continue;
    }
    const due = dueIso(t.dueDate);
    if (due === today) buckets.today.push(t);
    else if (due === tomorrow) buckets.tomorrow.push(t);
    else buckets.pending.push(t);
  }
  buckets.finished.sort((a, b) => {
    const at = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const bt = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return bt - at;
  });
  return buckets;
}

export default function TasksKanban() {
  const params = { includeCompleted: true };
  const { data, isLoading } = useListTasks(params, {
    query: { queryKey: getListTasksQueryKey(params) },
  });
  const qc = useQueryClient();
  const update = useUpdateTask();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListTasksQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  };

  const tasks = (data ?? []) as Task[];
  const today = localToday();
  const cols = bucket(tasks);
  const total = tasks.length;

  const columns = [
    { key: "today", label: "Today", tasks: cols.today, accent: "bg-primary" },
    { key: "tomorrow", label: "Tomorrow", tasks: cols.tomorrow, accent: "bg-blue-500" },
    { key: "pending", label: "Pending", tasks: cols.pending, accent: "bg-rose-500" },
    { key: "finished", label: "Finished", tasks: cols.finished, accent: "bg-emerald-500" },
  ] as const;

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle={isLoading ? "Loading…" : `${total} task${total === 1 ? "" : "s"}`}
      />
      <TasksTabs active="kanban" />
      <div className="px-4 md:px-8 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {columns.map((col) => (
            <div
              key={col.key}
              className="bg-card border border-card-border rounded-xl flex flex-col min-h-[180px]"
              data-testid={`kanban-col-${col.key}`}
            >
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-card-border">
                <div className="flex items-center gap-2">
                  <span className={cn("w-2 h-2 rounded-full", col.accent)} />
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    {col.label}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {col.tasks.length}
                </span>
              </div>
              <div className="p-2.5 space-y-2 flex-1">
                {col.tasks.length === 0 && (
                  <div className="text-[11.5px] text-muted-foreground/70 text-center py-6 italic">
                    Nothing here.
                  </div>
                )}
                <AnimatePresence>
                  {col.tasks.map((t) => {
                    const tDue = dueIso(t.dueDate);
                    const overdue =
                      col.key === "pending" && tDue !== null && tDue < today;
                    return (
                      <motion.div
                        key={t.id}
                        layout
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className={cn(
                          "group rounded-lg border bg-background/60 p-2.5 hover:border-primary/50 transition-colors",
                          overdue
                            ? "border-rose-500/40"
                            : "border-card-border",
                        )}
                        data-testid={`kanban-card-${t.id}`}
                      >
                        <div className="flex items-start gap-2">
                          <button
                            onClick={() =>
                              update.mutate(
                                {
                                  id: t.id,
                                  data: { completed: !t.completedAt },
                                },
                                { onSettled: refresh },
                              )
                            }
                            className="flex-shrink-0 mt-0.5"
                            data-testid={`kanban-toggle-${t.id}`}
                            aria-label={t.completedAt ? "Mark incomplete" : "Mark complete"}
                          >
                            {t.completedAt ? (
                              <CheckCircle2 size={16} className="text-emerald-500" />
                            ) : (
                              <Circle
                                size={16}
                                className="text-muted-foreground hover:text-primary"
                              />
                            )}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div
                              className={cn(
                                "text-[13px] font-medium leading-snug",
                                t.completedAt && "line-through opacity-60",
                              )}
                            >
                              {t.title}
                            </div>
                            <div className="flex items-center flex-wrap gap-1.5 text-[10.5px] text-muted-foreground mt-1">
                              {t.leadId && t.leadContactName && (
                                <Link
                                  to={`/leads/${t.leadId}`}
                                  className="text-primary hover:underline truncate max-w-[110px]"
                                >
                                  {t.leadContactName}
                                </Link>
                              )}
                              {t.dueDate && (
                                <span className="inline-flex items-center gap-1">
                                  {overdue && (
                                    <AlertCircle size={10} className="text-rose-500" />
                                  )}
                                  {shortDate(t.dueDate)}
                                </span>
                              )}
                              <span
                                className={cn(
                                  "px-1.5 py-0 rounded-full text-[9px] font-bold uppercase tracking-wider",
                                  PRIORITY_PILL[t.priority],
                                )}
                              >
                                {t.priority}
                              </span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
