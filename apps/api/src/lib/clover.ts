import { createHmac, timingSafeEqual } from "node:crypto";

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

export function getCloverConfig() {
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
    configured: Boolean(merchantId && privateKey)
  };
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
  input: CreateCloverCheckoutInput
): Promise<CloverCheckoutSession> {
  const { apiBaseUrl, merchantId, privateKey, configured } = getCloverConfig();
  if (!configured) {
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

  const res = await fetch(`${apiBaseUrl}/invoicingcheckoutservice/v1/checkouts`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      Authorization: `Bearer ${privateKey}`,
      "X-Clover-Merchant-Id": merchantId
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
