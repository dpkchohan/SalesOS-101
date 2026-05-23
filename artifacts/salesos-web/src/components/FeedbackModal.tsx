import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { X, Upload, ImageIcon, AlertCircle, CheckCircle2 } from "lucide-react";
import { useUser } from "@clerk/react";
import { getApiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

type IssueType = "bug" | "feature" | "feedback";

const TYPE_OPTIONS: { value: IssueType; label: string; desc: string }[] = [
  { value: "bug", label: "Bug", desc: "Something isn't working" },
  { value: "feature", label: "Feature Request", desc: "I want a new capability" },
  { value: "feedback", label: "Feedback", desc: "General thoughts" },
];

const CRITICALITY_LABELS: Record<number, string> = {
  1: "Low",
  2: "Minor",
  3: "Medium",
  4: "High",
  5: "Critical",
};

const inputCls =
  "w-full bg-background border border-input rounded-md px-3 py-2 text-[14px] outline-none focus:border-primary transition-colors";

export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const { user } = useUser();
  const [type, setType] = useState<IssueType>("bug");
  const [criticality, setCriticality] = useState(3);
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | null) => {
    if (!file) return;
    setScreenshot(file);
    const reader = new FileReader();
    reader.onload = (e) => setScreenshotPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    setSubmitting(true);

    try {
      const fd = new FormData();
      fd.append("type", type);
      fd.append("criticality", String(criticality));
      fd.append("description", description.trim());
      fd.append("pageUrl", window.location.href);
      if (screenshot) fd.append("screenshot", screenshot);

      const res = await fetch(getApiUrl("/api/feedback"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Submission failed");
      }

      setToast({ msg: "Thanks! We'll review this shortly." });
      setTimeout(onClose, 1800);
    } catch (err) {
      setToast({
        msg: err instanceof Error ? err.message : "Failed to submit. Please try again.",
        error: true,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm grid place-items-end md:place-items-center p-0 md:p-4">
      <motion.form
        onSubmit={submit}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-card w-full md:max-w-lg rounded-t-2xl md:rounded-2xl border border-card-border max-h-[92vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <h2 className="text-[17px] font-bold tracking-tight">Report an Issue</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-2 space-y-4">
          <div>
            <div className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Issue Type
            </div>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={cn(
                    "flex flex-col items-start px-3 py-2.5 rounded-lg border text-left transition-colors",
                    type === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-card-border hover:border-muted-foreground/40",
                  )}
                >
                  <span className="text-[13px] font-semibold">{opt.label}</span>
                  <span className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                    {opt.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                Criticality
              </div>
              <span
                className={cn(
                  "text-[12px] font-semibold px-2 py-0.5 rounded-full",
                  criticality <= 2 && "bg-emerald-500/15 text-emerald-500",
                  criticality === 3 && "bg-amber-500/15 text-amber-500",
                  criticality >= 4 && "bg-rose-500/15 text-rose-500",
                )}
              >
                {criticality} — {CRITICALITY_LABELS[criticality]}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-muted-foreground w-6">1</span>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={criticality}
                onChange={(e) => setCriticality(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-[11px] text-muted-foreground w-6 text-right">5</span>
            </div>
            <div className="flex justify-between mt-1 px-6">
              {[1, 2, 3, 4, 5].map((n) => (
                <span
                  key={n}
                  className={cn(
                    "text-[10px] transition-colors",
                    n === criticality ? "text-foreground font-semibold" : "text-muted-foreground",
                  )}
                >
                  {CRITICALITY_LABELS[n]}
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="block">
              <span className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                Description <span className="text-rose-500">*</span>
              </span>
              <textarea
                required
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue, what you expected, and what happened…"
                className={cn(inputCls, "mt-1.5 resize-none")}
              />
            </label>
          </div>

          <div>
            <div className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Screenshot <span className="font-normal normal-case opacity-60">(optional)</span>
            </div>
            {screenshotPreview ? (
              <div className="relative group rounded-lg overflow-hidden border border-card-border">
                <img
                  src={screenshotPreview}
                  alt="Screenshot preview"
                  className="w-full max-h-40 object-cover"
                />
                <button
                  type="button"
                  onClick={() => { setScreenshot(null); setScreenshotPreview(null); }}
                  className="absolute top-2 right-2 p-1 rounded-full bg-background/80 text-foreground hover:bg-background"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full flex flex-col items-center gap-2 py-6 rounded-lg border border-dashed border-card-border hover:border-primary/50 hover:bg-primary/5 transition-colors"
              >
                <ImageIcon size={22} className="text-muted-foreground" />
                <span className="text-[12.5px] text-muted-foreground">
                  Click to attach a screenshot
                </span>
                <span className="text-[11px] text-muted-foreground/60">
                  PNG, JPG, GIF up to 5 MB
                </span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {user && (
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground flex items-center gap-2">
              <Upload size={12} className="flex-shrink-0" />
              Submitting as <span className="font-medium text-foreground ml-1">{user.primaryEmailAddress?.emailAddress}</span>
              <span className="mx-1">·</span>
              <span className="truncate">{window.location.pathname}</span>
            </div>
          )}
        </div>

        {toast && (
          <div
            className={cn(
              "mx-5 mb-3 mt-1 flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px] font-medium flex-shrink-0",
              toast.error
                ? "bg-rose-500/15 text-rose-500"
                : "bg-emerald-500/15 text-emerald-600",
            )}
          >
            {toast.error
              ? <AlertCircle size={14} className="flex-shrink-0" />
              : <CheckCircle2 size={14} className="flex-shrink-0" />
            }
            {toast.msg}
          </div>
        )}

        <div className="flex gap-2 px-5 pb-5 pt-2 flex-shrink-0 border-t border-card-border mt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-lg border border-card-border text-[14px] font-semibold hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !description.trim()}
            className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-[14px] font-semibold hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </div>
      </motion.form>
    </div>
  );
}
