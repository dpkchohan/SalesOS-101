import { useEffect, useRef, useState } from "react";
import {
  useGetMe,
  useGetCompanyCredentials,
  useUpsertCompanyCredentials,
  useGetCalendarStatus,
  useBackfillContacts,
  getGetCompanyCredentialsQueryKey,
  getListContactsQueryKey,
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
  Hash,
  AlertCircle,
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
      <BackfillCard />
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
  const { data, isLoading, refetch, isFetching } = useGetCalendarStatus({
    query: { staleTime: 60_000, refetchOnWindowFocus: false, queryKey: ["calendarStatus"] },
  });
  const connected = data?.connected === true;
  const onConnect = () => {
    window.open(
      "https://replit.com/integrations/google-calendar",
      "_blank",
      "noopener,noreferrer",
    );
  };
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
                : "Authorize Google Calendar so SalesOS can keep your follow-ups in sync with your day."}
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
      <div className="flex gap-2 mt-3">
        {!connected && (
          <button
            type="button"
            onClick={onConnect}
            disabled={isLoading}
            className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            data-testid="button-connect-calendar"
          >
            Connect Google Calendar
          </button>
        )}
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-muted text-muted-foreground hover:bg-muted/70 disabled:opacity-60"
          data-testid="button-refresh-calendar"
        >
          {isFetching ? "Checking…" : connected ? "Recheck status" : "I've authorized — recheck"}
        </button>
      </div>
    </div>
  );
}

function BackfillCard() {
  const qc = useQueryClient();
  const backfill = useBackfillContacts({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
      },
    },
  });
  const result = backfill.data;
  const error = backfill.error;
  return (
    <div
      className="rounded-2xl bg-card border border-card-border p-5"
      data-testid="card-backfill-contacts"
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-bold mb-3">
        <Hash size={14} /> Customer numbers
      </div>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl grid place-items-center flex-shrink-0 bg-muted text-muted-foreground">
          <Hash size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[14px]">Backfill customer numbers</div>
          <div className="text-[12px] text-muted-foreground mt-0.5">
            Assign a CUST-#### number to every existing contact and normalize their email and phone so duplicate detection can catch them. Safe to run more than once.
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button
          type="button"
          onClick={() => backfill.mutate()}
          disabled={backfill.isPending}
          className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-1.5"
          data-testid="button-run-backfill"
        >
          {backfill.isPending && <Loader2 size={12} className="animate-spin" />}
          {backfill.isPending ? "Running…" : result ? "Run again" : "Run backfill"}
        </button>
        {result && (
          <span
            className="text-[12px] text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1"
            data-testid="text-backfill-result"
          >
            <Check size={13} />
            Scanned {result.totalScanned} · Assigned {result.customerNosAssigned} · Normalized {result.normalized}
          </span>
        )}
        {error && (
          <span
            className="text-[12px] text-rose-600 dark:text-rose-400 inline-flex items-center gap-1"
            data-testid="text-backfill-error"
          >
            <AlertCircle size={13} />
            Backfill failed. Try again.
          </span>
        )}
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
  const [autoColorNote, setAutoColorNote] = useState<string | null>(null);
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
    setAutoColorNote(null);
    if (!file.type.startsWith("image/")) {
      setLogoError("Please choose an image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("Logo must be under 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const result = reader.result;
      if (typeof result !== "string") return;
      const palette = await extractLogoPalette(result).catch(() => null);
      setForm((s) => ({
        ...s,
        companyLogoUrl: result,
        ...(palette
          ? {
              primaryColor: palette[0] ?? s.primaryColor,
              secondaryColor: palette[1] ?? s.secondaryColor,
              accentColor: palette[2] ?? s.accentColor,
            }
          : {}),
      }));
      if (palette && palette.length > 0) {
        setAutoColorNote(
          `Brand colors detected from your logo (${palette.length} swatch${palette.length === 1 ? "" : "es"}). Adjust below if needed.`,
        );
      }
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
          {autoColorNote && !logoError && (
            <div
              className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1.5"
              data-testid="text-auto-color-note"
            >
              {autoColorNote}
            </div>
          )}
          <div className="text-[11px] text-muted-foreground mt-1.5">
            PNG/JPG/SVG, under 2MB. Used in proposal headers. Brand colors are auto-detected on
            upload.
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

async function extractLogoPalette(dataUrl: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const maxDim = 96;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve([]);
        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);
        const buckets = new Map<string, { r: number; g: number; b: number; n: number; score: number }>();
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 200) continue;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const lum = (max + min) / 2;
          if (lum < 24 || lum > 235) continue;
          const sat = max === 0 ? 0 : (max - min) / max;
          if (sat < 0.18) continue;
          const br = Math.round(r / 24) * 24;
          const bg = Math.round(g / 24) * 24;
          const bb = Math.round(b / 24) * 24;
          const key = `${br},${bg},${bb}`;
          const prev = buckets.get(key);
          const weight = 1 + sat;
          if (prev) {
            prev.r += r;
            prev.g += g;
            prev.b += b;
            prev.n += 1;
            prev.score += weight;
          } else {
            buckets.set(key, { r, g, b, n: 1, score: weight });
          }
        }
        const sorted = Array.from(buckets.values())
          .map((c) => ({
            r: Math.round(c.r / c.n),
            g: Math.round(c.g / c.n),
            b: Math.round(c.b / c.n),
            score: c.score,
          }))
          .sort((a, b) => b.score - a.score);
        const picked: { r: number; g: number; b: number }[] = [];
        const dist2 = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) =>
          (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
        for (const c of sorted) {
          if (picked.every((p) => dist2(p, c) > 60 * 60)) {
            picked.push(c);
            if (picked.length >= 3) break;
          }
        }
        const toHex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
        resolve(picked.map((c) => `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("image load failed"));
    img.src = dataUrl;
  });
}
