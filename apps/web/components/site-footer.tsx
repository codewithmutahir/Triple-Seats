import Link from "next/link";

import { cn } from "@/lib/utils";

type SiteFooterProps = {
  className?: string;
  /** Dark navy surfaces (home / auth aside) vs light legal pages. */
  variant?: "dark" | "light";
};

export function SiteFooter({ className, variant = "dark" }: SiteFooterProps) {
  const muted = variant === "dark" ? "text-white/50" : "text-muted-foreground";
  const link =
    variant === "dark"
      ? "text-white/70 transition-colors hover:text-white"
      : "text-[#1B2A4A]/80 transition-colors hover:text-[#1B2A4A]";

  return (
    <footer className={cn("w-full text-sm", muted, className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Tripeseats. All rights reserved.</p>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Legal">
          <Link href="/privacy" className={link}>
            Privacy Policy
          </Link>
          <Link href="/terms" className={link}>
            Terms &amp; Conditions
          </Link>
        </nav>
      </div>
    </footer>
  );
}
