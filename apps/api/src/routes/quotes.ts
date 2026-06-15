import type { Prisma } from "@tripeseats/database";
import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { calculateQuoteTotals } from "../lib/quote-totals";
import {
  parseItemCategory,
  parseQuoteStatus,
  parseQuoteUnit,
  quoteInclude,
  serializeQuote,
  type QuoteWithRelations
} from "../lib/quote-serialize";
import { getSession, SessionError } from "../lib/session";

const router = Router();

function paramId(req: Request, key = "id"): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0]! : String(raw);
}

function handleSessionError(res: Response, e: unknown) {
  if (e instanceof SessionError) {
    return res.status(e.status).json({ error: e.message });
  }
  console.error("Quotes route error:", e);
  return res.status(500).json({ error: "Internal server error" });
}

async function loadQuoteForCaterer(quoteId: string, catererId: string) {
  return prisma.quote.findFirst({
    where: { id: quoteId, catererId },
    include: quoteInclude
  });
}

async function persistQuoteTotals(quoteId: string) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { lineItems: true, event: true }
  });
  if (!quote) return null;

  const guestCount = quote.event?.guestCountEstimate ?? 0;
  const { grandTotal } = calculateQuoteTotals(
    quote.lineItems,
    quote.taxRate,
    quote.depositPct,
    guestCount
  );

  return prisma.quote.update({
    where: { id: quoteId },
    data: { totalAmount: grandTotal },
    include: quoteInclude
  });
}

