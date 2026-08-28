"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { VendorCalendarEntry, VendorCalendarEntryInput } from "@/lib/vendor-calendar-types";
import { showAsColor } from "@/lib/vendor-calendar-types";

function defaultRecurrenceFields(body: VendorCalendarEntryInput) {
  return {
    recurrenceFreq: body.recurrenceFreq ?? "none",
    recurrenceInterval: body.recurrenceInterval ?? 1,
    recurrenceDaysOfWeek: body.recurrenceDaysOfWeek ?? null,
    recurrenceEndAt: body.recurrenceEndAt ?? null,
    recurrenceCount: body.recurrenceCount ?? null,
    reminderMinutesBefore: body.reminderMinutesBefore ?? null
  } as const;
}

export function useVendorCalendarDirectory() {
  return useQuery({
    queryKey: queryKeys.vendorCalendar.directory(),
    queryFn: () => api.vendorCalendar.directory(),
    staleTime: 60_000
  });
}

export function useVendorCalendarEntries(opts: {
  ownerUserId: string;
  start: string;
  end: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: queryKeys.vendorCalendar.entries(opts.ownerUserId, opts.start, opts.end),
    queryFn: () =>
      api.vendorCalendar.entries({
        start: opts.start,
        end: opts.end,
        ownerUserId: opts.ownerUserId
      }),
    staleTime: 60_000,
    enabled: opts.enabled !== false && Boolean(opts.ownerUserId && opts.start && opts.end)
  });
}

export function useVendorCalendarMutations(ownerUserId: string, start: string, end: string) {
  const qc = useQueryClient();
  const key = queryKeys.vendorCalendar.entries(ownerUserId, start, end);

  const create = useMutation({
    mutationFn: (body: VendorCalendarEntryInput) => api.vendorCalendar.create(body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: key });
      const snapshot = qc.getQueryData<{ items: VendorCalendarEntry[] }>(key);
      const tempId = `temp_${Date.now()}`;
      const showAs = body.showAs ?? "busy";
      const optimistic: VendorCalendarEntry = {
        id: tempId,
        occurrenceId: tempId,
        seriesId: tempId,
        isRecurrenceInstance: false,
        catererId: "temp",
        ownerUserId,
        title: body.title,
        notes: body.notes ?? null,
        location: body.location ?? null,
        startAt: body.startAt,
        endAt: body.endAt,
        allDay: body.allDay ?? false,
        showAs,
        isPrivate: body.isPrivate ?? false,
        ...defaultRecurrenceFields(body),
        meetingUrl: body.meetingUrl ?? null,
        colorHex: body.colorHex ?? null,
        attendees: (body.attendees ?? []).map((a, i) => ({
          id: `temp_att_${i}`,
          email: a.email,
          name: a.name ?? null
        })),
        color: showAsColor(showAs, body.colorHex),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      qc.setQueryData(key, (old: { items: VendorCalendarEntry[] } | undefined) => ({
        items: [...(old?.items ?? []), optimistic].sort(
          (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
        )
      }));
      return { snapshot, tempId };
    },
    onSuccess: (server, _body, ctx) => {
      qc.setQueryData(key, (old: { items: VendorCalendarEntry[] } | undefined) => {
        if (!old) return { items: [server] };
        return {
          items: old.items.map((item) =>
            item.id === ctx?.tempId
              ? { ...server, occurrenceId: server.occurrenceId ?? server.id }
              : item
          )
        };
      });
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(key, ctx.snapshot);
      toast.error("Could not create entry — changes reverted");
    }
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<VendorCalendarEntryInput> }) =>
      api.vendorCalendar.update(id, body),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: key });
      const snapshot = qc.getQueryData<{ items: VendorCalendarEntry[] }>(key);
      qc.setQueryData(key, (old: { items: VendorCalendarEntry[] } | undefined) => {
        if (!old) return old;
        return {
          items: old.items.map((item) =>
            item.seriesId === id
              ? {
                  ...item,
                  ...body,
                  notes: body.notes !== undefined ? body.notes : item.notes,
                  location: body.location !== undefined ? body.location : item.location,
                  recurrenceFreq: body.recurrenceFreq ?? item.recurrenceFreq,
                  recurrenceInterval: body.recurrenceInterval ?? item.recurrenceInterval,
                  recurrenceDaysOfWeek:
                    body.recurrenceDaysOfWeek !== undefined
                      ? body.recurrenceDaysOfWeek
                      : item.recurrenceDaysOfWeek,
                  recurrenceEndAt:
                    body.recurrenceEndAt !== undefined ? body.recurrenceEndAt : item.recurrenceEndAt,
                  recurrenceCount:
                    body.recurrenceCount !== undefined ? body.recurrenceCount : item.recurrenceCount,
                  reminderMinutesBefore:
                    body.reminderMinutesBefore !== undefined
                      ? body.reminderMinutesBefore
                      : item.reminderMinutesBefore,
                  updatedAt: new Date().toISOString()
                }
              : item
          )
        };
      });
      return { snapshot };
    },
    onSuccess: (server) => {
      void qc.invalidateQueries({ queryKey: key });
      qc.setQueryData(key, (old: { items: VendorCalendarEntry[] } | undefined) => {
        if (!old) return { items: [server] };
        return {
          items: old.items.map((item) =>
            item.seriesId === server.id ? { ...item, id: server.id } : item
          )
        };
      });
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(key, ctx.snapshot);
      toast.error("Could not update entry — changes reverted");
    }
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.vendorCalendar.remove(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const snapshot = qc.getQueryData<{ items: VendorCalendarEntry[] }>(key);
      qc.setQueryData(key, (old: { items: VendorCalendarEntry[] } | undefined) => {
        if (!old) return old;
        return { items: old.items.filter((item) => item.seriesId !== id) };
      });
      return { snapshot };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(key, ctx.snapshot);
      toast.error("Could not delete entry — changes reverted");
    }
  });

  const duplicate = useMutation({
    mutationFn: ({ id, body }: { id: string; body?: { startAt?: string; endAt?: string } }) =>
      api.vendorCalendar.duplicate(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
      toast.success("Entry duplicated");
    },
    onError: () => toast.error("Could not duplicate entry")
  });

  const copyToMyCalendar = useMutation({
    mutationFn: ({ id, body }: { id: string; body?: { startAt?: string; endAt?: string } }) =>
      api.vendorCalendar.copyToMyCalendar(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.vendorCalendar.directory() });
      toast.success("Copied to your calendar");
    },
    onError: () => toast.error("Could not copy entry")
  });

  return { create, update, remove, duplicate, copyToMyCalendar };
}

