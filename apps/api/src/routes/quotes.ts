import type { Prisma } from "@tripeseats/database";
import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { calculateQuoteTotals, formatTierLabel, getActiveTier } from "../lib/quote-totals";
import {
  parseItemCategory,
  parseQuoteStatus,
  parseQuoteUnit,
  quoteBuilderInclude,
  quoteInclude,
  serializeQuote,
  serializeQuoteTotalsPatch,
  type QuoteWithRelations
} from "../lib/quote-serialize";
import { getResend, resendFromEmail } from "../lib/mail";
import { getAuthorizedSession } from "../lib/authorized-session";
import { handleRouteError } from "../lib/route-errors";
import { timer } from "../lib/perf";
import { ensureDefaultItemsForCategory, seedMenuItemsForCaterer } from "../lib/seed-menu-items";
import { seedPackagesForCaterer } from "../lib/seed-packages";
import { parsePackageSelections } from "../lib/package-selections";
import { isCustomerType, type CustomerTypeValue } from "../lib/event-customer-types";

const router = Router();

async function loadQuotePdf() {
  return import("../lib/quote-pdf.js");
}

function paramId(req: Request, key = "id"): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0]! : String(raw);
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
    select: {
      id: true,
      catererId: true,
      taxRate: true,
      depositPct: true,
      lineItems: {
        select: {
          id: true,
          unitType: true,
          appliedTier: true,
          packageId: true,
          unitPrice: true,
          quantity: true,
          category: true
        }
      },
      event: {
        select: {
          guestCountEstimate: true,
          customerType: true
        }
      }
    }
  });
  if (!quote) return null;

  const guestCount = quote.event?.guestCountEstimate ?? 0;
  const customerType = quote.event?.customerType ?? "b2c";

  const tieredNeedingPackage = quote.lineItems.filter(
    (item) => item.unitType === "tiered_per_head" && item.appliedTier == null && item.packageId
  );

  const packageMap = new Map<
    string,
    Awaited<
      ReturnType<
        typeof prisma.cateringPackage.findMany<{
          include: { tiers: { orderBy: { minGuests: "asc" } } };
        }>
      >
    >[number]
  >();

  if (tieredNeedingPackage.length > 0) {
    const packageIds = [
      ...new Set(tieredNeedingPackage.map((item) => item.packageId).filter(Boolean))
    ] as string[];

    const packages = await prisma.cateringPackage.findMany({
      where: { id: { in: packageIds }, catererId: quote.catererId },
      include: { tiers: { orderBy: { minGuests: "asc" } } }
    });

    for (const pkg of packages) {
      packageMap.set(pkg.id, pkg);
    }
  }

  const lineItemUpdates: Prisma.PrismaPromise<unknown>[] = [];
  const lineItemsForTotals = quote.lineItems.map((item) => {
    if (item.unitType !== "tiered_per_head" || item.appliedTier != null || !item.packageId) {
      return item;
    }

    const pkg = packageMap.get(item.packageId);
    if (!pkg) return item;

    const activeTier = getActiveTier(pkg.tiers, guestCount, customerType);
    if (!activeTier) return item;

    lineItemUpdates.push(
      prisma.quoteLineItem.update({
        where: { id: item.id },
        data: {
          unitPrice: activeTier.pricePerHead,
          notes: formatTierLabel(activeTier)
        }
      })
    );

    return { ...item, unitPrice: activeTier.pricePerHead };
  });

  const { grandTotal } = calculateQuoteTotals(
    lineItemsForTotals,
    quote.taxRate,
    quote.depositPct,
    guestCount
  );

  await prisma.$transaction([
    ...lineItemUpdates,
    prisma.quote.update({
      where: { id: quoteId },
      data: { totalAmount: grandTotal }
    })
  ]);

  const refreshed = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: {
      id: true,
      taxRate: true,
      depositPct: true,
      totalAmount: true,
      lineItems: {
        orderBy: { createdAt: "asc" },
        include: {
          package: {
            include: {
              tiers: { orderBy: { minGuests: "asc" } },
              items: { orderBy: { sortOrder: "asc" } }
            }
          }
        }
      }
    }
  });

  if (!refreshed) return null;

  return {
    ...refreshed,
    guestCount
  };
}

