export type CalendarShowAs = "busy" | "free" | "tentative" | "oof";
export type CalendarShareScope = "view" | "edit";
export type VendorRecurrenceFreq = "none" | "daily" | "weekly" | "monthly" | "yearly";
export type WeekdayCode = "SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA";

export type VendorCalendarEntry = {
  id: string;
  occurrenceId: string;
  seriesId: string;
  isRecurrenceInstance: boolean;
  catererId: string;
  ownerUserId: string;
  title: string;
  notes: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  showAs: CalendarShowAs;
  isPrivate: boolean;
  recurrenceFreq: VendorRecurrenceFreq;
  recurrenceInterval: number;
  recurrenceDaysOfWeek: string | null;
  recurrenceEndAt: string | null;
  recurrenceCount: number | null;
  reminderMinutesBefore: number | null;
  meetingUrl: string | null;
  colorHex: string | null;
  attendees: VendorCalendarAttendee[];
  color: string;
  createdAt: string;
  updatedAt: string;
  owner?: { id: string; name: string | null; email: string };
};

export type VendorCalendarEntryInput = {
  title: string;
  notes?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  allDay?: boolean;
  showAs?: CalendarShowAs;
  isPrivate?: boolean;
  recurrenceFreq?: VendorRecurrenceFreq;
  recurrenceInterval?: number;
  recurrenceDaysOfWeek?: string | null;
  recurrenceEndAt?: string | null;
  recurrenceCount?: number | null;
  reminderMinutesBefore?: number | null;
  meetingUrl?: string | null;
  colorHex?: string | null;
  attendees?: VendorCalendarAttendeeInput[];
};

export type VendorCalendarAttendeeInput = {
  email: string;
  name?: string | null;
};

export type VendorCalendarAttendee = {
  id: string;
  email: string;
  name: string | null;
};

export type VendorCalendarDirectory = {
  self: {
    userId: string;
    name: string | null;
    email: string;
    scope: "owner";
    source: "self";
    catererId: string;
    catererName: string;
  };
  shared: Array<{
    userId: string;
    name: string | null;
    email: string;
    scope: CalendarShareScope;
    source: "grant";
  }>;
  isSuperAdmin: boolean;
  pendingExternalInvites: Array<{
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
    catererId: string;
    catererName: string;
  }>;
  caterers: Array<{
    id: string;
    name: string;
    email: string;
    users: Array<{
      userId: string;
      name: string | null;
      email: string;
      role: string;
    }>;
  }>;
};

export type VendorCalendarExternalInvite = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  catererId: string;
  catererName: string;
};

export type CalendarShareGrant = {
  id: string;
  scope: CalendarShareScope;
  createdAt: string;
  grantee: { id: string; name: string | null; email: string };
  target: { id: string; name: string | null; email: string };
  grantedBy?: { id: string; name: string | null; email: string };
};

export const SHOW_AS_OPTIONS: Array<{ value: CalendarShowAs; label: string; color: string }> = [
  { value: "busy", label: "Busy", color: "#1B2A4A" },
  { value: "free", label: "Free", color: "#10B981" },
  { value: "tentative", label: "Tentative", color: "#F59E0B" },
  { value: "oof", label: "Out of office", color: "#6B7280" }
];

export const RECURRENCE_FREQ_OPTIONS: Array<{ value: VendorRecurrenceFreq; label: string }> = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" }
];

export const WEEKDAY_OPTIONS: Array<{ value: WeekdayCode; label: string }> = [
  { value: "MO", label: "Mon" },
  { value: "TU", label: "Tue" },
  { value: "WE", label: "Wed" },
  { value: "TH", label: "Thu" },
  { value: "FR", label: "Fri" },
  { value: "SA", label: "Sat" },
  { value: "SU", label: "Sun" }
];

export const REMINDER_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: null, label: "No reminder" },
  { value: 5, label: "5 minutes before" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" }
];

export const CATEGORY_COLOR_OPTIONS: Array<{ value: string | null; label: string; color: string }> = [
  { value: null, label: "Default (show-as color)", color: "#1B2A4A" },
  { value: "#1B2A4A", label: "Navy", color: "#1B2A4A" },
  { value: "#10B981", label: "Green", color: "#10B981" },
  { value: "#F59E0B", label: "Amber", color: "#F59E0B" },
  { value: "#EF4444", label: "Red", color: "#EF4444" },
  { value: "#8B5CF6", label: "Purple", color: "#8B5CF6" },
  { value: "#0EA5E9", label: "Sky", color: "#0EA5E9" }
];

export type VendorCalendarIcalToken = {
  token: string;
  subscribeUrl: string;
  webcalUrl: string;
};

export type GoogleCalendarSyncStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  calendarId: string;
  connectedAt: string | null;
};

export type GoogleCalendarSyncResult = {
  ok: boolean;
  created?: number;
  updated?: number;
  skipped?: number;
};

export function showAsColor(showAs: CalendarShowAs, colorHex?: string | null) {
  if (colorHex && /^#[0-9A-Fa-f]{6}$/.test(colorHex)) return colorHex;
  return SHOW_AS_OPTIONS.find((o) => o.value === showAs)?.color ?? "#1B2A4A";
}
