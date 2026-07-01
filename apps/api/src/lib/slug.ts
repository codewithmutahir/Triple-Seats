import { prisma } from "@tripeseats/database";

/** Routes and subdomains that cannot be used as caterer slugs. */
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "book",
  "c",
  "dashboard",
  "health",
  "login",
  "register",
  "www"
]);

export function slugifyName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "caterer";
}

export function isValidSlug(slug: string): boolean {
  if (!slug || slug.length < 2 || slug.length > 48) return false;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return false;
  return !RESERVED_SLUGS.has(slug);
}

/** Picks a unique slug for a caterer name, optionally excluding one row (updates). */
export async function uniqueSlugForName(name: string, excludeId?: string): Promise<string> {
  let base = slugifyName(name);
  if (RESERVED_SLUGS.has(base)) base = `${base}-catering`;

  let candidate = base;
  let suffix = 0;

  while (true) {
    const existing = await prisma.caterer.findUnique({ where: { slug: candidate } });
    if (!existing || (excludeId && existing.id === excludeId)) {
      return candidate;
    }
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

/** Ensures an existing caterer row has a slug (backfill for pre-migration rows). */
export async function ensureCatererSlug(caterer: { id: string; name: string; slug: string | null }) {
  if (caterer.slug?.trim()) {
    return prisma.caterer.findUniqueOrThrow({ where: { id: caterer.id } });
  }

  const slug = await uniqueSlugForName(caterer.name, caterer.id);
  return prisma.caterer.update({
    where: { id: caterer.id },
    data: { slug }
  });
}
