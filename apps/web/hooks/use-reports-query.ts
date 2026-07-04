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

export {
  useSettingsProfileQuery,
  useSettingsPackagesQuery,
  useSettingsMenuItemsQuery
} from "./use-settings-queries";
