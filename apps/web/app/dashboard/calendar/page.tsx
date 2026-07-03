import { cookies } from "next/headers";
import dynamic from "next/dynamic";
import { endOfMonth, startOfMonth } from "date-fns";

import { Card, CardContent } from "@/components/ui/card";

import { CalendarShell } from "./calendar-shell";
import type { CalendarEvent } from "./types";

const CalendarClient = dynamic(() => import("./calendar-client"), { ssr: false });

const STATUS_LEGEND = [
  { status: "lead", label: "Lead", color: "#F59E0B" },
  { status: "discussion", label: "Discussion", color: "#3B82F6" },
  { status: "booked", label: "Booked", color: "#10B981" },
  { status: "completed", label: "Completed", color: "#6B7280" }
] as const;

function internalApiOrigin(): string {
  return process.env.INTERNAL_API_URL?.replace(/\/+$/, "") ?? "http://127.0.0.1:4000";
}

async function fetchInitialCalendar(): Promise<CalendarEvent[]> {
  const cookieHeader = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  if (!cookieHeader) return [];

  try {
    const res = await fetch(`${internalApiOrigin()}/api/calendar/init`, {
      headers: { cookie: cookieHeader },
      next: { revalidate: 60 }
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { events?: CalendarEvent[] };
    return Array.isArray(data.events) ? data.events : [];
  } catch {
    return [];
  }
}

export default async function CalendarPage() {
  const now = new Date();
  const start = startOfMonth(now).toISOString();
  const end = endOfMonth(now).toISOString();
  const initialEvents = await fetchInitialCalendar();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-[#1B2A4A]">
          Calendar
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {STATUS_LEGEND.map((item) => (
            <span key={item.status} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden
              />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
        <CardContent className="relative p-3 sm:p-6">
          <div className="calendar-root relative min-h-[520px]">
            <CalendarShell
              referenceDate={now}
              className="pointer-events-none absolute inset-0 z-0"
            />
            <div className="relative z-10">
              <CalendarClient initialEvents={initialEvents} initialRange={{ start, end }} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
