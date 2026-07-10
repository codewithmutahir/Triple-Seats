"use client";

import { differenceInCalendarDays, format } from "date-fns";
import { Crown, Loader2, Shield, Trash2, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { usePermissions } from "@/hooks/use-permissions";
import { api } from "@/lib/api";
import type { TeamRole } from "@/lib/permissions";
import { queryKeys } from "@/lib/query-keys";
import {
  EMPLOYEE_ROLE_OPTIONS,
  EMPLOYEE_ROLES,
  ROLE_LABELS,
  isAdminRole,
  roleLabel
} from "@/lib/role-labels";
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

type InviteMode = "admin" | "employee";

function initials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

function StaffRow({
  member,
  canManage,
  onRoleChange,
  onRemove,
  roleOptions
}: {
  member: TeamMemberRow;
  canManage: boolean;
  onRoleChange?: (role: TeamRole) => void;
  onRemove?: () => void;
  roleOptions?: TeamRole[];
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar>{initials(member.email)}</Avatar>
        <div className="min-w-0">
          <p className="truncate font-medium">{member.email}</p>
          <p className="text-xs text-muted-foreground">
            {member.joinedAt
              ? `Joined ${format(new Date(member.joinedAt), "MMM d, yyyy")}`
              : "—"}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canManage && onRoleChange && roleOptions ? (
          <Select value={member.role} onValueChange={(v) => onRoleChange(v as TeamRole)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge className={cn("capitalize", ROLE_BADGE[member.role])}>{roleLabel(member.role)}</Badge>
        )}
        {canManage && onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive"
            aria-label={`Remove ${member.email}`}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
  count,
  action
}: {
  icon: typeof Users;
  title: string;
  description: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-base font-semibold">
            {title}
            {count !== undefined ? (
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">({count})</span>
            ) : null}
          </h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
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
  const [inviteMode, setInviteMode] = useState<InviteMode>("employee");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("manager");

  function openInvite(mode: InviteMode) {
    setInviteMode(mode);
    setInviteRole(mode === "admin" ? "admin" : "manager");
    setInviteEmail("");
    setInviteOpen(true);
  }

  const inviteMutation = useMutation({
    mutationFn: () => {
      const role = inviteMode === "admin" ? "admin" : inviteRole;
      return api.team.invite(inviteEmail.trim(), role);
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: queryKeys.team.list() });
      const prev = qc.getQueryData<{ members: TeamMemberRow[] }>(queryKeys.team.list());
      const role = inviteMode === "admin" ? "admin" : inviteRole;
      if (prev) {
        qc.setQueryData(queryKeys.team.list(), {
          members: [
            ...prev.members,
            {
              id: `temp_${Date.now()}`,
              email: inviteEmail.trim(),
              role,
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
      const label = inviteMode === "admin" ? "administrator" : "employee";
      toast.success(`Invitation sent to ${inviteEmail.trim()} as ${label}`);
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

  const members: TeamMemberRow[] = (data?.members ?? []).map((m) => ({
    ...m,
    role: m.role as TeamRole
  }));
  const owner = members.find((m) => m.isOwner);
  const administrators = members.filter(
    (m) => !m.isOwner && m.role === "admin" && m.inviteStatus === "accepted"
  );
  const employees = members.filter(
    (m) =>
      !m.isOwner &&
      EMPLOYEE_ROLES.includes(m.role) &&
      m.inviteStatus === "accepted"
  );
  const pendingInvites = members.filter((m) => m.inviteStatus === "pending" && !m.isOwner);

  if (isLoading && !data) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Account Owner */}
      <section className="space-y-4">
        <SectionHeader
          icon={Crown}
          title="Account Owner"
          description="Full access to billing, settings, and all business data"
        />
        {owner ? (
          <div className="flex items-center justify-between gap-4 rounded-lg border-2 border-[#1B2A4A]/20 bg-[#1B2A4A]/5 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="bg-[#1B2A4A] text-white">{initials(owner.email)}</Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium">{owner.email}</p>
                <p className="text-xs text-muted-foreground">
                  {owner.joinedAt
                    ? `Owner since ${format(new Date(owner.joinedAt), "MMM d, yyyy")}`
                    : "Account owner"}
                </p>
              </div>
            </div>
            <Badge className={ROLE_BADGE.owner}>Owner</Badge>
          </div>
        ) : null}
      </section>

      {/* Administrators */}
      <section className="space-y-4">
        <SectionHeader
          icon={Shield}
          title="Administrators"
          description="Full operational access — can manage staff, settings, and all modules"
          count={administrators.length}
          action={
            canManage ? (
              <Button type="button" size="sm" variant="outline" onClick={() => openInvite("admin")}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Administrator
              </Button>
            ) : null
          }
        />
        {administrators.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No administrators yet. Add someone who can help manage your business.
          </p>
        ) : (
          <div className="space-y-2">
            {administrators.map((member) => (
              <StaffRow
                key={member.id}
                member={member}
                canManage={canManage}
                onRemove={() => {
                  if (window.confirm(`Remove administrator ${member.email}?`)) {
                    removeMutation.mutate(member.id);
                  }
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Employees */}
      <section className="space-y-4">
        <SectionHeader
          icon={Users}
          title="Employees"
          description="Staff with role-based access to leads, events, quotes, and daily operations"
          count={employees.length}
          action={
            canManage ? (
              <Button type="button" size="sm" onClick={() => openInvite("employee")}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Employee
              </Button>
            ) : null
          }
        />
        {employees.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No employees yet. Invite staff to help with leads, events, and operations.
          </p>
        ) : (
          <div className="space-y-2">
            {employees.map((member) => (
              <StaffRow
                key={member.id}
                member={member}
                canManage={canManage}
                roleOptions={EMPLOYEE_ROLES}
                onRoleChange={(role) => roleMutation.mutate({ memberId: member.id, role })}
                onRemove={() => {
                  if (window.confirm(`Remove employee ${member.email}?`)) {
                    removeMutation.mutate(member.id);
                  }
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Pending Invitations */}
      {pendingInvites.length > 0 ? (
        <section className="space-y-4">
          <SectionHeader
            icon={UserPlus}
            title="Pending Invitations"
            description="Invitations waiting to be accepted"
            count={pendingInvites.length}
          />
          <div className="space-y-2">
            {pendingInvites.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-dashed px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{member.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Invited {differenceInCalendarDays(new Date(), new Date(member.createdAt))} days ago
                    {" · "}
                    {isAdminRole(member.role) ? "Administrator" : "Employee"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">{roleLabel(member.role)}</Badge>
                  <Badge variant="secondary">Pending</Badge>
                  {canManage ? (
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
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {inviteMode === "admin" ? "Add Administrator" : "Add Employee"}
            </DialogTitle>
            <DialogDescription>
              {inviteMode === "admin"
                ? "Administrators can manage staff, settings, and all business modules."
                : "Employees get role-based access to specific parts of your workspace."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
              />
            </div>
            {inviteMode === "employee" ? (
              <div className="space-y-2">
                <Label>Job function</Label>
                {EMPLOYEE_ROLE_OPTIONS.map((r) => (
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
            ) : (
              <div className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
                This person will be invited as an <strong>Administrator</strong> with full
                operational access (excluding billing).
              </div>
            )}
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
              Send Invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
