import type { Metadata } from "next";
import { redirect } from "next/navigation";

import type { ReactNode } from "react";

import { getServerAuthSession } from "@/lib/server-auth-session";

import { DashboardShell } from "./dashboard-shell";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Manage leads, bookings, and events."
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const auth = await getServerAuthSession();
  if (!auth?.user) {
    redirect("/login");
  }

  return <DashboardShell initialUser={auth.user}>{children}</DashboardShell>;
}
