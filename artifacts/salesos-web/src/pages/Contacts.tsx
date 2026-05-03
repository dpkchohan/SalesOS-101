import { useState } from "react";
import { Link } from "wouter";
import {
  useListContacts,
  useCreateContact,
  useListDuplicateContacts,
  useMergeContacts,
  useDeduplicateContacts,
  getListContactsQueryKey,
  getListDuplicateContactsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, Briefcase, Mail, Phone, X, Users, Copy, Wand2, GitMerge, Check } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { ExportMenu } from "@/components/ExportMenu";
import { initials, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "all" | "duplicates";

export default function Contacts() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [mergeFor, setMergeFor] = useState<{ id: string; name: string; customerNo?: string | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const params = { search: search || undefined, page, limit: 25 };
  const { data, isLoading } = useListContacts(params, {
    query: { queryKey: getListContactsQueryKey(params), enabled: tab === "all" },
  });
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div>
      <PageHeader
        title="Contacts"
        subtitle={data ? `${data.total} in your book` : "Loading…"}
        right={
          <div className="flex items-center gap-2">
            <ExportMenu resource="contacts" testIdPrefix="contacts-export" />
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground font-semibold text-[13px] px-3.5 py-2 rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
              data-testid="button-newcontact"
            >
              <Plus size={15} /> New
            </button>
          </div>
        }
      />
      <div className="px-4 md:px-8 mb-3 flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-[12px]">
          <button
            onClick={() => setTab("all")}
            data-testid="tab-contacts-all"
            className={cn(
              "px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5",
              tab === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            <Users size={12} /> All
          </button>
          <button
            onClick={() => setTab("duplicates")}
            data-testid="tab-contacts-duplicates"
            className={cn(
              "px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5",
              tab === "duplicates" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            <Copy size={12} /> Duplicates
          </button>
        </div>
        {tab === "all" && (
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search by name, email, title, or CUST-000123…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full bg-card border border-card-border rounded-lg pl-9 pr-4 py-2.5 text-[14px] outline-none focus:border-primary transition-colors"
              data-testid="input-search-contacts"
            />
          </div>
        )}
      </div>
      {tab === "duplicates" ? (
        <DuplicatesPanel />
      ) : (
      <div className="px-4 md:px-8 space-y-1.5">
        {isLoading && <div className="text-muted-foreground text-[13px]">Loading…</div>}
        {data?.data.length === 0 && !isLoading && (
          <div className="text-center py-12 text-muted-foreground">
            <div className="text-[14px]">No contacts found.</div>
            <button
              onClick={() => setShowNew(true)}
              className="mt-3 text-primary font-semibold text-[13px] hover:underline"
            >
              Add your first contact
            </button>
          </div>
        )}
        <AnimatePresence>
          {data?.data.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.2) }}
            >
              <div className="relative group">
              <Link to={`/contacts/${c.id}`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-card border border-card-border hover:border-primary/40 transition-colors pr-12"
                  data-testid={`contact-${c.id}`}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/15 text-primary grid place-items-center font-bold text-[13px] flex-shrink-0">
                    {initials(c.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-[14px] truncate">{c.name}</div>
                      {c.customerNo && (
                        <span
                          className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary flex-shrink-0"
                          data-testid={`cust-badge-${c.id}`}
                        >
                          {c.customerNo}
                        </span>
                      )}
                      {c.title && (
                        <div className="text-[11px] text-muted-foreground truncate hidden md:block">
                          {c.title}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11.5px] text-muted-foreground mt-0.5">
                      {c.companyName && (
                        <span className="flex items-center gap-1 truncate">
                          <Briefcase size={10} /> {c.companyName}
                        </span>
                      )}
                      {c.email && (
                        <span className="flex items-center gap-1 truncate hidden md:flex">
                          <Mail size={10} /> {c.email}
                        </span>
                      )}
                      {c.phone && (
                        <span className="flex items-center gap-1 truncate hidden md:flex">
                          <Phone size={10} /> {c.phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground flex-shrink-0">
                    {relativeTime(c.createdAt)}
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMergeFor({ id: c.id, name: c.name, customerNo: c.customerNo });
                  }}
                  title="Merge into another contact"
                  data-testid={`button-merge-${c.id}`}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors md:opacity-0 md:group-hover:opacity-100"
                >
                  <GitMerge size={15} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {data && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 text-[12px] rounded-md border border-card-border disabled:opacity-40"
            >
              Prev
            </button>
            <span className="text-[12px] text-muted-foreground">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 text-[12px] rounded-md border border-card-border disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
      )}
      {showNew && <NewContactDialog onClose={() => setShowNew(false)} />}
      {mergeFor && (
        <MergeDialog
          duplicate={mergeFor}
          onClose={() => setMergeFor(null)}
          onMerged={(primaryName) => {
            setMergeFor(null);
            setToast(`Merged "${mergeFor.name}" into "${primaryName}".`);
            setTimeout(() => setToast(null), 4000);
          }}
        />
      )}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg bg-foreground text-background text-[13px] font-medium shadow-lg flex items-center gap-2"
          data-testid="merge-toast"
        >
          <Check size={14} /> {toast}
        </div>
      )}
    </div>
  );
}

function MergeDialog({
  duplicate,
  onClose,
  onMerged,
}: {
  duplicate: { id: string; name: string; customerNo?: string | null };
  onClose: () => void;
  onMerged: (primaryName: string) => void;
}) {
  const qc = useQueryClient();
  const merge = useMergeContacts();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const params = { search: search || undefined, page: 1, limit: 10 };
  const { data, isLoading } = useListContacts(params, {
    query: { queryKey: getListContactsQueryKey(params) },
  });
  const candidates = (data?.data ?? []).filter((c) => c.id !== duplicate.id);

  const doMerge = () => {
    if (!selected) return;
    setError(null);
    merge.mutate(
      { data: { primaryId: selected.id, duplicateId: duplicate.id, reason: "manual-merge" } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
          qc.invalidateQueries({ queryKey: getListDuplicateContactsQueryKey() });
          onMerged(selected.name);
        },
        onError: (e: unknown) => {
          setError(e instanceof Error ? e.message : "Merge failed.");
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm grid place-items-end md:place-items-center p-0 md:p-4">
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-card w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5 border border-card-border"
        data-testid="merge-dialog"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[16px] font-bold tracking-tight">Merge contact</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-muted">
            <X size={16} />
          </button>
        </div>
        <div className="text-[12.5px] text-muted-foreground mb-3">
          Merging{" "}
          <span className="font-semibold text-foreground">{duplicate.name}</span>
          {duplicate.customerNo && (
            <span className="ml-1 font-mono text-[10px] px-1 py-0.5 rounded bg-muted">
              {duplicate.customerNo}
            </span>
          )}{" "}
          into the contact you pick below. Leads and notes follow the primary; the
          duplicate is hidden from your list.
        </div>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            autoFocus
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelected(null);
            }}
            placeholder="Search by name, email, or CUST-…"
            data-testid="input-merge-search"
            className="w-full bg-muted border border-card-border rounded-lg pl-9 pr-3 py-2 text-[13px] outline-none focus:border-primary"
          />
        </div>
        <div className="max-h-64 overflow-y-auto space-y-1 mb-3" data-testid="merge-candidates">
          {isLoading && (
            <div className="text-[12px] text-muted-foreground p-2">Loading…</div>
          )}
          {!isLoading && candidates.length === 0 && (
            <div className="text-[12px] text-muted-foreground p-2">
              No other contacts match.
            </div>
          )}
          {candidates.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected({ id: c.id, name: c.name })}
              data-testid={`merge-candidate-${c.id}`}
              className={cn(
                "w-full flex items-center gap-2 p-2 rounded-md text-left text-[13px] transition-colors",
                selected?.id === c.id
                  ? "bg-primary/15 border border-primary/40"
                  : "hover:bg-muted border border-transparent",
              )}
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary grid place-items-center font-bold text-[11px] flex-shrink-0">
                {initials(c.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold truncate">{c.name}</span>
                  {c.customerNo && (
                    <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-muted text-muted-foreground">
                      {c.customerNo}
                    </span>
                  )}
                </div>
                {c.email && (
                  <div className="text-[11px] text-muted-foreground truncate">{c.email}</div>
                )}
              </div>
              {selected?.id === c.id && <Check size={14} className="text-primary" />}
            </button>
          ))}
        </div>
        {error && (
          <div className="text-[12px] text-rose-600 mb-2" data-testid="merge-error">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={doMerge}
          disabled={!selected || merge.isPending}
          data-testid="button-confirm-merge"
          className={cn(
            "w-full bg-primary text-primary-foreground font-semibold text-[13px] py-2.5 rounded-lg",
            "hover:bg-primary/90 transition-colors disabled:opacity-50",
          )}
        >
          {merge.isPending
            ? "Merging…"
            : selected
              ? `Merge into ${selected.name}`
              : "Pick a primary contact"}
        </button>
      </motion.div>
    </div>
  );
}

function DuplicatesPanel() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useListDuplicateContacts();
  const merge = useMergeContacts();
  const dedupe = useDeduplicateContacts();
  const [running, setRunning] = useState(false);
  const runAuto = async () => {
    setRunning(true);
    try {
      await dedupe.mutateAsync({ data: { apply: true } });
      qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
      qc.invalidateQueries({ queryKey: getListDuplicateContactsQueryKey() });
      await refetch();
    } finally {
      setRunning(false);
    }
  };
  return (
    <div className="px-4 md:px-8 space-y-3" data-testid="duplicates-panel">
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-muted-foreground">
          {isLoading
            ? "Scanning…"
            : `${data?.data.length ?? 0} duplicate(s) merged into a primary contact.`}
        </div>
        <button
          onClick={runAuto}
          disabled={running}
          data-testid="button-run-dedupe"
          className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Wand2 size={12} /> {running ? "Auto-merging…" : "Auto-merge by email/phone"}
        </button>
      </div>
      {!isLoading && (data?.data.length ?? 0) === 0 && (
        <div className="text-center py-12 text-muted-foreground text-[13px]">
          No duplicate contacts on file.
        </div>
      )}
      {data?.data.map((d) => (
        <div
          key={d.id}
          className="rounded-xl bg-card border border-card-border p-4"
          data-testid={`duplicate-row-${d.id}`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[14px] truncate">{d.name}</span>
                {d.customerNo && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {d.customerNo}
                  </span>
                )}
              </div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5 truncate">
                {d.email ?? "—"} {d.phone && `· ${d.phone}`} ·{" "}
                {d.mergedReason ?? "merged"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Merged into
              </div>
              {d.primary ? (
                <Link
                  to={`/contacts/${d.primary.id}`}
                  className="text-[13px] font-semibold text-primary hover:underline"
                >
                  {d.primary.name}
                  {d.primary.customerNo && (
                    <span className="ml-1 text-[10px] font-mono text-muted-foreground">
                      {d.primary.customerNo}
                    </span>
                  )}
                </Link>
              ) : (
                <span className="text-[12px] text-muted-foreground">—</span>
              )}
            </div>
          </div>
        </div>
      ))}
      <div className="text-[11px] text-muted-foreground italic pt-1">
        Merging is soft — duplicates stay in the database with a pointer to the
        primary contact.
      </div>
    </div>
  );
  void merge;
}

function NewContactDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const create = useCreateContact();
  const [form, setForm] = useState({ name: "", email: "", phone: "", title: "" });
  const [duplicate, setDuplicate] = useState<{
    matchedField: string;
    existing: { id: string; name: string; customerNo?: string | null; email?: string | null };
  } | null>(null);

  const doCreate = (force: boolean) => {
    create.mutate(
      {
        data: {
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          title: form.title || null,
          ...(force ? { force: true } : {}),
        },
      },
      {
        onSuccess: (resp: unknown) => {
          if (resp && typeof resp === "object" && "duplicateDetected" in resp && (resp as { duplicateDetected?: boolean }).duplicateDetected) {
            const r = resp as unknown as {
              matchedField: string;
              existing: { id: string; name: string; customerNo?: string | null; email?: string | null };
            };
            setDuplicate({ matchedField: r.matchedField, existing: r.existing });
            return;
          }
          qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
          onClose();
        },
      },
    );
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    setDuplicate(null);
    doCreate(false);
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
          <h2 className="text-[17px] font-bold tracking-tight">New contact</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-muted">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3">
          <Field label="Name" required>
            <input
              required
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              data-testid="input-contact-name"
              className={inputCls}
            />
          </Field>
          <Field label="Title">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Phone">
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
          </Field>
        </div>
        {duplicate && (
          <div
            className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-[12.5px]"
            data-testid="duplicate-warning"
          >
            <div className="font-semibold text-amber-300">
              Possible duplicate by {duplicate.matchedField}
            </div>
            <div className="text-amber-200/90 mt-1">
              {duplicate.existing.name}
              {duplicate.existing.customerNo && (
                <span className="ml-1 font-mono">{duplicate.existing.customerNo}</span>
              )}
              {duplicate.existing.email && <span className="ml-1">· {duplicate.existing.email}</span>}
            </div>
            <div className="flex gap-2 mt-2">
              <Link
                to={`/contacts/${duplicate.existing.id}`}
                className="text-[12px] font-semibold px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
                onClick={onClose}
              >
                Open existing
              </Link>
              <button
                type="button"
                onClick={() => doCreate(true)}
                data-testid="button-force-create-contact"
                className="text-[12px] font-semibold px-2.5 py-1 rounded-md border border-amber-500/40 text-amber-200 hover:bg-amber-500/10"
              >
                Create anyway
              </button>
            </div>
          </div>
        )}
        <button
          type="submit"
          disabled={create.isPending || !form.name}
          className={cn(
            "mt-5 w-full bg-primary text-primary-foreground font-semibold text-[14px] py-2.5 rounded-lg",
            "hover:bg-primary/90 transition-colors disabled:opacity-50",
          )}
          data-testid="button-save-contact"
        >
          {create.isPending ? "Saving…" : duplicate ? "Try again" : "Save contact"}
        </button>
      </motion.form>
    </div>
  );
}

const inputCls =
  "w-full bg-background border border-input rounded-md px-3 py-2 text-[14px] outline-none focus:border-primary transition-colors";

export function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label} {required && <span className="text-primary">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
