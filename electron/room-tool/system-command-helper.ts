import { existsSync } from "fs";
import { readFile, rename } from "fs/promises";
import { dirname, join, relative, resolve } from "path";
import { Paths } from "../paths.ts";
import { ensureDir, runCommand } from "./archive-helper.ts";
import { asNonEmptyString, detectPlatformKey } from "./python-manager.ts";
import type {
  RoomToolRuntimePaths,
  RoomToolStatus,
  RoomToolProgressEvent,
} from "../../src/types/room-tools.ts";

export function ensureAbsolutePath(targetPath: string): string {
  return resolve(Paths.getProjectRoot(), targetPath);
}

export function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = relative(ensureAbsolutePath(parentPath), ensureAbsolutePath(childPath));
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") &&
      !relativePath.includes(`..${process.platform === "win32" ? "\\" : "/"}`))
  );
}

export function getInstalledSharedToolsDir(paths: RoomToolRuntimePaths): string {
  return join(paths.installedDir, "shared", "data", "tools");
}

export function getWorkspaceToolsDir(paths: RoomToolRuntimePaths): string {
  return join(Paths.getRoomsWorkspaceDir(), paths.roomId, "tools");
}

export function getToolchainManifestCandidates(paths: RoomToolRuntimePaths): string[] {
  return Array.from(
    new Set([
      join(paths.packageToolsDir, "toolchain.manifest.json"),
      join(getInstalledSharedToolsDir(paths), "toolchain.manifest.json"),
      join(Paths.getInstalledRoomDir(paths.roomId), "tools", "toolchain.manifest.json"),
      join(
        Paths.getInstalledRoomDir(paths.roomId),
        "shared",
        "data",
        "tools",
        "toolchain.manifest.json"
      ),
      join(paths.storageDir, "build", "workspace", "tools", "toolchain.manifest.json"),
      join(
        paths.storageDir,
        "build",
        "workspace",
        "shared",
        "data",
        "tools",
        "toolchain.manifest.json"
      ),
      join(getWorkspaceToolsDir(paths), "toolchain.manifest.json"),
      join(
        Paths.getRoomsWorkspaceDir(),
        paths.roomId,
        "shared",
        "data",
        "tools",
        "toolchain.manifest.json"
      ),
    ])
  );
}

export function resolveRuntimePaths(roomId: string): RoomToolRuntimePaths {
  const installedDir = Paths.getRoomRuntimeBuildDir(roomId);
  const legacyInstalledDir = Paths.getInstalledRoomDir(roomId);
  const storageDir = Paths.getRoomStorageDir(roomId);
  const platformKey = detectPlatformKey() ?? `${process.platform}-${process.arch}`;
  return {
    roomId,
    installedDir,
    storageDir,
    projectsDir: join(storageDir, "projects"),
    packageToolsDir: join(installedDir, "tools"),
    packageToolRuntimeDir: join(legacyInstalledDir, "tools", "runtime", platformKey),
    toolRuntimeDir: join(storageDir, "tools", "runtime", platformKey),
    toolStatePath: join(storageDir, "tool-state.json"),
  };
}

export function expandRuntimePathTemplate(
  template: string,
  runtimePaths: RoomToolRuntimePaths | null
): string {
  return template
    .replaceAll("${dataDir}", Paths.getDataDir())
    .replaceAll("${projectRoot}", Paths.getProjectRoot())
    .replaceAll("${installedDir}", runtimePaths?.installedDir ?? "")
    .replaceAll("${roomStorageDir}", runtimePaths?.storageDir ?? "")
    .replaceAll("${toolRuntimeDir}", runtimePaths?.toolRuntimeDir ?? "")
    .replaceAll("${packageToolsDir}", runtimePaths?.packageToolsDir ?? "");
}

export function ensureRoomManagedPath(roomId: string, targetPath: string): void {
  const paths = resolveRuntimePaths(roomId);
  const absolutePath = ensureAbsolutePath(targetPath);
  const allowedRoots = [paths.storageDir, paths.toolRuntimeDir];
  if (allowedRoots.some((root) => isPathInside(root, absolutePath))) {
    return;
  }
  throw new Error(`Path is outside the managed room roots: ${absolutePath}`);
}

export function ensureRoomToolRunCwdPath(roomId: string, targetPath: string): void {
  const paths = resolveRuntimePaths(roomId);
  const absolutePath = ensureAbsolutePath(targetPath);
  const allowedRoots = [
    paths.storageDir,
    paths.toolRuntimeDir,
    paths.packageToolsDir,
    getInstalledSharedToolsDir(paths),
  ];
  if (allowedRoots.some((root) => isPathInside(root, absolutePath))) {
    return;
  }
  throw new Error(`Tool run cwd is outside the managed room roots: ${absolutePath}`);
}

export function findVersion(output: string, pattern: string): string | null {
  const regex = new RegExp(pattern);
  const match = output.trim().match(regex);
  if (!match) {
    return null;
  }
  if (match[1] !== undefined) {
    return match[1];
  }
  return match[0];
}