async function addPackageToQuote(quoteId: string, catererId: string, packageId: string) {
  await prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findFirst({
      where: { id: quoteId, catererId },
      include: {
        lineItems: true,
        event: { select: { guestCountEstimate: true, customerType: true } }
      }
    });
    if (!quote) {
      throw Object.assign(new Error("Quote not found."), { status: 404 });
    }

    const pkg = await tx.cateringPackage.findFirst({
      where: { id: packageId, catererId },
      include: { tiers: { orderBy: { minGuests: "asc" } } }
    });
    if (!pkg) {
      throw Object.assign(new Error("Package not found."), { status: 404 });
    }

    const guestCount = quote.event?.guestCountEstimate ?? 0;
    const customerType = quote.event?.customerType ?? "b2c";
    const activeTier = getActiveTier(pkg.tiers, guestCount, customerType);
    if (!activeTier) {
      throw Object.assign(new Error("No pricing tier matches the guest count."), { status: 400 });
    }

    await tx.quoteLineItem.deleteMany({
      where: { quoteId, unitType: "tiered_per_head" }
    });

    await tx.quoteLineItem.create({
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
  });

  return persistQuoteTotals(quoteId);
}

async function removePackageFromQuote(quoteId: string, catererId: string) {
  const quote = await loadQuoteForCaterer(quoteId, catererId);
  if (!quote) return null;

  await prisma.quoteLineItem.deleteMany({
    where: { quoteId, unitType: "tiered_per_head" }
  });

  return persistQuoteTotals(quoteId);
}

