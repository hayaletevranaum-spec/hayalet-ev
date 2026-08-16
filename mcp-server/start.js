#!/usr/bin/env node
import { spawn } from "child_process";
import { createRequire } from "module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");
const standaloneEntryPoint = join(projectRoot, "dist", "mcp-server", "standalone", "index.js");
const sourceEntryPoint = join(__dirname, "index.ts");
const sourceTsconfigPath = join(__dirname, "tsconfig.mcp.json");

function hasSourceRuntimeSupport() {
  if (existsSync(sourceEntryPoint) !== true) {
    return false;
  }

  try {
    require.resolve("tsx");
    return true;
  } catch {
    return false;
  }
}

const canUseSourceRuntime = hasSourceRuntimeSupport();
const canUseStandaloneRuntime = existsSync(standaloneEntryPoint);
// NOTE: Repo/dev environments should prefer source+tsx; packaged mirrors fall back to the standalone bundle.
const entryArgs = canUseSourceRuntime
  ? ["--import", "tsx", sourceEntryPoint]
  : canUseStandaloneRuntime
    ? [standaloneEntryPoint]
    : ["--import", "tsx", sourceEntryPoint];

const child = spawn(
  globalThis.process.execPath,
  [...entryArgs, ...globalThis.process.argv.slice(2)],
  {
    stdio: "inherit",
    shell: false,
    env: {
      ...globalThis.process.env,
      HEV_PROJECT_ROOT: projectRoot,
      TSX_TSCONFIG_PATH: sourceTsconfigPath,
    },
    cwd: projectRoot,
  }
);

child.on("error", (err) => {
  globalThis.console.error("Failed to start MCP server:", err);
  globalThis.process.exit(1);
});

child.on("exit", (code) => {
  globalThis.process.exit(code || 0);
});
