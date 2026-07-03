"use client";

import { useEffect } from "react";

import { ErrorFallback } from "@/components/error-fallback";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorFallback
      title="Something went wrong"
      message="We hit an unexpected problem loading this page. Please try again."
      onRetry={reset}
    />
  );
}
