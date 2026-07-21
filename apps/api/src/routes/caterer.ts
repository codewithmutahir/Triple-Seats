import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { getAuthorizedSession } from "../lib/authorized-session";
import { publicAppOrigin, resolveCloverConfigForCaterer } from "../lib/clover";
import { decryptSecret, encryptSecret, maskSecretHint } from "../lib/secret-crypto";
import { handleRouteError } from "../lib/route-errors";
import { timer } from "../lib/perf";

const router = Router();

function serializeCaterer(caterer: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  timezone: string | null;
  currencyCode: string;
  websiteUrl: string | null;
  slug: string | null;
}) {
  return {
    id: caterer.id,
    name: caterer.name,
    email: caterer.email,
    phone: caterer.phone,
    timezone: caterer.timezone,
    currencyCode: caterer.currencyCode,
    websiteUrl: caterer.websiteUrl,
    slug: caterer.slug,
  };
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const perf = timer("caterer:get");
    const { caterer } = await getAuthorizedSession(req, "settings:read");
    perf.step("session");

    const full = await prisma.caterer.findUnique({
      where: { id: caterer.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        timezone: true,
        currencyCode: true,
        websiteUrl: true,
        slug: true,
      },
    });

    if (!full) {
      return res.status(404).json({ error: "Caterer not found" });
    }

    perf.step("db:caterer");
    perf.end();

    return res.json({ caterer: serializeCaterer(full) });
  } catch (e) {
    return handleRouteError(res, e, "Caterer");
  }
});

router.patch("/", async (req: Request, res: Response) => {
  try {
    const perf = timer("caterer:patch");
    const { caterer } = await getAuthorizedSession(req, "settings:write");
    perf.step("session");

    const body = req.body as {
      name?: string;
      email?: string;
      phone?: string | null;
      timezone?: string | null;
      currencyCode?: string;
      websiteUrl?: string | null;
    };

    const updateData: {
      name?: string;
      email?: string;
      phone?: string | null;
      timezone?: string | null;
      currencyCode?: string;
      websiteUrl?: string | null;
    } = {};

    if (body.name !== undefined) {
      const name = body.name?.trim();
      if (!name) {
        return res.status(400).json({ error: "Name cannot be empty" });
      }
      updateData.name = name;
    }

    if (body.email !== undefined) {
      const email = body.email?.trim().toLowerCase();
      if (!email || !email.includes("@")) {
        return res.status(400).json({ error: "Valid email is required" });
      }
      const existing = await prisma.caterer.findFirst({
        where: { email, id: { not: caterer.id } },
      });
      if (existing) {
        return res.status(409).json({ error: "Email already in use" });
      }
      updateData.email = email;
    }

    if (body.phone !== undefined) {
      updateData.phone = body.phone?.trim() || null;
    }

    if (body.timezone !== undefined) {
      updateData.timezone = body.timezone?.trim() || null;
    }

    if (body.currencyCode !== undefined) {
      const code = body.currencyCode?.trim().toUpperCase();
      if (code && code.length === 3) {
        updateData.currencyCode = code;
      }
    }

    if (body.websiteUrl !== undefined) {
      updateData.websiteUrl = body.websiteUrl?.trim() || null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const updated = await prisma.caterer.update({
      where: { id: caterer.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        timezone: true,
        currencyCode: true,
        websiteUrl: true,
        slug: true,
      },
    });

    perf.step("db:update");
    perf.end();

    return res.json({ caterer: serializeCaterer(updated) });
  } catch (e) {
    return handleRouteError(res, e, "Caterer");
  }
});

function cloverSetupUrls() {
  const origin = publicAppOrigin();
  return {
    webhookUrl: `${origin}/api/webhooks/clover`,
    successUrl: `${origin}/pay/success`,
    failureUrl: `${origin}/pay/failure`,
    cancelUrl: `${origin}/pay/cancel`
  };
}

router.get("/clover", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "settings:read");
    const row = await prisma.caterer.findUnique({
      where: { id: caterer.id },
      select: {
        cloverMerchantId: true,
        cloverPrivateKeyEnc: true,
        cloverWebhookSecretEnc: true,
        cloverPublicKey: true,
        cloverConnectedAt: true,
        cloverRefreshTokenEnc: true
      }
    });
    if (!row) {
      return res.status(404).json({ error: "Caterer not found" });
    }

    const runtime = await resolveCloverConfigForCaterer(caterer.id);
    const privateKey = decryptSecret(row.cloverPrivateKeyEnc);
    const webhookSecret = decryptSecret(row.cloverWebhookSecretEnc);
    const oauthConnected = Boolean(row.cloverRefreshTokenEnc);

    return res.json({
      clover: {
        connected: Boolean(row.cloverMerchantId && row.cloverPrivateKeyEnc),
        configured: runtime.configured,
        source: runtime.source,
        oauthConnected,
        oauthAvailable: Boolean(
          process.env.CLOVER_APP_ID?.trim() && process.env.CLOVER_APP_SECRET?.trim()
        ),
        merchantId: row.cloverMerchantId,
        publicKey: row.cloverPublicKey,
        hasPrivateKey: Boolean(row.cloverPrivateKeyEnc),
        hasWebhookSecret: Boolean(row.cloverWebhookSecretEnc),
        privateKeyHint: maskSecretHint(privateKey),
        webhookSecretHint: maskSecretHint(webhookSecret),
        connectedAt: row.cloverConnectedAt?.toISOString() ?? null,
        ...cloverSetupUrls()
      }
    });
  } catch (e) {
    return handleRouteError(res, e, "CatererClover");
  }
});

