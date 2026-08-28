import { firstZodErrorMessage, passwordSchema } from "@tripeseats/auth";
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { auth } from "../lib/auth";
import { enforcePasswordPolicy } from "../lib/password-auth-hook";
import { handleRouteError } from "../lib/route-errors";
import { getAuthSession, requestToHeaders } from "../lib/session";
import { userHasPassword } from "../lib/user-has-password";

const router = Router();

const setPasswordBodySchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1)
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"]
  });

function errorMessage(err: unknown, fallback: string) {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return fallback;
}

router.get("/password-status", async (req: Request, res: Response) => {
  try {
    const { user } = await getAuthSession(req);
    const hasPassword = await userHasPassword(user.id);
    return res.json({ hasPassword });
  } catch (e) {
    return handleRouteError(res, e, "Password status");
  }
});

router.post("/set-password", async (req: Request, res: Response) => {
  try {
    const { user } = await getAuthSession(req);
    const parsed = setPasswordBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodErrorMessage(parsed.error) });
    }

    if (await userHasPassword(user.id)) {
      return res.status(400).json({ error: "Password is already set. Use Settings to change it." });
    }

    try {
      await enforcePasswordPolicy(parsed.data.password);
    } catch (e) {
      return res.status(400).json({ error: errorMessage(e, "Invalid password.") });
    }

    try {
      await auth.api.setPassword({
        body: { newPassword: parsed.data.password },
        headers: requestToHeaders(req)
      });
    } catch (e) {
      return res.status(400).json({ error: errorMessage(e, "Could not set password.") });
    }

    return res.json({ ok: true, hasPassword: true });
  } catch (e) {
    return handleRouteError(res, e, "Set password");
  }
});

export { router as accountRouter };
