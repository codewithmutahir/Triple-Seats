import type { Prisma } from "@tripeseats/database";
import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { calculateQuoteTotals, formatTierLabel, getActiveTier } from "../lib/quote-totals";
import { buildQuoteEmailHtml, generateQuotePdfBuffer } from "../lib/quote-pdf";
import {
  parseItemCategory,
  parseQuoteStatus,
  parseQuoteUnit,
  quoteInclude,
  serializeQuote,
  type QuoteWithRelations
} from "../lib/quote-serialize";
import { getResend, resendFromEmail } from "../lib/mail";
import { getSession, SessionError } from "../lib/session";
import { timer } from "../lib/perf";
import { seedMenuItemsForCaterer } from "../lib/seed-menu-items";
import { seedPackagesForCaterer } from "../lib/seed-packages";
import { isCustomerType, type CustomerTypeValue } from "../lib/event-customer-types";

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
    include: {
      lineItems: {
        include: {
          package: { include: { tiers: { orderBy: { minGuests: "asc" } } } }
        }
      },
      event: true
    }
  });
  if (!quote) return null;

  const guestCount = quote.event?.guestCountEstimate ?? 0;
  const customerType = quote.event?.customerType ?? "b2c";

  for (const item of quote.lineItems) {
    if (item.unitType === "tiered_per_head" && item.appliedTier == null && item.package) {
      const activeTier = getActiveTier(item.package.tiers, guestCount, customerType);
      if (activeTier) {
        await prisma.quoteLineItem.update({
          where: { id: item.id },
          data: {
            unitPrice: activeTier.pricePerHead,
            notes: formatTierLabel(activeTier)
          }
        });
      }
    }
  }

  const refreshed = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { lineItems: true, event: true }
  });
  if (!refreshed) return null;

  const { grandTotal } = calculateQuoteTotals(
    refreshed.lineItems,
    refreshed.taxRate,
    refreshed.depositPct,
    guestCount
  );

  return prisma.quote.update({
    where: { id: quoteId },
    data: { totalAmount: grandTotal },
    include: quoteInclude
  });
}

async function updateGuestCountAndPackageTiers(
  quoteId: string,
  catererId: string,
  guestCount: number
) {
  const quote = await loadQuoteForCaterer(quoteId, catererId);
  if (!quote?.eventId) return null;

  const customerType = quote.event?.customerType ?? "b2c";

  await prisma.event.update({
    where: { id: quote.eventId },
    data: { guestCountEstimate: guestCount }
  });

  for (const item of quote.lineItems) {
    if (item.unitType !== "tiered_per_head") continue;

    const pkg = item.packageId
      ? await prisma.cateringPackage.findFirst({
          where: { id: item.packageId, catererId },
          include: { tiers: { orderBy: { minGuests: "asc" } } }
        })
      : null;

    const tiers = pkg?.tiers ?? item.package?.tiers ?? [];
    const activeTier = tiers.length ? getActiveTier(tiers, guestCount, customerType) : null;
    if (!activeTier) continue;

    await prisma.quoteLineItem.update({
      where: { id: item.id },
      data: {
        appliedTier: activeTier.pricePerHead,
        appliedTierLabel: formatTierLabel(activeTier),
        unitPrice: activeTier.pricePerHead,
        notes: formatTierLabel(activeTier)
      }
    });
  }

  return persistQuoteTotals(quoteId);
}

function serializeBuilderPackage(
  pkg: {
    id: string;
    catererId: string;
    name: string;
    description: string | null;
    sortOrder: number;
    minGuests: number;
    tiers: Array<{
      id: string;
      customerType: string;
      minGuests: number;
      maxGuests: number | null;
      pricePerHead: number;
    }>;
    items: Array<{ id: string; label: string; quantity: number; sortOrder: number }>;
  },
  customerType: CustomerTypeValue
) {
  const tiers = pkg.tiers.filter((t) => t.customerType === customerType);
  return {
    id: pkg.id,
    catererId: pkg.catererId,
    name: pkg.name,
    description: pkg.description,
    sortOrder: pkg.sortOrder,
    minGuests: pkg.minGuests,
    tiers: tiers.map((t) => ({
      id: t.id,
      customerType: t.customerType,
      minGuests: t.minGuests,
      maxGuests: t.maxGuests,
      pricePerHead: t.pricePerHead
    })),
    items: pkg.items.map((i) => ({
      id: i.id,
      label: i.label,
      quantity: i.quantity,
      sortOrder: i.sortOrder
    }))
  };
}

