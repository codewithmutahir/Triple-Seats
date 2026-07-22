import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";

import type { CateringPackage, PackagePriceTier, QuoteLineItem } from "@/components/quote/types";
import { usePermissions } from "@/hooks/use-permissions";
import { api } from "@/lib/api";
import { denyMutation, handleMutationError, isQuoteOpsConflict } from "@/lib/mutation-guard";
import type { QuoteBuilderPayload } from "@/lib/quote-builder-api";
import { quoteAnalytics } from "@/lib/quote-analytics";
import { resolveCreatedLineItem } from "@/lib/quote-line-items";
import type { ApplyQuoteOpsResponse } from "@/lib/quote-ops-types";
import {
  drainQuoteBuilderMutations,
  isPendingQuoteBuilderWork,
  isQuoteBuilderQueuedMutation,
  quoteBuilderMutationKeys
} from "@/lib/quote-builder-mutations";
import {
  getQuoteOpsQueue,
  pendingQuoteOpsQueueCount,
  quoteOpsQueueHasFailed,
  retryQuoteOpsQueue,
  shouldKeepOptimisticLineItems,
  subscribeQuoteOpsQueue
} from "@/lib/quote-ops-queue";
import { queryKeys } from "@/lib/query-keys";
import {
  formatTierLabel,
  findTierById,
  getActiveTier,
  tiersForCustomerType
} from "@/lib/quote-totals";

export function useQuoteBuilderQuery(eventId: string | null) {
  return useQuery({
    queryKey: queryKeys.quotes.builder(eventId ?? ""),
    queryFn: () => api.quotes.builder(eventId!),
    enabled: Boolean(eventId),
    staleTime: 2 * 60 * 1000
  });
}

type BuilderData = QuoteBuilderPayload;

function publishQuoteRevision(quoteId: string, revision: number) {
  if (typeof window === "undefined") return;
  const key = `quote_revision_${quoteId}`;
  localStorage.setItem(key, String(revision));
}

