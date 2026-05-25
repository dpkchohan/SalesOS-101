import { getValidAccessToken, NoGoogleConnectionError } from "./googleTokens";

const CALENDAR_ID = "primary";
const GCAL_BASE = `https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID}/events`;

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
    const dayShift = Math.floor(totalEnd / (60 * 24));
    const minutesInDay = totalEnd - dayShift * 60 * 24;
    const eh = Math.floor(minutesInDay / 60);
    const em = minutesInDay % 60;
    let endDate = input.date;
    for (let i = 0; i < dayShift; i++) endDate = nextDay(endDate);
    const endIso = `${endDate}T${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}:00`;
    return {
      summary: input.title,
      description: input.description ?? "",
      start: { dateTime: startIso, timeZone: tz },
      end: { dateTime: endIso, timeZone: tz },
    };
  }
  return {
    summary: input.title,
    description: input.description ?? "",
    start: { date: input.date },
    end: { date: nextDay(input.date) },
  };
}

async function calendarFetch(
  userId: string,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const token = await getValidAccessToken(userId);
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

export async function createCalendarEvent(
  userId: string,
  input: CalendarEventInput,
): Promise<{ id: string; htmlLink: string | null }> {
  const res = await calendarFetch(userId, GCAL_BASE, {
    method: "POST",
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

export class CalendarEventGoneError extends Error {
  constructor(eventId: string) {
    super(`Calendar event ${eventId} no longer exists`);
    this.name = "CalendarEventGoneError";
  }
}

export async function updateCalendarEvent(
  userId: string,
  eventId: string,
  input: CalendarEventInput,
): Promise<void> {
  const res = await calendarFetch(
    userId,
    `${GCAL_BASE}/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(buildEventBody(input)),
    },
  );
  if (res.status === 404 || res.status === 410) {
    throw new CalendarEventGoneError(eventId);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Calendar update failed (${res.status}): ${text.slice(0, 500)}`);
  }
}

export async function deleteCalendarEvent(
  userId: string,
  eventId: string,
): Promise<void> {
  const res = await calendarFetch(
    userId,
    `${GCAL_BASE}/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const text = await res.text().catch(() => "");
    throw new Error(`Calendar delete failed (${res.status}): ${text.slice(0, 500)}`);
  }
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  description?: string | null;
  htmlLink?: string | null;
}

export async function listUpcomingEvents(
  userId: string,
  maxResults = 10,
  days = 7,
): Promise<CalendarEvent[]> {
  const now = new Date().toISOString();
  const future = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const qs = new URLSearchParams({
    timeMin: now,
    timeMax: future,
    maxResults: String(maxResults),
    singleEvents: "true",
    orderBy: "startTime",
  });
  const res = await calendarFetch(userId, `${GCAL_BASE}?${qs}`, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Calendar list failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json().catch(() => ({ items: [] }))) as {
    items?: Array<{
      id?: string;
      summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      description?: string;
      htmlLink?: string;
    }>;
  };
  return (data.items ?? []).map((e) => ({
    id: e.id ?? "",
    title: e.summary ?? "(no title)",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    description: e.description ?? null,
    htmlLink: e.htmlLink ?? null,
  }));
}

export async function checkCalendarConnection(userId: string): Promise<{
  connected: boolean;
  email: string | null;
  error: string | null;
}> {
  try {
    const token = await getValidAccessToken(userId);
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1",
      { headers: { Authorization: `Bearer ${token}` } },
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
    if (err instanceof NoGoogleConnectionError) {
      return { connected: false, email: null, error: null };
    }
    return {
      connected: false,
      email: null,
      error: err instanceof Error ? err.message.slice(0, 200) : "unknown",
    };
  }
}
