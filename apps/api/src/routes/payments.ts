import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { getLatestActiveQuote } from "../lib/event-quotes";
import { getAuthorizedSession } from "../lib/authorized-session";
import { createCloverHostedCheckout, resolveCloverConfigForCaterer } from "../lib/clover";
import { escapeHtml, getResend, resendFromEmail } from "../lib/mail";
import { handleRouteError } from "../lib/route-errors";
import { timer } from "../lib/perf";

const router = Router();

const PAYMENT_METHODS = ["cash", "credit_card", "bank_transfer", "other"] as const;
type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

function paramId(req: Request, key = "id"): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0]! : String(raw);
}

function isPaymentMethod(value: string): value is PaymentMethodValue {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}

function parseCreatePaymentBody(body: unknown):
  | {
      eventId: string;
      amount: number;
      method: PaymentMethodValue;
      note?: string;
      paymentDate?: Date;
    }
  | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const eventId = typeof record.eventId === "string" ? record.eventId.trim() : "";
  const amount = Number(record.amount);
  const methodRaw = typeof record.method === "string" ? record.method.trim() : "";
  if (!eventId || !Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return null;
  if (!isPaymentMethod(methodRaw)) return null;

  const note = typeof record.note === "string" ? record.note.trim() : undefined;
  const paymentDate =
    record.paymentDate !== undefined ? new Date(String(record.paymentDate)) : undefined;
  if (paymentDate && Number.isNaN(paymentDate.getTime())) return null;

  return {
    eventId,
    amount,
    method: methodRaw,
    note: note || undefined,
    paymentDate
  };
}

function serializePayment(
  payment: {
    id: string;
    eventId: string;
    quoteId: string | null;
    amount: number;
    method: string;
    status: string;
    note: string | null;
    addedBy: string;
    paymentDate: Date;
    createdAt: Date;
    provider?: string | null;
    checkoutSessionId?: string | null;
    checkoutUrl?: string | null;
    expiresAt?: Date | null;
    externalPaymentId?: string | null;
  },
  addedByName: string | null
) {
  return {
    id: payment.id,
    eventId: payment.eventId,
    quoteId: payment.quoteId,
    amount: payment.amount,
    method: payment.method,
    status: payment.status,
    note: payment.note,
    addedBy: payment.addedBy,
    addedByName,
    paymentDate: payment.paymentDate.toISOString(),
    createdAt: payment.createdAt.toISOString(),
    provider: payment.provider ?? null,
    checkoutSessionId: payment.checkoutSessionId ?? null,
    checkoutUrl: payment.checkoutUrl ?? null,
    expiresAt: payment.expiresAt?.toISOString() ?? null,
    externalPaymentId: payment.externalPaymentId ?? null
  };
}

async function resolveAddedByNames(userIds: string[]) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Map<string, string>();

  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true }
  });

  return new Map(
    users.map((user) => [user.id, user.name?.trim() || user.email || "Team member"])
  );
}

async function buildPaymentSummary(eventId: string, catererId: string) {
  const [quote, payments] = await Promise.all([
    getLatestActiveQuote(eventId, catererId),
    prisma.payment.findMany({
      where: { eventId, catererId },
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }]
    })
  ]);

  const nameMap = await resolveAddedByNames(payments.map((p) => p.addedBy));
  const quoteTotal = quote?.totalAmount ?? 0;
  const totalPaid = payments
    .filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + p.amount, 0);
  const balanceDue = Math.max(0, quoteTotal - totalPaid);

  return {
    quoteId: quote?.id ?? null,
    quoteTotal,
    totalPaid,
    balanceDue,
    payments: payments.map((p) => serializePayment(p, nameMap.get(p.addedBy) ?? null))
  };
}

async function sendPaymentLinkEmail(opts: {
  to: string;
  guestName: string;
  amount: number;
  checkoutUrl: string;
  eventTitle: string;
  note?: string;
}) {
  const resend = getResend();
  if (!resend) return { sent: false as const, reason: "email_not_configured" as const };

  const amountLabel = opts.amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD"
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { error } = await resend.emails.send({
        from: resendFromEmail(),
        to: opts.to,
        subject: `Payment request — ${opts.eventTitle}`,
        html: `
          <p>Hi ${escapeHtml(opts.guestName)},</p>
          <p>Please pay <strong>${escapeHtml(amountLabel)}</strong> for <strong>${escapeHtml(opts.eventTitle)}</strong>.</p>
          ${opts.note ? `<p>${escapeHtml(opts.note)}</p>` : ""}
          <p><a href="${escapeHtml(opts.checkoutUrl)}">Pay securely with card</a></p>
          <p>This link expires in about 15 minutes. If it expires, ask us to send a new one.</p>
        `
      });
      if (!error) return { sent: true as const };
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
  }
  return { sent: false as const, reason: "send_failed" as const };
}

