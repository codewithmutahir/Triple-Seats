import { ApiError, isNetworkOrServerError } from "@/lib/api-error";
import { api } from "@/lib/api";
import { quoteAnalytics } from "@/lib/quote-analytics";
import { coalesceQuoteOps } from "@/lib/quote-ops-coalesce";
import type { ApplyQuoteOpsResponse, QuoteOp } from "@/lib/quote-ops-types";

const FLUSH_DEBOUNCE_MS = 300;
const MAX_FLUSH_RETRIES = 3;
const queues = new Map<string, QuoteOpsQueue>();

type FlushWaiter = {
  resolve: (result: ApplyQuoteOpsResponse) => void;
  reject: (error: Error) => void;
};

export class QuoteOpsSaveError extends Error {
  readonly recoverable: boolean;

  constructor(message: string, recoverable: boolean) {
    super(message);
    this.name = "QuoteOpsSaveError";
    this.recoverable = recoverable;
  }
}

export class QuoteOpsConflictError extends QuoteOpsSaveError {
  readonly serverRevision: number | null;

  constructor(message: string, serverRevision: number | null = null) {
    super(message, false);
    this.name = "QuoteOpsConflictError";
    this.serverRevision = serverRevision;
  }
}

export function isRevisionConflictError(err: unknown): boolean {
  return err instanceof QuoteOpsConflictError || (err instanceof ApiError && err.status === 409);
}

function isRetryableFlushError(err: unknown): boolean {
  if (err instanceof ApiError) {
    if (err.status === 409) return false;
    return err.status === 429 || err.status >= 500;
  }
  return isNetworkOrServerError(err);
}

