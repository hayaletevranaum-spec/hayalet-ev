#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");
const distRoot = join(projectRoot, "dist", "mcp-server");

function ensureDirectory(dirPath) {
  if (existsSync(dirPath)) return false;
  mkdirSync(dirPath, { recursive: true });
  return true;
}

function syncDirectory(sourceDir, destinationDir) {
  if (!existsSync(sourceDir)) {
    ensureDirectory(sourceDir);
    ensureDirectory(destinationDir);
    console.warn(`⚠️ MCP build source missing; created empty directory: ${sourceDir}`);
    return false;
  }

  mkdirSync(dirname(destinationDir), { recursive: true });
  cpSync(sourceDir, destinationDir, {
    force: true,
    recursive: true,
  });
  return true;
}

const syncTargets = [
  {
    source: join(distRoot, "src", "types"),
    destination: join(distRoot, "types"),
  },
];

for (const target of syncTargets) {
  if (syncDirectory(target.source, target.destination)) {
    console.log(`✅ Synced ${target.source} -> ${target.destination}`);
  }
}
