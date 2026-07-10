import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
        lead: "border-transparent bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
        booked: "border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200",
        completed: "border-transparent bg-muted text-muted-foreground",
        discussion: "border-transparent bg-sky-100 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200",
        quoteDraft: "border-transparent bg-slate-100 text-slate-800 dark:bg-slate-800/50 dark:text-slate-200",
        quoteSent: "border-transparent bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200",
        quoteAccepted: "border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200",
        quoteDeclined: "border-transparent bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-200",
        lost: "border-transparent bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
