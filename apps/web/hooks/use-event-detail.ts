import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import { usePermissions } from "@/hooks/use-permissions";
import { api } from "@/lib/api";
import type { EventDetailPayload } from "@/lib/event-types";
import type { OrderModeValue, ServiceTypeValue } from "@/lib/event-customer-types";
import { denyMutation, handleMutationError } from "@/lib/mutation-guard";
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
  const { can } = usePermissions();
  const canWrite = can("events:write");
  const detailKey = queryKeys.events.detail(eventId ?? "");
  const statusSeqRef = useRef(0);
  const customerTypeSeqRef = useRef(0);

  const invalidateListsLater = () => {
    window.setTimeout(() => {
      void qc.invalidateQueries({ queryKey: queryKeys.events.all });
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    }, 0);
  };

  const patchCache = (updater: (old: EventDetailPayload) => EventDetailPayload) => {
    if (!canWrite || !eventId) return;
    qc.setQueryData<EventDetailPayload>(detailKey, (old) => (old ? updater(old) : old));
  };

  const statusMutation = useMutation({
    mutationFn: (status: string) => api.events.updateStatus(eventId!, status),
    onMutate: async (status) => {
      if (!canWrite) return denyMutation();
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
    onError: (err, _status, ctx) => {
      if (!ctx || ctx.opId !== statusSeqRef.current) return;
      if (ctx.prev) qc.setQueryData(detailKey, ctx.prev);
      handleMutationError(err, ctx, "Failed to update status");
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
      if (!canWrite) return denyMutation();
      const prev = qc.getQueryData<EventDetailPayload>(detailKey);
      patchCache((old) => ({ ...old, additionalNotes: notes }));
      return { prev };
    },
    onError: (err, _notes, ctx) => {
      if (ctx?.prev) qc.setQueryData(detailKey, ctx.prev);
      handleMutationError(err, ctx, "Failed to save notes");
    },
    onSuccess: (event) => qc.setQueryData(detailKey, event)
  });

  const guestMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.events.updateGuest(eventId!, data),
    onMutate: async (data) => {
      if (!canWrite) return denyMutation();
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
    onError: (err, _data, ctx) => {
      if (ctx?.prev) qc.setQueryData(detailKey, ctx.prev);
      handleMutationError(err, ctx, "Failed to update guest");
    },
    onSuccess: (event) => qc.setQueryData(detailKey, event)
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.events.update(eventId!, data),
    onMutate: async (data) => {
      if (!canWrite) return denyMutation();
      const prev = qc.getQueryData<EventDetailPayload>(detailKey);
      patchCache((old) => ({
        ...old,
        ...(typeof data.eventType === "string" ? { eventType: data.eventType as EventDetailPayload["eventType"] } : {}),
        ...(typeof data.serviceType === "string"
          ? { serviceType: data.serviceType as ServiceTypeValue }
          : {}),
        ...(typeof data.orderMode === "string"
          ? { orderMode: data.orderMode as OrderModeValue }
          : {}),
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
    onError: (err, _data, ctx) => {
      if (ctx?.prev) qc.setQueryData(detailKey, ctx.prev);
      handleMutationError(err, ctx, "Failed to update event");
    }
  });

  const customerTypeMutation = useMutation({
    mutationFn: (customerType: "b2b" | "b2c") =>
      api.events.updateCustomerType(eventId!, customerType),
    onMutate: async (customerType) => {
      if (!canWrite) return denyMutation();
      const opId = ++customerTypeSeqRef.current;
      await qc.cancelQueries({ queryKey: detailKey });
      const prev = qc.getQueryData<EventDetailPayload>(detailKey);
      patchCache((old) => ({ ...old, customerType }));
      return { prev, opId };
    },
    onError: (err, _customerType, ctx) => {
      if (!ctx || ctx.opId !== customerTypeSeqRef.current) return;
      if (ctx.prev) qc.setQueryData(detailKey, ctx.prev);
      handleMutationError(err, ctx, "Failed to update customer type");
    },
    onSuccess: (res, _customerType, ctx) => {
      if (!ctx || ctx.opId !== customerTypeSeqRef.current) return;
      if (res.event) {
        qc.setQueryData(detailKey, res.event);
      }
      invalidateListsLater();
    }
  });

  const changeCustomerType = useCallback(
    (newType: "b2b" | "b2c") => {
      if (!eventId || !canWrite) return;
      customerTypeMutation.mutate(newType);
    },
    [eventId, canWrite, customerTypeMutation]
  );

  const timeMutation = useMutation({
    mutationFn: (eventTime: string | null) => api.events.updateTime(eventId!, eventTime),
    onMutate: async (eventTime) => {
      if (!canWrite) return denyMutation();
      const prev = qc.getQueryData<EventDetailPayload>(detailKey);
      patchCache((old) => ({ ...old, eventTime }));
      return { prev };
    },
    onError: (err, _eventTime, ctx) => {
      if (ctx?.prev) qc.setQueryData(detailKey, ctx.prev);
      handleMutationError(err, ctx, "Failed to update event time");
    },
    onSuccess: (event) => qc.setQueryData(detailKey, event)
  });

  return {
    statusMutation,
    notesMutation,
    guestMutation,
    updateMutation,
    timeMutation,
    changeCustomerType,
    canWriteEvents: canWrite,
    isSaving:
      statusMutation.isPending ||
      notesMutation.isPending ||
      guestMutation.isPending ||
      updateMutation.isPending ||
      timeMutation.isPending
  };
}
