import { addMonths, endOfMonth, format, startOfMonth, subMonths } from "date-fns";

import { apiFetchJson } from "@/lib/api-client";
import { supportsApiFeature } from "@/lib/api-features";

import type { CalendarEvent } from "./types";

export function monthKey(date: Date): string {
  return format(startOfMonth(date), "yyyy-MM");
}

export function rangeKey(start: Date, end: Date): string {
  return `${start.toISOString()}:${end.toISOString()}`;
}

export function adjacentMonthRanges(anchor: Date) {
  const prev = subMonths(anchor, 1);
  const next = addMonths(anchor, 1);
  return [
    { start: startOfMonth(prev), end: endOfMonth(prev) },
    { start: startOfMonth(next), end: endOfMonth(next) }
  ] as const;
}

/** Group events by yyyy-MM month key for Zustand cache seeding */
export function groupEventsByMonth(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const grouped: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    const key = monthKey(new Date(ev.start));
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(ev);
  }
  return grouped;
}

function initMonthRanges(anchor = new Date()) {
  return [
    { start: startOfMonth(subMonths(anchor, 1)), end: endOfMonth(subMonths(anchor, 1)) },
    { start: startOfMonth(anchor), end: endOfMonth(anchor) },
    { start: startOfMonth(addMonths(anchor, 1)), end: endOfMonth(addMonths(anchor, 1)) }
  ];
}

async function fetchCalendarEventsRange(
  start: Date,
  end: Date
): Promise<{ data?: CalendarEvent[]; error?: string }> {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString()
  });
  const res = await apiFetchJson<CalendarEvent[]>(`/api/calendar/events?${params.toString()}`);
  if (!res.ok) {
    return { error: res.message };
  }
  return { data: Array.isArray(res.data) ? res.data : [] };
}

async function fetchCalendarInitLegacy(): Promise<{ data?: CalendarEvent[]; error?: string }> {
  const ranges = initMonthRanges();
  const results = await Promise.all(
    ranges.map(({ start, end }) => fetchCalendarEventsRange(start, end))
  );
  const firstError = results.find((r) => r.error)?.error;
  if (firstError) return { error: firstError };
  return { data: results.flatMap((r) => r.data ?? []) };
}

export async function fetchCalendarInit(): Promise<{
  data?: CalendarEvent[];
  error?: string;
}> {
  if (await supportsApiFeature("calendarInit")) {
    const batch = await apiFetchJson<{ events?: CalendarEvent[] }>("/api/calendar/init");
    if (batch.ok) {
      return { data: batch.data.events ?? [] };
    }
    if (batch.status !== 404) {
      return { error: batch.message };
    }
  }
  return fetchCalendarInitLegacy();
}

export async function fetchCalendarEvents(
  start: Date,
  end: Date
): Promise<{ data?: CalendarEvent[]; error?: string }> {
  return fetchCalendarEventsRange(start, end);
}

/** Server-side calendar bootstrap (SSR) — uses internal API origin + cookie header. */
export async function fetchCalendarInitServer(
  apiOrigin: string,
  cookieHeader: string
): Promise<CalendarEvent[]> {
  const headers = { cookie: cookieHeader };
  const origin = apiOrigin.replace(/\/+$/, "");

  try {
    const initRes = await fetch(`${origin}/api/calendar/init`, {
      headers,
      next: { revalidate: 60 }
    });
    if (initRes.ok) {
      const data = (await initRes.json()) as { events?: CalendarEvent[] };
      return Array.isArray(data.events) ? data.events : [];
    }

    if (initRes.status !== 404) return [];

    const ranges = initMonthRanges();
    const chunks = await Promise.all(
      ranges.map(async ({ start, end }) => {
        const params = new URLSearchParams({
          start: start.toISOString(),
          end: end.toISOString()
        });
        const res = await fetch(`${origin}/api/calendar/events?${params.toString()}`, {
          headers,
          next: { revalidate: 60 }
        });
        if (!res.ok) return [] as CalendarEvent[];
        const body = (await res.json()) as CalendarEvent[];
        return Array.isArray(body) ? body : [];
      })
    );
    return chunks.flat();
  } catch {
    return [];
  }
}
