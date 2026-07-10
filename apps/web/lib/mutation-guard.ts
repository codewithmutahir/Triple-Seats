import { toast } from "sonner";

import { ApiError, isForbiddenError } from "@/lib/api-error";

/** Throw before optimistic updates — mutationFn will not run; onError stays silent for 403. */
export function denyMutation(): never {
  throw new ApiError("Insufficient permissions", 403);
}

export function wasMutationAborted(ctx: unknown): boolean {
  return Boolean(
    ctx && typeof ctx === "object" && "aborted" in ctx && (ctx as { aborted?: boolean }).aborted === true
  );
}

/** Revert cache and toast only for unexpected failures — silent on 403 / permission abort. */
export function handleMutationError(err: unknown, ctx: unknown, fallbackMessage: string) {
  if (wasMutationAborted(ctx) || isForbiddenError(err)) return;
  const message = err instanceof Error && err.message ? err.message : fallbackMessage;
  toast.error(message);
}
