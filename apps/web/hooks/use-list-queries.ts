import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useLeadsQuery() {
  return useQuery({
    queryKey: queryKeys.leads.listAll(),
    queryFn: api.leads.listAll,
    staleTime: 60 * 1000
  });
}

export function useBookingsQuery() {
  const listQuery = useQuery({
    queryKey: queryKeys.bookings.listAll(),
    queryFn: api.bookings.listAll,
    staleTime: 60 * 1000
  });

  const statsQuery = useQuery({
    queryKey: queryKeys.bookings.stats(),
    queryFn: api.bookings.stats,
    staleTime: 60 * 1000
  });

  return { listQuery, statsQuery };
}

export function useEventsListQuery() {
  const listQuery = useQuery({
    queryKey: queryKeys.events.listAll(),
    queryFn: api.events.listAll,
    staleTime: 60 * 1000
  });

  const statsQuery = useQuery({
    queryKey: queryKeys.events.stats(),
    queryFn: api.events.stats,
    staleTime: 60 * 1000
  });

  return { listQuery, statsQuery };
}
