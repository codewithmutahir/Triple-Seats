"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  RECURRENCE_FREQ_OPTIONS,
  REMINDER_OPTIONS,
  SHOW_AS_OPTIONS,
  WEEKDAY_OPTIONS,
  type CalendarShowAs,
  type VendorCalendarEntry,
  type VendorCalendarEntryInput,
  type VendorRecurrenceFreq,
  type WeekdayCode
} from "@/lib/vendor-calendar-types";
import { SaveIndicator } from "@/components/save-indicator";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Local `datetime-local` value from Date */
export function toLocalDateTimeValue(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toLocalDateValue(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromLocalDateTimeValue(v: string) {
  return new Date(v).toISOString();
}

/** All-day: store start midnight local, end next-midnight exclusive (FullCalendar convention). */
function allDayRangeToIso(startDate: string, endDateInclusive: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const endInclusive = new Date(`${endDateInclusive}T00:00:00`);
  const end = new Date(endInclusive);
  end.setDate(end.getDate() + 1);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

function inclusiveEndDateFromExclusive(endIso: string) {
  const end = new Date(endIso);
  end.setDate(end.getDate() - 1);
  return toLocalDateValue(end);
}

type EntryFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Partial<VendorCalendarEntry> | null;
  slotDefaults: { start: Date; end: Date; allDay: boolean } | null;
  canEdit: boolean;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  onSave: (body: VendorCalendarEntryInput) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onCopyToMyCalendar?: () => void;
  duplicatePending?: boolean;
  copyPending?: boolean;
};

export function EntryFormDialog({
  open,
  onOpenChange,
  initial,
  slotDefaults,
  canEdit,
  isPending,
  isSuccess,
  isError,
  onSave,
  onDelete,
  onDuplicate,
  onCopyToMyCalendar,
  duplicatePending,
  copyPending
}: EntryFormDialogProps) {
  const isEdit = Boolean(initial?.id && !initial.id.startsWith("temp_"));

  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [showAs, setShowAs] = useState<CalendarShowAs>("busy");
  const [isPrivate, setIsPrivate] = useState(false);
  const [recurrenceFreq, setRecurrenceFreq] = useState<VendorRecurrenceFreq>("none");
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceDays, setRecurrenceDays] = useState<WeekdayCode[]>([]);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [recurrenceCount, setRecurrenceCount] = useState("");
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState<number | null>(null);
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setTitle(initial.title ?? "");
      setLocation(initial.location ?? "");
      setNotes(initial.notes ?? "");
      setAllDay(initial.allDay ?? false);
      setShowAs(initial.showAs ?? "busy");
      setIsPrivate(initial.isPrivate ?? false);
      setRecurrenceFreq(initial.recurrenceFreq ?? "none");
      setRecurrenceInterval(initial.recurrenceInterval ?? 1);
      setRecurrenceDays(
        (initial.recurrenceDaysOfWeek ?? "")
          .split(",")
          .map((d) => d.trim().toUpperCase())
          .filter((d): d is WeekdayCode =>
            ["MO", "TU", "WE", "TH", "FR", "SA", "SU"].includes(d)
          )
      );
      setRecurrenceEndDate(
        initial.recurrenceEndAt ? toLocalDateValue(new Date(initial.recurrenceEndAt)) : ""
      );
      setRecurrenceCount(initial.recurrenceCount ? String(initial.recurrenceCount) : "");
      setReminderMinutesBefore(initial.reminderMinutesBefore ?? null);
      const start = new Date(initial.startAt!);
      const end = new Date(initial.endAt!);
      if (initial.allDay) {
        setStartDate(toLocalDateValue(start));
        setEndDate(inclusiveEndDateFromExclusive(initial.endAt!));
        setStartLocal(toLocalDateTimeValue(start));
        setEndLocal(toLocalDateTimeValue(end));
      } else {
        setStartLocal(toLocalDateTimeValue(start));
        setEndLocal(toLocalDateTimeValue(end));
        setStartDate(toLocalDateValue(start));
        setEndDate(toLocalDateValue(end));
      }
      return;
    }
    if (slotDefaults) {
      setTitle("");
      setLocation("");
      setNotes("");
      setAllDay(slotDefaults.allDay);
      setShowAs("busy");
      setIsPrivate(false);
      setRecurrenceFreq("none");
      setRecurrenceInterval(1);
      setRecurrenceDays([]);
      setRecurrenceEndDate("");
      setRecurrenceCount("");
      setReminderMinutesBefore(null);
      setStartLocal(toLocalDateTimeValue(slotDefaults.start));
      setEndLocal(toLocalDateTimeValue(slotDefaults.end));
      setStartDate(toLocalDateValue(slotDefaults.start));
      // FullCalendar all-day select end is exclusive
      if (slotDefaults.allDay) {
        const inclusive = new Date(slotDefaults.end);
        inclusive.setDate(inclusive.getDate() - 1);
        setEndDate(toLocalDateValue(inclusive < slotDefaults.start ? slotDefaults.start : inclusive));
      } else {
        setEndDate(toLocalDateValue(slotDefaults.end));
      }
    }
  }, [open, initial, slotDefaults]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !title.trim()) return;

    let startAt: string;
    let endAt: string;
    if (allDay) {
      const range = allDayRangeToIso(startDate, endDate || startDate);
      startAt = range.startAt;
      endAt = range.endAt;
    } else {
      startAt = fromLocalDateTimeValue(startLocal);
      endAt = fromLocalDateTimeValue(endLocal);
    }

    onSave({
      title: title.trim(),
      location: location.trim() || null,
      notes: notes.trim() || null,
      startAt,
      endAt,
      allDay,
      showAs,
      isPrivate,
      recurrenceFreq,
      recurrenceInterval,
      recurrenceDaysOfWeek:
        recurrenceFreq === "weekly" && recurrenceDays.length > 0
          ? recurrenceDays.join(",")
          : null,
      recurrenceEndAt: recurrenceEndDate
        ? new Date(`${recurrenceEndDate}T23:59:59`).toISOString()
        : null,
      recurrenceCount: recurrenceCount ? Number(recurrenceCount) : null,
      reminderMinutesBefore
    });
  }

  function toggleWeekday(code: WeekdayCode) {
    setRecurrenceDays((prev) =>
      prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-[#1B2A4A]">
            {isEdit ? "Edit availability" : "New availability"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vc-title">Title</Label>
            <Input
              id="vc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Booked, Available, Prep day"
              disabled={!canEdit}
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="vc-allday"
              checked={allDay}
              onCheckedChange={(v) => setAllDay(v === true)}
              disabled={!canEdit}
            />
            <Label htmlFor="vc-allday" className="font-normal">
              All day
            </Label>
          </div>

          {allDay ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vc-start-date">Start date</Label>
                <Input
                  id="vc-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={!canEdit}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vc-end-date">End date</Label>
                <Input
                  id="vc-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={!canEdit}
                  required
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vc-start">Start</Label>
                <Input
                  id="vc-start"
                  type="datetime-local"
                  value={startLocal}
                  onChange={(e) => setStartLocal(e.target.value)}
                  disabled={!canEdit}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vc-end">End</Label>
                <Input
                  id="vc-end"
                  type="datetime-local"
                  value={endLocal}
                  onChange={(e) => setEndLocal(e.target.value)}
                  disabled={!canEdit}
                  required
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Show as</Label>
            <Select
              value={showAs}
              onValueChange={(v) => setShowAs(v as CalendarShowAs)}
              disabled={!canEdit}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHOW_AS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: opt.color }}
                        aria-hidden
                      />
                      {opt.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vc-location">Location</Label>
            <Input
              id="vc-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Optional"
              disabled={!canEdit}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vc-notes">Notes</Label>
            <Textarea
              id="vc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Details, prep notes, reminders…"
              rows={4}
              disabled={!canEdit}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="vc-private"
              checked={isPrivate}
              onCheckedChange={(v) => setIsPrivate(v === true)}
              disabled={!canEdit}
            />
            <Label htmlFor="vc-private" className="font-normal">
              Private notes (hidden from shared viewers)
            </Label>
          </div>

          <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/80 p-3">
            <Label>Repeat</Label>
            <Select
              value={recurrenceFreq}
              onValueChange={(v) => setRecurrenceFreq(v as VendorRecurrenceFreq)}
              disabled={!canEdit}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECURRENCE_FREQ_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {recurrenceFreq !== "none" ? (
              <div className="space-y-3 pt-1">
                <div className="space-y-2">
                  <Label htmlFor="vc-interval">Every</Label>
                  <Input
                    id="vc-interval"
                    type="number"
                    min={1}
                    max={365}
                    value={recurrenceInterval}
                    onChange={(e) => setRecurrenceInterval(Math.max(1, Number(e.target.value) || 1))}
                    disabled={!canEdit}
                  />
                </div>

                {recurrenceFreq === "weekly" ? (
                  <div className="space-y-2">
                    <Label>On days</Label>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAY_OPTIONS.map((day) => (
                        <Button
                          key={day.value}
                          type="button"
                          size="sm"
                          variant={recurrenceDays.includes(day.value) ? "default" : "outline"}
                          className={
                            recurrenceDays.includes(day.value)
                              ? "bg-[#1B2A4A] hover:bg-[#152238]"
                              : undefined
                          }
                          onClick={() => toggleWeekday(day.value)}
                          disabled={!canEdit}
                        >
                          {day.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="vc-recur-end">Repeat until (optional)</Label>
                    <Input
                      id="vc-recur-end"
                      type="date"
                      value={recurrenceEndDate}
                      onChange={(e) => setRecurrenceEndDate(e.target.value)}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vc-recur-count">Or # of times (optional)</Label>
                    <Input
                      id="vc-recur-count"
                      type="number"
                      min={1}
                      max={500}
                      value={recurrenceCount}
                      onChange={(e) => setRecurrenceCount(e.target.value)}
                      disabled={!canEdit}
                      placeholder="e.g. 10"
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Reminder</Label>
            <Select
              value={reminderMinutesBefore == null ? "none" : String(reminderMinutesBefore)}
              onValueChange={(v) =>
                setReminderMinutesBefore(v === "none" ? null : Number(v))
              }
              disabled={!canEdit}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REMINDER_OPTIONS.map((opt) => (
                  <SelectItem key={String(opt.value)} value={String(opt.value ?? "none")}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Reminder time is saved; email notifications coming soon.
            </p>
          </div>

          {initial?.isRecurrenceInstance ? (
            <p className="text-xs text-amber-700">
              This is a recurring instance. Saving updates the whole series.
            </p>
          ) : null}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {isEdit && canEdit && onDelete ? (
                <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
                  <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
                  Delete
                </Button>
              ) : null}
              {isEdit && onDuplicate ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onDuplicate}
                  disabled={duplicatePending}
                >
                  Duplicate
                </Button>
              ) : null}
              {isEdit && onCopyToMyCalendar ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onCopyToMyCalendar}
                  disabled={copyPending}
                >
                  Copy to my calendar
                </Button>
              ) : null}
              <SaveIndicator isPending={isPending} isSuccess={isSuccess} isError={isError} />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              {canEdit ? (
                <Button type="submit" className="bg-[#1B2A4A] hover:bg-[#152238]">
                  {isEdit ? "Save" : "Create"}
                </Button>
              ) : null}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
