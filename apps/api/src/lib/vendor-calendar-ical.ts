import { randomBytes } from "crypto";

import type { CalendarShowAs } from "@tripeseats/database";

export type IcalEventInput = {
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  meetingUrl?: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  status?: "CONFIRMED" | "CANCELLED";
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatUtc(d: Date) {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function formatDateOnly(d: Date) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function escapeIcal(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function foldLine(line: string) {
  if (line.length <= 73) return line;
  const parts: string[] = [line.slice(0, 73)];
  let i = 73;
  while (i < line.length) {
    parts.push(` ${line.slice(i, i + 72)}`);
    i += 72;
  }
  return parts.join("\r\n");
}

export function buildIcalCalendar(events: IcalEventInput[], calName: string) {
  const now = formatUtc(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tripeseats//Vendor Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldLine(`X-WR-CALNAME:${escapeIcal(calName)}`)
  ];

  for (const ev of events) {
    const descParts = [ev.description?.trim(), ev.meetingUrl ? `Join: ${ev.meetingUrl}` : ""].filter(
      Boolean
    );
    const description = descParts.length ? escapeIcal(descParts.join("\n")) : undefined;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeIcal(ev.uid)}`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`SUMMARY:${escapeIcal(ev.title)}`);
    if (description) lines.push(foldLine(`DESCRIPTION:${description}`));
    if (ev.location) lines.push(foldLine(`LOCATION:${escapeIcal(ev.location)}`));
    if (ev.meetingUrl) lines.push(foldLine(`URL:${escapeIcal(ev.meetingUrl)}`));
    if (ev.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatDateOnly(ev.startAt)}`);
      lines.push(`DTEND;VALUE=DATE:${formatDateOnly(ev.endAt)}`);
    } else {
      lines.push(`DTSTART:${formatUtc(ev.startAt)}`);
      lines.push(`DTEND:${formatUtc(ev.endAt)}`);
    }
    lines.push(`STATUS:${ev.status ?? "CONFIRMED"}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export function generateIcalToken() {
  return randomBytes(24).toString("hex");
}

export function entryColorHex(showAs: CalendarShowAs, colorHex: string | null | undefined) {
  const defaults: Record<CalendarShowAs, string> = {
    busy: "#1B2A4A",
    free: "#10B981",
    tentative: "#F59E0B",
    oof: "#6B7280"
  };
  if (colorHex && /^#[0-9A-Fa-f]{6}$/.test(colorHex)) return colorHex;
  return defaults[showAs];
}
