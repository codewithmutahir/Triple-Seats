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
  _quoteId: string,
  itemId: string,
  serverQuote: BuilderData["quote"]
): BuilderData {
  const serverItem = serverQuote.lineItems.find((item) => item.id === itemId);
  return {
    ...old,
    quote: {
      ...old.quote,
      lineItems: serverItem
        ? old.quote.lineItems.map((item) => (item.id === itemId ? serverItem : item))
        : old.quote.lineItems
    }
  };
}

export function buildOptimisticPackageLine(
  quote: BuilderData["quote"],
  pkg: CateringPackage,
  packages: CateringPackage[]
): QuoteLineItem {
  const guestCount = quote.event?.guestCountEstimate ?? 0;
  const customerType = quote.event?.customerType ?? "b2c";
  const tier = getActiveTier(pkg.tiers, guestCount, customerType);
  const catalogPkg = packages.find((p) => p.id === pkg.id) ?? pkg;

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
      id: catalogPkg.id,
      name: catalogPkg.name,
      minGuests: catalogPkg.minGuests,
      tiers: catalogPkg.tiers,
      items: catalogPkg.items
    }
  };
}

function swapTempPackageLineId(
  old: BuilderData,
  packageId: string,
  serverQuote: BuilderData["quote"]
): BuilderData {
  const serverLine = serverQuote.lineItems.find(
    (item) => item.unitType === "tiered_per_head" && item.packageId === packageId
  );
  if (!serverLine) return old;

  return {
    ...old,
    quote: {
      ...old.quote,
      lineItems: old.quote.lineItems.map((item) =>
        item.id.startsWith("temp_pkg_") && item.packageId === packageId
          ? { ...item, id: serverLine.id }
          : item
      )
    }
  };
}

