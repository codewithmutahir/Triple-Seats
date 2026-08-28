import { dashClient } from "@better-auth/infra/client";
import { createAuthClient } from "better-auth/react";
import { magicLinkClient, twoFactorClient } from "better-auth/client/plugins";

/** Defaults to the current origin + `/api/auth` in the browser (works with Next rewrites). */
export const authClient = createAuthClient({
  // Plugin tuple typing conflicts between infra + Better Auth 1.7 — runtime is correct.
  plugins: [twoFactorClient(), magicLinkClient(), dashClient()] as any,
  fetchOptions: {
    credentials: "include"
  }
});

export const { signIn, signUp, signOut, useSession } = authClient;

type TwoFactorApi = {
  enable: (input: { password: string; method?: "totp" | "otp"; issuer?: string }) => Promise<{
    data?: { method: "totp"; totpURI: string; backupCodes: string[] } | { method: "otp" };
    error?: { message?: string };
  }>;
  verifyTotp: (input: { code: string; trustDevice?: boolean }) => Promise<{
    data?: unknown;
    error?: { message?: string };
  }>;
  verifyBackupCode: (input: { code: string; trustDevice?: boolean }) => Promise<{
    data?: unknown;
    error?: { message?: string };
  }>;
  disable: (input: { password: string }) => Promise<{ data?: unknown; error?: { message?: string } }>;
};

/** Two-factor client actions (Better Auth plugin). */
export const twoFactor = (authClient as unknown as { twoFactor: TwoFactorApi }).twoFactor;

export type AuthSessionUser = NonNullable<ReturnType<typeof useSession>["data"]>["user"] & {
  twoFactorEnabled?: boolean;
};

type MagicLinkInput = {
  email: string;
  callbackURL?: string;
  errorCallbackURL?: string;
  metadata?: Record<string, string>;
};

/** Passwordless sign-in link (Better Auth magic link plugin). */
export async function sendLoginMagicLink(input: MagicLinkInput) {
  return (authClient as unknown as { signIn: { magicLink: (i: MagicLinkInput) => Promise<{ error?: { message?: string } }> } }).signIn.magicLink(input);
}
