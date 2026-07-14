import { prisma } from "@tripeseats/database";
import type { Request, Response } from "express";

import {
  parseCloverWebhookPayload,
  resolveWebhookSecretForMerchant,
  verifyCloverWebhookSignature
} from "../lib/clover";
import { decryptSecret } from "../lib/secret-crypto";

function header(req: Request, name: string): string | undefined {
  const raw = req.headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0];
  return typeof raw === "string" ? raw : undefined;
}

/** Clover Hosted Checkout payment webhook (+ URL verification probes). */
export async function handleCloverWebhook(req: Request, res: Response) {
  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === "string" ? req.body : "", "utf8");

    // URL verification / TEST URL often has empty or unsigned body — acknowledge with 200.
    if (rawBody.length === 0) {
      return res.status(200).json({ ok: true });
    }

    const payload = parseCloverWebhookPayload(rawBody);
    const signature =
      header(req, "clover-signature") ??
      header(req, "Clover-Signature") ??
      header(req, "x-clover-signature");

    const sessionId = typeof payload?.data === "string" ? payload.data.trim() : "";

    // Prefer secret from payment's caterer, then merchantId map, then env.
    let webhookSecret = "";
    if (sessionId) {
      const payment = await prisma.payment.findFirst({
        where: { checkoutSessionId: sessionId },
        select: {
          caterer: {
            select: { cloverWebhookSecretEnc: true, cloverMerchantId: true }
          }
        }
      });
      webhookSecret = decryptSecret(payment?.caterer.cloverWebhookSecretEnc) || "";
    }
    if (!webhookSecret) {
      const resolved = await resolveWebhookSecretForMerchant(payload?.merchantId);
      webhookSecret = resolved.secret;
    }

    if (webhookSecret) {
      const valid = verifyCloverWebhookSignature(rawBody, signature, webhookSecret);
      if (!valid) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[clover-webhook] Invalid signature");
        }
        return res.status(401).json({ error: "Invalid signature." });
      }
    }

    if (!payload) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const status = (payload.status ?? "").toUpperCase();
    const paymentId = typeof payload.id === "string" ? payload.id.trim() : "";

    if (!sessionId) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const existing = await prisma.payment.findFirst({
      where: { checkoutSessionId: sessionId },
      select: {
        id: true,
        status: true,
        amount: true,
        note: true,
        externalPaymentId: true
      }
    });

    if (!existing) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[clover-webhook] No payment for session", sessionId);
      }
      return res.status(200).json({ ok: true, unmatched: true });
    }

    if (existing.status === "completed" || existing.status === "refunded") {
      return res.status(200).json({ ok: true, alreadyFinal: true });
    }

    if (status === "APPROVED" || status === "SUCCESS") {
      await prisma.payment.update({
        where: { id: existing.id },
        data: {
          status: "completed",
          externalPaymentId: paymentId || existing.externalPaymentId,
          paymentDate: new Date(),
          note: existing.note
        }
      });
      return res.status(200).json({ ok: true, status: "completed" });
    }

    if (
      status === "DECLINED" ||
      status === "FAILED" ||
      status === "CANCELLED" ||
      status === "CANCELED"
    ) {
      await prisma.payment.update({
        where: { id: existing.id },
        data: {
          status: "failed",
          externalPaymentId: paymentId || existing.externalPaymentId,
          note: existing.note
            ? `${existing.note} · Clover ${status}`
            : `Clover ${status}${payload.message ? `: ${payload.message}` : ""}`
        }
      });
      return res.status(200).json({ ok: true, status: "failed" });
    }

    return res.status(200).json({ ok: true, ignoredStatus: status || null });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[clover-webhook] Error:", err);
    }
    return res.status(200).json({ ok: false });
  }
}
