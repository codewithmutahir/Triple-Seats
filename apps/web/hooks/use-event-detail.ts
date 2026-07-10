import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type { EventDetailPayload } from "@/lib/event-types";
import { quoteAnalytics } from "@/lib/quote-analytics";
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
  const statusSeqRef = useRef(0);
  const customerTypeMutationInFlight = useRef(false);

  const invalidateListsLater = () => {
    window.setTimeout(() => {
      void qc.invalidateQueries({ queryKey: queryKeys.events.all });
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    }, 0);
  };

  const patchCache = (updater: (old: EventDetailPayload) => EventDetailPayload) => {
    if (!eventId) return;
    qc.setQueryData<EventDetailPayload>(detailKey, (old) => (old ? updater(old) : old));
  };

  const statusMutation = useMutation({
    mutationFn: (status: string) => api.events.updateStatus(eventId!, status),
    onMutate: async (status) => {
      const opId = ++statusSeqRef.current;
      await qc.cancelQueries({ queryKey: detailKey });
      const prev = qc.getQueryData<EventDetailPayload>(detailKey);
      if (prev && prev.status !== status && eventId) {
        quoteAnalytics.eventStatusChanged({
          eventId,
          fromStatus: prev.status,
          toStatus: status
        });
      }
      patchCache((old) => ({
        ...old,
        status,
        activity:
          old.status === status
            ? old.activity
            : [
                ...old.activity,
                {
                  at: new Date().toISOString(),
                  type: "status",
                  label: `Status changed to ${status}`
                }
              ]
      }));
      return { prev, opId };
    },
    onError: (_err, _status, ctx) => {
      if (!ctx || ctx.opId !== statusSeqRef.current) return;
      if (ctx.prev) qc.setQueryData(detailKey, ctx.prev);
      toast.error("Failed to update status");
    },
    onSuccess: (event, _status, ctx) => {
      if (!ctx || ctx.opId !== statusSeqRef.current) return;
      qc.setQueryData(detailKey, event);
      invalidateListsLater();
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
    onMutate: async (data) => {
      const prev = qc.getQueryData<EventDetailPayload>(detailKey);
      patchCache((old) => ({
        ...old,
        ...(typeof data.eventType === "string" ? { eventType: data.eventType as EventDetailPayload["eventType"] } : {}),
        ...(typeof data.customerType === "string"
          ? { customerType: data.customerType as EventDetailPayload["customerType"] }
          : {})
      }));
      return { prev };
    },
    onSuccess: (event) => {
      qc.setQueryData(detailKey, event);
      invalidateListsLater();
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.prev) qc.setQueryData(detailKey, ctx.prev);
      toast.error("Failed to update event");
    }
  });

  const changeCustomerType = useCallback(
    async (newType: "b2b" | "b2c") => {
      if (!eventId || customerTypeMutationInFlight.current) return;
      customerTypeMutationInFlight.current = true;

      qc.setQueryData<EventDetailPayload>(detailKey, (old) =>
        old ? { ...old, customerType: newType } : old
      );

      try {
        await api.events.updateCustomerType(eventId, newType);
        window.setTimeout(() => {
          void qc.invalidateQueries({ queryKey: queryKeys.events.all });
          void qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
        }, 0);
      } catch {
        void qc.invalidateQueries({ queryKey: detailKey });
        toast.error("Failed to update customer type");
      } finally {
        customerTypeMutationInFlight.current = false;
      }
    },
    [eventId, qc, detailKey]
  );

  return {
    statusMutation,
    notesMutation,
    guestMutation,
    updateMutation,
    changeCustomerType,
    isSaving:
      statusMutation.isPending ||
      notesMutation.isPending ||
      guestMutation.isPending ||
      updateMutation.isPending
  };
}
