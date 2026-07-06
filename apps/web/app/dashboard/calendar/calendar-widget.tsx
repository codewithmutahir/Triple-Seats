"use client";

import type { EventClickArg, DatesSetArg, EventInput } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useCallback, useRef } from "react";

import type { CalendarEvent } from "./types";

export type CalendarDatesChange = {
  gridStart: Date;
  gridEnd: Date;
  anchorStart: Date;
  viewType: string;
};

type CalendarWidgetProps = {
  events: CalendarEvent[];
  initialView: "dayGridMonth" | "timeGridWeek";
  onDatesChange: (info: CalendarDatesChange) => void;
  onEventClick: (event: CalendarEvent) => void;
  onReady?: () => void;
};

function toFullCalendarEvents(items: CalendarEvent[]): EventInput[] {
  return items.map((ev) => ({
    id: ev.id,
    title: ev.title,
    start: ev.start,
    backgroundColor: ev.color,
    borderColor: ev.color,
    extendedProps: ev
  }));
}

export function CalendarWidget({
  events,
  initialView,
  onDatesChange,
  onEventClick,
  onReady
}: CalendarWidgetProps) {
  const onDatesChangeRef = useRef(onDatesChange);
  onDatesChangeRef.current = onDatesChange;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const readyRef = useRef(false);

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    if (!readyRef.current) {
      readyRef.current = true;
      onReadyRef.current?.();
    }
    onDatesChangeRef.current({
      gridStart: arg.start,
      gridEnd: arg.end,
      anchorStart: arg.view.currentStart,
      viewType: arg.view.type
    });
  }, []);

  const handleEventClick = useCallback(
    (arg: EventClickArg) => {
      const ev = arg.event.extendedProps as CalendarEvent;
      onEventClick(ev);
    },
    [onEventClick]
  );

  return (
    <div className="caterpro-calendar">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={initialView}
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek"
        }}
        events={toFullCalendarEvents(events)}
        datesSet={handleDatesSet}
        eventClick={handleEventClick}
        height="auto"
        dayMaxEvents={3}
        moreLinkClick="popover"
        nowIndicator
        eventDisplay="block"
        eventTimeFormat={{
          hour: "numeric",
          minute: "2-digit",
          meridiem: "short"
        }}
      />
    </div>
  );
}
