import { prisma } from "@tripeseats/database";

import { getIntakeCatererId } from "./intake-caterer";
import { isValidSlug } from "./slug";

export class CatererResolveError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "CatererResolveError";
  }
}

/** Resolves caterer id from public slug or falls back to LEAD_INTAKE_CATERER_ID. */
export async function resolveLeadCatererId(catererSlug?: string | null): Promise<string> {
  const slug = catererSlug?.trim().toLowerCase();
  if (slug) {
    if (!isValidSlug(slug)) {
      throw new CatererResolveError("Invalid caterer slug.", 400);
    }
    const caterer = await prisma.caterer.findUnique({ where: { slug } });
    if (!caterer) {
      throw new CatererResolveError("Caterer not found.", 404);
    }
    return caterer.id;
  }

  try {
    return await getIntakeCatererId();
  } catch {
    throw new CatererResolveError(
      "This booking page isn't available right now. Please try again later.",
      503
    );
  }
}
