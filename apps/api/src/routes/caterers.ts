import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { ensureCatererSlug, isValidSlug } from "../lib/slug";

const router = Router();

function paramSlug(req: Request): string {
  const raw = req.params.slug;
  return (Array.isArray(raw) ? raw[0] : String(raw)).trim().toLowerCase();
}

/** Public: minimal caterer info for branded lead forms */
router.get("/:slug", async (req: Request, res: Response) => {
  const slug = paramSlug(req);
  if (!isValidSlug(slug)) {
    return res.status(400).json({ error: "Invalid slug." });
  }

  const caterer = await prisma.caterer.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true }
  });

  if (!caterer?.slug) {
    return res.status(404).json({ error: "Caterer not found." });
  }

  return res.json({
    caterer: {
      name: caterer.name,
      slug: caterer.slug
    }
  });
});

export const caterersRouter = router;

/** Used by authenticated dashboard routes after session resolution. */
export async function getCatererPublicProfile(caterer: { id: string; name: string; slug: string | null }) {
  const row = await ensureCatererSlug(caterer);
  const slug = row.slug!;
  const webOrigin = process.env.WEB_ORIGIN?.trim().replace(/\/+$/, "");

  if (!webOrigin) {
    return { name: row.name, slug, bookUrl: null as string | null, dashboardUrl: null as string | null };
  }

  return {
    name: row.name,
    slug,
    bookUrl: `${webOrigin}/book/${encodeURIComponent(slug)}`,
    dashboardUrl: `${webOrigin}/dashboard`
  };
}