function serializeBuilderMenuItem(item: {
  id: string;
  catererId: string;
  category: string;
  name: string;
  defaultPrice: number | null;
  defaultUnit: string;
  usageCount: number;
  isDefault: boolean;
}) {
  return {
    id: item.id,
    catererId: item.catererId,
    category: item.category,
    name: item.name,
    defaultPrice: item.defaultPrice,
    defaultUnit: item.defaultUnit,
    usageCount: item.usageCount,
    isDefault: item.isDefault
  };
}

/** Combined quote builder payload — register before `/event/:eventId` */
router.get("/builder/:eventId", async (req: Request, res: Response) => {
  try {
    const eventId = paramId(req, "eventId");
    const perf = timer(`builder:${eventId}`);

    const { caterer } = await getSession(req);
    perf.step("session");

    const [event, quoteRow, packagesRaw, menuItemsRaw] = await Promise.all([
      prisma.event.findFirst({
        where: { id: eventId, catererId: caterer.id },
        include: { primaryGuest: true }
      }),
      prisma.quote.findFirst({
        where: { eventId, catererId: caterer.id },
        orderBy: { createdAt: "desc" },
        include: quoteInclude
      }),
      prisma.cateringPackage.findMany({
        where: { catererId: caterer.id },
        orderBy: { sortOrder: "asc" },
        include: {
          tiers: { orderBy: { minGuests: "asc" } },
          items: { orderBy: { sortOrder: "asc" } }
        }
      }),
      prisma.menuItem.findMany({
        where: { catererId: caterer.id },
        orderBy: [{ usageCount: "desc" }, { name: "asc" }]
      })
    ]);

    if (!event) {
      perf.end();
      return res.status(404).json({ error: "Event not found." });
    }

    let packages = packagesRaw;
    if (packages.length === 0) {
      await seedPackagesForCaterer(caterer.id);
      packages = await prisma.cateringPackage.findMany({
        where: { catererId: caterer.id },
        orderBy: { sortOrder: "asc" },
        include: {
          tiers: { orderBy: { minGuests: "asc" } },
          items: { orderBy: { sortOrder: "asc" } }
        }
      });
    }

    let menuItems = menuItemsRaw;
    if (menuItems.length === 0) {
      await seedMenuItemsForCaterer(caterer.id);
      menuItems = await prisma.menuItem.findMany({
        where: { catererId: caterer.id },
        orderBy: [{ usageCount: "desc" }, { name: "asc" }]
      });
    }

    let quote = quoteRow;
    if (!quote) {
      quote = await prisma.quote.create({
        data: {
          catererId: caterer.id,
          eventId: event.id,
          status: "draft",
          taxRate: 0.0875,
          depositPct: 0.5,
          totalAmount: 0
        },
        include: quoteInclude
      });
    }

    perf.step("db:parallel-all");

    const customerType: CustomerTypeValue = isCustomerType(event.customerType)
      ? event.customerType
      : "b2c";

    const menuItemsByCategory = menuItems.reduce(
      (acc, item) => {
        const key = item.category;
        if (!acc[key]) acc[key] = [];
        acc[key].push(serializeBuilderMenuItem(item));
        return acc;
      },
      {} as Record<string, ReturnType<typeof serializeBuilderMenuItem>[]>
    );

    perf.step("group:menuItems");
    perf.end();

    return res.json({
      quote: serializeQuote(quote as QuoteWithRelations),
      packages: packages.map((p) => serializeBuilderPackage(p, customerType)),
      menuItemsByCategory,
      event: {
        id: event.id,
        title: event.title,
        eventType: event.eventType,
        customerType: event.customerType,
        eventDate: event.eventDate.toISOString(),
        guestCountEstimate: event.guestCountEstimate,
        venueName: event.venueName,
        venueAddress: event.venueAddress,
        primaryGuest: event.primaryGuest
          ? {
              id: event.primaryGuest.id,
              firstName: event.primaryGuest.firstName,
              lastName: event.primaryGuest.lastName,
              email: event.primaryGuest.email,
              phone: event.primaryGuest.phone
            }
          : null
      }
    });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

/** List quotes for an event — register before `/:id` */
router.get("/event/:eventId", async (req: Request, res: Response) => {
  try {
    const eventId = paramId(req, "eventId");
    const perf = timer(`quotes:event:${eventId}`);

    const { caterer } = await getSession(req);
    perf.step("session");

    const event = await prisma.event.findFirst({
      where: { id: eventId, catererId: caterer.id }
    });
    if (!event) {
      perf.end();
      return res.status(404).json({ error: "Event not found." });
    }

    const quotes = await prisma.quote.findMany({
      where: { eventId, catererId: caterer.id },
      orderBy: { createdAt: "desc" },
      include: quoteInclude
    });
    perf.step("db:quote+lineItems");

    perf.end();
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
        taxRate: 0.0875,
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

router.patch("/:id/guest-count", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const quoteId = paramId(req);
    const raw = (req.body as { guestCount?: unknown })?.guestCount;
    const parsed = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return res.status(400).json({ error: "guestCount must be a non-negative number." });
    }

    const guestCount = Math.floor(parsed);
    const existing = await loadQuoteForCaterer(quoteId, caterer.id);
    if (!existing) {
      return res.status(404).json({ error: "Quote not found." });
    }

    const updated = await updateGuestCountAndPackageTiers(quoteId, caterer.id, guestCount);
    if (!updated) {
      return res.status(404).json({ error: "Quote not found." });
    }

    return res.json({ quote: serializeQuote(updated as QuoteWithRelations) });
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
      menuItemId?: string | null;
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

    let menuItemId: string | null = null;
    if (body.menuItemId) {
      const menuItem = await prisma.menuItem.findFirst({
        where: { id: body.menuItemId, catererId: caterer.id }
      });
      if (menuItem) menuItemId = menuItem.id;
    }

    await prisma.quoteLineItem.create({
      data: {
        quoteId,
        menuItemId,
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

router.post("/:id/package", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const quoteId = paramId(req);
    const body = req.body as { packageId?: string };

    if (!body.packageId?.trim()) {
      return res.status(400).json({ error: "packageId is required." });
    }

    const quote = await loadQuoteForCaterer(quoteId, caterer.id);
    if (!quote) {
      return res.status(404).json({ error: "Quote not found." });
    }

    const pkg = await prisma.cateringPackage.findFirst({
      where: { id: body.packageId, catererId: caterer.id },
      include: {
        tiers: { orderBy: { minGuests: "asc" } },
        items: { orderBy: { sortOrder: "asc" } }
      }
    });
    if (!pkg) {
      return res.status(404).json({ error: "Package not found." });
    }

    const guestCount = quote.event?.guestCountEstimate ?? 0;
    const customerType = quote.event?.customerType ?? "b2c";
    if (guestCount < pkg.minGuests) {
      return res.status(400).json({
        error: `Minimum ${pkg.minGuests} guests required for this package.`
      });
    }

    const activeTier = getActiveTier(pkg.tiers, guestCount, customerType);
    if (!activeTier) {
      return res.status(400).json({ error: "No pricing tier matches the guest count." });
    }

    const existingPackageLine = quote.lineItems.find(
      (item) => item.unitType === "tiered_per_head"
    );
    if (existingPackageLine) {
      await prisma.quoteLineItem.delete({ where: { id: existingPackageLine.id } });
    }

    await prisma.quoteLineItem.create({
      data: {
        quoteId,
        packageId: pkg.id,
        category: "other",
        name: pkg.name,
        quantity: 1,
        unitPrice: activeTier.pricePerHead,
        unitType: "tiered_per_head",
        appliedTier: activeTier.pricePerHead,
        appliedTierLabel: formatTierLabel(activeTier),
        notes: formatTierLabel(activeTier)
      }
    });

    const updated = await persistQuoteTotals(quoteId);
    return res.json({ quote: serializeQuote(updated as QuoteWithRelations) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.delete("/:id/package", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const quoteId = paramId(req);

    const quote = await loadQuoteForCaterer(quoteId, caterer.id);
    if (!quote) {
      return res.status(404).json({ error: "Quote not found." });
    }

    const packageLine = quote.lineItems.find((item) => item.unitType === "tiered_per_head");
    if (!packageLine) {
      return res.status(404).json({ error: "No package on this quote." });
    }

    await prisma.quoteLineItem.delete({ where: { id: packageLine.id } });
    const updated = await persistQuoteTotals(quoteId);
    return res.json({ quote: serializeQuote(updated as QuoteWithRelations) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.post("/:id/duplicate", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const quoteId = paramId(req);

    const source = await loadQuoteForCaterer(quoteId, caterer.id);
    if (!source) {
      return res.status(404).json({ error: "Quote not found." });
    }

    const duplicate = await prisma.quote.create({
      data: {
        catererId: caterer.id,
        eventId: source.eventId,
        status: "draft",
        notes: source.notes,
        taxRate: source.taxRate,
        depositPct: source.depositPct,
        dueDate: source.dueDate,
        totalAmount: 0,
        lineItems: {
          create: source.lineItems.map((item) => ({
            menuItemId: item.menuItemId,
            packageId: item.packageId,
            category: item.category,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unitType: item.unitType,
            appliedTier: item.appliedTier,
            appliedTierLabel: item.appliedTierLabel,
            notes: item.notes
          }))
        }
      },
      include: quoteInclude
    });

    const updated = await persistQuoteTotals(duplicate.id);
    return res.status(201).json({
      quote: serializeQuote((updated ?? duplicate) as QuoteWithRelations)
    });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.post("/:id/pdf", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const quoteId = paramId(req);
    const quote = await loadQuoteForCaterer(quoteId, caterer.id);
    if (!quote) {
      return res.status(404).json({ error: "Quote not found." });
    }

    const buffer = await generateQuotePdfBuffer(quote as QuoteWithRelations);
    if (!buffer.length) {
      return res.status(500).json({ error: "Generated PDF was empty." });
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("Content-Disposition", `attachment; filename="quote-${quoteId}.pdf"`);
    return res.end(buffer);
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.post("/:id/send", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const quoteId = paramId(req);
    const quote = await loadQuoteForCaterer(quoteId, caterer.id);
    if (!quote) {
      return res.status(404).json({ error: "Quote not found." });
    }

    const guestEmail = quote.event?.primaryGuest?.email?.trim();
    if (!guestEmail) {
      return res.status(400).json({ error: "Guest email is required to send the quote." });
    }

    const guestCount = quote.event?.guestCountEstimate ?? 0;
    const customerType = quote.event?.customerType ?? "b2c";

    for (const item of quote.lineItems) {
      if (item.unitType !== "tiered_per_head" || item.appliedTier != null) continue;

      const pkg = item.packageId
        ? await prisma.cateringPackage.findFirst({
            where: { id: item.packageId, catererId: caterer.id },
            include: { tiers: { orderBy: { minGuests: "asc" } } }
          })
        : null;

      const activeTier = pkg ? getActiveTier(pkg.tiers, guestCount, customerType) : null;
      if (activeTier) {
        await prisma.quoteLineItem.update({
          where: { id: item.id },
          data: {
            appliedTier: activeTier.pricePerHead,
            appliedTierLabel: formatTierLabel(activeTier),
            unitPrice: activeTier.pricePerHead,
            notes: formatTierLabel(activeTier)
          }
        });
      }
    }

    const quoteForSend = await loadQuoteForCaterer(quoteId, caterer.id);
    if (!quoteForSend) {
      return res.status(404).json({ error: "Quote not found." });
    }

    const resend = getResend();
    if (!resend) {
      return res.status(503).json({ error: "Email service is not configured." });
    }

    const quoteData = quoteForSend as QuoteWithRelations;
    const pdfBuffer = await generateQuotePdfBuffer(quoteData);
    if (!pdfBuffer.length) {
      return res.status(500).json({ error: "Generated PDF was empty." });
    }
    const html = buildQuoteEmailHtml(quoteData, caterer);

    const { error: sendError } = await resend.emails.send({
      from: resendFromEmail(),
      to: guestEmail,
      subject: "Your Catering Quote from CaterPro",
      html,
      attachments: [
        {
          filename: `quote-${quoteId}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf"
        }
      ]
    });
    if (sendError) {
      console.error("Failed to send quote email:", sendError);
      return res.status(502).json({ error: "Failed to send quote email." });
    }

    const updated = await prisma.quote.update({
      where: { id: quoteId },
      data: { status: "sent" },
      include: quoteInclude
    });

    await persistQuoteTotals(quoteId);

    const finalQuote = await loadQuoteForCaterer(quoteId, caterer.id);

    return res.json({
      ok: true,
      emailSent: true,
      quote: serializeQuote((finalQuote ?? updated) as QuoteWithRelations)
    });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

export const quotesRouter = router;
