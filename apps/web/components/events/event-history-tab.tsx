"use client";

import { format } from "date-fns";
import { CheckCircle2, History, Loader2 } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientHistoryQuery } from "@/hooks/use-client-history-query";
import type { ActivityEntry, EventDetailPayload } from "@/lib/event-types";
import { formatUsd } from "@/lib/quote-totals";

function formatShortDateTime(iso: string) {
  try {
    return format(new Date(iso), "MMM d, yyyy · h:mm a");
  } catch {
    return iso;
  }
}

type EventHistoryTabProps = {
  event: EventDetailPayload;
  activity: ActivityEntry[];
};

export function EventHistoryTab({ event, activity }: EventHistoryTabProps) {
  const guestEmail = event.primaryGuest?.email;
  const guestPhone = event.primaryGuest?.phone;

  const { data: clientHistory, isLoading: historyLoading } = useClientHistoryQuery(
    guestEmail,
    guestPhone,
    event.id
  );

  const sortedActivity = [...activity].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5" />
            Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {sortedActivity.map((entry, i) => (
                <li key={`${entry.at}-${i}`} className="flex gap-3 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div>
                    <p>{entry.label}</p>
                    <p className="text-xs text-muted-foreground">{formatShortDateTime(entry.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Client history</CardTitle>
          <p className="text-sm text-muted-foreground">
            Other events for this guest
            {guestEmail ? ` (${guestEmail})` : guestPhone ? ` (${guestPhone})` : ""}
          </p>
        </CardHeader>
        <CardContent>
          {!guestEmail && !guestPhone ? (
            <p className="text-sm text-muted-foreground">
              Add guest email or phone to look up past events.
            </p>
          ) : historyLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !clientHistory?.length ? (
            <p className="text-sm text-muted-foreground">No other events found for this client.</p>
          ) : (
            <ul className="space-y-3">
              {clientHistory.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3 text-sm"
                >
                  <div>
                    <Link
                      href={`/dashboard/events?eventId=${encodeURIComponent(entry.id)}&tab=overview`}
                      className="font-medium text-[#1B2A4A] hover:underline"
                    >
                      {entry.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(entry.eventDate), "MMM d, yyyy")}
                      {entry.location ? ` · ${entry.location}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {entry.status}
                    </Badge>
                    {entry.latestQuote ? (
                      <span className="text-xs font-medium">{formatUsd(entry.latestQuote.totalAmount)}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