/** List quotes for an event — register before `/:id` */
router.get("/event/:eventId", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const eventId = paramId(req, "eventId");

    const event = await prisma.event.findFirst({
      where: { id: eventId, catererId: caterer.id }
    });
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }

    const quotes = await prisma.quote.findMany({
      where: { eventId, catererId: caterer.id },
      orderBy: { createdAt: "desc" },
      include: quoteInclude
    });

    return res.json({ items: quotes.map((q) => serializeQuote(q as QuoteWithRelations)) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const { eventId } = req.body as { eventId?: string };
    if (!eventId || typeof eventId !== "string") {
      return res.status(400).json({ error: "eventId is required." });
    }

    const event = await prisma.event.findFirst({
      where: { id: eventId, catererId: caterer.id }
    });
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }

    const quote = await prisma.quote.create({
      data: {
        catererId: caterer.id,
        eventId: event.id,
        status: "draft",
        taxRate: 0.085,
        depositPct: 0.5,
        totalAmount: 0
      },
      include: quoteInclude
    });

    return res.status(201).json({ quote: serializeQuote(quote as QuoteWithRelations) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const quote = await loadQuoteForCaterer(paramId(req), caterer.id);
    if (!quote) {
      return res.status(404).json({ error: "Quote not found." });
    }
    return res.json({ quote: serializeQuote(quote as QuoteWithRelations) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const id = paramId(req);
    const body = req.body as {
      taxRate?: number;
      depositPct?: number;
      dueDate?: string | null;
      notes?: string | null;
      status?: string;
    };

    const existing = await loadQuoteForCaterer(id, caterer.id);
    if (!existing) {
      return res.status(404).json({ error: "Quote not found." });
    }

    const data: Prisma.QuoteUpdateInput = {};

    if (typeof body.taxRate === "number" && Number.isFinite(body.taxRate)) {
      data.taxRate = Math.max(0, body.taxRate);
    }
    if (typeof body.depositPct === "number" && Number.isFinite(body.depositPct)) {
      data.depositPct = Math.min(1, Math.max(0, body.depositPct));
    }
    if (body.dueDate !== undefined) {
      if (body.dueDate === null || body.dueDate === "") {
        data.dueDate = null;
      } else {
        const d = new Date(body.dueDate);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ error: "Invalid dueDate." });
        }
        data.dueDate = d;
      }
    }
    if (body.notes !== undefined) {
      data.notes = body.notes;
    }
    if (body.status !== undefined) {
      const status = parseQuoteStatus(body.status);
      if (!status) {
        return res.status(400).json({ error: "Invalid status." });
      }
      data.status = status;
    }

    await prisma.quote.update({ where: { id }, data });
    const updated = await persistQuoteTotals(id);
    if (!updated) {
      return res.status(404).json({ error: "Quote not found." });
    }

    return res.json({ quote: serializeQuote(updated as QuoteWithRelations) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.post("/:id/items", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const quoteId = paramId(req);
    const body = req.body as {
      category?: string;
      name?: string;
      quantity?: number;
      unitPrice?: number;
      unitType?: string;
      notes?: string | null;
    };

    const quote = await loadQuoteForCaterer(quoteId, caterer.id);
    if (!quote) {
      return res.status(404).json({ error: "Quote not found." });
    }

    const category = parseItemCategory(body.category);
    const unitType = parseQuoteUnit(body.unitType);
    if (!category || !unitType) {
      return res.status(400).json({ error: "Invalid category or unitType." });
    }
    if (!body.name?.trim()) {
      return res.status(400).json({ error: "name is required." });
    }
    if (typeof body.unitPrice !== "number" || !Number.isFinite(body.unitPrice)) {
      return res.status(400).json({ error: "unitPrice must be a number." });
    }
    const quantity =
      typeof body.quantity === "number" && Number.isFinite(body.quantity) ? body.quantity : 1;

    await prisma.quoteLineItem.create({
      data: {
        quoteId,
        category,
        name: body.name.trim(),
        quantity: Math.max(0, quantity),
        unitPrice: Math.max(0, body.unitPrice),
        unitType,
        notes: body.notes?.trim() || null
      }
    });

    const updated = await persistQuoteTotals(quoteId);
    return res.json({ quote: serializeQuote(updated as QuoteWithRelations) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.patch("/:id/items/:itemId", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const quoteId = paramId(req);
    const itemId = paramId(req, "itemId");
    const body = req.body as {
      name?: string;
      quantity?: number;
      unitPrice?: number;
      unitType?: string;
      notes?: string | null;
      category?: string;
    };

    const quote = await loadQuoteForCaterer(quoteId, caterer.id);
    if (!quote) {
      return res.status(404).json({ error: "Quote not found." });
    }

    const existing = await prisma.quoteLineItem.findFirst({
      where: { id: itemId, quoteId }
    });
    if (!existing) {
      return res.status(404).json({ error: "Line item not found." });
    }

    const data: Prisma.QuoteLineItemUpdateInput = {};

    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return res.status(400).json({ error: "name cannot be empty." });
      }
      data.name = body.name.trim();
    }
    if (typeof body.quantity === "number" && Number.isFinite(body.quantity)) {
      data.quantity = Math.max(0, body.quantity);
    }
    if (typeof body.unitPrice === "number" && Number.isFinite(body.unitPrice)) {
      data.unitPrice = Math.max(0, body.unitPrice);
    }
    if (body.unitType !== undefined) {
      const unitType = parseQuoteUnit(body.unitType);
      if (!unitType) {
        return res.status(400).json({ error: "Invalid unitType." });
      }
      data.unitType = unitType;
    }
    if (body.notes !== undefined) {
      data.notes = body.notes?.trim() || null;
    }
    if (body.category !== undefined) {
      const category = parseItemCategory(body.category);
      if (!category) {
        return res.status(400).json({ error: "Invalid category." });
      }
      data.category = category;
    }

    await prisma.quoteLineItem.update({ where: { id: itemId }, data });
    const updated = await persistQuoteTotals(quoteId);
    return res.json({ quote: serializeQuote(updated as QuoteWithRelations) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.delete("/:id/items/:itemId", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const quoteId = paramId(req);
    const itemId = paramId(req, "itemId");

    const quote = await loadQuoteForCaterer(quoteId, caterer.id);
    if (!quote) {
      return res.status(404).json({ error: "Quote not found." });
    }

    const existing = await prisma.quoteLineItem.findFirst({
      where: { id: itemId, quoteId }
    });
    if (!existing) {
      return res.status(404).json({ error: "Line item not found." });
    }

    await prisma.quoteLineItem.delete({ where: { id: itemId } });
    const updated = await persistQuoteTotals(quoteId);
    return res.json({ quote: serializeQuote(updated as QuoteWithRelations) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

export const quotesRouter = router;
