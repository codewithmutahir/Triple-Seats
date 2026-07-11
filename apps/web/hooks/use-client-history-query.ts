import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useClientHistoryQuery(
  email: string | null | undefined,
  phone: string | null | undefined,
  excludeEventId: string | null
) {
  const normalizedEmail = email?.trim() || null;
  const normalizedPhone = phone?.trim() || null;

  return useQuery({
    queryKey: queryKeys.events.clientHistory(
      normalizedEmail ?? "",
      normalizedPhone ?? "",
      excludeEventId ?? ""
    ),
    queryFn: () =>
      api.events.clientHistory({
        email: normalizedEmail ?? undefined,
        phone: normalizedPhone ?? undefined,
        excludeEventId: excludeEventId ?? undefined
      }),
    enabled: Boolean(normalizedEmail || normalizedPhone),
    staleTime: 120_000
  });
}
