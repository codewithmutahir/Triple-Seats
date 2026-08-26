import type { CalendarShowAs, VendorRecurrenceFreq } from "@tripeseats/database";
import { prisma } from "@tripeseats/database";

import { decryptSecret, encryptSecret } from "./secret-crypto";
import { refreshGoogleOAuthToken } from "./google-calendar-oauth";

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

type GoogleClient = {
  accessToken: string;
  calendarId: string;
  userId: string;
};

type EntryForSync = {
  id: string;
  catererId: string;
  ownerUserId: string;
  title: string;
  notes: string | null;
  location: string | null;
  meetingUrl: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  showAs: CalendarShowAs;
  isPrivate: boolean;
  recurrenceFreq: VendorRecurrenceFreq;
  googleEventId: string | null;
  googleEventEtag: string | null;
};

type GoogleEventPayload = {
  id?: string;
  etag?: string;
  updated?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  transparency?: string;
  status?: string;
  extendedProperties?: { private?: Record<string, string> };
  recurrence?: string[];
};

function formatGoogleDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function mapShowAsToGoogle(showAs: CalendarShowAs) {
  if (showAs === "free") return { transparency: "transparent" as const };
  if (showAs === "tentative") return { transparency: "opaque" as const, status: "tentative" as const };
  return { transparency: "opaque" as const, status: "confirmed" as const };
}

function buildGoogleEventBody(entry: EntryForSync): GoogleEventPayload {
  const descriptionParts = [
    entry.isPrivate ? null : entry.notes,
    entry.meetingUrl ? `Join: ${entry.meetingUrl}` : null
  ].filter(Boolean);
  const showAs = mapShowAsToGoogle(entry.showAs);
  const body: GoogleEventPayload = {
    summary: entry.title,
    description: descriptionParts.length ? descriptionParts.join("\n\n") : undefined,
    location: entry.location ?? undefined,
    transparency: showAs.transparency,
    status: showAs.status,
    extendedProperties: {
      private: {
        tripeseatsEntryId: entry.id,
        tripeseatsOwnerUserId: entry.ownerUserId
      }
    }
  };

  if (entry.allDay) {
    body.start = { date: formatGoogleDateOnly(entry.startAt) };
    body.end = { date: formatGoogleDateOnly(entry.endAt) };
  } else {
    body.start = { dateTime: entry.startAt.toISOString() };
    body.end = { dateTime: entry.endAt.toISOString() };
  }
  return body;
}

