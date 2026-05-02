import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListTasks,
  useUpdateTask,
  getListTasksQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X, CheckCircle2, Circle } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { TasksTabs } from "./Tasks";
import { isoToday } from "@/lib/format";
import { cn } from "@/lib/utils";

type Task = {
  id: string;
  leadId: string | null;
  leadContactName: string | null;
  title: string;
  dueDate: string | null;
  completedAt: Date | string | null;
  priority: "low" | "medium" | "high";
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PRIORITY_DOT: Record<Task["priority"], string> = {
  high: "bg-rose-500",
  medium: "bg-amber-500",
  low: "bg-blue-500",
};

function isoOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export default function TasksCalendar() {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
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
  const today = isoToday();

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const key =
        typeof t.dueDate === "string"
          ? t.dueDate.slice(0, 10)
          : t.dueDate.toISOString().slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  const grid = useMemo(() => {
    const start = startOfMonth(cursor);
    const end = endOfMonth(cursor);
    const startWeekday = start.getDay();
    const cells: Array<{ date: Date; iso: string; inMonth: boolean }> = [];
    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = new Date(start);
      d.setDate(d.getDate() - i - 1);
      cells.push({ date: d, iso: isoOf(d), inMonth: false });
    }
    for (let day = 1; day <= end.getDate(); day++) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth(), day);
      cells.push({ date: d, iso: isoOf(d), inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1].date;
      const d = new Date(last);
      d.setDate(d.getDate() + 1);
      cells.push({ date: d, iso: isoOf(d), inMonth: false });
    }
    return cells;
  }, [cursor]);

  const selectedTasks = selectedIso ? tasksByDate.get(selectedIso) ?? [] : [];
  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const totalThisMonth = grid.reduce((sum, c) => {
    if (!c.inMonth) return sum;
    return sum + (tasksByDate.get(c.iso)?.length ?? 0);
  }, 0);

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle={isLoading ? "Loading…" : `${totalThisMonth} this month`}
      />
      <TasksTabs active="calendar" />
      <div className="px-4 md:px-8 pb-8">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() =>
              setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
            }
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
            data-testid="cal-prev"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-bold tracking-tight" data-testid="cal-month-label">
              {monthLabel}
            </h2>
            <button
              onClick={() => setCursor(startOfMonth(new Date()))}
              className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground"
              data-testid="cal-today"
            >
              Today
            </button>
          </div>
          <button
            onClick={() =>
              setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
            }
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
            data-testid="cal-next"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-7 mb-1.5">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center py-1"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 bg-card border border-card-border rounded-xl p-1.5">
          {grid.map((c) => {
            const dayTasks = tasksByDate.get(c.iso) ?? [];
            const open = dayTasks.filter((t) => !t.completedAt);
            const done = dayTasks.filter((t) => t.completedAt);
            const overdue = open.length > 0 && c.iso < today;
            const isToday = c.iso === today;
            return (
              <button
                key={c.iso + (c.inMonth ? "" : "x")}
                onClick={() => setSelectedIso(c.iso)}
                disabled={dayTasks.length === 0}
                className={cn(
                  "aspect-square min-h-[58px] rounded-lg p-1.5 flex flex-col items-start text-left transition-all",
                  c.inMonth ? "bg-background/60" : "bg-background/20 opacity-50",
                  dayTasks.length > 0 && "hover:ring-2 hover:ring-primary/50 cursor-pointer",
                  isToday && "ring-2 ring-primary/60",
                )}
                data-testid={`cal-day-${c.iso}`}
              >
                <span
                  className={cn(
                    "text-[11.5px] font-bold leading-none",
                    isToday ? "text-primary" : "text-foreground",
                    !c.inMonth && "text-muted-foreground",
                  )}
                >
                  {c.date.getDate()}
                </span>
                {dayTasks.length > 0 && (
                  <div className="mt-auto flex items-center gap-1 flex-wrap">
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        overdue ? "bg-rose-500" : "bg-primary",
                      )}
                    />
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {open.length > 0 ? open.length : `✓${done.length}`}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-3 text-[10.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" /> Open
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Overdue
          </span>
          <span className="inline-flex items-center gap-1">
            ✓ Completed only
          </span>
        </div>
      </div>

      {selectedIso && (
        <DayDetail
          iso={selectedIso}
          tasks={selectedTasks}
          onClose={() => setSelectedIso(null)}
          onToggle={(id, completed) =>
            update.mutate({ id, data: { completed } }, { onSettled: refresh })
          }
        />
      )}
    </div>
  );
}

function DayDetail({
  iso,
  tasks,
  onClose,
  onToggle,
}: {
  iso: string;
  tasks: Task[];
  onClose: () => void;
  onToggle: (id: string, completed: boolean) => void;
}) {
  const dateLabel = new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm grid place-items-end md:place-items-center p-0 md:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5 border border-card-border max-h-[80vh] overflow-y-auto"
        data-testid="cal-day-modal"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[16px] font-bold tracking-tight">{dateLabel}</h2>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {tasks.length} task{tasks.length === 1 ? "" : "s"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted"
            data-testid="cal-day-close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="space-y-1.5">
          {tasks.length === 0 && (
            <div className="text-[13px] text-muted-foreground italic py-4 text-center">
              No tasks on this day.
            </div>
          )}
          {tasks.map((t) => (
            <div
              key={t.id}
              className="flex items-start gap-2.5 p-2.5 rounded-lg bg-background/60 border border-card-border"
            >
              <button
                onClick={() => onToggle(t.id, !t.completedAt)}
                className="flex-shrink-0 mt-0.5"
                data-testid={`cal-toggle-${t.id}`}
                aria-label={t.completedAt ? "Mark incomplete" : "Mark complete"}
              >
                {t.completedAt ? (
                  <CheckCircle2 size={16} className="text-emerald-500" />
                ) : (
                  <Circle size={16} className="text-muted-foreground" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "text-[13.5px] font-medium leading-snug",
                    t.completedAt && "line-through opacity-60",
                  )}
                >
                  {t.title}
                </div>
                <div className="flex items-center flex-wrap gap-2 text-[11px] text-muted-foreground mt-1">
                  {t.leadId && t.leadContactName && (
                    <Link
                      to={`/leads/${t.leadId}`}
                      className="text-primary hover:underline"
                    >
                      {t.leadContactName}
                    </Link>
                  )}
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      PRIORITY_DOT[t.priority],
                    )}
                  />
                  <span className="uppercase tracking-wider text-[9px] font-bold">
                    {t.priority}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
