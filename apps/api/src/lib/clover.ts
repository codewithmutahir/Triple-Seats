import { createHmac, timingSafeEqual } from "node:crypto";

import { prisma } from "@tripeseats/database";

import { decryptSecret } from "./secret-crypto";

export type CloverCheckoutSession = {
  href: string;
  checkoutSessionId: string;
  createdTime: number;
  expirationTime: number;
};

export type CreateCloverCheckoutInput = {
  amountDollars: number;
  lineName: string;
  lineNote?: string;
  customer?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
  };
};

export type CloverRuntimeConfig = {
  apiBaseUrl: string;
  merchantId: string;
  privateKey: string;
  webhookSecret: string;
  configured: boolean;
  source: "caterer" | "env" | "none";
};

function envCloverConfig(): CloverRuntimeConfig {
  const apiBaseUrl = (process.env.CLOVER_API_BASE_URL ?? "https://api.clover.com").replace(
    /\/+$/,
    ""
  );
  const merchantId = process.env.CLOVER_MERCHANT_ID?.trim() ?? "";
  const privateKey = process.env.CLOVER_ECOMMERCE_PRIVATE_KEY?.trim() ?? "";
  const webhookSecret = process.env.CLOVER_WEBHOOK_SECRET?.trim() ?? "";
  return {
    apiBaseUrl,
    merchantId,
    privateKey,
    webhookSecret,
    configured: Boolean(merchantId && privateKey),
    source: merchantId && privateKey ? "env" : "none"
  };
}

/** Legacy env-only config (fallback / tests). Prefer resolveCloverConfigForCaterer. */
export function getCloverConfig(): CloverRuntimeConfig {
  return envCloverConfig();
}

/** Resolve Clover credentials for a caterer; falls back to process env if unset. */
export async function resolveCloverConfigForCaterer(
  catererId: string
): Promise<CloverRuntimeConfig> {
  const env = envCloverConfig();
  const row = await prisma.caterer.findUnique({
    where: { id: catererId },
    select: {
      cloverMerchantId: true,
      cloverPrivateKeyEnc: true,
      cloverWebhookSecretEnc: true
    }
  });

  const merchantId = row?.cloverMerchantId?.trim() || "";
  const privateKey = decryptSecret(row?.cloverPrivateKeyEnc) || "";
  const webhookSecret = decryptSecret(row?.cloverWebhookSecretEnc) || "";

  if (merchantId && privateKey) {
    return {
      apiBaseUrl: env.apiBaseUrl,
      merchantId,
      privateKey,
      webhookSecret: webhookSecret || env.webhookSecret,
      configured: true,
      source: "caterer"
    };
  }

  return env;
}

/** Find caterer Clover webhook secret by Clover merchant id (Hosted Checkout payload). */
export async function resolveWebhookSecretForMerchant(
  merchantId: string | undefined
): Promise<{ secret: string; catererId: string | null }> {
  const env = envCloverConfig();
  const mid = merchantId?.trim() || "";

  if (mid) {
    const row = await prisma.caterer.findFirst({
      where: { cloverMerchantId: mid },
      select: { id: true, cloverWebhookSecretEnc: true }
    });
    const secret = decryptSecret(row?.cloverWebhookSecretEnc);
    if (secret) return { secret, catererId: row!.id };
  }

  return { secret: env.webhookSecret, catererId: null };
}

export function dollarsToCloverCents(amountDollars: number): number {
  return Math.round(amountDollars * 100);
}

/** Validate Hosted Checkout webhook: `Clover-Signature: t=…,v1=…` */
export function verifyCloverWebhookSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!secret || !signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [k, ...rest] = part.trim().split("=");
      return [k, rest.join("=")];
    })
  ) as { t?: string; v1?: string };

  if (!parts.t || !parts.v1) return false;

  const payload = `${parts.t}.${typeof rawBody === "string" ? rawBody : rawBody.toString("utf8")}`;
  const expected = createHmac("sha256", secret).update(payload, "utf8").digest("hex");

  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(parts.v1, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function createCloverHostedCheckout(
  input: CreateCloverCheckoutInput,
  config?: CloverRuntimeConfig
): Promise<CloverCheckoutSession> {
  const cfg = config ?? getCloverConfig();
  if (!cfg.configured) {
    throw Object.assign(new Error("Clover is not configured."), { status: 503 });
  }

  const cents = dollarsToCloverCents(input.amountDollars);
  if (cents < 1) {
    throw Object.assign(new Error("Amount must be at least $0.01."), { status: 400 });
  }

  const body = {
    customer: input.customer ?? {},
    tips: { enabled: false },
    shoppingCart: {
      lineItems: [
        {
          name: input.lineName.slice(0, 127),
          note: input.lineNote?.slice(0, 255) || undefined,
          price: cents,
          unitQty: 1
        }
      ]
    }
  };

  const res = await fetch(`${cfg.apiBaseUrl}/invoicingcheckoutservice/v1/checkouts`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      Authorization: `Bearer ${cfg.privateKey}`,
      "X-Clover-Merchant-Id": cfg.merchantId
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const message =
      json && typeof json === "object" && "message" in json
        ? String((json as { message: unknown }).message)
        : `Clover checkout failed (${res.status})`;
    if (process.env.NODE_ENV !== "production") {
      console.error("[clover] create checkout failed:", res.status, text.slice(0, 500));
    }
    throw Object.assign(new Error(message), { status: res.status >= 500 ? 502 : 400 });
  }

  const session = json as Partial<CloverCheckoutSession> | null;
  if (!session?.href || !session.checkoutSessionId) {
    throw Object.assign(new Error("Clover returned an invalid checkout session."), { status: 502 });
  }

  return {
    href: session.href,
    checkoutSessionId: session.checkoutSessionId,
    createdTime: Number(session.createdTime) || Date.now(),
    expirationTime: Number(session.expirationTime) || Date.now() + 15 * 60 * 1000
  };
}

export type CloverWebhookPayload = {
  type?: string;
  status?: string;
  id?: string;
  merchantId?: string;
  data?: string;
  message?: string;
};

export function parseCloverWebhookPayload(raw: Buffer | string): CloverWebhookPayload | null {
  try {
    const parsed = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as CloverWebhookPayload;
  } catch {
    return null;
  }
}

export function publicAppOrigin(): string {
  return (
    process.env.WEB_ORIGIN?.trim().replace(/\/+$/, "") ||
    process.env.BETTER_AUTH_URL?.trim().replace(/\/+$/, "") ||
    "http://localhost:3000"
  );
}
