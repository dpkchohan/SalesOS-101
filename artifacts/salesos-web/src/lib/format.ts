export function formatCurrency(value?: number | null, currency = "USD"): string {
  if (value == null) return "—";
  if (value >= 1000)
    return `${currency === "USD" ? "$" : currency + " "}${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return `${currency === "USD" ? "$" : currency + " "}${value}`;
}

export function relativeTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  if (diffD < 30) return `${Math.round(diffD / 7)}w ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function shortDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export const STAGE_META: Record<
  string,
  { label: string; tone: string; bar: string }
> = {
  new: { label: "New", tone: "bg-slate-500/15 text-slate-700 dark:text-slate-300", bar: "bg-slate-400" },
  interested: {
    label: "Interested",
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  qualified: {
    label: "Qualified",
    tone: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    bar: "bg-blue-500",
  },
  negotiating: {
    label: "Negotiating",
    tone: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    bar: "bg-violet-500",
  },
  won: { label: "Won", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-500" },
  lost: { label: "Lost", tone: "bg-rose-500/15 text-rose-700 dark:text-rose-300", bar: "bg-rose-500" },
};

export const STAGES = ["new", "interested", "qualified", "negotiating", "won", "lost"] as const;
