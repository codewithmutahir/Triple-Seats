export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  status: string;
  guestName?: string;
  location: string | null;
  guestCount: number | null;
  color: string;
  eventTitle?: string;
  startTime?: string | null;
  endTime?: string | null;
  hasQuote?: boolean;
};
