"use client";

import { formatInTimeZone } from "date-fns-tz";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { CalendarCheck, DollarSign, Download, TrendingUp, Users } from "lucide-react";
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

const NAVY = "#1B2A4A";
const STATUS_COLORS = {
  lead: "#f59e0b",
  discussion: "#38bdf8",
  booked: "#10b981",
  completed: "#94a3b8"
};
const TYPE_COLORS = ["#1B2A4A", "#3d5a80", "#6b8cae", "#c4d4e0"];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
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
    return formatInTimeZone(iso, "UTC", "MMM d, yyyy");
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
    fetch("/api/reports/events-timeline", { credentials: "include" })
  ]);

  if (!summaryRes.ok) {
    const body = (await summaryRes.json().catch(() => null)) as { error?: string } | null;
    return { error: body?.error ?? summaryRes.statusText };
  }
  if (!timelineRes.ok) {
    const body = (await timelineRes.json().catch(() => null)) as { error?: string } | null;
    return { error: body?.error ?? timelineRes.statusText };
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
      if (requestId !== requestIdRef.current) return;
      setLoading(false);
      setRefreshing(false);
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
      ...Object.entries(summary.events.byStatus).map(([k, v]) => [k, v])
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

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg text-[#1B2A4A]">
            Revenue Last 6 Months
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : (
            <div className="overflow-x-auto -mx-2 px-2">
              <div className="min-w-[480px] h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) => `$${(v as number) / 1000}k`}
                    />
                    <Tooltip
                      formatter={(v) => money.format(v as number)}
                      labelFormatter={(_, payload) => {
                        const row = payload?.[0]?.payload as { fullMonth?: string } | undefined;
                        return row?.fullMonth ?? "";
                      }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0].payload as { fullMonth: string; revenue: number };
                        return (
                          <div className="rounded-md border bg-white px-3 py-2 text-sm shadow-sm">
                            {money.format(row.revenue)} in {row.fullMonth}
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="revenue" fill={NAVY} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg text-[#1B2A4A]">
            Event Pipeline (Last 6 Months)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : (
            <div className="overflow-x-auto -mx-2 px-2">
              <div className="min-w-[480px] h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="lead" stackId="a" fill={STATUS_COLORS.lead} name="Lead" />
                    <Bar
                      dataKey="discussion"
                      stackId="a"
                      fill={STATUS_COLORS.discussion}
                      name="Discussion"
                    />
                    <Bar dataKey="booked" stackId="a" fill={STATUS_COLORS.booked} name="Booked" />
                    <Bar
                      dataKey="completed"
                      stackId="a"
                      fill={STATUS_COLORS.completed}
                      name="Completed"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg text-[#1B2A4A]">By Event Type</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="mx-auto h-[240px] w-[240px] rounded-full" />
            ) : (
              <div className="relative mx-auto h-[240px] w-full max-w-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={typeChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {typeChartData.map((_, i) => (
                        <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="font-heading text-2xl font-semibold text-[#1B2A4A]">
                      {totalEventsByType}
                    </p>
                    <p className="text-xs text-muted-foreground">events</p>
                  </div>
                </div>
              </div>
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
          <CardTitle className="font-heading text-lg text-[#1B2A4A]">Recent Activity</CardTitle>
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
                      <TableCell className="text-right">{money.format(row.revenue)}</TableCell>
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
