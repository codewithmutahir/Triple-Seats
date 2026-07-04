"use client";

import { useEffect, useState } from "react";

import { CATERPRO_EVENTS_CHANNEL, type CaterProEventMessage } from "@/lib/caterpro-events";

export function useNewLeadNotification() {
  const [hasNewLead, setHasNewLead] = useState(false);

  useEffect(() => {
    const channel = new BroadcastChannel(CATERPRO_EVENTS_CHANNEL);

    channel.onmessage = (event: MessageEvent<CaterProEventMessage>) => {
      if (event.data?.type === "NEW_LEAD") {
        setHasNewLead(true);
      }
    };

    return () => channel.close();
  }, []);

  function dismissNewLead() {
    setHasNewLead(false);
  }

  return { hasNewLead, dismissNewLead };
}