async function updateGuestCountAndPackageTiers(
  quoteId: string,
  catererId: string,
  guestCount: number
) {
  const quoteMeta = await prisma.quote.findFirst({
    where: { id: quoteId, catererId },
    select: {
      id: true,
      eventId: true,
      taxRate: true,
      depositPct: true,
      event: { select: { customerType: true } }
    }
  });
  if (!quoteMeta?.eventId) return null;

  await prisma.event.update({
    where: { id: quoteMeta.eventId },
    data: { guestCountEstimate: guestCount }
  });

  const packageLineItems = await prisma.quoteLineItem.findMany({
    where: { quoteId, unitType: "tiered_per_head" },
    select: { id: true, packageId: true, unitType: true }
  });

  if (packageLineItems.length === 0) {
    const lineItems = await prisma.quoteLineItem.findMany({ where: { quoteId } });
    const { grandTotal } = calculateQuoteTotals(
      lineItems,
      quoteMeta.taxRate,
      quoteMeta.depositPct,
      guestCount
    );
    await prisma.quote.update({
      where: { id: quoteId },
      data: { totalAmount: grandTotal }
    });

    const full = await loadQuoteForCaterer(quoteId, catererId);
    if (!full) return null;
    return {
      ...full,
      totalAmount: grandTotal,
      event: full.event ? { ...full.event, guestCountEstimate: guestCount } : full.event
    };
  }

  const freshQuote = await loadQuoteForCaterer(quoteId, catererId);
  if (!freshQuote) return null;

  const customerType = freshQuote.event?.customerType ?? "b2c";
  const tieredLineItems = freshQuote.lineItems.filter((item) => item.unitType === "tiered_per_head");
  const packageIds = [
    ...new Set(tieredLineItems.map((item) => item.packageId).filter(Boolean))
  ] as string[];

  const packages =
    packageIds.length > 0
      ? await prisma.cateringPackage.findMany({
          where: { id: { in: packageIds }, catererId },
          include: { tiers: { orderBy: { minGuests: "asc" } } }
        })
      : [];

  const packageById = new Map(packages.map((pkg) => [pkg.id, pkg]));

  const nextLineItems = freshQuote.lineItems.map((item) => {
    if (item.unitType !== "tiered_per_head") return item;
    const pkg = item.packageId ? packageById.get(item.packageId) : null;
    const tiers = pkg?.tiers ?? item.package?.tiers ?? [];
    const activeTier = tiers.length ? getActiveTier(tiers, guestCount, customerType) : null;
    return activeTier
      ? {
          ...item,
          appliedTier: activeTier.pricePerHead,
          appliedTierLabel: formatTierLabel(activeTier),
          unitPrice: activeTier.pricePerHead,
          notes: formatTierLabel(activeTier)
        }
      : {
          ...item,
          appliedTier: null,
          appliedTierLabel: null,
          unitPrice: 0,
          notes: null
        };
  });

  const { grandTotal } = calculateQuoteTotals(
    nextLineItems,
    freshQuote.taxRate,
    freshQuote.depositPct,
    guestCount
  );

  const lineItemUpdates = tieredLineItems.map((item) => {
    const next = nextLineItems.find((n) => n.id === item.id)!;
    return prisma.quoteLineItem.update({
      where: { id: item.id },
      data: {
        appliedTier: next.appliedTier,
        appliedTierLabel: next.appliedTierLabel,
        unitPrice: next.unitPrice,
        notes: next.notes
      }
    });
  });

  await Promise.all([
    ...lineItemUpdates,
    prisma.quote.update({
      where: { id: quoteId },
      data: { totalAmount: grandTotal }
    })
  ]);

  return {
    ...freshQuote,
    totalAmount: grandTotal,
    lineItems: nextLineItems as typeof freshQuote.lineItems,
    event: freshQuote.event
      ? { ...freshQuote.event, guestCountEstimate: guestCount }
      : freshQuote.event
  };
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
  // Include tiers for this customerType AND tiers with no customerType set (universal tiers)
  const tiers = pkg.tiers.filter((t) => t.customerType === customerType || t.customerType == null);
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

    const { caterer } = await getAuthorizedSession(req, "quotes:read");
    perf.step("session");

    const [event, quoteRow, packagesRaw, menuItemsRaw] = await Promise.all([
      prisma.event.findFirst({
        where: { id: eventId, catererId: caterer.id },
        select: {
          id: true,
          title: true,
          eventType: true,
          customerType: true,
          eventDate: true,
          startTime: true,
          endTime: true,
          guestCountEstimate: true,
          venueName: true,
          venueAddress: true,
          primaryGuest: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          }
        }
      }),
      prisma.quote.findFirst({
        where: { eventId, catererId: caterer.id },
        orderBy: { createdAt: "desc" },
        include: quoteBuilderInclude
      }),
      prisma.cateringPackage.findMany({
        where: { catererId: caterer.id },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          catererId: true,
          name: true,
          description: true,
          sortOrder: true,
          minGuests: true,
          tiers: {
            orderBy: { minGuests: "asc" },
            select: {
              id: true,
              customerType: true,
              minGuests: true,
              maxGuests: true,
              pricePerHead: true
            }
          },
          items: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              label: true,
              quantity: true,
              sortOrder: true
            }
          }
        }
      }),
      prisma.menuItem.findMany({
        where: { catererId: caterer.id },
        orderBy: [{ usageCount: "desc" }, { name: "asc" }],
        select: {
          id: true,
          catererId: true,
          category: true,
          name: true,
          defaultPrice: true,
          defaultUnit: true,
          usageCount: true,
          isDefault: true
        }
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
        select: {
          id: true,
          catererId: true,
          name: true,
          description: true,
          sortOrder: true,
          minGuests: true,
          tiers: {
            orderBy: { minGuests: "asc" },
            select: {
              id: true,
              customerType: true,
              minGuests: true,
              maxGuests: true,
              pricePerHead: true
            }
          },
          items: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              label: true,
              quantity: true,
              sortOrder: true
            }
          }
        }
      });
    }

    let menuItems = menuItemsRaw;
    if (menuItems.length === 0) {
      await seedMenuItemsForCaterer(caterer.id);
    } else {
      const categories = [
        "appetizer",
        "veg_gravy",
        "chicken_gravy",
        "mutton_gravy",
        "rice_chicken",
        "rice_mutton",
        "breads",
        "side_items",
        "bbq",
        "dessert",
        "beverages",
        "equipment"
      ] as const;
      await Promise.all(
        categories.map((category) => ensureDefaultItemsForCategory(caterer.id, category))
      );
    }

    menuItems = await prisma.menuItem.findMany({
      where: { catererId: caterer.id },
      orderBy: [{ usageCount: "desc" }, { name: "asc" }],
      select: {
        id: true,
        catererId: true,
        category: true,
        name: true,
        defaultPrice: true,
        defaultUnit: true,
        usageCount: true,
        isDefault: true
      }
    });

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
      quote: serializeQuote({
        ...quote,
        event
      } as QuoteWithRelations),
      packages: packages.map((p) => serializeBuilderPackage(p, customerType)),
      menuItemsByCategory,
      event: {
        id: event.id,
        title: event.title,
        eventType: event.eventType,
        customerType: event.customerType,
        eventDate: event.eventDate.toISOString(),
        startTime: event.startTime?.toISOString() ?? null,
        endTime: event.endTime?.toISOString() ?? null,
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
    return handleRouteError(res, e, "Quotes");
  }
});

