import { readFile, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import {
  ROOM_SCHEMA_VERSION,
  type InstalledRoomRecord,
  type RoomBundle,
  type RoomBundleFile,
} from "@shared/index.js";
import { collectFilesRecursive, ensureDir, readJsonFile } from "./room-install-files.ts";
import type { BuildWorkspaceRoomArtifactResult } from "./workspace-room-build.ts";
import { validateRoomBundle } from "./room-bundle-validation.ts";

interface PackageWorkspaceRoomBundleParams {
  outputFile?: string;
  prepareWorkspaceRoomBuild: () => Promise<BuildWorkspaceRoomArtifactResult>;
}

interface ImportRoomBundleFileParams {
  bundleFile: string;
  ensureRoots: () => Promise<void>;
  getWorkspaceRoot: () => string;
  installFromWorkspace: (roomId: string) => Promise<{
    success: boolean;
    error?: string;
    room?: InstalledRoomRecord;
    restartRequired?: boolean;
  }>;
  options?: { overwriteWorkspace?: boolean };
  roomPackageError: (
    key: string,
    detail?: unknown,
    params?: Record<string, string | number | boolean>
  ) => Promise<string>;
  roomPackageT: (
    key: string,
    params?: Record<string, string | number | boolean>
  ) => Promise<string>;
}

export async function packageWorkspaceRoomBundle({
  outputFile,
  prepareWorkspaceRoomBuild,
}: PackageWorkspaceRoomBundleParams): Promise<{
  success: boolean;
  error?: string;
  path?: string;
}> {
  const buildResult = await prepareWorkspaceRoomBuild();
  if (buildResult.success !== true) {
    return { success: false, error: buildResult.error };
  }

  const { artifact } = buildResult;
  const targetManifest = artifact.workspaceRoom.manifest;
  if (targetManifest === undefined) {
    return { success: false, error: "workspace manifest missing after build" };
  }

  const files = await collectFilesRecursive(artifact.buildDir);
  const bundleEntries = await Promise.all(
    files.map(async (file): Promise<[string, RoomBundleFile]> => {
      const content = await readFile(file.absolutePath);
      return [
        file.relativePath,
        {
          encoding: "base64",
          content: content.toString("base64"),
        },
      ];
    })
  );
  const bundleFiles: Record<string, RoomBundleFile> = {};
  bundleEntries.forEach(([relativePath, file]) => {
    bundleFiles[relativePath] = file;
  });

  const bundle: RoomBundle = {
    schemaVersion: ROOM_SCHEMA_VERSION,
    manifest: targetManifest,
    files: bundleFiles,
    exportedAt: new Date().toISOString(),
  };

  const resolvedOutputFile =
    outputFile ?? join(artifact.roomStorageRoot, "exports", `${targetManifest.id}.hevroom.json`);
  await ensureDir(dirname(resolvedOutputFile));
  await writeFile(resolvedOutputFile, JSON.stringify(bundle, null, 2), "utf-8");

  return {
    success: true,
    path: resolvedOutputFile,
  };
}

export async function importRoomBundleFile({
  bundleFile,
  ensureRoots,
  getWorkspaceRoot,
  installFromWorkspace,
  options = {},
  roomPackageError,
  roomPackageT,
}: ImportRoomBundleFileParams): Promise<{
  success: boolean;
  error?: string;
  room?: InstalledRoomRecord;
  path?: string;
  restartRequired?: boolean;
}> {
  const rawBundleFile = bundleFile.trim();
  if (rawBundleFile === "") {
    return { success: false, error: await roomPackageT("bundleFileRequired") };
  }
  const normalizedBundleFile = resolve(rawBundleFile);

  let candidate: unknown;
  try {
    candidate = await readJsonFile<unknown>(normalizedBundleFile);
  } catch (error) {
    return {
      success: false,
      error: await roomPackageError("bundleReadFailed", error),
    };
  }

  const validation = validateRoomBundle(candidate);
  if (validation.valid !== true || validation.bundle === undefined) {
    return {
      success: false,
      error: await roomPackageError("bundleInvalid", validation.errors.join("; ")),
    };
  }

  const { manifest, files } = validation.bundle;
  const workspaceDir = join(getWorkspaceRoot(), manifest.id);
  await ensureRoots();

  if (existsSync(workspaceDir) && options.overwriteWorkspace !== true) {
    return {
      success: false,
      error: await roomPackageT("workspaceRoomExists", { path: workspaceDir }),
    };
  }

  await rm(workspaceDir, { recursive: true, force: true });
  await ensureDir(dirname(workspaceDir));
  await importValidatedRoomBundle({
    files,
    manifest,
    workspaceDir,
  });

  const installResult = await installFromWorkspace(manifest.id);
  if (installResult.success !== true) {
    return installResult;
  }

  return {
    success: true,
    ...(installResult.room !== undefined ? { room: installResult.room } : {}),
    path: workspaceDir,
    restartRequired: true,
  };
}

export async function importValidatedRoomBundle({
  files,
  manifest,
  workspaceDir,
}: {
  files: Record<string, RoomBundleFile>;
  manifest: RoomBundle["manifest"];
  workspaceDir: string;
}): Promise<void> {
  await ensureDir(workspaceDir);

  await Promise.all(
    Object.entries(files).map(async ([relativePath, file]): Promise<void> => {
      const targetPath = join(workspaceDir, relativePath);
      await ensureDir(dirname(targetPath));
      await writeFile(targetPath, Buffer.from(file.content, "base64"));
    })
  );

  await writeFile(join(workspaceDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
}
