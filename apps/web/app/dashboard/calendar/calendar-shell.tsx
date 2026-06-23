import {
  addDays,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek
} from "date-fns";

import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type CalendarShellProps = {
  referenceDate?: Date;
  className?: string;
};

export function CalendarShell({ referenceDate = new Date(), className }: CalendarShellProps) {
  const monthStart = startOfMonth(referenceDate);
  const gridStart = startOfWeek(monthStart);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <div className={cn("calendar-shell", className)} aria-hidden>
      <div className="calendar-shell-toolbar">
        <div className="calendar-shell-toolbar-chunk">
          <span className="calendar-shell-btn-placeholder" />
          <span className="calendar-shell-btn-placeholder" />
          <span className="calendar-shell-btn-placeholder calendar-shell-btn-placeholder--wide" />
        </div>
        <div className="calendar-shell-title font-heading">{format(referenceDate, "MMMM yyyy")}</div>
        <div className="calendar-shell-toolbar-chunk calendar-shell-toolbar-chunk--end">
          <span className="calendar-shell-btn-placeholder calendar-shell-btn-placeholder--wide" />
          <span className="calendar-shell-btn-placeholder calendar-shell-btn-placeholder--wide" />
        </div>
      </div>

      <div className="calendar-shell-grid">
        {WEEKDAYS.map((day) => (
          <div key={day} className="calendar-shell-day-head">
            {day}
          </div>
        ))}
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={cn(
              "calendar-shell-cell",
              !isSameMonth(day, referenceDate) && "calendar-shell-cell--other"
            )}
          >
            <span
              className={cn(
                "calendar-shell-day-num",
                isToday(day) && "calendar-shell-day-num--today"
              )}
            >
              {format(day, "d")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
