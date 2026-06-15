import { Resend } from "resend";

let resendClient: Resend | null | undefined;

/** Lazy singleton; returns null when `RESEND_API_KEY` is unset. */
export function getResend(): Resend | null {
  if (resendClient === undefined) {
    const key = process.env.RESEND_API_KEY?.trim();
    resendClient = key ? new Resend(key) : null;
  }
  return resendClient;
}

export function resendFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL?.trim() || "Tripeseats <onboarding@resend.dev>";
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}
