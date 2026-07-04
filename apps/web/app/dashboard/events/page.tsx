"use client";

import { differenceInCalendarDays, format, startOfDay } from "date-fns";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
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
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
import { formatEventTimeRange } from "@/lib/event-datetime";
import { RefreshingBadge } from "@/components/refreshing-badge";
import { ListPagination } from "@/components/dashboard/list-pagination";
import {
  filterAndPaginate,
  LIST_PAGE_SIZE
} from "@/lib/client-list-filter";
import { useEventsListQuery } from "@/hooks/use-list-queries";
import { useEventDetailMutations, useEventDetailQuery } from "@/hooks/use-event-detail";
import { usePrefetchOnHover } from "@/hooks/use-prefetch";
import { api } from "@/lib/api";
import type { EventDetailPayload, TaskPayload } from "@/lib/event-types";
import { queryKeys } from "@/lib/query-keys";
import type { EventsListResponse, EventsStats } from "@/lib/stores/app-store";
import { browserTimer } from "@/lib/perf";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "lead", label: "Lead" },
  { value: "discussion", label: "Discussion" },
  { value: "booked", label: "Booked" },
  { value: "completed", label: "Completed" }
] as const;

const EVENTS_PAGE_SIZE = LIST_PAGE_SIZE;

type EventListRow = EventsListResponse["items"][number];

function formatTableDate(iso: string) {
  try {
    return format(new Date(iso), "MMM d, yyyy");
  } catch {
    return iso;
  }
}

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

function EventListRowButton({ row }: { row: EventListRow }) {
  const router = useRouter();
  const onHover = usePrefetchOnHover(row.id);

  return (
    <TableRow onMouseEnter={onHover}>
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
      <TableCell className="hidden md:table-cell whitespace-nowrap text-sm text-muted-foreground">
        {formatEventTimeRange(row.startTime, row.endTime)}
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
          onMouseEnter={onHover}
          onClick={() =>
            router.push(`/dashboard/events?eventId=${encodeURIComponent(row.id)}`)
          }
        >
          View
        </Button>
      </TableCell>
    </TableRow>
  );
}

