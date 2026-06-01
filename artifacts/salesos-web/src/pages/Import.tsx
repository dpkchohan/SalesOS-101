import { useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadCloud,
  FileSpreadsheet,
  ArrowRight,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  Sparkles,
} from "lucide-react";
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

interface SalesosField {
  id: string;
  label: string;
}

interface PreviewResponse {
  filename: string;
  headers: string[];
  rowCount: number;
  sampleRows: Record<string, string>[];
  suggestedMapping: Record<string, string>;
  salesosFields: SalesosField[];
}

interface ImportSummary {
  total: number;
  contactsCreated: number;
  contactsUpdated: number;
  leadsCreated: number;
  companiesCreated: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

type Step = "upload" | "mapping" | "importing" | "done";

export default function Import() {
  const { getToken } = useAuth();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setWorking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCount = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const qc = useQueryClient();

  const reset = () => {
    setStep("upload");
    setFile(null);
    setPreview(null);
    setMapping({});
    setProgress(0);
    setResult(null);
    setError(null);
    setWorking(false);
  };

  async function handleFile(f: File) {
    setError(null);
    if (f.size > 10 * 1024 * 1024) {
      setError("File too large. Max 10 MB.");
      return;
    }
    setFile(f);
    setWorking(true);
    try {
      const token = await getToken();
      const fd = new FormData();
      fd.append("file", f);
      const resp = await fetch(getApiUrl("/api/import/preview"), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.error ?? `Preview failed (${resp.status})`);
      }
      const data: PreviewResponse = await resp.json();
      setPreview(data);
      setMapping(data.suggestedMapping);
      setStep("mapping");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read file");
      setFile(null);
    } finally {
      setWorking(false);
    }
  }

