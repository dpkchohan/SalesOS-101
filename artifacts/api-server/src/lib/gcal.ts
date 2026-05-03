import { ReplitConnectors } from "@replit/connectors-sdk";

const CALENDAR_ID = "primary";
const PROXY_BASE = `/calendar/v3/calendars/${CALENDAR_ID}/events`;

export interface CalendarEventInput {
  title: string;
  description?: string | null;
  date: string;
  time?: string | null;
  durationMinutes?: number;
  timeZone?: string;
}

function defaultTimeZone(): string {
  return (
    process.env.SALESOS_DEFAULT_TZ ||
    process.env.TZ ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC"
  );
}

function nextDay(yyyymmdd: string): string {
  const d = new Date(`${yyyymmdd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function isValidHHMM(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

function buildEventBody(input: CalendarEventInput): Record<string, unknown> {
  const tz = input.timeZone ?? defaultTimeZone();
  if (input.time && isValidHHMM(input.time)) {
    const startIso = `${input.date}T${input.time}:00`;
    const [hh, mm] = input.time.split(":").map((n) => parseInt(n, 10));
    const dur = input.durationMinutes ?? 30;
    const totalEnd = hh * 60 + mm + dur;
    const eh = Math.floor(totalEnd / 60) % 24;
    const em = totalEnd % 60;
    const endIso = `${input.date}T${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}:00`;
    return {
      summary: input.title,
      description: input.description ?? "",
      start: { dateTime: startIso, timeZone: tz },
      end: { dateTime: endIso, timeZone: tz },
    };
  }
  // All-day event: Google Calendar requires end.date to be EXCLUSIVE (the day after start).
  return {
    summary: input.title,
    description: input.description ?? "",
    start: { date: input.date },
    end: { date: nextDay(input.date) },
  };
}

export async function createCalendarEvent(
  input: CalendarEventInput,
): Promise<{ id: string; htmlLink: string | null }> {
  const connectors = new ReplitConnectors();
  const res = await connectors.proxy("google-calendar", PROXY_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildEventBody(input)),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Calendar create failed (${res.status}): ${text.slice(0, 500)}`);
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string; htmlLink?: string };
  if (!data.id) throw new Error("Calendar create returned no event id");
  return { id: data.id, htmlLink: data.htmlLink ?? null };
}

export async function updateCalendarEvent(
  eventId: string,
  input: CalendarEventInput,
): Promise<void> {
  const connectors = new ReplitConnectors();
  const res = await connectors.proxy(
    "google-calendar",
    `${PROXY_BASE}/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildEventBody(input)),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Calendar update failed (${res.status}): ${text.slice(0, 500)}`);
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const connectors = new ReplitConnectors();
  const res = await connectors.proxy(
    "google-calendar",
    `${PROXY_BASE}/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const text = await res.text().catch(() => "");
    throw new Error(`Calendar delete failed (${res.status}): ${text.slice(0, 500)}`);
  }
}

export async function checkCalendarConnection(): Promise<{
  connected: boolean;
  email: string | null;
  error: string | null;
}> {
  try {
    const connectors = new ReplitConnectors();
    const res = await connectors.proxy(
      "google-calendar",
      "/calendar/v3/users/me/calendarList?maxResults=1",
      { method: "GET" },
    );
    if (!res.ok) {
      return { connected: false, email: null, error: `HTTP ${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as {
      items?: { id?: string; summary?: string }[];
    };
    const primary = data.items?.[0];
    return {
      connected: true,
      email: primary?.id ?? primary?.summary ?? null,
      error: null,
    };
  } catch (err) {
    return {
      connected: false,
      email: null,
      error: err instanceof Error ? err.message.slice(0, 200) : "unknown",
    };
  }
}
