"use client";

import { endOfMonth, startOfMonth } from "date-fns";
import { CalendarClock, Plus, Shield } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";

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
  useVendorCalendarDirectory,
  useVendorCalendarEntries,
  useVendorCalendarGrants,
  useVendorCalendarMutations
} from "@/hooks/use-vendor-calendar";
import { usePermissions } from "@/hooks/use-permissions";
import { useSession } from "@/lib/auth-client";
import { SHOW_AS_OPTIONS, type VendorCalendarEntry } from "@/lib/vendor-calendar-types";

import { EntryFormDialog } from "./entry-form-dialog";
import { ShareGrantsPanel } from "./share-grants-panel";
import type { VendorCalendarDatesChange } from "./vendor-calendar-widget";

const VendorCalendarWidget = dynamic(
  () => import("./vendor-calendar-widget").then((m) => m.VendorCalendarWidget),
  { ssr: false }
);

export default function VendorCalendarClient() {
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

  const { create, update, remove } = useVendorCalendarMutations(
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
      update.mutate({
        id: entryId,
        body: {
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          allDay
        }
      });
    },
    [canEdit, update]
  );

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
              { id: editing.id, body },
              { onSuccess: () => setDialogOpen(false) }
            );
          } else {
            create.mutate(body, { onSuccess: () => setDialogOpen(false) });
          }
        }}
        onDelete={
          editing?.id
            ? () => {
                remove.mutate(editing.id, { onSuccess: () => setDialogOpen(false) });
              }
            : undefined
        }
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
