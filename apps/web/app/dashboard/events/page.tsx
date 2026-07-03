"use client";

import { differenceInCalendarDays, format, startOfDay } from "date-fns";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Trash2,
  Users
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CUSTOMER_TYPE_LABELS,
  EVENT_TYPE_LABELS,
  EVENT_TYPE_VALUES,
  formatCustomerType,
  formatEventType,
  type CustomerTypeValue,
  type EventTypeValue
} from "@/lib/event-customer-types";
import { RefreshingBadge } from "@/components/refreshing-badge";
import { ListPagination } from "@/components/dashboard/list-pagination";
import { CLIENT_EVENTS_FETCH_SIZE, filterAndPaginate, fetchAllListPages } from "@/lib/client-list-filter";
import { useAppStore, type EventsListResponse, type EventsStats } from "@/lib/stores/app-store";
import { loadWithCache } from "@/lib/stores/cache-helpers";
import { parseApiError } from "@/lib/user-facing-error";
import { browserTimer } from "@/lib/perf";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "lead", label: "Lead" },
  { value: "discussion", label: "Discussion" },
  { value: "booked", label: "Booked" },
  { value: "completed", label: "Completed" }
] as const;

const ALL_EVENTS_CACHE_KEY = "__all__";
const EVENTS_PAGE_SIZE = 20;

type EventListRow = EventsListResponse["items"][number];

function formatTableDate(iso: string) {
  try {
    return format(new Date(iso), "MMM d, yyyy");
  } catch {
    return iso;
  }
}

