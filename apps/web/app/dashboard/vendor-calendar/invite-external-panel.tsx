"use client";

import { Mail, UserPlus } from "lucide-react";
import { useState } from "react";

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
  onInvite: (body: { email: string; name?: string }) => void;
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

  const pendingInvites = invites.length > 0 ? invites : directory?.pendingExternalInvites ?? [];

  function handleInvite() {
    if (!email.trim()) return;
    onInvite({
      email: email.trim(),
      name: name.trim() || undefined
    });
    setEmail("");
    setName("");
  }

  function formatExpiry(iso: string) {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-[#1B2A4A]">Invite external vendor</DialogTitle>
          <DialogDescription>
            Send an email invitation for vendor calendar access only. They are not added to any
            caterer business — just their own calendar. Invitations expire after 7 days (configurable
            on the server). Use Share access if they should view someone else&apos;s calendar after
            they join.
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
          <Button
            type="button"
            className="bg-[#1B2A4A] hover:bg-[#152238]"
            disabled={!email.trim() || isInviting}
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
                    <p className="text-xs text-muted-foreground">
                      External vendor · expires {formatExpiry(inv.expiresAt)}
                    </p>
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
