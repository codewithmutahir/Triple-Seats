import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { getAuthorizedSession } from "../lib/authorized-session";
import { handleRouteError } from "../lib/route-errors";
import { timer } from "../lib/perf";
import { seedPackagesForCaterer } from "../lib/seed-packages";
import { isCustomerType, type CustomerTypeValue } from "../lib/event-customer-types";
import { buildDefaultKitchenQtys, KITCHEN_GUEST_BANDS } from "../lib/package-kitchen-qty-defaults";

const router = Router();

function paramId(req: Request, key = "id"): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0]! : String(raw);
}

const packageInclude = {
  tiers: { orderBy: { minGuests: "asc" as const } },
  items: { orderBy: { sortOrder: "asc" as const } },
  kitchenQtys: { orderBy: [{ guestBand: "asc" as const }, { category: "asc" as const }] }
};

type KitchenQtyInput = {
  guestBand: number;
  category: string;
  quantity: number;
};

function serializeKitchenQtys(
  rows: { guestBand: number; category: string; quantity: number }[]
) {
  return rows.map((row) => ({
    guestBand: row.guestBand,
    category: row.category,
    quantity: row.quantity
  }));
}

function serializePackage(
  pkg: Awaited<ReturnType<typeof loadPackages>>[number],
  customerType?: CustomerTypeValue
) {
  const tiers = customerType
    ? pkg.tiers.filter((t) => t.customerType === customerType)
    : pkg.tiers;
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
    })),
    kitchenQtys: serializeKitchenQtys(pkg.kitchenQtys ?? [])
  };
}

function normalizeKitchenQtyInputs(
  raw: KitchenQtyInput[] | undefined,
  itemLabels: string[]
): KitchenQtyInput[] {
  if (raw?.length) {
    return raw
      .filter(
        (row) =>
          typeof row.category === "string" &&
          row.category.trim() &&
          typeof row.guestBand === "number" &&
          (KITCHEN_GUEST_BANDS as readonly number[]).includes(row.guestBand) &&
          typeof row.quantity === "number" &&
          Number.isFinite(row.quantity)
      )
      .map((row) => ({
        guestBand: row.guestBand,
        category: row.category.trim(),
        quantity: Math.max(0, row.quantity)
      }));
  }
  return buildDefaultKitchenQtys(itemLabels);
}

async function loadPackages(catererId: string) {
  return prisma.cateringPackage.findMany({
    where: { catererId },
    orderBy: { sortOrder: "asc" },
    include: packageInclude
  });
}

async function loadPackage(catererId: string, packageId: string) {
  return prisma.cateringPackage.findFirst({
    where: { id: packageId, catererId },
    include: packageInclude
  });
}

/** Backfill default kitchen qty matrix when package has items but empty matrix. */
async function ensureKitchenQtysForPackages(
  packages: Awaited<ReturnType<typeof loadPackages>>
) {
  let changed = false;
  for (const pkg of packages) {
    if ((pkg.kitchenQtys?.length ?? 0) > 0 || pkg.items.length === 0) continue;
    const rows = buildDefaultKitchenQtys(pkg.items.map((i) => i.label));
    if (rows.length === 0) continue;
    await prisma.packageKitchenQty.createMany({
      data: rows.map((row) => ({
        packageId: pkg.id,
        guestBand: row.guestBand,
        category: row.category,
        quantity: row.quantity
      }))
    });
    changed = true;
  }
  return changed;
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const perf = timer("packages");

    const { caterer } = await getAuthorizedSession(req, "settings:read");
    perf.step("session");

    const raw = typeof req.query.customerType === "string" ? req.query.customerType : "b2c";
    const customerType: CustomerTypeValue = isCustomerType(raw) ? raw : "b2c";

    let packages = await loadPackages(caterer.id);
    if (packages.length === 0) {
      await seedPackagesForCaterer(caterer.id);
      packages = await loadPackages(caterer.id);
    }
    if (await ensureKitchenQtysForPackages(packages)) {
      packages = await loadPackages(caterer.id);
    }
    perf.step("db:packages+tiers+items");

    perf.end();
    return res.json({ items: packages.map((p) => serializePackage(p, customerType)) });
  } catch (e) {
    return handleRouteError(res, e, "Packages");
  }
});

type TierInput = {
  customerType: "b2b" | "b2c";
  minGuests: number;
  maxGuests: number | null;
  pricePerHead: number;
};

type ItemInput = {
  label: string;
  quantity: number;
  sortOrder: number;
};

type PackageBody = {
  name?: string;
  description?: string | null;
  minGuests?: number;
  sortOrder?: number;
  items?: ItemInput[];
  tiers?: TierInput[];
  kitchenQtys?: KitchenQtyInput[];
};

