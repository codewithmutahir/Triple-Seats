interface SaveIndicatorProps {
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
}

export function SaveIndicator({ isPending, isSuccess, isError }: SaveIndicatorProps) {
  if (!isPending && !isSuccess && !isError) return null;

  return (
    <div
      className="fixed bottom-4 left-72 flex items-center gap-2 text-xs text-muted-foreground transition-all duration-300"
      role="status"
      aria-live="polite"
    >
      {isPending ? (
        <>
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400" />
          <span>Saving...</span>
        </>
      ) : null}
      {isSuccess && !isPending ? (
        <>
          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
          <span className="text-green-600">Saved</span>
        </>
      ) : null}
      {isError && !isPending ? (
        <>
          <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
          <span className="text-red-600">Save failed</span>
        </>
      ) : null}
    </div>
  );
}
