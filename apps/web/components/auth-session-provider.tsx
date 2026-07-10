"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { AuthUser } from "@tripeseats/auth";

type AuthSessionContextValue = {
  initialUser: AuthUser | null;
};

const AuthSessionContext = createContext<AuthSessionContextValue>({ initialUser: null });

export function AuthSessionProvider({
  initialUser,
  children
}: {
  initialUser: AuthUser | null;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ initialUser }), [initialUser]);
  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useInitialAuthUser(): AuthUser | null {
  return useContext(AuthSessionContext).initialUser;
}