router.get("/event/:eventId", async (req: Request, res: Response) => {
  try {
    const perf = timer("payments:event");
    const { caterer } = await getAuthorizedSession(req, "events:read");
    const eventId = paramId(req, "eventId");

    const event = await prisma.event.findFirst({
      where: { id: eventId, catererId: caterer.id },
      select: { id: true, status: true }
    });
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }

    perf.step("session");
    const summary = await buildPaymentSummary(eventId, caterer.id);
    perf.step("db");
    perf.end();

    return res.json({
      eventId,
      eventStatus: event.status,
      paymentsEnabled: event.status === "booked" || event.status === "completed",
      cloverConfigured: (await resolveCloverConfigForCaterer(caterer.id)).configured,
      ...summary
    });
  } catch (e) {
    return handleRouteError(res, e, "Payments");
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const { caterer, user } = await getAuthorizedSession(req, "events:write");
    const parsed = parseCreatePaymentBody(req.body);
    if (!parsed) {
      return res.status(400).json({ error: "Invalid input." });
    }

    const { eventId, amount, method, note, paymentDate } = parsed;

    const event = await prisma.event.findFirst({
      where: { id: eventId, catererId: caterer.id },
      select: { id: true, status: true }
    });
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }
    if (event.status !== "booked" && event.status !== "completed") {
      return res.status(400).json({
        error: "Payments can only be recorded when the event is Booked or Completed."
      });
    }

    const quote = await getLatestActiveQuote(eventId, caterer.id);

    const payment = await prisma.payment.create({
      data: {
        catererId: caterer.id,
        eventId,
        quoteId: quote?.id ?? null,
        amount,
        method,
        note: note ?? null,
        addedBy: user.id,
        paymentDate: paymentDate ?? new Date(),
        status: method === "credit_card" ? "pending" : "completed"
      }
    });

    const summary = await buildPaymentSummary(eventId, caterer.id);
    const addedByName = user.name?.trim() || user.email || "Team member";

    return res.status(201).json({
      payment: serializePayment(payment, addedByName),
      eventStatus: event.status,
      paymentsEnabled: event.status === "booked" || event.status === "completed",
      cloverConfigured: (await resolveCloverConfigForCaterer(caterer.id)).configured,
      ...summary
    });
  } catch (e) {
    return handleRouteError(res, e, "Payments");
  }
});

