"use client";

import { addMonths, endOfMonth, format, startOfMonth, subMonths } from "date-fns";
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
import { useCalendarStore } from "@/lib/stores/calendar-store";

import { adjacentMonthRanges, fetchCalendarEvents, monthKey } from "./calendar-utils";
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
  const date = format(new Date(event.start), "EEEE, MMMM d, yyyy");
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
    if (cached) return cached;
  }
  return initialEvents;
}

export default function CalendarClient({ initialEvents, initialRange }: CalendarClientProps) {
  const isLoading = useCalendarStore((s) => s.isLoading);
  const setLoading = useCalendarStore((s) => s.setLoading);
  const getMonthEvents = useCalendarStore((s) => s.getMonthEvents);
  const setMonthEvents = useCalendarStore((s) => s.setMonthEvents);
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

  const activeRangeRef = useRef<{ start: Date; end: Date } | null>(null);
  const requestIdRef = useRef(0);
  const seededRef = useRef(false);

  if (!seededRef.current) {
    seededRef.current = true;
    const key = monthKey(new Date(initialRange.start));
    const store = useCalendarStore.getState();
    if (!store.isFresh(key)) {
      store.setMonthEvents(key, initialEvents);
    }
  }

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setInitialView(mq.matches ? "timeGridWeek" : "dayGridMonth");
    requestAnimationFrame(() => setEventsVisible(true));
  }, []);

  const loadMonthEvents = useCallback(
    async (start: Date, end: Date, silent = false) => {
      const key = monthKey(start);
      activeRangeRef.current = { start, end };

      if (isFresh(key)) {
        const cached = getMonthEvents(key);
        if (cached) {
          if (!silent) {
            setEvents(cached);
            setError(null);
            setEventsVisible(true);
          }
          return;
        }
      }

      const requestId = ++requestIdRef.current;
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      const result = await fetchCalendarEvents(start, end);
      if (requestId !== requestIdRef.current) return;

      if (result.error) {
        if (!silent) {
          setError(result.error);
          setEvents([]);
        }
      } else {
        const data = result.data ?? [];
        setMonthEvents(key, data);
        if (!silent) {
          setEvents(data);
          setEventsVisible(true);
          setError(null);
        }
      }

      if (!silent) {
        setLoading(false);
      }
    },
    [getMonthEvents, isFresh, setLoading, setMonthEvents]
  );

  const prefetchAdjacent = useCallback(
    (anchor: Date) => {
      for (const range of adjacentMonthRanges(anchor)) {
        const key = monthKey(range.start);
        if (!isFresh(key)) {
          void loadMonthEvents(range.start, range.end, true);
        }
      }
    },
    [isFresh, loadMonthEvents]
  );

  useEffect(() => {
    const prev = subMonths(currentViewStart, 1);
    const next = addMonths(currentViewStart, 1);
    for (const month of [prev, next]) {
      const key = monthKey(month);
      if (!isFresh(key)) {
        void loadMonthEvents(startOfMonth(month), endOfMonth(month), true);
      }
    }
  }, [currentViewStart, isFresh, loadMonthEvents]);

  const handleDatesChange = useCallback(
    (start: Date, end: Date) => {
      setCurrentViewStart(startOfMonth(start));
      void loadMonthEvents(start, end, false);
      prefetchAdjacent(start);
    },
    [loadMonthEvents, prefetchAdjacent]
  );

  const handleRetry = useCallback(() => {
    if (activeRangeRef.current) {
      const { start, end } = activeRangeRef.current;
      const key = monthKey(start);
      useCalendarStore.setState((state) => {
        const { [key]: _removed, ...rest } = state.cache;
        return { cache: rest };
      });
      void loadMonthEvents(start, end, false);
    }
  }, [loadMonthEvents]);

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
            onDatesChange={handleDatesChange}
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
