import { Link, useParams } from "wouter";
import {
  useGetLead,
  useUpdateLead,
  useAnalyzeLead,
  useCreateInteraction,
  useCreateTask,
  useUpdateTask,
  getGetLeadQueryKey,
  getGetPipelineQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Sparkles,
  Plus,
  Phone,
  Mail,
  CalendarDays,
  StickyNote,
  CheckCircle2,
  Circle,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Field } from "./Contacts";
import { formatCurrency, initials, relativeTime, STAGES, STAGE_META, isoToday } from "@/lib/format";
import { cn } from "@/lib/utils";

const interactionIcon = {
  call: Phone,
  email: Mail,
  meeting: CalendarDays,
  note: StickyNote,
};

export default function LeadDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const { data, isLoading } = useGetLead(id, {
    query: { enabled: !!id, queryKey: getGetLeadQueryKey(id) },
  });
  const updateLead = useUpdateLead();
  const analyze = useAnalyzeLead();
  const updateTask = useUpdateTask();
  const [showInter, setShowInter] = useState(false);
  const [showTask, setShowTask] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getGetLeadQueryKey(id) });
    qc.invalidateQueries({ queryKey: getGetPipelineQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  };

  const moveStage = (stage: typeof STAGES[number]) => {
    updateLead.mutate({ id, data: { stage } }, { onSettled: refresh });
  };

  const runAnalyze = () => {
    analyze.mutate({ id }, { onSettled: refresh });
  };

  const toggleTask = (taskId: string, current: Date | null | undefined) => {
    updateTask.mutate(
      { id: taskId, data: { completed: !current } },
      { onSettled: refresh },
    );
  };

  if (isLoading) return <div className="px-4 md:px-8 pt-8 text-muted-foreground">Loading…</div>;
  if (!data) return <div className="px-4 md:px-8 pt-8">Lead not found.</div>;

  return (
    <div>
      <div className="px-4 md:px-8 pt-5 md:pt-8">
        <Link to="/pipeline" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
            <ArrowLeft size={13} /> Pipeline
          </Link>
      </div>
      <div className="px-4 md:px-8 pt-3 pb-4 flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/15 text-primary grid place-items-center font-bold text-[16px]">
              {initials(data.contact.name)}
            </div>
            <div>
              <h1 className="text-[22px] md:text-[26px] font-bold tracking-tight leading-none">
                {data.contact.name}
              </h1>
              <div className="text-[12.5px] text-muted-foreground mt-1">
                {data.company?.name ?? "No company"} · {data.contact.title ?? ""}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Deal value
            </div>
            <div className="text-[22px] font-bold tracking-tight leading-none">
              {formatCurrency(data.valueUsd, data.currency)}
            </div>
          </div>
          <button
            onClick={runAnalyze}
            disabled={analyze.isPending}
            className="flex items-center gap-1.5 bg-secondary text-secondary-foreground font-semibold text-[12.5px] px-3 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            data-testid="button-analyze"
          >
            <Sparkles size={14} /> {analyze.isPending ? "Analyzing…" : "Analyze"}
          </button>
        </div>
      </div>

      <div className="px-4 md:px-8 mb-5 flex gap-1.5 overflow-x-auto">
        {STAGES.map((s) => {
          const active = data.stage === s;
          return (
            <button
              key={s}
              onClick={() => moveStage(s)}
              disabled={updateLead.isPending}
              className={cn(
                "px-3 py-1.5 rounded-full text-[11.5px] font-bold uppercase tracking-wider transition-all flex-shrink-0",
                active
                  ? cn(STAGE_META[s].tone, "ring-2 ring-primary/40")
                  : "bg-muted/50 text-muted-foreground hover:bg-muted",
              )}
              data-testid={`stagebtn-${s}`}
            >
              {STAGE_META[s].label}
            </button>
          );
        })}
      </div>

      <div className="px-4 md:px-8 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <div className="md:col-span-2 space-y-4">
          {data.signals.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl bg-gradient-to-br from-rose-500/10 to-amber-500/10 border border-rose-500/20 p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[14px] font-bold tracking-tight flex items-center gap-2">
                  <AlertTriangle size={15} className="text-rose-500" /> Red flags from Claude
                </h2>
                <span className="text-[10px] text-muted-foreground">
                  refreshed {relativeTime(data.signals[0]?.createdAt)}
                </span>
              </div>
              <div className="space-y-2">
                {data.signals.map((s) => (
                  <div key={s.id} className="bg-card/70 backdrop-blur-sm rounded-lg p-3 border border-card-border">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          s.severity === "high" ? "bg-rose-500" : s.severity === "medium" ? "bg-amber-500" : "bg-blue-500",
                        )}
                      />
                      <span className="text-[10px] uppercase tracking-wider font-bold">
                        {s.signalType.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="text-[13px] leading-snug">{s.message}</div>
                    {s.recommendation && (
                      <div className="text-[11.5px] text-muted-foreground mt-1.5 italic">
                        → {s.recommendation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          <div className="rounded-2xl bg-card border border-card-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-bold tracking-tight">Interaction timeline</h2>
              <button
                onClick={() => setShowInter(true)}
                className="text-[12px] font-semibold flex items-center gap-1 text-primary hover:underline"
                data-testid="button-newinteraction"
              >
                <Plus size={12} /> Log
              </button>
            </div>
            <div className="space-y-4">
              {data.interactions.length === 0 && (
                <div className="text-[13px] text-muted-foreground italic py-6 text-center">
                  No interactions yet. Log the first call or meeting.
                </div>
              )}
              {data.interactions.map((i, idx) => {
                const Icon = interactionIcon[i.type];
                return (
                  <motion.div
                    key={i.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className="flex gap-3"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/15 text-primary grid place-items-center flex-shrink-0">
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0 flex-1 pb-4 border-b border-border last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider">{i.type}</span>
                        <span className="text-[10px] text-muted-foreground">{relativeTime(i.date)}</span>
                        {i.sentiment && (
                          <span
                            className={cn(
                              "text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full",
                              i.sentiment === "positive"
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                : i.sentiment === "negative"
                                  ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                                  : "bg-muted text-muted-foreground",
                            )}
                          >
                            {i.sentiment}
                          </span>
                        )}
                      </div>
                      <div className="text-[13.5px] leading-snug mt-1">{i.gist}</div>
                      {(i.gains?.length ?? 0) > 0 && (
                        <div className="mt-1.5 text-[11.5px] text-emerald-700 dark:text-emerald-400">
                          ✓ {i.gains.join(" · ")}
                        </div>
                      )}
                      {(i.misses?.length ?? 0) > 0 && (
                        <div className="text-[11.5px] text-rose-700 dark:text-rose-400">
                          ✗ {i.misses.join(" · ")}
                        </div>
                      )}
                      {i.nextStep && (
                        <div className="mt-1.5 text-[11.5px] italic text-muted-foreground">
                          Next: {i.nextStep}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-card border border-card-border p-5">
            <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Lead</h2>
            <div className="space-y-2 text-[12.5px]">
              <Row label="Source" value={data.source ?? "—"} />
              <Row label="Close date" value={data.closeDate ? new Date(data.closeDate).toLocaleDateString() : "—"} />
              <Row label="Owner" value={data.assigneeName ?? "Unassigned"} />
              <Row label="Created" value={relativeTime(data.createdAt)} />
            </div>
          </div>

          <div className="rounded-2xl bg-card border border-card-border p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Tasks</h2>
              <button
                onClick={() => setShowTask(true)}
                className="text-[11px] font-semibold flex items-center gap-1 text-primary hover:underline"
                data-testid="button-newtask"
              >
                <Plus size={11} /> Task
              </button>
            </div>
            <div className="space-y-1.5">
              {data.tasks.length === 0 && (
                <div className="text-[12px] text-muted-foreground italic">No tasks.</div>
              )}
              <AnimatePresence>
                {data.tasks.map((t) => (
                  <motion.button
                    key={t.id}
                    onClick={() => toggleTask(t.id, t.completedAt as Date | null)}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-start gap-2 p-2 -mx-1 rounded-lg w-full text-left hover:bg-muted/50 transition-colors"
                    data-testid={`task-${t.id}`}
                  >
                    {t.completedAt ? (
                      <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <Circle size={15} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-[12.5px]", t.completedAt && "line-through opacity-60")}>
                        {t.title}
                      </div>
                      {t.dueDate && (
                        <div className="text-[10px] text-muted-foreground">
                          due {new Date(t.dueDate).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {data.contact.email && (
            <a
              href={`mailto:${data.contact.email}`}
              className="block w-full text-center px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-[13px] hover:bg-primary/90"
            >
              Email {data.contact.name.split(" ")[0]}
            </a>
          )}
        </div>
      </div>

      {showInter && (
        <NewInteractionDialog
          leadId={id}
          onClose={() => setShowInter(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: getGetLeadQueryKey(id) });
            setShowInter(false);
          }}
        />
      )}
      {showTask && (
        <NewTaskDialog
          leadId={id}
          onClose={() => setShowTask(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: getGetLeadQueryKey(id) });
            setShowTask(false);
          }}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function NewInteractionDialog({
  leadId,
  onClose,
  onSaved,
}: {
  leadId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const create = useCreateInteraction();
  const [type, setType] = useState<"call" | "email" | "meeting" | "note">("call");
  const [gist, setGist] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [sentiment, setSentiment] = useState<"positive" | "neutral" | "negative">("neutral");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gist.trim()) return;
    create.mutate(
      {
        data: {
          leadId,
          type,
          date: new Date().toISOString().slice(0, 10),
          gist,
          nextStep: nextStep || null,
          sentiment,
          gains: [],
          misses: [],
          actionItems: [],
        },
      },
      { onSuccess: onSaved },
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm grid place-items-end md:place-items-center p-0 md:p-4">
      <motion.form
        onSubmit={submit}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-card w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5 border border-card-border max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-[17px] font-bold tracking-tight mb-4">Log interaction</h2>
        <div className="grid grid-cols-4 gap-1.5 mb-4">
          {(["call", "email", "meeting", "note"] as const).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setType(t)}
              className={cn(
                "py-2 rounded-md text-[11.5px] font-bold uppercase tracking-wider transition-colors",
                type === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
              data-testid={`type-${t}`}
            >
              {t}
            </button>
          ))}
        </div>
        <Field label="What happened?" required>
          <textarea
            required
            autoFocus
            rows={4}
            value={gist}
            onChange={(e) => setGist(e.target.value)}
            data-testid="input-gist"
            className="w-full bg-background border border-input rounded-md px-3 py-2 text-[14px] outline-none focus:border-primary resize-none"
          />
        </Field>
        <div className="mt-3">
          <Field label="Next step">
            <input
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-[14px] outline-none focus:border-primary"
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Sentiment">
            <div className="flex gap-1.5">
              {(["positive", "neutral", "negative"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSentiment(s)}
                  className={cn(
                    "flex-1 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-colors",
                    sentiment === s ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-card-border text-[14px] font-semibold hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={create.isPending || !gist.trim()}
            className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-[14px] font-semibold hover:bg-primary/90 disabled:opacity-50"
            data-testid="button-saveinteraction"
          >
            {create.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </motion.form>
    </div>
  );
}

function NewTaskDialog({
  leadId,
  onClose,
  onSaved,
}: {
  leadId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const create = useCreateTask();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(isoToday());
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      {
        data: {
          leadId,
          title,
          dueDate: dueDate || null,
          priority,
        },
      },
      { onSuccess: onSaved },
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
        <h2 className="text-[17px] font-bold tracking-tight mb-4">New task</h2>
        <Field label="Title" required>
          <input
            required
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            data-testid="input-tasktitle"
            className="w-full bg-background border border-input rounded-md px-3 py-2 text-[14px] outline-none focus:border-primary"
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
        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-card-border text-[14px] font-semibold hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={create.isPending || !title.trim()}
            className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-[14px] font-semibold hover:bg-primary/90 disabled:opacity-50"
            data-testid="button-savetask"
          >
            {create.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </motion.form>
    </div>
  );
}
