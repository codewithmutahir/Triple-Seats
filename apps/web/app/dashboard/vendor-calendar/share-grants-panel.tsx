"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type {
  CalendarShareGrant,
  VendorCalendarDirectory
} from "@/lib/vendor-calendar-types";

type ShareGrantsPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  directory: VendorCalendarDirectory | undefined;
  grants: CalendarShareGrant[];
  isLoading: boolean;
  isGranting: boolean;
  onGrant: (body: { granteeUserId: string; targetUserId: string; scope: "view" | "edit" }) => void;
  onRevoke: (id: string) => void;
};

export function ShareGrantsPanel({
  open,
  onOpenChange,
  directory,
  grants,
  isLoading,
  isGranting,
  onGrant,
  onRevoke
}: ShareGrantsPanelProps) {
  const [granteeUserId, setGranteeUserId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [scope, setScope] = useState<"view" | "edit">("view");

  const users = useMemo(() => {
    const map = new Map<string, { userId: string; label: string }>();
    for (const c of directory?.caterers ?? []) {
      for (const u of c.users) {
        map.set(u.userId, {
          userId: u.userId,
          label: `${u.name ?? u.email} · ${c.name}`
        });
      }
    }
    if (directory?.self) {
      map.set(directory.self.userId, {
        userId: directory.self.userId,
        label: `${directory.self.name ?? directory.self.email} (you)`
      });
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [directory]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-[#1B2A4A]">Calendar share access</DialogTitle>
          <DialogDescription>
            Super admin only. Grant a user permission to view or edit another user&apos;s vendor
            calendar. By default nobody can see anyone else&apos;s notes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 border-b border-slate-100 pb-4">
          <div className="space-y-2">
            <Label>Who gets access</Label>
            <Select value={granteeUserId} onValueChange={setGranteeUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.userId} value={u.userId}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Whose calendar</Label>
            <Select value={targetUserId} onValueChange={setTargetUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select calendar owner" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.userId} value={u.userId}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Permission</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as "view" | "edit")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">View only</SelectItem>
                <SelectItem value="edit">View and edit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            className="bg-[#1B2A4A] hover:bg-[#152238]"
            disabled={!granteeUserId || !targetUserId || granteeUserId === targetUserId || isGranting}
            onClick={() =>
              onGrant({ granteeUserId, targetUserId, scope })
            }
          >
            Grant access
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Active grants</p>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : grants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No share grants yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {grants.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">
                      {g.grantee.name ?? g.grantee.email}
                      <span className="font-normal text-muted-foreground"> → </span>
                      {g.target.name ?? g.target.email}
                    </p>
                    <p className="text-xs text-muted-foreground">{g.scope}</p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => onRevoke(g.id)}>
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