export function compareLooseVersion(left: string, right: string): number {
  const tokenize = (value: string): Array<string | number> =>
    value
      .split(/[^0-9A-Za-z]+/)
      .filter((part) => part !== "")
      .map((part) => (/^\d+$/.test(part) ? Number(part) : part));

  const leftParts = tokenize(left);
  const rightParts = tokenize(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined && rightPart === undefined) {
      return 0;
    }
    if (leftPart === undefined) {
      return -1;
    }
    if (rightPart === undefined) {
      return 1;
    }
    if (typeof leftPart === "number" && typeof rightPart === "number") {
      if (leftPart !== rightPart) {
        return leftPart > rightPart ? 1 : -1;
      }
      continue;
    }
    const next = String(leftPart).localeCompare(String(rightPart), undefined, {
      numeric: true,
      sensitivity: "base",
    });
    if (next !== 0) {
      return next;
    }
  }

  return 0;
}

export async function resolveSystemCommandBinaryPath(
  executableName: string,
  options?: {
    allowPathLookup?: boolean | undefined;
    candidatePaths?: string[] | undefined;
    envVarNames?: string[] | undefined;
    runtimePaths?: RoomToolRuntimePaths | null | undefined;
  }
): Promise<string | null> {
  const normalizedName = asNonEmptyString(executableName);
  if (normalizedName === null) {
    return null;
  }

  const envVarNames = Array.isArray(options?.envVarNames) ? options.envVarNames : [];
  for (const envVarName of envVarNames) {
    const envBinaryPath = asNonEmptyString(process.env[envVarName]);
    if (envBinaryPath !== null && existsSync(envBinaryPath)) {
      return envBinaryPath;
    }
  }

  const candidatePaths = Array.isArray(options?.candidatePaths) ? options.candidatePaths : [];
  for (const candidateTemplate of candidatePaths) {
    const expandedPath = expandRuntimePathTemplate(
      candidateTemplate,
      options?.runtimePaths ?? null
    );
    if (expandedPath !== "" && existsSync(expandedPath)) {
      return expandedPath;
    }
  }

  if (normalizedName.includes("/") || normalizedName.includes("\\")) {
    return existsSync(normalizedName) ? normalizedName : null;
  }

  if (options?.allowPathLookup === false) {
    return null;
  }

  const lookupCommand = process.platform === "win32" ? "where.exe" : "which";

  try {
    const result = await runCommand(lookupCommand, [normalizedName], undefined, undefined, 8_000);
    if (result.exitCode !== 0) {
      return null;
    }

    return (
      result.stdout
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .find((line) => line !== "") ?? null
    );
  } catch {
    return null;
  }
}

export async function resolveCompanionSystemCommandPath(
  companionExecutableName: string,
  primaryBinaryPath: string
): Promise<string | null> {
  const normalizedName = asNonEmptyString(companionExecutableName);
  if (normalizedName === null) {
    return null;
  }

  const siblingPath = join(dirname(primaryBinaryPath), normalizedName);
  if (existsSync(siblingPath)) {
    return siblingPath;
  }

  if (process.platform === "win32" && !/\.exe$/iu.test(normalizedName)) {
    const windowsSiblingPath = join(dirname(primaryBinaryPath), `${normalizedName}.exe`);
    if (existsSync(windowsSiblingPath)) {
      return windowsSiblingPath;
    }
  }

  return await resolveSystemCommandBinaryPath(normalizedName);
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export function normalizeToolStatus(toolId: string, data: Partial<RoomToolStatus>): RoomToolStatus {
  return {
    toolId,
    installed: data.installed === true,
    version: data.version ?? null,
    binaryPath: data.binaryPath ?? null,
    lastError: data.lastError ?? null,
    releaseTag: data.releaseTag ?? null,
    releaseName: data.releaseName ?? null,
    installDir: data.installDir ?? null,
    companionPaths: data.companionPaths ?? {},
    details: data.details ?? {},
  };
}

export function summarizeCommandFailure(result: { stderr: string; stdout: string }): string | null {
  const prioritizedOutputs = [result.stderr, result.stdout];
  for (let index = 0; index < prioritizedOutputs.length; index += 1) {
    const output = prioritizedOutputs[index];
    if (typeof output !== "string" || output.trim() === "") {
      continue;
    }
    const lines = output
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line !== "");
    if (lines.length === 0) {
      continue;
    }
    return lines[lines.length - 1] ?? null;
  }
  return null;
}

export function buildProgressMetadata(options: {
  detailLines?: string[];
  percent?: number;
  phaseCount?: number;
  phaseIndex?: number;
  phaseLabel?: string;
  phasePercent?: number;
}): Partial<RoomToolProgressEvent> {
  return {
    ...(typeof options.percent === "number" ? { percent: options.percent } : {}),
    ...(typeof options.phaseCount === "number" ? { phaseCount: options.phaseCount } : {}),
    ...(typeof options.phaseIndex === "number" ? { phaseIndex: options.phaseIndex } : {}),
    ...(typeof options.phaseLabel === "string" ? { phaseLabel: options.phaseLabel } : {}),
    ...(typeof options.phasePercent === "number" ? { phasePercent: options.phasePercent } : {}),
    ...(Array.isArray(options.detailLines) ? { detailLines: options.detailLines } : {}),
  };
}

export async function resolveInstallableToolInstallDir(
  paths: RoomToolRuntimePaths,
  installDirName: string
): Promise<string> {
  const preferredInstallDir = join(paths.toolRuntimeDir, installDirName);
  const legacyInstallDir = join(paths.packageToolRuntimeDir, installDirName);

  if (existsSync(preferredInstallDir) || !existsSync(legacyInstallDir)) {
    return preferredInstallDir;
  }

  await ensureDir(dirname(preferredInstallDir));
  try {
    await rename(legacyInstallDir, preferredInstallDir);
    return preferredInstallDir;
  } catch {
    return preferredInstallDir;
  }
}
