import type { QueryClient } from "@tanstack/react-query";

import { drainQuoteOpsQueue, pendingQuoteOpsQueueCount } from "@/lib/quote-ops-queue";

/** TanStack mutation keys for quote builder + menu preferences (export barrier). */
export const quoteBuilderMutationKeys = {
  scope: (eventId: string) => ["quote-builder", eventId] as const,
  addItem: (eventId: string) => ["quote-builder", eventId, "add-item"] as const,
  removeItem: (eventId: string) => ["quote-builder", eventId, "remove-item"] as const,
  updateItem: (eventId: string) => ["quote-builder", eventId, "update-item"] as const,
  updateQuote: (eventId: string) => ["quote-builder", eventId, "update-quote"] as const,
  saveSettings: (eventId: string) => ["quote-builder", eventId, "save-settings"] as const,
  addPackage: (eventId: string) => ["quote-builder", eventId, "add-package"] as const,
  removePackage: (eventId: string) => ["quote-builder", eventId, "remove-package"] as const,
  updateGuestCount: (eventId: string) => ["quote-builder", eventId, "update-guest-count"] as const,
  updatePackageTier: (eventId: string) => ["quote-builder", eventId, "update-package-tier"] as const,
  duplicate: (eventId: string) => ["quote-builder", eventId, "duplicate"] as const,
  batchOps: (eventId: string) => ["quote-builder", eventId, "batch-ops"] as const,
  menuPreferences: (eventId: string) => ["menu-preferences", eventId] as const
};

export function isPendingQuoteBuilderWork(
  mutation: { options: { mutationKey?: unknown } },
  eventId: string | null
): boolean {
  if (!eventId) return false;
  const key = mutation.options.mutationKey;
  if (!Array.isArray(key) || key.length < 2) return false;
  const scope = key[0];
  const id = key[1];
  if (id !== eventId) return false;
  return scope === "quote-builder" || scope === "menu-preferences";
}

export function isQuoteBuilderQueuedMutation(
  mutation: { options: { mutationKey?: unknown } },
  eventId: string | null
): boolean {
  if (!eventId) return false;
  const key = mutation.options.mutationKey;
  if (!Array.isArray(key) || key.length < 3) return false;
  if (key[0] !== "quote-builder" || key[1] !== eventId) return false;
  const action = key[2];
  return (
    action === "add-item" ||
    action === "remove-item" ||
    action === "update-item" ||
    action === "add-package" ||
    action === "remove-package" ||
    action === "update-guest-count" ||
    action === "update-package-tier"
  );
}

/** @deprecated Use isQuoteBuilderQueuedMutation */
export const isQuoteBuilderLineItemMutation = isQuoteBuilderQueuedMutation;

export function pendingQuoteBuilderWorkCount(
  queryClient: QueryClient,
  eventId: string | null
): number {
  const mutationCount = queryClient.isMutating({
    predicate: (mutation) =>
      isPendingQuoteBuilderWork(mutation, eventId) &&
      !isQuoteBuilderQueuedMutation(mutation, eventId)
  });
  return mutationCount + pendingQuoteOpsQueueCount(eventId);
}

/** Waits until all quote-builder and menu-preference mutations for this event finish. */
export async function drainQuoteBuilderMutations(
  queryClient: QueryClient,
  eventId: string | null,
  maxMs = 15_000
): Promise<void> {
  const start = Date.now();
  await drainQuoteOpsQueue(eventId);
  while (pendingQuoteBuilderWorkCount(queryClient, eventId) > 0) {
    if (Date.now() - start > maxMs) {
      throw new Error("Still saving changes — please try again.");
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
