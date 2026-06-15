/**
 * Applies schema via the transaction pooler (port 6543).
 * Use when `pnpm db:migrate` fails with P1001 on pooler :5432 but the app
 * connects fine on :6543 (common with VPN / corporate firewalls).
 *
 * Dev-only — prefer `pnpm db:migrate` once DIRECT_URL (db.<ref>.supabase.co) works.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const envText = readFileSync(envPath, "utf8");
const match = envText.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error("DATABASE_URL not found in packages/database/.env");
  process.exit(1);
}
const databaseUrl = match[1].trim().replace(/^["']|["']$/g, "");
if (!databaseUrl.includes(":6543")) {
  console.warn(
    "Warning: DATABASE_URL is not using port 6543 — ensure this is your Supabase pooler URL."
  );
}

process.env.DATABASE_URL = databaseUrl;
process.env.DIRECT_URL = databaseUrl;

const extra = process.argv.slice(2);
const result = spawnSync(
  "pnpm",
  ["exec", "prisma", "db", "push", ...extra],
  { cwd: root, stdio: "inherit", shell: true, env: process.env }
);
process.exit(result.status ?? 1);