export function useVendorCalendarGrants(enabled: boolean) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: queryKeys.vendorCalendar.grants(),
    queryFn: () => api.vendorCalendar.grants(),
    staleTime: 60_000,
    enabled
  });

  const createGrant = useMutation({
    mutationFn: (body: { granteeUserId: string; targetUserId: string; scope?: "view" | "edit" }) =>
      api.vendorCalendar.createGrant(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.vendorCalendar.grants() });
      void qc.invalidateQueries({ queryKey: queryKeys.vendorCalendar.directory() });
      toast.success("Access granted");
    },
    onError: () => toast.error("Could not grant access")
  });

  const revokeGrant = useMutation({
    mutationFn: (id: string) => api.vendorCalendar.revokeGrant(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.vendorCalendar.grants() });
      const snapshot = qc.getQueryData(queryKeys.vendorCalendar.grants());
      qc.setQueryData(queryKeys.vendorCalendar.grants(), (old: { items: { id: string }[] } | undefined) => {
        if (!old) return old;
        return { items: old.items.filter((g) => g.id !== id) };
      });
      return { snapshot };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.vendorCalendar.directory() });
      toast.success("Access revoked");
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(queryKeys.vendorCalendar.grants(), ctx.snapshot);
      toast.error("Could not revoke access — changes reverted");
    }
  });

  return { list, createGrant, revokeGrant };
}

export function useGoogleCalendarSync(enabled: boolean) {
  const qc = useQueryClient();

  const status = useQuery({
    queryKey: queryKeys.vendorCalendar.googleStatus(),
    queryFn: () => api.vendorCalendar.googleStatus(),
    staleTime: 60_000,
    enabled
  });

  const disconnect = useMutation({
    mutationFn: () => api.vendorCalendar.googleDisconnect(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.vendorCalendar.googleStatus() });
      toast.success("Google Calendar disconnected");
    },
    onError: () => toast.error("Could not disconnect Google Calendar")
  });

  const sync = useMutation({
    mutationFn: (body?: { start?: string; end?: string }) => api.vendorCalendar.googleSync(body),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: queryKeys.vendorCalendar.all });
      toast.success(
        `Synced from Google — ${result.created ?? 0} new, ${result.updated ?? 0} updated`
      );
    },
    onError: () => toast.error("Google sync failed")
  });

  const connect = () => {
    window.location.href = "/api/vendor-calendar/google/oauth/start";
  };

  return { status, disconnect, sync, connect };
}

export function useVendorCalendarExternalInvites(enabled: boolean) {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: queryKeys.vendorCalendar.externalInvites(),
    queryFn: () => api.vendorCalendar.externalInvites(),
    staleTime: 60_000,
    enabled
  });

  const invite = useMutation({
    mutationFn: (body: { email: string; name?: string }) =>
      api.vendorCalendar.inviteExternal(body),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: queryKeys.vendorCalendar.externalInvites() });
      void qc.invalidateQueries({ queryKey: queryKeys.vendorCalendar.directory() });
      toast.success(
        result.emailSent
          ? "Invitation sent — they'll get vendor calendar access only"
          : "Invite created — email could not be sent (check Resend settings)"
      );
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Could not send invitation")
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.vendorCalendar.revokeExternalInvite(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.vendorCalendar.externalInvites() });
      const snapshot = qc.getQueryData(queryKeys.vendorCalendar.externalInvites());
      qc.setQueryData(
        queryKeys.vendorCalendar.externalInvites(),
        (old: { items: { id: string }[] } | undefined) => {
          if (!old) return old;
          return { items: old.items.filter((i) => i.id !== id) };
        }
      );
      return { snapshot };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.vendorCalendar.directory() });
      toast.success("Invitation revoked");
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(queryKeys.vendorCalendar.externalInvites(), ctx.snapshot);
      toast.error("Could not revoke invitation");
    }
  });

  return { list, invite, revoke };
}
