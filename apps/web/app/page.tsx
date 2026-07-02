import Link from "next/link";
import { ArrowRight, UtensilsCrossed } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#1B2A4A] text-white">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-white/10">
            <UtensilsCrossed className="h-5 w-5" aria-hidden />
          </div>
          <span className="font-heading text-xl font-semibold">Tripeseats</span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" className="text-white hover:bg-white/10 hover:text-white">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild className="bg-white text-[#1B2A4A] hover:bg-white/90">
            <Link href="/register">Get started</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto flex flex-1 w-full max-w-5xl flex-col justify-center px-6 py-16">
        <p className="mb-4 text-sm font-medium uppercase tracking-wider text-emerald-300">
          Catering business software
        </p>
        <h1 className="font-heading max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
          Run your catering business on one platform
        </h1>
        <p className="mt-6 max-w-xl text-lg text-white/80">
          Each caterer gets a branded booking link like{" "}
          <span className="font-mono text-white">tripleseat.example.com/book/your-name</span> and a
          private dashboard.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Button asChild size="lg" className="bg-white text-[#1B2A4A] hover:bg-white/90">
            <Link href="/register">
              Create your account
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            <Link href="/login">Sign in to dashboard</Link>
          </Button>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-6 py-8 text-sm text-white/50">
        © {new Date().getFullYear()} Tripeseats
      </footer>
    </div>
  );
}
