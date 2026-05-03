import { useEffect, useRef, useState } from "react";
import { useRoute, Link } from "wouter";
import {
  useGetDocument,
  useUpdateDocument,
  useSendDocumentEmail,
  useRegenerateProposal,
  getListDocumentsQueryKey,
  getGetDocumentQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Printer,
  Send,
  CheckCircle2,
  Loader2,
  FileText,
  Mail,
  Pencil,
  Save,
  X,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function DocumentDetail() {
  const [, params] = useRoute<{ id: string }>("/documents/:id");
  const id = params?.id;
  const { data: doc, isLoading, error } = useGetDocument(id ?? "", {
    query: { enabled: !!id, queryKey: getGetDocumentQueryKey(id ?? "") },
  });
  const update = useUpdateDocument();
  const sendEmail = useSendDocumentEmail();
  const regenerate = useRegenerateProposal();
  const qc = useQueryClient();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [emailFlash, setEmailFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [draftHtml, setDraftHtml] = useState<string>("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenNotes, setRegenNotes] = useState("");
  const [regenError, setRegenError] = useState<string | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
    if (id) qc.invalidateQueries({ queryKey: getGetDocumentQueryKey(id) });
  };

  useEffect(() => {
    if (editMode) return;
    if (!iframeRef.current || !doc?.content) return;
    const iframe = iframeRef.current;
    iframe.srcdoc = doc.content;
  }, [doc?.content, editMode]);

  const handlePrint = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.print();
    }
  };

  const startEdit = () => {
    setSaveError(null);
    setDraftHtml(doc?.content ?? "");
    setEditMode(true);
  };
  const cancelEdit = () => {
    setEditMode(false);
    setDraftHtml("");
    setSaveError(null);
  };
  const saveEdit = () => {
    if (!doc) return;
    setSaveError(null);
    update.mutate(
      { id: doc.id, data: { content: draftHtml } },
      {
        onSuccess: () => {
          setEditMode(false);
          setDraftHtml("");
          refresh();
        },
        onError: (err) => {
          const data = (err as unknown as { data?: { error?: string } })?.data;
          setSaveError(data?.error ?? "Couldn't save changes. Try again.");
        },
      },
    );
  };

  const submitRegenerate = () => {
    if (!doc || regenNotes.trim().length === 0) return;
    setRegenError(null);
    regenerate.mutate(
      { id: doc.id, data: { notes: regenNotes.trim() } },
      {
        onSuccess: () => {
          setRegenOpen(false);
          setRegenNotes("");
          setEditMode(false);
          refresh();
        },
        onError: (err) => {
          const data = (err as unknown as { data?: { error?: string } })?.data;
          setRegenError(data?.error ?? "Couldn't regenerate. Try again.");
        },
      },
    );
  };

  if (!id) return null;

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Document" subtitle="Loading…" />
        <div className="px-4 md:px-8 flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Loading document…
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div>
        <PageHeader title="Document" subtitle="Not found" />
        <div className="px-4 md:px-8">
          <Link
            href="/documents"
            className="inline-flex items-center gap-1.5 text-[13px] text-primary font-semibold"
          >
            <ArrowLeft size={14} /> Back to documents
          </Link>
          <div className="mt-4 text-[13px] text-muted-foreground">
            This document doesn't exist or you don't have access.
          </div>
        </div>
      </div>
    );
  }

  const status = doc.status;
  const isProposal = doc.type === "proposal";

  return (
    <div>
      <PageHeader
        title={doc.title}
        subtitle={`${doc.type} • ${relativeTime(doc.createdAt)}`}
      />
      <div className="px-4 md:px-8 max-w-5xl pb-24 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/documents"
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
            data-testid="link-back-documents"
          >
            <ArrowLeft size={13} /> Documents
          </Link>
          <span className="text-muted-foreground">•</span>
          <span
            className={cn(
              "text-[10px] uppercase font-bold px-2 py-0.5 rounded-full",
              status === "draft"
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                : status === "sent"
                  ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
            )}
            data-testid="text-status"
          >
            {status}
          </span>
          {doc.sentAt && (
            <span className="text-[11px] text-muted-foreground">
              sent {relativeTime(doc.sentAt)}
            </span>
          )}
          {editMode && (
            <span
              className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary"
              data-testid="text-edit-mode"
            >
              editing
            </span>
          )}
        </div>

        {!editMode && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handlePrint}
              disabled={!doc.content}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card border border-card-border text-[12.5px] font-semibold hover:border-primary/50 disabled:opacity-50"
              data-testid="button-print"
            >
              <Printer size={13} /> Print / Save PDF
            </button>
            {status === "draft" && (
              <>
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card border border-card-border text-[12.5px] font-semibold hover:border-primary/50"
                  data-testid="button-edit"
                >
                  <Pencil size={13} /> Edit
                </button>
                {isProposal && (
                  <button
                    onClick={() => {
                      setRegenError(null);
                      setRegenOpen((v) => !v);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card border border-card-border text-[12.5px] font-semibold hover:border-primary/50"
                    data-testid="button-toggle-regenerate"
                  >
                    <Sparkles size={13} /> Regenerate from notes
                  </button>
                )}
                <button
                  onClick={() => {
                    setEmailFlash(null);
                    sendEmail.mutate(
                      { id: doc.id, data: {} },
                      {
                        onSuccess: (res) => {
                          setEmailFlash({
                            kind: "ok",
                            text: `Sent to ${res.recipient}`,
                          });
                          refresh();
                        },
                        onError: (err) => {
                          const data = (err as unknown as { data?: { error?: string } })?.data;
                          const msg = data?.error ?? "Couldn't send via Gmail. Try again.";
                          setEmailFlash({ kind: "err", text: msg });
                        },
                      },
                    );
                  }}
                  disabled={sendEmail.isPending || !doc.content}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-[12.5px] font-semibold hover:bg-primary/90 disabled:opacity-60"
                  data-testid="button-send-gmail"
                >
                  {sendEmail.isPending ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Mail size={13} />
                  )}{" "}
                  Send via Gmail
                </button>
                <button
                  onClick={() =>
                    update.mutate({ id: doc.id, data: { status: "sent" } }, { onSettled: refresh })
                  }
                  disabled={update.isPending}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card border border-card-border text-[12.5px] font-semibold hover:border-primary/50 disabled:opacity-60"
                  data-testid="button-mark-sent"
                >
                  <Send size={13} /> Mark sent
                </button>
              </>
            )}
          </div>
        )}

        {editMode && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={saveEdit}
              disabled={update.isPending || draftHtml === (doc.content ?? "")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-[12.5px] font-semibold hover:bg-primary/90 disabled:opacity-60"
              data-testid="button-save-edit"
            >
              {update.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Save size={13} />
              )}{" "}
              Save changes
            </button>
            <button
              onClick={cancelEdit}
              disabled={update.isPending}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card border border-card-border text-[12.5px] font-semibold hover:border-primary/50 disabled:opacity-60"
              data-testid="button-cancel-edit"
            >
              <X size={13} /> Cancel
            </button>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          {!editMode && status === "sent" && (
            <button
              onClick={() =>
                update.mutate({ id: doc.id, data: { status: "approved" } }, { onSettled: refresh })
              }
              disabled={update.isPending}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 text-white text-[12.5px] font-semibold hover:bg-emerald-600 disabled:opacity-60"
              data-testid="button-mark-approved"
            >
              <CheckCircle2 size={13} /> Mark approved
            </button>
          )}
        </div>

        {emailFlash && (
          <div
            className={cn(
              "rounded-lg px-3 py-2 text-[12.5px] font-medium",
              emailFlash.kind === "ok"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-red-500/15 text-red-700 dark:text-red-300",
            )}
            data-testid="text-email-flash"
          >
            {emailFlash.text}
          </div>
        )}

        {saveError && (
          <div
            className="rounded-lg px-3 py-2 text-[12.5px] font-medium bg-red-500/15 text-red-700 dark:text-red-300"
            data-testid="text-save-error"
          >
            {saveError}
          </div>
        )}

        {regenOpen && !editMode && isProposal && status === "draft" && (
          <div className="rounded-2xl bg-card border border-card-border p-3 md:p-4 space-y-2">
            <div className="flex items-center gap-2 text-[12.5px] font-semibold">
              <Sparkles size={14} className="text-primary" /> Regenerate with revision notes
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              Tell Claude what to change (e.g. "tighten pricing to $12k flat, add a security
              section, drop the timeline section"). Claude rewrites the whole proposal using the
              same lead context plus your notes.
            </p>
            <textarea
              value={regenNotes}
              onChange={(e) => setRegenNotes(e.target.value)}
              placeholder="What should change?"
              rows={3}
              className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-[13px] focus:border-primary focus:outline-none resize-y"
              data-testid="textarea-regenerate-notes"
            />
            {regenError && (
              <div className="text-[12px] text-red-600 dark:text-red-400" data-testid="text-regenerate-error">
                {regenError}
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={submitRegenerate}
                disabled={regenerate.isPending || regenNotes.trim().length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-[12.5px] font-semibold hover:bg-primary/90 disabled:opacity-60"
                data-testid="button-submit-regenerate"
              >
                {regenerate.isPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Sparkles size={13} />
                )}{" "}
                Regenerate
              </button>
              <button
                onClick={() => {
                  setRegenOpen(false);
                  setRegenNotes("");
                  setRegenError(null);
                }}
                disabled={regenerate.isPending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card border border-card-border text-[12.5px] font-semibold hover:border-primary/50 disabled:opacity-60"
                data-testid="button-cancel-regenerate"
              >
                <X size={13} /> Cancel
              </button>
            </div>
          </div>
        )}

        {editMode ? (
          <div className="rounded-2xl bg-card border border-card-border overflow-hidden shadow-sm">
            <div className="px-3 py-2 border-b border-card-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Pencil size={12} /> HTML editor
            </div>
            <textarea
              value={draftHtml}
              onChange={(e) => setDraftHtml(e.target.value)}
              spellCheck={false}
              className="w-full bg-background font-mono text-[12.5px] leading-relaxed px-3 py-3 focus:outline-none resize-none"
              style={{ minHeight: "70vh", height: "75vh" }}
              data-testid="textarea-edit-html"
            />
          </div>
        ) : doc.content ? (
          <div className="rounded-2xl bg-white border border-card-border overflow-hidden shadow-sm">
            <iframe
              ref={iframeRef}
              title="Document preview"
              className="w-full bg-white"
              style={{ minHeight: "70vh", height: "80vh", border: "0" }}
              sandbox="allow-same-origin allow-modals"
              data-testid="iframe-document"
            />
          </div>
        ) : (
          <div className="rounded-2xl bg-card border border-card-border p-8 text-center text-muted-foreground text-[13px] flex flex-col items-center gap-2">
            <FileText size={24} />
            This document has no content yet.
          </div>
        )}
      </div>
    </div>
  );
}
