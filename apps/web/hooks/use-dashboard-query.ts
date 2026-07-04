import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useDashboardQuery() {
  return useQuery({
    queryKey: queryKeys.dashboard.stats(),
    queryFn: api.dashboard.all,
    staleTime: 60 * 1000
  });
}

export function useCatererProfileQuery() {
  return useQuery({
    queryKey: queryKeys.profile.dashboard(),
    queryFn: api.profile.dashboard,
    staleTime: 5 * 60 * 1000
  });
}
