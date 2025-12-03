#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OWNER = "orbit-format";
const REPO = "orbit";
const ASSET_PREFIX = "orbit-core";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const packageJsonPath = path.join(packageRoot, "package.json");
const srcDir = path.join(packageRoot, "src");
const distDir = path.join(packageRoot, "dist");
const wasmOut = path.join(srcDir, "orbit_core.wasm");
const wasmDir = path.dirname(wasmOut);

async function readPackageVersion() {
  const raw = await fs.readFile(packageJsonPath, "utf8");
  const pkg = JSON.parse(raw);
  if (!pkg.version) {
    throw new Error(
      `[orbit-js]: Missing version field in ${path.relative(packageRoot, packageJsonPath)}`,
    );
  }
  return pkg.version;
}

function buildTagCandidates(version) {
  const override = process.env.ORBIT_WASM_TAG;
  if (override) {
    return [override];
  }
  const candidates = [`v${version}`];
  if (!version.startsWith("v")) {
    candidates.push(version);
  }
  return candidates;
}

async function downloadWasmForTag(tag) {
  const assetName = `${ASSET_PREFIX}-${tag}.wasm`;
  const url = `https://github.com/${OWNER}/${REPO}/releases/download/${tag}/${assetName}`;
  console.log(`[orbit-js]: Fetching ${assetName} for tag ${tag}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `[orbit-js]: Failed to download ${assetName} (HTTP ${response.status} ${response.statusText})`,
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(wasmDir, { recursive: true });
  await fs.writeFile(wasmOut, bytes);
  console.log(
    `[orbit-js]: Saved wasm artifact to ${path.relative(packageRoot, wasmOut)}`,
  );
  await fs.mkdir(distDir, { recursive: true });
  const distWasmOut = path.join(distDir, "orbit_core.wasm");
  await fs.writeFile(distWasmOut, bytes);
  console.log(
    `[orbit-js]: Saved wasm artifact to ${path.relative(packageRoot, distWasmOut)}`,
  );
}

async function main() {
  const version = await readPackageVersion();
  const tagCandidates = buildTagCandidates(version);
  let lastError = null;

  for (const tag of tagCandidates) {
    try {
      await downloadWasmForTag(tag);
      return;
    } catch (error) {
      lastError = error;
      console.warn(
        `[orbit-js]: Unable to download wasm for tag ${tag}: ${error.message}`,
      );
    }
  }

  throw new Error(
    `[orbit-js]: Failed to download orbit_core.wasm. Tried tags: ${tagCandidates.join(", ")}. ` +
      "Set ORBIT_WASM_TAG to override the release tag.",
    { cause: lastError },
  );
}

main().catch((err) => {
  console.error(`[orbit-js]: ${err.stack}`);
  process.exit(1);
});
