import { dashClient } from "@better-auth/infra/client";
import { createAuthClient } from "better-auth/react";

/** Defaults to the current origin + `/api/auth` in the browser (works with Next rewrites). */
export const authClient = createAuthClient({
  plugins: [dashClient()],
  fetchOptions: {
    credentials: "include"
  }
});

export const { signIn, signUp, signOut, useSession } = authClient;
