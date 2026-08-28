"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { signOut, useSession } from "@/lib/auth-client";

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

export default function InviteContinuePage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const { data: session, isPending: sessionLoading, refetch } = useSession();
  const autoAcceptStarted = useRef(false);

  const [invite, setInvite] = useState<{
    email: string;
    role: string;
    existingAccountHasFullAccess?: boolean;
    willLimitToCalendarOnly?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledgeLimitedAccess, setAcknowledgeLimitedAccess] = useState(false);

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
          existingAccountHasFullAccess: data.existingAccountHasFullAccess,
          willLimitToCalendarOnly: data.willLimitToCalendarOnly
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Invitation not found";
        setError(message);
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
      toast.error(e instanceof Error ? e.message : "Failed to finish setup");
    } finally {
      setAccepting(false);
    }
  }, [params.token, redirectTarget, router]);

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

  if (loading || sessionLoading) {
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
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => router.push(`/invite/${params.token}`)}
            >
              Back to invitation
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-xl font-normal">Sign-in link expired</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Request a new email link from your invitation page.
            </p>
            <Button
              type="button"
              className="w-full bg-[#1B2A4A] hover:bg-[#152238]"
              onClick={() => router.push(`/invite/${params.token}`)}
            >
              Back to invitation
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!emailMatches) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 py-8 text-center">
            <p className="text-sm text-amber-950">
              Signed in as <strong>{signedInEmail}</strong>, but this invitation is for{" "}
              <strong>{invite.email}</strong>.
            </p>
            <Button
              type="button"
              className="w-full bg-[#1B2A4A] hover:bg-[#152238]"
              onClick={async () => {
                await signOut();
                await refetch();
                router.push(`/invite/${params.token}`);
              }}
            >
              Continue as {invite.email}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (requiresManualAccept) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-xl font-normal">One more step</CardTitle>
            <p className="text-sm text-muted-foreground">
              Your dashboard will switch to vendor calendar only.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <Checkbox
                id="continue-ack"
                checked={acknowledgeLimitedAccess}
                onCheckedChange={(v) => setAcknowledgeLimitedAccess(v === true)}
              />
              <Label htmlFor="continue-ack" className="text-sm font-normal leading-snug">
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
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-[#1B2A4A]" />
        <p className="text-sm font-medium text-[#1B2A4A]">Opening your calendar…</p>
      </div>
    </div>
  );
}
