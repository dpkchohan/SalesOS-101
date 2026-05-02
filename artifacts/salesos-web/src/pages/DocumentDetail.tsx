import { useEffect, useRef } from "react";
import { useRoute, Link } from "wouter";
import {
  useGetDocument,
  useUpdateDocument,
  getListDocumentsQueryKey,
  getGetDocumentQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Printer, Send, CheckCircle2, Loader2, FileText } from "lucide-react";
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
  const qc = useQueryClient();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
    if (id) qc.invalidateQueries({ queryKey: getGetDocumentQueryKey(id) });
  };

  useEffect(() => {
    if (!iframeRef.current || !doc?.content) return;
    const iframe = iframeRef.current;
    iframe.srcdoc = doc.content;
  }, [doc?.content]);

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
        </div>

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
            <button
              onClick={() =>
                update.mutate({ id: doc.id, data: { status: "sent" } }, { onSettled: refresh })
              }
              disabled={update.isPending}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-[12.5px] font-semibold hover:bg-primary/90 disabled:opacity-60"
              data-testid="button-mark-sent"
            >
              <Send size={13} /> Mark sent
            </button>
          )}
          {status === "sent" && (
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

        {doc.content ? (
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
