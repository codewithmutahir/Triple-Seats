"use client";

import { endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { CalendarDays, Loader2, MapPin, RefreshCw, Users } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { browserTimer } from "@/lib/perf";
import { useCalendarStore } from "@/lib/stores/calendar-store";

import { adjacentMonthRanges, collectEventsForGrid, eventCalendarDay, eventsForMonthKey, fetchCalendarEvents, fetchCalendarInit, groupEventsByMonth, monthKey, monthStartFromKey, monthsOverlappingRange } from "./calendar-utils";
import type { CalendarDatesChange } from "./calendar-widget";
import type { CalendarEvent } from "./types";

const CalendarWidget = dynamic(
  () => import("./calendar-widget").then((m) => m.CalendarWidget),
  { ssr: false }
);

type CalendarClientProps = {
  initialEvents: CalendarEvent[];
  initialRange: { start: string; end: string };
};

function statusVariant(
  status: string
): "lead" | "booked" | "completed" | "discussion" | "outline" {
  if (status === "lead") return "lead";
  if (status === "booked") return "booked";
  if (status === "completed") return "completed";
  if (status === "discussion") return "discussion";
  return "outline";
}

function statusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function guestInitials(name?: string | null) {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
  }
  return parts[0]!.slice(0, 2).toUpperCase();
}

function formatEventDateTime(event: CalendarEvent) {
  const date = format(parseISO(eventCalendarDay(event.start)), "EEEE, MMMM d, yyyy");
  if (!event.startTime) return date;
  const timeStart = format(new Date(event.startTime), "h:mm a");
  const timeEnd = event.endTime ? format(new Date(event.endTime), "h:mm a") : null;
  return timeEnd ? `${date} · ${timeStart} – ${timeEnd}` : `${date} · ${timeStart}`;
}

function resolveInitialEvents(
  initialRange: { start: string; end: string },
  initialEvents: CalendarEvent[]
): CalendarEvent[] {
  const key = monthKey(new Date(initialRange.start));
  const store = useCalendarStore.getState();
  if (store.isFresh(key)) {
    const cached = store.getMonthEvents(key);
    if (cached !== null) return cached;
  }
  return initialEvents;
}

