"use client";

import { format } from "date-fns";
import { CalendarIcon, Download, Inbox, Share2 } from "lucide-react";
import type { DateRange } from "react-day-picker";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { RefreshingBadge } from "@/components/refreshing-badge";
import { useAppStore, type LeadsListResponse } from "@/lib/stores/app-store";
import { loadWithCache } from "@/lib/stores/cache-helpers";

type ListResponse = LeadsListResponse;

function statusVariant(
  status: string
): "lead" | "booked" | "completed" | "discussion" | "outline" {
  if (status === "lead") return "lead";
  if (status === "booked") return "booked";
  if (status === "completed") return "completed";
  if (status === "discussion") return "discussion";
  return "outline";
}

function formatDisplayDate(iso: string) {
  try {
    return format(new Date(iso), "MMM d, yyyy");
  } catch {
    return iso;
  }
}

function csvEscape(value: string | number | null | undefined) {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function fetchLeads(params: URLSearchParams): Promise<ListResponse | { error: string; status: number }> {
  const res = await fetch(`/api/leads?${params.toString()}`, { credentials: "include" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { error: body?.error ?? res.statusText, status: res.status };
  }
  return (await res.json()) as ListResponse;
}

export default function LeadsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [dateOpen, setDateOpen] = useState(false);

  const dateFrom = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined;
  const dateTo = dateRange?.to
    ? format(dateRange.to, "yyyy-MM-dd")
    : dateRange?.from
      ? format(dateRange.from, "yyyy-MM-dd")
      : undefined;

  const cacheKey = JSON.stringify({ page, status, search: searchDebounced, dateFrom, dateTo });

  const [data, setData] = useState<ListResponse | null>(() =>
    useAppStore.getState().peekLeadsCache(cacheKey)
  );
  const [loading, setLoading] = useState(
    () => useAppStore.getState().peekLeadsCache(cacheKey) == null
  );
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intakeWarning, setIntakeWarning] = useState<string | null>(
    () => useAppStore.getState().peekLeadsCache(cacheKey)?.intakeMismatchWarning ?? null
  );

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("status", status);
    if (searchDebounced) p.set("search", searchDebounced);
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    return p;
  }, [page, status, searchDebounced, dateFrom, dateTo]);

  const load = useCallback(async () => {
    const store = useAppStore.getState();
    const key = cacheKey;
    setError(null);

    await loadWithCache({
      peek: () => store.peekLeadsCache(key),
      getFresh: () => store.getLeadsCache(key),
      set: (result) => store.setLeadsCache(key, result),
      fetch: async () => {
        const result = await fetchLeads(queryParams);
        if ("error" in result) throw new Error(result.error);
        return result;
      },
      onData: (result) => {
        setData(result);
        setIntakeWarning(result.intakeMismatchWarning ?? null);
      },
      setLoading,
      setRefreshing
    }).catch((e) => {
      setError(e instanceof Error ? e.message : "Request failed.");
      setData(null);
    });
  }, [cacheKey, queryParams]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [status, searchDebounced, dateRange]);

  const dateLabel = useMemo(() => {
    if (!dateRange?.from) return "Event dates";
    if (!dateRange.to) return format(dateRange.from, "MMM d, yyyy");
    return `${format(dateRange.from, "MMM d")} – ${format(dateRange.to, "MMM d, yyyy")}`;
  }, [dateRange]);

  function exportCsv() {
    if (!data?.items.length) return;
    const headers = [
      "Guest Name",
      "Email",
      "Phone",
      "Event Type",
      "Event Date",
      "Location",
      "Guests",
      "Status",
      "Event Id"
    ];
    const rows = data.items.map((r) =>
      [
        r.guestName,
        r.guestEmail ?? "",
        r.contactNumber ?? "",
        r.eventType,
        r.eventDate,
        r.location,
        r.guestCount ?? "",
        r.status,
        r.id
      ]
        .map(csvEscape)
        .join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-page-${data.page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyLeadFormLink() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/` : "";
    try {
      await navigator.clipboard.writeText(url);
      alert("Lead form link copied to clipboard.");
    } catch {
      alert(`Copy this link: ${url}`);
    }
  }

  const empty = !loading && data && data.total === 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-[#1B2A4A]">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">All incoming catering inquiries</p>
        </div>
        {refreshing ? <RefreshingBadge /> : null}
      </header>

      <Card>
        <CardContent className="space-y-4 p-4 md:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
            <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-3xl lg:flex-1 lg:grid-cols-4">
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Search</label>
                <Input
                  placeholder="Guest name or email"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="bg-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="discussion">Discussion</SelectItem>
                    <SelectItem value="booked">Booked</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Event date range</label>
                <Popover open={dateOpen} onOpenChange={setDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start bg-white text-left font-normal",
                        !dateRange?.from && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateLabel}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={1} />
                    <div className="flex justify-end gap-2 border-t p-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDateRange(undefined);
                          setDateOpen(false);
                        }}
                      >
                        Clear
                      </Button>
                      <Button type="button" size="sm" onClick={() => setDateOpen(false)}>
                        Apply
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
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
            <Inbox className="h-12 w-12 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-heading text-xl font-semibold text-[#1B2A4A]">No leads yet</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                When clients submit your public form, inquiries will appear here.
              </p>
              {intakeWarning ? (
                <p className="mt-3 max-w-md text-sm text-amber-800">{intakeWarning}</p>
              ) : null}
            </div>
            <Button type="button" onClick={copyLeadFormLink}>
              <Share2 className="mr-2 h-4 w-4" />
              Share your lead form link
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 md:p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guest</TableHead>
                    <TableHead className="hidden md:table-cell">Contact</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                    <TableHead className="hidden lg:table-cell">Location</TableHead>
                    <TableHead className="text-right">Guests</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && !(data?.items.length)
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 8 }).map((__, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-8 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    : (data?.items ?? []).map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <div className="font-medium">{row.guestName}</div>
                            {row.guestEmail ? (
                              <div className="text-xs text-muted-foreground">{row.guestEmail}</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="hidden md:table-cell whitespace-nowrap text-sm">
                            {row.contactNumber ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="max-w-[140px] truncate font-normal">
                              {row.eventType}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell whitespace-nowrap text-sm">
                            {formatDisplayDate(row.eventDate)}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell max-w-[180px] truncate text-sm">
                            {row.location}
                          </TableCell>
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