export function useQuoteBuilderMutations(eventId: string | null) {
  const qc = useQueryClient();
  const builderKey = queryKeys.quotes.builder(eventId ?? "");
  const latestGuestCountRef = useRef<number | null>(null);
  const latestPackageIdRef = useRef<string | null>(null);
  const packageRemovedRef = useRef(false);
  const lineItemSeqRef = useRef(0);

  const bumpLineItemOp = () => ++lineItemSeqRef.current;
  const isLatestLineItemOp = (opId: number) => opId === lineItemSeqRef.current;

  const patchBuilder = (updater: (old: BuilderData) => BuilderData) => {
    qc.setQueryData<BuilderData>(builderKey, (old) => (old ? updater(old) : old));
  };

  const selectPackageOptimistic = (pkg: CateringPackage, packages: CateringPackage[]) => {
    latestPackageIdRef.current = pkg.id;
    packageRemovedRef.current = false;

    patchBuilder((old) => {
      if (!old?.quote) return old;
      const guestCount =
        latestGuestCountRef.current ?? old.quote.event?.guestCountEstimate ?? 0;
      const tempLine = buildOptimisticPackageLine(
        {
          ...old.quote,
          event: old.quote.event
            ? { ...old.quote.event, guestCountEstimate: guestCount }
            : old.quote.event
        },
        pkg,
        packages
      );

      return {
        ...old,
        quote: {
          ...old.quote,
          lineItems: [
            ...old.quote.lineItems.filter((item) => item.unitType !== "tiered_per_head"),
            tempLine
          ]
        }
      };
    });
  };

  const removePackageOptimistic = () => {
    latestPackageIdRef.current = null;
    packageRemovedRef.current = true;

    patchBuilder((old) => {
      if (!old?.quote) return old;
      return {
        ...old,
        quote: {
          ...old.quote,
          lineItems: old.quote.lineItems.filter((item) => item.unitType !== "tiered_per_head")
        }
      };
    });
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
      const opId = bumpLineItemOp();
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
      if (!ctx?.tempItem || !isLatestLineItemOp(ctx.opId)) return;
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
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
      if (!ctx || !isLatestLineItemOp(ctx.opId)) return;
      if (ctx.prev) qc.setQueryData(builderKey, ctx.prev);
      toast.error("Failed to add item");
    }
  });

  const removeItemMutation = useMutation({
    mutationFn: ({ quoteId, itemId }: { quoteId: string; itemId: string }) =>
      api.quotes.removeItem(quoteId, itemId),
    onMutate: async ({ itemId }) => {
      const opId = bumpLineItemOp();
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
    onSuccess: (_result, vars, ctx) => {
      if (!ctx || !isLatestLineItemOp(ctx.opId)) return;
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          lineItems: old.quote.lineItems.filter((item) => item.id !== vars.itemId)
        }
      }));
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx || !isLatestLineItemOp(ctx.opId)) return;
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
      const opId = bumpLineItemOp();
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
      if (!ctx || !isLatestLineItemOp(ctx.opId)) return;
      patchBuilder((old) => mergeQuoteLineItem(old, vars.quoteId, vars.itemId, result.quote));
    },
    onError: (err, _vars, ctx) => {
      if (!ctx || !isLatestLineItemOp(ctx.opId)) return;
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
          taxRate: result.quote.taxRate,
          depositPct: result.quote.depositPct,
          notes: result.quote.notes,
          dueDate: result.quote.dueDate,
          status: result.quote.status,
          packageSelections: result.quote.packageSelections ?? old.quote.packageSelections
        }
      }));
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(builderKey, ctx.prev);
    }
  });

  const addPackageMutation = useMutation({
    mutationFn: ({ quoteId, packageId }: { quoteId: string; packageId: string }) =>
      api.quotes.addPackage(quoteId, packageId),
    onMutate: async ({ packageId }) => {
      const snapshot = qc.getQueryData<BuilderData>(builderKey);
      return { snapshot, packageId };
    },
    onSuccess: (result, { packageId }) => {
      if (packageId !== latestPackageIdRef.current || packageRemovedRef.current) return;
      patchBuilder((old) => swapTempPackageLineId(old, packageId, result.quote));
    },
    onError: (_err, { packageId }, ctx) => {
      if (packageId !== latestPackageIdRef.current || packageRemovedRef.current) return;
      if (ctx?.snapshot) qc.setQueryData(builderKey, ctx.snapshot);
      latestPackageIdRef.current =
        ctx?.snapshot?.quote.lineItems.find((i) => i.unitType === "tiered_per_head")?.packageId ??
        null;
      packageRemovedRef.current = false;
      toast.error("Failed to add package — reverted");
    }
  });

  const removePackageMutation = useMutation({
    mutationFn: (quoteId: string) => api.quotes.removePackage(quoteId),
    onMutate: async () => {
      const snapshot = qc.getQueryData<BuilderData>(builderKey);
      return { snapshot };
    },
    onSuccess: () => {
      // Cache already correct from optimistic remove
    },
    onError: (_err, _vars, ctx) => {
      if (!packageRemovedRef.current || latestPackageIdRef.current !== null) return;
      if (ctx?.snapshot) qc.setQueryData(builderKey, ctx.snapshot);
      latestPackageIdRef.current =
        ctx?.snapshot?.quote.lineItems.find((i) => i.unitType === "tiered_per_head")?.packageId ??
        null;
      packageRemovedRef.current = false;
      toast.error("Failed to remove package");
    }
  });

  const updateGuestCountMutation = useMutation({
    mutationFn: ({ quoteId, guestCount }: { quoteId: string; guestCount: number }) =>
      api.quotes.updateGuestCount(quoteId, guestCount),
    onMutate: async ({ guestCount }) => {
      latestGuestCountRef.current = guestCount;
      const prev = qc.getQueryData<BuilderData>(builderKey);
      if (!prev?.quote) return { prev, guestCount };

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
      return { prev, guestCount };
    },
    onSuccess: () => {
      // Client-side tiers already updated — no server merge
    },
    onError: (_err, { guestCount }) => {
      if (guestCount !== latestGuestCountRef.current) return;
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

  return {
    addItemMutation,
    removeItemMutation,
    updateItemMutation,
    updateQuoteMutation,
    addPackageMutation,
    removePackageMutation,
    updateGuestCountMutation,
    duplicateMutation,
    selectPackageOptimistic,
    removePackageOptimistic,
    latestPackageIdRef,
    isItemMutating,
    isPackageMutating,
    isGuestCountMutating,
    isSaving: updateQuoteMutation.isPending,
    isSaveSuccess: updateQuoteMutation.isSuccess,
    isSaveError: updateQuoteMutation.isError
  };
}
