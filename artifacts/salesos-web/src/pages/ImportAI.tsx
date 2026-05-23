import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadCloud,
  Sparkles,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  AlertTriangle,
  ArrowRight,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListContactsQueryKey,
  getGetPipelineQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { PageHeader } from "@/components/AppLayout";
import { cn } from "@/lib/utils";
import { getApiUrl } from "@/lib/api";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

interface SampleContact {
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  company: string | null;
  stage: string | null;
  valueUsd: number | null;
  closeDate: string | null;
}

interface ImportPreview {
  detectedType: string;
  estimatedContacts: number;
  estimatedLeads: number;
  qualityScore: number;
  issues: string[];
  sampleContacts: SampleContact[];
  columnMapping: Record<string, string>;
}

interface ImportJob {
  id: string;
  filename: string;
  status: "preview" | "processing" | "completed" | "failed";
  totalRows: number;
  processedRows: number;
  contactsCreated: number;
  contactsUpdated: number;
  leadsCreated: number;
  companiesCreated: number;
  skipped: number;
  totalBatches: number;
  completedBatches: number;
  preview: ImportPreview | null;
  errorLog: { batch?: number; row?: number; reason: string }[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

type Step = "upload" | "preview" | "processing" | "done";

export default function ImportAI() {
  const { getToken } = useAuth();
  const [step, setStep] = useState<Step>("upload");
  const [job, setJob] = useState<ImportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setWorking] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCount = useRef(0);
  const qc = useQueryClient();

  const reset = () => {
    setStep("upload");
    setJob(null);
    setError(null);
    setWorking(false);
  };

  async function handleFile(f: File) {
    setError(null);
    if (f.size > 50 * 1024 * 1024) {
      setError("File too large. Max 50 MB.");
      return;
    }
    setWorking(true);
    try {
      const token = await getToken();
      const fd = new FormData();
      fd.append("file", f);
      const resp = await fetch(getApiUrl("/api/import/ai-smart/preview"), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.error ?? `Preview failed (${resp.status})`);
      }
      const data: ImportJob = await resp.json();
      setJob(data);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not analyze file");
    } finally {
      setWorking(false);
    }
  }

