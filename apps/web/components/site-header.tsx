"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { LayoutDashboard, LogOut, UtensilsCrossed } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useInitialAuthUser } from "@/components/auth-session-provider";
import { signOut, useSession } from "@/lib/auth-client";
import type { AuthUser } from "@tripeseats/auth";
import { cn } from "@/lib/utils";

function initialsFromUser(name?: string | null, email?: string): string {
  const fromName = name?.trim();
  if (fromName) {
    const parts = fromName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
    }
    return fromName.slice(0, 2).toUpperCase();
  }
  return (email?.slice(0, 2) ?? "?").toUpperCase();
}

type SiteHeaderProps = {
  user: AuthUser | null;
  className?: string;
};

/**
 * Public site header — initial auth state comes from the server `user` prop (no mount flash).
 * `useSession()` is used only for reactive updates after login/logout in the same tab.
 */
export function SiteHeader({ user: serverUser, className }: SiteHeaderProps) {
  const router = useRouter();
  const contextUser = useInitialAuthUser();
  const { data: session } = useSession();

  const user = session?.user ?? serverUser ?? contextUser;

  const initials = useMemo(
    () => initialsFromUser(user?.name, user?.email ?? undefined),
    [user?.name, user?.email]
  );

  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header
      className={cn(
        "mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6",
        className
      )}
    >
      <Link href="/" className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-white/10">
          <UtensilsCrossed className="h-5 w-5" aria-hidden />
        </div>
        <span className="font-heading text-xl font-semibold">Tripeseats</span>
      </Link>

      <div className="flex items-center gap-2">
        {user ? (
          <>
            <Button
              asChild
              variant="ghost"
              className="hidden text-white hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              <Link href="/dashboard/events">My Events</Link>
            </Button>
            <Button asChild variant="ghost" className="text-white hover:bg-white/10 hover:text-white">
              <Link href="/dashboard">
                <LayoutDashboard className="mr-2 h-4 w-4" aria-hidden />
                Dashboard
              </Link>
            </Button>
            <Avatar title={user.name ?? user.email ?? ""} className="hidden sm:flex">
              {initials}
            </Avatar>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10 hover:text-white"
              aria-label="Sign out"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <Button asChild variant="ghost" className="text-white hover:bg-white/10 hover:text-white">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild className="bg-white text-[#1B2A4A] hover:bg-white/90">
              <Link href="/register">Get started</Link>
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
