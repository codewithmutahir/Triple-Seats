/**
 * Applies caterers.slug when Prisma migrate can't reach DIRECT_URL.
 * Safe to re-run (IF NOT EXISTS).
 *
 * Run from apps/api: pnpm db:patch-slug
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("@tripeseats/database");

  const statements = [
    `ALTER TABLE "caterers" ADD COLUMN IF NOT EXISTS "slug" TEXT`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "caterers_slug_key" ON "caterers"("slug")`
  ];

  console.log("Applying caterers.slug schema patch...");
  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
    console.log("OK:", sql);
  }

  const cols = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'caterers' AND column_name = 'slug'
  `;
  if (cols.length === 0) {
    console.error("Migration incomplete: caterers.slug column still missing.");
    process.exit(1);
  }

  console.log("caterers.slug ready.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
