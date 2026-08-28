"use client";

import { Loader2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { signOut, useSession } from "@/lib/auth-client";

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

export default function InviteAcceptPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const { data: session, isPending: sessionLoading, refetch } = useSession();
  const autoAcceptStarted = useRef(false);
  const autoMagicSent = useRef(false);

  const [invite, setInvite] = useState<{
    email: string;
    role: string;
    catererName: string;
    expiresAt: string;
    willLimitToCalendarOnly?: boolean;
    existingAccountHasFullAccess?: boolean;
    accountExists?: boolean;
    hasPassword?: boolean;
    magicLinkExpiresMinutes?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acknowledgeLimitedAccess, setAcknowledgeLimitedAccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [useSetupForm, setUseSetupForm] = useState<boolean | null>(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkSending, setMagicLinkSending] = useState(false);

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

  const isSetupFlow = useSetupForm ?? !invite?.accountExists;
  const isVendorInvite = invite?.role === "calendar_only";
  const magicMinutes = invite?.magicLinkExpiresMinutes ?? 15;

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
          existingAccountHasFullAccess: data.existingAccountHasFullAccess,
          accountExists: data.accountExists,
          hasPassword: data.hasPassword,
          magicLinkExpiresMinutes: data.magicLinkExpiresMinutes
        });
        setUseSetupForm(!data.accountExists);
        const preferPassword = Boolean(data.accountExists && data.hasPassword);
        setShowPasswordForm(
          preferPassword ||
            (typeof window !== "undefined" &&
              new URLSearchParams(window.location.search).get("password") === "1")
        );
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("magicError") !== "1") return;
    toast.error("That sign-in link expired. We're sending you a fresh one.");
  }, []);

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

  const sendMagicLink = useCallback(async () => {
    setFormError(null);
    setMagicLinkSending(true);
    try {
      await api.invite.sendMagicLink(params.token);
      setMagicLinkSent(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not send sign-in link.");
    } finally {
      setMagicLinkSending(false);
    }
  }, [params.token]);

  useEffect(() => {
    if (loading || sessionLoading || !invite) return;
    if (emailMatches) return;
    if (invite.accountExists && invite.hasPassword) return;
    if (autoMagicSent.current || magicLinkSent || magicLinkSending) return;
    autoMagicSent.current = true;
    void sendMagicLink();
  }, [loading, sessionLoading, invite, emailMatches, magicLinkSent, magicLinkSending, sendMagicLink]);

  useEffect(() => {
    if (loading || sessionLoading || !invite || !emailMatches) return;
    if (requiresManualAccept) return;
    if (autoAcceptStarted.current || accepting) return;
    autoAcceptStarted.current = true;
    void acceptInvite();
  }, [
    loading,
    sessionLoading,
    invite,
    emailMatches,
    accepting,
    acceptInvite,
    requiresManualAccept
  ]);

  async function continueAsInvitedEmail() {
    if (!invite) return;
    setSwitchingAccount(true);
    setFormError(null);
    try {
      await signOut();
      await refetch();
      autoAcceptStarted.current = false;
      autoMagicSent.current = false;
      await api.invite.sendMagicLink(params.token);
      setMagicLinkSent(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not continue with this email.");
    } finally {
      setSwitchingAccount(false);
    }
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    if (!invite) return;
    setFormError(null);

    if (isSetupFlow && password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }
    if (requiresManualAccept && !acknowledgeLimitedAccess) {
      setFormError("Please confirm you understand your dashboard access will change.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.invite.complete(params.token, {
        password,
        name: isSetupFlow ? name.trim() || undefined : undefined,
        acknowledgeLimitedAccess: requiresManualAccept ? true : undefined
      });
      router.push(res.redirect ?? redirectTarget);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
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

  const showWrongAccount = session?.user && !emailMatches;
  const showOpening = emailMatches && !requiresManualAccept && (accepting || autoAcceptStarted.current);
  const showManualAccept = emailMatches && requiresManualAccept && !showOpening;
  const showExistingPasswordSignIn =
    Boolean(invite.accountExists && invite.hasPassword) && !emailMatches && !showWrongAccount && !showOpening;
  const showMagicLinkWait =
    !emailMatches && !showWrongAccount && !showOpening && !showExistingPasswordSignIn;

  const title = isVendorInvite ? "Open your vendor calendar" : `Join ${invite.catererName}`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <p className="font-heading text-2xl font-semibold text-[#1B2A4A]">Tripeseats</p>
          <CardTitle className="mt-4 text-xl font-normal">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {!isVendorInvite ? (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Role</p>
              <Badge className="mt-1 capitalize">{invite.role}</Badge>
            </div>
          ) : null}
          {invite.existingAccountHasFullAccess && isVendorInvite ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-medium">This email already has a Tripeseats account.</p>
              <p className="mt-1">
                After you sign in, your dashboard will switch to <strong>vendor calendar only</strong>.
              </p>
            </div>
          ) : null}

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
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <p>
                  You&apos;re signed in as <strong>{signedInEmail}</strong>. This invitation is for{" "}
                  <strong>{invite.email}</strong>.
                </p>
              </div>
              {formError ? (
                <p className="text-sm text-destructive" role="alert">
                  {formError}
                </p>
              ) : null}
              <Button
                type="button"
                className="w-full bg-[#1B2A4A] hover:bg-[#152238]"
                disabled={switchingAccount}
                onClick={() => void continueAsInvitedEmail()}
              >
                {switchingAccount ? "Sending link…" : `Email sign-in link to ${invite.email}`}
              </Button>
            </div>
          ) : showManualAccept ? (
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <p className="text-center text-sm text-muted-foreground">
                Signed in as <strong>{signedInEmail}</strong>
              </p>
              <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <Checkbox
                  id="invite-ack"
                  checked={acknowledgeLimitedAccess}
                  onCheckedChange={(v) => setAcknowledgeLimitedAccess(v === true)}
                />
                <Label htmlFor="invite-ack" className="text-sm font-normal leading-snug">
                  I understand my dashboard will show vendor calendar only.
                </Label>
              </div>
              <Button
                type="button"
                className="w-full bg-[#1B2A4A] hover:bg-[#152238]"
                disabled={accepting || !acknowledgeLimitedAccess}
                onClick={() => void acceptInvite()}
              >
                {accepting ? "Opening calendar…" : "Continue to vendor calendar"}
              </Button>
            </div>
          ) : showExistingPasswordSignIn ? (
            <div className="space-y-4 border-t border-slate-100 pt-4">
              <p className="text-center text-sm text-muted-foreground">
                Sign in with your existing password for <strong>{invite.email}</strong>.
              </p>
              <form className="space-y-4" onSubmit={(e) => void handleComplete(e)}>
                <div className="space-y-2">
                  <Label htmlFor="invite-password-existing">Password</Label>
                  <Input
                    id="invite-password-existing"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {requiresManualAccept ? (
                  <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <Checkbox
                      id="invite-ack-existing"
                      checked={acknowledgeLimitedAccess}
                      onCheckedChange={(v) => setAcknowledgeLimitedAccess(v === true)}
                    />
                    <Label htmlFor="invite-ack-existing" className="text-sm font-normal leading-snug">
                      I understand my dashboard will show vendor calendar only.
                    </Label>
                  </div>
                ) : null}
                {formError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {formError}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  className="w-full bg-[#1B2A4A] hover:bg-[#152238]"
                  disabled={submitting || (requiresManualAccept && !acknowledgeLimitedAccess)}
                >
                  {submitting ? "Signing in…" : "Continue with password"}
                </Button>
              </form>
              {magicLinkSent ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
                  Check your email for a sign-in link to <strong>{invite.email}</strong>.
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={magicLinkSending}
                  onClick={() => void sendMagicLink()}
                >
                  {magicLinkSending ? "Sending link…" : "Email me a sign-in link instead"}
                </Button>
              )}
            </div>
          ) : showMagicLinkWait ? (
            <div className="space-y-4 border-t border-slate-100 pt-4">
              {magicLinkSending && !magicLinkSent ? (
                <div className="flex flex-col items-center gap-2 py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-[#1B2A4A]" />
                  <p className="text-sm text-muted-foreground">Sending your sign-in link…</p>
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-center text-sm text-emerald-950">
                  <Mail className="mx-auto mb-2 h-5 w-5" />
                  <p className="font-medium">Check your email</p>
                  <p className="mt-1">
                    We sent a one-click sign-in link to <strong>{invite.email}</strong>. It expires in{" "}
                    {magicMinutes} minutes.
                  </p>
                  <p className="mt-2 text-emerald-900/80">Click the link in that email to open your calendar.</p>
                </div>
              )}
              {formError ? (
                <p className="text-sm text-destructive" role="alert">
                  {formError}
                </p>
              ) : null}
              {magicLinkSent ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={magicLinkSending}
                  onClick={() => void sendMagicLink()}
                >
                  {magicLinkSending ? "Sending…" : "Resend sign-in link"}
                </Button>
              ) : null}
              {!isVendorInvite || showPasswordForm ? (
                <button
                  type="button"
                  className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => setShowPasswordForm(true)}
                >
                  Use a password instead
                </button>
              ) : null}
              {showPasswordForm ? (
                <form className="space-y-4 border-t border-slate-100 pt-4" onSubmit={(e) => void handleComplete(e)}>
                  {isSetupFlow ? (
                    <div className="space-y-2">
                      <Label htmlFor="invite-name">Full name</Label>
                      <Input
                        id="invite-name"
                        type="text"
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                      />
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <Label htmlFor="invite-password">{isSetupFlow ? "Choose a password" : "Password"}</Label>
                    <Input
                      id="invite-password"
                      type="password"
                      autoComplete={isSetupFlow ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  {isSetupFlow ? (
                    <div className="space-y-2">
                      <Label htmlFor="invite-confirm">Confirm password</Label>
                      <Input
                        id="invite-confirm"
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                    </div>
                  ) : null}
                  {requiresManualAccept ? (
                    <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <Checkbox
                        id="invite-ack-setup"
                        checked={acknowledgeLimitedAccess}
                        onCheckedChange={(v) => setAcknowledgeLimitedAccess(v === true)}
                      />
                      <Label htmlFor="invite-ack-setup" className="text-sm font-normal leading-snug">
                        I understand my dashboard will show vendor calendar only.
                      </Label>
                    </div>
                  ) : null}
                  <Button
                    type="submit"
                    className="w-full bg-[#1B2A4A] hover:bg-[#152238]"
                    disabled={submitting || (requiresManualAccept && !acknowledgeLimitedAccess)}
                  >
                    {submitting ? "Setting up…" : "Continue with password"}
                  </Button>
                </form>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
