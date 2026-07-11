"use client";

import { differenceInCalendarDays, format, startOfDay } from "date-fns";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Clock,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
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
import { MenuPreferencesCard } from "@/components/quote/menu-preferences-card";
import { EventDiscussionsTab } from "@/components/events/event-discussions-tab";
import { EventDocumentsTab } from "@/components/events/event-documents-tab";
import { EventHistoryTab } from "@/components/events/event-history-tab";
import { EventPaymentsTab } from "@/components/events/event-payments-tab";
import { EventTasksTab } from "@/components/events/event-tasks-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CUSTOMER_TYPE_LABELS,
  EVENT_TYPE_LABELS,
  EVENT_TYPE_VALUES,
  ORDER_MODE_LABELS,
  ORDER_MODE_VALUES,
  SERVICE_TYPE_LABELS,
  SERVICE_TYPE_VALUES,
  formatCustomerType,
  formatEventServiceLabel,
  formatEventType,
  type CustomerTypeValue,
  type EventTypeValue,
  type OrderModeValue,
  type ServiceTypeValue
} from "@/lib/event-customer-types";
import { formatEventTimeDisplay, formatEventTimeRange } from "@/lib/event-datetime";
import { RefreshingBadge } from "@/components/refreshing-badge";
import { ListPagination } from "@/components/dashboard/list-pagination";
import {
  filterAndPaginate,
  LIST_PAGE_SIZE
} from "@/lib/client-list-filter";
import { useEventsListQuery } from "@/hooks/use-list-queries";
import { useEventDetailMutations, useEventDetailQuery } from "@/hooks/use-event-detail";
import { usePermissions } from "@/hooks/use-permissions";
import { usePrefetchOnHover } from "@/hooks/use-prefetch";
import { api } from "@/lib/api";
import type { EventDetailPayload, TaskPayload } from "@/lib/event-types";
import { quoteAnalytics } from "@/lib/quote-analytics";
import { queryKeys } from "@/lib/query-keys";
import type { EventsListResponse, EventsStats } from "@/lib/stores/app-store";
import { browserTimer } from "@/lib/perf";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "lead", label: "Lead" },
  { value: "discussion", label: "Discussion" },
  { value: "booked", label: "Booked" },
  { value: "completed", label: "Completed" },
  { value: "lost", label: "Lost" }
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
): "lead" | "booked" | "completed" | "discussion" | "lost" | "outline" {
  if (status === "lead") return "lead";
  if (status === "booked") return "booked";
  if (status === "completed") return "completed";
  if (status === "discussion") return "discussion";
  if (status === "lost") return "lost";
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
  const router = useRouter();
  const eventId = searchParams.get("eventId");
  const activeTab = searchParams.get("tab") ?? "overview";
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
    updateMutation,
    timeMutation,
    changeCustomerType,
    canWriteEvents
  } = useEventDetailMutations(eventId);

  const { can } = usePermissions();
  const canWriteTasks = can("tasks:write");

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
  const [eventTimeEdit, setEventTimeEdit] = useState("");
  const taskMutationSeqRef = useRef(0);
  const bumpTaskOp = () => ++taskMutationSeqRef.current;
  const isLatestTaskOp = (opId: number) => opId === taskMutationSeqRef.current;

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
    setEventTimeEdit(event.eventTime ?? "");
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

  function patchEvent(patch: {
    eventType?: EventTypeValue;
    serviceType?: ServiceTypeValue;
    orderMode?: OrderModeValue;
    customerType?: CustomerTypeValue;
  }) {
    if (!eventId || !event) return;
    updateMutation.mutate(patch);
  }

  function patchCustomerType(next: CustomerTypeValue) {
    if (!eventId || !event || next === event.customerType) return;
    void changeCustomerType(next);
  }

  function patchStatus(next: string) {
    if (!eventId || !event || next === event.status) return;
    statusMutation.mutate(next);
  }

  function saveEventTime() {
    if (!eventId || !event || !canWriteEvents) return;
    const next = eventTimeEdit.trim() || null;
    const prev = event.eventTime?.trim() || null;
    if (next === prev) return;
    timeMutation.mutate(next);
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

  async function addTaskByTitle(title: string) {
    if (!eventId || !canWriteTasks) return;
    const { task } = await api.tasks.create({ eventId, title });
    qc.setQueryData<EventDetailPayload>(detailKey, (old) =>
      old ? { ...old, tasks: [...old.tasks, toTaskPayload(task)] } : old
    );
    void qc.invalidateQueries({ queryKey: queryKeys.tasks.all });
    quoteAnalytics.taskAdded({ eventId, taskTitle: title, source: "list" });
  }

  async function toggleTask(task: TaskPayload, completed: boolean) {
    if (!canWriteTasks) return;
    const opId = bumpTaskOp();
    const nextStatus = completed ? "done" : "todo";
    const prev = qc.getQueryData<EventDetailPayload>(detailKey);

    qc.setQueryData<EventDetailPayload>(detailKey, (old) =>
      old
        ? {
            ...old,
            tasks: old.tasks.map((t) =>
              t.id === task.id ? { ...t, status: nextStatus } : t
            )
          }
        : old
    );

    try {
      const { task: updated } = await api.tasks.update(task.id, {
        status: completed ? "completed" : "pending"
      });
      if (!isLatestTaskOp(opId)) return;
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
      if (eventId) {
        quoteAnalytics.taskUpdated({
          eventId,
          taskId: task.id,
          completed
        });
      }
    } catch {
      if (!isLatestTaskOp(opId)) return;
      if (prev) qc.setQueryData(detailKey, prev);
      toast.error("Failed to update task");
    }
  }

  async function deleteTask(id: string) {
    if (!canWriteTasks) return;
    const opId = bumpTaskOp();
    const prev = qc.getQueryData<EventDetailPayload>(detailKey);

    qc.setQueryData<EventDetailPayload>(detailKey, (old) =>
      old ? { ...old, tasks: old.tasks.filter((t) => t.id !== id) } : old
    );

    try {
      await api.tasks.delete(id);
      if (!isLatestTaskOp(opId)) return;
      void qc.invalidateQueries({ queryKey: queryKeys.tasks.all });
      if (eventId) {
        quoteAnalytics.taskDeleted({ eventId, taskId: id });
      }
    } catch {
      if (!isLatestTaskOp(opId)) return;
      if (prev) qc.setQueryData(detailKey, prev);
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
  const fieldSaving = updateMutation.isPending || timeMutation.isPending;
  const notesSaving = notesMutation.isPending;

  function setTab(tab: string) {
    if (!eventId) return;
    router.replace(`/dashboard/events?eventId=${encodeURIComponent(eventId)}&tab=${tab}`);
  }

  return (
    <div className="space-y-6">
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
                  {canWriteEvents ? (
                  <Select
                    value={event.customerType}
                    onValueChange={(v) => patchCustomerType(v as CustomerTypeValue)}
                  >
                    <SelectTrigger className="w-[120px] bg-white">
                      <SelectValue placeholder="Customer type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="b2c">{CUSTOMER_TYPE_LABELS.b2c}</SelectItem>
                      <SelectItem value="b2b">{CUSTOMER_TYPE_LABELS.b2b}</SelectItem>
                    </SelectContent>
                  </Select>
                  ) : null}
                  {canWriteEvents ? (
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
                        <SelectItem value="lost">Lost</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="discussions">Discussions</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">

          {/* Guest */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg">Guest Details</CardTitle>
              {event.primaryGuest && canWriteEvents ? (
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
                  <div className="w-full">
                    <p className="text-xs font-medium text-muted-foreground">Event time</p>
                    {canWriteEvents ? (
                      <Input
                        id="event-time"
                        placeholder="e.g. 6:30 PM"
                        value={eventTimeEdit}
                        disabled={fieldSaving}
                        onChange={(e) => setEventTimeEdit(e.target.value)}
                        onBlur={() => saveEventTime()}
                        className="mt-1 h-9"
                      />
                    ) : (
                      <p>{formatEventTimeDisplay(event)}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Location</p>
                    <p>{locationDisplay}</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Event type</p>
                    {canWriteEvents ? (
                      <Select
                        value={event.serviceType ?? "full_service"}
                        disabled={fieldSaving}
                        onValueChange={(v) => void patchEvent({ serviceType: v as ServiceTypeValue })}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SERVICE_TYPE_VALUES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {SERVICE_TYPE_LABELS[value]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm">{event.serviceTypeLabel ?? SERVICE_TYPE_LABELS.full_service}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Order mode</p>
                    {canWriteEvents ? (
                      <Select
                        value={event.orderMode ?? "delivery"}
                        disabled={fieldSaving}
                        onValueChange={(v) => void patchEvent({ orderMode: v as OrderModeValue })}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ORDER_MODE_VALUES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {ORDER_MODE_LABELS[value]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm">{event.orderModeLabel ?? ORDER_MODE_LABELS.delivery}</p>
                    )}
                  </div>
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
                  readOnly={!canWriteEvents}
                  disabled={!canWriteEvents || notesSaving}
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

          {eventId ? (
            <MenuPreferencesCard
              eventId={eventId}
              variant="full"
              readOnly
              quoteBuilderLink={`/dashboard/quotes?eventId=${encodeURIComponent(eventId)}`}
            />
          ) : null}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button variant="outline" className="justify-between bg-white" asChild>
                <Link
                  href={`/dashboard/quotes?eventId=${encodeURIComponent(event.id)}`}
                  onClick={() => quoteAnalytics.createQuoteClicked({ eventId: event.id })}
                >
                  Create Quote
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
              {canWriteTasks ? (
              <Button
                type="button"
                variant="outline"
                className="justify-between bg-white"
                onClick={() => setTab("tasks")}
              >
                Add task
                <Plus className="h-4 w-4" />
              </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="justify-between bg-white"
                onClick={() => setTab("discussions")}
              >
                Send message
                <MessageSquare className="h-4 w-4" />
              </Button>
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
                <p className="font-medium">{formatEventTimeDisplay(event)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Location</p>
                <p className="font-medium">{locationDisplay}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
        </TabsContent>

        <TabsContent value="discussions" className="mt-4">
          {eventId ? <EventDiscussionsTab eventId={eventId} /> : null}
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <EventTasksTab
            tasks={event.tasks}
            canWriteTasks={canWriteTasks}
            onAddTask={addTaskByTitle}
            onToggleTask={toggleTask}
            onDeleteTask={deleteTask}
          />
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          {eventId ? (
            <EventPaymentsTab
              eventId={eventId}
              eventStatus={event.status}
              onSuggestComplete={() => {
                toast.message("Balance paid in full", {
                  description: "Consider marking this event as Completed."
                });
              }}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          {eventId ? <EventDocumentsTab eventId={eventId} /> : null}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <EventHistoryTab event={event} activity={sortedActivity} />
        </TabsContent>
      </Tabs>
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
