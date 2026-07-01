"use client";

import { CalendarCheck, DollarSign, Download, TrendingUp, Users } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RefreshingBadge } from "@/components/refreshing-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAppStore, type ReportsData } from "@/lib/stores/app-store";
import { parseApiError } from "@/lib/user-facing-error";

const ReportsBarCharts = dynamic(
  () => import("./reports-charts").then((m) => m.ReportsBarCharts),
  { ssr: false }
);

const ReportsTypePieChart = dynamic(
  () => import("./reports-charts").then((m) => m.ReportsTypePieChart),
  { ssr: false }
);

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const moneyDetail = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const MONTHS = [
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

function yearOptions() {
  const current = new Date().getFullYear();
  const years: { value: string; label: string }[] = [];
  for (let y = current + 1; y >= current - 5; y--) {
    years.push({ value: String(y), label: String(y) });
  }
  return years;
}

function formatDisplayDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatShortDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short"
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

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
  if (status === "booked") return "Confirmed";
  if (status === "completed") return "Completed";
  if (status === "discussion") return "Discussion";
  if (status === "lead") return "Lead";
  return status;
}

function csvEscape(value: string | number | null | undefined) {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function trendLabel(growth: number) {
  if (growth > 0) return `+${growth}% vs last month`;
  if (growth < 0) return `${growth}% vs last month`;
  return "Flat vs last month";
}

async function fetchReports(year: number, month: number): Promise<ReportsData | { error: string }> {
  const params = new URLSearchParams({ year: String(year), month: String(month) });
  const [summaryRes, timelineRes] = await Promise.all([
    fetch(`/api/reports/summary?${params}`, { credentials: "include" }),
    fetch(`/api/reports/events-timeline?${params}`, { credentials: "include" })
  ]);

  if (!summaryRes.ok) {
    const body = (await summaryRes.json().catch(() => null)) as { error?: string } | null;
    return { error: parseApiError(body, summaryRes.status, summaryRes.statusText) };
  }
  if (!timelineRes.ok) {
    const body = (await timelineRes.json().catch(() => null)) as { error?: string } | null;
    return { error: parseApiError(body, timelineRes.status, timelineRes.statusText) };
  }

  const summary = await summaryRes.json();
  const timeline = await timelineRes.json();
  return { filterKey: `${year}-${month}`, summary, timeline };
}

export default function ReportsPage() {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));

  const filterKey = `${year}-${month}`;

  const [reports, setReports] = useState<ReportsData | null>(() => {
    const cached = useAppStore.getState().peekReportsCache();
    return cached?.filterKey === `${now.getFullYear()}-${now.getMonth() + 1}` ? cached : null;
  });
  const [loading, setLoading] = useState(() => {
    const cached = useAppStore.getState().peekReportsCache();
    return !(cached?.filterKey === `${now.getFullYear()}-${now.getMonth() + 1}`);
  });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const store = useAppStore.getState();
    setError(null);

    const cached = store.getReportsCache();
    if (cached?.filterKey === filterKey) {
      if (requestId === requestIdRef.current) {
        setReports(cached);
        setLoading(false);
        setRefreshing(false);
      }
      return;
    }

    const stale = store.peekReportsCache();
    if (stale?.filterKey === filterKey) {
      if (requestId === requestIdRef.current) {
        setReports(stale);
        setLoading(false);
      }
    } else if (requestId === requestIdRef.current) {
      setReports(null);
      setLoading(true);
    }

    if (requestId === requestIdRef.current) {
      setRefreshing(stale?.filterKey === filterKey);
    }
    try {
      const result = await fetchReports(parseInt(year, 10), parseInt(month, 10));
      if (requestId !== requestIdRef.current) return;
      if ("error" in result) throw new Error(result.error);
      store.setReportsCache(result);
      setReports(result);
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      setError(e instanceof Error ? e.message : "Request failed.");
      if (stale?.filterKey !== filterKey) setReports(null);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [filterKey, year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = reports?.summary;
  const timeline = reports?.timeline ?? [];

  const avgEventValue = useMemo(() => {
    if (!summary) return 0;
    const count = summary.events.thisMonth;
    if (count === 0) return 0;
    return Math.round(summary.revenue.thisMonth / count);
  }, [summary]);

  const avgEventValueLastMonth = useMemo(() => {
    if (!summary) return 0;
    const count = summary.events.lastMonth;
    if (count === 0) return 0;
    return Math.round(summary.revenue.lastMonth / count);
  }, [summary]);

  const revenueChartData = useMemo(
    () =>
      summary?.topMonths.map((m) => ({
        month: m.month.replace(/\s\d{4}$/, ""),
        revenue: m.revenue,
        fullMonth: m.month
      })) ?? [],
    [summary]
  );

  const typeChartData = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.events.byType).map(([name, value]) => ({ name, value }));
  }, [summary]);

  const totalEventsByType = useMemo(
    () => typeChartData.reduce((s, d) => s + d.value, 0),
    [typeChartData]
  );

  function exportCsv() {
    if (!summary) return;
    const rows = [
      ["Metric", "Value"],
      ["Total Revenue", summary.revenue.total],
      ["Revenue This Month", summary.revenue.thisMonth],
      ["Revenue Last Month", summary.revenue.lastMonth],
      ["Revenue Growth %", summary.revenue.growth],
      ["Total Events", summary.events.total],
      ["Events This Month", summary.events.thisMonth],
      ["Leads Total", summary.leads.total],
      ["Leads This Month", summary.leads.thisMonth],
      ["Conversion Rate %", summary.leads.conversionRate],
      [],
      ["Event Type", "Count"],
      ...Object.entries(summary.events.byType).map(([k, v]) => [k, v]),
      [],
      ["Status", "Count"],
      ...Object.entries(summary.events.byStatus).map(([k, v]) => [k, v]),
      [],
      [
        "Booking Date",
        "Event Date",
        "Status",
        "Customer",
        "Event ID",
        "Phone",
        "Email",
        "Event",
        "Location",
        "Event Type",
        "Food",
        "Labor",
        "Delivery",
        "Equipment",
        "Service Charges",
        "Discount",
        "Tax",
        "Revenue"
      ],
      ...(summary.leadReports ?? []).map((row) => [
        formatDisplayDate(row.bookingDate),
        formatDisplayDate(row.eventDate),
        row.status,
        row.customerName,
        row.displayEventId,
        row.phone ?? "",
        row.email ?? "",
        row.eventTitle,
        row.location,
        row.eventType,
        row.food,
        row.labor,
        row.delivery,
        row.equipment,
        row.serviceCharges,
        row.discount,
        row.tax,
        row.revenue
      ])
    ];
    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reports-${year}-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-[#1B2A4A]">
            Reports
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Business performance overview</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {refreshing ? <RefreshingBadge /> : null}
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-[140px] bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-[100px] bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions().map((y) => (
                <SelectItem key={y.value} value={y.value}>
                  {y.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={!summary}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </header>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Revenue This Month",
            value: summary ? money.format(summary.revenue.thisMonth) : null,
            trend: summary ? trendLabel(summary.revenue.growth) : null,
            icon: DollarSign
          },
          {
            label: "Events This Month",
            value: summary?.events.thisMonth,
            trend: summary
              ? `${summary.events.total} all time`
              : null,
            icon: CalendarCheck
          },
          {
            label: "Conversion Rate",
            value: summary ? `${summary.leads.conversionRate}%` : null,
            trend: summary ? `${summary.leads.thisMonth} leads this month` : null,
            icon: Users
          },
          {
            label: "Avg Event Value",
            value: summary ? money.format(avgEventValue) : null,
            trend: summary
              ? `${money.format(avgEventValueLastMonth)} avg last month`
              : null,
            icon: TrendingUp
          }
        ].map(({ label, value, trend, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-start gap-3 p-4">
              <div className="rounded-md bg-slate-100 p-2">
                <Icon className="h-5 w-5 text-[#1B2A4A]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="font-heading text-2xl font-semibold text-[#1B2A4A]">
                  {loading && value == null ? <Skeleton className="h-8 w-20" /> : (value ?? "—")}
                </p>
                {trend ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{trend}</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <>
          <Card>
            <CardContent className="p-6">
              <Skeleton className="h-[280px] w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <Skeleton className="h-[280px] w-full" />
            </CardContent>
          </Card>
        </>
      ) : (
        <ReportsBarCharts revenueChartData={revenueChartData} timeline={timeline} />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg text-[#1B2A4A]">By Event Type</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="mx-auto h-[240px] w-[240px] rounded-full" />
            ) : (
              <ReportsTypePieChart
                typeChartData={typeChartData}
                totalEventsByType={totalEventsByType}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg text-[#1B2A4A]">By Status</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {summary
                  ? (
                      [
                        ["Lead", summary.events.byStatus.lead, "lead"],
                        ["Discussion", summary.events.byStatus.discussion, "discussion"],
                        ["Booked", summary.events.byStatus.booked, "booked"],
                        ["Completed", summary.events.byStatus.completed, "completed"]
                      ] as const
                    ).map(([label, count, key]) => (
                      <div
                        key={key}
                        className="rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3"
                      >
                        <p className="text-xs font-medium text-muted-foreground">{label}</p>
                        <p className="font-heading text-2xl font-semibold text-[#1B2A4A]">
                          {count}
                        </p>
                      </div>
                    ))
                  : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg text-[#1B2A4A]">Reports per Lead</CardTitle>
          <p className="text-sm text-muted-foreground">
            Lead and quote breakdown for events in the selected month
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Booking Date</TableHead>
                  <TableHead>Event Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Event ID</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead className="text-right">Food</TableHead>
                  <TableHead className="text-right">Labor</TableHead>
                  <TableHead className="text-right">Delivery</TableHead>
                  <TableHead className="text-right">Equipment</TableHead>
                  <TableHead className="text-right">Service</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary?.leadReports?.length ? (
                  summary.leadReports.map((row) => (
                    <TableRow key={row.eventId}>
                      <TableCell className="whitespace-nowrap">
                        {formatShortDate(row.bookingDate)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatShortDate(row.eventDate)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(row.status)}>
                          {statusLabel(row.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        {row.customerName}
                      </TableCell>
                      <TableCell>{row.displayEventId}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.phone ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.email ? (
                          <a href={`mailto:${row.email}`} className="text-[#1B2A4A] hover:underline">
                            {row.email}
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>{row.eventTitle}</TableCell>
                      <TableCell className="max-w-[140px] truncate">{row.location}</TableCell>
                      <TableCell>{row.eventType}</TableCell>
                      <TableCell className="text-right">{moneyDetail.format(row.food)}</TableCell>
                      <TableCell className="text-right">{moneyDetail.format(row.labor)}</TableCell>
                      <TableCell className="text-right">{moneyDetail.format(row.delivery)}</TableCell>
                      <TableCell className="text-right">{moneyDetail.format(row.equipment)}</TableCell>
                      <TableCell className="text-right">
                        {moneyDetail.format(row.serviceCharges)}
                      </TableCell>
                      <TableCell className="text-right">{moneyDetail.format(row.discount)}</TableCell>
                      <TableCell className="text-right">{moneyDetail.format(row.tax)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {moneyDetail.format(row.revenue)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={18} className="text-center text-muted-foreground">
                      No leads or events for this month
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg text-[#1B2A4A]">Recent Bookings</CardTitle>
          <p className="text-sm text-muted-foreground">
            Confirmed and completed events this month
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
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
                  <TableHead>Event Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary?.recentActivity.length ? (
                  summary.recentActivity.map((row, i) => (
                    <TableRow key={`${row.guestName}-${row.eventDate}-${i}`}>
                      <TableCell className="font-medium">{row.guestName}</TableCell>
                      <TableCell>{row.eventType}</TableCell>
                      <TableCell>{formatDisplayDate(row.eventDate)}</TableCell>
                      <TableCell className="text-right">{moneyDetail.format(row.revenue)}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(row.status)}>
                          {statusLabel(row.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No recent booked or completed events
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
