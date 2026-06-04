import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useListTasks,
  useUpdateTask,
  useCreateTask,
  useDeleteTask,
  getListTasksQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Circle, Plus, Trash2, X, List, LayoutGrid, Calendar } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Field } from "./Contacts";
import { isoToday, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const TAB_ROUTES = [
  { key: "list", label: "List", path: "/tasks", icon: List },
  { key: "kanban", label: "Kanban", path: "/tasks-kanban", icon: LayoutGrid },
  { key: "calendar", label: "Calendar", path: "/tasks-calendar", icon: Calendar },
] as const;

export function TasksTabs({ active }: { active: "list" | "kanban" | "calendar" }) {
  const [, setLocation] = useLocation();
  return (
    <div className="px-4 md:px-8 mb-3 flex gap-1.5">
      {TAB_ROUTES.map((t) => {
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            onClick={() => setLocation(t.path)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-bold uppercase tracking-wider transition-colors",
              active === t.key
                ? "bg-secondary text-secondary-foreground"
                : "bg-muted/40 text-muted-foreground hover:bg-muted",
            )}
            data-testid={`tasks-tab-${t.key}`}
          >
            <Icon size={12} /> {t.label}
          </button>
        );
      })}
    </div>
  );
}

const FILTERS = [
  { key: "today", label: "Today" },
  { key: "open", label: "All open" },
  { key: "done", label: "Completed" },
] as const;

export default function Tasks() {
  const [filter, setFilter] = useState<"today" | "open" | "done">("open");
  const [showNew, setShowNew] = useState(false);
  const params =
    filter === "today"
      ? { dueToday: true }
      : filter === "done"
        ? { includeCompleted: true }
        : {};
  const { data, isLoading } = useListTasks(params, {
    query: { queryKey: getListTasksQueryKey(params) },
  });
  const qc = useQueryClient();
  const update = useUpdateTask();
  const del = useDeleteTask();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListTasksQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  };
  const tasks = filter === "done" ? (data ?? []).filter((t) => t.completedAt) : data ?? [];

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle={tasks.length === 0 ? "All clear" : `${tasks.length} ${filter === "done" ? "completed" : "to do"}`}
        right={
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground font-semibold text-[13px] px-3.5 py-2 rounded-lg hover:bg-primary/90"
            data-testid="button-newtask"
          >
            <Plus size={15} /> New
          </button>
        }
      />
      <TasksTabs active="list" />
      <div className="px-4 md:px-8 mb-3 flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1.5 rounded-full text-[12px] font-bold uppercase tracking-wider transition-colors",
              filter === f.key
                ? "bg-secondary text-secondary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted",
            )}
            data-testid={`filter-${f.key}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="px-4 md:px-8 space-y-1.5">
        {isLoading && <div className="text-muted-foreground text-[13px]">Loading…</div>}
        {tasks.length === 0 && !isLoading && (
          <div className="text-center py-12 text-muted-foreground">
            <div className="text-[14px]">{filter === "done" ? "Nothing completed yet." : "No tasks. Take a breath."}</div>
          </div>
        )}
        <AnimatePresence>
          {tasks.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex items-center gap-3 p-3 rounded-xl bg-card border border-card-border hover:border-primary/40 transition-colors group"
            >
              <button
                onClick={() => update.mutate({ id: t.id, data: { completed: !t.completedAt } }, { onSettled: refresh })}
                data-testid={`toggle-${t.id}`}
                className="flex-shrink-0"
              >
                {t.completedAt ? (
                  <CheckCircle2 size={20} className="text-emerald-500" />
                ) : (
                  <Circle size={20} className="text-muted-foreground hover:text-primary" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className={cn("text-[14px] font-medium", t.completedAt && "line-through opacity-60")}>
                  {t.title}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                  {t.leadId && t.leadContactName && (
                    <Link to={`/leads/${t.leadId}`} className="text-primary hover:underline">{t.leadContactName}</Link>
                  )}
                  {t.dueDate && (
                    <span>
                      due {shortDate(t.dueDate)}
                    </span>
                  )}
                  <span
                    className={cn(
                      "px-1.5 py-0 rounded-full text-[9px] font-bold uppercase tracking-wider",
                      t.priority === "high"
                        ? "bg-rose-500/15 text-rose-600 dark:text-rose-300"
                        : t.priority === "medium"
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-300"
                          : "bg-blue-500/15 text-blue-600 dark:text-blue-300",
                    )}
                  >
                    {t.priority}
                  </span>
                </div>
              </div>
              <button
                onClick={() => del.mutate({ id: t.id }, { onSettled: refresh })}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500 transition-opacity"
                data-testid={`delete-${t.id}`}
              >
                <Trash2 size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {showNew && <NewTaskDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewTaskDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const create = useCreateTask();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(isoToday());
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      { data: { title, dueDate: dueDate || null, priority } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListTasksQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          onClose();
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm grid place-items-end md:place-items-center p-0 md:p-4">
      <motion.form
        onSubmit={submit}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-card w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5 border border-card-border"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[17px] font-bold tracking-tight">New task</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-muted">
            <X size={16} />
          </button>
        </div>
        <Field label="What needs to happen?" required>
          <input
            required
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-background border border-input rounded-md px-3 py-2 text-[14px] outline-none focus:border-primary"
            data-testid="input-newtasktitle"
          />
        </Field>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Due">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-[14px] outline-none focus:border-primary"
            />
          </Field>
          <Field label="Priority">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-[14px] outline-none focus:border-primary"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </Field>
        </div>
        <button
          type="submit"
          disabled={create.isPending || !title.trim()}
          className="mt-5 w-full bg-primary text-primary-foreground font-semibold text-[14px] py-2.5 rounded-lg hover:bg-primary/90 disabled:opacity-50"
          data-testid="button-savenewtask"
        >
          {create.isPending ? "Saving…" : "Save task"}
        </button>
      </motion.form>
    </div>
  );
}
