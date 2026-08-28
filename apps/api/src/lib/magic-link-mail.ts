import { escapeHtml, getResend, resendFromEmail } from "./mail";

export function magicLinkExpiresSeconds() {
  const raw = Number(process.env.MAGIC_LINK_EXPIRES_SECONDS);
  if (Number.isFinite(raw) && raw >= 60 && raw <= 3600) return Math.floor(raw);
  return 15 * 60;
}

export function magicLinkExpiresMinutes() {
  return Math.max(1, Math.round(magicLinkExpiresSeconds() / 60));
}

type MagicLinkMetadata = {
  kind?: string;
  inviteToken?: string;
};

export async function deliverMagicLinkEmail(opts: {
  email: string;
  url: string;
  metadata?: MagicLinkMetadata;
}) {
  const resend = getResend();
  if (!resend) {
    throw new Error("Email is not configured on the server.");
  }

  const minutes = magicLinkExpiresMinutes();
  const isVendorInvite = opts.metadata?.kind === "vendor_invite";
  const subject = isVendorInvite
    ? "Your Tripeseats vendor calendar sign-in link"
    : "Your Tripeseats sign-in link";

  const intro = isVendorInvite
    ? "<p>Click below to sign in and open your vendor calendar. No password needed.</p>"
    : "<p>Click below to sign in to Tripeseats. No password needed.</p>";

  await resend.emails.send({
    from: resendFromEmail(),
    to: opts.email,
    subject,
    html: `<p>Hi,</p>${intro}<p><a href="${escapeHtml(opts.url)}">Continue to Tripeseats</a></p><p>This link expires in ${minutes} minute${minutes === 1 ? "" : "s"}. If you did not request it, you can ignore this email.</p><p>— Tripeseats</p>`
  });
}
