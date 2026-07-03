"use client";

import { format } from "date-fns";
import { BookCheck, Download, Inbox } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCustomerType, formatEventType } from "@/lib/event-customer-types";
import { RefreshingBadge } from "@/components/refreshing-badge";
import { useAppStore, type BookingsListResponse, type BookingsStats } from "@/lib/stores/app-store";
import { loadWithCache } from "@/lib/stores/cache-helpers";
import { parseApiError } from "@/lib/user-facing-error";
import { browserTimer } from "@/lib/perf";

type ListResponse = BookingsListResponse;
type StatsResponse = BookingsStats;

type BookingRow = ListResponse["items"][number];

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "booked", label: "Confirmed" },
  { value: "completed", label: "Completed" }
] as const;

const MONTHS = [
  { value: "all", label: "All months" },
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" }
];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

function formatBookingDate(iso: string) {
  try {
    return format(new Date(iso), "EEE, MMM d yyyy");
  } catch {
    return iso;
  }
}

function statusLabel(status: string) {
  if (status === "booked") return "Confirmed";
  if (status === "completed") return "Completed";
  return status;
}

function statusVariant(status: string): "booked" | "completed" | "outline" {
  if (status === "booked") return "booked";
  if (status === "completed") return "completed";
  return "outline";
}

function depositVariant(status: BookingRow["depositStatus"]): "lead" | "booked" {
  return status === "paid" ? "booked" : "lead";
}

