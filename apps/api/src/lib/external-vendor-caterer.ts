import { prisma } from "@tripeseats/database";

const EXTERNAL_SLUG = "external-vendors";
const EXTERNAL_NAME = "External Vendors";
const EXTERNAL_EMAIL = "external-vendors@tripeseats.internal";

/**
 * Platform bucket for external calendar-only vendors (not tied to a caterer business).
 * Optional override via EXTERNAL_VENDOR_CATERER_ID.
 */
export async function getExternalVendorCaterer() {
  const configuredId = process.env.EXTERNAL_VENDOR_CATERER_ID?.trim();
  if (configuredId) {
    const found = await prisma.caterer.findUnique({ where: { id: configuredId } });
    if (found) return found;
    throw Object.assign(new Error("EXTERNAL_VENDOR_CATERER_ID is not a valid caterer id."), {
      status: 503
    });
  }

  const bySlug = await prisma.caterer.findFirst({ where: { slug: EXTERNAL_SLUG } });
  if (bySlug) return bySlug;

  try {
    return await prisma.caterer.create({
      data: {
        name: EXTERNAL_NAME,
        slug: EXTERNAL_SLUG,
        email: EXTERNAL_EMAIL
      }
    });
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
    if (code === "P2002") {
      const again = await prisma.caterer.findFirst({ where: { slug: EXTERNAL_SLUG } });
      if (again) return again;
    }
    throw e;
  }
}