  async function startImport() {
    if (!job) return;
    setError(null);
    setWorking(true);
    try {
      const token = await getToken();
      const resp = await fetch(getApiUrl("/api/import/ai-smart/execute"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ jobId: job.id }),
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.error ?? `Failed to start import (${resp.status})`);
      }
      const data: ImportJob = await resp.json();
      setJob(data);
      setStep("processing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start import");
    } finally {
      setWorking(false);
    }
  }

  // Poll for job updates while processing
  useEffect(() => {
    if (step !== "processing" || !job) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const token = await getToken();
        const resp = await fetch(getApiUrl(`/api/import/ai-smart/job/${job.id}`), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!resp.ok) return;
        const data: ImportJob = await resp.json();
        if (cancelled) return;
        setJob(data);
        if (data.status === "completed" || data.status === "failed") {
          setStep("done");
          qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetPipelineQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        }
      } catch {
        /* ignore poll errors */
      }
    };
    void tick();
    const id = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [step, job?.id, qc]);

  const progressPct = job
    ? Math.min(
        100,
        Math.round(
          job.totalBatches > 0
            ? (job.completedBatches / job.totalBatches) * 100
            : 0,
        ),
      )
    : 0;

  return (
    <div>
      <PageHeader
        title="AI Smart Import"
        subtitle="Drop any messy CSV, Excel, or JSON. Claude reads, normalizes, dedupes, and imports."
        right={
          step !== "upload" && (
            <button
              onClick={reset}
              className="flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-restart-ai-import"
            >
              <ChevronLeft size={14} /> Start over
            </button>
          )
        }
      />

      <div className="px-4 md:px-8 max-w-4xl pb-12">
        <div className="flex items-center gap-2 mb-6 text-[11px] uppercase tracking-wider font-semibold">
          {(["upload", "preview", "processing", "done"] as Step[]).map((s, i) => {
            const idx = ["upload", "preview", "processing", "done"].indexOf(step);
            const active = step === s;
            const done = idx > i;
            return (
              <div key={s} className="flex items-center gap-2">
                <span
                  className={cn(
                    "w-6 h-6 rounded-full grid place-items-center text-[11px]",
                    active && "bg-primary text-primary-foreground",
                    done && "bg-emerald-500 text-white",
                    !active && !done && "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? <CheckCircle2 size={13} /> : i + 1}
                </span>
                <span className={cn("hidden sm:inline", active ? "text-foreground" : "text-muted-foreground")}>
                  {s === "upload"
                    ? "Upload"
                    : s === "preview"
                      ? "Preview"
                      : s === "processing"
                        ? "Processing"
                        : "Done"}
                </span>
                {i < 3 && <span className="w-6 h-px bg-border ml-1 mr-1 hidden sm:block" />}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-[13px] text-rose-300 flex items-start gap-2">
            <XCircle size={16} className="mt-0.5 flex-shrink-0" />
            <div>{error}</div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === "upload" && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div
                onDragEnter={(e) => {
                  e.preventDefault();
                  dragCount.current++;
                  setDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  dragCount.current--;
                  if (dragCount.current <= 0) setDragOver(false);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  dragCount.current = 0;
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
                className={cn(
                  "rounded-2xl border-2 border-dashed transition-colors p-10 md:p-14 grid place-items-center text-center",
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-card-border bg-card hover:border-primary/50",
                )}
              >
                <div className="w-14 h-14 rounded-2xl bg-primary/10 grid place-items-center mb-4">
                  <Sparkles size={26} className="text-primary" />
                </div>
                <div className="text-[17px] font-bold mb-1">Drop a file. We'll figure it out.</div>
                <div className="text-[13px] text-muted-foreground mb-5">
                  CSV, Excel (.xlsx/.xls), or JSON — up to 50 MB.
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isWorking}
                  className="bg-primary text-primary-foreground font-semibold text-[13px] px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                  data-testid="button-choose-ai-file"
                >
                  {isWorking ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Analyzing…
                    </>
                  ) : (
                    <>
                      <UploadCloud size={14} /> Choose file
                    </>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".csv,.xlsx,.xls,.json,text/csv,application/json,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                  data-testid="input-ai-file"
                />
              </div>
              <div className="mt-4 text-center">
                <a
                  href={`${basePath}/import`}
                  className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="link-classic-import"
                >
                  Prefer the classic mapped import? Use it here →
                </a>
              </div>
            </motion.div>
          )}

          {step === "preview" && job && job.preview && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="rounded-xl bg-card border border-card-border p-5">
                <div className="flex items-center gap-2 mb-3">
                  <FileSpreadsheet size={16} className="text-primary" />
                  <div className="text-[13px] font-semibold truncate">{job.filename}</div>
                  <span className="ml-auto text-[11px] text-primary font-semibold flex items-center gap-1">
                    <Sparkles size={12} /> {job.preview.detectedType}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <PreviewStat label="Total rows" value={job.totalRows} />
                  <PreviewStat label="Est. contacts" value={job.preview.estimatedContacts} />
                  <PreviewStat label="Est. leads" value={job.preview.estimatedLeads} />
                  <PreviewStat
                    label="Quality"
                    value={job.preview.qualityScore}
                    suffix="%"
                    tone={
                      job.preview.qualityScore >= 80
                        ? "good"
                        : job.preview.qualityScore >= 50
                          ? "warn"
                          : "bad"
                    }
                  />
                </div>
              </div>

              {job.preview.issues.length > 0 && (
                <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4">
                  <div className="flex items-center gap-2 mb-2 text-amber-300 font-semibold text-[12px] uppercase tracking-wider">
                    <AlertTriangle size={14} /> {job.preview.issues.length} issues found
                  </div>
                  <ul className="space-y-1">
                    {job.preview.issues.slice(0, 8).map((iss, i) => (
                      <li key={i} className="text-[12px] text-amber-200/90 flex gap-2">
                        <span className="text-amber-400">•</span>
                        <span>{iss}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {job.preview.sampleContacts.length > 0 && (
                <div className="rounded-xl bg-card border border-card-border overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-card-border text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                    Sample of what we'll import
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b border-card-border bg-muted/30 text-left">
                          <th className="px-3 py-2 font-semibold">Name</th>
                          <th className="px-3 py-2 font-semibold">Email</th>
                          <th className="px-3 py-2 font-semibold">Company</th>
                          <th className="px-3 py-2 font-semibold">Stage</th>
                          <th className="px-3 py-2 font-semibold text-right">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {job.preview.sampleContacts.map((c, i) => (
                          <tr key={i} className="border-b border-card-border last:border-0">
                            <td className="px-3 py-2 font-medium">{c.name || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{c.email ?? "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{c.company ?? "—"}</td>
                            <td className="px-3 py-2">
                              {c.stage ? (
                                <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-semibold capitalize">
                                  {c.stage}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {c.valueUsd != null
                                ? `$${c.valueUsd.toLocaleString()}`
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={reset}
                  className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-cancel-ai-preview"
                >
                  Cancel
                </button>
                <button
                  onClick={startImport}
                  disabled={isWorking}
                  className="flex items-center gap-1.5 bg-primary text-primary-foreground font-semibold text-[14px] px-5 py-2.5 rounded-lg hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
                  data-testid="button-start-ai-import"
                >
                  {isWorking ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Starting…
                    </>
                  ) : (
                    <>
                      Import {job.totalRows} rows <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {step === "processing" && job && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl bg-card border border-card-border p-8 text-center"
            >
              <div className="flex items-center justify-center gap-2 mb-3 text-primary">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-[15px] font-bold">Importing your data</span>
              </div>
              <div className="text-[12px] text-muted-foreground mb-5">
                Imported {job.contactsCreated + job.contactsUpdated} / {job.totalRows} contacts
                · batch {Math.min(job.completedBatches + 1, job.totalBatches)} of {job.totalBatches}
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums" data-testid="text-ai-progress">
                {progressPct}%
              </div>
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
                <LiveStat label="Contacts created" value={job.contactsCreated} />
                <LiveStat label="Contacts updated" value={job.contactsUpdated} />
                <LiveStat label="Leads created" value={job.leadsCreated} />
                <LiveStat label="Companies added" value={job.companiesCreated} />
              </div>
            </motion.div>
          )}

          {step === "done" && job && (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="rounded-2xl bg-card border border-card-border overflow-hidden">
                <div className="px-6 py-5 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-emerald-400" />
                  <div>
                    <div className="text-[15px] font-bold">Import complete</div>
                    <div className="text-[12px] text-muted-foreground">
                      Processed {job.processedRows} rows from {job.filename}.
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-y md:divide-y-0 divide-card-border">
                  <Stat label="Contacts created" value={job.contactsCreated} />
                  <Stat label="Contacts updated" value={job.contactsUpdated} />
                  <Stat label="Leads created" value={job.leadsCreated} />
                  <Stat label="Companies added" value={job.companiesCreated} />
                  <Stat label="Skipped" value={job.skipped} tone={job.skipped > 0 ? "warn" : "default"} />
                </div>
                {job.errorLog.length > 0 && (
                  <div className="px-6 py-4 border-t border-card-border">
                    <div className="text-[12px] font-semibold text-muted-foreground mb-2">
                      {job.errorLog.length} issue{job.errorLog.length === 1 ? "" : "s"} logged
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {job.errorLog.slice(0, 25).map((e, i) => (
                        <div key={i} className="text-[12px] text-rose-300/90 font-mono">
                          {e.batch != null ? `batch ${e.batch}` : ""}
                          {e.row != null ? ` row ${e.row}` : ""}
                          {(e.batch != null || e.row != null) && ": "}
                          {e.reason}
                        </div>
                      ))}
                      {job.errorLog.length > 25 && (
                        <div className="text-[11px] text-muted-foreground italic pt-1">
                          … and {job.errorLog.length - 25} more
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-5 flex items-center justify-between">
                <button
                  onClick={reset}
                  className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-ai-import-another"
                >
                  Import another file
                </button>
                <a
                  href={`${basePath}/contacts`}
                  className="bg-primary text-primary-foreground font-semibold text-[13px] px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
                  data-testid="link-view-ai-contacts"
                >
                  View contacts
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PreviewStat({
  label,
  value,
  suffix = "",
  tone = "default",
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const color =
    tone === "good"
      ? "text-emerald-400"
      : tone === "warn"
        ? "text-amber-400"
        : tone === "bad"
          ? "text-rose-400"
          : "text-foreground";
  return (
    <div className="rounded-lg bg-muted/30 px-4 py-3">
      <div className={cn("text-[20px] font-bold tabular-nums", color)}>
        {value}
        {suffix}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">
        {label}
      </div>
    </div>
  );
}

function LiveStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/30 px-3 py-2">
      <div className="text-[16px] font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
        {label}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warn";
}) {
  return (
    <div className="px-5 py-4">
      <div
        className={cn(
          "text-[24px] font-bold tabular-nums",
          tone === "warn" && value > 0 ? "text-amber-400" : "text-foreground",
        )}
        data-testid={`ai-stat-${label.replace(/\s+/g, "-").toLowerCase()}`}
      >
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">
        {label}
      </div>
    </div>
  );
}
