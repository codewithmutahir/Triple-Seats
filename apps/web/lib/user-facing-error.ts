const TECHNICAL_PATTERN =
  /LEAD_INTAKE|PUBLIC_ROOT|BETTER_AUTH|INTERNAL_API|DATABASE_URL|apps\/api|\.env/i;

const GENERIC_STATUS_MESSAGES: Record<number, string> = {
  400: "Something was wrong with your request. Please check your input and try again.",
  401: "Please sign in again.",
  403: "You don't have permission to do that.",
  404: "We couldn't find what you were looking for.",
  409: "This action couldn't be completed because of a conflict. Please try again.",
  502: "We couldn't reach the server. Please try again.",
  503: "This feature isn't available right now. Please try again later.",
  504: "The request took too long. Please try again."
};

const RAW_STATUS_TEXT = new Set([
  "internal server error",
  "unauthorized",
  "bad gateway",
  "gateway timeout",
  "service unavailable",
  "forbidden",
  "not found",
  "bad request",
  "request failed"
]);

function defaultForStatus(status?: number): string {
  if (status != null && GENERIC_STATUS_MESSAGES[status]) {
    return GENERIC_STATUS_MESSAGES[status]!;
  }
  if (status != null && status >= 500) {
    return "Something went wrong. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

function isTechnicalMessage(message: string): boolean {
  return TECHNICAL_PATTERN.test(message);
}

function isRawStatusText(message: string): boolean {
  return RAW_STATUS_TEXT.has(message.trim().toLowerCase());
}

/** Maps API/proxy error payloads to a safe user-visible string. */
export function parseApiError(
  body: { error?: string } | string | null | undefined,
  status?: number,
  statusText?: string
): string {
  let raw: string | undefined;

  if (typeof body === "string") {
    raw = body.trim() || undefined;
  } else if (body && typeof body.error === "string") {
    raw = body.error.trim() || undefined;
  }

  if (raw && !isTechnicalMessage(raw) && !isRawStatusText(raw)) {
    return raw;
  }

  if (statusText && !isRawStatusText(statusText) && !isTechnicalMessage(statusText)) {
    return statusText;
  }

  return defaultForStatus(status);
}

const SAFE_AUTH_PATTERNS = [
  /invalid (email|password|credentials)/i,
  /incorrect (email|password|credentials)/i,
  /user (already exists|not found)/i,
  /email (already|is) (in use|taken|registered)/i,
  /password/i,
  /too many/i,
  /data breach/i,
  /backup code/i,
  /two.?factor|2fa|totp|authenticator/i,
  /locked/i
];

function isSafeAuthMessage(message: string): boolean {
  if (isTechnicalMessage(message) || isRawStatusText(message)) return false;
  return SAFE_AUTH_PATTERNS.some((p) => p.test(message));
}

/** Maps Better Auth client errors to user-safe copy. */
export function parseAuthError(message: string | undefined, kind: "signIn" | "signUp"): string {
  const trimmed = message?.trim();
  if (trimmed && isSafeAuthMessage(trimmed)) {
    return trimmed;
  }
  if (kind === "signIn") {
    return "Sign in failed. Check your email and password.";
  }
  return "Could not create your account. Please try again.";
}
