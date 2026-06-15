"use client";

import {
  BarChart3,
  Bell,
  BookCheck,
  Calendar,
  CalendarDays,
  CheckSquare,
  LayoutDashboard,
  MessageSquare,
  UserPlus
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { signOut, useSession } from "@/lib/auth-client";
import type { ServerAuthUser } from "@/lib/server-auth-session";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/leads", label: "Leads", icon: UserPlus },
  { href: "/dashboard/bookings", label: "Bookings", icon: BookCheck },
  { href: "/dashboard/events", label: "Events", icon: CalendarDays },
  { href: "/dashboard/discussions", label: "Discussions", icon: MessageSquare },
  { href: "/dashboard/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/dashboard/calendar", label: "Calendar", icon: Calendar },
  { href: "/dashboard/reports", label: "Reports", icon: BarChart3 }
] as const;

const TITLE_MAP: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/leads": "Leads",
  "/dashboard/bookings": "Bookings",
  "/dashboard/events": "Events",
  "/dashboard/discussions": "Discussions",
  "/dashboard/tasks": "Tasks",
  "/dashboard/calendar": "Calendar",
  "/dashboard/reports": "Reports",
  "/dashboard/quotes": "Quote Builder"
};

function initialsFromUser(name: string | null | undefined, email: string | undefined) {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    const a = parts[0]?.[0] ?? "";
    const b = parts[1]?.[0] ?? "";
    return (a + b).toUpperCase() || a.toUpperCase() || "?";
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "?";
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10",
              active && "bg-white/15 text-white"
            )}
          >
            <Icon className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex border-t border-white/10 bg-[#1B2A4A] px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden"
      aria-label="Primary"
    >
      <div className="flex w-full justify-around gap-0.5 overflow-x-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-w-[3.25rem] flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium text-white/80",
                active && "text-white"
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                  active ? "bg-white/15" : "bg-transparent"
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="max-w-[4.5rem] truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function DashboardShell({
  children,
  initialUser
}: {
  children: React.ReactNode;
  initialUser: ServerAuthUser;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  const pageTitle = TITLE_MAP[pathname] ?? "Dashboard";
  const user = session?.user ?? initialUser;

  const initials = useMemo(
    () => initialsFromUser(user.name, user.email ?? undefined),
    [user.name, user.email]
  );

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-[#1B2A4A] text-white md:flex">
        <div className="border-b border-white/10 px-5 py-6">
          <Link href="/dashboard" className="block">
            <p className="font-heading text-2xl font-semibold tracking-tight text-white">CaterPro</p>
            <p className="text-xs text-white/60">Caterer workspace</p>
          </Link>
        </div>
        <NavLinks />
        <div className="mt-auto border-t border-white/10 p-4">
          <p className="truncate text-xs text-white/70" title={user.email ?? ""}>
            {user.email}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
            onClick={handleSignOut}
          >
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col pb-[4.5rem] md:pb-0">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-8">
          <h1 className="font-heading text-xl font-semibold text-[#1B2A4A] md:text-2xl">{pageTitle}</h1>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="icon" className="text-slate-600" aria-label="Notifications">
              <Bell className="h-5 w-5" />
            </Button>
            <Avatar title={user.name ?? user.email ?? ""}>{initials}</Avatar>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>

      <MobileBottomNav />
    </div>
  );
}
