import { useAppStore, type CacheEntry } from "@/lib/stores/app-store";

export const PROFILE_TTL = 5 * 60 * 1000;

export type CatererProfile = {
  name: string;
  slug: string;
  bookUrl: string | null;
  dashboardUrl: string | null;
};

function isFresh(entry: CacheEntry<CatererProfile> | null | undefined): boolean {
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < PROFILE_TTL;
}

/** Fetch caterer profile once per session (5 min TTL in Zustand). */
export async function fetchCatererProfile(): Promise<CatererProfile | null> {
  const store = useAppStore.getState();
  const cached = store.getCatererProfile();
  if (cached) return cached;

  const res = await fetch("/api/dashboard/profile", { credentials: "include" });
  if (!res.ok) return null;

  const data = (await res.json()) as CatererProfile;
  store.setCatererProfile(data);
  return data;
}
