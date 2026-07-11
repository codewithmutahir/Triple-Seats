import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { getLatestActiveQuote } from "../lib/event-quotes";
import { getAuthorizedSession } from "../lib/authorized-session";
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
    createdAt: payment.createdAt.toISOString()
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

    return res.json({ ok: true, eventId: existing.eventId, ...summary });
  } catch (e) {
    return handleRouteError(res, e, "Payments");
  }
});

export { router as paymentsRouter };
