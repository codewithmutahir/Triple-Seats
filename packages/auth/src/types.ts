/** Minimal user shape returned by Better Auth `getSession` / `/api/auth/get-session`. */
export type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
};

export type AuthSession = {
  user: AuthUser;
};
