import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Payment successful"
};

export default function PaySuccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md rounded-xl border bg-white p-8 text-center shadow-sm">
        <h1 className="font-heading text-2xl font-semibold text-[#1B2A4A]">Payment received</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Thank you. Your card payment was submitted. Confirmation may take a moment while we
          verify with our payment processor.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-[#1B2A4A] px-4 text-sm font-medium text-white"
        >
          Done
        </Link>
      </div>
    </main>
  );
}
