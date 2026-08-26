import { prisma } from "@tripeseats/database";

import { escapeHtml, getResend, resendFromEmail } from "./mail";
import { expandVendorCalendarOccurrences } from "./vendor-calendar-recurrence";

const DISPATCH_WINDOW_MS = 15 * 60 * 1000;

async function sendWithRetry(fn: () => Promise<void>, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      await fn();
      return;
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 2 ** i * 200));
    }
  }
}

function formatWhen(startAt: Date, endAt: Date, allDay: boolean) {
  if (allDay) {
    return startAt.toLocaleDateString(undefined, { dateStyle: "medium" });
  }
  const start = startAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const end = endAt.toLocaleString(undefined, { timeStyle: "short" });
  return `${start} – ${end}`;
}

export async function sendVendorCalendarReminderEmail(opts: {
  to: string;
  ownerName: string | null;
  title: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  location?: string | null;
  meetingUrl?: string | null;
}) {
  const resend = getResend();
  if (!resend) return { sent: false as const, reason: "email_not_configured" as const };

  const when = formatWhen(opts.startAt, opts.endAt, opts.allDay);
  const owner = escapeHtml(opts.ownerName ?? "Calendar owner");
  const title = escapeHtml(opts.title);
  const locationLine = opts.location
    ? `<p><strong>Location:</strong> ${escapeHtml(opts.location)}</p>`
    : "";
  const meetLine = opts.meetingUrl
    ? `<p><a href="${escapeHtml(opts.meetingUrl)}">Join meeting</a></p>`
    : "";

  await sendWithRetry(async () => {
    const { error } = await resend.emails.send({
      from: resendFromEmail(),
      to: opts.to,
      subject: `Reminder: ${opts.title}`,
      html: `<p>Hi,</p><p>This is a reminder for <strong>${title}</strong> on ${escapeHtml(when)} (${owner}'s vendor calendar).</p>${locationLine}${meetLine}<p>— Tripeseats</p>`
    });
    if (error) throw new Error(error.message);
  });

  return { sent: true as const };
}

export async function sendVendorCalendarAttendeeInviteEmail(opts: {
  to: string;
  attendeeName?: string | null;
  ownerName: string | null;
  ownerEmail: string;
  title: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  location?: string | null;
  meetingUrl?: string | null;
  notes?: string | null;
}) {
  const resend = getResend();
  if (!resend) return { sent: false as const, reason: "email_not_configured" as const };

  const when = formatWhen(opts.startAt, opts.endAt, opts.allDay);
  const greet = escapeHtml(opts.attendeeName ?? opts.to);
  const owner = escapeHtml(opts.ownerName ?? opts.ownerEmail);
  const title = escapeHtml(opts.title);
  const locationLine = opts.location
    ? `<p><strong>Location:</strong> ${escapeHtml(opts.location)}</p>`
    : "";
  const meetLine = opts.meetingUrl
    ? `<p><a href="${escapeHtml(opts.meetingUrl)}">Join meeting</a></p>`
    : "";
  const notesLine =
    opts.notes && opts.notes.trim()
      ? `<p><strong>Notes:</strong> ${escapeHtml(opts.notes.trim())}</p>`
      : "";

  await sendWithRetry(async () => {
    const { error } = await resend.emails.send({
      from: resendFromEmail(),
      to: opts.to,
      subject: `Invitation: ${opts.title}`,
      html: `<p>Hi ${greet},</p><p>${owner} invited you to <strong>${title}</strong> on ${escapeHtml(when)}.</p>${locationLine}${meetLine}${notesLine}<p>— Tripeseats Vendor Calendar</p>`
    });
    if (error) throw new Error(error.message);
  });

  return { sent: true as const };
}

/** Process due reminder emails (call from cron with secret header). */
export async function dispatchDueVendorCalendarReminders(now = new Date()) {
  const horizonEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const horizonStart = new Date(now.getTime() - DISPATCH_WINDOW_MS);

  const rows = await prisma.vendorCalendarEntry.findMany({
    where: {
      reminderMinutesBefore: { not: null },
      startAt: { lt: horizonEnd }
    },
    select: {
      id: true,
      catererId: true,
      title: true,
      location: true,
      meetingUrl: true,
      startAt: true,
      endAt: true,
      allDay: true,
      reminderMinutesBefore: true,
      recurrenceFreq: true,
      recurrenceInterval: true,
      recurrenceDaysOfWeek: true,
      recurrenceEndAt: true,
      recurrenceCount: true,
      owner: { select: { email: true, name: true } }
    },
    take: 500
  });

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    if (!row.reminderMinutesBefore || !row.owner.email) {
      skipped++;
      continue;
    }

    const occurrences = expandVendorCalendarOccurrences(row, horizonStart, horizonEnd);
    for (const occ of occurrences) {
      const remindAt = new Date(
        occ.startAt.getTime() - row.reminderMinutesBefore * 60 * 1000
      );
      if (remindAt.getTime() > now.getTime()) continue;
      if (now.getTime() - remindAt.getTime() > DISPATCH_WINDOW_MS) continue;

      const existing = await prisma.vendorCalendarReminderLog.findUnique({
        where: {
          entryId_occurrenceStartAt: {
            entryId: row.id,
            occurrenceStartAt: occ.startAt
          }
        },
        select: { id: true }
      });
      if (existing) {
        skipped++;
        continue;
      }

      try {
        const result = await sendVendorCalendarReminderEmail({
          to: row.owner.email,
          ownerName: row.owner.name,
          title: row.title,
          startAt: occ.startAt,
          endAt: occ.endAt,
          allDay: row.allDay,
          location: row.location,
          meetingUrl: row.meetingUrl
        });
        if (result.sent) {
          await prisma.vendorCalendarReminderLog.create({
            data: {
              catererId: row.catererId,
              entryId: row.id,
              occurrenceStartAt: occ.startAt
            }
          });
          sent++;
        } else {
          skipped++;
        }
      } catch {
        errors++;
      }
    }
  }

  return { sent, skipped, errors, checkedEntries: rows.length };
}
