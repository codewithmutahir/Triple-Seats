import { useCallback } from "react";

import type { Permission } from "@/lib/permissions";

import { usePermissions } from "./use-permissions";

/** Granular write check for a specific permission (Option C — per-role matrix). */
export function useWriteAccess(permission: Permission) {
  const { can, isReadOnly, role } = usePermissions();
  const allowed = can(permission);

  const ifAllowed = useCallback(
    (fn: () => void) => {
      if (allowed) fn();
    },
    [allowed]
  );

  return { allowed, isReadOnly, role, ifAllowed };
}
