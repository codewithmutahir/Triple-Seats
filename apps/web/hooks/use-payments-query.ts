import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { usePermissions } from "@/hooks/use-permissions";
import { api } from "@/lib/api";
import { denyMutation, handleMutationError } from "@/lib/mutation-guard";
import type { EventPaymentsPayload, PaymentMethod } from "@/lib/payment-types";
import { queryKeys } from "@/lib/query-keys";

export function useEventPaymentsQuery(eventId: string | null) {
  return useQuery({
    queryKey: queryKeys.payments.byEvent(eventId ?? ""),
    queryFn: () => api.payments.byEvent(eventId!),
    enabled: Boolean(eventId),
    staleTime: 60_000
  });
}

export function useEventPaymentsMutations(eventId: string | null) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canWrite = can("events:write");
  const key = queryKeys.payments.byEvent(eventId ?? "");

  const recordMutation = useMutation({
    mutationFn: (body: {
      amount: number;
      method: PaymentMethod;
      note?: string;
      paymentDate?: string;
    }) => api.payments.create({ ...body, eventId: eventId! }),
    onMutate: async (body) => {
      if (!canWrite || !eventId) return denyMutation();
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<EventPaymentsPayload>(key);
      const tempId = `temp_${Date.now()}`;
      qc.setQueryData<EventPaymentsPayload>(key, (old) => {
        if (!old) return old;
        const optimistic = {
          id: tempId,
          eventId,
          quoteId: old.quoteId,
          amount: body.amount,
          method: body.method,
          status: "completed",
          note: body.note ?? null,
          addedBy: "you",
          addedByName: "You",
          paymentDate: body.paymentDate ?? new Date().toISOString(),
          createdAt: new Date().toISOString()
        };
        const totalPaid = old.totalPaid + body.amount;
        return {
          ...old,
          totalPaid,
          balanceDue: Math.max(0, old.quoteTotal - totalPaid),
          payments: [optimistic, ...old.payments]
        };
      });
      return { prev, tempId };
    },
    onSuccess: (data) => {
      qc.setQueryData<EventPaymentsPayload>(key, (old) =>
        old
          ? {
              ...old,
              quoteId: data.quoteId,
              quoteTotal: data.quoteTotal,
              totalPaid: data.totalPaid,
              balanceDue: data.balanceDue,
              payments: data.payments
            }
          : old
      );
    },
    onError: (err, _body, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      handleMutationError(err, ctx, "Failed to record payment");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (paymentId: string) => api.payments.delete(paymentId),
    onMutate: async (paymentId) => {
      if (!canWrite) return denyMutation();
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<EventPaymentsPayload>(key);
      qc.setQueryData<EventPaymentsPayload>(key, (old) => {
        if (!old) return old;
        const removed = old.payments.find((p) => p.id === paymentId);
        const totalPaid = removed ? old.totalPaid - removed.amount : old.totalPaid;
        return {
          ...old,
          totalPaid: Math.max(0, totalPaid),
          balanceDue: Math.max(0, old.quoteTotal - Math.max(0, totalPaid)),
          payments: old.payments.filter((p) => p.id !== paymentId)
        };
      });
      return { prev };
    },
    onSuccess: (data) => {
      qc.setQueryData<EventPaymentsPayload>(key, (old) =>
        old
          ? {
              ...old,
              quoteId: data.quoteId,
              quoteTotal: data.quoteTotal,
              totalPaid: data.totalPaid,
              balanceDue: data.balanceDue,
              payments: data.payments
            }
          : old
      );
    },
    onError: (err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      handleMutationError(err, ctx, "Failed to delete payment");
    }
  });

  return {
    recordMutation,
    deleteMutation,
    canWritePayments: canWrite
  };
}
