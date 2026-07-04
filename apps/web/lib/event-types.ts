import type { CustomerTypeValue, EventTypeValue } from "@/lib/event-customer-types";

export type ActivityEntry = { at: string; type: string; label: string };

export type GuestPayload = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

export type TaskPayload = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type EventDetailPayload = {
  id: string;
  title: string;
  eventType: EventTypeValue;
  eventTypeLabel: string;
  customerType: CustomerTypeValue;
  status: string;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  venueName: string | null;
  venueAddress: string | null;
  guestCountEstimate: number | null;
  notesBody: string;
  preferredSlots: string[];
  eventLocationFromNotes: string | null;
  additionalNotes: string;
  activity: ActivityEntry[];
  createdAt: string;
  primaryGuest: GuestPayload | null;
  tasks: TaskPayload[];
};
