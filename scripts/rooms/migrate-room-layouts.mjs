import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectoryEmpty(targetPath) {
  try {
    const entries = await readdir(targetPath);
    return entries.length === 0;
  } catch {
    return false;
  }
}

async function removeEmptyDirectoryChain(startPath, stopPath, dryRun, removedDirectories) {
  let currentPath = startPath;
  const resolvedStopPath = resolve(stopPath);

  while (resolve(currentPath).startsWith(resolvedStopPath)) {
    if ((await pathExists(currentPath)) !== true) {
      currentPath = dirname(currentPath);
      continue;
    }

    if ((await isDirectoryEmpty(currentPath)) !== true) {
      return;
    }

    removedDirectories.push(currentPath);
    if (dryRun !== true) {
      await rm(currentPath, { recursive: true, force: true });
    }

    if (resolve(currentPath) === resolvedStopPath) {
      return;
    }
    currentPath = dirname(currentPath);
  }
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function movePath(sourcePath, targetPath, dryRun, movedEntries, skippedEntries) {
  if ((await pathExists(sourcePath)) !== true) {
    return false;
  }

  if ((await pathExists(targetPath)) === true) {
    skippedEntries.push({
      sourcePath,
      targetPath,
      reason: "target-exists",
    });
    return false;
  }

  movedEntries.push({
    sourcePath,
    targetPath,
  });

  if (dryRun === true) {
    return true;
  }

  await mkdir(dirname(targetPath), { recursive: true });
  await rename(sourcePath, targetPath);
  return true;
}

async function collectRoomIds(workspaceRoot) {
  if ((await pathExists(workspaceRoot)) !== true) {
    return [];
  }

  const entries = await readdir(workspaceRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function collectBundleArtifacts(distDir) {
  if ((await pathExists(distDir)) !== true) {
    return [];
  }

  const entries = await readdir(distDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(distDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectBundleArtifacts(absolutePath)));
      continue;
    }

    if (absolutePath.endsWith(".hevroom") || absolutePath.endsWith(".hevroom.json")) {
      files.push(absolutePath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function migrateWorkspaceDistBundles(workspaceRoot, storageRoot, dryRun, summary) {
  const roomIds = await collectRoomIds(workspaceRoot);

  for (const roomId of roomIds) {
    const roomDir = join(workspaceRoot, roomId);
    const distDir = join(roomDir, "dist");
    const bundleFiles = await collectBundleArtifacts(distDir);

    for (const bundleFile of bundleFiles) {
      await movePath(
        bundleFile,
        join(storageRoot, roomId, "exports", bundleFile.split(/[/\\]/).pop()),
        dryRun,
        summary.moved,
        summary.skipped
      );
    }

    await removeEmptyDirectoryChain(distDir, roomDir, dryRun, summary.removedDirectories);
  }
}

function collectLaboratoryLegacyMappings(schema) {
  const files = schema?.files ?? {};
  const legacy = files.legacy ?? {};
  const features = files.features ?? files.mainFunctions ?? {};

  const mappings = [];
  const mediaFiles = features["media-analysis"] ?? {};

  if (legacy.editDir && mediaFiles.editDir) {
    mappings.push({ legacyRelative: legacy.editDir, targetRelative: mediaFiles.editDir });
  }
  if (legacy.profileDir && mediaFiles.profileDir) {
    mappings.push({ legacyRelative: legacy.profileDir, targetRelative: mediaFiles.profileDir });
  }
  if (legacy.processDir && files.processDir) {
    mappings.push({ legacyRelative: legacy.processDir, targetRelative: files.processDir });
  }
  if (legacy.reportDir && files.reportDir) {
    mappings.push({ legacyRelative: legacy.reportDir, targetRelative: files.reportDir });
  }
  return mappings;
}

async function migrateLaboratoryProjectLayouts(storageRoot, schemaPath, dryRun, summary) {
  if ((await pathExists(schemaPath)) !== true) {
    return;
  }

  const schema = await readJsonFile(schemaPath);
  const mappings = collectLaboratoryLegacyMappings(schema);
  const projectsRoot = join(storageRoot, "laboratory", "projects");

  if ((await pathExists(projectsRoot)) !== true) {
    return;
  }

  const entries = await readdir(projectsRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const projectDir = join(projectsRoot, entry.name);
    for (const mapping of mappings) {
      const legacyPath = join(projectDir, mapping.legacyRelative);
      const targetPath = join(projectDir, mapping.targetRelative);

      await movePath(legacyPath, targetPath, dryRun, summary.moved, summary.skipped);
    }

    const legacyRoots = [join(projectDir, "derived"), join(projectDir, "reports")];
    for (const legacyRoot of legacyRoots) {
      await removeEmptyDirectoryChain(legacyRoot, projectDir, dryRun, summary.removedDirectories);
    }
  }
}

export async function migrateRoomLayouts(options = {}) {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(options.projectRoot ?? join(scriptDir, "..", ".."));
  const workspaceRoot = resolve(options.workspaceRoot ?? join(projectRoot, "rooms"));
  const storageRoot = resolve(options.storageRoot ?? join(projectRoot, "data", "room-storage"));
  const laboratorySchemaPath = resolve(
    options.laboratorySchemaPath ??
      join(projectRoot, "rooms", "laboratory", "tools", "project-schema.json")
  );
  const dryRun = options.dryRun === true;

  const summary = {
    dryRun,
    moved: [],
    skipped: [],
    removedDirectories: [],
  };

  await migrateWorkspaceDistBundles(workspaceRoot, storageRoot, dryRun, summary);
  await migrateLaboratoryProjectLayouts(storageRoot, laboratorySchemaPath, dryRun, summary);

  return summary;
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (value === "--project-root") {
      options.projectRoot = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--workspace-root") {
      options.workspaceRoot = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--storage-root") {
      options.storageRoot = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--laboratory-schema") {
      options.laboratorySchemaPath = argv[index + 1];
      index += 1;
    }
  }

  return options;
}

async function runCli() {
  const summary = await migrateRoomLayouts(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify({
    dryRun: summary.dryRun,
    moved: summary.moved.map((entry) => ({
      sourcePath: entry.sourcePath,
      targetPath: entry.targetPath,
    })),
    skipped: summary.skipped,
    removedDirectories: summary.removedDirectories,
  }, null, 2));
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
const currentPath = fileURLToPath(import.meta.url);

if (invokedPath === currentPath) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
