"use client";

import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Toaster } from "sonner";

import { CATERPRO_EVENTS_CHANNEL, type CaterProEventMessage } from "@/lib/caterpro-events";
import { queryKeys } from "@/lib/query-keys";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: true,
        refetchOnMount: true
      },
      mutations: {
        retry: 0
      }
    }
  });
}

function QueryRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = new BroadcastChannel(CATERPRO_EVENTS_CHANNEL);

    channel.onmessage = (event: MessageEvent<CaterProEventMessage>) => {
      if (event.data?.type !== "NEW_LEAD") return;

      void queryClient.invalidateQueries({ queryKey: queryKeys.leads.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });

      toast.info("New lead received!", {
        description: "A new inquiry has come in",
        duration: 4000
      });
    };

    return () => channel.close();
  }, [queryClient]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;

      void queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.stats(),
        refetchType: "active"
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.leads.all,
        refetchType: "active"
      });
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [queryClient]);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <QueryRealtimeSync />
      {children}
      <Toaster position="bottom-right" richColors />
      {process.env.NODE_ENV === "development" ? (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      ) : null}
    </QueryClientProvider>
  );
}
