"use client";

import { format } from "date-fns";
import { CalendarIcon, Code2, Copy, Download, Inbox, Share2 } from "lucide-react";
import type { DateRange } from "react-day-picker";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { formatCustomerType, formatEventType } from "@/lib/event-customer-types";
import { formatEventTimeRange } from "@/lib/event-datetime";
import { RefreshingBadge } from "@/components/refreshing-badge";
import { ListPagination } from "@/components/dashboard/list-pagination";
import { filterLeadsItems, LIST_PAGE_SIZE, paginateItems } from "@/lib/client-list-filter";
import { useCatererProfileQuery } from "@/hooks/use-dashboard-query";
import { useLeadsQuery } from "@/hooks/use-list-queries";
import { usePrefetchOnHover } from "@/hooks/use-prefetch";
import type { LeadsListResponse } from "@/lib/stores/app-store";
import { tenantUrls } from "@/lib/tenant-host";
import type { CatererProfile } from "@/lib/caterer-profile";
import { browserTimer } from "@/lib/perf";

type LeadRow = LeadsListResponse["items"][number];

function statusVariant(
  status: string
): "lead" | "booked" | "completed" | "discussion" | "lost" | "outline" {
  if (status === "lead") return "lead";
  if (status === "booked") return "booked";
  if (status === "completed") return "completed";
  if (status === "discussion") return "discussion";
  if (status === "lost") return "lost";
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

function resolveBookUrl(profile: CatererProfile | null): string | null {
  if (!profile?.slug) return profile?.bookUrl ?? null;
  return tenantUrls(profile.slug).bookUrl ?? profile.bookUrl;
}

function resolveEmbedUrl(profile: CatererProfile | null): string | null {
  if (!profile?.slug) return null;
  const urls = tenantUrls(profile.slug);
  // Embed URL uses the base origin + /embed/[slug]
  if (urls.bookUrl) {
    const url = new URL(urls.bookUrl);
    return `${url.origin}/embed/${profile.slug}`;
  }
  return null;
}

function generateIframeCode(embedUrl: string, height = 700): string {
  return `<iframe
  src="${embedUrl}"
  width="100%"
  height="${height}"
  frameborder="0"
  style="border: none; max-width: 600px;"
  title="Request a Quote"
></iframe>`;
}

function generateScriptCode(embedUrl: string): string {
  return `<div id="tripeseats-form"></div>
<script>
(function() {
  var container = document.getElementById('tripeseats-form');
  var iframe = document.createElement('iframe');
  iframe.src = '${embedUrl}';
  iframe.width = '100%';
  iframe.height = '700';
  iframe.frameBorder = '0';
  iframe.style.border = 'none';
  iframe.style.maxWidth = '600px';
  iframe.title = 'Request a Quote';
  container.appendChild(iframe);
  
  // Listen for form submission
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'tripeseats:lead_submitted') {
      console.log('Lead submitted!');
      // Add your tracking/callback code here
    }
  });
})();
</script>`;
}

export default function LeadsPage() {
  const perfRef = useRef<ReturnType<typeof browserTimer> | null>(null);
  const perfEndedRef = useRef(false);
  if (!perfRef.current) {
    perfRef.current = browserTimer("leads");
    perfRef.current.step("mount");
  }

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

  const { data: leadsData, isLoading: loading, isFetching: refreshing, error: queryError } =
    useLeadsQuery();
  const { data: profile } = useCatererProfileQuery();
  const allLeads = leadsData?.items ?? [];
  const intakeWarning = leadsData?.intakeMismatchWarning ?? null;
  const error = queryError?.message ?? null;
  const bookUrl = useMemo(() => resolveBookUrl(profile ?? null), [profile]);
  const embedUrl = useMemo(() => resolveEmbedUrl(profile ?? null), [profile]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [iframeCopied, setIframeCopied] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [embedDialogOpen, setEmbedDialogOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filteredLeads = useMemo(
    () =>
      filterLeadsItems(allLeads, {
        status,
        search: searchDebounced,
        dateFrom,
        dateTo
      }),
    [allLeads, status, searchDebounced, dateFrom, dateTo]
  );

  const data = useMemo(
    () => paginateItems(filteredLeads, page, LIST_PAGE_SIZE),
    [filteredLeads, page]
  );

  useEffect(() => {
    if (!loading) perfRef.current?.step("fetch:done");
  }, [loading]);

  useEffect(() => {
    if (perfEndedRef.current || loading) return;
    if (data.items.length || error) {
      perfEndedRef.current = true;
      perfRef.current?.step("render:complete");
      perfRef.current?.end();
    }
  }, [data.items.length, loading, error]);

  useEffect(() => {
    setPage(1);
  }, [status, searchDebounced, dateRange]);

  const dateLabel = useMemo(() => {
    if (!dateRange?.from) return "Event dates";
    if (!dateRange.to) return format(dateRange.from, "MMM d, yyyy");
    return `${format(dateRange.from, "MMM d")} – ${format(dateRange.to, "MMM d, yyyy")}`;
  }, [dateRange]);

  function exportCsv() {
    if (!data.items.length) return;
    const headers = [
      "Guest Name",
      "Email",
      "Phone",
      "Event",
      "Customer Type",
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
        r.eventTypeLabel ?? formatEventType(r.eventType),
        formatCustomerType(r.customerType),
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
    if (!bookUrl) return;
    try {
      await navigator.clipboard.writeText(bookUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setLinkCopied(false);
    }
  }

  async function copyIframeCode() {
    if (!embedUrl) return;
    try {
      await navigator.clipboard.writeText(generateIframeCode(embedUrl));
      setIframeCopied(true);
      setTimeout(() => setIframeCopied(false), 2000);
    } catch {
      setIframeCopied(false);
    }
  }

  async function copyScriptCode() {
    if (!embedUrl) return;
    try {
      await navigator.clipboard.writeText(generateScriptCode(embedUrl));
      setScriptCopied(true);
      setTimeout(() => setScriptCopied(false), 2000);
    } catch {
      setScriptCopied(false);
    }
  }

  const empty = !loading && data.total === 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-[#1B2A4A]">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All incoming catering inquiries
            {data && !loading ? (
              <span className="text-foreground/80"> · {data.total} total</span>
            ) : null}
          </p>
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
                    <SelectItem value="lost">Lost</SelectItem>
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
            <div className="flex gap-2">
              <Dialog open={embedDialogOpen} onOpenChange={setEmbedDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 bg-white"
                    disabled={!embedUrl}
                  >
                    <Code2 className="mr-2 h-4 w-4" />
                    Embed Form
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Embed Lead Form</DialogTitle>
                    <DialogDescription>
                      Add your lead intake form to any website. Copy the code below and paste it into your site.
                    </DialogDescription>
                  </DialogHeader>
                  <Tabs defaultValue="iframe" className="mt-4">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="iframe">Simple (iframe)</TabsTrigger>
                      <TabsTrigger value="script">Advanced (Script)</TabsTrigger>
                    </TabsList>
                    <TabsContent value="iframe" className="space-y-4">
                      <div className="rounded-lg bg-slate-950 p-4">
                        <pre className="overflow-x-auto text-sm text-slate-300">
                          <code>{embedUrl ? generateIframeCode(embedUrl) : ""}</code>
                        </pre>
                      </div>
                      <Button
                        type="button"
                        onClick={() => void copyIframeCode()}
                        className="w-full"
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        {iframeCopied ? "Copied!" : "Copy iframe code"}
                      </Button>
                      <p className="text-sm text-muted-foreground">
                        Paste this code into your website&apos;s HTML where you want the form to appear.
                      </p>
                    </TabsContent>
                    <TabsContent value="script" className="space-y-4">
                      <div className="rounded-lg bg-slate-950 p-4">
                        <pre className="overflow-x-auto text-sm text-slate-300">
                          <code>{embedUrl ? generateScriptCode(embedUrl) : ""}</code>
                        </pre>
                      </div>
                      <Button
                        type="button"
                        onClick={() => void copyScriptCode()}
                        className="w-full"
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        {scriptCopied ? "Copied!" : "Copy script code"}
                      </Button>
                      <p className="text-sm text-muted-foreground">
                        This version includes a callback listener for tracking form submissions.
                      </p>
                    </TabsContent>
                  </Tabs>
                  {embedUrl ? (
                    <div className="mt-4 rounded-lg border bg-slate-50 p-3">
                      <p className="text-xs font-medium text-muted-foreground">Preview URL</p>
                      <a
                        href={embedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline break-all"
                      >
                        {embedUrl}
                      </a>
                    </div>
                  ) : null}
                </DialogContent>
              </Dialog>
              <Button
                type="button"
                variant="outline"
                className="shrink-0 bg-white"
                onClick={exportCsv}
                disabled={!data.items.length}
              >
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>
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
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" onClick={() => void copyLeadFormLink()} disabled={!bookUrl}>
                <Share2 className="mr-2 h-4 w-4" />
                {linkCopied ? "Copied!" : "Share your lead form link"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEmbedDialogOpen(true)}
                disabled={!embedUrl}
              >
                <Code2 className="mr-2 h-4 w-4" />
                Get embed code
              </Button>
            </div>
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
                    <TableHead>Type</TableHead>
                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                    <TableHead className="hidden md:table-cell">Time</TableHead>
                    <TableHead className="hidden lg:table-cell">Location</TableHead>
                    <TableHead className="text-right">Guests</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && allLeads.length === 0
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 10 }).map((__, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-8 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    : data.items.map((row) => (
                        <LeadTableRow key={row.id} row={row} />
                      ))}
                </TableBody>
              </Table>
            </div>

            <ListPagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              pageSize={data.pageSize}
              itemLabel="lead"
              loading={loading && allLeads.length === 0}
              onPageChange={setPage}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LeadTableRow({ row }: { row: LeadRow }) {
  const onHover = usePrefetchOnHover(row.id);

  return (
    <TableRow onMouseEnter={onHover}>
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
      <TableCell className="hidden sm:table-cell whitespace-nowrap text-sm">
        {formatDisplayDate(row.eventDate)}
      </TableCell>
      <TableCell className="hidden md:table-cell whitespace-nowrap text-sm text-muted-foreground">
        {formatEventTimeRange(row.startTime, row.endTime)}
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
        <Button variant="outline" size="sm" asChild onMouseEnter={onHover}>
          <Link href={`/dashboard/events?eventId=${encodeURIComponent(row.id)}`}>View</Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}
