import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { hasPermission, type Permission, type TeamRole } from "@/lib/permissions";
import { queryKeys } from "@/lib/query-keys";

export function usePermissions() {
  const { data } = useQuery({
    queryKey: queryKeys.team.me(),
    queryFn: api.team.me,
    staleTime: 60_000
  });

  const role = (data?.role ?? "owner") as TeamRole;
  const isOwner = data?.isOwner ?? role === "owner";

  return {
    role,
    catererName: data?.catererName ?? null,
    isTeamMember: data?.isTeamMember ?? !isOwner,
    isOwner,
    can: (permission: Permission) => hasPermission(role, permission),
    isAdmin: role === "admin" || isOwner
  };
}
