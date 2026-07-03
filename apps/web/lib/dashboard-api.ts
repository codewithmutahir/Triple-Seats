import { apiFetchJson } from "@/lib/api-client";
import { supportsApiFeature } from "@/lib/api-features";
import type {
  DashboardAllResponse,
  DashboardRecentRow,
  DashboardStats,
  DashboardUpcomingRow
} from "@/lib/stores/app-store";

async function fetchDashboardLegacy() {
  const [statsRes, recentRes, upcomingRes] = await Promise.all([
    apiFetchJson<DashboardStats>("/api/dashboard/stats"),
    apiFetchJson<{ items: DashboardRecentRow[] }>("/api/dashboard/recent-leads"),
    apiFetchJson<{ items: DashboardUpcomingRow[] }>("/api/dashboard/upcoming-events")
  ]);

  if (!statsRes.ok) return statsRes;
  if (!recentRes.ok) return recentRes;
  if (!upcomingRes.ok) return upcomingRes;

  return {
    ok: true as const,
    data: {
      stats: statsRes.data,
      recent: recentRes.data,
      upcoming: upcomingRes.data
    }
  };
}

export async function fetchDashboardAll() {
  if (await supportsApiFeature("dashboardAll")) {
    const batch = await apiFetchJson<DashboardAllResponse>("/api/dashboard/all");
    if (batch.ok) return batch;
    if (batch.status !== 404) return batch;
  }
  return fetchDashboardLegacy();
}
