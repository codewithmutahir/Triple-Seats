import {
  firstZodErrorMessage,
  isPasswordBreached,
  PASSWORD_BREACH_MESSAGE,
  passwordSchema,
  signUpBodySchema
} from "@tripeseats/auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

const PASSWORD_PATHS = new Set(["/sign-up/email", "/reset-password", "/change-password"]);

function passwordFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.password === "string") return record.password;
  if (typeof record.newPassword === "string") return record.newPassword;
  return null;
}

async function enforcePasswordPolicy(password: string): Promise<void> {
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    throw new APIError("BAD_REQUEST", {
      message: firstZodErrorMessage(parsed.error)
    });
  }

  const breached = await isPasswordBreached(password);
  if (breached) {
    throw new APIError("BAD_REQUEST", {
      message: PASSWORD_BREACH_MESSAGE
    });
  }
}

/** Validates sign-up payloads and rejects weak or breached passwords on auth endpoints. */
export const passwordSecurityBeforeHook = createAuthMiddleware(async (ctx) => {
  if (ctx.path === "/sign-up/email") {
    const parsed = signUpBodySchema.safeParse(ctx.body);
    if (!parsed.success) {
      throw new APIError("BAD_REQUEST", {
        message: firstZodErrorMessage(parsed.error)
      });
    }
    await enforcePasswordPolicy(parsed.data.password);
    return;
  }

  if (!PASSWORD_PATHS.has(ctx.path)) return;

  const password = passwordFromBody(ctx.body);
  if (!password) return;

  await enforcePasswordPolicy(password);
});
