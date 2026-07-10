import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { getAuthorizedSession } from "../lib/authorized-session";
import { handleRouteError } from "../lib/route-errors";
import { timer } from "../lib/perf";

const router = Router();

function serializeCaterer(caterer: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  timezone: string | null;
  currencyCode: string;
  websiteUrl: string | null;
  slug: string | null;
}) {
  return {
    id: caterer.id,
    name: caterer.name,
    email: caterer.email,
    phone: caterer.phone,
    timezone: caterer.timezone,
    currencyCode: caterer.currencyCode,
    websiteUrl: caterer.websiteUrl,
    slug: caterer.slug,
  };
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const perf = timer("caterer:get");
    const { caterer } = await getAuthorizedSession(req, "settings:read");
    perf.step("session");

    const full = await prisma.caterer.findUnique({
      where: { id: caterer.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        timezone: true,
        currencyCode: true,
        websiteUrl: true,
        slug: true,
      },
    });

    if (!full) {
      return res.status(404).json({ error: "Caterer not found" });
    }

    perf.step("db:caterer");
    perf.end();

    return res.json({ caterer: serializeCaterer(full) });
  } catch (e) {
    return handleRouteError(res, e, "Caterer");
  }
});

router.patch("/", async (req: Request, res: Response) => {
  try {
    const perf = timer("caterer:patch");
    const { caterer } = await getAuthorizedSession(req, "settings:write");
    perf.step("session");

    const body = req.body as {
      name?: string;
      email?: string;
      phone?: string | null;
      timezone?: string | null;
      currencyCode?: string;
      websiteUrl?: string | null;
    };

    const updateData: {
      name?: string;
      email?: string;
      phone?: string | null;
      timezone?: string | null;
      currencyCode?: string;
      websiteUrl?: string | null;
    } = {};

    if (body.name !== undefined) {
      const name = body.name?.trim();
      if (!name) {
        return res.status(400).json({ error: "Name cannot be empty" });
      }
      updateData.name = name;
    }

    if (body.email !== undefined) {
      const email = body.email?.trim().toLowerCase();
      if (!email || !email.includes("@")) {
        return res.status(400).json({ error: "Valid email is required" });
      }
      const existing = await prisma.caterer.findFirst({
        where: { email, id: { not: caterer.id } },
      });
      if (existing) {
        return res.status(409).json({ error: "Email already in use" });
      }
      updateData.email = email;
    }

    if (body.phone !== undefined) {
      updateData.phone = body.phone?.trim() || null;
    }

    if (body.timezone !== undefined) {
      updateData.timezone = body.timezone?.trim() || null;
    }

    if (body.currencyCode !== undefined) {
      const code = body.currencyCode?.trim().toUpperCase();
      if (code && code.length === 3) {
        updateData.currencyCode = code;
      }
    }

    if (body.websiteUrl !== undefined) {
      updateData.websiteUrl = body.websiteUrl?.trim() || null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const updated = await prisma.caterer.update({
      where: { id: caterer.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        timezone: true,
        currencyCode: true,
        websiteUrl: true,
        slug: true,
      },
    });

    perf.step("db:update");
    perf.end();

    return res.json({ caterer: serializeCaterer(updated) });
  } catch (e) {
    return handleRouteError(res, e, "Caterer");
  }
});

export const catererRouter = router;
