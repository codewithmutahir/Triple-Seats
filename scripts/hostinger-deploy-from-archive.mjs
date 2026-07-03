import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getAccessToken, hostingerFetch } from "./hostinger-api-client.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const domain = process.argv[2] || process.env.HOSTINGER_DEPLOY_DOMAIN;
const archivePath =
  process.argv[3] || path.join(repoRoot, "tripeseats-api-hostinger-v2.zip");
const usernameArg = process.argv[4];

if (!domain) {
  console.error(
    "Usage: node scripts/hostinger-deploy-from-archive.mjs <domain> [archive.zip] [username]"
  );
  process.exit(1);
}

if (!fs.existsSync(archivePath)) {
  console.error(`Archive not found: ${archivePath}`);
  process.exit(1);
}

async function resolveUsername(targetDomain) {
  if (usernameArg) return usernameArg;
  const data = await hostingerFetch(
    `/api/hosting/v1/websites?domain=${encodeURIComponent(targetDomain)}`
  );
  const site = data?.data?.[0];
  if (!site?.username) {
    throw new Error(`No website found for domain: ${targetDomain}`);
  }
  return site.username;
}

async function pollBuild(username, targetDomain, uuid) {
  for (let i = 0; i < 90; i++) {
    const builds = await hostingerFetch(
      `/api/hosting/v1/accounts/${username}/websites/${targetDomain}/nodejs/builds?uuid=${encodeURIComponent(uuid)}`
    );
    const build = builds?.data?.[0];
    const state = build?.state ?? "unknown";
    console.log(`[build] state=${state}`);

    try {
      const logs = await hostingerFetch(
        `/api/hosting/v1/accounts/${username}/websites/${targetDomain}/nodejs/builds/${uuid}/logs`
      );
      const content = logs?.data?.content ?? logs?.data?.logs ?? logs?.logs;
      if (content) process.stdout.write(String(content));
    } catch {
      // logs may not exist yet
    }

    if (state === "completed") {
      console.log("\nBuild completed.");
      return;
    }
    if (state === "failed") {
      throw new Error("Build failed — see logs above.");
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error("Build timed out.");
}

async function main() {
  const username = await resolveUsername(domain);
  const archiveName = path.basename(archivePath);
  const archiveBytes = fs.readFileSync(archivePath);

  console.log(`Deploying ${archiveName} (${archiveBytes.length} bytes)`);
  console.log(`Target: ${domain} (${username})`);

  const form = new FormData();
  form.append("archive", new Blob([archiveBytes]), archiveName);
  form.append("package_manager", "npm");
  form.append("build_script", "build");
  form.append("entry_file", "app.js");
  form.append("node_version", "20");
  form.append("app_type", "express");

  const token = await getAccessToken();

  const res = await fetch(
    `https://developers.hostinger.com/api/hosting/v1/accounts/${username}/websites/${domain}/nodejs/builds/from-archive`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      },
      body: form
    }
  );

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new Error(
      `from-archive failed (${res.status}): ${typeof data === "string" ? data : JSON.stringify(data)}`
    );
  }

  const uuid = data?.data?.uuid ?? data?.uuid;
  if (!uuid) {
    console.log(JSON.stringify(data, null, 2));
    throw new Error("Build started but no uuid returned.");
  }

  console.log(`Build uuid: ${uuid}`);
  await pollBuild(username, domain, uuid);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
