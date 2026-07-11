import { format } from "date-fns";

export function formatEventTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "h:mm a");
  } catch {
    return "—";
  }
}

export function formatEventTimeRange(
  startTime: string | null | undefined,
  endTime: string | null | undefined
): string {
  if (!startTime) return "—";
  const start = formatEventTime(startTime);
  if (!endTime) return start;
  return `${start} – ${formatEventTime(endTime)}`;
}

/** Prefer manual eventTime string; fall back to start/end timestamps. */
export function formatEventTimeDisplay(event: {
  eventTime?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}): string {
  const manual = event.eventTime?.trim();
  if (manual) return manual;
  return formatEventTimeRange(event.startTime, event.endTime);
}

export function formatEventDateWithTime(
  eventDate: string,
  startTime?: string | null,
  endTime?: string | null,
  eventTime?: string | null
): string {
  try {
    const date = format(new Date(eventDate), "MMM d, yyyy");
    const time = eventTime?.trim() || formatEventTimeRange(startTime, endTime);
    if (time === "—") return date;
    return `${date} · ${time}`;
  } catch {
    return eventDate;
  }
}
