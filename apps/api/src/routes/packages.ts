import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { getSession, SessionError } from "../lib/session";
import { seedPackagesForCaterer } from "../lib/seed-packages";

const router = Router();

function handleSessionError(res: Response, e: unknown) {
  if (e instanceof SessionError) {
    return res.status(e.status).json({ error: e.message });
  }
  console.error("Packages route error:", e);
  return res.status(500).json({ error: "Internal server error" });
}

function serializePackage(
  pkg: Awaited<ReturnType<typeof loadPackages>>[number]
) {
  return {
    id: pkg.id,
    catererId: pkg.catererId,
    name: pkg.name,
    description: pkg.description,
    sortOrder: pkg.sortOrder,
    minGuests: pkg.minGuests,
    tiers: pkg.tiers.map((t) => ({
      id: t.id,
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
    const { caterer } = await getSession(req);

    let packages = await loadPackages(caterer.id);
    if (packages.length === 0) {
      await seedPackagesForCaterer(caterer.id);
      packages = await loadPackages(caterer.id);
    }

    return res.json({ items: packages.map(serializePackage) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

export const packagesRouter = router;
