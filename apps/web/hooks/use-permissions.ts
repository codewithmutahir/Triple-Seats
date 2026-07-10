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

  return {
    role,
    can: (permission: Permission) => hasPermission(role, permission),
    isOwner: role === "owner",
    isAdmin: role === "admin" || role === "owner"
  };
}
