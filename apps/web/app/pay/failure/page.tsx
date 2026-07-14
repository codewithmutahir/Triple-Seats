import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Payment failed"
};

export default function PayFailurePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md rounded-xl border bg-white p-8 text-center shadow-sm">
        <h1 className="font-heading text-2xl font-semibold text-[#1B2A4A]">Payment unsuccessful</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your card was not charged successfully. You can close this page and ask the caterer for a
          new payment link, or try again with a different card.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium"
        >
          Close
        </Link>
      </div>
    </main>
  );
}