router.put("/clover", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "settings:write");
    const body = (req.body ?? {}) as Record<string, unknown>;

    const merchantId =
      typeof body.merchantId === "string" ? body.merchantId.trim() : undefined;
    const privateKey =
      typeof body.privateKey === "string" ? body.privateKey.trim() : undefined;
    const webhookSecret =
      typeof body.webhookSecret === "string" ? body.webhookSecret.trim() : undefined;
    const publicKey =
      typeof body.publicKey === "string" ? body.publicKey.trim() : undefined;

    const existing = await prisma.caterer.findUnique({
      where: { id: caterer.id },
      select: {
        cloverMerchantId: true,
        cloverPrivateKeyEnc: true,
        cloverWebhookSecretEnc: true,
        cloverPublicKey: true
      }
    });
    if (!existing) {
      return res.status(404).json({ error: "Caterer not found" });
    }

    const nextMerchantId =
      merchantId !== undefined ? merchantId || null : existing.cloverMerchantId;
    const nextPrivateEnc =
      privateKey !== undefined
        ? encryptSecret(privateKey) ?? existing.cloverPrivateKeyEnc
        : existing.cloverPrivateKeyEnc;
    // Allow clearing webhook with empty string when explicitly sent
    const nextWebhookEnc =
      webhookSecret !== undefined
        ? webhookSecret
          ? encryptSecret(webhookSecret)
          : null
        : existing.cloverWebhookSecretEnc;
    const nextPublicKey =
      publicKey !== undefined ? publicKey || null : existing.cloverPublicKey;

    if (!nextMerchantId || !nextPrivateEnc) {
      return res.status(400).json({
        error: "Merchant ID and Hosted Checkout private token are required."
      });
    }

    // Unique merchant binding across caterers
    const clash = await prisma.caterer.findFirst({
      where: {
        cloverMerchantId: nextMerchantId,
        id: { not: caterer.id }
      },
      select: { id: true }
    });
    if (clash) {
      return res.status(409).json({
        error: "This Clover merchant ID is already connected to another account."
      });
    }

    await prisma.caterer.update({
      where: { id: caterer.id },
      data: {
        cloverMerchantId: nextMerchantId,
        cloverPrivateKeyEnc: nextPrivateEnc,
        cloverWebhookSecretEnc: nextWebhookEnc,
        cloverPublicKey: nextPublicKey,
        cloverConnectedAt: new Date(),
        // Manual keys replace OAuth session
        cloverRefreshTokenEnc: null,
        cloverAccessTokenExpiresAt: null
      }
    });

    const runtime = await resolveCloverConfigForCaterer(caterer.id);
    return res.json({
      clover: {
        connected: true,
        configured: runtime.configured,
        source: runtime.source,
        oauthConnected: false,
        oauthAvailable: Boolean(
          process.env.CLOVER_APP_ID?.trim() && process.env.CLOVER_APP_SECRET?.trim()
        ),
        merchantId: nextMerchantId,
        publicKey: nextPublicKey,
        hasPrivateKey: true,
        hasWebhookSecret: Boolean(nextWebhookEnc),
        privateKeyHint: maskSecretHint(decryptSecret(nextPrivateEnc)),
        webhookSecretHint: maskSecretHint(decryptSecret(nextWebhookEnc)),
        connectedAt: new Date().toISOString(),
        ...cloverSetupUrls()
      }
    });
  } catch (e) {
    return handleRouteError(res, e, "CatererClover");
  }
});

router.delete("/clover", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "settings:write");
    await prisma.caterer.update({
      where: { id: caterer.id },
      data: {
        cloverMerchantId: null,
        cloverPrivateKeyEnc: null,
        cloverWebhookSecretEnc: null,
        cloverPublicKey: null,
        cloverConnectedAt: null,
        cloverRefreshTokenEnc: null,
        cloverAccessTokenExpiresAt: null
      }
    });
    const runtime = await resolveCloverConfigForCaterer(caterer.id);
    return res.json({
      ok: true,
      clover: {
        connected: false,
        configured: runtime.configured,
        source: runtime.source,
        oauthConnected: false,
        oauthAvailable: Boolean(
          process.env.CLOVER_APP_ID?.trim() && process.env.CLOVER_APP_SECRET?.trim()
        ),
        merchantId: null,
        publicKey: null,
        hasPrivateKey: false,
        hasWebhookSecret: false,
        privateKeyHint: null,
        webhookSecretHint: null,
        connectedAt: null,
        ...cloverSetupUrls()
      }
    });
  } catch (e) {
    return handleRouteError(res, e, "CatererClover");
  }
});

export const catererRouter = router;
