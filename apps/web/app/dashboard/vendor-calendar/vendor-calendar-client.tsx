"use client";

import { endOfMonth, startOfMonth } from "date-fns";
import { CalendarClock, Download, Link2, Plus, RefreshCw, Shield } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGoogleCalendarSync,
  useVendorCalendarDirectory,
  useVendorCalendarEntries,
  useVendorCalendarGrants,
  useVendorCalendarMutations
} from "@/hooks/use-vendor-calendar";
import { usePermissions } from "@/hooks/use-permissions";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { SHOW_AS_OPTIONS, type VendorCalendarEntry } from "@/lib/vendor-calendar-types";

import { EntryFormDialog } from "./entry-form-dialog";
import { ShareGrantsPanel } from "./share-grants-panel";
import type { VendorCalendarDatesChange } from "./vendor-calendar-widget";

const VendorCalendarWidget = dynamic(
  () => import("./vendor-calendar-widget").then((m) => m.VendorCalendarWidget),
  { ssr: false }
);

export default function VendorCalendarClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { can, isSuperAdmin } = usePermissions();
  const canWrite = can("vendor_calendar:write");

  const { data: directory, isLoading: dirLoading } = useVendorCalendarDirectory();

  const selfUserId = directory?.self.userId ?? session?.user?.id ?? "";
  const [viewUserId, setViewUserId] = useState<string | null>(null);
  const ownerUserId = viewUserId ?? selfUserId;

  const [range, setRange] = useState(() => {
    const now = new Date();
    return {
      start: startOfMonth(now).toISOString(),
      end: endOfMonth(now).toISOString()
    };
  });

  const { data, isLoading, isError, refetch } = useVendorCalendarEntries({
    ownerUserId,
    start: range.start,
    end: range.end,
    enabled: Boolean(ownerUserId)
  });

  const { create, update, remove, duplicate, copyToMyCalendar } = useVendorCalendarMutations(
    ownerUserId,
    range.start,
    range.end
  );

  const grantsApi = useVendorCalendarGrants(Boolean(isSuperAdmin));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VendorCalendarEntry | null>(null);
  const [slotDefaults, setSlotDefaults] = useState<{
    start: Date;
    end: Date;
    allDay: boolean;
  } | null>(null);
  const [grantsOpen, setGrantsOpen] = useState(false);

  const isOwnCalendar = ownerUserId === selfUserId;
  const sharedScope = directory?.shared.find((s) => s.userId === ownerUserId)?.scope;
  const canEdit =
    canWrite && (isOwnCalendar || isSuperAdmin || sharedScope === "edit");

  const googleSync = useGoogleCalendarSync(Boolean(isOwnCalendar && canWrite));

  useEffect(() => {
    const google = searchParams.get("google");
    if (!google) return;
    if (google === "connected") toast.success("Google Calendar connected — entries will sync");
    else if (google === "oauth_denied") toast.error("Google Calendar connection cancelled");
    else if (google === "oauth_failed") toast.error("Google Calendar connection failed");
    else if (google === "oauth_not_configured") {
      toast.error("Google Calendar OAuth is not configured on the server");
    }
    router.replace("/dashboard/vendor-calendar");
  }, [searchParams, router]);

  const entries = data?.items ?? [];

  const calendarOptions = useMemo(() => {
    const opts: Array<{ userId: string; label: string }> = [];
    if (directory?.self) {
      opts.push({
        userId: directory.self.userId,
        label: `My calendar (${directory.self.email})`
      });
    }
    for (const s of directory?.shared ?? []) {
      opts.push({
        userId: s.userId,
        label: `${s.name ?? s.email} (${s.scope})`
      });
    }
    if (isSuperAdmin) {
      for (const c of directory?.caterers ?? []) {
        for (const u of c.users) {
          if (opts.some((o) => o.userId === u.userId)) continue;
          opts.push({
            userId: u.userId,
            label: `${c.name} · ${u.name ?? u.email}`
          });
        }
      }
    }
    return opts;
  }, [directory, isSuperAdmin]);

  const handleDatesChange = useCallback((info: VendorCalendarDatesChange) => {
    setRange({ start: info.start.toISOString(), end: info.end.toISOString() });
  }, []);

  const openCreate = useCallback((slot?: { start: Date; end: Date; allDay: boolean }) => {
    setEditing(null);
    if (slot) {
      setSlotDefaults(slot);
    } else {
      const start = new Date();
      start.setMinutes(0, 0, 0);
      const end = new Date(start);
      end.setHours(end.getHours() + 1);
      setSlotDefaults({ start, end, allDay: false });
    }
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((entry: VendorCalendarEntry) => {
    setSlotDefaults(null);
    setEditing(entry);
    setDialogOpen(true);
  }, []);

  const handleMove = useCallback(
    (entryId: string, start: Date, end: Date, allDay: boolean) => {
      if (!canEdit) return;
      const entry = entries.find((e) => e.seriesId === entryId || e.id === entryId);
      if (entry?.isRecurrenceInstance) return;
      update.mutate({
        id: entry?.seriesId ?? entryId,
        body: {
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          allDay
        }
      });
    },
    [canEdit, update, entries]
  );

  const handleExportIcal = useCallback(async () => {
    try {
      const ics = await api.vendorCalendar.exportIcal({
        start: range.start,
        end: range.end,
        ownerUserId: isOwnCalendar ? undefined : ownerUserId
      });
      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vendor-calendar.ics";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Calendar exported");
    } catch {
      toast.error("Export failed");
    }
  }, [range.start, range.end, ownerUserId, isOwnCalendar]);

  const handleSubscribeLink = useCallback(async () => {
    if (!isOwnCalendar) return;
    try {
      const data = await api.vendorCalendar.icalToken();
      await navigator.clipboard.writeText(data.webcalUrl);
      toast.success("Subscribe link copied — paste into Outlook or Google Calendar");
    } catch {
      toast.error("Could not create subscribe link");
    }
  }, [isOwnCalendar]);

  if (dirLoading && !directory) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[520px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-1 inline-flex items-center gap-2 rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            Personal availability
          </div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-[#1B2A4A]">
            Vendor Calendar
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Mark busy and free days, add notes, and manage your schedule. Separate from the booking
            calendar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isOwnCalendar ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => void handleExportIcal()}>
                <Download className="mr-1.5 h-4 w-4" aria-hidden />
                Export .ics
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => void handleSubscribeLink()}>
                <Link2 className="mr-1.5 h-4 w-4" aria-hidden />
                Subscribe link
              </Button>
            </>
          ) : null}
          {isSuperAdmin ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setGrantsOpen(true)}>
              <Shield className="mr-1.5 h-4 w-4" aria-hidden />
              Share access
            </Button>
          ) : null}
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              className="bg-[#1B2A4A] hover:bg-[#152238]"
              onClick={() => openCreate()}
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Add entry
            </Button>
          ) : null}
        </div>
      </div>

      {isOwnCalendar && canWrite ? (
        <Card className="border-slate-200 bg-gradient-to-r from-white to-slate-50">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-[#1B2A4A]">Google Calendar sync</p>
              <p className="text-xs text-muted-foreground">
                {googleSync.status.isLoading
                  ? "Checking Google connection…"
                  : !googleSync.status.data?.configured
                    ? "Google OAuth is not configured on the API server yet (add GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET on Hostinger, then restart API)."
                    : googleSync.status.data.connected
                      ? `Connected as ${googleSync.status.data.email ?? "Google account"}. New entries push automatically; use Sync now to pull changes.`
                      : "Connect to sync entries two-way with your Google Calendar (non-recurring events)."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {googleSync.status.data?.configured && googleSync.status.data.connected ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      googleSync.sync.mutate({ start: range.start, end: range.end })
                    }
                  >
                    <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
                    Sync now
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => googleSync.disconnect.mutate()}
                  >
                    Disconnect
                  </Button>
                </>
              ) : googleSync.status.data?.configured ? (
                <Button
                  type="button"
                  size="sm"
                  className="bg-[#1B2A4A] hover:bg-[#152238]"
                  onClick={googleSync.connect}
                >
                  Connect Google Calendar
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {(calendarOptions.length > 1 || isSuperAdmin) && (
        <div className="max-w-md space-y-2">
          <Label htmlFor="vc-owner">Viewing calendar</Label>
          <Select
            value={ownerUserId}
            onValueChange={(v) => setViewUserId(v === selfUserId ? null : v)}
          >
            <SelectTrigger id="vc-owner">
              <SelectValue placeholder="Select calendar" />
            </SelectTrigger>
            <SelectContent>
              {calendarOptions.map((opt) => (
                <SelectItem key={opt.userId} value={opt.userId}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        {SHOW_AS_OPTIONS.map((item) => (
          <span key={item.value} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
            {item.label}
          </span>
        ))}
      </div>

      {isError ? (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-6">
            <p className="text-sm text-muted-foreground">Failed to load calendar entries.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
          <CardContent className="relative p-3 sm:p-6">
            <div className="relative min-h-[520px]">
              {isLoading && !data ? (
                <Skeleton className="absolute inset-0 z-10 h-full w-full" />
              ) : null}
              <VendorCalendarWidget
                entries={entries}
                editable={canEdit}
                onDatesChange={handleDatesChange}
                onSelectSlot={(slot) => openCreate(slot)}
                onEventClick={openEdit}
                onEventMove={handleMove}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <EntryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        slotDefaults={slotDefaults}
        canEdit={canEdit}
        isPending={create.isPending || update.isPending || remove.isPending}
        isSuccess={create.isSuccess || update.isSuccess}
        isError={create.isError || update.isError}
        onSave={(body) => {
          if (editing?.id) {
            update.mutate(
              { id: editing.seriesId ?? editing.id, body },
              { onSuccess: () => setDialogOpen(false) }
            );
          } else {
            create.mutate(body, { onSuccess: () => setDialogOpen(false) });
          }
        }}
        onDelete={
          editing?.id
            ? () => {
                remove.mutate(editing.seriesId ?? editing.id, {
                  onSuccess: () => setDialogOpen(false)
                });
              }
            : undefined
        }
        onDuplicate={
          editing?.id && canEdit
            ? () => {
                duplicate.mutate(
                  {
                    id: editing.seriesId ?? editing.id,
                    body: { startAt: editing.startAt, endAt: editing.endAt }
                  },
                  { onSuccess: () => setDialogOpen(false) }
                );
              }
            : undefined
        }
        onCopyToMyCalendar={
          editing?.id && canWrite && !isOwnCalendar
            ? () => {
                copyToMyCalendar.mutate(
                  {
                    id: editing.seriesId ?? editing.id,
                    body: { startAt: editing.startAt, endAt: editing.endAt }
                  },
                  { onSuccess: () => setDialogOpen(false) }
                );
              }
            : undefined
        }
        duplicatePending={duplicate.isPending}
        copyPending={copyToMyCalendar.isPending}
      />

      {isSuperAdmin ? (
        <ShareGrantsPanel
          open={grantsOpen}
          onOpenChange={setGrantsOpen}
          directory={directory}
          grants={grantsApi.list.data?.items ?? []}
          isLoading={grantsApi.list.isLoading}
          onGrant={(body) => grantsApi.createGrant.mutate(body)}
          onRevoke={(id) => grantsApi.revokeGrant.mutate(id)}
          isGranting={grantsApi.createGrant.isPending}
        />
      ) : null}
    </div>
  );
}
