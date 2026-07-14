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
    return new QuoteOpsConflictError(err.message || "Quote was updated elsewhere.");
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

  getPendingCount(): number {
    return this.ops.length + (this.inFlight ? 1 : 0);
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
    this.enqueue(op);
    this.scheduleFlush();
    return new Promise<ApplyQuoteOpsResponse>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
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
    attempt = 0
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
      return result;
    } catch (err) {
      if (attempt < MAX_FLUSH_RETRIES - 1 && isRetryableFlushError(err)) {
        await sleep(2 ** attempt * 200);
        return this.sendBatch(quoteId, batch, startedAt, attempt + 1);
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

    const batch = this.ops.splice(0);
    const quoteId = this.quoteId;
    const startedAt = performance.now();
    this.emit();

    this.inFlight = this.sendBatch(quoteId, batch, startedAt)
      .then((result) => {
        this.setLastError(null);
        this.resolveWaiters(result);
        return result;
      })
      .catch((error: unknown) => {
        const err = toUserError(error);
        const saveLatencyMs = Math.round(performance.now() - startedAt);

        if (err instanceof QuoteOpsConflictError) {
          this.ops = [];
          this.setLastError(null);
          quoteAnalytics.opsBatchFailed({
            eventId: this.eventId,
            quoteId,
            opCount: batch.length,
            saveLatencyMs,
            recoverable: false,
            message: err.message,
            conflict: true
          });
          this.rejectWaiters(err);
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
        this.rejectWaiters(err);
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

  private resolveWaiters(result: ApplyQuoteOpsResponse) {
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) {
      waiter.resolve(result);
    }
  }

  private rejectWaiters(error: Error) {
    const waiters = this.waiters.splice(0);
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
