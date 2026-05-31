import { useState, useEffect, useRef } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  useGetContact,
  useUpdateContact,
  useDeleteContact,
  useGetRelatedContacts,
  getGetRelatedContactsQueryKey,
  getGetContactQueryKey,
  getListContactsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { motion } from "framer-motion";
import { ArrowLeft, Mail, Phone, Briefcase, Pencil, Trash2, MessageSquare, StickyNote } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Field } from "./Contacts";
import { CompanyCombobox, TagsInput } from "@/components/ContactFormFields";
import { formatCurrency, initials, relativeTime, STAGE_META } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getApiUrl } from "@/lib/api";

export default function ContactDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const { getToken } = useAuth();
  const { data, isLoading } = useGetContact(id, {
    query: { enabled: !!id, queryKey: getGetContactQueryKey(id) },
  });
  const [, navigate] = useLocation();
  const update = useUpdateContact();
  const del = useDeleteContact();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  // Notes state
  const [notesText, setNotesText] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesEditing, setNotesEditing] = useState(false);
  const notesInitialRef = useRef<string>("");
  useEffect(() => {
    if (data) {
      const initial = data.notes ?? "";
      setNotesText(initial);
      notesInitialRef.current = initial;
    }
  }, [data]);

  const showToast = (msg: string, error = false) => {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 4000);
  };

  const doDelete = () => {
    del.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
          navigate("/contacts");
        },
        onError: () => showToast("Failed to delete contact. Please try again.", true),
      },
    );
  };
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    title: "",
    companyId: null as string | null,
    companyName: "",
    tags: [] as string[],
    notes: "",
  });

  const startEdit = () => {
    if (!data) return;
    setForm({
      name: data.name,
      email: data.email ?? "",
      phone: data.phone ?? "",
      title: data.title ?? "",
      companyId: data.company?.id ?? null,
      companyName: data.company?.name ?? "",
      tags: data.tags ?? [],
      notes: data.notes ?? "",
    });
    setEditing(true);
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      {
        id,
        data: {
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          title: form.title || null,
          companyId: form.companyId || null,
          notes: form.notes || null,
          tags: form.tags,
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetContactQueryKey(id) });
          setEditing(false);
        },
      },
    );
  };

  const saveNotes = async (value: string) => {
    if (value === notesInitialRef.current) return;
    setNotesSaving(true);
    try {
      const token = await getToken();
      await fetch(getApiUrl(`/api/contacts/${id}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ notes: value || null }),
      });
      notesInitialRef.current = value;
      qc.invalidateQueries({ queryKey: getGetContactQueryKey(id) });
    } catch {
      showToast("Failed to save notes", true);
    } finally {
      setNotesSaving(false);
      setNotesEditing(false);
    }
  };

  if (isLoading) return <div className="px-4 md:px-8 pt-8 text-muted-foreground">Loading…</div>;
  if (!data) return <div className="px-4 md:px-8 pt-8">Contact not found.</div>;

  return (
    <div>
      <div className="px-4 md:px-8 pt-5 md:pt-8">
        <Link to="/contacts" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
            <ArrowLeft size={13} /> All contacts
          </Link>
      </div>
      <PageHeader
        title={
          <span className="flex items-center gap-2 flex-wrap">
            <span>{data.name}</span>
            {data.customerNo && (
              <span
                className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary"
                data-testid="contact-cust-badge"
              >
                {data.customerNo}
              </span>
            )}
          </span>
        }
        subtitle={data.title ?? "Contact"}
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-card-border hover:bg-muted"
              data-testid="button-edit-contact"
            >
              <Pencil size={12} /> Edit
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-rose-500/40 text-rose-500 hover:bg-rose-500/10"
              data-testid="button-delete-contact"
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        }
      />
      <div className="px-4 md:px-8 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:col-span-1 space-y-4"
        >
          <div className="rounded-2xl bg-card border border-card-border p-5">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-primary/15 text-primary grid place-items-center font-bold text-[18px]">
                {initials(data.name)}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-[16px] truncate">{data.name}</div>
                {data.title && <div className="text-[12px] text-muted-foreground truncate">{data.title}</div>}
              </div>
            </div>
            <div className="mt-4 space-y-2 text-[13px]">
              {data.email && (
                <div className="flex items-center gap-2">
                  <Mail size={13} className="text-muted-foreground" />
                  <a href={`mailto:${data.email}`} className="text-primary hover:underline truncate">
                    {data.email}
                  </a>
                </div>
              )}
              {data.phone && (
                <div className="flex items-center gap-2">
                  <Phone size={13} className="text-muted-foreground" />
                  <a href={`tel:${data.phone}`} className="text-primary hover:underline">
                    {data.phone}
                  </a>
                </div>
              )}
              {data.company && (
                <div className="flex items-center gap-2">
                  <Briefcase size={13} className="text-muted-foreground" />
                  <span>{data.company.name}</span>
                </div>
              )}
            </div>
            {(data.tags?.length ?? 0) > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {data.tags?.map((t) => (
                  <span key={t} className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Notes Card */}
          <div className="rounded-2xl bg-card border border-card-border p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <StickyNote size={13} /> Notes
              </h2>
              {!notesEditing && (
                <button
                  onClick={() => setNotesEditing(true)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit notes"
                >
                  <Pencil size={13} />
                </button>
              )}
              {notesSaving && (
                <span className="text-[11px] text-muted-foreground">Saving…</span>
              )}
            </div>
            {notesEditing ? (
              <textarea
                autoFocus
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                onBlur={() => saveNotes(notesText)}
                rows={5}
                placeholder="Add notes about this contact…"
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-primary resize-none"
              />
            ) : (
              <div
                onClick={() => setNotesEditing(true)}
                className={cn(
                  "text-[13px] leading-relaxed whitespace-pre-wrap cursor-text min-h-[40px]",
                  notesText ? "text-foreground" : "text-muted-foreground italic",
                )}
              >
                {notesText || "No notes yet. Click to add."}
              </div>
            )}
          </div>

          <RelatedPanel id={id} />

          {/* Chat link */}
          <Link
            to={`/chat?contactId=${id}&contactName=${encodeURIComponent(data.name)}`}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-card border border-card-border hover:bg-muted transition-colors text-[13px] font-semibold"
          >
            <MessageSquare size={14} className="text-primary" />
            Chat with AI about {data.name.split(" ")[0]}
          </Link>

          <div className="rounded-2xl bg-card border border-card-border p-5">
            <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Leads ({data.leads.length})
            </h2>
            <div className="space-y-2">
              {data.leads.length === 0 && <div className="text-[12px] text-muted-foreground">No leads yet.</div>}
              {data.leads.map((l) => (
                <Link key={l.id} to={`/leads/${l.id}`} className="block p-2.5 rounded-lg bg-muted/40 hover:bg-muted transition-colors">
                    <div className="flex items-center justify-between">
                      <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full", STAGE_META[l.stage].tone)}>
                        {STAGE_META[l.stage].label}
                      </span>
                      <span className="text-[13px] font-bold tracking-tight">
                        {formatCurrency(l.valueUsd, l.currency)}
                      </span>
                    </div>
                    {l.source && (
                      <div className="text-[11px] text-muted-foreground mt-1">via {l.source}</div>
                    )}
                  </Link>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="md:col-span-2 space-y-4"
        >
          <div className="rounded-2xl bg-card border border-card-border p-5">
          <h2 className="text-[15px] font-bold tracking-tight mb-4">Recent interactions</h2>
          <div className="space-y-3">
            {data.interactions.length === 0 && (
              <div className="text-[13px] text-muted-foreground italic py-6 text-center">
                No interactions logged for this contact yet.
              </div>
            )}
            {data.interactions.map((i, idx) => (
              <motion.div
                key={i.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.04 }}
                className="border-l-2 border-primary/40 pl-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    {i.type}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{relativeTime(i.createdAt)}</span>
                </div>
                <div className="text-[13.5px] leading-snug">{i.gist}</div>
              </motion.div>
            ))}
          </div>
          </div>

          {/* Chat History */}
          <ChatHistoryPanel contactId={id} contactName={data.name} />
        </motion.div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm grid place-items-end md:place-items-center p-0 md:p-4">
          <motion.form
            onSubmit={save}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-card w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5 border border-card-border max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-[17px] font-bold tracking-tight mb-4">Edit contact</h2>
            <div className="space-y-3">
              <Field label="Name" required>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-background border border-input rounded-md px-3 py-2 text-[14px] outline-none focus:border-primary"
                />
              </Field>
              <Field label="Title">
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full bg-background border border-input rounded-md px-3 py-2 text-[14px] outline-none focus:border-primary"
                />
              </Field>
              <Field label="Company">
                <CompanyCombobox
                  value={form.companyId}
                  valueName={form.companyName}
                  onChange={(id, name) => setForm({ ...form, companyId: id, companyName: name })}
                />
              </Field>
              <Field label="Email">
                <input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-background border border-input rounded-md px-3 py-2 text-[14px] outline-none focus:border-primary"
                />
              </Field>
              <Field label="Phone">
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full bg-background border border-input rounded-md px-3 py-2 text-[14px] outline-none focus:border-primary"
                />
              </Field>
              <Field label="Tags">
                <TagsInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} />
              </Field>
              <Field label="Notes">
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={4}
                  placeholder="Add notes about this contact…"
                  className="w-full bg-background border border-input rounded-md px-3 py-2 text-[14px] outline-none focus:border-primary resize-none"
                />
              </Field>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex-1 py-2.5 rounded-lg border border-card-border text-[14px] font-semibold hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={update.isPending}
                className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-[14px] font-semibold hover:bg-primary/90 disabled:opacity-50"
              >
                {update.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </motion.form>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm grid place-items-end md:place-items-center p-0 md:p-4">
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-card w-full md:max-w-sm rounded-t-2xl md:rounded-2xl p-5 border border-card-border"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-rose-500/15 grid place-items-center flex-shrink-0">
                <Trash2 size={16} className="text-rose-500" />
              </div>
              <h2 className="text-[16px] font-bold tracking-tight">Delete contact?</h2>
            </div>
            <p className="text-[13px] text-muted-foreground mb-5">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">{data.name}</span>? This
              action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={del.isPending}
                className="flex-1 py-2.5 rounded-lg border border-card-border text-[14px] font-semibold hover:bg-muted disabled:opacity-50"
                data-testid="button-cancel-delete"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doDelete}
                disabled={del.isPending}
                className="flex-1 py-2.5 rounded-lg bg-rose-600 text-white text-[14px] font-semibold hover:bg-rose-700 disabled:opacity-50"
                data-testid="button-confirm-delete"
              >
                {del.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {toast && (
        <div
          className={cn(
            "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg text-[13px] font-medium shadow-lg",
            toast.error
              ? "bg-rose-600 text-white"
              : "bg-foreground text-background",
          )}
          data-testid="contact-toast"
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function RelatedPanel({ id }: { id: string }) {
  const { data, isLoading } = useGetRelatedContacts(id, {
    query: { enabled: !!id, queryKey: getGetRelatedContactsQueryKey(id) },
  });
  if (isLoading) return null;
  if (!data) return null;
  const total =
    data.duplicates.length + data.sameCompany.length + data.sameDomain.length;
  if (total === 0) return null;
  return (
    <div className="rounded-2xl bg-card border border-card-border p-5" data-testid="related-panel">
      <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
        Related ({total})
      </h2>
      {data.duplicates.length > 0 && (
        <RelatedSection label="Merged duplicates" rows={data.duplicates} testid="related-duplicates" muted />
      )}
      {data.sameCompany.length > 0 && (
        <RelatedSection label="Same company" rows={data.sameCompany} testid="related-same-company" />
      )}
      {data.sameDomain.length > 0 && (
        <RelatedSection label="Same email domain" rows={data.sameDomain} testid="related-same-domain" />
      )}
    </div>
  );
}

function RelatedSection({
  label,
  rows,
  testid,
  muted,
}: {
  label: string;
  rows: { id: string; name: string; customerNo?: string | null; email?: string | null }[];
  testid: string;
  muted?: boolean;
}) {
  return (
    <div className="mt-3" data-testid={testid}>
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}
      </div>
      <div className="space-y-1.5">
        {rows.slice(0, 6).map((c) => (
          <Link
            key={c.id}
            to={`/contacts/${c.id}`}
            className={cn(
              "flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md",
              muted ? "bg-muted/30 hover:bg-muted/60" : "bg-muted/40 hover:bg-muted",
            )}
          >
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold truncate">{c.name}</div>
              {c.email && (
                <div className="text-[10.5px] text-muted-foreground truncate">{c.email}</div>
              )}
            </div>
            {c.customerNo && (
              <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">
                {c.customerNo}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

type ChatSession = { id: string; createdAt: string; preview?: string | null };

function ChatHistoryPanel({ contactId, contactName }: { contactId: string; contactName: string }) {
  const { getToken } = useAuth();
  const { data, isLoading } = useQuery<ChatSession[]>({
    queryKey: ["contact-chat-sessions", contactId],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(getApiUrl(`/api/contacts/${contactId}/chat-sessions`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!contactId,
  });

  return (
    <div className="rounded-2xl bg-card border border-card-border p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <MessageSquare size={13} /> Chat History
        </h2>
        <Link
          to={`/chat?contactId=${contactId}&contactName=${encodeURIComponent(contactName)}`}
          className="text-[11px] font-semibold text-primary hover:underline"
        >
          + New chat
        </Link>
      </div>
      {isLoading && <div className="text-[12px] text-muted-foreground">Loading…</div>}
      {!isLoading && (!data || data.length === 0) && (
        <div className="text-[12px] text-muted-foreground italic">No chat sessions yet.</div>
      )}
      <div className="space-y-1.5">
        {data?.map((s) => (
          <Link
            key={s.id}
            to={`/chat?sessionId=${s.id}&contactId=${contactId}&contactName=${encodeURIComponent(contactName)}`}
            className="flex items-start gap-2 px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted transition-colors"
          >
            <MessageSquare size={12} className="text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-[12px] text-muted-foreground">{relativeTime(s.createdAt)}</div>
              {s.preview && (
                <div className="text-[12.5px] truncate mt-0.5">{s.preview}</div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