function toUserError(err: unknown): QuoteOpsSaveError {
  if (err instanceof QuoteOpsSaveError) return err;
  if (err instanceof ApiError && err.status === 409) {
    const revision =
      typeof err.data?.revision === "number" && Number.isFinite(err.data.revision)
        ? err.data.revision
        : null;
    return new QuoteOpsConflictError(
      err.message || "Quote was updated elsewhere.",
      revision
    );
  }
  if (err instanceof ApiError) {
    return new QuoteOpsSaveError(err.message, false);
  }
  if (err instanceof Error) {
    return new QuoteOpsSaveError(err.message, isRetryableFlushError(err));
  }
  return new QuoteOpsSaveError("Failed to save quote changes.", true);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class QuoteOpsQueue {
  private ops: QuoteOp[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<ApplyQuoteOpsResponse> | null = null;
  private waiters: FlushWaiter[] = [];
  private listeners = new Set<() => void>();
  private conflictListeners = new Set<(error: QuoteOpsConflictError) => void>();
  private quoteId: string | null = null;
  private lastError: QuoteOpsSaveError | null = null;
  private getBaseRevision: (() => number) | null = null;
  private syncRevision: ((revision: number) => void) | null = null;
  /** Temp add clientRequestIds the user removed before the add flushed. */
  private cancelledClientRequestIds = new Set<string>();
  /** Real item ids removed optimistically; excluded from merge until server confirms. */
  private tombstoneItemIds = new Set<string>();

  constructor(readonly eventId: string) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  onConflict = (listener: (error: QuoteOpsConflictError) => void) => {
    this.conflictListeners.add(listener);
    return () => {
      this.conflictListeners.delete(listener);
    };
  };

  setRevisionProvider(provider: (() => number) | null) {
    this.getBaseRevision = provider;
  }

  setRevisionSync(sync: ((revision: number) => void) | null) {
    this.syncRevision = sync;
  }

  getPendingCount(): number {
    return this.ops.length + (this.inFlight ? 1 : 0);
  }

  getPendingRemoveIds(): Set<string> {
    const ids = new Set(this.tombstoneItemIds);
    for (const op of this.ops) {
      if (op.type === "remove_item") ids.add(op.itemId);
    }
    return ids;
  }

  isCancelledClientRequest(clientRequestId: string): boolean {
    return this.cancelledClientRequestIds.has(clientRequestId);
  }

  /**
   * Mark a pending add_item as cancelled (user removed the optimistic temp row).
   * The op stays queued so its waiter is still flushed; sendBatch filters it out.
   * If already in flight, onSuccess must check isCancelledClientRequest.
   */
  cancelPendingAdd(clientRequestId: string) {
    this.cancelledClientRequestIds.add(clientRequestId);
    this.emit();
  }

  tombstoneItem(itemId: string) {
    if (!itemId || itemId.startsWith("temp_")) return;
    this.tombstoneItemIds.add(itemId);
  }

  clearConfirmedTombstones(serverItemIds: ReadonlySet<string>) {
    for (const id of [...this.tombstoneItemIds]) {
      if (!serverItemIds.has(id)) {
        this.tombstoneItemIds.delete(id);
      }
    }
  }

  hasFailed(): boolean {
    return this.lastError !== null && this.ops.length > 0;
  }

  getFailedMessage(): string | null {
    return this.lastError?.message ?? null;
  }

  setQuoteId(quoteId: string) {
    this.quoteId = quoteId;
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  private setLastError(error: QuoteOpsSaveError | null) {
    this.lastError = error;
    this.emit();
  }

  private notifyConflict(error: QuoteOpsConflictError) {
    for (const listener of this.conflictListeners) listener(error);
  }

  private enqueue(op: QuoteOp): boolean {
    if (op.type === "remove_item") {
      this.tombstoneItem(op.itemId);
    }
    this.ops = coalesceQuoteOps(this.ops, op);
    this.setLastError(null);
    this.emit();
    return true;
  }

  private scheduleFlush() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      void this.flushNow();
    }, FLUSH_DEBOUNCE_MS);
  }

  async enqueueAndWait(quoteId: string, op: QuoteOp): Promise<ApplyQuoteOpsResponse> {
    this.quoteId = quoteId;
    // Register waiter BEFORE enqueue so a flush that starts between the two
    // still pairs this waiter with the op (batch capture takes both together).
    return new Promise<ApplyQuoteOpsResponse>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
      this.enqueue(op);
      this.scheduleFlush();
    });
  }

  async retryFailed(): Promise<void> {
    if (!this.hasFailed()) return;
    this.setLastError(null);
    await this.flushNow();
  }

  private async sendBatch(
    quoteId: string,
    batch: QuoteOp[],
    startedAt: number,
    attempt = 0,
    conflictRetried = false
  ): Promise<ApplyQuoteOpsResponse> {
    const baseRevision = this.getBaseRevision?.();
    try {
      const result = await api.quotes.applyOps(
        quoteId,
        batch,
        typeof baseRevision === "number" ? baseRevision : undefined
      );
      quoteAnalytics.opsBatchSaved({
        eventId: this.eventId,
        quoteId,
        opCount: batch.length,
        saveLatencyMs: Math.round(performance.now() - startedAt),
        attempt: attempt + 1,
        baseRevision
      });
      this.clearConfirmedTombstones(new Set(result.quote.lineItems.map((item) => item.id)));
      return result;
    } catch (err) {
      if (isRevisionConflictError(err) && !conflictRetried) {
        const conflict = toUserError(err);
        const serverRevision =
          conflict instanceof QuoteOpsConflictError ? conflict.serverRevision : null;
        if (serverRevision != null) {
          this.syncRevision?.(serverRevision);
          // Self-inflicted stale revision (e.g. remove skipped merge) — retry once.
          return this.sendBatch(quoteId, batch, startedAt, attempt, true);
        }
      }
      if (attempt < MAX_FLUSH_RETRIES - 1 && isRetryableFlushError(err)) {
        await sleep(2 ** attempt * 200);
        return this.sendBatch(quoteId, batch, startedAt, attempt + 1, conflictRetried);
      }
      throw err;
    }
  }

  async flushNow(): Promise<ApplyQuoteOpsResponse | null> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    if (this.ops.length === 0 || !this.quoteId) {
      return null;
    }

    // Capture ops + waiters together. Waiters registered after this splice
    // belong to a later batch and must NOT resolve with this result — that
    // race was wiping optimistic packages / firing prefs too early.
    const rawBatch = this.ops.splice(0);
    const batchWaiters = this.waiters.splice(0);
    const batch = rawBatch.filter((op) => {
      if (op.type === "add_item" && this.cancelledClientRequestIds.has(op.clientRequestId)) {
        return false;
      }
      return true;
    });
    const quoteId = this.quoteId;
    const startedAt = performance.now();
    this.emit();

    if (batch.length === 0) {
      // All ops were cancelled (e.g. temp add then remove). Resolve waiters with
      // a synthetic no-op by applying an empty guest-count echo — instead, reject
      // silently so mutations don't treat this as success with stale line items.
      const emptyError = Object.assign(new Error("Quote op cancelled"), { silent: true });
      this.rejectWaiters(batchWaiters, emptyError);
      this.emit();
      if (this.ops.length > 0) {
        this.scheduleFlush();
      }
      return null;
    }

    this.inFlight = this.sendBatch(quoteId, batch, startedAt)
      .then((result) => {
        this.setLastError(null);
        this.resolveWaiters(batchWaiters, result);
        return result;
      })
      .catch((error: unknown) => {
        const err = toUserError(error);
        const saveLatencyMs = Math.round(performance.now() - startedAt);

        if (err instanceof QuoteOpsConflictError) {
          // Keep the failed batch + any ops queued while in flight so the user
          // can retry after reload. Do not wipe later pending work.
          this.ops.unshift(...batch);
          this.setLastError(err);
          quoteAnalytics.opsBatchFailed({
            eventId: this.eventId,
            quoteId,
            opCount: batch.length,
            saveLatencyMs,
            recoverable: false,
            message: err.message,
            conflict: true
          });
          this.rejectWaiters(batchWaiters, err);
          this.notifyConflict(err);
          throw err;
        }

        this.ops.unshift(...batch);
        this.setLastError(err);
        this.emit();
        quoteAnalytics.opsBatchFailed({
          eventId: this.eventId,
          quoteId,
          opCount: batch.length,
          saveLatencyMs,
          recoverable: err.recoverable,
          message: err.message
        });
        this.rejectWaiters(batchWaiters, err);
        throw err;
      })
      .finally(() => {
        this.inFlight = null;
        this.emit();
        if (this.ops.length > 0 && !this.lastError) {
          this.scheduleFlush();
        }
      });

    return this.inFlight;
  }

  async drain(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    while (this.ops.length > 0 || this.inFlight) {
      if (this.inFlight) {
        await this.inFlight.catch(() => undefined);
        continue;
      }
      if (this.lastError) {
        throw this.lastError;
      }
      await this.flushNow();
    }
  }

  private resolveWaiters(waiters: FlushWaiter[], result: ApplyQuoteOpsResponse) {
    for (const waiter of waiters) {
      waiter.resolve(result);
    }
  }

  private rejectWaiters(waiters: FlushWaiter[], error: Error) {
    for (const waiter of waiters) {
      waiter.reject(error);
    }
  }
}

