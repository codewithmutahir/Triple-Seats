import type { Metadata } from "next";

import { LegalShell } from "@/components/legal-shell";
import { getServerAuthSession } from "@/lib/server-auth-session";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "Terms governing use of the Tripeseats catering platform."
};

const LAST_UPDATED = "July 31, 2026";

export default async function TermsPage() {
  const session = await getServerAuthSession();

  return (
    <LegalShell
      user={session?.user ?? null}
      title="Terms & Conditions"
      lastUpdated={LAST_UPDATED}
    >
      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">1. Agreement</h2>
        <p>
          These Terms &amp; Conditions (&quot;Terms&quot;) govern access to and use of Tripeseats, the
          catering operations platform operated by us (the &quot;Service&quot;). By creating an account,
          accessing the dashboard, or using a public booking link powered by Tripeseats, you agree to
          these Terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">2. The Service</h2>
        <p>
          Tripeseats provides software tools for catering businesses, including lead intake, quotes,
          events, staffing/logistics line items, communications, tasks, reporting, and related features.
          Features may change over time as we improve the product.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">3. Accounts &amp; workspaces</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>You must provide accurate registration information and keep credentials secure.</li>
          <li>
            Each caterer workspace is responsible for users invited into that workspace and for activity
            performed under its accounts.
          </li>
          <li>
            You are responsible for configuring roles and permissions appropriately for your team.
          </li>
          <li>
            We may suspend or terminate accounts that violate these Terms or pose a security risk.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">4. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Use the Service for unlawful, fraudulent, or harmful purposes</li>
          <li>Attempt to access another caterer&apos;s data without authorization</li>
          <li>Interfere with or disrupt the Service, including abuse of rate limits or APIs</li>
          <li>Upload malware or attempt to reverse engineer the platform except as allowed by law</li>
          <li>Misrepresent your identity or your relationship to a catering business</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">5. Customer content</h2>
        <p>
          You retain ownership of content and data you submit to the Service (&quot;Customer
          Content&quot;), including menu items, packages, guest details, and quotes. You grant us a
          limited license to host, process, and display Customer Content solely to operate and improve
          the Service for you. You represent that you have the rights needed to submit Customer Content
          and that it does not infringe others&apos; rights.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">6. Booking links &amp; end customers</h2>
        <p>
          Public booking pages are provided for caterers to collect inquiries from their customers.
          Caterers are responsible for their own contracts, pricing, fulfillment, and communications
          with end customers. Tripeseats is a software platform and is not a party to catering contracts
          between caterers and their clients unless expressly stated in a separate written agreement.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">7. Payments</h2>
        <p>
          If payment features are enabled, charges may be processed by third-party payment processors.
          You agree to those processors&apos; terms where applicable. Fees for Tripeseats subscriptions
          or usage, if any, will be disclosed at signup or in an order form. Unless required by law,
          fees are non-refundable once a billing period begins.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">8. Intellectual property</h2>
        <p>
          The Service, including software, design, trademarks, and documentation, is owned by Tripeseats
          or its licensors. These Terms do not grant you any right to copy, modify, or redistribute our
          intellectual property except as needed to use the Service as intended.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">9. Confidentiality</h2>
        <p>
          Each party may receive non-public information from the other. You agree to protect our
          confidential information and we agree to protect yours, using at least reasonable care, and
          to use it only as needed to perform under these Terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">10. Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE.&quot; TO THE MAXIMUM EXTENT
          PERMITTED BY LAW, WE DISCLAIM WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
          AND NON-INFRINGEMENT. We do not guarantee uninterrupted or error-free operation, or that
          quotes, PDFs, or calculations will meet every business or legal requirement without your
          review.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">11. Limitation of liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, TRIPESEATS AND ITS AFFILIATES WILL NOT BE LIABLE FOR
          INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS,
          REVENUE, OR DATA. OUR AGGREGATE LIABILITY ARISING OUT OF THESE TERMS OR THE SERVICE WILL NOT
          EXCEED THE AMOUNTS PAID BY YOU TO US FOR THE SERVICE IN THE TWELVE (12) MONTHS BEFORE THE
          CLAIM, OR ONE HUNDRED US DOLLARS (USD $100) IF YOU HAVE NOT PAID ANY FEES.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">12. Indemnification</h2>
        <p>
          You agree to indemnify and hold harmless Tripeseats from claims arising out of your Customer
          Content, your catering services to end customers, or your misuse of the Service, except to the
          extent caused by our willful misconduct.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">13. Termination</h2>
        <p>
          You may stop using the Service at any time. We may suspend or terminate access for breach of
          these Terms or to protect the Service. Upon termination, your right to access the Service
          ends; provisions that by their nature should survive (including ownership, disclaimers, and
          liability limits) will survive.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">14. Changes to the Terms</h2>
        <p>
          We may update these Terms by posting a revised version on this page and updating the
          &quot;Last updated&quot; date. Material changes may also be communicated by email or in-product
          notice. Continued use after the effective date constitutes acceptance.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">15. Governing law</h2>
        <p>
          These Terms are governed by the laws of the State of California, USA, without regard to
          conflict-of-law principles, unless a mandatory local law requires otherwise. Courts in that
          jurisdiction will have exclusive venue, subject to applicable consumer protections.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold text-[#1B2A4A]">16. Contact</h2>
        <p>
          Questions about these Terms can be sent to{" "}
          <a
            href="mailto:legal@tripeseats.com"
            className="font-medium text-[#1B2A4A] underline-offset-2 hover:underline"
          >
            legal@tripeseats.com
          </a>
          .
        </p>
      </section>
    </LegalShell>
  );
}
