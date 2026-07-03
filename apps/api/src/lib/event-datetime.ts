const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseTimeString(value: string): { hours: number; minutes: number } | null {
  const m = value.trim().match(TIME_RE);
  if (!m) return null;
  return { hours: parseInt(m[1]!, 10), minutes: parseInt(m[2]!, 10) };
}

export function combineDateAndTime(dateInput: Date | string, timeStr: string): Date | null {
  const parsed = parseTimeString(timeStr);
  if (!parsed) return null;

  const base = typeof dateInput === "string" ? new Date(dateInput) : new Date(dateInput);
  if (Number.isNaN(base.getTime())) return null;

  const result = new Date(base);
  result.setHours(parsed.hours, parsed.minutes, 0, 0);
  return result;
}

export function formatTimeRange(start: Date | null, end: Date | null): string {
  if (!start) return "Not provided";
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const startLabel = fmt(start);
  if (!end) return startLabel;
  return `${startLabel} – ${fmt(end)}`;
}
