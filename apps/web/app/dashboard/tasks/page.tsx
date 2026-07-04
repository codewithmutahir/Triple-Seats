"use client";

import { format } from "date-fns";
import { CheckSquare, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { RefreshingBadge } from "@/components/refreshing-badge";
import { ListPagination } from "@/components/dashboard/list-pagination";
import {
  filterTaskItems,
  LIST_PAGE_SIZE,
  paginateItems
} from "@/lib/client-list-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useEventsListQuery } from "@/hooks/use-list-queries";
import { useTaskMutations, useTasksQuery } from "@/hooks/use-tasks-query";
import { api } from "@/lib/api";
import type { TaskItem } from "@/lib/stores/app-store";
import { browserTimer } from "@/lib/perf";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Completed" }
] as const;

function formatShortDate(iso: string) {
  try {
    return format(new Date(iso), "MMM d, yyyy");
  } catch {
    return iso;
  }
}

function formatEventBadge(ev: TaskItem["event"]) {
  if (!ev) return null;
  try {
    return `${ev.title} • ${format(new Date(ev.eventDate), "MMM d")}`;
  } catch {
    return ev.title;
  }
}

export default function TasksPage() {
  const perfRef = useRef<ReturnType<typeof browserTimer> | null>(null);
  const perfEndedRef = useRef(false);
  if (!perfRef.current) {
    perfRef.current = browserTimer("tasks");
    perfRef.current.step("mount");
  }

  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [newTitle, setNewTitle] = useState("");
  const [newEventId, setNewEventId] = useState<string>("none");
  const [completedOpen, setCompletedOpen] = useState(false);

  const { listQuery, statsQuery } = useTasksQuery();
  const { addMutation, toggleMutation, deleteMutation } = useTaskMutations();
  const { listQuery: eventsListQuery } = useEventsListQuery();

  const allTasks = listQuery.data ?? [];
  const stats = statsQuery.data ?? null;
  const loading = listQuery.isLoading;
  const refreshing = listQuery.isFetching && !listQuery.isLoading;
  const error = listQuery.error?.message ?? null;

  const eventOptions = useMemo(
    () =>
      (eventsListQuery.data ?? []).map((r) => ({
        id: r.id,
        title: r.eventType,
        eventDate: r.eventDate
      })),
    [eventsListQuery.data]
  );

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const eventFilterId = eventFilter === "all" ? undefined : eventFilter;

  const filteredTasks = useMemo(
    () =>
      filterTaskItems(allTasks, {
        status,
        search: searchDebounced,
        eventId: eventFilterId
      }),
    [allTasks, status, searchDebounced, eventFilterId]
  );

  const listMeta = useMemo(
    () => paginateItems(filteredTasks, page, LIST_PAGE_SIZE),
    [filteredTasks, page]
  );

  const tasks = listMeta.items;

  useEffect(() => {
    if (!loading) perfRef.current?.step("fetch:done");
  }, [loading]);

  useEffect(() => {
    setPage(1);
  }, [status, searchDebounced, eventFilter]);

  useEffect(() => {
    if (perfEndedRef.current || loading) return;
    if (allTasks.length >= 0 || error) {
      perfRef.current?.step("render:complete");
      perfRef.current?.end();
    }
  }, [allTasks, loading, error]);

  const pendingTasks = useMemo(
    () => tasks.filter((t) => t.status === "pending"),
    [tasks]
  );
  const completedTasks = useMemo(
    () => tasks.filter((t) => t.status === "completed"),
    [tasks]
  );

  function addTask() {
    const title = newTitle.trim();
    if (!title) return;

    const eventId = newEventId !== "none" ? newEventId : undefined;
    addMutation.mutate(
      { title, eventId },
      {
        onSuccess: () => {
          setNewTitle("");
          setNewEventId("none");
        }
      }
    );
  }

  function toggleTask(task: TaskItem, complete: boolean) {
    toggleMutation.mutate({
      id: task.id,
      status: complete ? "completed" : "pending"
    });
  }

  function deleteTask(id: string) {
    deleteMutation.mutate(id);
  }

  const allCompletedMatchingFilter = useMemo(
    () => filteredTasks.filter((t) => t.status === "completed"),
    [filteredTasks]
  );

  async function clearCompleted() {
    if (!allCompletedMatchingFilter.length) return;

    const results = await Promise.allSettled(
      allCompletedMatchingFilter.map((t) => api.tasks.delete(t.id))
    );

    const failedIds = new Set<string>();
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        failedIds.add(allCompletedMatchingFilter[i]!.id);
      }
    });

    void listQuery.refetch();
    void statsQuery.refetch();

    if (failedIds.size > 0) {
      toast.error(
        failedIds.size === allCompletedMatchingFilter.length
          ? "Failed to clear completed tasks"
          : `${failedIds.size} task(s) could not be deleted`
      );
    }
  }

  const empty = !loading && listMeta.total === 0;

  function TaskCard({ task, completed = false }: { task: TaskItem; completed?: boolean }) {
    const badge = formatEventBadge(task.event);
    return (
      <Card
        className={cn(
          "group border-slate-100 shadow-none transition-colors",
          completed && "bg-slate-50/80 opacity-75"
        )}
      >
        <CardContent className="flex items-start gap-3 p-3">
          <Checkbox
            className="mt-0.5"
            checked={task.status === "completed"}
            onCheckedChange={(c) => toggleTask(task, c === true)}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <p
              className={cn(
                "text-sm font-medium leading-snug",
                completed && "text-muted-foreground line-through"
              )}
            >
              {task.title}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {badge && task.event ? (
                <Link href={`/dashboard/events?eventId=${encodeURIComponent(task.event.id)}`}>
                  <Badge variant="outline" className="cursor-pointer font-normal hover:bg-slate-50">
                    {badge}
                  </Badge>
                </Link>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {formatShortDate(task.createdAt)}
              </span>
            </div>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={() => deleteTask(task.id)}
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-[#1B2A4A]">
            Tasks
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your operational to-dos
            {listMeta && !loading ? (
              <span className="text-foreground/80"> · {listMeta.total} total</span>
            ) : null}
          </p>
        </div>
        {refreshing ? <RefreshingBadge /> : null}
      </header>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Tasks", value: stats?.total },
          { label: "Pending", value: stats?.pending },
          { label: "Completed", value: stats?.completed }
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <div className="font-heading text-2xl font-semibold text-[#1B2A4A]">
                {loading && stats == null ? <Skeleton className="h-8 w-12" /> : (value ?? 0)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 p-4 md:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Search</label>
              <Input
                placeholder="Search by task title"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="bg-white"
              />
            </div>
            <div className="min-w-[180px]">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Event</label>
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="All events" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All events</SelectItem>
                  {eventOptions.map((ev) => (
                    <SelectItem key={ev.id} value={ev.id}>
                      {ev.title} — {formatShortDate(ev.eventDate)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
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
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          placeholder="Add a task..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addTask();
          }}
          className="bg-white"
        />
        <Select value={newEventId} onValueChange={setNewEventId}>
          <SelectTrigger className="w-full bg-white sm:w-[200px]">
            <SelectValue placeholder="Link to event" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No event</SelectItem>
            {eventOptions.map((ev) => (
              <SelectItem key={ev.id} value={ev.id}>
                {ev.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="icon"
          className="shrink-0 bg-[#1B2A4A] hover:bg-[#1B2A4A]/90"
          onClick={() => addTask()}
          disabled={addMutation.isPending}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : empty ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
          <CheckSquare className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 font-medium text-[#1B2A4A]">No tasks yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Tasks help you stay organized</p>
        </div>
      ) : (
        <div className="space-y-6">
          {pendingTasks.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pending
              </h2>
              <div className="space-y-2">
                {pendingTasks.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </div>
            </section>
          ) : null}

          {completedTasks.length > 0 ? (
            <Collapsible open={completedOpen} onOpenChange={setCompletedOpen}>
              <div className="flex items-center justify-between gap-2">
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="gap-1 px-0">
                    {completedOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Completed on this page ({completedTasks.length})
                    </span>
                  </Button>
                </CollapsibleTrigger>
                {completedOpen && status !== "completed" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={() => void clearCompleted()}
                  >
                    Clear all completed
                  </Button>
                ) : null}
              </div>
              <CollapsibleContent className="mt-2 space-y-2">
                {completedTasks.map((task) => (
                  <TaskCard key={task.id} task={task} completed />
                ))}
              </CollapsibleContent>
            </Collapsible>
          ) : null}

          {listMeta.total > 0 ? (
            <ListPagination
              page={listMeta.page}
              totalPages={listMeta.totalPages}
              total={listMeta.total}
              pageSize={listMeta.pageSize}
              itemLabel="task"
              loading={loading && allTasks.length === 0}
              onPageChange={setPage}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
