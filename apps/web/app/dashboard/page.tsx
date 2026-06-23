"use client";

import type { ComponentType } from "react";
import {
  ArrowRight,
  BarChart3,
  BookCheck,
  CalendarDays,
  LayoutDashboard,
  UserPlus
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshingBadge } from "@/components/refreshing-badge";
import {
  useAppStore,
  type DashboardRecentRow,
  type DashboardStats,
  type DashboardUpcomingRow
} from "@/lib/stores/app-store";
import { loadWithCache } from "@/lib/stores/cache-helpers";

type StatsResponse = DashboardStats;
type RecentRow = DashboardRecentRow;
type UpcomingRow = DashboardUpcomingRow;

function statusVariant(status: string): "lead" | "booked" | "completed" | "discussion" | "outline" {
  if (status === "lead") return "lead";
  if (status === "booked") return "booked";
  if (status === "completed") return "completed";
  if (status === "discussion") return "discussion";
  return "outline";
}

function formatShortDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

async function fetchJson<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const res = await fetch(path, { credentials: "include" });
  if (res.status === 401) {
    return { ok: false, status: 401, message: "You need to sign in again." };
  }
  if (res.status === 403) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return {
      ok: false,
      status: 403,
      message: body?.error ?? "No caterer profile linked to this account."
    };
  }
  if (res.status === 409) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return {
      ok: false,
      status: 409,
      message: body?.error ?? "Account conflict."
    };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, message: text || "Request failed." };
  }
  return { ok: true, data: (await res.json()) as T };
}

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsResponse | null>(() =>
    useAppStore.getState().peekDashboardStats()
  );
  const [recent, setRecent] = useState<RecentRow[] | null>(() =>
    useAppStore.getState().peekRecentLeads()
  );
  const [upcoming, setUpcoming] = useState<UpcomingRow[] | null>(() =>
    useAppStore.getState().peekUpcomingEvents()
  );
  const [statsLoading, setStatsLoading] = useState(
    () => useAppStore.getState().peekDashboardStats() == null
  );
  const [recentLoading, setRecentLoading] = useState(
    () => useAppStore.getState().peekRecentLeads() == null
  );
  const [upcomingLoading, setUpcomingLoading] = useState(
    () => useAppStore.getState().peekUpcomingEvents() == null
  );
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    const store = useAppStore.getState();
    setError(null);

    const run = async <T,>(
      peek: () => T | null,
      getFresh: () => T | null,
      setCache: (data: T) => void,
      fetchData: () => Promise<T>,
      onData: (data: T) => void,
      setLoading: (v: boolean) => void
    ) => {
      if (force) {
        setLoading(true);
        const data = await fetchData();
        setCache(data);
        onData(data);
        setLoading(false);
        return;
      }
      await loadWithCache({
        peek,
        getFresh,
        set: setCache,
        fetch: fetchData,
        onData,
        setLoading,
        setRefreshing
      });
    };

    try {
      await Promise.all([
        run(
          () => store.peekDashboardStats(),
          () => store.getDashboardStats(),
          (d) => store.setDashboardStats(d),
          async () => {
            const res = await fetchJson<StatsResponse>("/api/dashboard/stats");
            if (!res.ok) throw new Error(res.message);
            return res.data;
          },
          setStats,
          setStatsLoading
        ),
        run(
          () => store.peekRecentLeads(),
          () => store.getRecentLeads(),
          (d) => store.setRecentLeads(d),
          async () => {
            const res = await fetchJson<{ items: RecentRow[] }>("/api/dashboard/recent-leads");
            if (!res.ok) throw new Error(res.message);
            return res.data.items;
          },
          setRecent,
          setRecentLoading
        ),
        run(
          () => store.peekUpcomingEvents(),
          () => store.getUpcomingEvents(),
          (d) => store.setUpcomingEvents(d),
          async () => {
            const res = await fetchJson<{ items: UpcomingRow[] }>("/api/dashboard/upcoming-events");
            if (!res.ok) throw new Error(res.message);
            return res.data.items;
          },
          setUpcoming,
          setUpcomingLoading
        )
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
      setStats(null);
      setRecent(null);
      setUpcoming(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader>
          <CardTitle className="font-heading text-lg text-destructive">Couldn&apos;t load dashboard</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={() => void load(true)}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {refreshing ? (
        <div className="flex justify-end">
          <RefreshingBadge />
        </div>
      ) : null}
      <section>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Total leads (this month)"
            icon={UserPlus}
            value={stats?.leads.count}
            trend={stats?.leads.trend}
            loading={statsLoading && stats == null}
          />
          <StatCard
            title="Confirmed bookings"
            subtitle="Booked events this month"
            icon={BookCheck}
            value={stats?.bookings.count}
            trend={stats?.bookings.trend}
            loading={statsLoading && stats == null}
          />
          <StatCard
            title="Upcoming events"
            subtitle="Next 7 days"
            icon={CalendarDays}
            value={stats?.upcomingEvents.count}
            trend={stats?.upcomingEvents.trend}
            loading={statsLoading && stats == null}
          />
          <StatCard
            title="Revenue this month"
            subtitle="Confirmed quotes"
            icon={BarChart3}
            value={stats != null ? money.format(stats.revenue.amount) : undefined}
            trend={stats?.revenue.trend}
            loading={statsLoading && stats == null}
            isTextValue
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="font-heading text-lg">Recent leads</CardTitle>
              <CardDescription>Latest inquiries tied to events</CardDescription>
            </div>
            <LayoutDashboard className="h-5 w-5 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            {recentLoading && recent == null ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guest</TableHead>
                    <TableHead className="hidden sm:table-cell">Event</TableHead>
                    <TableHead className="hidden md:table-cell">Date</TableHead>
                    <TableHead className="hidden lg:table-cell">Location</TableHead>
                    <TableHead className="text-right">Guests</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(recent ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No leads yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (recent ?? []).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.guestName}</TableCell>
                        <TableCell className="hidden sm:table-cell">{row.eventType}</TableCell>
                        <TableCell className="hidden md:table-cell whitespace-nowrap">
                          {formatShortDate(row.date)}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell max-w-[180px] truncate">{row.location}</TableCell>
                        <TableCell className="text-right">{row.guestCount ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(row.status)} className="capitalize">
                            {row.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/dashboard/events?eventId=${encodeURIComponent(row.id)}`}>View</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
            <div className="mt-4 text-right">
              <Link
                href="/dashboard/leads"
                className="inline-flex items-center gap-1 text-sm font-medium text-[#1B2A4A] hover:underline"
              >
                View all leads
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">Upcoming events</CardTitle>
            <CardDescription>Next 7 days</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingLoading && upcoming == null ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (upcoming ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-muted-foreground">
                No events in the next week.
              </p>
            ) : (
              <ul className="space-y-3">
                {(upcoming ?? []).map((ev) => (
                  <li
                    key={ev.id}
                    className="rounded-lg border border-slate-100 bg-white px-3 py-3 shadow-sm"
                  >
                    <p className="font-medium text-slate-900">{ev.title}</p>
                    <p className="text-xs text-muted-foreground">{formatShortDate(ev.date)}</p>
                    <p className="mt-1 text-sm text-slate-600 line-clamp-2">{ev.venue}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Guests: {ev.guestCount ?? "—"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function StatCard({
  title,
  subtitle,
  icon: Icon,
  value,
  trend,
  loading,
  isTextValue
}: {
  title: string;
  subtitle?: string;
  icon: ComponentType<{ className?: string }>;
  value?: number | string;
  trend?: string;
  loading: boolean;
  isTextValue?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="font-heading text-base font-semibold text-[#1B2A4A]">{title}</CardTitle>
          {subtitle ? <CardDescription className="text-xs">{subtitle}</CardDescription> : null}
        </div>
        <Icon className="h-5 w-5 text-[#1B2A4A]/70" aria-hidden />
      </CardHeader>
      <CardContent>
        {loading ? (
          <>
            <Skeleton className="mb-2 h-8 w-24" />
            <Skeleton className="h-3 w-32" />
          </>
        ) : (
          <>
            <p className={isTextValue ? "text-2xl font-semibold tracking-tight" : "text-3xl font-bold tracking-tight"}>
              {value ?? "—"}
            </p>
            {trend ? <p className="mt-1 text-xs text-muted-foreground">{trend}</p> : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