function csvEscape(value: string | number | null | undefined) {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function fetchBookings(
  params: URLSearchParams
): Promise<ListResponse | { error: string; status: number }> {
  const res = await fetch(`/api/bookings?${params.toString()}`, { credentials: "include" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { error: parseApiError(body, res.status, res.statusText), status: res.status };
  }
  return (await res.json()) as ListResponse;
}

async function fetchStats(): Promise<StatsResponse | { error: string; status: number }> {
  const res = await fetch("/api/bookings/stats", { credentials: "include" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { error: parseApiError(body, res.status, res.statusText), status: res.status };
  }
  return (await res.json()) as StatsResponse;
}

function yearOptions() {
  const current = new Date().getFullYear();
  const years = [{ value: "all", label: "All years" }];
  for (let y = current + 1; y >= current - 5; y--) {
    years.push({ value: String(y), label: String(y) });
  }
  return years;
}

export default function BookingsPage() {
  const perfRef = useRef<ReturnType<typeof browserTimer> | null>(null);
  const perfEndedRef = useRef(false);
  if (!perfRef.current) {
    perfRef.current = browserTimer("bookings");
    perfRef.current.step("mount");
  }

  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]["value"]>("all");
  const [month, setMonth] = useState("all");
  const [year, setYear] = useState("all");
  const [page, setPage] = useState(1);

  const cacheKey = JSON.stringify({ page, status, month, year, search: searchDebounced });

  const [data, setData] = useState<ListResponse | null>(() =>
    useAppStore.getState().peekBookingsCache(cacheKey)
  );
  const [stats, setStats] = useState<StatsResponse | null>(() =>
    useAppStore.getState().peekBookingsStats()
  );
  const [loading, setLoading] = useState(
    () => useAppStore.getState().peekBookingsCache(cacheKey) == null
  );
  const [statsLoading, setStatsLoading] = useState(
    () => useAppStore.getState().peekBookingsStats() == null
  );
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const years = useMemo(() => yearOptions(), []);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("status", status);
    if (searchDebounced) p.set("search", searchDebounced);
    if (month !== "all") p.set("month", month);
    if (year !== "all") p.set("year", year);
    return p;
  }, [page, status, searchDebounced, month, year]);

  const load = useCallback(async () => {
    const store = useAppStore.getState();
    const key = cacheKey;
    setError(null);
    perfRef.current?.step("fetch:start");

    await loadWithCache({
      peek: () => store.peekBookingsCache(key),
      getFresh: () => store.getBookingsCache(key),
      set: (result) => store.setBookingsCache(key, result),
      fetch: async () => {
        const result = await fetchBookings(queryParams);
        if ("error" in result) throw new Error(result.error);
        return result;
      },
      onData: (data) => {
        setData(data);
        perfRef.current?.step("fetch:done");
      },
      setLoading,
      setRefreshing
    }).catch((e) => {
      setError(e instanceof Error ? e.message : "Request failed.");
    });
  }, [cacheKey, queryParams]);

  const loadStats = useCallback(async () => {
    const store = useAppStore.getState();
    await loadWithCache({
      peek: () => store.peekBookingsStats(),
      getFresh: () => store.getBookingsStats(),
      set: (result) => store.setBookingsStats(result),
      fetch: async () => {
        const result = await fetchStats();
        if ("error" in result) throw new Error(result.error);
        return result;
      },
      onData: setStats,
      setLoading: setStatsLoading
    }).catch((e) => {
      setError(e instanceof Error ? e.message : "Request failed.");
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (perfEndedRef.current || loading) return;
    if (data || error) {
      perfEndedRef.current = true;
      perfRef.current?.step("render:complete");
      perfRef.current?.end();
    }
  }, [data, loading, error]);

  useEffect(() => {
    setPage(1);
  }, [status, searchDebounced, month, year]);

  function exportCsv() {
    if (!data?.items.length) return;
    const headers = [
      "Guest Name",
      "Email",
      "Event Type",
      "Event Date",
      "Location",
      "Guests",
      "Quote Total",
      "Deposit Status",
      "Status",
      "Event Id"
    ];
    const rows = data.items.map((r) =>
      [
        r.guestName,
        r.guestEmail ?? "",
        r.eventType,
        r.eventDate,
        r.location,
        r.guestCount ?? "",
        r.quoteTotal ?? "",
        r.depositStatus === "paid" ? "Paid" : "Pending",
        statusLabel(r.status),
        r.eventId
      ]
        .map(csvEscape)
        .join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bookings-page-${data.page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const empty = !loading && data && data.total === 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-[#1B2A4A]">Bookings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Confirmed catering events</p>
        </div>
        {refreshing ? <RefreshingBadge /> : null}
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "Confirmed This Month",
            value: stats?.confirmedThisMonth,
            format: (v: number) => String(v)
          },
          {
            label: "Completed All Time",
            value: stats?.completedAllTime,
            format: (v: number) => String(v)
          },
          {
            label: "Revenue This Month",
            value: stats?.revenueThisMonth,
            format: (v: number) => money.format(v)
          }
        ].map(({ label, value, format: fmt }) => (
          <Card key={label}>
            <CardContent className="px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <div className="font-heading text-2xl font-semibold text-[#1B2A4A]">
                {statsLoading && stats == null ? (
                  <Skeleton className="mt-1 h-8 w-16" />
                ) : (
                  fmt(value ?? 0)
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 p-4 md:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
            <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-4xl lg:flex-1 lg:grid-cols-4">
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Search</label>
                <Input
                  placeholder="Guest name or location"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="bg-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Month</label>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Year</label>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y.value} value={y.value}>
                        {y.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 bg-white"
              onClick={exportCsv}
              disabled={!data?.items.length}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
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

      {error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {empty ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <BookCheck className="h-12 w-12 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-heading text-xl font-semibold text-[#1B2A4A]">
                No confirmed bookings yet
              </p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                When you mark events as booked, they will appear here as confirmed bookings.
              </p>
            </div>
            <Button type="button" asChild>
              <Link href="/dashboard/leads">
                <Inbox className="mr-2 h-4 w-4" />
                Go to Leads
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guest</TableHead>
                    <TableHead className="hidden sm:table-cell">Event</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Event Date</TableHead>
                    <TableHead className="hidden md:table-cell">Location</TableHead>
                    <TableHead className="text-right">Guests</TableHead>
                    <TableHead className="hidden lg:table-cell text-right">Quote Total</TableHead>
                    <TableHead>Deposit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && !(data?.items.length)
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 10 }).map((__, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-8 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    : (data?.items ?? []).map((row) => (
                        <TableRow key={row.eventId}>
                          <TableCell>
                            <div className="font-medium">{row.guestName}</div>
                            {row.guestEmail ? (
                              <div className="text-xs text-muted-foreground">{row.guestEmail}</div>
                            ) : null}
                            <div className="mt-1 sm:hidden">
                              <Badge variant="secondary" className="max-w-[140px] truncate font-normal">
                                {row.eventTypeLabel ?? formatEventType(row.eventType)}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant="secondary" className="max-w-[140px] truncate font-normal">
                              {row.eventTypeLabel ?? formatEventType(row.eventType)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                "font-semibold",
                                row.customerType === "b2b"
                                  ? "border-blue-300 bg-blue-50 text-blue-800"
                                  : "border-slate-300 bg-slate-100 text-slate-700"
                              )}
                            >
                              {formatCustomerType(row.customerType)}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {formatBookingDate(row.eventDate)}
                          </TableCell>
                          <TableCell className="hidden md:table-cell max-w-[180px] truncate text-sm">
                            {row.location}
                          </TableCell>
                          <TableCell className="text-right">{row.guestCount ?? "—"}</TableCell>
                          <TableCell className="hidden lg:table-cell text-right text-sm">
                            {row.quoteTotal != null ? money.format(row.quoteTotal) : "No quote"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={depositVariant(row.depositStatus)} className="capitalize">
                              {row.depositStatus === "paid" ? "Paid" : "Pending"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
                              <Button variant="outline" size="sm" asChild>
                                <Link
                                  href={`/dashboard/events?eventId=${encodeURIComponent(row.eventId)}`}
                                >
                                  View Event
                                </Link>
                              </Button>
                              {row.quoteId ? (
                                <Button variant="ghost" size="sm" asChild>
                                  <Link
                                    href={`/dashboard/quotes?eventId=${encodeURIComponent(row.eventId)}`}
                                  >
                                    View Quote
                                  </Link>
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </div>

            {data && data.totalPages > 1 ? (
              <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 sm:flex-row">
                <p className="text-sm text-muted-foreground">
                  Page {data.page} of {data.totalPages} · {data.total} total
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loading || page >= data.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
