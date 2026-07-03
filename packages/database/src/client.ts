import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

function createPrismaClient() {
  const isProd = process.env.NODE_ENV === "production";

  const client = new PrismaClient({
    log: isProd
      ? ["error"]
      : [
          { level: "query", emit: "event" },
          { level: "warn", emit: "stdout" },
          { level: "error", emit: "stdout" }
        ],
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  });

  if (!isProd) {
    client.$on("query", (e) => {
      const ms = Number(e.duration);
      if (ms > 100) {
        const emoji = ms > 1000 ? "🔴" : ms > 300 ? "🟡" : "🟢";
        console.log(`${emoji} [prisma] ${ms}ms — ${e.query.slice(0, 80)}...`);
      }
    });
  }

  return client;
}

export const prisma = globalThis.prismaGlobal ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}

/** Warm up the connection pool — call once on API startup. */
export async function connectDB() {
  await prisma.$connect();
  console.log("[db] Connected to database");
}

/** Graceful shutdown — disconnect Prisma */
export async function disconnectDB() {
  await prisma.$disconnect();
}
