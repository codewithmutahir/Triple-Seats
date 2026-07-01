"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp, useSession } from "@/lib/auth-client";
import { parseAuthError } from "@/lib/user-facing-error";
import { Check, UtensilsCrossed } from "lucide-react";

const TRUST_ITEMS = ["Secure sign-up", "Built for caterers", "Your data stays private"] as const;

export default function RegisterPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isPending || !session?.user) return;
    router.replace("/dashboard");
  }, [isPending, session?.user, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await signUp.email({
        email: email.trim(),
        password,
        name: name.trim()
      });
      if (result.error) {
        setError(parseAuthError(result.error.message, "signUp"));
        return;
      }
      router.push("/login?registered=1");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen w-full font-sans lg:grid-cols-5">
      <aside
        className="relative flex w-full flex-col justify-between overflow-hidden bg-[#1B2A4A] px-8 py-10 text-white lg:col-span-2 lg:sticky lg:top-0 lg:min-h-screen lg:self-start lg:px-10 lg:py-12"
        aria-label="CaterPro"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px),
              radial-gradient(circle at 15% 25%, rgba(255,255,255,0.14) 0%, transparent 42%),
              radial-gradient(circle at 85% 60%, rgba(255,255,255,0.1) 0%, transparent 38%)
            `,
            backgroundSize: "28px 28px, 28px 28px, auto, auto"
          }}
          aria-hidden
        />
        <div className="relative z-10 flex-1">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur-sm">
              <UtensilsCrossed className="h-6 w-6 text-white" aria-hidden />
            </div>
            <div>
              <p className="font-heading text-2xl font-semibold tracking-tight">CaterPro</p>
              <p className="text-sm text-white/70">Catering partners</p>
            </div>
          </div>
          <h1 className="font-heading text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Create your caterer account
          </h1>
          <ul className="mt-10 space-y-4">
            {TRUST_ITEMS.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-white/90 sm:text-base">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 mt-10 text-xs text-white/50 lg:mt-0">
          © {new Date().getFullYear()} CaterPro. All rights reserved.
        </p>
      </aside>

      <section className="flex w-full flex-col bg-white lg:col-span-3">
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-10 sm:px-10 sm:py-14">
          <h2 className="font-heading text-3xl font-semibold tracking-tight text-[#1B2A4A] sm:text-4xl">
            Join CaterPro
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">Set up your email and password to get started.</p>

          <form className="mt-8 space-y-5" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-[#1B2A4A] underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
