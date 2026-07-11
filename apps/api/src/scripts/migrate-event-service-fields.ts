/**
 * Backfills events.serviceType and events.orderMode from legacy eventType.
 * Run after schema migration: pnpm migrate:event-types
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "apps/api/.env") });

function mapLegacy(eventType: string): { serviceType: string; orderMode: string } {
  switch (eventType) {
    case "full_service":
      return { serviceType: "full_service", orderMode: "delivery" };
    case "pickup":
      return { serviceType: "order_by_tray", orderMode: "pickup" };
    case "order_by_tray":
      return { serviceType: "order_by_tray", orderMode: "delivery" };
    case "delivery":
    default:
      return { serviceType: "order_by_tray", orderMode: "delivery" };
  }
}

async function main() {
  const { prisma } = await import("@tripeseats/database");

  const events = await prisma.event.findMany({
    select: { id: true, eventType: true }
  });

  let updated = 0;
  for (const ev of events) {
    const mapped = mapLegacy(ev.eventType);
    await prisma.event.update({
      where: { id: ev.id },
      data: {
        serviceType: mapped.serviceType as "full_service" | "order_by_tray",
        orderMode: mapped.orderMode as "delivery" | "pickup"
      }
    });
    updated += 1;
  }

  console.log(`Backfilled serviceType/orderMode on ${updated} events`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
