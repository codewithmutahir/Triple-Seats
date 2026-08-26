import type { VendorRecurrenceFreq } from "@tripeseats/database";

export type RecurrenceRow = {
  id: string;
  startAt: Date;
  endAt: Date;
  recurrenceFreq: VendorRecurrenceFreq;
  recurrenceInterval: number;
  recurrenceDaysOfWeek: string | null;
  recurrenceEndAt: Date | null;
  recurrenceCount: number | null;
};

export type ExpandedOccurrence = {
  occurrenceId: string;
  startAt: Date;
  endAt: Date;
  isRecurrenceInstance: boolean;
};

const MAX_EXPANDED = 500;
const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export function parseWeekdayCodes(raw: string | null | undefined): WeekdayCode[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is WeekdayCode => WEEKDAY_CODES.includes(s as WeekdayCode));
}

function addDays(d: Date, days: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonthsClamped(d: Date, months: number) {
  const next = new Date(d);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

function addYearsClamped(d: Date, years: number) {
  const next = new Date(d);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function weeksBetween(a: Date, b: Date) {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
}

function withinSeriesLimits(
  occurrenceStart: Date,
  anchorStart: Date,
  row: RecurrenceRow,
  emittedCount: number
) {
  if (row.recurrenceCount != null && emittedCount >= row.recurrenceCount) return false;
  if (row.recurrenceEndAt && occurrenceStart.getTime() > row.recurrenceEndAt.getTime()) return false;
  if (emittedCount >= MAX_EXPANDED) return false;
  return true;
}

function overlapsRange(startAt: Date, endAt: Date, rangeStart: Date, rangeEnd: Date) {
  return startAt.getTime() < rangeEnd.getTime() && endAt.getTime() > rangeStart.getTime();
}

function makeOccurrence(row: RecurrenceRow, startAt: Date, endAt: Date, isRecurrenceInstance: boolean) {
  return {
    occurrenceId: `${row.id}__${startAt.getTime()}`,
    startAt,
    endAt,
    isRecurrenceInstance
  };
}

/** Expand a stored entry into calendar occurrences within a visible range. */
export function expandVendorCalendarOccurrences(
  row: RecurrenceRow,
  rangeStart: Date,
  rangeEnd: Date
): ExpandedOccurrence[] {
  const durationMs = row.endAt.getTime() - row.startAt.getTime();
  if (durationMs <= 0) return [];

  if (row.recurrenceFreq === "none") {
    if (!overlapsRange(row.startAt, row.endAt, rangeStart, rangeEnd)) return [];
    return [makeOccurrence(row, row.startAt, row.endAt, false)];
  }

  const interval = Math.max(1, row.recurrenceInterval || 1);
  const results: ExpandedOccurrence[] = [];
  let emitted = 0;

  const pushIfVisible = (startAt: Date) => {
    if (!withinSeriesLimits(startAt, row.startAt, row, emitted)) return false;
    const endAt = new Date(startAt.getTime() + durationMs);
    if (!overlapsRange(startAt, endAt, rangeStart, rangeEnd)) return true;
    results.push(makeOccurrence(row, startAt, endAt, startAt.getTime() !== row.startAt.getTime()));
    emitted++;
    return true;
  };

  if (row.recurrenceFreq === "daily") {
    let cursor = new Date(row.startAt);
    while (cursor.getTime() < rangeEnd.getTime() && emitted < MAX_EXPANDED) {
      if (!withinSeriesLimits(cursor, row.startAt, row, emitted)) break;
      pushIfVisible(cursor);
      cursor = addDays(cursor, interval);
    }
    return results;
  }

  if (row.recurrenceFreq === "weekly") {
    const days = parseWeekdayCodes(row.recurrenceDaysOfWeek);
    if (days.length === 0) {
      let cursor = new Date(row.startAt);
      while (cursor.getTime() < rangeEnd.getTime() && emitted < MAX_EXPANDED) {
        if (!withinSeriesLimits(cursor, row.startAt, row, emitted)) break;
        pushIfVisible(cursor);
        cursor = addDays(cursor, 7 * interval);
      }
      return results;
    }

    const daySet = new Set(days.map((d) => WEEKDAY_CODES.indexOf(d)));
    const scanStart = new Date(Math.max(rangeStart.getTime() - durationMs, row.startAt.getTime()));
    scanStart.setHours(row.startAt.getHours(), row.startAt.getMinutes(), row.startAt.getSeconds(), 0);
    let cursor = startOfDay(scanStart);
    while (cursor.getTime() < rangeEnd.getTime() && emitted < MAX_EXPANDED) {
      if (daySet.has(cursor.getDay())) {
        const occurrence = new Date(cursor);
        occurrence.setHours(
          row.startAt.getHours(),
          row.startAt.getMinutes(),
          row.startAt.getSeconds(),
          row.startAt.getMilliseconds()
        );
        if (occurrence.getTime() >= row.startAt.getTime()) {
          const weekDelta = weeksBetween(row.startAt, occurrence);
          if (weekDelta % interval === 0) {
            if (!pushIfVisible(occurrence)) break;
          }
        }
      }
      cursor = addDays(cursor, 1);
    }
    return results;
  }

  if (row.recurrenceFreq === "monthly") {
    let cursor = new Date(row.startAt);
    while (cursor.getTime() < rangeEnd.getTime() && emitted < MAX_EXPANDED) {
      if (!withinSeriesLimits(cursor, row.startAt, row, emitted)) break;
      pushIfVisible(cursor);
      cursor = addMonthsClamped(cursor, interval);
    }
    return results;
  }

  if (row.recurrenceFreq === "yearly") {
    let cursor = new Date(row.startAt);
    while (cursor.getTime() < rangeEnd.getTime() && emitted < MAX_EXPANDED) {
      if (!withinSeriesLimits(cursor, row.startAt, row, emitted)) break;
      pushIfVisible(cursor);
      cursor = addYearsClamped(cursor, interval);
    }
    return results;
  }

  return results;
}

/** Whether a recurring master could produce instances overlapping a fetch range. */
export function recurringMasterWhere(rangeStart: Date, rangeEnd: Date) {
  return {
    recurrenceFreq: { not: "none" as VendorRecurrenceFreq },
    startAt: { lt: rangeEnd },
    OR: [{ recurrenceEndAt: null }, { recurrenceEndAt: { gte: rangeStart } }]
  };
}

export { WEEKDAY_CODES };
