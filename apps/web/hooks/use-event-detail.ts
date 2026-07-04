import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type { EventDetailPayload } from "@/lib/event-types";
import { queryKeys } from "@/lib/query-keys";

export function useEventDetailQuery(eventId: string | null) {
  return useQuery({
    queryKey: queryKeys.events.detail(eventId ?? ""),
    queryFn: () => api.events.detail(eventId!),
    enabled: Boolean(eventId),
    staleTime: 60 * 1000
  });
}

export function useEventDetailMutations(eventId: string | null) {
  const qc = useQueryClient();
  const detailKey = queryKeys.events.detail(eventId ?? "");

  const invalidateLists = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.events.all });
    void qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  };

  const patchCache = (updater: (old: EventDetailPayload) => EventDetailPayload) => {
    if (!eventId) return;
    qc.setQueryData<EventDetailPayload>(detailKey, (old) => (old ? updater(old) : old));
  };

  const statusMutation = useMutation({
    mutationFn: (status: string) => api.events.updateStatus(eventId!, status),
    onMutate: async (status) => {
      await qc.cancelQueries({ queryKey: detailKey });
      const prev = qc.getQueryData<EventDetailPayload>(detailKey);
      patchCache((old) => ({ ...old, status }));
      return { prev };
    },
    onError: (_err, _status, ctx) => {
      if (ctx?.prev) qc.setQueryData(detailKey, ctx.prev);
      toast.error("Failed to update status");
    },
    onSuccess: (event) => {
      qc.setQueryData(detailKey, event);
      invalidateLists();
    }
  });

  const notesMutation = useMutation({
    mutationFn: (notes: string) => api.events.updateNotes(eventId!, notes),
    onMutate: async (notes) => {
      const prev = qc.getQueryData<EventDetailPayload>(detailKey);
      patchCache((old) => ({ ...old, additionalNotes: notes }));
      return { prev };
    },
    onError: (_err, _notes, ctx) => {
      if (ctx?.prev) qc.setQueryData(detailKey, ctx.prev);
      toast.error("Failed to save notes");
    },
    onSuccess: (event) => qc.setQueryData(detailKey, event)
  });

  const guestMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.events.updateGuest(eventId!, data),
    onMutate: async (data) => {
      const prev = qc.getQueryData<EventDetailPayload>(detailKey);
      patchCache((old) => ({
        ...old,
        guestCountEstimate:
          typeof data.guestCount === "number"
            ? data.guestCount
            : old.guestCountEstimate,
        primaryGuest: old.primaryGuest
          ? {
              ...old.primaryGuest,
              firstName: (data.firstName as string) ?? old.primaryGuest.firstName,
              lastName: (data.lastName as string | null) ?? old.primaryGuest.lastName,
              email: (data.email as string | null) ?? old.primaryGuest.email,
              phone: (data.phone as string | null) ?? old.primaryGuest.phone
            }
          : old.primaryGuest
      }));
      return { prev };
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.prev) qc.setQueryData(detailKey, ctx.prev);
      toast.error("Failed to update guest");
    },
    onSuccess: (event) => qc.setQueryData(detailKey, event)
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.events.update(eventId!, data),
    onSuccess: (event) => {
      qc.setQueryData(detailKey, event);
      invalidateLists();
    },
    onError: () => toast.error("Failed to update event")
  });

  return {
    statusMutation,
    notesMutation,
    guestMutation,
    updateMutation,
    isSaving:
      statusMutation.isPending ||
      notesMutation.isPending ||
      guestMutation.isPending ||
      updateMutation.isPending
  };
}