async function fetchEventsList(
  params: URLSearchParams
): Promise<EventsListResponse | { error: string }> {
  const res = await fetch(`/api/leads?${params.toString()}`, { credentials: "include" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { error: parseApiError(body, res.status, res.statusText) };
  }
  return (await res.json()) as EventsListResponse;
}

async function fetchEventsStats(): Promise<EventsStats | { error: string }> {
  const res = await fetch("/api/events/stats", { credentials: "include" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { error: parseApiError(body, res.status, res.statusText) };
  }
  return (await res.json()) as EventsStats;
}

type ActivityEntry = { at: string; type: string; label: string };

type GuestPayload = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

type TaskPayload = {
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

function customerTypeBadgeClass(type: string) {
  return type === "b2b"
    ? "border-blue-300 bg-blue-50 text-blue-800"
    : "border-slate-300 bg-slate-100 text-slate-700";
}

function CustomerTypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className={cn("font-semibold", customerTypeBadgeClass(type))}>
      {formatCustomerType(type)}
    </Badge>
  );
}

function statusVariant(
  status: string
): "lead" | "booked" | "completed" | "discussion" | "outline" {
  if (status === "lead") return "lead";
  if (status === "booked") return "booked";
  if (status === "completed") return "completed";
  if (status === "discussion") return "discussion";
  return "outline";
}

function formatLongDate(iso: string) {
  try {
    return format(new Date(iso), "EEEE, MMMM d, yyyy");
  } catch {
    return iso;
  }
}

function formatShortDateTime(iso: string) {
  try {
    return format(new Date(iso), "MMM d, yyyy · h:mm a");
  } catch {
    return iso;
  }
}

function daysUntilLabel(iso: string): string {
  try {
    const ev = startOfDay(new Date(iso));
    const today = startOfDay(new Date());
    const d = differenceInCalendarDays(ev, today);
    if (d === 0) return "Today";
    if (d === 1) return "Tomorrow";
    if (d === -1) return "Yesterday";
    if (d > 1) return `In ${d} days`;
    return `${Math.abs(d)} days ago`;
  } catch {
    return "—";
  }
}

async function fetchEvent(id: string): Promise<{ event: EventDetailPayload } | { error: string; status: number }> {
  const res = await fetch(`/api/events/${encodeURIComponent(id)}`, { credentials: "include" });
  const body = (await res.json().catch(() => ({}))) as { error?: string; event?: EventDetailPayload };
  if (!res.ok) return { error: parseApiError(body, res.status, res.statusText), status: res.status };
  if (!body.event) return { error: "Invalid response", status: 500 };
  return { event: body.event };
}

function EventsListSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

function EventsListView() {
  const router = useRouter();
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);

  const [allEvents, setAllEvents] = useState<EventListRow[]>(
    () => useAppStore.getState().peekEventsCache(ALL_EVENTS_CACHE_KEY)?.items ?? []
  );
  const [stats, setStats] = useState<EventsStats | null>(() =>
    useAppStore.getState().peekEventsStats()
  );
  const [loading, setLoading] = useState(
    () => useAppStore.getState().peekEventsCache(ALL_EVENTS_CACHE_KEY) == null
  );
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data = useMemo(
    () => filterAndPaginate(allEvents, { status, page, pageSize: EVENTS_PAGE_SIZE }),
    [allEvents, status, page]
  );

  const loadAllEvents = useCallback(async () => {
    const store = useAppStore.getState();
    setError(null);

    await loadWithCache({
      peek: () => store.peekEventsCache(ALL_EVENTS_CACHE_KEY),
      getFresh: () => store.getEventsCache(ALL_EVENTS_CACHE_KEY),
      set: (result) => store.setEventsCache(ALL_EVENTS_CACHE_KEY, result),
      fetch: async () => {
        const result = await fetchAllListPages<EventListRow>(
          async (pageNum) => {
            const p = new URLSearchParams();
            p.set("page", String(pageNum));
            p.set("status", "all");
            p.set("pageSize", String(CLIENT_EVENTS_FETCH_SIZE));
            return fetchEventsList(p);
          },
          CLIENT_EVENTS_FETCH_SIZE
        );
        if ("error" in result) throw new Error(result.error);
        return {
          items: result.items,
          total: result.total,
          page: 1,
          pageSize: EVENTS_PAGE_SIZE,
          totalPages: Math.max(1, Math.ceil(result.total / EVENTS_PAGE_SIZE))
        };
      },
      onData: (result) => setAllEvents(result.items),
      setLoading,
      setRefreshing
    }).catch((e) => {
      setError(e instanceof Error ? e.message : "Request failed.");
      setAllEvents([]);
    });
  }, []);

  const loadStats = useCallback(async () => {
    const store = useAppStore.getState();
    await loadWithCache({
      peek: () => store.peekEventsStats(),
      getFresh: () => store.getEventsStats(),
      set: (result) => store.setEventsStats(result),
      fetch: async () => {
        const result = await fetchEventsStats();
        if ("error" in result) throw new Error(result.error);
        return result;
      },
      onData: setStats,
      setLoading: () => {},
      setRefreshing: () => {}
    }).catch(() => {
      /* stats cards are supplementary; list still works */
    });
  }, []);

  useEffect(() => {
    void loadAllEvents();
    void loadStats();
  }, [loadAllEvents, loadStats]);

  useEffect(() => {
    setPage(1);
  }, [status]);

  const empty = !loading && data.total === 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-[#1B2A4A]">Events</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage inquiries and bookings through your pipeline
            {!loading ? (
              <span className="text-foreground/80"> · {data.total} total</span>
            ) : null}
          </p>
        </div>
        {refreshing ? <RefreshingBadge /> : null}
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: stats?.total },
          { label: "Lead", value: stats?.lead },
          { label: "Booked", value: stats?.booked },
          { label: "Completed", value: stats?.completed }
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <p className="font-heading text-2xl font-semibold text-[#1B2A4A]">
                {loading && stats == null ? "—" : (value ?? 0)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.value}
            type="button"
            size="sm"
            variant={status === tab.value ? "default" : "outline"}
            className={cn(
              status === tab.value && "bg-[#1B2A4A] hover:bg-[#1B2A4A]/90"
            )}
            onClick={() => setStatus(tab.value)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {empty ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <CalendarDays className="h-12 w-12 text-muted-foreground" aria-hidden />
            <p className="font-heading text-xl font-semibold text-[#1B2A4A]">No events yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Events from your public lead form and dashboard will show up here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guest Name</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="hidden sm:table-cell">Location</TableHead>
                    <TableHead className="text-right">Guests</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && allEvents.length === 0
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 8 }).map((__, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-8 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    : data.items.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.guestName}</TableCell>
                          <TableCell>
                            {row.eventTypeLabel ?? formatEventType(row.eventType)}
                          </TableCell>
                          <TableCell>
                            <CustomerTypeBadge type={row.customerType} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {formatTableDate(row.eventDate)}
                          </TableCell>
                          <TableCell className="hidden max-w-[180px] truncate sm:table-cell text-sm">
                            {row.location}
                          </TableCell>
                          <TableCell className="text-right">{row.guestCount ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(row.status)} className="capitalize">
                              {row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                router.push(`/dashboard/events?eventId=${encodeURIComponent(row.id)}`)
                              }
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </div>

            <ListPagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              pageSize={data.pageSize}
              itemLabel="event"
              loading={loading}
              onPageChange={setPage}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EventDetailSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-56 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
      <div className="space-y-6">
        <Skeleton className="h-36 w-full rounded-lg" />
        <Skeleton className="h-52 w-full rounded-lg" />
        <Skeleton className="h-44 w-full rounded-lg" />
      </div>
    </div>
  );
}

