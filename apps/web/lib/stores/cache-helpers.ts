/**
 * Cache-first loader: show stale data immediately, skip fetch when fresh,
 * otherwise refresh in background (or with loading when no cached data).
 */
export async function loadWithCache<T>(opts: {
  peek: () => T | null;
  getFresh: () => T | null;
  set: (data: T) => void;
  fetch: () => Promise<T>;
  onData: (data: T) => void;
  setLoading: (loading: boolean) => void;
  setRefreshing?: (refreshing: boolean) => void;
}): Promise<void> {
  const stale = opts.peek();
  if (stale != null) {
    opts.onData(stale);
    opts.setLoading(false);
  }

  if (opts.getFresh() != null) {
    return;
  }

  if (stale != null) {
    opts.setRefreshing?.(true);
    try {
      const data = await opts.fetch();
      opts.set(data);
      opts.onData(data);
    } finally {
      opts.setRefreshing?.(false);
    }
    return;
  }

  opts.setLoading(true);
  try {
    const data = await opts.fetch();
    opts.set(data);
    opts.onData(data);
  } finally {
    opts.setLoading(false);
  }
}