/** List quotes for an event — register before `/:id` */
router.get("/event/:eventId", async (req: Request, res: Response) => {
  try {
    const eventId = paramId(req, "eventId");
    const perf = timer(`quotes:event:${eventId}`);

    const { caterer } = await getAuthorizedSession(req, "quotes:read");
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
    return handleRouteError(res, e, "Quotes");
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "quotes:write");
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
    return handleRouteError(res, e, "Quotes");
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "quotes:read");
    const quote = await loadQuoteForCaterer(paramId(req), caterer.id);
    if (!quote) {
      return res.status(404).json({ error: "Quote not found." });
    }
    return res.json({ quote: serializeQuote(quote as QuoteWithRelations) });
  } catch (e) {
    return handleRouteError(res, e, "Quotes");
  }
});

router.patch("/:id/guest-count", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "quotes:write");
    const quoteId = paramId(req);
    const raw = (req.body as { guestCount?: unknown })?.guestCount;
    const parsed = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return res.status(400).json({ error: "guestCount must be a non-negative number." });
    }

    const guestCount = Math.floor(parsed);
    const updated = await updateGuestCountAndPackageTiers(quoteId, caterer.id, guestCount);
    if (!updated) {
      return res.status(404).json({ error: "Quote not found." });
    }

    return res.json({ quote: serializeQuote(updated as QuoteWithRelations) });
  } catch (e) {
    return handleRouteError(res, e, "Quotes");
  }
});

