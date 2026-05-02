import { Link } from "wouter";
import {
  useGetPipeline,
  useUpdateLead,
  getGetPipelineQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, MoveRight } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { ExportMenu } from "@/components/ExportMenu";
import { formatCurrency, initials, STAGES, STAGE_META } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Pipeline() {
  const { data, isLoading } = useGetPipeline();
  const qc = useQueryClient();
  const updateLead = useUpdateLead();
  const [moving, setMoving] = useState<string | null>(null);

  const move = (leadId: string, stage: typeof STAGES[number]) => {
    setMoving(leadId);
    updateLead.mutate(
      { id: leadId, data: { stage } },
      {
        onSettled: () => {
          setMoving(null);
          qc.invalidateQueries({ queryKey: getGetPipelineQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        },
      },
    );
  };

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle="Drag-free kanban — tap a card to advance the stage"
        right={<ExportMenu resource="leads" testIdPrefix="leads-export" />}
      />
      {isLoading && <div className="px-4 md:px-8 text-muted-foreground">Loading…</div>}
      <div className="md:hidden px-4 space-y-5 pb-6">
        {data?.columns.map((col) => (
          <div key={col.stage}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full", STAGE_META[col.stage].bar)} />
                <span className="text-[13px] font-bold uppercase tracking-wider">{STAGE_META[col.stage].label}</span>
                <span className="text-[11px] text-muted-foreground">{col.count}</span>
              </div>
              <span className="text-[11px] text-muted-foreground">{formatCurrency(col.totalValue)}</span>
            </div>
            <div className="space-y-2">
              {col.leads.length === 0 && (
                <div className="text-[12px] text-muted-foreground italic px-1">empty</div>
              )}
              {col.leads.map((l) => (
                <LeadCard
                  key={l.id}
                  lead={l}
                  busy={moving === l.id}
                  onMove={(stage) => move(l.id, stage)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="hidden md:flex px-8 gap-4 overflow-x-auto pb-8">
        {data?.columns.map((col) => (
          <div key={col.stage} className="w-[280px] flex-shrink-0">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full", STAGE_META[col.stage].bar)} />
                <span className="text-[12px] font-bold uppercase tracking-wider">{STAGE_META[col.stage].label}</span>
                <span className="text-[11px] text-muted-foreground">{col.count}</span>
              </div>
              <span className="text-[11px] text-muted-foreground">{formatCurrency(col.totalValue)}</span>
            </div>
            <div className="bg-muted/40 rounded-xl p-2 min-h-[200px] space-y-2">
              <AnimatePresence>
                {col.leads.map((l) => (
                  <motion.div
                    key={l.id}
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                  >
                    <LeadCard lead={l} busy={moving === l.id} onMove={(stage) => move(l.id, stage)} />
                  </motion.div>
                ))}
              </AnimatePresence>
              {col.leads.length === 0 && (
                <div className="text-[11px] text-muted-foreground italic px-2 py-6 text-center">
                  No leads here
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface LeadCardLead {
  id: string;
  contactId: string;
  stage: typeof STAGES[number];
  valueUsd?: number | null;
  currency: string;
  contactName?: string;
  companyName?: string | null;
  assigneeName?: string | null;
  openSignalCount?: number;
}

function LeadCard({
  lead,
  busy,
  onMove,
}: {
  lead: LeadCardLead;
  busy: boolean;
  onMove: (stage: typeof STAGES[number]) => void;
}) {
  const stageIdx = STAGES.indexOf(lead.stage);
  const next = stageIdx >= 0 && stageIdx < STAGES.length - 2 ? STAGES[stageIdx + 1] : null;
  return (
    <div
      className={cn(
        "p-3 rounded-lg bg-card border border-card-border shadow-xs hover:shadow-sm transition-all group",
        busy && "opacity-50",
      )}
      data-testid={`pipelinecard-${lead.id}`}
    >
      <Link to={`/leads/${lead.id}`} className="block">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-primary/15 text-primary grid place-items-center font-bold text-[11px]">
              {initials(lead.contactName)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold truncate">{lead.contactName}</div>
              {lead.companyName && (
                <div className="text-[11px] text-muted-foreground truncate">{lead.companyName}</div>
              )}
            </div>
            {(lead.openSignalCount ?? 0) > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-300 px-1.5 py-0.5 rounded-full">
                <AlertCircle size={9} />
                {lead.openSignalCount}
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[14px] font-bold tracking-tight">
              {formatCurrency(lead.valueUsd, lead.currency)}
            </span>
            {lead.assigneeName && (
              <span className="text-[10px] text-muted-foreground">{lead.assigneeName}</span>
            )}
          </div>
        </Link>
      {next && (
        <button
          disabled={busy}
          onClick={() => onMove(next)}
          className="mt-2 w-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-[11px] font-semibold py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary"
          data-testid={`button-advance-${lead.id}`}
        >
          Advance to {STAGE_META[next].label} <MoveRight size={11} />
        </button>
      )}
    </div>
  );
}
