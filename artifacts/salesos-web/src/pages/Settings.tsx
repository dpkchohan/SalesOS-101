import { useEffect, useRef, useState } from "react";
import {
  useGetMe,
  useGetCompanyCredentials,
  useUpsertCompanyCredentials,
  useGetCalendarStatus,
  getGetCompanyCredentialsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useClerk, useUser } from "@clerk/react";
import {
  LogOut,
  Building2,
  Mail,
  User,
  ShieldCheck,
  Calendar,
  Image as ImageIcon,
  Save,
  Loader2,
  Check,
  Palette,
} from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "account" | "company";

export default function Settings() {
  const [tab, setTab] = useState<Tab>("account");
  return (
    <div>
      <PageHeader title="Settings" subtitle="Account & branding" />
      <div className="px-4 md:px-8 max-w-2xl">
        <div className="flex gap-1.5 mb-4 border-b border-card-border">
          <TabBtn active={tab === "account"} onClick={() => setTab("account")} testId="tab-account">
            Account
          </TabBtn>
          <TabBtn active={tab === "company"} onClick={() => setTab("company")} testId="tab-company">
            Company
          </TabBtn>
        </div>
        {tab === "account" ? <AccountTab /> : <CompanyTab />}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "px-4 py-2.5 text-[13px] font-bold uppercase tracking-wider transition-colors -mb-px border-b-2",
        active
          ? "text-primary border-primary"
          : "text-muted-foreground border-transparent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function AccountTab() {
  const { data, isLoading } = useGetMe();
  const { user } = useUser();
  const { signOut } = useClerk();

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-card border border-card-border p-5">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground grid place-items-center font-bold text-[20px]">
            {initials(user?.fullName ?? user?.primaryEmailAddress?.emailAddress)}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-[16px] truncate">{user?.fullName ?? "—"}</div>
            <div className="text-[12px] text-muted-foreground truncate">
              {user?.primaryEmailAddress?.emailAddress ?? ""}
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-2 text-[13px]">
          <Row icon={<User size={13} />} label="Display name" value={data?.name ?? "—"} />
          <Row icon={<Mail size={13} />} label="Email" value={data?.email ?? "—"} />
          <Row icon={<Building2 size={13} />} label="Workspace" value={data?.orgName ?? "—"} />
          <Row icon={<ShieldCheck size={13} />} label="Role" value={data?.role ?? "—"} />
        </div>
      </div>
      <CalendarStatusCard />
      <button
        onClick={() => signOut()}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-card border border-card-border text-rose-600 dark:text-rose-400 font-semibold text-[14px] hover:bg-rose-500/5 transition-colors"
        data-testid="button-signout"
      >
        <LogOut size={15} /> Sign out
      </button>
      {isLoading && <div className="text-[12px] text-muted-foreground">Loading account…</div>}
    </div>
  );
}

