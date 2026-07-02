import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import axios from "axios";
import { Upload } from "tus-js-client";

import { getAccessToken, hostingerFetch } from "./hostinger-api-client.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const domain = process.argv[2] || process.env.HOSTINGER_DEPLOY_DOMAIN;
const archivePath =
  process.argv[3] || path.join(repoRoot, "tripeseats-api-hostinger.zip");

if (!domain) {
  console.error("Usage: node scripts/hostinger-deploy-api.mjs <domain> [archive.zip]");
  process.exit(1);
}

if (!fs.existsSync(archivePath)) {
  console.error(`Archive not found: ${archivePath}`);
  process.exit(1);
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

async function resolveUsername(targetDomain) {
  const data = await hostingerFetch(
    `/api/hosting/v1/websites?domain=${encodeURIComponent(targetDomain)}`
  );
  const site = data?.data?.[0];
  if (!site?.username) {
    throw new Error(`No website found for domain: ${targetDomain}`);
  }
  return site.username;
}

async function fetchUploadCredentials(username, targetDomain) {
  return hostingerFetch("/api/hosting/v1/files/upload-urls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, domain: targetDomain })
  });
}

function uploadFile(filePath, relativePath, uploadUrl, authRestToken, authToken) {
  return new Promise((resolve, reject) => {
    const stats = fs.statSync(filePath);
    const fileStream = fs.createReadStream(filePath);
    const cleanUploadUrl = uploadUrl.replace(/\/$/, "");
    const normalizedPath = normalizePath(relativePath);
    const uploadUrlWithFile = `${cleanUploadUrl}/${normalizedPath}?override=true`;
    const requestHeaders = {
      "X-Auth": authToken,
      "X-Auth-Rest": authRestToken,
      "upload-length": stats.size.toString(),
      "upload-offset": "0"
    };

    axios
      .post(uploadUrlWithFile, "", {
        headers: requestHeaders,
        timeout: 60_000,
        validateStatus: (status) => status === 201
      })
      .then(() => {
        const upload = new Upload(fileStream, {
          uploadUrl: uploadUrlWithFile,
          retryDelays: [1000, 2000, 4000, 8000, 16000, 20000],
          uploadDataDuringCreation: false,
          parallelUploads: 1,
          chunkSize: 10_485_760,
          headers: requestHeaders,
          removeFingerprintOnSuccess: true,
          uploadSize: stats.size,
          metadata: { filename: path.basename(relativePath) },
          onError: (error) => reject(error),
          onSuccess: () => resolve({ filename: relativePath })
        });
        upload.start();
      })
      .catch(reject);
  });
}

async function fetchBuildSettings(username, targetDomain, archiveBasename) {
  return hostingerFetch(
    `/api/hosting/v1/accounts/${username}/websites/${targetDomain}/nodejs/builds/settings/from-archive?archive_path=${encodeURIComponent(archiveBasename)}`
  );
}

async function triggerBuild(username, targetDomain, archiveBasename, buildSettings) {
  const buildData = {
    ...buildSettings,
    node_version: buildSettings?.node_version || 20,
    app_type: "express",
    package_manager: "pnpm",
    build_script: "hostinger:build",
    entry_file: "apps/api/dist/index.js",
    root_directory: ".",
    source_type: "archive",
    source_options: { archive_path: archiveBasename }
  };

  return hostingerFetch(
    `/api/hosting/v1/accounts/${username}/websites/${targetDomain}/nodejs/builds`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildData)
    }
  );
}

async function pollBuildLogs(username, targetDomain, uuid) {
  for (let i = 0; i < 60; i++) {
    const builds = await hostingerFetch(
      `/api/hosting/v1/accounts/${username}/websites/${targetDomain}/nodejs/builds?uuid=${encodeURIComponent(uuid)}`
    );
    const build = builds?.data?.[0];
    const state = build?.state ?? "unknown";
    console.log(`[build] state=${state}`);

    const logs = await hostingerFetch(
      `/api/hosting/v1/accounts/${username}/websites/${targetDomain}/nodejs/builds/${uuid}/logs`
    );
    if (logs?.data?.content) {
      process.stdout.write(logs.data.content);
    } else if (logs?.data?.logs) {
      process.stdout.write(logs.data.logs);
    } else if (logs?.logs) {
      process.stdout.write(logs.logs);
    }

    if (state === "completed") {
      console.log("\nBuild completed.");
      return build;
    }
    if (state === "failed") {
      throw new Error("Build failed — see logs above.");
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error("Build timed out.");
}

async function main() {
  console.log(`Deploying to ${domain}`);
  console.log(`Archive: ${archivePath}`);

  const username = await resolveUsername(domain);
  console.log(`Account: ${username}`);

  const creds = await fetchUploadCredentials(username, domain);
  const archiveBasename = path.basename(archivePath);
  console.log("Uploading archive...");
  await uploadFile(archivePath, archiveBasename, creds.url, creds.rest_auth_key, creds.auth_key);
  console.log("Upload complete.");

  console.log("Resolving build settings...");
  let buildSettings;
  try {
    buildSettings = await fetchBuildSettings(username, domain, archiveBasename);
  } catch (err) {
    buildSettings = {};
    console.warn("Auto-detect failed, using manual overrides.", err.message);
  }

  console.log("Starting build...");
  const build = await triggerBuild(username, domain, archiveBasename, buildSettings);
  const uuid = build?.data?.uuid ?? build?.uuid;
  if (!uuid) {
    console.log(JSON.stringify(build, null, 2));
    throw new Error("Build started but no uuid returned.");
  }

  console.log(`Build uuid: ${uuid}`);
  await pollBuildLogs(username, domain, uuid);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
