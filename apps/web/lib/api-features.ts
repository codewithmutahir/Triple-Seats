import { apiFetchJson } from "@/lib/api-client";

export const API_FEATURES = ["dashboardAll", "calendarInit", "quoteBuilder"] as const;
export type ApiFeature = (typeof API_FEATURES)[number];

type MetaResponse = { features?: Partial<Record<ApiFeature, boolean>> };

let cached: Set<ApiFeature> | null = null;
let probe: Promise<Set<ApiFeature>> | null = null;

/** Probe once per session so batch routes are skipped on older API builds (no 404 spam). */
export async function getApiFeatures(): Promise<Set<ApiFeature>> {
  if (cached) return cached;
  if (!probe) {
    probe = (async () => {
      const res = await apiFetchJson<MetaResponse>("/api/meta");
      const enabled = new Set<ApiFeature>();
      if (res.ok) {
        for (const key of API_FEATURES) {
          if (res.data.features?.[key]) enabled.add(key);
        }
      }
      cached = enabled;
      return enabled;
    })();
  }
  return probe;
}

export async function supportsApiFeature(feature: ApiFeature): Promise<boolean> {
  const features = await getApiFeatures();
  return features.has(feature);
}
