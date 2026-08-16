#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");
const distRoot = join(projectRoot, "dist", "mcp-server");
const standaloneOutfile = join(distRoot, "standalone", "index.js");
const tscCliPath = require.resolve("typescript/bin/tsc");
const tsconfigPath = join(projectRoot, "mcp-server", "tsconfig.mcp.json");
const syncScriptPath = join(projectRoot, "scripts", "sync-mcp-dist.mjs");

function runNodeScript(args, label) {
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${String(result.status)}`);
  }
}

async function cleanOutDir() {
  await rm(distRoot, { recursive: true, force: true });
  await mkdir(distRoot, { recursive: true });
}

async function buildStandaloneRuntime() {
  await mkdir(dirname(standaloneOutfile), { recursive: true });
  await build({
    entryPoints: [join(projectRoot, "mcp-server", "standalone.ts")],
    outfile: standaloneOutfile,
    banner: {
      js:
        'import { dirname as __pathDirname } from "node:path"; ' +
        'import { createRequire as __createRequire } from "node:module"; ' +
        'import { fileURLToPath as __fileURLToPath } from "node:url"; ' +
        'const require = __createRequire(import.meta.url); ' +
        'const __filename = __fileURLToPath(import.meta.url); ' +
        'const __dirname = __pathDirname(__filename);',
    },
    bundle: true,
    format: "esm",
    platform: "node",
    sourcemap: true,
    target: "node22",
    tsconfig: tsconfigPath,
  });
}

async function main() {
  await cleanOutDir();
  runNodeScript([tscCliPath, "-p", tsconfigPath, "--incremental", "false"], "MCP tsc emit");
  runNodeScript([syncScriptPath], "MCP dist sync");
  await buildStandaloneRuntime();
}

main().catch((error) => {
  console.error("mcp build failed:", error);
  process.exitCode = 1;
});
