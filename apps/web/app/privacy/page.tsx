import type { Metadata } from "next";

import { LegalShell } from "@/components/legal-shell";
import { getServerAuthSession } from "@/lib/server-auth-session";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Tripeseats collects, uses, and protects your information."
};

const LAST_UPDATED = "July 31, 2026";

export default async function PrivacyPolicyPage() {
  const session = await getServerAuthSession();

  return (
    <LegalShell user={session?.user ?? null} title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">1. Overview</h2>
        <p>
          Tripeseats (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) provides multi-tenant catering
          operations software, including booking intake, quotes, events, payments tooling, and related
          dashboards. This Privacy Policy explains what information we collect, how we use it, and the
          choices available to you.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">2. Information we collect</h2>
        <p>Depending on how you use Tripeseats, we may collect:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium text-slate-900">Account information</span> — name, email,
            password (stored as a secure hash), business/caterer profile details, and role within a
            workspace.
          </li>
          <li>
            <span className="font-medium text-slate-900">Business &amp; event data</span> — leads,
            guests, events, quotes, packages, menu items, tasks, discussions, and related operational
            records you enter into the platform.
          </li>
          <li>
            <span className="font-medium text-slate-900">Booking form submissions</span> — information
            submitted by end customers through a caterer&apos;s public booking link (for example contact
            details, event date, guest count, and preferences).
          </li>
          <li>
            <span className="font-medium text-slate-900">Payment-related data</span> — status and
            metadata needed to track deposits or charges. Card numbers are processed by our payment
            providers; we do not store full payment card numbers on our servers.
          </li>
          <li>
            <span className="font-medium text-slate-900">Usage &amp; technical data</span> — IP address,
            browser type, device information, pages viewed, and diagnostic/error logs used to operate
            and improve the service.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">3. How we use information</h2>
        <p>We use information to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Provide, maintain, and improve the Tripeseats platform</li>
          <li>Authenticate users and protect accounts and workspaces</li>
          <li>Process bookings, quotes, notifications, and related catering workflows</li>
          <li>Communicate about service updates, security notices, and support requests</li>
          <li>Monitor performance, prevent abuse, and comply with legal obligations</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">4. Multi-tenant workspaces</h2>
        <p>
          Tripeseats is multi-tenant. Caterer workspace data is scoped to that caterer. Staff with access
          to a workspace can view and manage data within that workspace according to their role
          permissions. We do not sell customer data between caterers.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">5. Sharing of information</h2>
        <p>We may share information with:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium text-slate-900">Service providers</span> that help us host,
            email, authenticate, analyze, or process payments — under contractual confidentiality and
            security obligations
          </li>
          <li>
            <span className="font-medium text-slate-900">Legal authorities</span> when required by law or
            to protect rights, safety, and the integrity of the service
          </li>
          <li>
            <span className="font-medium text-slate-900">Business transfers</span> if we are involved in
            a merger, acquisition, or asset sale, subject to appropriate protections
          </li>
        </ul>
        <p>We do not sell your personal information.</p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">6. Cookies &amp; sessions</h2>
        <p>
          We use cookies and similar technologies for authentication (session cookies), security, and to
          remember preferences. You can control cookies through your browser settings; disabling
          essential cookies may prevent you from signing in or using the dashboard.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">7. Data retention</h2>
        <p>
          We retain account and workspace data for as long as your account is active or as needed to
          provide the service. We may retain certain records longer when required for legal, security,
          or accounting purposes. You may request deletion of your account by contacting us.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">8. Security</h2>
        <p>
          We use industry-standard measures such as encrypted transport (HTTPS), hashed passwords,
          access controls, and monitoring. No method of transmission or storage is completely secure; if
          you believe your account has been compromised, contact us promptly.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">9. Your rights &amp; choices</h2>
        <p>
          Depending on your location, you may have rights to access, correct, export, or delete personal
          information, or to object to certain processing. Workspace owners can update most business
          data directly in the dashboard. For account-level privacy requests, contact us using the
          details below.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">10. Children</h2>
        <p>
          Tripeseats is not directed to children under 13, and we do not knowingly collect personal
          information from children under 13.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">11. Changes to this policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will post the revised version on this
          page and update the &quot;Last updated&quot; date. Continued use of the service after changes
          become effective constitutes acceptance of the updated policy.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">12. Contact</h2>
        <p>
          Questions about this Privacy Policy or your personal information can be sent to{" "}
          <a
            href="mailto:privacy@tripeseats.com"
            className="font-medium text-[#1B2A4A] underline-offset-2 hover:underline"
          >
            privacy@tripeseats.com
          </a>
          .
        </p>
      </section>
    </LegalShell>
  );
}