router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "quotes:write");
    const id = paramId(req);
    const perf = timer(`quote:patch:${id}`);
    const body = req.body as {
      taxRate?: number;
      depositPct?: number;
      dueDate?: string | null;
      notes?: string | null;
      status?: string;
      packageSelections?: unknown;
    };

    const updated = await prisma.$transaction(async (tx) => {
      const quote = await tx.quote.findUnique({
        where: { id },
        select: {
          id: true,
          catererId: true,
          taxRate: true,
          depositPct: true,
          eventId: true
        }
      });

      if (!quote || quote.catererId !== caterer.id) {
        throw Object.assign(new Error("Quote not found."), { status: 404 });
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
            throw Object.assign(new Error("Invalid dueDate."), { status: 400 });
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
          throw Object.assign(new Error("Invalid status."), { status: 400 });
        }
        data.status = status;
      }
      if (body.packageSelections !== undefined) {
        const packageSelections = parsePackageSelections(body.packageSelections);
        if (packageSelections === null) {
          throw Object.assign(new Error("Invalid packageSelections."), { status: 400 });
        }
        data.packageSelections = packageSelections;
      }

      const newTaxRate =
        typeof data.taxRate === "number" ? data.taxRate : quote.taxRate;
      const newDepositPct =
        typeof data.depositPct === "number" ? data.depositPct : quote.depositPct;

      if (Object.keys(data).length > 0) {
        await tx.quote.update({ where: { id }, data });
      }

      const lineItems = await tx.quoteLineItem.findMany({ where: { quoteId: id } });
      const event = quote.eventId
        ? await tx.event.findUnique({
            where: { id: quote.eventId },
            select: { guestCountEstimate: true }
          })
        : null;
      const guestCount = event?.guestCountEstimate ?? 0;

      const { grandTotal } = calculateQuoteTotals(
        lineItems,
        newTaxRate,
        newDepositPct,
        guestCount
      );

      return tx.quote.update({
        where: { id },
        data: { totalAmount: grandTotal },
        include: quoteInclude
      });
    });

    perf.step("db:transaction");
    perf.end();

    return res.json({ quote: serializeQuote(updated as QuoteWithRelations) });
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e ? Number((e as { status: number }).status) : 0;
    if (status === 404) return res.status(404).json({ error: "Quote not found." });
    if (status === 400) {
      return res.status(400).json({
        error: e instanceof Error ? e.message : "Invalid request."
      });
    }
    return handleRouteError(res, e, "Quotes");
  }
});

router.post("/:id/items", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "quotes:write");
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

    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, catererId: caterer.id },
      select: { id: true }
    });
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

    const trimmedName = body.name.trim();
    const existing = await prisma.quoteLineItem.findFirst({
      where: {
        quoteId,
        category,
        name: trimmedName,
        unitType
      }
    });

    if (existing) {
      await prisma.quoteLineItem.update({
        where: { id: existing.id },
        data: {
          quantity: existing.quantity + Math.max(0, quantity),
          unitPrice: Math.max(0, body.unitPrice)
        }
      });
    } else {
      await prisma.quoteLineItem.create({
        data: {
          quoteId,
          menuItemId,
          category,
          name: trimmedName,
          quantity: Math.max(0, quantity),
          unitPrice: Math.max(0, body.unitPrice),
          unitType,
          notes: body.notes?.trim() || null
        }
      });
    }

    const updated = await persistQuoteTotals(quoteId);
    if (!updated) {
      return res.status(404).json({ error: "Quote not found." });
    }
    return res.status(201).json({ quote: serializeQuoteTotalsPatch(updated) });
  } catch (e) {
    return handleRouteError(res, e, "Quotes");
  }
});

router.patch("/:id/items/:itemId", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "quotes:write");
    const quoteId = paramId(req);
    const itemId = paramId(req, "itemId");
    const perf = timer(`quote:patch-item:${itemId}`);
    const body = req.body as {
      name?: string;
      quantity?: number;
      unitPrice?: number;
      unitType?: string;
      notes?: string | null;
      category?: string;
    };

    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, catererId: caterer.id },
      select: { id: true }
    });
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

    if (Object.keys(data).length === 0) {
      const full = await loadQuoteForCaterer(quoteId, caterer.id);
      if (!full) {
        return res.status(404).json({ error: "Quote not found." });
      }
      perf.step("db:update");
      perf.end();
      return res.json({ quote: serializeQuote(full as QuoteWithRelations) });
    }

    await prisma.quoteLineItem.update({ where: { id: itemId }, data });
    const updated = await persistQuoteTotals(quoteId);

    if (!updated) {
      return res.status(404).json({ error: "Quote not found." });
    }

    perf.step("db:update");
    perf.end();

    return res.json({ quote: serializeQuoteTotalsPatch(updated) });
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e ? Number((e as { status: number }).status) : 0;
    if (status === 404) {
      return res.status(404).json({
        error: e instanceof Error ? e.message : "Not found."
      });
    }
    if (status === 400) {
      return res.status(400).json({
        error: e instanceof Error ? e.message : "Invalid request."
      });
    }
    return handleRouteError(res, e, "Quotes");
  }
});

