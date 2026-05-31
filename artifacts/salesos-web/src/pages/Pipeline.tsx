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
import { AlertCircle, MoveRight, MoveLeft } from "lucide-react";
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { PageHeader } from "@/components/AppLayout";
import { ExportMenu } from "@/components/ExportMenu";
import { formatCurrency, initials, STAGES, STAGE_META } from "@/lib/format";
import { cn } from "@/lib/utils";

interface LeadCardLead {
  id: string;
  contactId: string;
  stage: (typeof STAGES)[number];
  valueUsd?: number | null;
  currency: string;
  contactName?: string;
  companyName?: string | null;
  assigneeName?: string | null;
  openSignalCount?: number;
}

export default function Pipeline() {
  const { data, isLoading } = useGetPipeline();
  const qc = useQueryClient();
  const updateLead = useUpdateLead();
  const [moving, setMoving] = useState<string | null>(null);
  const [activeLead, setActiveLead] = useState<LeadCardLead | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const move = (leadId: string, stage: (typeof STAGES)[number]) => {
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

  const handleDragStart = (event: DragStartEvent) => {
    const lead = event.active.data.current?.lead as LeadCardLead | undefined;
    setActiveLead(lead ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveLead(null);
    const { active, over } = event;
    if (!over) return;
    const lead = active.data.current?.lead as LeadCardLead | undefined;
    if (!lead) return;
    const toStage = over.id as (typeof STAGES)[number];
    if (lead.stage !== toStage) {
      move(lead.id, toStage);
    }
  };

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle="Drag cards between columns · hover to move stage by stage"
        right={<ExportMenu resource="leads" testIdPrefix="leads-export" />}
      />
      {isLoading && <div className="px-4 md:px-8 text-muted-foreground">Loading…</div>}

      {/* ── Mobile: stacked columns with arrow buttons ── */}
      <div className="md:hidden px-4 space-y-5 pb-6">
        {data?.columns.map((col) => (
          <div key={col.stage}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full", STAGE_META[col.stage].bar)} />
                <span className="text-[13px] font-bold uppercase tracking-wider">
                  {STAGE_META[col.stage].label}
                </span>
                <span className="text-[11px] text-muted-foreground">{col.count}</span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {formatCurrency(col.totalValue)}
              </span>
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

      {/* ── Desktop: drag-and-drop kanban ── */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="hidden md:flex px-8 gap-4 overflow-x-auto pb-8">
          {data?.columns.map((col) => (
            <div key={col.stage} className="w-[280px] flex-shrink-0">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <span className={cn("w-2 h-2 rounded-full", STAGE_META[col.stage].bar)} />
                  <span className="text-[12px] font-bold uppercase tracking-wider">
                    {STAGE_META[col.stage].label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{col.count}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {formatCurrency(col.totalValue)}
                </span>
              </div>
              <DroppableColumn stage={col.stage}>
                <AnimatePresence>
                  {col.leads.map((l) => (
                    <motion.div
                      key={l.id}
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                    >
                      <DraggableCard lead={l}>
                        <LeadCard
                          lead={l}
                          busy={moving === l.id}
                          onMove={(stage) => move(l.id, stage)}
                        />
                      </DraggableCard>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {col.leads.length === 0 && (
                  <div className="text-[11px] text-muted-foreground italic px-2 py-6 text-center">
                    No leads here
                  </div>
                )}
              </DroppableColumn>
            </div>
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeLead && (
            <div className="p-3 rounded-lg bg-card border border-primary/50 shadow-xl w-[264px] rotate-1 cursor-grabbing">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/15 text-primary grid place-items-center font-bold text-[11px]">
                  {initials(activeLead.contactName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold truncate">{activeLead.contactName}</div>
                  {activeLead.companyName && (
                    <div className="text-[11px] text-muted-foreground truncate">
                      {activeLead.companyName}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2 text-[14px] font-bold tracking-tight">
                {formatCurrency(activeLead.valueUsd, activeLead.currency)}
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

// ── Droppable column wrapper ─────────────────────────────────────────────────

function DroppableColumn({
  stage,
  children,
}: {
  stage: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-xl p-2 min-h-[200px] space-y-2 transition-colors duration-150",
        isOver ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/40",
      )}
    >
      {children}
    </div>
  );
}

// ── Draggable card wrapper ───────────────────────────────────────────────────

function DraggableCard({
  lead,
  children,
}: {
  lead: LeadCardLead;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: { lead },
  });

  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn("touch-none cursor-grab active:cursor-grabbing", isDragging && "opacity-40")}
    >
      {children}
    </div>
  );
}

// ── Lead card ────────────────────────────────────────────────────────────────

function LeadCard({
  lead,
  busy,
  onMove,
}: {
  lead: LeadCardLead;
  busy: boolean;
  onMove: (stage: (typeof STAGES)[number]) => void;
}) {
  const stageIdx = STAGES.indexOf(lead.stage);
  // Forward: show for all stages except won (idx 4) and lost (idx 5)
  const next = stageIdx >= 0 && stageIdx < STAGES.length - 2 ? STAGES[stageIdx + 1] : null;
  // Backward: show for all stages except new (idx 0)
  const prev = stageIdx > 0 ? STAGES[stageIdx - 1] : null;

  return (
    <div
      className={cn(
        "p-3 rounded-lg bg-card border border-card-border shadow-xs hover:shadow-sm transition-all group",
        busy && "opacity-50",
      )}
      data-testid={`pipelinecard-${lead.id}`}
    >
      <Link to={`/leads/${lead.id}`} className="block cursor-pointer">
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

      {(prev || next) && (
        <div className="mt-2 flex gap-1">
          {prev ? (
            <button
              disabled={busy}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onMove(prev)}
              className="flex-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-[11px] font-semibold py-1.5 rounded-md bg-muted hover:bg-muted/70 text-muted-foreground disabled:cursor-not-allowed cursor-pointer"
              data-testid={`button-retreat-${lead.id}`}
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
              className="flex-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-[11px] font-semibold py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary disabled:cursor-not-allowed cursor-pointer"
              data-testid={`button-advance-${lead.id}`}
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
