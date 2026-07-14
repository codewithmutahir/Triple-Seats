import { toast } from "sonner";

import { ApiError, isForbiddenError } from "@/lib/api-error";
import { parseApiError } from "@/lib/user-facing-error";

/** Throw before optimistic updates — mutationFn will not run; onError stays silent for 403. */
export function denyMutation(): never {
  throw new ApiError("Insufficient permissions", 403);
}

export function wasMutationAborted(ctx: unknown): boolean {
  return Boolean(
    ctx && typeof ctx === "object" && "aborted" in ctx && (ctx as { aborted?: boolean }).aborted === true
  );
}

let lastToastMessage = "";
let lastToastAt = 0;

function userFacingMutationMessage(err: unknown, fallbackMessage: string): string {
  if (err instanceof ApiError) {
    return parseApiError({ error: err.message }, err.status);
  }
  if (err instanceof Error && err.message) {
    return parseApiError({ error: err.message });
  }
  return fallbackMessage;
}

export function isQuoteOpsConflict(err: unknown): boolean {
  if (err instanceof ApiError && err.status === 409) return true;
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name?: string }).name === "QuoteOpsConflictError"
  );
}

/** Revert cache and toast only for unexpected failures — silent on 403 / permission abort. */
export function handleMutationError(err: unknown, ctx: unknown, fallbackMessage: string) {
  if (wasMutationAborted(ctx) || isForbiddenError(err) || isQuoteOpsConflict(err)) return;
  if (
    err &&
    typeof err === "object" &&
    "silent" in err &&
    (err as { silent?: boolean }).silent
  ) {
    return;
  }

  const message = userFacingMutationMessage(err, fallbackMessage);
  const now = Date.now();
  if (message === lastToastMessage && now - lastToastAt < 4000) return;

  lastToastMessage = message;
  lastToastAt = now;
  toast.error(message);
}
