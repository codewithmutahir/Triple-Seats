"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { ErrorFallback } from "@/components/error-fallback";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <ErrorFallback
          title="Tripeseats ran into a problem"
          message="The app hit an unexpected error. Try again or return to the home page."
          onRetry={reset}
        />
      </body>
    </html>
  );
}