router.delete("/:id/items/:itemId", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "quotes:write");
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
    if (!updated) {
      return res.status(404).json({ error: "Quote not found." });
    }
    return res.json({ quote: serializeQuoteTotalsPatch(updated) });
  } catch (e) {
    return handleRouteError(res, e, "Quotes");
  }
});

router.post("/:id/package", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "quotes:write");
    const quoteId = paramId(req);
    const body = req.body as { packageId?: string };
    const perf = timer(`quote:add-package:${quoteId}`);

    if (!body.packageId?.trim()) {
      return res.status(400).json({ error: "packageId is required." });
    }

    const updated = await addPackageToQuote(quoteId, caterer.id, body.packageId!.trim());
    if (!updated) {
      return res.status(404).json({ error: "Quote not found." });
    }

    perf.step("db:add-package");
    perf.end();

    return res.json({ quote: serializeQuoteTotalsPatch(updated) });
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e ? Number((e as { status: number }).status) : 0;
    if (status === 404) {
      return res.status(404).json({ error: e instanceof Error ? e.message : "Not found." });
    }
    if (status === 400) {
      return res.status(400).json({ error: e instanceof Error ? e.message : "Invalid request." });
    }
    return handleRouteError(res, e, "Quotes");
  }
});

router.delete("/:id/package", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "quotes:write");
    const quoteId = paramId(req);
    const perf = timer(`quote:remove-package:${quoteId}`);

    const updated = await removePackageFromQuote(quoteId, caterer.id);
    if (!updated) {
      return res.status(404).json({ error: "Quote not found." });
    }

    perf.step("db:remove-package");
    perf.end();

    return res.json({ quote: serializeQuoteTotalsPatch(updated) });
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e ? Number((e as { status: number }).status) : 0;
    if (status === 404) {
      return res.status(404).json({ error: e instanceof Error ? e.message : "Not found." });
    }
    return handleRouteError(res, e, "Quotes");
  }
});

router.post("/:id/duplicate", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "quotes:write");
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
        packageSelections: source.packageSelections ?? undefined,
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

    await persistQuoteTotals(duplicate.id);
    const full = await loadQuoteForCaterer(duplicate.id, caterer.id);
    return res.status(201).json({
      quote: serializeQuote((full ?? duplicate) as QuoteWithRelations)
    });
  } catch (e) {
    return handleRouteError(res, e, "Quotes");
  }
});

