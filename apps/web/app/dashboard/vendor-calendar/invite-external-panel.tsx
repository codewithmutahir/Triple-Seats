"use client";

import { Mail, UserPlus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type {
  VendorCalendarDirectory,
  VendorCalendarExternalInvite
} from "@/lib/vendor-calendar-types";

type InviteExternalPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  directory: VendorCalendarDirectory | undefined;
  invites: VendorCalendarExternalInvite[];
  isLoading: boolean;
  isInviting: boolean;
  isRevoking: boolean;
  onInvite: (body: { email: string; name?: string; catererId: string }) => void;
  onRevoke: (id: string) => void;
};

export function InviteExternalPanel({
  open,
  onOpenChange,
  directory,
  invites,
  isLoading,
  isInviting,
  isRevoking,
  onInvite,
  onRevoke
}: InviteExternalPanelProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [catererId, setCatererId] = useState("");

  const caterers = useMemo(
    () => directory?.caterers ?? [],
    [directory?.caterers]
  );

  const pendingInvites = invites.length > 0 ? invites : directory?.pendingExternalInvites ?? [];

  function handleInvite() {
    if (!email.trim() || !catererId) return;
    onInvite({
      email: email.trim(),
      name: name.trim() || undefined,
      catererId
    });
    setEmail("");
    setName("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-[#1B2A4A]">Invite external vendor</DialogTitle>
          <DialogDescription>
            Send an email invitation for vendor calendar access only. They won&apos;t see leads,
            bookings, settings, or other dashboard pages. Use Share access to let them view other
            calendars after they join.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 border-b border-slate-100 pb-4">
          <div className="space-y-2">
            <Label htmlFor="ext-invite-email">Email</Label>
            <Input
              id="ext-invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vendor@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ext-invite-name">Name (optional)</Label>
            <Input
              id="ext-invite-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Vendor name"
            />
          </div>
          <div className="space-y-2">
            <Label>Attach to business</Label>
            <Select value={catererId} onValueChange={setCatererId}>
              <SelectTrigger>
                <SelectValue placeholder="Select caterer" />
              </SelectTrigger>
              <SelectContent>
                {caterers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            className="bg-[#1B2A4A] hover:bg-[#152238]"
            disabled={!email.trim() || !catererId || isInviting}
            onClick={handleInvite}
          >
            <Mail className="mr-1.5 h-4 w-4" aria-hidden />
            Send invitation
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Pending invitations</p>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : pendingInvites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending invitations.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {pendingInvites.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">
                      {inv.name ? `${inv.name} · ` : ""}
                      {inv.email}
                    </p>
                    <p className="text-xs text-muted-foreground">{inv.catererName}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isRevoking}
                    onClick={() => onRevoke(inv.id)}
                  >
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

export function InviteExternalButton({
  onClick,
  className
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button type="button" variant="outline" size="sm" className={className} onClick={onClick}>
      <UserPlus className="mr-1.5 h-4 w-4" aria-hidden />
      Invite vendor
    </Button>
  );
}
