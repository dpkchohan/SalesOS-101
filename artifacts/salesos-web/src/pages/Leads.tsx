import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import {
  useListLeads,
  useCreateLead,
  useListContacts,
  useUpdateLead,
  getListLeadsQueryKey,
  getGetPipelineQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, AlertCircle, CalendarDays, X, Layers, MoveRight, MoveLeft } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Field } from "./Contacts";
import { formatCurrency, relativeTime, STAGES, STAGE_META, isoToday, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const ALL_STAGES = ["all", ...STAGES] as const;
type StageFilter = (typeof ALL_STAGES)[number];

export default function Leads() {
  // Desktop filter state
  const [stage, setStage] = useState<StageFilter>("all");
  const [showNew, setShowNew] = useState(false);
  const qc = useQueryClient();

  // Always fetch all leads — desktop filters client-side, mobile tabs group client-side
  const { data: allLeads, isLoading } = useListLeads({}, {
    query: { queryKey: getListLeadsQueryKey({}) },
  });

  const updateLead = useUpdateLead();
  const [moving, setMoving] = useState<string | null>(null);

  const move = (leadId: string, toStage: (typeof STAGES)[number]) => {
    setMoving(leadId);
    updateLead.mutate(
      { id: leadId, data: { stage: toStage } },
      {
        onSettled: () => {
          setMoving(null);
          qc.invalidateQueries({ queryKey: getListLeadsQueryKey({}) });
          qc.invalidateQueries({ queryKey: getGetPipelineQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        },
      },
    );
  };

  // Desktop filtered list
  const desktopLeads =
    stage === "all" ? (allLeads ?? []) : (allLeads ?? []).filter((l) => l.stage === stage);

  // ── Mobile swipe state ──────────────────────────────────────────────────────
  const [mobileStageIdx, setMobileStageIdx] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [mobileStageIdx]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 50) return;
    setMobileStageIdx((i) =>
      dx < 0 ? Math.min(i + 1, STAGES.length - 1) : Math.max(i - 1, 0),
    );
  };

  // Per-stage lead lists (for mobile tabs)
  const leadsByStage = Object.fromEntries(
    STAGES.map((s) => [s, (allLeads ?? []).filter((l) => l.stage === s)]),
  );

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle={allLeads ? `${allLeads.length} lead${allLeads.length !== 1 ? "s" : ""}` : "Loading…"}
        right={
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground font-semibold text-[13px] px-3.5 py-2 rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
            data-testid="button-newlead"
          >
            <Plus size={15} /> New lead
          </button>
        }
      />

      {/* ── Mobile: swipeable stage view ── */}
      <div className="md:hidden">
        {/* Horizontal scrollable tab bar */}
        <div
          className="overflow-x-auto border-b border-border"
          style={{ scrollbarWidth: "none" }}
        >
          <div className="flex">
            {STAGES.map((s, idx) => {
              const count = leadsByStage[s]?.length ?? 0;
              return (
                <button
                  key={s}
                  ref={idx === mobileStageIdx ? activeTabRef : undefined}
                  type="button"
                  onClick={() => setMobileStageIdx(idx)}
                  className={cn(
                    "flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-bold border-b-2 transition-colors whitespace-nowrap",
                    idx === mobileStageIdx
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground",
                  )}
                  data-testid={`mobile-stage-tab-${s}`}
                >
                  {STAGE_META[s].label.toUpperCase()}
                  <span
                    className={cn(
                      "text-[10px] rounded-full px-1.5 py-0.5 font-bold",
                      idx === mobileStageIdx
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Swipeable lead panel */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="min-h-[60dvh]"
        >
          {isLoading ? (
            <div className="px-4 pt-6 text-muted-foreground text-[13px]">Loading…</div>
          ) : (
            STAGES.map((s, idx) => {
              if (idx !== mobileStageIdx) return null;
              const leads = leadsByStage[s] ?? [];
              const total = leads.reduce((sum, l) => sum + (l.valueUsd ?? 0), 0);
              return (
                <div
                  key={s}
                  className="px-4 pt-3 pb-6 animate-in fade-in duration-150"
                >
                  {/* Stage summary row */}
                  <div className="flex items-center justify-between mb-3 text-[12px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className={cn("w-2 h-2 rounded-full", STAGE_META[s].bar)} />
                      {leads.length} lead{leads.length !== 1 ? "s" : ""}
                    </span>
                    <span>{formatCurrency(total)}</span>
                  </div>

                  {leads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                      <Layers size={36} className="mb-3 opacity-25" />
                      <p className="text-[13px]">No leads in {STAGE_META[s].label}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {leads.map((lead) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          busy={moving === lead.id}
                          onMove={(toStage) => move(lead.id, toStage)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Desktop: filter pills + flat list (unchanged) ── */}
      <div className="hidden md:block">
        <div className="px-4 md:px-8 mb-3 flex gap-1.5 overflow-x-auto">
          {ALL_STAGES.map((s) => {
            const meta = s === "all" ? null : STAGE_META[s];
            return (
              <button
                key={s}
                onClick={() => setStage(s)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-[11.5px] font-bold uppercase tracking-wider transition-colors flex-shrink-0",
                  stage === s
                    ? s === "all"
                      ? "bg-foreground text-background"
                      : cn(meta!.tone, "ring-2 ring-primary/30")
                    : "bg-muted/50 text-muted-foreground hover:bg-muted",
                )}
                data-testid={`stage-filter-${s}`}
              >
                {s === "all" ? "All stages" : meta!.label}
              </button>
            );
          })}
        </div>

        <div className="px-8 space-y-1.5 pb-6">
          {isLoading && (
            <div className="text-muted-foreground text-[13px] py-4">Loading…</div>
          )}
          {!isLoading && desktopLeads.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <div className="text-[14px]">No leads found.</div>
              <button
                onClick={() => setShowNew(true)}
                className="mt-3 text-primary font-semibold text-[13px] hover:underline"
              >
                Create your first lead
              </button>
            </div>
          )}
          <AnimatePresence>
            {desktopLeads.map((lead, i) => (
              <motion.div
                key={lead.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.2) }}
              >
                <Link
                  to={`/leads/${lead.id}`}
                  className="flex items-center gap-3 p-3.5 rounded-xl bg-card border border-card-border hover:border-primary/40 transition-colors"
                  data-testid={`lead-${lead.id}`}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/15 text-primary grid place-items-center font-bold text-[13px] flex-shrink-0">
                    {initials(lead.contactName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold text-[14px] truncate">{lead.contactName}</div>
                      {lead.companyName && (
                        <div className="text-[11px] text-muted-foreground truncate">
                          {lead.companyName}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full", STAGE_META[lead.stage].tone)}>
                        {STAGE_META[lead.stage].label}
                      </span>
                      {lead.closeDate && (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <CalendarDays size={10} />
                          {new Date(lead.closeDate).toLocaleDateString()}
                        </span>
                      )}
                      {(lead.openSignalCount ?? 0) > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-300">
                          <AlertCircle size={9} /> {lead.openSignalCount} flag{lead.openSignalCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[15px] font-bold tracking-tight">
                      {formatCurrency(lead.valueUsd, lead.currency)}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {relativeTime(lead.createdAt)}
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {showNew && <NewLeadDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

// ── Mobile lead card with stage move buttons ─────────────────────────────────

type LeadItem = {
  id: string;
  contactName?: string;
  companyName?: string | null;
  stage: (typeof STAGES)[number];
  valueUsd?: number | null;
  currency: string;
  closeDate?: string | null;
  openSignalCount?: number;
  createdAt: string;
};

function LeadCard({
  lead,
  busy,
  onMove,
}: {
  lead: LeadItem;
  busy: boolean;
  onMove: (stage: (typeof STAGES)[number]) => void;
}) {
  const stageIdx = STAGES.indexOf(lead.stage);
  const next = stageIdx >= 0 && stageIdx < STAGES.length - 2 ? STAGES[stageIdx + 1] : null;
  const prev = stageIdx > 0 ? STAGES[stageIdx - 1] : null;

  return (
    <div
      className={cn(
        "rounded-lg bg-card border border-card-border shadow-xs transition-all",
        busy && "opacity-50",
      )}
      data-testid={`leadcard-${lead.id}`}
    >
      <Link to={`/leads/${lead.id}`} className="block p-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary/15 text-primary grid place-items-center font-bold text-[11px] flex-shrink-0">
            {initials(lead.contactName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-[13.5px] truncate">{lead.contactName}</div>
            {lead.companyName && (
              <div className="text-[11px] text-muted-foreground truncate">{lead.companyName}</div>
            )}
          </div>
          <div className="text-right flex-shrink-0 ml-1">
            <div className="text-[14px] font-bold tracking-tight">
              {formatCurrency(lead.valueUsd, lead.currency)}
            </div>
            {(lead.openSignalCount ?? 0) > 0 && (
              <span className="flex items-center justify-end gap-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-300 mt-0.5">
                <AlertCircle size={9} /> {lead.openSignalCount}
              </span>
            )}
          </div>
        </div>
        {lead.closeDate && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1.5 ml-[2.625rem]">
            <CalendarDays size={10} />
            {new Date(lead.closeDate).toLocaleDateString()}
          </div>
        )}
      </Link>

      {(prev || next) && (
        <div className="flex gap-1 px-3 pb-2.5">
          {prev ? (
            <button
              disabled={busy}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onMove(prev)}
              className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold py-1.5 rounded-md bg-muted hover:bg-muted/70 text-muted-foreground disabled:cursor-not-allowed cursor-pointer"
              data-testid={`button-retreat-lead-${lead.id}`}
              title={`Move back to ${STAGE_META[prev].label}`}
            >
              <MoveLeft size={11} />
              {STAGE_META[prev].label}
            </button>
          ) : (
            <div className="flex-1" />
          )}
          {next && (
            <button
              disabled={busy}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onMove(next)}
              className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary disabled:cursor-not-allowed cursor-pointer"
              data-testid={`button-advance-lead-${lead.id}`}
              title={`Advance to ${STAGE_META[next].label}`}
            >
              {STAGE_META[next].label}
              <MoveRight size={11} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── New lead dialog ───────────────────────────────────────────────────────────

function NewLeadDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const create = useCreateLead();
  const { data: contacts } = useListContacts({ limit: 100 });
  const [contactId, setContactId] = useState("");
  const [stage, setStage] = useState<(typeof STAGES)[number]>("new");
  const [value, setValue] = useState("");
  const [closeDate, setCloseDate] = useState(isoToday());
  const [source, setSource] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactId) return;
    create.mutate(
      {
        data: {
          contactId,
          stage,
          valueUsd: value ? Number(value) : null,
          closeDate: closeDate ? new Date(closeDate).toISOString() : null,
          source: source || null,
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListLeadsQueryKey({}) });
          qc.invalidateQueries({ queryKey: getGetPipelineQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          onClose();
        },
      },
    );
  };

  const inputCls =
    "w-full bg-background border border-input rounded-md px-3 py-2 text-[14px] outline-none focus:border-primary transition-colors";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm grid place-items-end md:place-items-center p-0 md:p-4">
      <motion.form
        onSubmit={submit}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-card w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5 border border-card-border max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[17px] font-bold tracking-tight">New lead</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-muted">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3">
          <Field label="Contact" required>
            <select
              required
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className={inputCls}
              data-testid="select-contact"
            >
              <option value="">Select a contact…</option>
              {contacts?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.companyName ? ` — ${c.companyName}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Stage">
            <div className="grid grid-cols-3 gap-1.5">
              {STAGES.slice(0, 6).map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setStage(s)}
                  className={cn(
                    "py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-colors",
                    stage === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80",
                  )}
                  data-testid={`stage-${s}`}
                >
                  {STAGE_META[s].label}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Deal value (USD)">
              <input
                type="number"
                min="0"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0"
                className={inputCls}
                data-testid="input-value"
              />
            </Field>
            <Field label="Close date">
              <input
                type="date"
                value={closeDate}
                onChange={(e) => setCloseDate(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Source">
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="e.g. Referral, Inbound, Cold outreach"
              className={inputCls}
            />
          </Field>
        </div>
        <button
          type="submit"
          disabled={create.isPending || !contactId}
          className={cn(
            "mt-5 w-full bg-primary text-primary-foreground font-semibold text-[14px] py-2.5 rounded-lg",
            "hover:bg-primary/90 transition-colors disabled:opacity-50",
          )}
          data-testid="button-save-lead"
        >
          {create.isPending ? "Saving…" : "Save lead"}
        </button>
      </motion.form>
    </div>
  );
}