router.post("/", async (req: Request, res: Response) => {
  try {
    const perf = timer("packages:create");
    const { caterer } = await getAuthorizedSession(req, "settings:write");
    perf.step("session");

    const body = req.body as PackageBody;

    if (!body.name?.trim()) {
      return res.status(400).json({ error: "Package name is required" });
    }

    const existingCount = await prisma.cateringPackage.count({
      where: { catererId: caterer.id }
    });

    const itemLabels = (body.items ?? []).map((i) => i.label.trim()).filter(Boolean);
    const kitchenQtys = normalizeKitchenQtyInputs(body.kitchenQtys, itemLabels);

    const pkg = await prisma.cateringPackage.create({
      data: {
        catererId: caterer.id,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        minGuests: body.minGuests ?? 200,
        sortOrder: body.sortOrder ?? existingCount + 1,
        items: body.items?.length
          ? {
              create: body.items.map((i, idx) => ({
                label: i.label.trim(),
                quantity: i.quantity ?? 1,
                sortOrder: i.sortOrder ?? idx
              }))
            }
          : undefined,
        tiers: body.tiers?.length
          ? {
              create: body.tiers.map((t) => ({
                customerType: t.customerType,
                minGuests: t.minGuests,
                maxGuests: t.maxGuests,
                pricePerHead: t.pricePerHead
              }))
            }
          : undefined,
        kitchenQtys:
          kitchenQtys.length > 0
            ? {
                create: kitchenQtys.map((row) => ({
                  guestBand: row.guestBand,
                  category: row.category,
                  quantity: row.quantity
                }))
              }
            : undefined
      },
      include: packageInclude
    });

    perf.step("db:create");
    perf.end();

    return res.status(201).json({ package: serializePackage(pkg) });
  } catch (e) {
    return handleRouteError(res, e, "Packages");
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const perf = timer("packages:update");
    const { caterer } = await getAuthorizedSession(req, "settings:write");
    perf.step("session");

    const packageId = paramId(req);
    const body = req.body as PackageBody;

    const existing = await loadPackage(caterer.id, packageId);
    if (!existing) {
      return res.status(404).json({ error: "Package not found" });
    }

    if (body.name !== undefined && !body.name.trim()) {
      return res.status(400).json({ error: "Package name cannot be empty" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.cateringPackage.update({
        where: { id: packageId },
        data: {
          name: body.name?.trim(),
          description: body.description !== undefined ? (body.description?.trim() || null) : undefined,
          minGuests: body.minGuests,
          sortOrder: body.sortOrder
        }
      });

      if (body.items !== undefined) {
        await tx.packageIncludedItem.deleteMany({ where: { packageId } });
        if (body.items.length > 0) {
          await tx.packageIncludedItem.createMany({
            data: body.items.map((i, idx) => ({
              packageId,
              label: i.label.trim(),
              quantity: i.quantity ?? 1,
              sortOrder: i.sortOrder ?? idx
            }))
          });
        }
      }

      if (body.tiers !== undefined) {
        await tx.packagePriceTier.deleteMany({ where: { packageId } });
        if (body.tiers.length > 0) {
          await tx.packagePriceTier.createMany({
            data: body.tiers.map((t) => ({
              packageId,
              customerType: t.customerType,
              minGuests: t.minGuests,
              maxGuests: t.maxGuests,
              pricePerHead: t.pricePerHead
            }))
          });
        }
      }

      if (body.kitchenQtys !== undefined || body.items !== undefined) {
        const labels =
          body.items !== undefined
            ? body.items.map((i) => i.label.trim()).filter(Boolean)
            : existing.items.map((i) => i.label);
        const kitchenQtys = normalizeKitchenQtyInputs(body.kitchenQtys, labels);
        await tx.packageKitchenQty.deleteMany({ where: { packageId } });
        if (kitchenQtys.length > 0) {
          await tx.packageKitchenQty.createMany({
            data: kitchenQtys.map((row) => ({
              packageId,
              guestBand: row.guestBand,
              category: row.category,
              quantity: row.quantity
            }))
          });
        }
      }
    });

    perf.step("db:update");

    const updated = await loadPackage(caterer.id, packageId);
    perf.step("db:reload");
    perf.end();

    return res.json({ package: serializePackage(updated!) });
  } catch (e) {
    return handleRouteError(res, e, "Packages");
  }
});

router.patch("/tiers/:tierId", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "settings:write");
    const tierId = paramId(req, "tierId");
    const body = req.body as { pricePerHead?: unknown };

    const pricePerHead =
      typeof body.pricePerHead === "number" && Number.isFinite(body.pricePerHead)
        ? Math.max(0, body.pricePerHead)
        : null;
    if (pricePerHead === null) {
      return res.status(400).json({ error: "pricePerHead must be a non-negative number." });
    }

    const existing = await prisma.packagePriceTier.findFirst({
      where: { id: tierId, package: { catererId: caterer.id } }
    });
    if (!existing) {
      return res.status(404).json({ error: "Tier not found." });
    }

    const tier = await prisma.packagePriceTier.update({
      where: { id: tierId },
      data: { pricePerHead }
    });

    return res.json({
      tier: {
        id: tier.id,
        customerType: tier.customerType,
        minGuests: tier.minGuests,
        maxGuests: tier.maxGuests,
        pricePerHead: tier.pricePerHead
      }
    });
  } catch (e) {
    return handleRouteError(res, e, "Packages");
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const perf = timer("packages:delete");
    const { caterer } = await getAuthorizedSession(req, "settings:write");
    perf.step("session");

    const packageId = paramId(req);

    const existing = await prisma.cateringPackage.findFirst({
      where: { id: packageId, catererId: caterer.id }
    });

    if (!existing) {
      return res.status(404).json({ error: "Package not found" });
    }

    await prisma.cateringPackage.delete({
      where: { id: packageId }
    });

    perf.step("db:delete");
    perf.end();

    return res.json({ success: true });
  } catch (e) {
    return handleRouteError(res, e, "Packages");
  }
});

export const packagesRouter = router;
