"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ErrorFallbackProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  homeHref?: string;
  homeLabel?: string;
};

export function ErrorFallback({
  title = "Something went wrong",
  message = "We hit an unexpected problem. Please try again.",
  onRetry,
  homeHref = "/",
  homeLabel = "Go home"
}: ErrorFallbackProps) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <Card className="w-full max-w-lg border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle className="font-heading text-lg text-destructive">{title}</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {onRetry ? (
            <Button type="button" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
          <Button type="button" variant="outline" asChild>
            <Link href={homeHref}>{homeLabel}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
