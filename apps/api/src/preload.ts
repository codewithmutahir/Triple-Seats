/**
 * Loaded via `tsx --import` before the API entry module so DATABASE_URL and
 * other env vars exist before Prisma / Better Auth modules initialize.
 */
import { loadEnv } from "./lib/load-env";

loadEnv();
