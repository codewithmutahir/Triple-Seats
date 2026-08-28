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
  const inviteToken = opts.metadata?.inviteToken?.trim();
  const webOrigin =
    process.env.WEB_ORIGIN?.trim() || process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3000";
  const fallbackInviteUrl = inviteToken ? `${webOrigin}/invite/${inviteToken}` : null;

  const subject = isVendorInvite
    ? "Open your Tripeseats vendor calendar"
    : "Your Tripeseats sign-in link";

  const intro = isVendorInvite
    ? "<p>You've been invited to manage your vendor calendar on Tripeseats. Click below to sign in — no password needed.</p>"
    : "<p>Click below to sign in to Tripeseats. No password needed.</p>";

  const fallbackLine = fallbackInviteUrl
    ? `<p style="color:#64748b;font-size:13px">If this link expires, open <a href="${escapeHtml(fallbackInviteUrl)}">your invitation page</a> to get a new one. Your invitation stays valid for 7 days.</p>`
    : "";

  await resend.emails.send({
    from: resendFromEmail(),
    to: opts.email,
    subject,
    html: `<p>Hi,</p>${intro}<p><a href="${escapeHtml(opts.url)}">${isVendorInvite ? "Open vendor calendar" : "Continue to Tripeseats"}</a></p><p>This sign-in link expires in ${minutes} minute${minutes === 1 ? "" : "s"}.</p>${fallbackLine}<p>— Tripeseats</p>`
  });
}
