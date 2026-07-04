import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useDashboardQuery() {
  return useQuery({
    queryKey: queryKeys.dashboard.stats(),
    queryFn: api.dashboard.all,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false
  });
}

export function useCatererProfileQuery() {
  return useQuery({
    queryKey: queryKeys.profile.dashboard(),
    queryFn: api.profile.dashboard,
    staleTime: 5 * 60 * 1000
  });
}
