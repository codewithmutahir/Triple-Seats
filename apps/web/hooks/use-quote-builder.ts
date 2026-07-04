import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "sonner";

import type { CateringPackage, QuoteLineItem } from "@/components/quote/types";
import { api } from "@/lib/api";
import type { QuoteBuilderPayload } from "@/lib/quote-builder-api";
import { resolveCreatedLineItem } from "@/lib/quote-line-items";
import { queryKeys } from "@/lib/query-keys";
import { formatTierLabel, getActiveTier } from "@/lib/quote-totals";

export function useQuoteBuilderQuery(eventId: string | null) {
  return useQuery({
    queryKey: queryKeys.quotes.builder(eventId ?? ""),
    queryFn: () => api.quotes.builder(eventId!),
    enabled: Boolean(eventId),
    staleTime: 2 * 60 * 1000
  });
}

type BuilderData = QuoteBuilderPayload;

function normalizeItemPatch(
  item: QuoteLineItem | undefined,
  data: Record<string, unknown>
): Record<string, unknown> {
  const patch = { ...data };
  if (item?.category === "equipment" && patch.unitType === "per_head") {
    patch.unitType = "per_piece";
  }
  return patch;
}

function mergeQuoteLineItem(
  old: BuilderData,
  quoteId: string,
  itemId: string,
  serverQuote: BuilderData["quote"]
): BuilderData {
  const serverItem = serverQuote.lineItems.find((item) => item.id === itemId);
  return {
    ...old,
    quote: {
      ...old.quote,
      totalAmount: serverQuote.totalAmount,
      lineItems: serverItem
        ? old.quote.lineItems.map((item) => (item.id === itemId ? serverItem : item))
        : serverQuote.lineItems
    }
  };
}

function createWriteQueue() {
  let tail: Promise<void> = Promise.resolve();
  return <T,>(work: () => Promise<T>): Promise<T> => {
    const next = tail.then(work, work);
    tail = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  };
}

type GuestCountApiResult = Awaited<ReturnType<typeof api.quotes.updateGuestCount>>;

function createCoalescedGuestCountWriter(
  enqueue: <T>(work: () => Promise<T>) => Promise<T>,
  apiCall: (quoteId: string, guestCount: number) => Promise<GuestCountApiResult>
) {
  let pending: { quoteId: string; guestCount: number } | null = null;
  let waiters: Array<{
    resolve: (value: GuestCountApiResult) => void;
    reject: (reason?: unknown) => void;
  }> = [];
  let flushScheduled = false;

  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;

    void enqueue(async () => {
      flushScheduled = false;

      while (pending) {
        const { quoteId, guestCount } = pending;
        pending = null;
        const batch = waiters;
        waiters = [];

        try {
          const result = await apiCall(quoteId, guestCount);
          for (const waiter of batch) {
            waiter.resolve(result);
          }
        } catch (error) {
          for (const waiter of batch) {
            waiter.reject(error);
          }
          if (!pending) throw error;
        }
      }
    }).catch(() => undefined);
  }

  return (quoteId: string, guestCount: number): Promise<GuestCountApiResult> =>
    new Promise((resolve, reject) => {
      pending = { quoteId, guestCount };
      waiters.push({ resolve, reject });
      scheduleFlush();
    });
}

function buildOptimisticPackageLine(
  quote: BuilderData["quote"],
  pkg: CateringPackage
): QuoteLineItem {
  const guestCount = quote.event?.guestCountEstimate ?? 0;
  const customerType = quote.event?.customerType ?? "b2c";
  const tier = getActiveTier(pkg.tiers, guestCount, customerType);

  return {
    id: `temp_pkg_${Date.now()}`,
    quoteId: quote.id,
    menuItemId: null,
    packageId: pkg.id,
    category: "other",
    name: pkg.name,
    quantity: 1,
    unitPrice: tier?.pricePerHead ?? 0,
    unitType: "tiered_per_head",
    appliedTier: tier?.pricePerHead ?? null,
    appliedTierLabel: tier ? formatTierLabel(tier) : null,
    notes: tier ? formatTierLabel(tier) : null,
    package: {
      id: pkg.id,
      name: pkg.name,
      minGuests: pkg.minGuests,
      tiers: pkg.tiers,
      items: pkg.items
    }
  };
}

