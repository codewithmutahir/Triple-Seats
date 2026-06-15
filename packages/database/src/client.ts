import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

function createPrismaClient() {
  return new PrismaClient({
    log: ["warn", "error"],
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  });
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