/** Create Clover Hosted Checkout payment link for an event. */
router.post("/links", async (req: Request, res: Response) => {
  try {
    const { caterer, user } = await getAuthorizedSession(req, "events:write");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
    const amountRaw = Number(body.amount);
    const note = typeof body.note === "string" ? body.note.trim() : "";
    const sendEmail = body.sendEmail !== false;
    const idemHeader = req.headers["idempotency-key"];
    const idempotencyKey =
      (typeof idemHeader === "string" ? idemHeader.trim() : "") ||
      (typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "") ||
      null;

    if (!eventId || !Number.isFinite(amountRaw) || amountRaw <= 0) {
      return res.status(400).json({ error: "eventId and a positive amount are required." });
    }

    const clover = await resolveCloverConfigForCaterer(caterer.id);
    if (!clover.configured) {
      return res.status(503).json({
        error:
          "Clover is not configured. Connect Clover in Settings → Payments, or set server env keys."
      });
    }

    if (idempotencyKey) {
      const prior = await prisma.payment.findFirst({
        where: { idempotencyKey, catererId: caterer.id }
      });
      if (prior) {
        const summary = await buildPaymentSummary(prior.eventId, caterer.id);
        const nameMap = await resolveAddedByNames([prior.addedBy]);
        return res.json({
          payment: serializePayment(prior, nameMap.get(prior.addedBy) ?? null),
          checkoutUrl: prior.checkoutUrl,
          emailSent: false,
          reused: true,
          paymentsEnabled: true,
          cloverConfigured: true,
          ...summary
        });
      }
    }

    const event = await prisma.event.findFirst({
      where: { id: eventId, catererId: caterer.id },
      select: {
        id: true,
        status: true,
        title: true,
        primaryGuest: {
          select: { firstName: true, lastName: true, email: true, phone: true }
        }
      }
    });
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }
    if (event.status !== "booked" && event.status !== "completed") {
      return res.status(400).json({
        error: "Payment links can only be created when the event is Booked or Completed."
      });
    }

    const summaryBefore = await buildPaymentSummary(eventId, caterer.id);
    if (summaryBefore.balanceDue <= 0.009) {
      return res.status(400).json({ error: "This event is already paid in full." });
    }

    const amount = Math.min(
      Math.round(amountRaw * 100) / 100,
      Math.round(summaryBefore.balanceDue * 100) / 100
    );
    if (amount <= 0) {
      return res.status(400).json({ error: "Invalid amount." });
    }

    const reusable = await prisma.payment.findFirst({
      where: {
        eventId,
        catererId: caterer.id,
        provider: "clover",
        status: "pending",
        amount,
        expiresAt: { gt: new Date() },
        checkoutUrl: { not: null }
      },
      orderBy: { createdAt: "desc" }
    });
    if (reusable?.checkoutUrl) {
      const nameMap = await resolveAddedByNames([reusable.addedBy]);
      return res.json({
        payment: serializePayment(reusable, nameMap.get(reusable.addedBy) ?? null),
        checkoutUrl: reusable.checkoutUrl,
        emailSent: false,
        reused: true,
        eventStatus: event.status,
        paymentsEnabled: true,
        cloverConfigured: true,
        ...summaryBefore
      });
    }

    const guest = event.primaryGuest;
    const guestName =
      [guest?.firstName, guest?.lastName].filter(Boolean).join(" ").trim() || "Guest";

    const session = await createCloverHostedCheckout(
      {
        amountDollars: amount,
        lineName: event.title?.trim() || "Event payment",
        lineNote: note || undefined,
        customer: {
          email: guest?.email ?? undefined,
          firstName: guest?.firstName ?? undefined,
          lastName: guest?.lastName ?? undefined,
          phoneNumber: guest?.phone ?? undefined
        }
      },
      clover
    );

    const payment = await prisma.payment.create({
      data: {
        catererId: caterer.id,
        eventId,
        quoteId: summaryBefore.quoteId,
        amount,
        method: "credit_card",
        status: "pending",
        note: note || "Clover payment link",
        addedBy: user.id,
        paymentDate: new Date(),
        provider: "clover",
        checkoutSessionId: session.checkoutSessionId,
        checkoutUrl: session.href,
        expiresAt: new Date(session.expirationTime),
        idempotencyKey
      }
    });

    let emailSent = false;
    if (sendEmail && guest?.email) {
      const mail = await sendPaymentLinkEmail({
        to: guest.email,
        guestName,
        amount,
        checkoutUrl: session.href,
        eventTitle: event.title?.trim() || "your event",
        note: note || undefined
      });
      emailSent = mail.sent;
    }

    const summary = await buildPaymentSummary(eventId, caterer.id);
    const addedByName = user.name?.trim() || user.email || "Team member";

    return res.status(201).json({
      payment: serializePayment(payment, addedByName),
      checkoutUrl: session.href,
      emailSent,
      reused: false,
      eventStatus: event.status,
      paymentsEnabled: true,
      cloverConfigured: true,
      ...summary
    });
  } catch (e) {
    return handleRouteError(res, e, "Payments");
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "events:write");
    const id = paramId(req);

    const existing = await prisma.payment.findFirst({
      where: { id, catererId: caterer.id },
      select: { id: true, eventId: true }
    });
    if (!existing) {
      return res.status(404).json({ error: "Payment not found." });
    }

    await prisma.payment.delete({ where: { id } });
    const summary = await buildPaymentSummary(existing.eventId, caterer.id);

    return res.json({
      ok: true,
      eventId: existing.eventId,
      cloverConfigured: (await resolveCloverConfigForCaterer(caterer.id)).configured,
      ...summary
    });
  } catch (e) {
    return handleRouteError(res, e, "Payments");
  }
});

export { router as paymentsRouter };
