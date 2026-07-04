import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { parseItemCategory, parseQuoteUnit } from "../lib/quote-serialize";
import { ensureDefaultItemsForCategory } from "../lib/seed-menu-items";
import { getSession, SessionError } from "../lib/session";
import { timer } from "../lib/perf";

const router = Router();

function paramId(req: Request, key = "id"): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0]! : String(raw);
}

function handleSessionError(res: Response, e: unknown) {
  if (e instanceof SessionError) {
    return res.status(e.status).json({ error: e.message });
  }
  console.error("Menu items route error:", e);
  return res.status(500).json({ error: "Internal server error" });
}

function serializeMenuItem(item: {
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

router.get("/", async (req: Request, res: Response) => {
  try {
    const category = parseItemCategory(req.query.category);
    if (!category) {
      return res.status(400).json({ error: "Valid category query param is required." });
    }

    const perf = timer(`menu-items:${category}`);

    const { caterer } = await getSession(req);
    perf.step("session");

    await ensureDefaultItemsForCategory(caterer.id, category);

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const items = await prisma.menuItem.findMany({
      where: {
        catererId: caterer.id,
        category,
        ...(q
          ? { name: { contains: q, mode: "insensitive" as const } }
          : {})
      },
      orderBy: [{ usageCount: "desc" }, { name: "asc" }],
      take: q ? 12 : undefined
    });
    perf.step("db:items");

    perf.end();
    return res.json({ items: items.map(serializeMenuItem) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const body = req.body as {
      category?: string;
      name?: string;
      defaultPrice?: number;
      defaultUnit?: string;
    };

    const category = parseItemCategory(body.category);
    if (!category) {
      return res.status(400).json({ error: "Invalid category." });
    }
    if (!body.name?.trim()) {
      return res.status(400).json({ error: "name is required." });
    }

    const defaultUnit = body.defaultUnit ? parseQuoteUnit(body.defaultUnit) : "per_head";
    if (!defaultUnit) {
      return res.status(400).json({ error: "Invalid defaultUnit." });
    }

    const defaultPrice =
      typeof body.defaultPrice === "number" && Number.isFinite(body.defaultPrice)
        ? Math.max(0, body.defaultPrice)
        : null;

    const item = await prisma.menuItem.create({
      data: {
        catererId: caterer.id,
        category,
        name: body.name.trim(),
        defaultPrice,
        defaultUnit,
        isDefault: false
      }
    });

    return res.status(201).json({ item: serializeMenuItem(item) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.patch("/:id/increment", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const id = paramId(req);

    const existing = await prisma.menuItem.findFirst({
      where: { id, catererId: caterer.id }
    });
    if (!existing) {
      return res.status(404).json({ error: "Menu item not found." });
    }

    const item = await prisma.menuItem.update({
      where: { id },
      data: { usageCount: { increment: 1 } }
    });

    return res.json({ item: serializeMenuItem(item) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const id = paramId(req);

    const body = req.body as {
      name?: string;
      defaultPrice?: number | null;
      defaultUnit?: string;
      category?: string;
    };

    const existing = await prisma.menuItem.findFirst({
      where: { id, catererId: caterer.id }
    });
    if (!existing) {
      return res.status(404).json({ error: "Menu item not found." });
    }

    const updateData: {
      name?: string;
      defaultPrice?: number | null;
      defaultUnit?: "per_head" | "by_tray" | "flat" | "tiered_per_head";
    } = {};

    if (body.name !== undefined) {
      const name = body.name?.trim();
      if (!name) {
        return res.status(400).json({ error: "Name cannot be empty." });
      }
      const duplicate = await prisma.menuItem.findFirst({
        where: {
          catererId: caterer.id,
          category: existing.category,
          name: { equals: name, mode: "insensitive" },
          id: { not: id }
        }
      });
      if (duplicate) {
        return res.status(409).json({ error: "An item with this name already exists in this category." });
      }
      updateData.name = name;
    }

    if (body.defaultPrice !== undefined) {
      updateData.defaultPrice =
        body.defaultPrice !== null && Number.isFinite(body.defaultPrice)
          ? Math.max(0, body.defaultPrice)
          : null;
    }

    if (body.defaultUnit !== undefined) {
      const unit = parseQuoteUnit(body.defaultUnit);
      if (!unit) {
        return res.status(400).json({ error: "Invalid defaultUnit." });
      }
      updateData.defaultUnit = unit;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    const item = await prisma.menuItem.update({
      where: { id },
      data: updateData
    });

    return res.json({ item: serializeMenuItem(item) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const id = paramId(req);

    const existing = await prisma.menuItem.findFirst({
      where: { id, catererId: caterer.id }
    });
    if (!existing) {
      return res.status(404).json({ error: "Menu item not found." });
    }

    await prisma.menuItem.delete({
      where: { id }
    });

    return res.json({ success: true });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

export const menuItemsRouter = router;
