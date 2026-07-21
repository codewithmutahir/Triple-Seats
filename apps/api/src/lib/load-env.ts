import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load only `apps/api` env files (never monorepo root `.env`).
 * Root `.env` often has stale/shared keys that must not override API runtime.
 */
export function loadEnv(): void {
  const cwd = process.cwd();
  const apiDir = existsSync(resolve(cwd, "pnpm-workspace.yaml"))
    ? resolve(cwd, "apps/api")
    : cwd;

  const envPath = resolve(apiDir, ".env");
  if (existsSync(envPath)) {
    // File wins over stale shell/CI leftovers (dotenv default is override:false).
    config({ path: envPath, override: true });
  } else {
    // Fallback when cwd is already apps/api and path above missed
    config({ path: resolve(cwd, ".env"), override: true });
  }

  const local = resolve(apiDir, ".env.local");
  if (existsSync(local)) {
    config({ path: local, override: true });
  }
  const cwdLocal = resolve(cwd, ".env.local");
  if (existsSync(cwdLocal) && cwdLocal !== local) {
    config({ path: cwdLocal, override: true });
  }
}
