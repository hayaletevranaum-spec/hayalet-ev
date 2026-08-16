import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { InstalledRoomRecord } from "@shared/index.js";

export const INSTALLED_ROOM_FILE_SNAPSHOT = ".room-install-files.json";

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

export async function collectFilesRecursive(
  baseDir: string,
  currentDir: string = baseDir
): Promise<Array<{ relativePath: string; absolutePath: string }>> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry): Promise<Array<{ relativePath: string; absolutePath: string }>> => {
      if (entry.name === "dist" || entry.name === "node_modules") {
        return [];
      }
      const absolutePath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        return await collectFilesRecursive(baseDir, absolutePath);
      }
      const relativePath = absolutePath.slice(baseDir.length + 1).replace(/\\/g, "/");
      return [{ relativePath, absolutePath }];
    })
  );

  return nestedFiles
    .flat()
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export async function copyDirectoryContents(
  sourceDir: string,
  targetDir: string,
  options: {
    includeRelativePath?: (relativePath: string) => boolean;
  } = {}
): Promise<string[]> {
  const includeRelativePath =
    options.includeRelativePath ?? ((_relativePath: string): boolean => true);
  const files = (await collectFilesRecursive(sourceDir)).filter((file) =>
    includeRelativePath(file.relativePath)
  );
  await rm(targetDir, { recursive: true, force: true });
  await ensureDir(targetDir);

  await Promise.all(
    files.map(async (file): Promise<void> => {
      const targetPath = join(targetDir, file.relativePath);
      await ensureDir(dirname(targetPath));
      await writeFile(targetPath, await readFile(file.absolutePath));
    })
  );

  return files.map((file) => file.relativePath);
}

function getInstalledRoomFileSnapshotPath(installedDir: string): string {
  return join(installedDir, INSTALLED_ROOM_FILE_SNAPSHOT);
}

export async function writeInstalledRoomFileSnapshot(
  installedDir: string,
  relativePaths: string[]
): Promise<void> {
  const normalizedPaths = Array.from(
    new Set(relativePaths.map((path) => path.trim()).filter((path) => path !== ""))
  ).sort((left, right) => left.localeCompare(right));

  await writeFile(
    getInstalledRoomFileSnapshotPath(installedDir),
    JSON.stringify({ files: normalizedPaths }, null, 2),
    "utf8"
  );
}

async function readInstalledRoomFileSnapshot(installedDir: string): Promise<string[] | null> {
  const snapshotPath = getInstalledRoomFileSnapshotPath(installedDir);
  if (existsSync(snapshotPath) !== true) {
    return null;
  }

  try {
    const parsed = JSON.parse(await readFile(snapshotPath, "utf8")) as { files?: unknown };
    if (Array.isArray(parsed.files) !== true) {
      return null;
    }

    return parsed.files.filter(
      (value): value is string => typeof value === "string" && value.trim() !== ""
    );
  } catch {
    return null;
  }
}

function collectParentDirectories(relativePath: string): string[] {
  const directories: string[] = [];
  let current = dirname(relativePath);

  while (current !== "." && current !== "") {
    directories.push(current);
    const next = dirname(current);
    if (next === current) {
      break;
    }
    current = next;
  }

  return directories;
}

export async function deleteInstalledRoomCopies(
  installedDir: string,
  relativePaths: string[]
): Promise<void> {
  const normalizedPaths = Array.from(
    new Set(
      [...relativePaths, INSTALLED_ROOM_FILE_SNAPSHOT]
        .map((path) => path.trim())
        .filter((path) => path !== "")
    )
  ).sort((left, right) => right.length - left.length);

  const parentDirectories = new Set<string>();
  // NOTE: Deletes are ordered to remove deepest paths first.
  /* eslint-disable no-await-in-loop */
  for (const relativePath of normalizedPaths) {
    await rm(join(installedDir, relativePath), { force: true });
    collectParentDirectories(relativePath).forEach((directory) => {
      parentDirectories.add(directory);
    });
  }

  for (const directory of Array.from(parentDirectories).sort(
    (left, right) => right.length - left.length
  )) {
    try {
      await rm(join(installedDir, directory), { force: true });
    } catch {
      // Ignore non-empty directories so user-created files remain in place.
    }
  }
  /* eslint-enable no-await-in-loop */

  try {
    await rm(installedDir, { force: true });
  } catch {
    // Ignore non-empty roots so user-created files remain in place.
  }
}

export async function resolveInstalledRoomTrackedFiles(
  room: Pick<InstalledRoomRecord, "installedDir" | "sourceDir">
): Promise<string[]> {
  const snapshotFiles = await readInstalledRoomFileSnapshot(room.installedDir);
  if (snapshotFiles !== null) {
    return snapshotFiles;
  }

  if (existsSync(room.sourceDir) !== true) {
    return [];
  }

  return (await collectFilesRecursive(room.sourceDir)).map((file) => file.relativePath);
}
