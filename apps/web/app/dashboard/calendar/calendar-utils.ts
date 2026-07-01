import { addMonths, endOfMonth, format, startOfMonth, subMonths } from "date-fns";

import type { CalendarEvent } from "./types";
import { parseApiError } from "@/lib/user-facing-error";

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

export async function fetchCalendarEvents(
  start: Date,
  end: Date
): Promise<{ data?: CalendarEvent[]; error?: string }> {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString()
  });
  const res = await fetch(`/api/calendar/events?${params.toString()}`, {
    credentials: "include"
  });
  const body = (await res.json().catch(() => null)) as { error?: string } | CalendarEvent[] | null;
  if (!res.ok) {
    const errBody =
      body && typeof body === "object" && !Array.isArray(body) ? body : null;
    return { error: parseApiError(errBody, res.status, res.statusText) };
  }
  return { data: body as CalendarEvent[] };
}
