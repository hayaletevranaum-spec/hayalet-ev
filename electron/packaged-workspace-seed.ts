import { existsSync } from "node:fs";
import { copyFile, cp, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const PACKAGED_WORKSPACE_SEED_PATHS = [
  ".dependency-cruiser.cjs",
  ".gitignore",
  ".nvmrc",
  ".prettierignore",
  ".prettierrc",
  ".rovo",
  "AGENTS.md",
  "LICENSE",
  "PACKAGING.md",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "third-party-licenses",
  "config/backup-scopes.json",
  "data/protocols.json",
  "dist",
  "electron",
  "electron-builder.yml",
  "eslint.config.cjs",
  "ghost-agent",
  "knip.config.ts",
  "mcp-server",
  "package.json",
  "rooms",
  "scripts",
  "shared",
  "src",
  "electron/tsconfig.electron.json",
  "src/tsconfig.json",
  "mcp-server/tsconfig.mcp.json",
  "rooms/tsconfig.rooms.json",
  "vite.config.js",
] as const;

const PACKAGED_RUNTIME_ROOT_DIRS = ["commands", "config", "data", "logs", "rooms"] as const;

function resolvePackagedMirrorRoot(): string | null {
  const resourcesPath =
    typeof process.resourcesPath === "string" ? process.resourcesPath.trim() : "";
  if (resourcesPath === "") {
    return null;
  }

  return dirname(resourcesPath);
}

async function copyMissingEntry(sourcePath: string, targetPath: string): Promise<number> {
  if (existsSync(sourcePath) !== true) {
    return 0;
  }

  if (
    sourcePath.endsWith(".tsbuildinfo") ||
    sourcePath.replace(/\\/g, "/").includes("/rooms/.build")
  ) {
    return 0;
  }

  const sourceStat = await stat(sourcePath);
  const targetStat = await stat(targetPath).catch(() => null);
  if (targetStat === null) {
    await mkdir(dirname(targetPath), { recursive: true });
    if (sourceStat.isDirectory()) {
      await cp(sourcePath, targetPath, {
        force: false,
        recursive: true,
      });
    } else {
      await copyFile(sourcePath, targetPath);
    }

    return 1;
  }

  if (!sourceStat.isDirectory() || !targetStat.isDirectory()) {
    return 0;
  }

  const entries = await readdir(sourcePath);
  const copiedEntries = await Promise.all(
    entries.map(async (entry) => {
      return await copyMissingEntry(join(sourcePath, entry), join(targetPath, entry));
    })
  );

  return copiedEntries.reduce((total, count) => total + count, 0);
}

export async function seedPackagedProjectRoot(targetRoot: string): Promise<{
  copiedEntries: number;
  seeded: boolean;
  skipped: boolean;
}> {
  const mirrorRoot = resolvePackagedMirrorRoot();
  await Promise.all(
    PACKAGED_RUNTIME_ROOT_DIRS.map(async (relativePath) => {
      await mkdir(join(targetRoot, relativePath), { recursive: true });
    })
  );

  if (mirrorRoot === null || resolve(mirrorRoot) === resolve(targetRoot)) {
    return {
      copiedEntries: 0,
      seeded: false,
      skipped: true,
    };
  }

  const copiedEntries = await Promise.all(
    PACKAGED_WORKSPACE_SEED_PATHS.map(async (relativePath) => {
      return await copyMissingEntry(join(mirrorRoot, relativePath), join(targetRoot, relativePath));
    })
  );

  return {
    copiedEntries: copiedEntries.reduce((total, count) => total + count, 0),
    seeded: copiedEntries.some((count) => count > 0),
    skipped: false,
  };
}