export function useQuoteBuilderMutations(eventId: string | null) {
  const qc = useQueryClient();
  const builderKey = queryKeys.quotes.builder(eventId ?? "");
  const latestGuestCountRef = useRef<number | null>(null);
  const mutationSeqRef = useRef(0);
  const quoteWriteQueueRef = useRef(createWriteQueue());
  const guestCountWriterRef = useRef(
    createCoalescedGuestCountWriter(
      (work) => quoteWriteQueueRef.current(work),
      (quoteId, guestCount) => api.quotes.updateGuestCount(quoteId, guestCount)
    )
  );
  const bumpOp = () => ++mutationSeqRef.current;
  const isLatestOp = (opId: number) => opId === mutationSeqRef.current;

  const patchBuilder = (updater: (old: BuilderData) => BuilderData) => {
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
      const opId = bumpOp();
      await qc.cancelQueries({ queryKey: builderKey });
      const prev = qc.getQueryData<BuilderData>(builderKey);
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          lineItems: [...(old.quote.lineItems ?? []), tempItem]
        }
      }));
      return { prev, tempItem, opId };
    },
    onSuccess: (result, _vars, ctx) => {
      if (!ctx?.tempItem || !isLatestOp(ctx.opId)) return;
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          totalAmount: result.quote.totalAmount,
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
      if (!ctx || !isLatestOp(ctx.opId)) return;
      if (ctx.prev) qc.setQueryData(builderKey, ctx.prev);
      toast.error("Failed to add item");
    }
  });

  const removeItemMutation = useMutation({
    mutationFn: ({ quoteId, itemId }: { quoteId: string; itemId: string }) =>
      api.quotes.removeItem(quoteId, itemId),
    onMutate: async ({ itemId }) => {
      const opId = bumpOp();
      await qc.cancelQueries({ queryKey: builderKey });
      const prev = qc.getQueryData<BuilderData>(builderKey);
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          lineItems: old.quote.lineItems.filter((item) => item.id !== itemId)
        }
      }));
      return { prev, opId };
    },
    onSuccess: (result, _vars, ctx) => {
      if (!ctx || !isLatestOp(ctx.opId)) return;
      patchBuilder((old) => ({
        ...old,
        quote: { ...old.quote, totalAmount: result.quote.totalAmount, lineItems: result.quote.lineItems }
      }));
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx || !isLatestOp(ctx.opId)) return;
      if (ctx.prev) qc.setQueryData(builderKey, ctx.prev);
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
    }) => {
      const current = qc.getQueryData<BuilderData>(builderKey)?.quote.lineItems.find(
        (item) => item.id === itemId
      );
      return api.quotes.updateItem(quoteId, itemId, normalizeItemPatch(current, data));
    },
    onMutate: async ({ itemId, data }) => {
      const opId = bumpOp();
      await qc.cancelQueries({ queryKey: builderKey });
      const prev = qc.getQueryData<BuilderData>(builderKey);
      const current = prev?.quote.lineItems.find((item) => item.id === itemId);
      const patch = normalizeItemPatch(current, data);
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          lineItems: old.quote.lineItems.map((item) =>
            item.id === itemId ? { ...item, ...patch } : item
          )
        }
      }));
      return { prev, opId };
    },
    onSuccess: (result, vars, ctx) => {
      if (!ctx || !isLatestOp(ctx.opId)) return;
      patchBuilder((old) => mergeQuoteLineItem(old, vars.quoteId, vars.itemId, result.quote));
    },
    onError: (err, _vars, ctx) => {
      if (!ctx || !isLatestOp(ctx.opId)) return;
      if (ctx.prev) qc.setQueryData(builderKey, ctx.prev);
      const message = err instanceof Error ? err.message : "Failed to update item";
      toast.error(message);
    }
  });

  const updateQuoteMutation = useMutation({
    mutationFn: ({ quoteId, data }: { quoteId: string; data: Record<string, unknown> }) =>
      api.quotes.update(quoteId, data),
    onMutate: async ({ data }) => {
      const prev = qc.getQueryData<BuilderData>(builderKey);
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          ...(typeof data.taxRate === "number" ? { taxRate: data.taxRate as number } : {}),
          ...(typeof data.depositPct === "number" ? { depositPct: data.depositPct as number } : {}),
          ...(data.notes !== undefined ? { notes: data.notes as string | null } : {}),
          ...(data.dueDate !== undefined
            ? { dueDate: (data.dueDate as string | null) ?? null }
            : {}),
          ...(typeof data.status === "string" ? { status: data.status as BuilderData["quote"]["status"] } : {}),
          ...(data.packageSelections !== undefined
            ? {
                packageSelections: data.packageSelections as BuilderData["quote"]["packageSelections"]
              }
            : {})
        }
      }));
      return { prev };
    },
    onSuccess: (result) => {
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          ...result.quote,
          lineItems: result.quote.lineItems ?? old.quote.lineItems,
          event: result.quote.event ?? old.quote.event
        }
      }));
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(builderKey, ctx.prev);
    }
  });

  const addPackageMutation = useMutation({
    mutationFn: ({
      quoteId,
      packageId
    }: {
      quoteId: string;
      packageId: string;
      pkg: CateringPackage;
    }) => quoteWriteQueueRef.current(() => api.quotes.addPackage(quoteId, packageId)),
    onMutate: async ({ pkg }) => {
      const opId = bumpOp();
      await qc.cancelQueries({ queryKey: builderKey });
      const prev = qc.getQueryData<BuilderData>(builderKey);
      if (!prev?.quote) return { prev, opId };

      const guestCount =
        latestGuestCountRef.current ?? prev.quote.event?.guestCountEstimate ?? 0;
      const tempLine = buildOptimisticPackageLine(
        {
          ...prev.quote,
          event: prev.quote.event
            ? { ...prev.quote.event, guestCountEstimate: guestCount }
            : prev.quote.event
        },
        pkg
      );
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          lineItems: [
            ...old.quote.lineItems.filter((item) => item.unitType !== "tiered_per_head"),
            tempLine
          ]
        }
      }));
      return { prev, tempLine, opId };
    },
    onSuccess: (result, _vars, ctx) => {
      if (!ctx || !isLatestOp(ctx.opId)) return;
      patchBuilder((old) => ({ ...old, quote: result.quote }));
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx || !isLatestOp(ctx.opId)) return;
      if (ctx.prev) qc.setQueryData(builderKey, ctx.prev);
      toast.error("Failed to add package");
    }
  });

  const removePackageMutation = useMutation({
    mutationFn: (quoteId: string) =>
      quoteWriteQueueRef.current(() => api.quotes.removePackage(quoteId)),
    onMutate: async () => {
      const opId = bumpOp();
      await qc.cancelQueries({ queryKey: builderKey });
      const prev = qc.getQueryData<BuilderData>(builderKey);
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          lineItems: old.quote.lineItems.filter((item) => item.unitType !== "tiered_per_head")
        }
      }));
      return { prev, opId };
    },
    onSuccess: (result, _vars, ctx) => {
      if (!ctx || !isLatestOp(ctx.opId)) return;
      patchBuilder((old) => ({ ...old, quote: { ...old.quote, ...result.quote } }));
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx || !isLatestOp(ctx.opId)) return;
      if (ctx.prev) qc.setQueryData(builderKey, ctx.prev);
      toast.error("Failed to remove package");
    }
  });

  const updateGuestCountMutation = useMutation({
    mutationFn: ({ quoteId, guestCount }: { quoteId: string; guestCount: number }) =>
      guestCountWriterRef.current(quoteId, guestCount),
    onMutate: async ({ guestCount }) => {
      const opId = bumpOp();
      latestGuestCountRef.current = guestCount;
      await qc.cancelQueries({ queryKey: builderKey });
      const prev = qc.getQueryData<BuilderData>(builderKey);
      if (!prev?.quote) return { prev, opId };

      const customerType = prev.quote.event?.customerType ?? "b2c";
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          event: old.quote.event
            ? { ...old.quote.event, guestCountEstimate: guestCount }
            : old.quote.event,
          lineItems: old.quote.lineItems.map((item) => {
            if (item.unitType !== "tiered_per_head") return item;
            const tiers =
              item.package?.tiers ??
              old.packages.find((pkg) => pkg.id === item.packageId)?.tiers ??
              [];
            if (tiers.length === 0) return item;
            const tier = getActiveTier(tiers, guestCount, customerType);
            if (!tier) {
              return {
                ...item,
                unitPrice: 0,
                appliedTier: null,
                appliedTierLabel: null,
                notes: null
              };
            }
            return {
              ...item,
              unitPrice: tier.pricePerHead,
              appliedTier: tier.pricePerHead,
              appliedTierLabel: formatTierLabel(tier),
              notes: formatTierLabel(tier)
            };
          })
        }
      }));
      return { prev, opId };
    },
    onSuccess: (result, { guestCount }, ctx) => {
      if (!ctx || !isLatestOp(ctx.opId)) return;
      if (guestCount !== latestGuestCountRef.current) return;
      patchBuilder((old) => ({ ...old, quote: result.quote }));
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx || !isLatestOp(ctx.opId)) return;
      if (ctx.prev) qc.setQueryData(builderKey, ctx.prev);
      toast.error("Failed to update guest count");
    }
  });

  const duplicateMutation = useMutation({
    mutationFn: (quoteId: string) => api.quotes.duplicate(quoteId),
    onSuccess: (result) => {
      patchBuilder((old) => ({ ...old, quote: result.quote }));
      toast.success("Quote duplicated.");
    },
    onError: () => toast.error("Failed to duplicate quote")
  });

  const isItemMutating =
    addItemMutation.isPending || removeItemMutation.isPending || updateItemMutation.isPending;
  const isPackageMutating = addPackageMutation.isPending || removePackageMutation.isPending;
  const isGuestCountMutating = updateGuestCountMutation.isPending;
  const isQuoteSyncing = isPackageMutating || isGuestCountMutating;

  return {
    addItemMutation,
    removeItemMutation,
    updateItemMutation,
    updateQuoteMutation,
    addPackageMutation,
    removePackageMutation,
    updateGuestCountMutation,
    duplicateMutation,
    isItemMutating,
    isPackageMutating,
    isGuestCountMutating,
    isQuoteSyncing,
    isSaving: updateQuoteMutation.isPending,
    isSaveSuccess: updateQuoteMutation.isSuccess,
    isSaveError: updateQuoteMutation.isError
  };
}
