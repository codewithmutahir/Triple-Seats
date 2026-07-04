import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { getSession, SessionError } from "../lib/session";
import { timer } from "../lib/perf";
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
  console.error("Packages route error:", e);
  return res.status(500).json({ error: "Internal server error" });
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
    }))
  };
}

async function loadPackages(catererId: string) {
  return prisma.cateringPackage.findMany({
    where: { catererId },
    orderBy: { sortOrder: "asc" },
    include: {
      tiers: { orderBy: { minGuests: "asc" } },
      items: { orderBy: { sortOrder: "asc" } }
    }
  });
}

async function loadPackage(catererId: string, packageId: string) {
  return prisma.cateringPackage.findFirst({
    where: { id: packageId, catererId },
    include: {
      tiers: { orderBy: { minGuests: "asc" } },
      items: { orderBy: { sortOrder: "asc" } }
    }
  });
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const perf = timer("packages");

    const { caterer } = await getSession(req);
    perf.step("session");

    const raw = typeof req.query.customerType === "string" ? req.query.customerType : "b2c";
    const customerType: CustomerTypeValue = isCustomerType(raw) ? raw : "b2c";

    let packages = await loadPackages(caterer.id);
    if (packages.length === 0) {
      await seedPackagesForCaterer(caterer.id);
      packages = await loadPackages(caterer.id);
    }
    perf.step("db:packages+tiers+items");

    perf.end();
    return res.json({ items: packages.map((p) => serializePackage(p, customerType)) });
  } catch (e) {
    return handleSessionError(res, e);
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
};

router.post("/", async (req: Request, res: Response) => {
  try {
    const perf = timer("packages:create");
    const { caterer } = await getSession(req);
    perf.step("session");

    const body = req.body as PackageBody;

    if (!body.name?.trim()) {
      return res.status(400).json({ error: "Package name is required" });
    }

    const existingCount = await prisma.cateringPackage.count({
      where: { catererId: caterer.id }
    });

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
          : undefined
      },
      include: {
        tiers: { orderBy: { minGuests: "asc" } },
        items: { orderBy: { sortOrder: "asc" } }
      }
    });

    perf.step("db:create");
    perf.end();

    return res.status(201).json({ package: serializePackage(pkg) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const perf = timer("packages:update");
    const { caterer } = await getSession(req);
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
    });

    perf.step("db:update");

    const updated = await loadPackage(caterer.id, packageId);
    perf.step("db:reload");
    perf.end();

    return res.json({ package: serializePackage(updated!) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.patch("/tiers/:tierId", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
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
    return handleSessionError(res, e);
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const perf = timer("packages:delete");
    const { caterer } = await getSession(req);
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
    return handleSessionError(res, e);
  }
});

export const packagesRouter = router;
