import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

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

  const statusMutation = useMutation({
    mutationFn: (newStatus: string) => {
      if (!eventId) return Promise.reject(new Error("No event ID"));
      return api.events.updateStatus(eventId, newStatus);
    },
    onMutate: async (newStatus) => {
      await qc.cancelQueries({ queryKey: detailKey });
      const prev = qc.getQueryData(detailKey);
      statusSeqRef.current += 1;
      const seq = statusSeqRef.current;
      if (prev) {
        qc.setQueryData(detailKey, { ...prev, status: newStatus });
      }
      return { prev, seq };
    },
    onSuccess: (_data, _vars, ctx) => {
      if (ctx?.seq === statusSeqRef.current) {
        invalidateListsLater();
      }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(detailKey, ctx.prev);
      toast.error("Failed to update status");
    }
  });

  const notesMutation = useMutation({
    mutationFn: (newNotes: string | null) => {
      if (!eventId) return Promise.reject(new Error("No event ID"));
      return api.events.updateNotes(eventId, newNotes);
    },
    onMutate: async (newNotes) => {
      await qc.cancelQueries({ queryKey: detailKey });
      const prev = qc.getQueryData(detailKey);
      if (prev) {
        qc.setQueryData(detailKey, { ...prev, notes: newNotes });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(detailKey, ctx.prev);
      toast.error("Failed to update notes");
    }
  });

  const guestMutation = useMutation({
    mutationFn: (data: { guestId: string; firstName: string; lastName?: string | null; email?: string | null; phone?: string | null }) =>
      api.events.updateGuest(eventId ?? "", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: detailKey });
      void qc.invalidateQueries({ queryKey: queryKeys.events.all });
    },
    onError: () => {
      toast.error("Failed to update guest");
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      if (!eventId) throw new Error("No event ID");
      const res = await api.events.update(eventId, patch);
      return res;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: detailKey });
      invalidateListsLater();
    },
    onError: () => {
      toast.error("Failed to update event");
    }
  });

  const changeCustomerType = useCallback(
    async (newType: "b2b" | "b2c") => {
      if (!eventId || customerTypeMutationInFlight.current) return;
      customerTypeMutationInFlight.current = true;

      qc.setQueryData(detailKey, (old: any) =>
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
