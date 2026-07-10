/** Structured API error with HTTP status for permission-aware handling. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isForbiddenError(err: unknown): boolean {
  if (err instanceof ApiError) return err.status === 403;
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("insufficient permissions") ||
    msg.includes("forbidden") ||
    msg.includes("not authorized")
  );
}

export function isNetworkOrServerError(err: unknown): boolean {
  if (err instanceof ApiError) return err.status >= 500 || err.status === 0;
  return err instanceof Error;
}

/**
 * Permission failures are silent (UI should have hidden the action).
 * Other failures show a toast.
 */
export function toastMutationError(err: unknown, fallback = "Action failed — changes reverted") {
  if (isForbiddenError(err)) return;
  const message = err instanceof Error ? err.message : fallback;
  // Dynamic import avoids circular deps — callers can use sonner directly with this helper's logic
  return message || fallback;
}