function mergeOpsBatchResult(
  old: BuilderData,
  result: ApplyQuoteOpsResponse,
  options?: { excludeItemIds?: ReadonlySet<string> }
): BuilderData {
  publishQuoteRevision(result.quote.id, result.revision);

  const excludeItemIds = options?.excludeItemIds ?? new Set<string>();
  const oldIds = new Set(old.quote.lineItems.map((item) => item.id));
  const serverItems = result.quote.lineItems.filter((item) => !excludeItemIds.has(item.id));
  const serverHasPackage = serverItems.some((item) => item.unitType === "tiered_per_head");
  const optimisticPackages = old.quote.lineItems.filter(
    (item) => item.unitType === "tiered_per_head" && item.id.startsWith("temp_pkg_")
  );
  const optimisticTemps = old.quote.lineItems.filter(
    (item) => item.id.startsWith("temp_") && !item.id.startsWith("temp_pkg_")
  );

  // Keep server rows the UI still has. Drop rows the user already removed
  // optimistically (not in oldIds) so a slower batch cannot resurrect them.
  // Brand-new server rows are kept only when a matching temp is still present
  // (add in flight) or they are package lines needed after temp_pkg remap.
  const keptServer = serverItems.filter((item) => {
    if (excludeItemIds.has(item.id)) return false;
    if (oldIds.has(item.id)) return true;
    if (item.unitType === "tiered_per_head") {
      return optimisticPackages.length === 0;
    }
    return optimisticTemps.some(
      (temp) =>
        temp.category === item.category &&
        temp.name === item.name &&
        temp.unitType === item.unitType
    );
  });

  const pendingTemps = optimisticTemps.filter((temp) => {
    // Drop temp once a matching server row exists (caller may still remap id).
    return !keptServer.some(
      (item) =>
        item.category === temp.category &&
        item.name === temp.name &&
        item.unitType === temp.unitType
    );
  });

  let lineItems = [...keptServer, ...pendingTemps];
  if (!serverHasPackage && optimisticPackages.length > 0) {
    lineItems = [
      ...lineItems.filter((item) => item.unitType !== "tiered_per_head"),
      ...optimisticPackages
    ];
  }

  return {
    ...old,
    quote: {
      ...old.quote,
      ...result.quote,
      revision: result.revision,
      lineItems,
      totalAmount: result.quote.totalAmount,
      taxRate: result.quote.taxRate,
      depositPct: result.quote.depositPct,
      event:
        old.quote.event && typeof result.guestCount === "number"
          ? { ...old.quote.event, guestCountEstimate: result.guestCount }
          : old.quote.event
    }
  };
}

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
  packages: CateringPackage[],
  selectedTier?: PackagePriceTier | null
): QuoteLineItem {
  const guestCount = quote.event?.guestCountEstimate ?? 0;
  const customerType = quote.event?.customerType ?? "b2c";
  const tier =
    selectedTier ??
    getActiveTier(pkg.tiers, guestCount, customerType) ??
    tiersForCustomerType(pkg.tiers, customerType)[0] ??
    null;
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
  const addingItemsRef = useRef<Set<string>>(new Set());

  function lineItemDedupKey(category: string, name: string): string {
    return `${category}:${name}`;
  }

  type QuoteMetaRevert = Partial<
    Pick<BuilderData["quote"], "taxRate" | "depositPct" | "notes" | "dueDate" | "status">
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

  const mergeBuilderOpsResult = (old: BuilderData, result: ApplyQuoteOpsResponse): BuilderData =>
    mergeOpsBatchResult(old, result, {
      excludeItemIds: eventId ? getQuoteOpsQueue(eventId).getPendingRemoveIds() : undefined
    });

  const isSilentMutationError = (err: unknown) =>
    Boolean(err && typeof err === "object" && "silent" in err && (err as { silent?: boolean }).silent);

  const selectPackageOptimistic = (
    pkg: CateringPackage,
    packages: CateringPackage[],
    selectedTier?: PackagePriceTier | null
  ) => {
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
        packages,
        selectedTier
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
        menuPreferences: [],
        quote: {
          ...old.quote,
          lineItems: old.quote.lineItems.filter((item) => item.unitType !== "tiered_per_head")
        }
      };
    });
  };

  const addItemMutation = useMutation({
    mutationKey: eventId ? quoteBuilderMutationKeys.addItem(eventId) : undefined,
    mutationFn: async ({
      quoteId,
      item,
      tempItem
    }: {
      quoteId: string;
      item: Record<string, unknown>;
      tempItem: QuoteLineItem;
    }) => {
      if (!eventId) throw new Error("Missing event.");
      return getQuoteOpsQueue(eventId).enqueueAndWait(quoteId, {
        type: "add_item",
        clientRequestId: tempItem.id,
        category: String(item.category ?? tempItem.category),
        name: String(item.name ?? tempItem.name),
        quantity:
          typeof item.quantity === "number" ? item.quantity : tempItem.quantity,
        unitPrice:
          typeof item.unitPrice === "number" ? item.unitPrice : tempItem.unitPrice,
        unitType: String(item.unitType ?? tempItem.unitType),
        menuItemId:
          (item.menuItemId as string | null | undefined) ?? tempItem.menuItemId ?? null,
        notes: (item.notes as string | null | undefined) ?? tempItem.notes ?? null
      });
    },
    onMutate: async ({ tempItem }) => {
      if (!canWrite) return denyMutation();
      const itemKey = lineItemDedupKey(tempItem.category, tempItem.name);
      if (addingItemsRef.current.has(itemKey)) {
        throw Object.assign(new Error("Item already being added"), { silent: true });
      }
      addingItemsRef.current.add(itemKey);
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
      return { tempItem, itemKey };
    },
    onSuccess: (result, vars, ctx) => {
      if (!ctx?.tempItem) return;

      const queue = eventId ? getQuoteOpsQueue(eventId) : null;
      if (queue?.isCancelledClientRequest(ctx.tempItem.id)) {
        patchBuilder((old) => mergeBuilderOpsResult(old, result));
        const serverMatch =
          resolveCreatedLineItem(result.quote.lineItems, result.quote.lineItems, {
            category: ctx.tempItem.category,
            name: ctx.tempItem.name,
            quantity: ctx.tempItem.quantity,
            unitPrice: ctx.tempItem.unitPrice,
            unitType: ctx.tempItem.unitType,
            menuItemId: ctx.tempItem.menuItemId ?? undefined
          }) ??
          result.quote.lineItems.find(
            (item) =>
              item.category === ctx.tempItem.category &&
              item.name === ctx.tempItem.name &&
              item.unitType === ctx.tempItem.unitType
          );
        if (serverMatch) {
          queue.tombstoneItem(serverMatch.id);
          void queue.enqueueAndWait(vars.quoteId, {
            type: "remove_item",
            itemId: serverMatch.id
          });
          patchBuilder((old) => ({
            ...old,
            quote: {
              ...old.quote,
              lineItems: old.quote.lineItems.filter((item) => item.id !== serverMatch.id)
            }
          }));
        }
        return;
      }

      patchBuilder((old) => {
        const merged = mergeBuilderOpsResult(old, result);
        const resolved = resolveCreatedLineItem(result.quote.lineItems, merged.quote.lineItems, {
          category: ctx.tempItem.category,
          name: ctx.tempItem.name,
          quantity: ctx.tempItem.quantity,
          unitPrice: ctx.tempItem.unitPrice,
          unitType: ctx.tempItem.unitType,
          menuItemId: ctx.tempItem.menuItemId ?? undefined
        });

        const serverMatch =
          resolved ??
          result.quote.lineItems.find(
            (item) =>
              item.category === ctx.tempItem.category &&
              item.name === ctx.tempItem.name &&
              item.unitType === ctx.tempItem.unitType
          );

        if (!serverMatch) {
          return merged;
        }

        const withoutTemp = merged.quote.lineItems.filter((item) => item.id !== ctx.tempItem.id);
        const hasExisting = withoutTemp.some((item) => item.id === serverMatch.id);

        return {
          ...merged,
          quote: {
            ...merged.quote,
            lineItems: hasExisting
              ? withoutTemp.map((item) => (item.id === serverMatch.id ? serverMatch : item))
              : [...withoutTemp, serverMatch]
          }
        };
      });
    },
    onError: (err, _vars, ctx) => {
      if (isSilentMutationError(err) || isQuoteOpsConflict(err)) return;
      if (shouldKeepOptimisticLineItems(eventId)) return;
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
    },
    onSettled: (_data, _err, _vars, ctx) => {
      if (!ctx?.itemKey) return;
      setTimeout(() => {
        addingItemsRef.current.delete(ctx.itemKey);
      }, 2000);
    }
  });

  const removeItemMutation = useMutation({
    mutationKey: eventId ? quoteBuilderMutationKeys.removeItem(eventId) : undefined,
    mutationFn: async ({ quoteId, itemId }: { quoteId: string; itemId: string }) => {
      if (!eventId) throw new Error("Missing event.");
      return getQuoteOpsQueue(eventId).enqueueAndWait(quoteId, {
        type: "remove_item",
        itemId
      });
    },
    onMutate: async ({ itemId }) => {
      if (!canWrite) return denyMutation();
      if (eventId) getQuoteOpsQueue(eventId).tombstoneItem(itemId);
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
    onSuccess: (result, vars, ctx) => {
      if (!ctx) return;
      // Must merge revision + server totals — skipping this left baseRevision stale
      // and caused 409 conflicts / dropped ops on rapid removes.
      patchBuilder((old) => {
        const merged = mergeBuilderOpsResult(old, result);
        return {
          ...merged,
          quote: {
            ...merged.quote,
            lineItems: merged.quote.lineItems.filter((item) => item.id !== vars.itemId)
          }
        };
      });
    },
    onError: (err, vars, ctx) => {
      if (isSilentMutationError(err) || isQuoteOpsConflict(err)) return;
      if (shouldKeepOptimisticLineItems(eventId)) return;
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
    mutationKey: eventId ? quoteBuilderMutationKeys.updateItem(eventId) : undefined,
    mutationFn: async ({
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
      const patch = normalizeItemPatch(current, data);
      if (!eventId) throw new Error("Missing event.");
      return getQuoteOpsQueue(eventId).enqueueAndWait(quoteId, {
        type: "update_item",
        itemId,
        patch
      });
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
      patchBuilder((old) => {
        const merged = mergeBuilderOpsResult(old, result);
        return mergeQuoteLineItem(merged, vars.quoteId, vars.itemId, result.quote);
      });
    },
    onError: (err, vars, ctx) => {
      if (isSilentMutationError(err) || isQuoteOpsConflict(err)) return;
      if (shouldKeepOptimisticLineItems(eventId)) return;
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
    mutationKey: eventId ? quoteBuilderMutationKeys.updateQuote(eventId) : undefined,
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
      }

      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          ...(typeof data.status === "string" ? { status: data.status as BuilderData["quote"]["status"] } : {})
        }
      }));
      return { revert, opId };
    },
    onSuccess: (result, vars, ctx) => {
      if (!ctx || ctx.opId !== quoteUpdateSeqRef.current) return;

      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          ...(typeof vars.data.status === "string"
            ? { status: result.quote.status }
            : {})
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

  type QuoteSettingsPayload = {
    taxRate: number;
    depositPct: number;
    dueDate: string | null;
    notes: string | null;
  };

  const saveQuoteSettingsMutation = useMutation({
    mutationKey: eventId ? quoteBuilderMutationKeys.saveSettings(eventId) : undefined,
    mutationFn: ({ quoteId, settings }: { quoteId: string; settings: QuoteSettingsPayload }) =>
      api.quotes.update(quoteId, settings),
    onMutate: async ({ settings }) => {
      if (!canWrite) return denyMutation();
      const prev = qc.getQueryData<BuilderData>(builderKey);
      if (!prev?.quote) return denyMutation();

      const revert: QuoteMetaRevert = {
        taxRate: prev.quote.taxRate,
        depositPct: prev.quote.depositPct,
        dueDate: prev.quote.dueDate ?? null,
        notes: prev.quote.notes
      };

      quoteAnalytics.settingsUpdated({
        ...builderContext(),
        fields: ["taxRate", "depositPct", "notes", "dueDate"],
        taxRate: settings.taxRate,
        depositPct: settings.depositPct
      });

      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          taxRate: settings.taxRate,
          depositPct: settings.depositPct,
          notes: settings.notes,
          dueDate: settings.dueDate
        }
      }));

      return { revert };
    },
    onSuccess: (result, _vars, ctx) => {
      if (!ctx) return;
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          taxRate: result.quote.taxRate,
          depositPct: result.quote.depositPct,
          notes: result.quote.notes,
          dueDate: result.quote.dueDate ?? null
        }
      }));
    },
    onError: (err, _vars, ctx) => {
      if (!ctx?.revert) return;
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          ...ctx.revert
        }
      }));
      handleMutationError(err, ctx, "Failed to save settings");
    }
  });

  const addPackageMutation = useMutation({
    mutationKey: eventId ? quoteBuilderMutationKeys.addPackage(eventId) : undefined,
    mutationFn: async ({
      quoteId,
      packageId,
      tierId
    }: {
      quoteId: string;
      packageId: string;
      tierId?: string;
    }) => {
      if (!eventId) throw new Error("Missing event.");
      return getQuoteOpsQueue(eventId).enqueueAndWait(quoteId, {
        type: "add_package",
        packageId,
        tierId: tierId ?? null
      });
    },
    onMutate: async ({ packageId }) => {
      if (!canWrite) return denyMutation();
      const opId = ++packageOpSeqRef.current;
      const snapshot = qc.getQueryData<BuilderData>(builderKey);
      return { snapshot, packageId, opId };
    },
    onSuccess: (result, { packageId }, ctx) => {
      if (!ctx || ctx.opId !== packageOpSeqRef.current) return;
      if (packageId !== latestPackageIdRef.current || packageRemovedRef.current) return;

      patchBuilder((old) => {
        const merged = mergeBuilderOpsResult(old, result);
        return {
          ...merged,
          quote: {
            ...merged.quote,
            lineItems: merged.quote.lineItems.filter((item) => !item.id.startsWith("temp_pkg_"))
          }
        };
      });

      if (eventId) {
        void qc.invalidateQueries({ queryKey: queryKeys.events.menuPreferences(eventId) });
      }
    },
    onError: (err, { packageId }, ctx) => {
      if (isSilentMutationError(err) || isQuoteOpsConflict(err)) return;
      if (shouldKeepOptimisticLineItems(eventId)) return;
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
    mutationKey: eventId ? quoteBuilderMutationKeys.removePackage(eventId) : undefined,
    mutationFn: async (quoteId: string) => {
      if (!eventId) throw new Error("Missing event.");
      return getQuoteOpsQueue(eventId).enqueueAndWait(quoteId, { type: "remove_package" });
    },
    onMutate: async () => {
      if (!canWrite) return denyMutation();
      const opId = ++packageOpSeqRef.current;
      const snapshot = qc.getQueryData<BuilderData>(builderKey);
      return { snapshot, opId };
    },
    onSuccess: (result, _vars, ctx) => {
      if (!ctx || ctx.opId !== packageOpSeqRef.current) return;
      patchBuilder((old) => ({
        ...mergeBuilderOpsResult(old, result),
        menuPreferences: []
      }));
      if (eventId) {
        void qc.invalidateQueries({ queryKey: queryKeys.events.menuPreferences(eventId) });
      }
    },
    onError: (err, _vars, ctx) => {
      if (isSilentMutationError(err) || isQuoteOpsConflict(err)) return;
      if (shouldKeepOptimisticLineItems(eventId)) return;
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
    mutationKey: eventId ? quoteBuilderMutationKeys.updateGuestCount(eventId) : undefined,
    mutationFn: async ({ quoteId, guestCount }: { quoteId: string; guestCount: number }) => {
      if (!eventId) throw new Error("Missing event.");
      return getQuoteOpsQueue(eventId).enqueueAndWait(quoteId, {
        type: "set_guest_count",
        guestCount
      });
    },
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
            if (item.unitType !== "tiered_per_head" || !item.packageId) return item;
            const pkg =
              old.packages.find((p) => p.id === item.packageId) ?? item.package ?? null;
            if (!pkg?.tiers?.length) return item;
            const tier = getActiveTier(pkg.tiers, guestCount, customerType);
            if (!tier) return item;
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
    onSuccess: (result, { guestCount }) => {
      patchBuilder((old) => {
        const merged = mergeBuilderOpsResult(old, result);
        const latest = latestGuestCountRef.current;
        // A slower earlier guest-count batch must not overwrite a newer value.
        if (latest != null && guestCount !== latest) {
          const customerType = (old.quote.event?.customerType ?? "b2c") as "b2b" | "b2c";
          return {
            ...merged,
            quote: {
              ...merged.quote,
              event: merged.quote.event
                ? { ...merged.quote.event, guestCountEstimate: latest }
                : merged.quote.event,
              lineItems: merged.quote.lineItems.map((item) => {
                if (item.unitType !== "tiered_per_head" || !item.packageId) return item;
                const pkg =
                  old.packages.find((p) => p.id === item.packageId) ?? item.package ?? null;
                if (!pkg?.tiers?.length) return item;
                const tier = getActiveTier(pkg.tiers, latest, customerType);
                if (!tier) return item;
                return {
                  ...item,
                  unitPrice: tier.pricePerHead,
                  appliedTier: tier.pricePerHead,
                  appliedTierLabel: formatTierLabel(tier),
                  notes: formatTierLabel(tier)
                };
              })
            }
          };
        }
        return merged;
      });
    },
    onError: (err, { guestCount }, ctx) => {
      if (isSilentMutationError(err) || isQuoteOpsConflict(err)) return;
      if (shouldKeepOptimisticLineItems(eventId)) return;
      if (guestCount !== latestGuestCountRef.current) return;
      if (ctx?.prev) qc.setQueryData(builderKey, ctx.prev);
      handleMutationError(err, ctx, "Failed to update guest count");
    }
  });

  const updatePackageTierMutation = useMutation({
    mutationKey: eventId ? quoteBuilderMutationKeys.updatePackageTier(eventId) : undefined,
    mutationFn: async ({ quoteId, tierId }: { quoteId: string; tierId: string }) => {
      if (!eventId) throw new Error("Missing event.");
      return getQuoteOpsQueue(eventId).enqueueAndWait(quoteId, {
        type: "set_package_tier",
        tierId
      });
    },
    onMutate: async ({ tierId }) => {
      if (!canWrite) return denyMutation();
      const prev = qc.getQueryData<BuilderData>(builderKey);
      if (!prev?.quote) return { prev };

      const packageLine = prev.quote.lineItems.find((item) => item.unitType === "tiered_per_head");
      if (!packageLine?.packageId) return { prev };

      const pkg =
        prev.packages.find((row) => row.id === packageLine.packageId) ??
        packageLine.package ??
        null;
      const tier = pkg ? findTierById(pkg.tiers, tierId) : null;
      if (!tier) return { prev };

      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          lineItems: old.quote.lineItems.map((item) => {
            if (item.unitType !== "tiered_per_head" || item.packageId !== packageLine.packageId) {
              return item;
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

      return { prev };
    },
    onSuccess: (result) => {
      patchBuilder((old) => mergeBuilderOpsResult(old, result));
    },
    onError: (err, _vars, ctx) => {
      if (isSilentMutationError(err) || isQuoteOpsConflict(err)) return;
      if (shouldKeepOptimisticLineItems(eventId)) return;
      if (ctx?.prev) qc.setQueryData(builderKey, ctx.prev);
      handleMutationError(err, ctx, "Failed to update package tier");
    }
  });

  const duplicateMutation = useMutation({
    mutationKey: eventId ? quoteBuilderMutationKeys.duplicate(eventId) : undefined,
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

    if (itemId.startsWith("temp_")) {
      if (eventId) getQuoteOpsQueue(eventId).cancelPendingAdd(itemId);
      patchBuilder((old) => ({
        ...old,
        quote: {
          ...old.quote,
          lineItems: old.quote.lineItems.filter((item) => item.id !== itemId)
        }
      }));
      return;
    }

    removeItemMutation.mutate({ quoteId, itemId });
  };

  const isItemMutating =
    addItemMutation.isPending || removeItemMutation.isPending || updateItemMutation.isPending;
  const isPackageMutating =
    addPackageMutation.isPending ||
    removePackageMutation.isPending ||
    updatePackageTierMutation.isPending;
  const isGuestCountMutating = updateGuestCountMutation.isPending;

  const quoteUpdateChainRef = useRef<Promise<unknown>>(Promise.resolve());

  const enqueueQuoteUpdate = useCallback(
    ({ quoteId, data }: { quoteId: string; data: Record<string, unknown> }) => {
      const run = () => updateQuoteMutation.mutateAsync({ quoteId, data });
      const next = quoteUpdateChainRef.current.catch(() => undefined).then(run);
      quoteUpdateChainRef.current = next;
      return next;
    },
    [updateQuoteMutation]
  );

  const queuedLineItemOpsCount = useSyncExternalStore(
    (onStoreChange) => subscribeQuoteOpsQueue(eventId, onStoreChange),
    () => pendingQuoteOpsQueueCount(eventId),
    () => 0
  );

  const lineItemsSaveFailed = useSyncExternalStore(
    (onStoreChange) => subscribeQuoteOpsQueue(eventId, onStoreChange),
    () => quoteOpsQueueHasFailed(eventId),
    () => false
  );

  const pendingOtherQuoteOpsCount = useIsMutating({
    predicate: (mutation) =>
      isPendingQuoteBuilderWork(mutation, eventId) &&
      !isQuoteBuilderQueuedMutation(mutation, eventId)
  });

  const pendingQuoteOpsCount = queuedLineItemOpsCount + pendingOtherQuoteOpsCount;

  const drainQuoteMutations = useCallback(async () => {
    await quoteUpdateChainRef.current.catch(() => undefined);
    await drainQuoteBuilderMutations(qc, eventId);
  }, [qc, eventId]);

  useEffect(() => {
    if (!eventId) return;
    const queue = getQuoteOpsQueue(eventId);
    queue.setRevisionProvider(
      () => qc.getQueryData<BuilderData>(builderKey)?.quote.revision ?? 0
    );
    queue.setRevisionSync((revision) => {
      qc.setQueryData<BuilderData>(builderKey, (old) => {
        if (!old?.quote) return old;
        publishQuoteRevision(old.quote.id, revision);
        return {
          ...old,
          quote: { ...old.quote, revision }
        };
      });
    });
    return () => {
      queue.setRevisionProvider(null);
      queue.setRevisionSync(null);
    };
  }, [eventId, qc, builderKey]);

  useEffect(() => {
    if (!eventId) return;

    const onStorage = (e: StorageEvent) => {
      const quoteId = qc.getQueryData<BuilderData>(builderKey)?.quote.id;
      if (!quoteId || e.key !== `quote_revision_${quoteId}` || !e.newValue) return;
      const localRevision = qc.getQueryData<BuilderData>(builderKey)?.quote.revision ?? 0;
      if (Number(e.newValue) > localRevision) {
        void qc.invalidateQueries({ queryKey: builderKey });
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [eventId, qc, builderKey]);

  useEffect(() => {
    if (!eventId) return;
    return getQuoteOpsQueue(eventId).onConflict((err) => {
      toast.message(err.message || "Quote was updated elsewhere. Reloading…");
      void qc.invalidateQueries({ queryKey: builderKey });
    });
  }, [eventId, qc, builderKey]);

  const retryLineItemSaves = useCallback(async () => {
    await retryQuoteOpsQueue(eventId);
  }, [eventId]);

  return {
    addItemMutation,
    removeItemMutation,
    updateItemMutation,
    updateQuoteMutation,
    saveQuoteSettingsMutation,
    enqueueQuoteUpdate,
    addPackageMutation,
    removePackageMutation,
    updateGuestCountMutation,
    updatePackageTierMutation,
    duplicateMutation,
    selectPackageOptimistic,
    removePackageOptimistic,
    updateLineItemOptimistic,
    removeLineItemOptimistic,
    latestPackageIdRef,
    isItemMutating,
    isPackageMutating,
    isGuestCountMutating,
    pendingQuoteOpsCount,
    lineItemsSaveFailed,
    retryLineItemSaves,
    drainQuoteMutations,
    canWriteQuotes: canWrite
  };
}
