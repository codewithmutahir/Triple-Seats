import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const staging = path.join(os.tmpdir(), `tripeseats-api-hostinger-staging-${process.pid}`);
const out = path.join(root, "tripeseats-api-hostinger-v2.zip");

const copyItems = [
  "tsconfig.base.json",
  "apps/api/src",
  "apps/api/dist",
  "apps/api/package.json",
  "apps/api/tsconfig.json",
  "packages/database/src",
  "packages/database/dist",
  "packages/database/package.json",
  "packages/database/tsconfig.json",
  "packages/database/prisma"
];

const rootPkg = `{
  "name": "tripeseats-api-hostinger",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "build": "npx prisma@5.22.0 generate --schema packages/database/prisma/schema.prisma",
    "start": "node app.js"
  },
  "engines": {
    "node": "20"
  },
  "dependencies": {
    "prisma": "5.22.0"
  }
}
`;

function writeUtf8(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function copyRecursive(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function removeNodeModules(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") {
        fs.rmSync(full, { recursive: true, force: true });
      } else {
        removeNodeModules(full);
      }
    }
  }
}

function prismaClientExists() {
  const candidates = [
    path.join(
      root,
      "node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client/index.js"
    ),
    path.join(root, "node_modules/.prisma/client/index.js"),
    path.join(root, "packages/database/node_modules/.prisma/client/index.js")
  ];
  return candidates.some((candidate) => fs.existsSync(candidate));
}

function runCommand(cmd, args, label) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) {
    console.error(`Pre-build failed: ${label ?? `${cmd} ${args.join(" ")}`}`);
    process.exit(result.status ?? 1);
  }
}

function runPrebuild() {
  console.log("Pre-building API dist locally...");

  const generate = spawnSync("pnpm", ["db:generate"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (generate.status !== 0) {
    if (prismaClientExists()) {
      console.warn(
        "prisma generate failed (Windows file lock). Using existing Prisma client.\n" +
          "Stop `pnpm dev` / API servers (ports 3000 & 4000) and re-run for a clean generate."
      );
    } else {
      console.error("Pre-build failed: pnpm db:generate");
      process.exit(generate.status ?? 1);
    }
  }

  runCommand("pnpm", ["--filter", "@tripeseats/database", "build"], "database build");
  runCommand("pnpm", ["--filter", "api", "build"], "api build");
}

function createZip(sourceDir, zipPath) {
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true });

  if (process.platform === "win32") {
    const ps = `Compress-Archive -Path '${sourceDir.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -CompressionLevel Optimal -Force`;
    const result = spawnSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { stdio: "inherit" }
    );
    if (result.status !== 0) process.exit(result.status ?? 1);
    return;
  }

  const result = spawnSync("zip", ["-qr", zipPath, "."], {
    cwd: sourceDir,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    console.error("zip command failed — install zip on this system.");
    process.exit(result.status ?? 1);
  }
}

function main() {
  runPrebuild();

  if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });

  for (const item of copyItems) {
    copyRecursive(path.join(root, item), path.join(staging, item));
  }

  writeUtf8(path.join(staging, "package.json"), rootPkg);
  writeUtf8(path.join(staging, "app.js"), "require('./apps/api/dist/index.js');\n");

  const apiPkgPath = path.join(staging, "apps/api/package.json");
  const apiPkg = JSON.parse(fs.readFileSync(apiPkgPath, "utf8"));
  apiPkg.scripts.build = "echo dist prebuilt";
  if (apiPkg.dependencies?.["@tripeseats/database"]?.startsWith("workspace:")) {
    apiPkg.dependencies["@tripeseats/database"] = "file:../../packages/database";
  }
  writeUtf8(apiPkgPath, `${JSON.stringify(apiPkg, null, 2)}\n`);

  const dbPkgPath = path.join(staging, "packages/database/package.json");
  const dbPkg = JSON.parse(fs.readFileSync(dbPkgPath, "utf8"));
  dbPkg.devDependencies ??= {};
  dbPkg.devDependencies.prisma = "^5.22.0";
  writeUtf8(dbPkgPath, `${JSON.stringify(dbPkg, null, 2)}\n`);

  removeNodeModules(staging);
  createZip(staging, out);
  fs.rmSync(staging, { recursive: true, force: true });

  const sizeMb = (fs.statSync(out).size / (1024 * 1024)).toFixed(2);
  console.log(`Created ${out} (${sizeMb} MB)`);
}

main();
