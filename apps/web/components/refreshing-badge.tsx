import { Loader2 } from "lucide-react";

export function RefreshingBadge({ label = "Refreshing…" }: { label?: string }) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-muted-foreground shadow-sm"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-3 w-3 animate-spin text-[#1B2A4A]" />
      {label}
    </div>
  );
}
