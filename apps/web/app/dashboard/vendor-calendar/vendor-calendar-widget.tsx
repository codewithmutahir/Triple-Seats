"use client";

import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
  EventInput
} from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useCallback, useRef } from "react";

import type { VendorCalendarEntry } from "@/lib/vendor-calendar-types";

export type VendorCalendarDatesChange = {
  start: Date;
  end: Date;
};

type VendorCalendarWidgetProps = {
  entries: VendorCalendarEntry[];
  editable: boolean;
  onDatesChange: (info: VendorCalendarDatesChange) => void;
  onSelectSlot: (info: { start: Date; end: Date; allDay: boolean }) => void;
  onEventClick: (entry: VendorCalendarEntry) => void;
  onEventMove: (entryId: string, start: Date, end: Date, allDay: boolean) => void;
};

function toFcEvents(items: VendorCalendarEntry[]): EventInput[] {
  return items.map((ev) => ({
    id: ev.occurrenceId,
    title: ev.isRecurrenceInstance ? `${ev.title} ↻` : ev.title,
    start: ev.startAt,
    end: ev.endAt,
    allDay: ev.allDay,
    backgroundColor: ev.color,
    borderColor: ev.color,
    editable: !ev.isRecurrenceInstance,
    extendedProps: { entry: ev }
  }));
}

export function VendorCalendarWidget({
  entries,
  editable,
  onDatesChange,
  onSelectSlot,
  onEventClick,
  onEventMove
}: VendorCalendarWidgetProps) {
  const onDatesChangeRef = useRef(onDatesChange);
  onDatesChangeRef.current = onDatesChange;

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    onDatesChangeRef.current({ start: arg.start, end: arg.end });
  }, []);

  const handleEventClick = useCallback(
    (arg: EventClickArg) => {
      const entry = arg.event.extendedProps.entry as VendorCalendarEntry | undefined;
      if (entry) onEventClick(entry);
    },
    [onEventClick]
  );

  const handleSelect = useCallback(
    (arg: DateSelectArg) => {
      onSelectSlot({ start: arg.start, end: arg.end, allDay: arg.allDay });
    },
    [onSelectSlot]
  );

  const handleDrop = useCallback(
    (arg: EventDropArg) => {
      const entry = arg.event.extendedProps.entry as VendorCalendarEntry | undefined;
      if (entry?.isRecurrenceInstance) return;
      const start = arg.event.start;
      const end = arg.event.end ?? arg.event.start;
      if (!start || !end) return;
      onEventMove(entry?.seriesId ?? arg.event.id, start, end, arg.event.allDay);
    },
    [onEventMove]
  );

  const handleResize = useCallback(
    (arg: { event: { id: string; start: Date | null; end: Date | null; allDay: boolean; extendedProps: Record<string, unknown> } }) => {
      const entry = arg.event.extendedProps.entry as VendorCalendarEntry | undefined;
      if (entry?.isRecurrenceInstance) return;
      const start = arg.event.start;
      const end = arg.event.end ?? arg.event.start;
      if (!start || !end) return;
      onEventMove(entry?.seriesId ?? arg.event.id, start, end, arg.event.allDay);
    },
    [onEventMove]
  );

  return (
    <div className="vendor-calendar caterpro-calendar">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek"
        }}
        events={toFcEvents(entries)}
        datesSet={handleDatesSet}
        eventClick={handleEventClick}
        selectable={editable}
        selectMirror
        select={handleSelect}
        editable={editable}
        eventDrop={handleDrop}
        eventResize={handleResize}
        height="auto"
        dayMaxEvents={4}
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
