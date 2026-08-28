"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth-client";

export default function InviteAcceptPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = useSession();
  const [invite, setInvite] = useState<{
    email: string;
    role: string;
    catererName: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await api.invite.get(params.token);
        setInvite({ email: data.email, role: data.role, catererName: data.catererName });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Invitation not found");
      } finally {
        setLoading(false);
      }
    })();
  }, [params.token]);

  async function acceptInvite() {
    setAccepting(true);
    try {
      const res = await api.invite.accept(params.token);
      toast.success("Invitation accepted");
      router.push(res.redirect ?? "/dashboard");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to accept invitation");
    } finally {
      setAccepting(false);
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
            <Button className="mt-4" asChild>
              <Link href="/login">Go to login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
        <CardContent className="space-y-6 text-center">
          <div>
            <p className="text-sm text-muted-foreground">Role</p>
            <Badge className="mt-1 capitalize">
              {invite.role === "calendar_only" ? "Vendor Calendar" : invite.role}
            </Badge>
          </div>
          {invite.role === "calendar_only" ? (
            <p className="text-sm text-muted-foreground">
              For {invite.catererName}. You&apos;ll only have access to your vendor calendar — not
              leads, bookings, or settings.
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">Invitation for {invite.email}</p>

          {sessionLoading ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
          ) : session?.user ? (
            <Button type="button" className="w-full" disabled={accepting} onClick={() => void acceptInvite()}>
              {accepting ? "Accepting…" : "Accept Invitation"}
            </Button>
          ) : (
            <div className="space-y-2">
              <Button className="w-full" asChild>
                <Link href={`/login?redirect=/invite/${params.token}`}>Sign in to accept</Link>
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <Link href={`/register?redirect=/invite/${params.token}`}>Create account</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
