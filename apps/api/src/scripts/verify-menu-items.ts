import "dotenv/config";
import { prisma } from "@tripeseats/database";
import { ensureMenuItemsForCaterer } from "../lib/seed-menu-items";

async function main() {
  const caterer = await prisma.caterer.findFirst();
  if (!caterer) {
    console.log("No caterer found");
    return;
  }
  await ensureMenuItemsForCaterer(caterer.id);
  const items = await prisma.menuItem.findMany({
    where: { catererId: caterer.id, category: "appetizer" },
    orderBy: { name: "asc" }
  });
  console.log("Appetizer items:", items.map((i) => i.name).join(", "));
  await prisma.$disconnect();
}

main();
