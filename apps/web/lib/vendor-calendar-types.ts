export type CalendarShowAs = "busy" | "free" | "tentative" | "oof";
export type CalendarShareScope = "view" | "edit";

export type VendorCalendarEntry = {
  id: string;
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
