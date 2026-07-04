import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function usePrefetchEvent() {
  const qc = useQueryClient();

  return (eventId: string) => {
    void qc.prefetchQuery({
      queryKey: queryKeys.events.detail(eventId),
      queryFn: () => api.events.detail(eventId),
      staleTime: 60 * 1000
    });
  };
}

export function usePrefetchQuote() {
  const qc = useQueryClient();

  return (eventId: string) => {
    void qc.prefetchQuery({
      queryKey: queryKeys.quotes.builder(eventId),
      queryFn: () => api.quotes.builder(eventId),
      staleTime: 60 * 1000
    });
  };
}

export function usePrefetchOnHover(eventId: string | undefined) {
  const prefetchEvent = usePrefetchEvent();
  const prefetchQuote = usePrefetchQuote();

  return () => {
    if (!eventId) return;
    prefetchEvent(eventId);
    prefetchQuote(eventId);
  };
}