async function googleApi<T>(
  client: GoogleClient,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${client.accessToken}`,
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const text = await res.text();
  if (res.status === 204) return undefined as T;
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    const err = json as { error?: { message?: string } };
    const message = err.error?.message ?? `Google Calendar API error (${res.status})`;
    throw Object.assign(new Error(message), { status: res.status });
  }
  return json as T;
}

export async function getGoogleCalendarClient(userId: string): Promise<GoogleClient | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      googleCalendarRefreshTokenEnc: true,
      googleCalendarAccessTokenEnc: true,
      googleCalendarTokenExpiresAt: true,
      googleCalendarId: true
    }
  });
  if (!user?.googleCalendarRefreshTokenEnc) return null;

  let accessToken = decryptSecret(user.googleCalendarAccessTokenEnc);
  const refreshToken = decryptSecret(user.googleCalendarRefreshTokenEnc);
  if (!refreshToken) return null;

  const expiresSoon =
    !user.googleCalendarTokenExpiresAt ||
    user.googleCalendarTokenExpiresAt.getTime() < Date.now() + 60_000;

  if (!accessToken || expiresSoon) {
    const refreshed = await refreshGoogleOAuthToken(refreshToken);
    accessToken = refreshed.accessToken;
    await prisma.user.update({
      where: { id: userId },
      data: {
        googleCalendarAccessTokenEnc: encryptSecret(refreshed.accessToken),
        googleCalendarRefreshTokenEnc: refreshed.refreshToken
          ? encryptSecret(refreshed.refreshToken)
          : user.googleCalendarRefreshTokenEnc,
        googleCalendarTokenExpiresAt: refreshed.expiresAt
      }
    });
  }

  return {
    accessToken: accessToken!,
    calendarId: user.googleCalendarId ?? "primary",
    userId
  };
}

export async function pushVendorEntryToGoogle(entryId: string) {
  const entry = await prisma.vendorCalendarEntry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      catererId: true,
      ownerUserId: true,
      title: true,
      notes: true,
      location: true,
      meetingUrl: true,
      startAt: true,
      endAt: true,
      allDay: true,
      showAs: true,
      isPrivate: true,
      recurrenceFreq: true,
      googleEventId: true,
      googleEventEtag: true
    }
  });
  if (!entry) return { ok: false as const, reason: "not_found" as const };
  if (entry.recurrenceFreq !== "none") {
    return { ok: false as const, reason: "recurring_not_supported" as const };
  }

  const client = await getGoogleCalendarClient(entry.ownerUserId);
  if (!client) return { ok: false as const, reason: "not_connected" as const };

  const body = buildGoogleEventBody(entry);
  const cal = encodeURIComponent(client.calendarId);

  try {
    if (entry.googleEventId) {
      const updated = await googleApi<GoogleEventPayload>(
        client,
        `/calendars/${cal}/events/${encodeURIComponent(entry.googleEventId)}`,
        { method: "PATCH", body: JSON.stringify(body) }
      );
      await prisma.vendorCalendarEntry.update({
        where: { id: entry.id },
        data: {
          googleEventEtag: updated.etag ?? entry.googleEventEtag,
          googleEventUpdatedAt: updated.updated ? new Date(updated.updated) : new Date()
        }
      });
      return { ok: true as const, action: "updated" as const, googleEventId: entry.googleEventId };
    }

    const created = await googleApi<GoogleEventPayload>(client, `/calendars/${cal}/events`, {
      method: "POST",
      body: JSON.stringify(body)
    });
    if (!created.id) {
      return { ok: false as const, reason: "google_create_failed" as const };
    }
    await prisma.vendorCalendarEntry.update({
      where: { id: entry.id },
      data: {
        googleEventId: created.id,
        googleEventEtag: created.etag ?? null,
        googleEventUpdatedAt: created.updated ? new Date(created.updated) : new Date()
      }
    });
    return { ok: true as const, action: "created" as const, googleEventId: created.id };
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[google-calendar-sync] push failed", entryId, e);
    }
    return { ok: false as const, reason: "api_error" as const };
  }
}

export async function deleteVendorEntryFromGoogle(ownerUserId: string, googleEventId: string | null) {
  if (!googleEventId) return { ok: true as const, skipped: true as const };
  const client = await getGoogleCalendarClient(ownerUserId);
  if (!client) return { ok: false as const, reason: "not_connected" as const };

  const cal = encodeURIComponent(client.calendarId);
  try {
    await googleApi<void>(
      client,
      `/calendars/${cal}/events/${encodeURIComponent(googleEventId)}`,
      { method: "DELETE" }
    );
    return { ok: true as const };
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 404 || status === 410) return { ok: true as const, alreadyGone: true as const };
    return { ok: false as const, reason: "api_error" as const };
  }
}

function parseGoogleEventTimes(ev: GoogleEventPayload) {
  const startRaw = ev.start?.dateTime ?? ev.start?.date;
  const endRaw = ev.end?.dateTime ?? ev.end?.date;
  if (!startRaw || !endRaw) return null;
  const allDay = Boolean(ev.start?.date && !ev.start?.dateTime);
  const startAt = allDay ? new Date(`${startRaw}T00:00:00.000Z`) : new Date(startRaw);
  const endAt = allDay ? new Date(`${endRaw}T00:00:00.000Z`) : new Date(endRaw);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return null;
  return { startAt, endAt, allDay };
}

function mapGoogleToShowAs(ev: GoogleEventPayload): CalendarShowAs {
  if (ev.transparency === "transparent") return "free";
  if (ev.status === "tentative") return "tentative";
  return "busy";
}

export async function pullGoogleCalendarForUser(
  userId: string,
  catererId: string,
  rangeStart: Date,
  rangeEnd: Date
) {
  const client = await getGoogleCalendarClient(userId);
  if (!client) return { ok: false as const, reason: "not_connected" as const };

  const cal = encodeURIComponent(client.calendarId);
  const params = new URLSearchParams({
    timeMin: rangeStart.toISOString(),
    timeMax: rangeEnd.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    showDeleted: "false"
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;

  try {
    const list = await googleApi<{ items?: GoogleEventPayload[] }>(
      client,
      `/calendars/${cal}/events?${params}`
    );

    for (const ev of list.items ?? []) {
      if (!ev.id || ev.status === "cancelled") continue;
      if (ev.recurrence?.length) {
        skipped++;
        continue;
      }

      const times = parseGoogleEventTimes(ev);
      if (!times) {
        skipped++;
        continue;
      }

      const tripeseatsId = ev.extendedProperties?.private?.tripeseatsEntryId;
      const showAs = mapGoogleToShowAs(ev);
      const googleUpdated = ev.updated ? new Date(ev.updated) : new Date();

      let existing = tripeseatsId
        ? await prisma.vendorCalendarEntry.findFirst({
            where: { id: tripeseatsId, ownerUserId: userId },
            select: { id: true, updatedAt: true, googleEventUpdatedAt: true }
          })
        : null;

      if (!existing) {
        existing = await prisma.vendorCalendarEntry.findFirst({
          where: { ownerUserId: userId, googleEventId: ev.id },
          select: { id: true, updatedAt: true, googleEventUpdatedAt: true }
        });
      }

      const notes = ev.description?.trim() || null;
      const meetingMatch = notes?.match(/Join:\s*(https?:\/\/\S+)/i);
      const meetingUrl = meetingMatch?.[1] ?? null;
      const cleanNotes =
        meetingUrl && notes
          ? notes.replace(/\n?\n?Join:\s*https?:\/\/\S+/i, "").trim() || null
          : notes;

      if (existing) {
        const localNewer = existing.updatedAt.getTime() > googleUpdated.getTime();
        if (localNewer) {
          skipped++;
          continue;
        }
        await prisma.vendorCalendarEntry.update({
          where: { id: existing.id },
          data: {
            title: ev.summary?.trim() || "Untitled",
            notes: cleanNotes,
            location: ev.location ?? null,
            meetingUrl,
            startAt: times.startAt,
            endAt: times.endAt,
            allDay: times.allDay,
            showAs,
            googleEventId: ev.id,
            googleEventEtag: ev.etag ?? null,
            googleEventUpdatedAt: googleUpdated,
            recurrenceFreq: "none"
          }
        });
        updated++;
        continue;
      }

      await prisma.vendorCalendarEntry.create({
        data: {
          catererId,
          ownerUserId: userId,
          title: ev.summary?.trim() || "Untitled",
          notes: cleanNotes,
          location: ev.location ?? null,
          meetingUrl,
          startAt: times.startAt,
          endAt: times.endAt,
          allDay: times.allDay,
          showAs,
          recurrenceFreq: "none",
          googleEventId: ev.id,
          googleEventEtag: ev.etag ?? null,
          googleEventUpdatedAt: googleUpdated
        }
      });
      created++;
    }

    return { ok: true as const, created, updated, skipped };
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[google-calendar-sync] pull failed", userId, e);
    }
    return { ok: false as const, reason: "api_error" as const };
  }
}

export function queueGooglePush(entryId: string) {
  void pushVendorEntryToGoogle(entryId).catch(() => undefined);
}

export function queueGoogleDelete(ownerUserId: string, googleEventId: string | null) {
  void deleteVendorEntryFromGoogle(ownerUserId, googleEventId).catch(() => undefined);
}
