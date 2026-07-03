import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Load `.env`, then `.env.local` overrides (gitignored) for local development. */
export function loadEnv(): void {
  const root = process.cwd();
  config({ path: resolve(root, ".env") });
  const local = resolve(root, ".env.local");
  if (existsSync(local)) {
    config({ path: local, override: true });
  }
}
