"use client";

import { Eye } from "lucide-react";

import { roleLabel } from "@/lib/role-labels";

type ViewOnlyBannerProps = {
  role: string;
  className?: string;
};

/** Shown for viewer role — global read-only mode (Option C). */
export function ViewOnlyBanner({ role, className }: ViewOnlyBannerProps) {
  return (
    <div
      className={
        className ??
        "flex items-center gap-2 border-b border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900 md:px-8"
      }
      role="status"
    >
      <Eye className="h-4 w-4 shrink-0 text-sky-700" aria-hidden />
      <p>
        <span className="font-medium">View only</span>
        <span className="text-sky-800">
          {" "}
          — you have {roleLabel(role as import("@/lib/permissions").TeamRole)} access. Contact your
          admin to request changes.
        </span>
      </p>
    </div>
  );
}