export function getQuoteOpsQueue(eventId: string): QuoteOpsQueue {
  let queue = queues.get(eventId);
  if (!queue) {
    queue = new QuoteOpsQueue(eventId);
    queues.set(eventId, queue);
  }
  return queue;
}

export function pendingQuoteOpsQueueCount(eventId: string | null): number {
  if (!eventId) return 0;
  return getQuoteOpsQueue(eventId).getPendingCount();
}

export function quoteOpsQueueHasFailed(eventId: string | null): boolean {
  if (!eventId) return false;
  return getQuoteOpsQueue(eventId).hasFailed();
}

export function shouldKeepOptimisticLineItems(eventId: string | null): boolean {
  return quoteOpsQueueHasFailed(eventId);
}

export async function drainQuoteOpsQueue(eventId: string | null): Promise<void> {
  if (!eventId) return;
  await getQuoteOpsQueue(eventId).drain();
}

export async function retryQuoteOpsQueue(eventId: string | null): Promise<void> {
  if (!eventId) return;
  await getQuoteOpsQueue(eventId).retryFailed();
}

export function subscribeQuoteOpsQueue(eventId: string | null, listener: () => void): () => void {
  if (!eventId) return () => undefined;
  return getQuoteOpsQueue(eventId).subscribe(listener);
}
