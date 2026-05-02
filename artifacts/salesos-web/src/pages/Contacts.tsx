import { useState } from "react";
import { Link } from "wouter";
import {
  useListContacts,
  useCreateContact,
  getListContactsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, Briefcase, Mail, Phone, X } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { ExportMenu } from "@/components/ExportMenu";
import { initials, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Contacts() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(false);
  const params = { search: search || undefined, page, limit: 25 };
  const { data, isLoading } = useListContacts(params, {
    query: { queryKey: getListContactsQueryKey(params) },
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
      <div className="px-4 md:px-8 mb-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search by name, email, title…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full bg-card border border-card-border rounded-lg pl-9 pr-4 py-2.5 text-[14px] outline-none focus:border-primary transition-colors"
            data-testid="input-search-contacts"
          />
        </div>
      </div>
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
              <Link to={`/contacts/${c.id}`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-card border border-card-border hover:border-primary/40 transition-colors"
                  data-testid={`contact-${c.id}`}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/15 text-primary grid place-items-center font-bold text-[13px] flex-shrink-0">
                    {initials(c.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-[14px] truncate">{c.name}</div>
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
      {showNew && <NewContactDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewContactDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const create = useCreateContact();
  const [form, setForm] = useState({ name: "", email: "", phone: "", title: "" });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    create.mutate(
      { data: { name: form.name, email: form.email || null, phone: form.phone || null, title: form.title || null } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
          onClose();
        },
      },
    );
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
        <button
          type="submit"
          disabled={create.isPending || !form.name}
          className={cn(
            "mt-5 w-full bg-primary text-primary-foreground font-semibold text-[14px] py-2.5 rounded-lg",
            "hover:bg-primary/90 transition-colors disabled:opacity-50",
          )}
          data-testid="button-save-contact"
        >
          {create.isPending ? "Saving…" : "Save contact"}
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