function EventsListView() {
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);

  const { listQuery, statsQuery } = useEventsListQuery();
  const allEvents = listQuery.data ?? [];
  const stats: EventsStats | null = statsQuery.data ?? null;
  const loading = listQuery.isLoading;
  const refreshing = listQuery.isFetching && !listQuery.isLoading;
  const error = listQuery.error?.message ?? null;

  const data = useMemo(
    () => filterAndPaginate(allEvents, { status, page, pageSize: EVENTS_PAGE_SIZE }),
    [allEvents, status, page]
  );

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
                    <TableHead className="hidden md:table-cell">Time</TableHead>
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
                          {Array.from({ length: 9 }).map((__, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-8 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    : data.items.map((row) => (
                        <EventListRowButton key={row.id} row={row} />
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
              loading={loading && allEvents.length === 0}
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

function toTaskPayload(task: {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}): TaskPayload {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    dueAt: null,
    completedAt: null,
    createdAt: task.createdAt
  };
}

function EventDetailInner() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId");
  const qc = useQueryClient();

  const perfRef = useRef<ReturnType<typeof browserTimer> | null>(null);
  const perfEndedRef = useRef(false);
  if (!perfRef.current) {
    perfRef.current = browserTimer("event-page");
    perfRef.current.step("component:mount");
  }

  const {
    data: event,
    isLoading: loading,
    error: queryError,
    refetch
  } = useEventDetailQuery(eventId);

  const {
    statusMutation,
    notesMutation,
    guestMutation,
    updateMutation
  } = useEventDetailMutations(eventId);

  const error = queryError?.message ?? null;
  const detailKey = queryKeys.events.detail(eventId ?? "");

  const [guestEdit, setGuestEdit] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    guestCount: "" as string | number
  });
  const [guestEditing, setGuestEditing] = useState(false);
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);
  const [showQuickTaskForm, setShowQuickTaskForm] = useState(false);

  useEffect(() => {
    if (!event) return;
    perfRef.current?.step("state:set");
    const g = event.primaryGuest;
    setGuestEdit({
      firstName: g?.firstName ?? "",
      lastName: g?.lastName ?? "",
      email: g?.email ?? "",
      phone: g?.phone ?? "",
      guestCount: event.guestCountEstimate ?? ""
    });
    setAdditionalNotes(event.additionalNotes);
  }, [event]);

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

  function patchEvent(patch: { eventType?: EventTypeValue; customerType?: CustomerTypeValue }) {
    if (!eventId || !event) return;
    updateMutation.mutate(patch);
  }

  function patchStatus(next: string) {
    if (!eventId || !event || next === event.status) return;
    statusMutation.mutate(next);
  }

  function saveNotes() {
    if (!eventId || !event) return;
    if (additionalNotes === event.additionalNotes) return;
    notesMutation.mutate(additionalNotes);
  }

  function saveGuest() {
    if (!eventId || !event?.primaryGuest) return;
    const guestCountNum =
      guestEdit.guestCount === "" ? undefined : Number.parseInt(String(guestEdit.guestCount), 10);
    guestMutation.mutate({
      firstName: guestEdit.firstName,
      lastName: guestEdit.lastName || null,
      email: guestEdit.email || null,
      phone: guestEdit.phone || null,
      ...(guestCountNum !== undefined && !Number.isNaN(guestCountNum)
        ? { guestCount: guestCountNum }
        : {})
    });
  }

  async function addTask(fromQuick: boolean) {
    if (!eventId || !newTaskTitle.trim()) return;
    setTaskSaving(true);
    try {
      const { task } = await api.tasks.create({ eventId, title: newTaskTitle.trim() });
      qc.setQueryData<EventDetailPayload>(detailKey, (old) =>
        old ? { ...old, tasks: [...old.tasks, toTaskPayload(task)] } : old
      );
      void qc.invalidateQueries({ queryKey: queryKeys.tasks.all });
      setNewTaskTitle("");
      if (fromQuick) setShowQuickTaskForm(false);
    } catch {
      toast.error("Failed to add task");
    } finally {
      setTaskSaving(false);
    }
  }

  async function toggleTask(task: TaskPayload, completed: boolean) {
    try {
      const { task: updated } = await api.tasks.update(task.id, {
        status: completed ? "completed" : "pending"
      });
      qc.setQueryData<EventDetailPayload>(detailKey, (old) =>
        old
          ? {
              ...old,
              tasks: old.tasks.map((t) =>
                t.id === task.id ? toTaskPayload(updated) : t
              )
            }
          : old
      );
      void qc.invalidateQueries({ queryKey: queryKeys.tasks.all });
    } catch {
      toast.error("Failed to update task");
    }
  }

  async function deleteTask(id: string) {
    try {
      await api.tasks.delete(id);
      qc.setQueryData<EventDetailPayload>(detailKey, (old) =>
        old ? { ...old, tasks: old.tasks.filter((t) => t.id !== id) } : old
      );
      void qc.invalidateQueries({ queryKey: queryKeys.tasks.all });
    } catch {
      toast.error("Failed to delete task");
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
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!event) return null;

  const guestName = [guestEdit.firstName, guestEdit.lastName].filter(Boolean).join(" ") || "—";
  const fieldSaving = updateMutation.isPending;
  const notesSaving = notesMutation.isPending;

  return (
    <div className="space-y-6">
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
                    <Select value={event.status} onValueChange={(v) => patchStatus(v)}>
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
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Event time</p>
                    <p>{formatEventTimeRange(event.startTime, event.endTime)}</p>
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
                <p className="text-xs text-muted-foreground">Event time</p>
                <p className="font-medium">{formatEventTimeRange(event.startTime, event.endTime)}</p>
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
