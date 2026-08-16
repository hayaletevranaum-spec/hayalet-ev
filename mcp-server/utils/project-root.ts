import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function isProjectRoot(candidateDir: string): boolean {
  return (
    existsSync(join(candidateDir, "package.json")) && existsSync(join(candidateDir, "AGENTS.md"))
  );
}

export function resolveProjectRootFromFile(moduleFileName: string): string {
  const envRoot = process.env["HEV_PROJECT_ROOT"]?.trim();
  if (envRoot !== undefined && envRoot !== "" && isProjectRoot(envRoot)) {
    return resolve(envRoot);
  }

  let currentDir = dirname(moduleFileName);

  for (;;) {
    if (isProjectRoot(currentDir)) return currentDir;

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  const normalizedFileName = moduleFileName.replaceAll("\\", "/");
  if (normalizedFileName.includes("/dist/mcp-server/mcp-server/")) {
    return resolve(dirname(moduleFileName), "..", "..", "..", "..");
  }

  return resolve(dirname(moduleFileName), "..", "..");
}

function resolveProjectRootFromProcess(): string {
  const envRoot = process.env["HEV_PROJECT_ROOT"]?.trim();
  if (envRoot !== undefined && envRoot !== "" && isProjectRoot(envRoot)) {
    return resolve(envRoot);
  }

  return resolveProjectRootFromFile(fileURLToPath(import.meta.url));
}

export const PROJECT_ROOT = resolveProjectRootFromProcess();
