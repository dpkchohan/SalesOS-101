import { Link, useParams } from "wouter";
import {
  useGetContact,
  useUpdateContact,
  getGetContactQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Mail, Phone, Briefcase, Pencil } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Field } from "./Contacts";
import { formatCurrency, initials, relativeTime, STAGE_META } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function ContactDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const { data, isLoading } = useGetContact(id, {
    query: { enabled: !!id, queryKey: getGetContactQueryKey(id) },
  });
  const update = useUpdateContact();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", title: "" });

  const startEdit = () => {
    if (!data) return;
    setForm({
      name: data.name,
      email: data.email ?? "",
      phone: data.phone ?? "",
      title: data.title ?? "",
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
        title={data.name}
        subtitle={data.title ?? "Contact"}
        right={
          <button
            onClick={startEdit}
            className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-card-border hover:bg-muted"
            data-testid="button-edit-contact"
          >
            <Pencil size={12} /> Edit
          </button>
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
          className="md:col-span-2 rounded-2xl bg-card border border-card-border p-5"
        >
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
        </motion.div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm grid place-items-end md:place-items-center p-0 md:p-4">
          <motion.form
            onSubmit={save}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-card w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5 border border-card-border"
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
    </div>
  );
}
