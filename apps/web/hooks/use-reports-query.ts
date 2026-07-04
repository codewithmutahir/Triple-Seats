import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useReportsQuery(year: number, month: number) {
  return useQuery({
    queryKey: queryKeys.reports.summary(year, month),
    queryFn: () => api.reports.summary(year, month),
    staleTime: 5 * 60 * 1000
  });
}

export function useSettingsProfileQuery() {
  return useQuery({
    queryKey: queryKeys.settings.profile(),
    queryFn: api.profile.caterer,
    staleTime: 5 * 60 * 1000
  });
}

export function useSettingsPackagesQuery() {
  return useQuery({
    queryKey: queryKeys.settings.packages(),
    queryFn: api.settings.packages,
    staleTime: 5 * 60 * 1000
  });
}

export function useSettingsMenuItemsQuery() {
  return useQuery({
    queryKey: queryKeys.settings.menuItems(),
    queryFn: api.settings.menuItems,
    staleTime: 5 * 60 * 1000
  });
}