function EventDetailInner() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId");

  const perfRef = useRef<ReturnType<typeof browserTimer> | null>(null);
  const perfEndedRef = useRef(false);
  if (!perfRef.current) {
    perfRef.current = browserTimer("event-page");
    perfRef.current.step("component:mount");
  }

  const [event, setEvent] = useState<EventDetailPayload | null>(null);
  const [loading, setLoading] = useState(Boolean(eventId));
  const [error, setError] = useState<string | null>(null);

  const [guestEdit, setGuestEdit] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    guestCount: "" as string | number
  });
  const [guestEditing, setGuestEditing] = useState(false);

  const [additionalNotes, setAdditionalNotes] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);
  const [fieldSaving, setFieldSaving] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);
  const [showQuickTaskForm, setShowQuickTaskForm] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) {
      setEvent(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    perfRef.current?.step("fetch:start");
    const res = await fetchEvent(eventId);
    perfRef.current?.step("fetch:complete");
    if ("error" in res) {
      setError(res.error);
      setEvent(null);
    } else {
      setEvent(res.event);
      perfRef.current?.step("state:set");
      const g = res.event.primaryGuest;
      setGuestEdit({
        firstName: g?.firstName ?? "",
        lastName: g?.lastName ?? "",
        email: g?.email ?? "",
        phone: g?.phone ?? "",
        guestCount: res.event.guestCountEstimate ?? ""
      });
      setAdditionalNotes(res.event.additionalNotes);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (perfEndedRef.current || loading) return;
    if (event) {
      perfEndedRef.current = true;
      perfRef.current?.step("render:complete");
      perfRef.current?.end();
    } else if (error) {
      perfEndedRef.current = true;
      perfRef.current?.end();
    }
  }, [event, loading, error]);

  const locationDisplay = useMemo(() => {
    if (!event) return "—";
    return event.venueAddress || event.venueName || event.eventLocationFromNotes || "—";
  }, [event]);

  const sortedActivity = useMemo(() => {
    if (!event) return [];
    return [...event.activity].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [event]);

  async function patchEvent(patch: { eventType?: EventTypeValue; customerType?: CustomerTypeValue }) {
    if (!eventId || !event) return;
    setFieldSaving(true);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch)
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; event?: EventDetailPayload };
      if (!res.ok) throw new Error(parseApiError(body, res.status, res.statusText));
      if (body.event) setEvent(body.event);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update event");
    } finally {
      setFieldSaving(false);
    }
  }

  async function patchStatus(next: string) {
    if (!eventId || !event) return;
    setStatusSaving(true);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: next })
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; event?: EventDetailPayload };
      if (!res.ok) throw new Error(parseApiError(body, res.status, res.statusText));
      if (body.event) setEvent(body.event);
      useAppStore.getState().invalidateEventsData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setStatusSaving(false);
    }
  }

  async function saveNotes() {
    if (!eventId || !event) return;
    if (additionalNotes === event.additionalNotes) return;
    setNotesSaving(true);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notes: additionalNotes })
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; event?: EventDetailPayload };
      if (!res.ok) throw new Error(parseApiError(body, res.status, res.statusText));
      if (body.event) setEvent(body.event);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save notes");
    } finally {
      setNotesSaving(false);
    }
  }

  async function saveGuest() {
    if (!eventId || !event?.primaryGuest) return;
    const guestCountNum =
      guestEdit.guestCount === "" ? undefined : Number.parseInt(String(guestEdit.guestCount), 10);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/guest`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          firstName: guestEdit.firstName,
          lastName: guestEdit.lastName || null,
          email: guestEdit.email || null,
          phone: guestEdit.phone || null,
          ...(guestCountNum !== undefined && !Number.isNaN(guestCountNum)
            ? { guestCountEstimate: guestCountNum }
            : {})
        })
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; event?: EventDetailPayload };
      if (!res.ok) throw new Error(parseApiError(body, res.status, res.statusText));
      if (body.event) setEvent(body.event);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save guest");
    }
  }

  async function addTask(fromQuick: boolean) {
    if (!eventId || !newTaskTitle.trim()) return;
    setTaskSaving(true);
    try {
      const res = await fetch(`/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ eventId, title: newTaskTitle.trim() })
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; task?: TaskPayload };
      if (!res.ok) throw new Error(parseApiError(body, res.status, res.statusText));
      if (body.task && event) {
        setEvent({ ...event, tasks: [...event.tasks, body.task] });
        setNewTaskTitle("");
        if (fromQuick) setShowQuickTaskForm(false);
      } else {
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add task");
    } finally {
      setTaskSaving(false);
    }
  }

  async function toggleTask(task: TaskPayload, completed: boolean) {
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: completed ? "completed" : "pending" })
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; task?: TaskPayload };
      if (!res.ok) throw new Error(parseApiError(body, res.status, res.statusText));
      if (body.task && event) {
        setEvent({
          ...event,
          tasks: event.tasks.map((t) => (t.id === task.id ? body.task! : t))
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update task");
    }
  }

  async function deleteTask(id: string) {
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(parseApiError(body, res.status, res.statusText));
      }
      if (event) setEvent({ ...event, tasks: event.tasks.filter((t) => t.id !== id) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete task");
    }
  }

  if (loading && !event) {
    return <EventDetailSkeleton />;
  }

  if (error && !event) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!event) return null;

  const guestName = [guestEdit.firstName, guestEdit.lastName].filter(Boolean).join(" ") || "—";

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">{error}</div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Header */}
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
                  <Link href="/dashboard/events">
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Back to Events
                  </Link>
                </Button>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h1 className="font-heading text-3xl font-semibold tracking-tight text-[#1B2A4A]">
                    {event.eventTypeLabel ?? formatEventType(event.eventType)}
                  </h1>
                  <p className="mt-1 text-xs text-muted-foreground">Created {formatShortDateTime(event.createdAt)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusVariant(event.status)} className="capitalize">
                    {event.status}
                  </Badge>
                  <CustomerTypeBadge type={event.customerType} />
                  <Select
                    value={event.customerType}
                    disabled={fieldSaving}
                    onValueChange={(v) => void patchEvent({ customerType: v as CustomerTypeValue })}
                  >
                    <SelectTrigger className="w-[120px] bg-white">
                      <SelectValue placeholder="Customer type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="b2c">{CUSTOMER_TYPE_LABELS.b2c}</SelectItem>
                      <SelectItem value="b2b">{CUSTOMER_TYPE_LABELS.b2b}</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <Select
                      value={event.status}
                      disabled={statusSaving}
                      onValueChange={(v) => void patchStatus(v)}
                    >
                      <SelectTrigger className="w-[180px] bg-white">
                        <SelectValue placeholder="Change status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lead">Lead</SelectItem>
                        <SelectItem value="discussion">Discussion</SelectItem>
                        <SelectItem value="booked">Booked</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                    {statusSaving ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Guest */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg">Guest Details</CardTitle>
              {event.primaryGuest ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (guestEditing) void saveGuest();
                    setGuestEditing((v) => !v);
                  }}
                >
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  {guestEditing ? "Done" : "Edit"}
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {!event.primaryGuest ? (
                <p className="text-sm text-muted-foreground">No guest linked to this event.</p>
              ) : guestEditing ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="g-first">First name</Label>
                    <Input
                      id="g-first"
                      value={guestEdit.firstName}
                      onChange={(e) => setGuestEdit((s) => ({ ...s, firstName: e.target.value }))}
                      onBlur={() => void saveGuest()}
                    />
                  </div>
                  <div>
                    <Label htmlFor="g-last">Last name</Label>
                    <Input
                      id="g-last"
                      value={guestEdit.lastName}
                      onChange={(e) => setGuestEdit((s) => ({ ...s, lastName: e.target.value }))}
                      onBlur={() => void saveGuest()}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="g-email">Email</Label>
                    <Input
                      id="g-email"
                      type="email"
                      value={guestEdit.email}
                      onChange={(e) => setGuestEdit((s) => ({ ...s, email: e.target.value }))}
                      onBlur={() => void saveGuest()}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="g-phone">Contact number</Label>
                    <Input
                      id="g-phone"
                      value={guestEdit.phone}
                      onChange={(e) => setGuestEdit((s) => ({ ...s, phone: e.target.value }))}
                      onBlur={() => void saveGuest()}
                    />
                  </div>
                  <div>
                    <Label htmlFor="g-count">Number of guests</Label>
                    <Input
                      id="g-count"
                      type="number"
                      min={1}
                      value={guestEdit.guestCount}
                      onChange={(e) => setGuestEdit((s) => ({ ...s, guestCount: e.target.value }))}
                      onBlur={() => void saveGuest()}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    {guestName}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4 shrink-0" />
                    {guestEdit.email || "—"}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4 shrink-0" />
                    {guestEdit.phone || "—"}
                  </div>
                  <div className="text-muted-foreground">
                    Guests: {event.guestCountEstimate ?? "—"}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Event details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Event Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Event date</p>
                    <p>{formatLongDate(event.eventDate)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Location</p>
                    <p>{locationDisplay}</p>
                  </div>
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Event</p>
                  <Select
                    value={event.eventType}
                    disabled={fieldSaving}
                    onValueChange={(v) => void patchEvent({ eventType: v as EventTypeValue })}
                  >
                    <SelectTrigger className="max-w-xs bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPE_VALUES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {EVENT_TYPE_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {event.preferredSlots.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Preferred time slots</p>
                  <div className="flex flex-wrap gap-2">
                    {event.preferredSlots.map((slot) => (
                      <Badge key={slot} variant="secondary">
                        {slot}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              <div>
                <Label htmlFor="add-notes" className="text-xs text-muted-foreground">
                  Additional notes
                </Label>
                <Textarea
                  id="add-notes"
                  className="mt-1 min-h-[100px] bg-white"
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  onBlur={() => void saveNotes()}
                  disabled={notesSaving}
                />
                {notesSaving ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Saves automatically when you click away</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {sortedActivity.map((a, i) => (
                  <li key={`${a.at}-${i}`} className="flex gap-3 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <div>
                      <p>{a.label}</p>
                      <p className="text-xs text-muted-foreground">{formatShortDateTime(a.at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button variant="outline" className="justify-between bg-white" asChild>
                <Link href={`/dashboard/quotes?eventId=${encodeURIComponent(event.id)}`}>
                  Create Quote
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="justify-between bg-white"
                onClick={() => setShowQuickTaskForm((v) => !v)}
              >
                Add task
                <Plus className="h-4 w-4" />
              </Button>
              {showQuickTaskForm ? (
                <div className="flex gap-2 pt-1">
                  <Input
                    placeholder="Task title"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void addTask(true);
                    }}
                  />
                  <Button type="button" size="sm" disabled={taskSaving} onClick={() => void addTask(true)}>
                    {taskSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                  </Button>
                </div>
              ) : null}
              <Button variant="outline" className="justify-between bg-white" asChild>
                <Link href={`/dashboard/discussions?eventId=${encodeURIComponent(event.id)}`}>
                  Send message
                  <MessageSquare className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tasks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="New task…"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void addTask(false);
                  }}
                />
                <Button type="button" size="icon" variant="secondary" disabled={taskSaving} onClick={() => void addTask(false)}>
                  {taskSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>
              {event.tasks.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ClipboardList className="h-4 w-4" />
                  No tasks yet
                </p>
              ) : (
                <ul className="space-y-2">
                  {event.tasks.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-start gap-2 rounded-md border border-slate-100 bg-slate-50/50 p-2"
                    >
                      <Checkbox
                        className="mt-1"
                        checked={t.status === "done"}
                        onCheckedChange={(c) => void toggleTask(t, c === true)}
                      />
                      <span className={cn("flex-1 text-sm", t.status === "done" && "text-muted-foreground line-through")}>
                        {t.title}
                      </span>
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => void deleteTask(t.id)}>
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Event summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Guest count</p>
                <p className="font-medium">{event.guestCountEstimate ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Event date</p>
                <p className="font-medium">{formatLongDate(event.eventDate)}</p>
                <p className="text-xs text-muted-foreground">{daysUntilLabel(event.eventDate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Location</p>
                <p className="font-medium">{locationDisplay}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function EventsPageRouter() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId");

  if (!eventId) {
    return <EventsListView />;
  }

  return <EventDetailInner />;
}

export default function EventsPage() {
  return (
    <Suspense fallback={<EventsListSkeleton />}>
      <EventsPageRouter />
    </Suspense>
  );
}
