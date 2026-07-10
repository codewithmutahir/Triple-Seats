import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "sonner";

import type { CateringPackage, QuoteLineItem } from "@/components/quote/types";
import { usePermissions } from "@/hooks/use-permissions";
import { api } from "@/lib/api";
import { denyMutation, handleMutationError } from "@/lib/mutation-guard";
import type { QuoteBuilderPayload } from "@/lib/quote-builder-api";
import { quoteAnalytics } from "@/lib/quote-analytics";
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
0.
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

export function useQuoteBuilderMutations(eventId: string | null) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canWrite = can("quotes:write");
  const builderKey = queryKeys.quotes.builder(eventId ?? "");
  const latestGuestCountRef = useRef<number | null>(null);
  const latestPackageIdRef = useRef<string | null>(null);
  const packageRemovedRef = useRef(false);
  const packageOpSeqRef = useRef(0);
  const quoteUpdateSeqRef = useRef(0);

  type QuoteMetaRevert = Partial<
    Pick<
      BuilderData["quote"],
      "taxRate" | "depositPct" | "notes" | "dueDate" | "status" | "packageSelections"
    >
  >;

  const quoteMetaRevertFrom = (
    quote: BuilderData["quote"],
    data: Record<string, unknown>
  ): QuoteMetaRevert => {
    const revert: QuoteMetaRevert = {};
    if (typeof data.taxRate === "number") revert.taxRate = quote.taxRate;
    if (typeof data.depositPct === "number") revert.depositPct = quote.depositPct;
    if (data.notes !== undefined) revert.notes = quote.notes;
    if (data.dueDate !== undefined) revert.dueDate = quote.dueDate ?? null;
    if (typeof data.status === "string") revert.status = quote.status;
    if (data.packageSelections !== undefined) {
      revert.packageSelections = quote.packageSelections;
    }
    return revert;
  };

  const builderContext = () => {
    const data = qc.getQueryData<BuilderData>(builderKey);
    return {
      eventId: eventId ?? undefined,
      quoteId: data?.quote?.id
    };
  };

  const patchBuilder = (updater: (old: BuilderData) => BuilderData) => {
    if (!canWrite) return;
    qc.setQueryData<BuilderData>(builderKey, (old: BuilderData | undefined) => (old ? updater(old) : old));
  };

  const selectPackageOptimistic = (pkg: CateringPackage, packages: CateringPackage[]) => {
    if (!canWrite) return;
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
    if (!canWrite) return;
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
      if (!canWrite) return denyMutation();
      quoteAnalytics.itemAdded({
        ...builderContext(),
        category: tempItem.category,
        name: tempItem.name,
        unitType: tempItem.unitType,
        quantity: tempItem.quantity,
        unitPrice: tempItem.unitPrice,
        menuItemId: tempItem.menuItemId
      });
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          lineItems: [...(old.quote.lineItems ?? []), tempItem]
        }
      }));
      return { tempItem };
    },
    onSuccess: (result, _vars, ctx) => {
      if (!ctx?.tempItem) return;
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          lineItems: old.quote.lineItems.flatMap((item) => {
            if (item.id !== ctx.tempItem.id) return [item];
            const resolved = resolveCreatedLineItem(result.quote.lineItems, old.quote.lineItems, {
              category: item.category,
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unitType: item.unitType,
              menuItemId: item.menuItemId ?? undefined
            });
            if (!resolved) return [item];
            return [
              {
                ...resolved,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                unitType: item.unitType
              }
            ];
          })
        }
      }));
    },
    onError: (err, _vars, ctx) => {
      if (!ctx?.tempItem) return;
      patchBuilder((old) => {
        if (!old.quote.lineItems.some((item) => item.id === ctx.tempItem.id)) return old;
        return {
          ...old,
          quote: {
            ...old.quote,
            lineItems: old.quote.lineItems.filter((item) => item.id !== ctx.tempItem.id)
          }
        };
      });
      handleMutationError(err, ctx, "Failed to add item");
    }
  });

  const removeItemMutation = useMutation({
    mutationFn: ({ quoteId, itemId }: { quoteId: string; itemId: string }) =>
      api.quotes.removeItem(quoteId, itemId),
    onMutate: async ({ itemId }) => {
      if (!canWrite) return denyMutation();
      const prev = qc.getQueryData<BuilderData>(builderKey);
      const removed = prev?.quote.lineItems.find((item) => item.id === itemId);
      if (removed) {
        quoteAnalytics.itemRemoved({
          ...builderContext(),
          category: removed.category,
          name: removed.name,
          itemId
        });
      }
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          lineItems: old.quote.lineItems.filter((item) => item.id !== itemId)
        }
      }));
      return { removed };
    },
    onSuccess: (_result, vars, ctx) => {
      if (!ctx) return;
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          lineItems: old.quote.lineItems.filter((item) => item.id !== vars.itemId)
        }
      }));
    },
    onError: (err, vars, ctx) => {
      if (!ctx?.removed) return;
      patchBuilder((old) => {
        if (old.quote.lineItems.some((item) => item.id === vars.itemId)) return old;
        return {
          ...old,
          quote: {
            ...old.quote,
            lineItems: [...old.quote.lineItems, ctx.removed!]
          }
        };
      });
      handleMutationError(err, ctx, "Failed to remove item");
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
      if (!canWrite) return denyMutation();
      const prev = qc.getQueryData<BuilderData>(builderKey);
      const current = prev?.quote.lineItems.find((item) => item.id === itemId);
      const patch = normalizeItemPatch(current, data);
      if (current) {
        quoteAnalytics.itemUpdated({
          ...builderContext(),
          category: current.category,
          name: current.name,
          itemId,
          fields: Object.keys(patch)
        });
      }
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          lineItems: old.quote.lineItems.map((item) =>
            item.id === itemId ? { ...item, ...patch } : item
          )
        }
      }));
      return { previousItem: current };
    },
    onSuccess: (result, vars, ctx) => {
      if (!ctx) return;
      patchBuilder((old) => mergeQuoteLineItem(old, vars.quoteId, vars.itemId, result.quote));
    },
    onError: (err, vars, ctx) => {
      if (!ctx?.previousItem) return;
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          lineItems: old.quote.lineItems.map((item) =>
            item.id === vars.itemId ? ctx.previousItem! : item
          )
        }
      }));
      handleMutationError(err, ctx, "Failed to update item");
    }
  });

  const updateQuoteMutation = useMutation({
    mutationFn: ({ quoteId, data }: { quoteId: string; data: Record<string, unknown> }) =>
      api.quotes.update(quoteId, data),
    onMutate: async ({ data }) => {
      if (!canWrite) return denyMutation();
      const opId = ++quoteUpdateSeqRef.current;
      const prev = qc.getQueryData<BuilderData>(builderKey);
      if (!prev?.quote) return denyMutation();
      const revert = quoteMetaRevertFrom(prev.quote, data);
      const ctx = builderContext();

      if (typeof data.status === "string" && prev?.quote && prev.quote.status !== data.status) {
        quoteAnalytics.statusChanged({
          ...ctx,
          fromStatus: prev.quote.status,
          toStatus: data.status
        });
      } else {
        const fields: string[] = [];
        if (typeof data.taxRate === "number") fields.push("taxRate");
        if (typeof data.depositPct === "number") fields.push("depositPct");
        if (data.notes !== undefined) fields.push("notes");
        if (data.dueDate !== undefined) fields.push("dueDate");
        if (fields.length > 0) {
          quoteAnalytics.settingsUpdated({
            ...ctx,
            fields,
            taxRate: typeof data.taxRate === "number" ? data.taxRate : undefined,
            depositPct: typeof data.depositPct === "number" ? data.depositPct : undefined
          });
        }
      }

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
      return { revert, opId };
    },
    onSuccess: (result, vars, ctx) => {
      if (!ctx || ctx.opId !== quoteUpdateSeqRef.current) return;

      if (vars.data.packageSelections !== undefined) {
        const stored = vars.data.packageSelections as Record<string, Record<string, unknown[]>>;
        const categories = Object.keys(stored);
        const totalSelections = categories.reduce(
          (sum, cat) =>
            sum +
            Object.values(stored[cat] ?? {}).reduce(
              (inner, items) => inner + (Array.isArray(items) ? items.length : 0),
              0
            ),
          0
        );
        quoteAnalytics.packageItemsUpdated({
          ...builderContext(),
          categories,
          totalSelections
        });
      }

      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          ...(typeof vars.data.taxRate === "number" ? { taxRate: result.quote.taxRate } : {}),
          ...(typeof vars.data.depositPct === "number" ? { depositPct: result.quote.depositPct } : {}),
          ...(vars.data.notes !== undefined ? { notes: result.quote.notes } : {}),
          ...(vars.data.dueDate !== undefined
            ? { dueDate: result.quote.dueDate ?? null }
            : {}),
          ...(typeof vars.data.status === "string"
            ? { status: result.quote.status }
            : {})
          // Keep optimistic packageSelections — never replace from server response.
        }
      }));
    },
    onError: (err, _vars, ctx) => {
      if (!ctx || ctx.opId !== quoteUpdateSeqRef.current || !ctx.revert) return;
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          ...ctx.revert
        }
      }));
      handleMutationError(err, ctx, "Failed to save quote");
    }
  });

  const addPackageMutation = useMutation({
    mutationFn: ({ quoteId, packageId }: { quoteId: string; packageId: string }) =>
      api.quotes.addPackage(quoteId, packageId),
    onMutate: async ({ packageId }) => {
      if (!canWrite) return denyMutation();
      const opId = ++packageOpSeqRef.current;
      const snapshot = qc.getQueryData<BuilderData>(builderKey);
      return { snapshot, packageId, opId };
    },
    onSuccess: (result, { packageId }, ctx) => {
      if (!ctx || ctx.opId !== packageOpSeqRef.current) return;
      if (packageId !== latestPackageIdRef.current || packageRemovedRef.current) return;

      const serverPackageLines = result.quote.lineItems.filter(
        (item) => item.unitType === "tiered_per_head"
      );

      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          lineItems: [
            ...old.quote.lineItems.filter((item) => item.unitType !== "tiered_per_head"),
            ...serverPackageLines
          ]
        }
      }));
    },
    onError: (err, { packageId }, ctx) => {
      if (!ctx || ctx.opId !== packageOpSeqRef.current) return;
      if (packageId !== latestPackageIdRef.current || packageRemovedRef.current) return;
      if (ctx?.snapshot) qc.setQueryData(builderKey, ctx.snapshot);
      latestPackageIdRef.current =
        ctx?.snapshot?.quote.lineItems.find((i) => i.unitType === "tiered_per_head")?.packageId ??
        null;
      packageRemovedRef.current = false;
      handleMutationError(err, ctx, "Failed to add package");
    }
  });

  const removePackageMutation = useMutation({
    mutationFn: (quoteId: string) => api.quotes.removePackage(quoteId),
    onMutate: async () => {
      if (!canWrite) return denyMutation();
      const opId = ++packageOpSeqRef.current;
      const snapshot = qc.getQueryData<BuilderData>(builderKey);
      return { snapshot, opId };
    },
    onSuccess: (_result, _vars, ctx) => {
      if (!ctx || ctx.opId !== packageOpSeqRef.current) return;
      // Cache already correct from optimistic remove
    },
    onError: (err, _vars, ctx) => {
      if (!ctx || ctx.opId !== packageOpSeqRef.current) return;
      if (!packageRemovedRef.current || latestPackageIdRef.current !== null) return;
      if (ctx?.snapshot) qc.setQueryData(builderKey, ctx.snapshot);
      latestPackageIdRef.current =
        ctx?.snapshot?.quote.lineItems.find((i) => i.unitType === "tiered_per_head")?.packageId ??
        null;
      packageRemovedRef.current = false;
      handleMutationError(err, ctx, "Failed to remove package");
    }
  });

  const updateGuestCountMutation = useMutation({
    mutationFn: ({ quoteId, guestCount }: { quoteId: string; guestCount: number }) =>
      api.quotes.updateGuestCount(quoteId, guestCount),
    onMutate: async ({ guestCount }) => {
      if (!canWrite) return denyMutation();
      latestGuestCountRef.current = guestCount;
      const prev = qc.getQueryData<BuilderData>(builderKey);
      const from = prev?.quote.event?.guestCountEstimate ?? 0;
      if (from !== guestCount) {
        quoteAnalytics.guestCountChanged({
          ...builderContext(),
          from,
          to: guestCount
        });
      }
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
    onError: (err, { guestCount }, ctx) => {
      if (guestCount !== latestGuestCountRef.current) return;
      if (ctx?.prev) qc.setQueryData(builderKey, ctx.prev);
      handleMutationError(err, ctx, "Failed to update guest count");
    }
  });

  const duplicateMutation = useMutation({
    mutationFn: (quoteId: string) => api.quotes.duplicate(quoteId),
    onMutate: () => {
      if (!canWrite) return denyMutation();
    },
    onSuccess: (result) => {
      quoteAnalytics.duplicate(builderContext());
      patchBuilder((old) => ({ ...old, quote: result.quote }));
      toast.success("Quote duplicated.");
    },
    onError: (err, _vars, ctx) => handleMutationError(err, ctx, "Failed to duplicate quote")
  });

  const updateLineItemOptimistic = (
    itemId: string,
    patch: Partial<Pick<QuoteLineItem, "quantity" | "unitPrice" | "unitType">>
  ) => {
    if (!canWrite) return;
    const current = qc.getQueryData<BuilderData>(builderKey)?.quote.lineItems.find(
      (item) => item.id === itemId
    );
    if (!current) return;

    const nextPatch = { ...patch };
    if (nextPatch.unitType && current.category === "equipment" && nextPatch.unitType === "per_head") {
      nextPatch.unitType = "per_piece";
    }

    patchBuilder((old) => ({
      ...old,
      quote: {
        ...old.quote,
        lineItems: old.quote.lineItems.map((item) =>
          item.id === itemId ? { ...item, ...nextPatch } : item
        )
      }
    }));

    if (itemId.startsWith("temp_")) return;

    updateItemMutation.mutate({
      quoteId: current.quoteId,
      itemId,
      data: nextPatch
    });
  };

  const removeLineItemOptimistic = (itemId: string) => {
    if (!canWrite) return;
    const quoteId = qc.getQueryData<BuilderData>(builderKey)?.quote.id;
    if (!quoteId) return;

    patchBuilder((old) => ({
      ...old,
      quote: {
        ...old.quote,
        lineItems: old.quote.lineItems.filter((item) => item.id !== itemId)
      }
    }));

    if (itemId.startsWith("temp_")) return;

    removeItemMutation.mutate({ quoteId, itemId });
  };

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
    updateLineItemOptimistic,
    removeLineItemOptimistic,
    latestPackageIdRef,
    isItemMutating,
    isPackageMutating,
    isGuestCountMutating,
    isSaving: updateQuoteMutation.isPending,
    isSaveSuccess: updateQuoteMutation.isSuccess,
    isSaveError: updateQuoteMutation.isError,
    canWriteQuotes: canWrite
  };
}