export default function CalendarClient({ initialEvents, initialRange }: CalendarClientProps) {
  const perfRef = useRef<ReturnType<typeof browserTimer> | null>(null);
  const perfEndedRef = useRef(false);
  if (!perfRef.current) {
    perfRef.current = browserTimer("calendar");
    perfRef.current.step("mount");
  }

  const isLoading = useCalendarStore((s) => s.isLoading);
  const setLoading = useCalendarStore((s) => s.setLoading);
  const getMonthEvents = useCalendarStore((s) => s.getMonthEvents);
  const setMonthEvents = useCalendarStore((s) => s.setMonthEvents);
  const seedEventsByMonth = useCalendarStore((s) => s.seedEventsByMonth);
  const isFresh = useCalendarStore((s) => s.isFresh);

  const [events, setEvents] = useState<CalendarEvent[]>(() =>
    resolveInitialEvents(initialRange, initialEvents)
  );
  const [error, setError] = useState<string | null>(null);
  const [eventsVisible, setEventsVisible] = useState(true);
  const [fcReady, setFcReady] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [initialView, setInitialView] = useState<"dayGridMonth" | "timeGridWeek">("dayGridMonth");
  const [currentViewStart, setCurrentViewStart] = useState<Date>(() =>
    startOfMonth(new Date(initialRange.start))
  );

  const activeRangeRef = useRef<CalendarDatesChange | null>(null);
  const requestIdRef = useRef(0);
  const seededRef = useRef(false);
  const initLoadedRef = useRef(false);

  if (!seededRef.current) {
    seededRef.current = true;
    if (initialEvents.length > 0) {
      const store = useCalendarStore.getState();
      store.seedEventsByMonth(groupEventsByMonth(initialEvents));
    }
  }

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setInitialView(mq.matches ? "timeGridWeek" : "dayGridMonth");
    requestAnimationFrame(() => setEventsVisible(true));
  }, []);

  useEffect(() => {
    if (initLoadedRef.current) return;
    initLoadedRef.current = true;

    const key = monthKey(new Date(initialRange.start));
    if (isFresh(key)) {
      const cached = getMonthEvents(key);
      if (cached !== null) {
        setEvents(cached);
        setEventsVisible(true);
        return;
      }
    }

    if (initialEvents.length > 0) {
      setEvents(getMonthEvents(key) ?? eventsForMonthKey(initialEvents, key));
      setEventsVisible(true);
      return;
    }

    void (async () => {
      setLoading(true);
      perfRef.current?.step("fetch:init");
      const result = await fetchCalendarInit();
      perfRef.current?.step("fetch:done");

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      const all = result.data ?? [];
      seedEventsByMonth(groupEventsByMonth(all));
      const current = getMonthEvents(key) ?? eventsForMonthKey(all, key);
      setEvents(current);
      setEventsVisible(true);
      setError(null);
      setLoading(false);
    })();
  }, [getMonthEvents, initialEvents, initialRange.start, isFresh, seedEventsByMonth, setLoading]);

  const loadMonthEvents = useCallback(
    async (monthStart: Date, monthEnd: Date, key: string, silent = false) => {
      if (isFresh(key)) {
        const cached = getMonthEvents(key);
        if (cached !== null) return cached;
      }

      const requestId = ++requestIdRef.current;
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      perfRef.current?.step("fetch:start");
      const result = await fetchCalendarEvents(monthStart, monthEnd);
      perfRef.current?.step("fetch:done");
      if (requestId !== requestIdRef.current) return null;

      if (result.error) {
        if (!silent) {
          setError(result.error);
        }
        return null;
      }

      const data = eventsForMonthKey(result.data ?? [], key);
      setMonthEvents(key, data);
      return data;
    },
    [getMonthEvents, isFresh, setLoading, setMonthEvents]
  );

  const ensureGridMonthsLoaded = useCallback(
    async (gridStart: Date, gridEnd: Date) => {
      const loads = monthsOverlappingRange(gridStart, gridEnd).map(async (key) => {
        if (isFresh(key) && getMonthEvents(key) !== null) return;
        const monthStart = monthStartFromKey(key);
        await loadMonthEvents(monthStart, endOfMonth(monthStart), key, true);
      });
      await Promise.all(loads);
    },
    [getMonthEvents, isFresh, loadMonthEvents]
  );

  const applyGridEvents = useCallback(
    (gridStart: Date, gridEnd: Date) => {
      setEvents(collectEventsForGrid(gridStart, gridEnd, getMonthEvents));
      setEventsVisible(true);
      setError(null);
    },
    [getMonthEvents]
  );

  const prefetchAdjacent = useCallback(
    (anchor: Date) => {
      for (const range of adjacentMonthRanges(anchor)) {
        const key = monthKey(range.start);
        if (!isFresh(key) || getMonthEvents(key) === null) {
          void loadMonthEvents(range.start, range.end, key, true);
        }
      }
    },
    [getMonthEvents, isFresh, loadMonthEvents]
  );

  const handleViewChange = useCallback(
    async ({ gridStart, gridEnd, anchorStart, viewType }: CalendarDatesChange) => {
      activeRangeRef.current = { gridStart, gridEnd, anchorStart, viewType };
      setCurrentViewStart(
        viewType === "dayGridMonth" ? startOfMonth(anchorStart) : anchorStart
      );

      if (viewType === "timeGridWeek") {
        setLoading(true);
        setError(null);
        const result = await fetchCalendarEvents(gridStart, gridEnd);
        if (result.error) {
          setError(result.error);
          setEvents([]);
        } else {
          setEvents(result.data ?? []);
          setEventsVisible(true);
          setError(null);
        }
        setLoading(false);
        return;
      }

      const visibleMonth = startOfMonth(anchorStart);
      const key = monthKey(visibleMonth);
      await loadMonthEvents(visibleMonth, endOfMonth(visibleMonth), key, false);
      await ensureGridMonthsLoaded(gridStart, gridEnd);
      applyGridEvents(gridStart, gridEnd);
      setLoading(false);
      prefetchAdjacent(visibleMonth);
    },
    [applyGridEvents, ensureGridMonthsLoaded, loadMonthEvents, prefetchAdjacent, setLoading]
  );

  useEffect(() => {
    if (perfEndedRef.current || isLoading) return;
    if (eventsVisible) {
      perfEndedRef.current = true;
      perfRef.current?.step("render:complete");
      perfRef.current?.end();
    }
  }, [isLoading, eventsVisible]);

  const handleRetry = useCallback(() => {
    const active = activeRangeRef.current;
    if (!active) return;

    useCalendarStore.setState((state) => {
      const cache = { ...state.cache };
      for (const key of monthsOverlappingRange(active.gridStart, active.gridEnd)) {
        delete cache[key];
      }
      return { cache };
    });
    void handleViewChange(active);
  }, [handleViewChange]);

  const handleEventClick = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event);
    setDialogOpen(true);
  }, []);

  const handleReady = useCallback(() => {
    setFcReady(true);
  }, []);

  if (error && !events.length && !isLoading) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader>
          <CardTitle className="font-heading text-lg text-destructive">
            Couldn&apos;t load calendar
          </CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={handleRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="relative min-h-[520px]">
        <div className="mb-1 flex h-7 items-center justify-end px-1">
          {isLoading ? (
            <div
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-muted-foreground shadow-sm"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-3 w-3 animate-spin text-[#1B2A4A]" />
              Syncing…
            </div>
          ) : null}
        </div>

        {error && events.length > 0 ? (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs text-destructive">
            <span>{error}</span>
            <button type="button" className="underline" onClick={handleRetry}>
              Retry
            </button>
          </div>
        ) : null}

        <div
          className={cn(
            "caterpro-calendar-events relative bg-white transition-opacity duration-300 ease-out",
            eventsVisible ? "opacity-100" : "opacity-0",
            !fcReady && "min-h-[520px]"
          )}
        >
          <CalendarWidget
            events={events}
            initialView={initialView}
            onDatesChange={handleViewChange}
            onEventClick={handleEventClick}
            onReady={handleReady}
          />
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          {selectedEvent ? (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 pr-6">
                  <Avatar>{guestInitials(selectedEvent.guestName)}</Avatar>
                  <div className="min-w-0 space-y-1">
                    <DialogTitle className="truncate font-heading text-xl text-[#1B2A4A]">
                      {selectedEvent.guestName ?? "Unknown guest"}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                      Event details for {selectedEvent.guestName ?? "guest"}
                    </DialogDescription>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={statusVariant(selectedEvent.status)}
                        style={{
                          backgroundColor: `${selectedEvent.color}22`,
                          color: selectedEvent.color,
                          borderColor: "transparent"
                        }}
                      >
                        {selectedEvent.eventTitle ?? selectedEvent.title.split(" — ")[0]}
                      </Badge>
                      <Badge variant={statusVariant(selectedEvent.status)}>
                        {statusLabel(selectedEvent.status)}
                      </Badge>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-2 text-muted-foreground">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#1B2A4A]" />
                  <span>{formatEventDateTime(selectedEvent)}</span>
                </div>
                {selectedEvent.location ? (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#1B2A4A]" />
                    <span>{selectedEvent.location}</span>
                  </div>
                ) : null}
                {selectedEvent.guestCount != null ? (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#1B2A4A]" />
                    <span>
                      {selectedEvent.guestCount} guest{selectedEvent.guestCount === 1 ? "" : "s"}
                    </span>
                  </div>
                ) : null}
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Close
                </Button>
                <Button type="button" className="bg-[#1B2A4A] hover:bg-[#1B2A4A]/90" asChild>
                  <Link href={`/dashboard/events?eventId=${encodeURIComponent(selectedEvent.id)}`}>
                    View Event
                  </Link>
                </Button>
                {selectedEvent.hasQuote ? (
                  <Button type="button" variant="secondary" asChild>
                    <Link href={`/dashboard/quotes?eventId=${encodeURIComponent(selectedEvent.id)}`}>
                      View Quote
                    </Link>
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
