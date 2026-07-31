import Link from "next/link";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import type { AuthUser } from "@tripeseats/auth";

type LegalShellProps = {
  user: AuthUser | null;
  title: string;
  lastUpdated: string;
  children: ReactNode;
};

export function LegalShell({ user, title, lastUpdated, children }: LegalShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="bg-[#1B2A4A] text-white">
        <SiteHeader user={user} />
      </div>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <p className="mb-2 text-sm text-muted-foreground">
          <Link href="/" className="text-[#1B2A4A]/80 hover:text-[#1B2A4A] hover:underline">
            Home
          </Link>
          <span className="mx-2 text-slate-300" aria-hidden>
            /
          </span>
          <span>{title}</span>
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-[#1B2A4A] sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
        <div className="prose prose-slate mt-10 max-w-none space-y-6 text-sm leading-relaxed text-slate-700 sm:text-[15px]">
          {children}
        </div>
      </main>

      <div className="border-t bg-white">
        <SiteFooter variant="light" className="mx-auto max-w-3xl px-6 py-8" />
      </div>
    </div>
  );
}