function CalendarStatusCard() {
  const { data, isLoading } = useGetCalendarStatus({
    query: { staleTime: 60_000, refetchOnWindowFocus: false },
  });
  const connected = data?.connected === true;
  return (
    <div
      className="rounded-2xl bg-card border border-card-border p-5"
      data-testid="card-calendar-status"
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-bold mb-3">
        <Calendar size={14} /> Integrations
      </div>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-xl grid place-items-center flex-shrink-0",
            connected
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Calendar size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[14px]">Google Calendar</div>
          <div className="text-[12px] text-muted-foreground mt-0.5">
            {isLoading
              ? "Checking…"
              : connected
                ? `Connected${data?.email ? ` as ${data.email}` : ""}. Tasks with a due date sync automatically.`
                : "Not connected. Open the Replit Integrations panel to authorize Google Calendar."}
          </div>
        </div>
        <span
          className={cn(
            "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex-shrink-0",
            connected
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "bg-muted text-muted-foreground",
          )}
          data-testid="badge-calendar-status"
        >
          {isLoading ? "…" : connected ? "Connected" : "Off"}
        </span>
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground w-24 text-[12px]">{label}</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  );
}

interface FormState {
  companyName: string;
  companyLogoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  footerText: string;
  website: string;
  phone: string;
  email: string;
  address: string;
  taxId: string;
}

const EMPTY: FormState = {
  companyName: "",
  companyLogoUrl: "",
  primaryColor: "#F94D00",
  secondaryColor: "#7C3AED",
  accentColor: "#06B6D4",
  footerText: "",
  website: "",
  phone: "",
  email: "",
  address: "",
  taxId: "",
};

function CompanyTab() {
  const { data, isLoading } = useGetCompanyCredentials();
  const upsert = useUpsertCompanyCredentials();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!data) return;
    setForm({
      companyName: data.companyName ?? "",
      companyLogoUrl: data.companyLogoUrl ?? "",
      primaryColor: data.primaryColor ?? "#F94D00",
      secondaryColor: data.secondaryColor ?? "#7C3AED",
      accentColor: data.accentColor ?? "#06B6D4",
      footerText: data.footerText ?? "",
      website: data.website ?? "",
      phone: data.phone ?? "",
      email: data.email ?? "",
      address: data.address ?? "",
      taxId: data.taxId ?? "",
    });
  }, [data]);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const onFile = async (file: File) => {
    setLogoError(null);
    if (!file.type.startsWith("image/")) {
      setLogoError("Please choose an image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("Logo must be under 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") update("companyLogoUrl", result);
    };
    reader.onerror = () => setLogoError("Failed to read file.");
    reader.readAsDataURL(file);
  };

  const onSave = () => {
    setSavedAt(null);
    upsert.mutate(
      {
        data: {
          companyName: form.companyName.trim() || null,
          companyLogoUrl: form.companyLogoUrl || null,
          primaryColor: form.primaryColor,
          secondaryColor: form.secondaryColor,
          accentColor: form.accentColor,
          footerText: form.footerText.trim() || null,
          website: form.website.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          address: form.address.trim() || null,
          taxId: form.taxId.trim() || null,
        },
      },
      {
        onSuccess: () => {
          setSavedAt(Date.now());
          qc.invalidateQueries({ queryKey: getGetCompanyCredentialsQueryKey() });
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground py-8">
        <Loader2 size={14} className="animate-spin" /> Loading branding…
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <SectionCard title="Identity" icon={<Building2 size={14} />}>
        <Field label="Company name">
          <input
            value={form.companyName}
            onChange={(e) => update("companyName", e.target.value)}
            placeholder="Acme Inc."
            data-testid="input-company-name"
            className="branding-input"
          />
        </Field>
        <Field label="Logo">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-20 h-20 rounded-xl bg-muted/40 border border-card-border grid place-items-center overflow-hidden flex-shrink-0">
              {form.companyLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.companyLogoUrl}
                  alt="Logo preview"
                  className="w-full h-full object-contain"
                />
              ) : (
                <ImageIcon size={20} className="text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
                data-testid="input-logo-file"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-primary/10 text-primary hover:bg-primary/20"
                data-testid="button-upload-logo"
              >
                Upload logo
              </button>
              {form.companyLogoUrl && (
                <button
                  type="button"
                  onClick={() => update("companyLogoUrl", "")}
                  className="px-3 py-1.5 text-[11px] font-semibold rounded-md text-muted-foreground hover:text-rose-600"
                  data-testid="button-remove-logo"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          {logoError && <div className="text-[11px] text-rose-600 mt-1.5">{logoError}</div>}
          <div className="text-[11px] text-muted-foreground mt-1.5">
            PNG/JPG/SVG, under 2MB. Used in proposal headers.
          </div>
        </Field>
      </SectionCard>

      <SectionCard title="Brand colors" icon={<Palette size={14} />}>
        <ColorField
          label="Primary"
          value={form.primaryColor}
          onChange={(v) => update("primaryColor", v)}
          testId="color-primary"
        />
        <ColorField
          label="Secondary"
          value={form.secondaryColor}
          onChange={(v) => update("secondaryColor", v)}
          testId="color-secondary"
        />
        <ColorField
          label="Accent"
          value={form.accentColor}
          onChange={(v) => update("accentColor", v)}
          testId="color-accent"
        />
      </SectionCard>

      <SectionCard title="Contact details" icon={<Mail size={14} />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Website">
            <input
              value={form.website}
              onChange={(e) => update("website", e.target.value)}
              placeholder="https://acme.com"
              data-testid="input-website"
              className="branding-input"
            />
          </Field>
          <Field label="Email">
            <input
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="hello@acme.com"
              data-testid="input-email"
              className="branding-input"
            />
          </Field>
          <Field label="Phone">
            <input
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="+1 555 0100"
              data-testid="input-phone"
              className="branding-input"
            />
          </Field>
          <Field label="Tax ID / GST">
            <input
              value={form.taxId}
              onChange={(e) => update("taxId", e.target.value)}
              placeholder="(optional)"
              data-testid="input-tax-id"
              className="branding-input"
            />
          </Field>
          <Field label="Address" className="md:col-span-2">
            <textarea
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              rows={2}
              placeholder="123 Main St, City"
              data-testid="input-address"
              className="branding-input resize-y"
            />
          </Field>
          <Field label="Footer text" className="md:col-span-2">
            <input
              value={form.footerText}
              onChange={(e) => update("footerText", e.target.value)}
              placeholder="Acme Inc. • acme.com • +1 555 0100"
              data-testid="input-footer"
              className="branding-input"
            />
          </Field>
        </div>
      </SectionCard>

      {upsert.isError && (
        <div className="text-[12px] text-rose-600 px-1">
          Failed to save. Please try again.
        </div>
      )}

      <div className="sticky bottom-2 flex gap-2 pt-2">
        <button
          onClick={onSave}
          disabled={upsert.isPending}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-[14px] hover:bg-primary/90 disabled:opacity-60 transition-colors shadow-lg"
          data-testid="button-save-branding"
        >
          {upsert.isPending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : savedAt && Date.now() - savedAt < 2500 ? (
            <Check size={15} />
          ) : (
            <Save size={15} />
          )}
          {upsert.isPending
            ? "Saving…"
            : savedAt && Date.now() - savedAt < 2500
              ? "Saved"
              : "Save branding"}
        </button>
      </div>

      <style>{`
        .branding-input {
          width: 100%;
          background: hsl(var(--muted) / 0.4);
          border: 1px solid hsl(var(--card-border));
          border-radius: 0.625rem;
          padding: 0.5rem 0.75rem;
          font-size: 13px;
          color: hsl(var(--foreground));
          outline: none;
          transition: border-color 120ms;
        }
        .branding-input:focus {
          border-color: hsl(var(--primary));
        }
      `}</style>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card border border-card-border p-5 space-y-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-bold">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1", className)}>
      <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-lg border border-card-border flex-shrink-0"
        style={{ backgroundColor: value }}
      />
      <div className="flex-1">
        <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
        <div className="flex gap-2 mt-0.5">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="w-9 h-9 rounded cursor-pointer bg-transparent border border-card-border"
            data-testid={`${testId}-picker`}
          />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="branding-input flex-1 font-mono text-[12px]"
            placeholder="#000000"
            data-testid={`${testId}-hex`}
          />
        </div>
      </div>
    </div>
  );
}
