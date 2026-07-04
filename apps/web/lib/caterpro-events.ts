export const CATERPRO_EVENTS_CHANNEL = "caterpro_events";

export type CaterProEventMessage = { type: "NEW_LEAD" };

export function broadcastNewLead() {
  if (typeof window === "undefined") return;
  const channel = new BroadcastChannel(CATERPRO_EVENTS_CHANNEL);
  channel.postMessage({ type: "NEW_LEAD" } satisfies CaterProEventMessage);
  channel.close();
}
