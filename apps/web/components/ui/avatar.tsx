import * as React from "react";

import { cn } from "@/lib/utils";

const Avatar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1B2A4A] text-sm font-semibold text-white",
        className
      )}
      {...props}
    />
  )
);
Avatar.displayName = "Avatar";

export { Avatar };
