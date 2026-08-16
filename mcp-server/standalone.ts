#!/usr/bin/env node
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import { resolveProjectRootFromFile } from "./utils/project-root.js";

const VERSION = "1.7.0";
const projectRoot = resolveProjectRootFromFile(fileURLToPath(import.meta.url));
process.env["HEV_PROJECT_ROOT"] ??= projectRoot;

try {
  loadEnvFile(join(projectRoot, ".env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  process.stdout.write(`${VERSION}\n`);
  process.exit(0);
}

async function start(): Promise<void> {
  const { main } = await import("./core/server-setup.js");
  void main();
}

void start();