  async function handleImport() {
    if (!file || !preview) return;
    setStep("importing");
    setProgress(5);
    setError(null);
    const fakeProgress = setInterval(() => {
      setProgress((p) => (p < 88 ? p + 4 : p));
    }, Math.max(120, Math.min(450, preview.rowCount * 4)));
    try {
      const token = await getToken();
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mapping", JSON.stringify(mapping));
      const resp = await fetch(getApiUrl("/api/import/contacts"), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      clearInterval(fakeProgress);
      setProgress(100);
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.error ?? `Import failed (${resp.status})`);
      }
      const summary: ImportSummary = await resp.json();
      setResult(summary);
      setStep("done");
      qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetPipelineQueryKey() });
      qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    } catch (err) {
      clearInterval(fakeProgress);
      setError(err instanceof Error ? err.message : "Import failed");
      setStep("mapping");
    }
  }

  return (
    <div>
      <PageHeader
        title="Import contacts"
        subtitle="Upload a CSV or Excel file from HubSpot, Salesforce, Pipedrive, or any spreadsheet."
        right={
          step !== "upload" && (
            <button
              onClick={reset}
              className="flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-restart-import"
            >
              <ChevronLeft size={14} /> Start over
            </button>
          )
        }
      />

      <div className="px-4 md:px-8 max-w-4xl pb-12">
        {step === "upload" && (
          <a
            href={`${basePath}/import-ai`}
            className="mb-5 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-primary/10 border border-primary/30 hover:bg-primary/15 transition-colors"
            data-testid="link-ai-import"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-primary/20 grid place-items-center flex-shrink-0">
                <Sparkles size={16} className="text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold">Try AI Smart Import</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  Skip column mapping — Claude reads any messy file and imports it.
                </div>
              </div>
            </div>
            <ArrowRight size={16} className="text-primary flex-shrink-0" />
          </a>
        )}
        <div className="flex items-center gap-2 mb-6 text-[11px] uppercase tracking-wider font-semibold">
          {(["upload", "mapping", "importing", "done"] as Step[]).map((s, i) => {
            const active = step === s;
            const done = ["upload", "mapping", "importing", "done"].indexOf(step) > i;
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
                  {s === "upload" ? "Upload" : s === "mapping" ? "Map columns" : s === "importing" ? "Importing" : "Done"}
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
                  "rounded-2xl border-2 border-dashed transition-colors p-6 md:p-14 grid place-items-center text-center",
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-card-border bg-card hover:border-primary/50",
                )}
              >
                <div className="w-14 h-14 rounded-2xl bg-primary/10 grid place-items-center mb-4">
                  <UploadCloud size={26} className="text-primary" />
                </div>
                <div className="text-[17px] font-bold mb-1">Drop your file here</div>
                <div className="text-[13px] text-muted-foreground mb-5">
                  CSV or Excel (.xlsx, .xls), up to 10 MB
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isWorking}
                  className="bg-primary text-primary-foreground font-semibold text-[13px] px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                  data-testid="button-choose-file"
                >
                  {isWorking ? "Reading…" : "Choose file"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                  data-testid="input-file"
                />
              </div>
              <div className="mt-6 grid sm:grid-cols-3 gap-3">
                {[
                  { title: "HubSpot exports", body: "Drag in any CRM contacts export — we'll auto-detect columns." },
                  { title: "Smart mapping", body: "First Name + Last Name, Email, Phone, Company, Job Title, Lead Status, Deal Amount, Close Date." },
                  { title: "Safe re-imports", body: "Existing contacts are matched by email and updated, never duplicated." },
                ].map((c) => (
                  <div key={c.title} className="rounded-xl bg-card border border-card-border p-4">
                    <div className="text-[13px] font-semibold mb-1">{c.title}</div>
                    <div className="text-[12px] text-muted-foreground leading-relaxed">{c.body}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {step === "mapping" && preview && (
            <motion.div
              key="mapping"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="rounded-xl bg-card border border-card-border overflow-hidden">
                <div className="px-4 py-3 border-b border-card-border flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileSpreadsheet size={16} className="text-primary flex-shrink-0" />
                    <div className="text-[13px] font-semibold truncate">{preview.filename}</div>
                    <div className="text-[11px] text-muted-foreground">·</div>
                    <div className="text-[11px] text-muted-foreground">{preview.rowCount} rows</div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-primary font-semibold">
                    <Sparkles size={12} /> Auto-mapped from headers
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-card-border bg-muted/30">
                        <th className="text-left px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
                          Your column
                        </th>
                        <th className="text-left px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
                          Maps to
                        </th>
                        <th className="text-left px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
                          Sample values
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.headers.map((h) => {
                        const samples = preview.sampleRows
                          .map((r) => r[h])
                          .filter((v) => v && v.trim())
                          .slice(0, 3);
                        return (
                          <tr key={h} className="border-b border-card-border last:border-0">
                            <td className="px-4 py-2.5 font-medium">{h}</td>
                            <td className="px-4 py-2.5">
                              <select
                                value={mapping[h] ?? "ignore"}
                                onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}
                                className="bg-background border border-card-border rounded-md px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                                data-testid={`select-map-${h.replace(/\s+/g, "-").toLowerCase()}`}
                              >
                                {preview.salesosFields.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground text-[12px] max-w-xs truncate">
                              {samples.length > 0 ? samples.join(" · ") : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-end">
                <button
                  onClick={handleImport}
                  className="flex items-center gap-1.5 bg-primary text-primary-foreground font-semibold text-[14px] px-5 py-2.5 rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
                  data-testid="button-start-import"
                >
                  Import {preview.rowCount} rows <ArrowRight size={15} />
                </button>
              </div>
            </motion.div>
          )}

          {step === "importing" && preview && (
            <motion.div
              key="importing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl bg-card border border-card-border p-8 text-center"
            >
              <div className="text-[15px] font-bold mb-2">Importing {preview.rowCount} rows</div>
              <div className="text-[12px] text-muted-foreground mb-5">
                Creating contacts, matching companies, and building leads…
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums" data-testid="text-progress">
                {progress}%
              </div>
            </motion.div>
          )}

          {step === "done" && result && (
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
                      Processed {result.total} rows from {preview?.filename ?? "your file"}.
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-y md:divide-y-0 divide-card-border">
                  <Stat label="Contacts created" value={result.contactsCreated} />
                  <Stat label="Contacts updated" value={result.contactsUpdated} />
                  <Stat label="Leads created" value={result.leadsCreated} />
                  <Stat label="Companies added" value={result.companiesCreated} />
                  <Stat label="Skipped" value={result.skipped} tone={result.skipped > 0 ? "warn" : "default"} />
                </div>
                {result.errors.length > 0 && (
                  <div className="px-6 py-4 border-t border-card-border">
                    <div className="text-[12px] font-semibold text-muted-foreground mb-2">
                      {result.errors.length} row{result.errors.length === 1 ? "" : "s"} skipped
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {result.errors.slice(0, 25).map((e, i) => (
                        <div key={i} className="text-[12px] text-rose-300 font-mono">
                          row {e.row}: {e.reason}
                        </div>
                      ))}
                      {result.errors.length > 25 && (
                        <div className="text-[11px] text-muted-foreground italic pt-1">
                          … and {result.errors.length - 25} more
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
                  data-testid="button-import-another"
                >
                  Import another file
                </button>
                <a
                  href={`${basePath}/contacts`}
                  className="bg-primary text-primary-foreground font-semibold text-[13px] px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
                  data-testid="link-view-contacts"
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
        data-testid={`stat-${label.replace(/\s+/g, "-").toLowerCase()}`}
      >
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
