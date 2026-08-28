import { dash } from "@better-auth/infra";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink, twoFactor } from "better-auth/plugins";

import { AUTH_COOKIE_CACHE_MAX_AGE_SECONDS } from "@tripeseats/auth";
import { prisma } from "@tripeseats/database";

import { isLocalHostname } from "./is-local-hostname";
import { allowedWebOrigins } from "./origins";
import { escapeHtml, getResend, resendFromEmail } from "./mail";
import { deliverMagicLinkEmail, magicLinkExpiresSeconds } from "./magic-link-mail";
import { passwordSecurityBeforeHook } from "./password-auth-hook";

const resend = getResend();

const rootDomainRaw = process.env.PUBLIC_ROOT_DOMAIN?.trim();
const rootDomain =
  rootDomainRaw && !isLocalHostname(rootDomainRaw) ? rootDomainRaw : undefined;

const authEmail =
  resend != null
    ? {
        emailVerification: {
          sendVerificationEmail: async ({
            user,
            url
          }: {
            user: { email: string; name?: string | null };
            url: string;
          }) => {
            const greeting = user.name ? `Hi ${escapeHtml(user.name)}` : "Hi";
            await resend.emails.send({
              from: resendFromEmail(),
              to: user.email,
              subject: "Verify your Tripeseats email",
              html: `<p>${greeting},</p><p>Confirm your email to finish setting up your account.</p><p><a href="${escapeHtml(url)}">Verify email</a></p><p>If you did not sign up, you can ignore this message.</p>`
            });
          }
        },
        emailAndPassword: {
          sendResetPassword: async ({
            user,
            url
          }: {
            user: { email: string; name?: string | null };
            url: string;
          }) => {
            const greeting = user.name ? `Hi ${escapeHtml(user.name)}` : "Hi";
            await resend.emails.send({
              from: resendFromEmail(),
              to: user.email,
              subject: "Reset your Tripeseats password",
              html: `<p>${greeting},</p><p>We received a request to reset your password. Use the link below (it expires soon).</p><p><a href="${escapeHtml(url)}">Reset password</a></p><p>If you did not ask for this, you can ignore this email.</p>`
            });
          }
        }
      }
    : {};

export const auth = betterAuth({
  appName: "Tripeseats",
  baseURL: process.env.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, {
    provider: "postgresql"
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    ...(authEmail.emailAndPassword ?? {})
  },
  ...(authEmail.emailVerification ? { emailVerification: authEmail.emailVerification } : {}),
  trustedOrigins: allowedWebOrigins(),
  secret: process.env.BETTER_AUTH_SECRET,
  session: {
    cookieCache: {
      enabled: true,
      maxAge: AUTH_COOKIE_CACHE_MAX_AGE_SECONDS,
      strategy: "compact",
      refreshCache: false
    }
  },
  advanced: rootDomain
    ? {
        crossSubDomainCookies: {
          enabled: true,
          domain: rootDomain
        }
      }
    : undefined,
  plugins: [
    dash({
      apiKey: process.env.BETTER_AUTH_API_KEY
    }),
    magicLink({
      expiresIn: magicLinkExpiresSeconds(),
      disableSignUp: false,
      sendMagicLink: async ({ email, url, metadata }) => {
        if (!getResend()) {
          throw new Error("Email is not configured on the server.");
        }
        await deliverMagicLinkEmail({
          email,
          url,
          metadata: metadata as { kind?: string; inviteToken?: string } | undefined
        });
      }
    }),
    twoFactor({
      issuer: "Tripeseats"
    })
  ],
  hooks: {
    before: passwordSecurityBeforeHook
  },
  // Better Auth 1.7+ deletes credential passwords on magic-link sign-in when
  // emailVerified is false. We do not require a separate verification step.
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: {
            ...user,
            emailVerified: true
          }
        })
      }
    }
  }
});
