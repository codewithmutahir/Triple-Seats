const catererCache = new Map<string, { caterer: unknown; ts: number }>();

export function clearCatererCacheForUser(userId: string) {
  catererCache.delete(userId);
}

export function getCatererCacheEntry(userId: string) {
  return catererCache.get(userId);
}

export function setCatererCacheEntry(userId: string, caterer: unknown) {
  catererCache.set(userId, { caterer, ts: Date.now() });
}

export const CATERER_CACHE_TTL_MS = 30_000;
