"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { VendorCalendarEntry, VendorCalendarEntryInput } from "@/lib/vendor-calendar-types";

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
      const optimistic: VendorCalendarEntry = {
        id: tempId,
        catererId: "temp",
        ownerUserId,
        title: body.title,
        notes: body.notes ?? null,
        location: body.location ?? null,
        startAt: body.startAt,
        endAt: body.endAt,
        allDay: body.allDay ?? false,
        showAs: body.showAs ?? "busy",
        isPrivate: body.isPrivate ?? false,
        color:
          body.showAs === "free"
            ? "#10B981"
            : body.showAs === "tentative"
              ? "#F59E0B"
              : body.showAs === "oof"
                ? "#6B7280"
                : "#1B2A4A",
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
          items: old.items.map((item) => (item.id === ctx?.tempId ? { ...item, id: server.id } : item))
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
            item.id === id
              ? {
                  ...item,
                  ...body,
                  notes: body.notes !== undefined ? body.notes : item.notes,
                  location: body.location !== undefined ? body.location : item.location,
                  updatedAt: new Date().toISOString()
                }
              : item
          )
        };
      });
      return { snapshot };
    },
    onSuccess: (server) => {
      qc.setQueryData(key, (old: { items: VendorCalendarEntry[] } | undefined) => {
        if (!old) return { items: [server] };
        return {
          items: old.items.map((item) => (item.id === server.id ? { ...item, id: server.id } : item))
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
        return { items: old.items.filter((item) => item.id !== id) };
      });
      return { snapshot };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(key, ctx.snapshot);
      toast.error("Could not delete entry — changes reverted");
    }
  });

  return { create, update, remove };
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
