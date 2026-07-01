"use client";

import { Copy, ExternalLink, Link2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { tenantUrls } from "@/lib/tenant-host";

type CatererProfile = {
  name: string;
  slug: string;
  bookUrl: string | null;
  dashboardUrl: string | null;
};

function resolveBookUrl(profile: CatererProfile | null): string | null {
  if (!profile?.slug) return profile?.bookUrl ?? null;
  return profile.bookUrl ?? tenantUrls(profile.slug).bookUrl;
}

export function BookingLinkCard() {
  const [profile, setProfile] = useState<CatererProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const bookUrl = useMemo(() => resolveBookUrl(profile), [profile]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/profile", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as CatererProfile;
        if (!cancelled) setProfile(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const copyUrl = useCallback(async () => {
    if (!bookUrl) return;
    await navigator.clipboard.writeText(bookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [bookUrl]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!bookUrl) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-lg">
            <Link2 className="h-5 w-5 text-primary" aria-hidden />
            Your booking link
          </CardTitle>
          <CardDescription>
            Your booking link isn&apos;t ready yet. Refresh the page, or contact support if this
            continues.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-lg">
          <Link2 className="h-5 w-5 text-primary" aria-hidden />
          Your booking link
        </CardTitle>
        <CardDescription>
          Share this link with clients — inquiries go straight to your dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input readOnly value={bookUrl} className="font-mono text-sm" aria-label="Booking URL" />
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" onClick={() => void copyUrl()}>
            <Copy className="mr-2 h-4 w-4" aria-hidden />
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button type="button" variant="secondary" asChild>
            <a href={bookUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
              Open
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
