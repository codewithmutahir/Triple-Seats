"use client";

import { differenceInCalendarDays, format } from "date-fns";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermissions } from "@/hooks/use-permissions";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { TeamRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type TeamMemberRow = {
  id: string;
  email: string;
  role: TeamRole;
  inviteStatus: string;
  joinedAt: string | null;
  createdAt: string;
  isOwner?: boolean;
};

const ROLE_BADGE: Record<TeamRole, string> = {
  owner: "bg-[#1B2A4A] text-white",
  admin: "bg-purple-100 text-purple-900",
  manager: "bg-blue-100 text-blue-900",
  sales: "bg-emerald-100 text-emerald-900",
  ops: "bg-orange-100 text-orange-900",
  viewer: "bg-muted text-muted-foreground"
};

const INVITE_ROLES: { value: TeamRole; label: string; description: string }[] = [
  { value: "admin", label: "Admin", description: "Full access except billing" },
  { value: "manager", label: "Manager", description: "Leads, events, quotes, bookings" },
  { value: "sales", label: "Sales", description: "Leads and quotes only" },
  { value: "ops", label: "Ops", description: "Events and tasks only" },
  { value: "viewer", label: "Viewer", description: "Read-only access" }
];

function initials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

export function TeamSection() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canManage = can("team:write");

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.team.list(),
    queryFn: api.team.list,
    staleTime: 60_000
  });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("manager");

  const inviteMutation = useMutation({
    mutationFn: () => api.team.invite(inviteEmail.trim(), inviteRole),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: queryKeys.team.list() });
      const prev = qc.getQueryData<{ members: TeamMemberRow[] }>(queryKeys.team.list());
      if (prev) {
        qc.setQueryData(queryKeys.team.list(), {
          members: [
            ...prev.members,
            {
              id: `temp_${Date.now()}`,
              email: inviteEmail.trim(),
              role: inviteRole,
              inviteStatus: "pending",
              joinedAt: null,
              createdAt: new Date().toISOString()
            }
          ]
        });
      }
      return { prev };
    },
    onSuccess: () => {
      toast.success(`Invitation sent to ${inviteEmail.trim()}`);
      setInviteOpen(false);
      setInviteEmail("");
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.team.list(), ctx.prev);
      toast.error("Failed to send invitation");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.team.list() });
    }
  });

  const roleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: TeamRole }) =>
      api.team.updateRole(memberId, role),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.team.list() });
      toast.success("Role updated");
    },
    onError: () => toast.error("Failed to update role")
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => api.team.remove(memberId),
    onMutate: async (memberId) => {
      await qc.cancelQueries({ queryKey: queryKeys.team.list() });
      const prev = qc.getQueryData<{ members: TeamMemberRow[] }>(queryKeys.team.list());
      if (prev) {
        qc.setQueryData(queryKeys.team.list(), {
          members: prev.members.filter((m) => m.id !== memberId)
        });
      }
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.team.list(), ctx.prev);
      toast.error("Failed to remove member");
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.team.list() })
  });

  const members = data?.members ?? [];
  const activeMembers = members.filter((m) => m.inviteStatus === "accepted" || m.isOwner);
  const pendingInvites = members.filter((m) => m.inviteStatus === "pending" && !m.isOwner);

  if (isLoading && !data) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Team Members</h3>
          <p className="text-sm text-muted-foreground">Manage who has access to your workspace</p>
        </div>
        {canManage ? (
          <Button type="button" onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Invite Member
          </Button>
        ) : null}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Joined</TableHead>
            {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {activeMembers.map((member) => (
            <TableRow key={member.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar>{initials(member.email)}</Avatar>
                  <span className="font-medium">{member.email}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge className={cn("capitalize", ROLE_BADGE[member.role as TeamRole])}>{member.role}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {member.joinedAt ? format(new Date(member.joinedAt), "MMM d, yyyy") : "—"}
              </TableCell>
              {canManage ? (
                <TableCell className="text-right">
                  {!member.isOwner ? (
                    <div className="flex items-center justify-end gap-2">
                      <Select
                        value={member.role}
                        onValueChange={(v) =>
                          roleMutation.mutate({ memberId: member.id, role: v as TeamRole })
                        }
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INVITE_ROLES.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => {
                          if (window.confirm(`Remove ${member.email} from the team?`)) {
                            removeMutation.mutate(member.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {pendingInvites.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground">Pending invitations</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Invited</TableHead>
                {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingInvites.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {member.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {differenceInCalendarDays(new Date(), new Date(member.createdAt))} days ago
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => {
                          if (!member.id.startsWith("temp_")) removeMutation.mutate(member.id);
                        }}
                      >
                        Cancel
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite team member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              {INVITE_ROLES.map((r) => (
                <label
                  key={r.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3",
                    inviteRole === r.value && "border-primary bg-primary/5"
                  )}
                >
                  <input
                    type="radio"
                    name="invite-role"
                    checked={inviteRole === r.value}
                    onChange={() => setInviteRole(r.value)}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-medium">{r.label}</p>
                    <p className="text-sm text-muted-foreground">{r.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!inviteEmail.trim() || inviteMutation.isPending}
              onClick={() => inviteMutation.mutate()}
            >
              Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
