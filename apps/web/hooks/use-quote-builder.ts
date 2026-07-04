import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { QuoteLineItem } from "@/components/quote/types";
import { api } from "@/lib/api";
import type { QuoteBuilderPayload } from "@/lib/quote-builder-api";
import { resolveCreatedLineItem } from "@/lib/quote-line-items";
import { queryKeys } from "@/lib/query-keys";

export function useQuoteBuilderQuery(eventId: string | null) {
  return useQuery({
    queryKey: queryKeys.quotes.builder(eventId ?? ""),
    queryFn: () => api.quotes.builder(eventId!),
    enabled: Boolean(eventId),
    staleTime: 2 * 60 * 1000
  });
}

type BuilderData = QuoteBuilderPayload;

export function useQuoteBuilderMutations(eventId: string | null) {
  const qc = useQueryClient();
  const builderKey = queryKeys.quotes.builder(eventId ?? "");

  const patchBuilder = (
    updater: (old: BuilderData) => BuilderData
  ) => {
    qc.setQueryData<BuilderData>(builderKey, (old) => (old ? updater(old) : old));
  };

  const addItemMutation = useMutation({
    mutationFn: ({
      quoteId,
      item
    }: {
      quoteId: string;
      item: Record<string, unknown>;
      tempItem: QuoteLineItem;
    }) => api.quotes.addItem(quoteId, item),
    onMutate: async ({ tempItem }) => {
      await qc.cancelQueries({ queryKey: builderKey });
      const prev = qc.getQueryData<BuilderData>(builderKey);
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          lineItems: [...(old.quote.lineItems ?? []), tempItem]
        }
      }));
      return { prev, tempItem };
    },
    onSuccess: (result, _vars, ctx) => {
      if (!ctx?.tempItem) return;
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          ...result.quote,
          lineItems: old.quote.lineItems.map((item) =>
            item.id === ctx.tempItem.id
              ? resolveCreatedLineItem(result.quote.lineItems, old.quote.lineItems, {
                  category: item.category,
                  name: item.name,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  unitType: item.unitType,
                  menuItemId: item.menuItemId ?? undefined
                }) ?? item
              : item
          )
        }
      }));
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(builderKey, ctx.prev);
      toast.error("Failed to add item");
    }
  });

  const removeItemMutation = useMutation({
    mutationFn: ({ quoteId, itemId }: { quoteId: string; itemId: string }) =>
      api.quotes.removeItem(quoteId, itemId),
    onMutate: async ({ itemId }) => {
      const prev = qc.getQueryData<BuilderData>(builderKey);
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          lineItems: old.quote.lineItems.filter((item) => item.id !== itemId)
        }
      }));
      return { prev };
    },
    onSuccess: (result) => {
      patchBuilder((old) => ({ ...old, quote: { ...old.quote, ...result.quote } }));
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(builderKey, ctx.prev);
      toast.error("Failed to remove item");
    }
  });

  const updateItemMutation = useMutation({
    mutationFn: ({
      quoteId,
      itemId,
      data
    }: {
      quoteId: string;
      itemId: string;
      data: Record<string, unknown>;
    }) => api.quotes.updateItem(quoteId, itemId, data),
    onMutate: async ({ itemId, data }) => {
      const prev = qc.getQueryData<BuilderData>(builderKey);
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          lineItems: old.quote.lineItems.map((item) =>
            item.id === itemId ? { ...item, ...data } : item
          )
        }
      }));
      return { prev };
    },
    onSuccess: (result) => {
      patchBuilder((old) => ({ ...old, quote: { ...old.quote, ...result.quote } }));
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(builderKey, ctx.prev);
      toast.error("Failed to update item");
    }
  });

  const updateQuoteMutation = useMutation({
    mutationFn: ({ quoteId, data }: { quoteId: string; data: Record<string, unknown> }) =>
      api.quotes.update(quoteId, data),
    onSuccess: (result) => {
      patchBuilder((old) => ({ ...old, quote: { ...old.quote, ...result.quote } }));
    },
    onError: () => toast.error("Failed to save quote")
  });

  const addPackageMutation = useMutation({
    mutationFn: ({ quoteId, packageId }: { quoteId: string; packageId: string }) =>
      api.quotes.addPackage(quoteId, packageId),
    onSuccess: (result) => {
      patchBuilder((old) => ({ ...old, quote: result.quote }));
    },
    onError: () => toast.error("Failed to add package")
  });

  const removePackageMutation = useMutation({
    mutationFn: (quoteId: string) => api.quotes.removePackage(quoteId),
    onSuccess: (result) => {
      patchBuilder((old) => ({ ...old, quote: result.quote }));
    },
    onError: () => toast.error("Failed to remove package")
  });

  const updateGuestCountMutation = useMutation({
    mutationFn: ({ quoteId, guestCount }: { quoteId: string; guestCount: number }) =>
      api.quotes.updateGuestCount(quoteId, guestCount),
    onSuccess: (result) => {
      patchBuilder((old) => ({ ...old, quote: result.quote }));
    },
    onError: () => toast.error("Failed to update guest count")
  });

  const duplicateMutation = useMutation({
    mutationFn: (quoteId: string) => api.quotes.duplicate(quoteId),
    onSuccess: (result) => {
      patchBuilder((old) => ({ ...old, quote: result.quote }));
      toast.success("Quote duplicated.");
    },
    onError: () => toast.error("Failed to duplicate quote")
  });

  const isMutating =
    addItemMutation.isPending ||
    removeItemMutation.isPending ||
    updateItemMutation.isPending ||
    updateQuoteMutation.isPending ||
    addPackageMutation.isPending ||
    removePackageMutation.isPending ||
    updateGuestCountMutation.isPending;

  return {
    addItemMutation,
    removeItemMutation,
    updateItemMutation,
    updateQuoteMutation,
    addPackageMutation,
    removePackageMutation,
    updateGuestCountMutation,
    duplicateMutation,
    isMutating,
    isSaving: updateQuoteMutation.isPending,
    isSaveSuccess: updateQuoteMutation.isSuccess,
    isSaveError: updateQuoteMutation.isError
  };
}