router.post("/:id/pdf", async (req: Request, res: Response) => {
  const quoteId = paramId(req);
  try {
    const { caterer } = await getAuthorizedSession(req, "quotes:read");
    const quote = await loadQuoteForCaterer(quoteId, caterer.id);
    if (!quote) {
      return res.status(404).json({ error: "Quote not found." });
    }

    const { generateQuotePdfBuffer } = await loadQuotePdf();
    const buffer = await generateQuotePdfBuffer(quote as QuoteWithRelations);
    if (!buffer.length) {
      return res.status(500).json({ error: "Generated PDF was empty." });
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("Content-Disposition", `attachment; filename="quote-${quoteId}.pdf"`);
    return res.end(buffer);
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e ? Number((e as { status: number }).status) : 500;
    const message =
      e instanceof Error && e.message ? e.message : "Failed to generate PDF";
    if (process.env.NODE_ENV !== "production") {
      console.error("[pdf route] Error:", { quoteId, message, status });
    }
    return res.status(status === 404 ? 404 : 500).json({
      error: status === 500 ? "Failed to generate PDF" : message
    });
  }
});

type SessionCaterer = Prisma.CatererGetPayload<Record<string, never>>;

async function applySendTierFixes(
  quoteId: string,
  catererId: string,
  lineItems: QuoteWithRelations["lineItems"],
  guestCount: number,
  customerType: CustomerTypeValue
) {
  const tierUpdates: Prisma.PrismaPromise<unknown>[] = [];

  for (const item of lineItems) {
    if (item.unitType !== "tiered_per_head" || item.appliedTier != null) continue;

    const pkg = item.packageId
      ? await prisma.cateringPackage.findFirst({
          where: { id: item.packageId, catererId },
          include: { tiers: { orderBy: { minGuests: "asc" } } }
        })
      : null;

    const activeTier = pkg ? getActiveTier(pkg.tiers, guestCount, customerType) : null;
    if (activeTier) {
      tierUpdates.push(
        prisma.quoteLineItem.update({
          where: { id: item.id },
          data: {
            appliedTier: activeTier.pricePerHead,
            appliedTierLabel: formatTierLabel(activeTier),
            unitPrice: activeTier.pricePerHead,
            notes: formatTierLabel(activeTier)
          }
        })
      );
    }
  }

  if (tierUpdates.length > 0) {
    await prisma.$transaction(tierUpdates);
  }
}

async function processSendJob(quoteId: string, caterer: SessionCaterer) {
  try {
    const quote = await loadQuoteForCaterer(quoteId, caterer.id);
    if (!quote) {
      throw new Error(`Quote ${quoteId} not found for send job.`);
    }

    const guestEmail = quote.event?.primaryGuest?.email?.trim();
    if (!guestEmail) {
      throw new Error(`Quote ${quoteId} has no guest email.`);
    }

    const guestCount = quote.event?.guestCountEstimate ?? 0;
    const customerType = quote.event?.customerType ?? "b2c";

    await applySendTierFixes(quoteId, caterer.id, quote.lineItems, guestCount, customerType);

    const quoteForSend = await loadQuoteForCaterer(quoteId, caterer.id);
    if (!quoteForSend) {
      throw new Error(`Quote ${quoteId} not found after tier fixes.`);
    }

    const resend = getResend();
    if (!resend) {
      throw new Error("Email service is not configured.");
    }

    const quoteData = quoteForSend as QuoteWithRelations;
    const { generateQuotePdfBuffer, buildQuoteEmailHtml } = await loadQuotePdf();
    const pdfBuffer = await generateQuotePdfBuffer(quoteData);
    if (!pdfBuffer.length) {
      throw new Error("Generated PDF was empty.");
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
      throw sendError;
    }

    await prisma.quote.update({
      where: { id: quoteId },
      data: { status: "sent" }
    });

    await persistQuoteTotals(quoteId);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error(`Quote send job failed for ${quoteId}:`, err);
    } else {
      console.error(`Quote send job failed for ${quoteId}:`, err instanceof Error ? err.message : err);
    }

    await prisma.quote.update({
      where: { id: quoteId },
      data: { status: "send_failed" }
    });
  }
}

router.post("/:id/send", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "quotes:write");
    const quoteId = paramId(req);
    const quote = await loadQuoteForCaterer(quoteId, caterer.id);
    if (!quote) {
      return res.status(404).json({ error: "Quote not found." });
    }

    const guestEmail = quote.event?.primaryGuest?.email?.trim();
    if (!guestEmail) {
      return res.status(400).json({ error: "Guest email is required to send the quote." });
    }

    const resend = getResend();
    if (!resend) {
      return res.status(503).json({ error: "Email service is not configured." });
    }

    if (quote.status === "sending") {
      return res.status(202).json({ status: "processing", quoteId });
    }

    const updated = await prisma.quote.updateMany({
      where: { id: quoteId, catererId: caterer.id },
      data: { status: "sending" }
    });
    if (updated.count === 0) {
      return res.status(404).json({ error: "Quote not found." });
    }

    res.status(202).json({ status: "processing", quoteId });

    setImmediate(() => {
      void processSendJob(quoteId, caterer);
    });
  } catch (e) {
    return handleRouteError(res, e, "Quotes");
  }
});

export const quotesRouter = router;
