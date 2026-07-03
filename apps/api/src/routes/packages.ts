import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { getSession, SessionError } from "../lib/session";
import { timer } from "../lib/perf";
import { seedPackagesForCaterer } from "../lib/seed-packages";
import { isCustomerType, type CustomerTypeValue } from "../lib/event-customer-types";

const router = Router();

function handleSessionError(res: Response, e: unknown) {
  if (e instanceof SessionError) {
    return res.status(e.status).json({ error: e.message });
  }
  console.error("Packages route error:", e);
  return res.status(500).json({ error: "Internal server error" });
}

function serializePackage(
  pkg: Awaited<ReturnType<typeof loadPackages>>[number],
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

export const packagesRouter = router;
