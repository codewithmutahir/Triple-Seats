"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";

import type { SaveStatus } from "@/components/quote/types";
import { cn } from "@/lib/utils";

type SaveStatusIndicatorProps = {
  status: SaveStatus;
  onFadeComplete?: () => void;
};

export function SaveStatusIndicator({ status, onFadeComplete }: SaveStatusIndicatorProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status === "idle") {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (status === "saved") {
      const t = setTimeout(() => {
        setVisible(false);
        onFadeComplete?.();
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [status, onFadeComplete]);

  if (!visible || status === "idle") return null;

  return (
    <div
      role="status"
      className={cn(
        "fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-md px-3 py-1.5 text-xs shadow-sm transition-opacity md:left-72",
        status === "error" ? "bg-destructive/10 text-destructive" : "bg-muted/90 text-muted-foreground"
      )}
    >
      {status === "saving" ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gray-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gray-400" />
          </span>
          Saving...
        </>
      ) : null}
      {status === "saved" ? (
        <>
          <Check className="h-3.5 w-3.5 text-green-600" />
          <span className="text-green-700">All changes saved</span>
        </>
      ) : null}
      {status === "error" ? (
        <>
          <span className="h-2 w-2 rounded-full bg-destructive" />
          Save failed — retrying
        </>
      ) : null}
    </div>
  );
}
