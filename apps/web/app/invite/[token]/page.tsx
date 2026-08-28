"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { signIn, signOut, signUp, useSession } from "@/lib/auth-client";
import { parseAuthError } from "@/lib/user-facing-error";

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

export default function InviteAcceptPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const { data: session, isPending: sessionLoading, refetch } = useSession();
  const autoAcceptStarted = useRef(false);

  const [invite, setInvite] = useState<{
    email: string;
    role: string;
    catererName: string;
    expiresAt: string;
    willLimitToCalendarOnly?: boolean;
    existingAccountHasFullAccess?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [authMode, setAuthMode] = useState<"signin" | "register">("signin");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [forceAuthForm, setForceAuthForm] = useState(false);

  const signedInEmail = session?.user?.email ?? null;
  const emailMatches = useMemo(() => {
    if (!invite || !signedInEmail) return false;
    return normalizeEmail(signedInEmail) === normalizeEmail(invite.email);
  }, [invite, signedInEmail]);

  const redirectTarget =
    invite?.role === "calendar_only" ? "/dashboard/vendor-calendar" : "/dashboard";

  const requiresManualAccept = Boolean(
    invite?.willLimitToCalendarOnly && invite?.existingAccountHasFullAccess
  );

  useEffect(() => {
    void (async () => {
      try {
        const data = await api.invite.get(params.token);
        setInvite({
          email: data.email,
          role: data.role,
          catererName: data.catererName,
          expiresAt: data.expiresAt,
          willLimitToCalendarOnly: data.willLimitToCalendarOnly,
          existingAccountHasFullAccess: data.existingAccountHasFullAccess
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Invitation not found";
        setError(
          message.includes("expired") ? "This invitation has expired. Ask for a new invite." : message
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [params.token]);

  const acceptInvite = useCallback(async () => {
    setAccepting(true);
    try {
      const res = await api.invite.accept(params.token);
      router.push(res.redirect ?? redirectTarget);
      router.refresh();
    } catch (e) {
      autoAcceptStarted.current = false;
      toast.error(e instanceof Error ? e.message : "Failed to accept invitation");
    } finally {
      setAccepting(false);
    }
  }, [params.token, redirectTarget, router]);

  useEffect(() => {
    if (loading || sessionLoading || !invite || !emailMatches || forceAuthForm) return;
    if (requiresManualAccept) return;
    if (autoAcceptStarted.current || accepting) return;
    autoAcceptStarted.current = true;
    void acceptInvite();
  }, [
    loading,
    sessionLoading,
    invite,
    emailMatches,
    forceAuthForm,
    accepting,
    acceptInvite,
    requiresManualAccept
  ]);

  async function switchToInvitedAccount() {
    if (!invite) return;
    setSwitchingAccount(true);
    try {
      await signOut();
      await refetch();
      autoAcceptStarted.current = false;
      setForceAuthForm(true);
      setAuthMode("signin");
      setPassword("");
    } catch {
      toast.error("Could not sign out. Please try again.");
    } finally {
      setSwitchingAccount(false);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!invite) return;
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      const result = await signIn.email({
        email: invite.email.trim(),
        password
      });
      if (result.error) {
        setAuthError(parseAuthError(result.error.message, "signIn"));
        return;
      }
      await refetch();
      if (invite.existingAccountHasFullAccess && invite.role === "calendar_only") {
        setForceAuthForm(false);
        return;
      }
      autoAcceptStarted.current = true;
      await acceptInvite();
    } catch {
      setAuthError("Something went wrong. Please try again.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!invite) return;
    setAuthError(null);
    if (password !== confirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setAuthError("Password must be at least 8 characters.");
      return;
    }
    setAuthSubmitting(true);
    try {
      const result = await signUp.email({
        email: invite.email.trim(),
        password,
        name: name.trim() || invite.email.split("@")[0] || "Vendor"
      });
      if (result.error) {
        setAuthError(parseAuthError(result.error.message, "signUp"));
        return;
      }
      await refetch();
      if (invite.existingAccountHasFullAccess && invite.role === "calendar_only") {
        setForceAuthForm(false);
        return;
      }
      autoAcceptStarted.current = true;
      await acceptInvite();
    } catch {
      setAuthError("Something went wrong. Please try again.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-10 text-center">
            <p className="text-destructive">{error ?? "Invitation not found"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const showAuthForm = !session?.user || forceAuthForm;
  const showWrongAccount = session?.user && !emailMatches && !forceAuthForm;
  const showOpening = emailMatches && !requiresManualAccept && (accepting || autoAcceptStarted.current);
  const showManualAccept = emailMatches && requiresManualAccept && !showOpening;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <p className="font-heading text-2xl font-semibold text-[#1B2A4A]">Tripeseats</p>
          <CardTitle className="mt-4 text-xl font-normal">
            {invite.role === "calendar_only"
              ? `You've been invited to manage your vendor calendar`
              : `You've been invited to join ${invite.catererName}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Role</p>
            <Badge className="mt-1 capitalize">
              {invite.role === "calendar_only" ? "Vendor Calendar" : invite.role}
            </Badge>
          </div>
          {invite.role === "calendar_only" ? (
            <p className="text-center text-sm text-muted-foreground">
              You&apos;ll only have access to your vendor calendar — not leads, bookings, or
              settings.
            </p>
          ) : null}
          {invite.existingAccountHasFullAccess && invite.role === "calendar_only" ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-medium">This email already has a Tripeseats account.</p>
              <p className="mt-1">
                Accepting will switch your dashboard to <strong>vendor calendar only</strong>.
                Leads, bookings, quotes, and other sidebar items will be hidden until access is
                restored by an admin.
              </p>
            </div>
          ) : null}
          <p className="text-center text-sm text-muted-foreground">Invitation for {invite.email}</p>
          <p className="text-center text-xs text-muted-foreground">
            Expires{" "}
            {new Date(invite.expiresAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short"
            })}
          </p>

          {sessionLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : showOpening ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <Loader2 className="h-6 w-6 animate-spin text-[#1B2A4A]" />
              <p className="text-sm font-medium text-[#1B2A4A]">Opening your calendar…</p>
            </div>
          ) : showWrongAccount ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <p>
                  You&apos;re signed in as <strong>{signedInEmail}</strong>, but this invitation is
                  for <strong>{invite.email}</strong>.
                </p>
              </div>
              <Button
                type="button"
                className="w-full bg-[#1B2A4A] hover:bg-[#152238]"
                disabled={switchingAccount}
                onClick={() => void switchToInvitedAccount()}
              >
                {switchingAccount ? "Switching account…" : `Continue as ${invite.email}`}
              </Button>
            </div>
          ) : showManualAccept ? (
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <p className="text-center text-sm text-muted-foreground">
                Signed in as <strong>{signedInEmail}</strong>
              </p>
              <Button
                type="button"
                className="w-full bg-[#1B2A4A] hover:bg-[#152238]"
                disabled={accepting}
                onClick={() => void acceptInvite()}
              >
                {accepting ? "Switching access…" : "Accept & switch to vendor calendar only"}
              </Button>
            </div>
          ) : showAuthForm ? (
            <div className="space-y-4 border-t border-slate-100 pt-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={authMode === "signin" ? "default" : "outline"}
                  className={authMode === "signin" ? "flex-1 bg-[#1B2A4A] hover:bg-[#152238]" : "flex-1"}
                  onClick={() => {
                    setAuthMode("signin");
                    setAuthError(null);
                  }}
                >
                  Sign in
                </Button>
                <Button
                  type="button"
                  variant={authMode === "register" ? "default" : "outline"}
                  className={
                    authMode === "register" ? "flex-1 bg-[#1B2A4A] hover:bg-[#152238]" : "flex-1"
                  }
                  onClick={() => {
                    setAuthMode("register");
                    setAuthError(null);
                  }}
                >
                  Create account
                </Button>
              </div>

              {authMode === "signin" ? (
                <form className="space-y-3 text-left" onSubmit={(e) => void handleSignIn(e)}>
                  <div className="space-y-2">
                    <Label htmlFor="invite-email">Email</Label>
                    <Input id="invite-email" type="email" value={invite.email} readOnly disabled />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-password">Password</Label>
                    <Input
                      id="invite-password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  {authError ? (
                    <p className="text-sm text-destructive" role="alert">
                      {authError}
                    </p>
                  ) : null}
                  <Button
                    type="submit"
                    className="w-full bg-[#1B2A4A] hover:bg-[#152238]"
                    disabled={authSubmitting}
                  >
                    {authSubmitting ? "Signing in…" : "Sign in & open calendar"}
                  </Button>
                </form>
              ) : (
                <form className="space-y-3 text-left" onSubmit={(e) => void handleRegister(e)}>
                  <div className="space-y-2">
                    <Label htmlFor="invite-reg-name">Full name</Label>
                    <Input
                      id="invite-reg-name"
                      type="text"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-reg-email">Email</Label>
                    <Input id="invite-reg-email" type="email" value={invite.email} readOnly disabled />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-reg-password">Password</Label>
                    <Input
                      id="invite-reg-password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-reg-confirm">Confirm password</Label>
                    <Input
                      id="invite-reg-confirm"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                  {authError ? (
                    <p className="text-sm text-destructive" role="alert">
                      {authError}
                    </p>
                  ) : null}
                  <Button
                    type="submit"
                    className="w-full bg-[#1B2A4A] hover:bg-[#152238]"
                    disabled={authSubmitting}
                  >
                    {authSubmitting ? "Creating account…" : "Create account & open calendar"}
                  </Button>
                </form>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
