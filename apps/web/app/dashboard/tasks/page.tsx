"use client";

import { format } from "date-fns";
import { CheckSquare, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RefreshingBadge } from "@/components/refreshing-badge";
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
import {
  useAppStore,
  type TaskItem,
  type TasksListResponse,
  type TasksStats
} from "@/lib/stores/app-store";
import { loadWithCache } from "@/lib/stores/cache-helpers";
import { parseApiError } from "@/lib/user-facing-error";
import { browserTimer } from "@/lib/perf";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Completed" }
] as const;

type EventOption = { id: string; title: string; eventDate: string };

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

async function fetchTasks(
  params: URLSearchParams
): Promise<TasksListResponse | { error: string }> {
  const res = await fetch(`/api/tasks?${params.toString()}`, { credentials: "include" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { error: parseApiError(body, res.status, res.statusText) };
  }
  return (await res.json()) as TasksListResponse;
}

async function fetchTaskStats(): Promise<TasksStats | { error: string }> {
  const res = await fetch("/api/tasks/stats", { credentials: "include" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { error: parseApiError(body, res.status, res.statusText) };
  }
  return (await res.json()) as TasksStats;
}

async function fetchEventOptions(): Promise<EventOption[]> {
  const res = await fetch("/api/leads?page=1&status=all", { credentials: "include" });
  if (!res.ok) return [];
  const body = (await res.json()) as {
    items: Array<{ id: string; eventType: string; eventDate: string }>;
  };
  return body.items.map((r) => ({ id: r.id, title: r.eventType, eventDate: r.eventDate }));
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
  const [eventOptions, setEventOptions] = useState<EventOption[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newEventId, setNewEventId] = useState<string>("none");
  const [completedOpen, setCompletedOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const cacheKey = JSON.stringify({
    status,
    search: searchDebounced,
    eventId: eventFilter === "all" ? undefined : eventFilter
  });

  const [tasks, setTasks] = useState<TaskItem[]>(
    () => useAppStore.getState().peekTasksCache(cacheKey)?.items ?? []
  );
  const [stats, setStats] = useState<TasksStats | null>(() =>
    useAppStore.getState().peekTasksStats()
  );
  const [loading, setLoading] = useState(
    () => useAppStore.getState().peekTasksCache(cacheKey) == null
  );
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    void fetchEventOptions().then(setEventOptions);
  }, []);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("status", status);
    if (searchDebounced) p.set("search", searchDebounced);
    if (eventFilter !== "all") p.set("eventId", eventFilter);
    return p;
  }, [status, searchDebounced, eventFilter]);

  const load = useCallback(async () => {
    const store = useAppStore.getState();
    const key = cacheKey;
    setError(null);
    perfRef.current?.step("fetch:start");

    await Promise.all([
      loadWithCache({
        peek: () => store.peekTasksCache(key),
        getFresh: () => store.getTasksCache(key),
        set: (result) => store.setTasksCache(key, result),
        fetch: async () => {
          const result = await fetchTasks(queryParams);
          if ("error" in result) throw new Error(result.error);
          return result;
        },
        onData: (result) => {
          setTasks(result.items);
          perfRef.current?.step("fetch:done");
        },
        setLoading,
        setRefreshing
      }),
      loadWithCache({
        peek: () => store.peekTasksStats(),
        getFresh: () => store.getTasksStats(),
        set: (result) => store.setTasksStats(result),
        fetch: async () => {
          const result = await fetchTaskStats();
          if ("error" in result) throw new Error(result.error);
          return result;
        },
        onData: setStats,
        setLoading: () => {}
      })
    ]).catch((e) => {
      setError(e instanceof Error ? e.message : "Request failed.");
    });
  }, [cacheKey, queryParams]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (perfEndedRef.current || loading) return;
    if (tasks.length >= 0 || error) {
      perfEndedRef.current = true;
      perfRef.current?.step("render:complete");
      perfRef.current?.end();
    }
  }, [tasks, loading, error]);

  const pendingTasks = useMemo(
    () => tasks.filter((t) => t.status === "pending"),
    [tasks]
  );
  const completedTasks = useMemo(
    () => tasks.filter((t) => t.status === "completed"),
    [tasks]
  );

  async function addTask() {
    const title = newTitle.trim();
    if (!title) return;

    const eventId = newEventId !== "none" ? newEventId : undefined;
    const linkedEvent = eventOptions.find((e) => e.id === eventId);
    const tempId = `temp-${Date.now()}`;
    const optimistic: TaskItem = {
      id: tempId,
      title,
      status: "pending",
      createdAt: new Date().toISOString(),
      event: linkedEvent
        ? {
            id: linkedEvent.id,
            title: linkedEvent.title,
            eventDate: linkedEvent.eventDate,
            venue: "—"
          }
        : null
    };

    const prevTasks = tasks;
    const prevStats = stats;
    setTasks((t) => [optimistic, ...t]);
    setStats((s) =>
      s ? { ...s, total: s.total + 1, pending: s.pending + 1 } : s
    );
    setNewTitle("");
    setNewEventId("none");

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, eventId })
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        task?: { id: string; title: string; status: string; createdAt: string };
      };
      if (!res.ok) throw new Error(parseApiError(body, res.status, res.statusText));

      setTasks((t) =>
        t.map((item) =>
          item.id === tempId
            ? {
                ...item,
                id: body.task!.id,
                createdAt: body.task!.createdAt,
                status: body.task!.status === "done" || body.task!.status === "completed"
                  ? "completed"
                  : "pending"
              }
            : item
        )
      );
      useAppStore.getState().setTasksCache(cacheKey, null);
      useAppStore.getState().setTasksStats(null);
    } catch (e) {
      setTasks(prevTasks);
      setStats(prevStats);
      setToast(e instanceof Error ? e.message : "Failed to add task");
    }
  }

  async function toggleTask(task: TaskItem, complete: boolean) {
    const newStatus = complete ? "completed" : "pending";
    const prevTasks = tasks;
    const prevStats = stats;

    setTasks((t) =>
      t.map((item) => (item.id === task.id ? { ...item, status: newStatus } : item))
    );
    if (stats) {
      setStats({
        ...stats,
        pending: complete ? stats.pending - 1 : stats.pending + 1,
        completed: complete ? stats.completed + 1 : stats.completed - 1
      });
    }

    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(parseApiError(body, res.status, res.statusText));
      useAppStore.getState().setTasksCache(cacheKey, null);
      useAppStore.getState().setTasksStats(null);
    } catch (e) {
      setTasks(prevTasks);
      setStats(prevStats);
      setToast(e instanceof Error ? e.message : "Failed to update task");
    }
  }

  async function deleteTask(id: string) {
    const prevTasks = tasks;
    const prevStats = stats;
    const removed = tasks.find((t) => t.id === id);

    setTasks((t) => t.filter((item) => item.id !== id));
    if (stats && removed) {
      setStats({
        ...stats,
        total: stats.total - 1,
        pending: removed.status === "pending" ? stats.pending - 1 : stats.pending,
        completed: removed.status === "completed" ? stats.completed - 1 : stats.completed
      });
    }

    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(parseApiError(body, res.status, res.statusText));
      }
      useAppStore.getState().setTasksCache(cacheKey, null);
      useAppStore.getState().setTasksStats(null);
    } catch (e) {
      setTasks(prevTasks);
      setStats(prevStats);
      setToast(e instanceof Error ? e.message : "Failed to delete task");
    }
  }

  async function clearCompleted() {
    if (!completedTasks.length) return;
    const prevTasks = tasks;
    const prevStats = stats;
    const count = completedTasks.length;

    setTasks((t) => t.filter((item) => item.status !== "completed"));
    if (stats) {
      setStats({
        ...stats,
        total: stats.total - count,
        completed: stats.completed - count
      });
    }

    try {
      const results = await Promise.allSettled(
        completedTasks.map(async (t) => {
          const res = await fetch(`/api/tasks/${encodeURIComponent(t.id)}`, {
            method: "DELETE",
            credentials: "include"
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(parseApiError(body, res.status, res.statusText));
          }
          return t.id;
        })
      );

      const failedIds = new Set<string>();
      results.forEach((result, i) => {
        if (result.status === "rejected") {
          failedIds.add(completedTasks[i]!.id);
        }
      });

      if (failedIds.size > 0) {
        const failedTasks = prevTasks.filter((t) => failedIds.has(t.id));
        setTasks((current) => [...failedTasks, ...current]);
        if (prevStats) {
          setStats({
            ...prevStats,
            total: prevStats.total - (count - failedIds.size),
            completed: prevStats.completed - (count - failedIds.size)
          });
        }
        setToast(
          failedIds.size === count
            ? "Failed to clear completed tasks"
            : `${failedIds.size} task(s) could not be deleted`
        );
      }

      useAppStore.getState().setTasksCache(cacheKey, null);
      useAppStore.getState().setTasksStats(null);
    } catch {
      setTasks(prevTasks);
      setStats(prevStats);
      setToast("Failed to clear completed tasks");
    }
  }

  const empty = !loading && tasks.length === 0;

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
            onCheckedChange={(c) => void toggleTask(task, c === true)}
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
            onClick={() => void deleteTask(task.id)}
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
          <p className="mt-1 text-sm text-muted-foreground">Manage your operational to-dos</p>
        </div>
        {refreshing ? <RefreshingBadge /> : null}
      </header>

      {toast ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {toast}
        </div>
      ) : null}

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
            if (e.key === "Enter") void addTask();
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
          onClick={() => void addTask()}
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
                      Completed ({completedTasks.length})
                    </span>
                  </Button>
                </CollapsibleTrigger>
                {completedOpen ? (
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
        </div>
      )}
    </div>
  );
}
