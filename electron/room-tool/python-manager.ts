import { spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { runCommand } from "./archive-helper.ts";
import {
  MANAGED_PYTHON_ASSET_TARGETS,
  type PlatformKey,
  type PythonBootstrapCandidate,
  type ResolvedPythonVenvPipInstaller,
  type GitHubReleaseAsset,
  type PythonOutdatedPackage,
} from "./types.ts";
import type { RoomToolRuntimePaths } from "../../src/types/room-tools.ts";

export const PYTHON_GET_PIP_URL = "https://bootstrap.pypa.io/get-pip.py";

export function getPythonVenvExecutableCandidates(venvDir: string): string[] {
  if (process.platform === "win32") {
    return [join(venvDir, "Scripts", "python.exe")];
  }

  return [join(venvDir, "bin", "python3"), join(venvDir, "bin", "python")];
}

export function resolveExistingPythonVenvExecutable(venvDir: string): string | null {
  return (
    getPythonVenvExecutableCandidates(venvDir).find((candidate) => existsSync(candidate)) ?? null
  );
}

export function getManagedPythonVersionCandidates(supportedPythonVersions: string[]): string[] {
  const normalizedVersions = supportedPythonVersions.filter((version) =>
    /^\d+\.\d+$/u.test(version)
  );
  return normalizedVersions.length > 0 ? normalizedVersions : ["3.12"];
}

export function getManagedPythonRuntimeDir(paths: RoomToolRuntimePaths, version: string): string {
  return join(paths.storageDir, "runtime", "python", `cpython-${version}`);
}

export function getManagedPythonExecutableCandidates(runtimeDir: string): string[] {
  if (process.platform === "win32") {
    return [join(runtimeDir, "python.exe"), join(runtimeDir, "Scripts", "python.exe")];
  }

  return [join(runtimeDir, "bin", "python3"), join(runtimeDir, "bin", "python")];
}

export function resolveExistingManagedPythonExecutable(runtimeDir: string): string | null {
  return (
    getManagedPythonExecutableCandidates(runtimeDir).find((candidate) => existsSync(candidate)) ??
    null
  );
}

export function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => asNonEmptyString(item))
    .filter((item): item is string => item !== null);
}

export async function readPythonMajorMinor(
  command: string,
  argsPrefix: string[] = [],
  cwd?: string
): Promise<string | null> {
  const result = await runCommand(
    command,
    [
      ...argsPrefix,
      "-c",
      "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')",
    ],
    cwd,
    undefined,
    12_000
  );
  if (result.exitCode !== 0) {
    return null;
  }
  return (
    result.stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => /^\d+\.\d+$/u.test(line)) ?? null
  );
}

export async function isPythonRuntimeVersionSupported(
  command: string,
  argsPrefix: string[],
  supportedPythonVersions: string[]
): Promise<boolean> {
  if (supportedPythonVersions.length === 0) {
    return true;
  }
  const version = await readPythonMajorMinor(command, argsPrefix, dirname(command));
  return version !== null && supportedPythonVersions.includes(version);
}

export function makePythonBootstrapCandidate(
  commandName: string,
  argsPrefix: string[] = []
): PythonBootstrapCandidate | null {
  const normalizedCommandName = asNonEmptyString(commandName);
  if (normalizedCommandName === null) {
    return null;
  }
  const normalizedArgsPrefix = normalizeStringArray(argsPrefix);
  return {
    argsPrefix: normalizedArgsPrefix,
    commandName: normalizedCommandName,
    label: [normalizedCommandName, ...normalizedArgsPrefix].join(" "),
  };
}

export function dedupePythonBootstrapCandidates(
  candidates: Array<PythonBootstrapCandidate | null>
): PythonBootstrapCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate): candidate is PythonBootstrapCandidate => {
    if (candidate === null) {
      return false;
    }
    const key = `${candidate.commandName}\u0000${candidate.argsPrefix.join("\u0000")}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function buildPythonBootstrapCandidates(
  resolvedInstaller: ResolvedPythonVenvPipInstaller
): PythonBootstrapCandidate[] {
  const supportedPythonVersions = resolvedInstaller.installer.supportedPythonVersions;
  const explicitCandidates = resolvedInstaller.installer.bootstrapExecutableNames.map((entry) =>
    makePythonBootstrapCandidate(entry)
  );
  const versionedCandidates = supportedPythonVersions.flatMap((version) => {
    const candidates = [makePythonBootstrapCandidate(`python${version}`)];
    if (process.platform === "win32") {
      candidates.push(makePythonBootstrapCandidate("py", [`-${version}`]));
    }
    return candidates;
  });
  const genericCandidates = [
    makePythonBootstrapCandidate(resolvedInstaller.systemCommand.executableName),
    makePythonBootstrapCandidate("python3"),
    makePythonBootstrapCandidate("python"),
    makePythonBootstrapCandidate("py", process.platform === "win32" ? ["-3"] : []),
  ];

  return dedupePythonBootstrapCandidates(
    supportedPythonVersions.length > 0
      ? [...explicitCandidates, ...versionedCandidates]
      : [...explicitCandidates, ...genericCandidates]
  );
}

export function formatPythonVersionList(versions: string[]): string {
  return versions.length === 0 ? "python3 or python" : `Python ${versions.join(", ")}`;
}

export function buildMissingPythonBootstrapMessage(
  resolvedInstaller: ResolvedPythonVenvPipInstaller,
  attemptedLabels: string[]
): string {
  const supportedVersions = resolvedInstaller.installer.supportedPythonVersions;
  const requiredRuntime = formatPythonVersionList(supportedVersions);
  const attempted = attemptedLabels.length > 0 ? ` Tried: ${attemptedLabels.join(", ")}.` : "";
  return `${requiredRuntime} is required for ${resolvedInstaller.manifest.displayName}. A managed room Python runtime or compatible interpreter is required.${attempted}`;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function selectManagedPythonAsset(
  assets: GitHubReleaseAsset[],
  version: string,
  platformKey: PlatformKey
): GitHubReleaseAsset | null {
  const target = MANAGED_PYTHON_ASSET_TARGETS[platformKey];
  if (target === undefined) {
    return null;
  }

  const escapedVersion = escapeRegExp(version);
  const escapedTarget = escapeRegExp(target);
  const matchers = [
    new RegExp(
      `^cpython-${escapedVersion}\\.\\d+\\+\\d+-${escapedTarget}-install_only_stripped\\.tar\\.gz$`,
      "u"
    ),
    new RegExp(
      `^cpython-${escapedVersion}\\.\\d+\\+\\d+-${escapedTarget}-install_only\\.tar\\.gz$`,
      "u"
    ),
  ];

  for (const matcher of matchers) {
    const asset = assets.find((entry) => matcher.test(entry.name));
    if (asset !== undefined && asNonEmptyString(asset.browser_download_url) !== null) {
      return asset;
    }
  }

  return null;
}

export function killSpawnedProcessTree(child: Pick<ChildProcess, "kill" | "pid">): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.once("error", () => {
      child.kill("SIGKILL");
    });
    return;
  }

  if (child.pid !== undefined) {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // Fall back to killing the direct child when a process group is unavailable.
    }
  }

  child.kill("SIGKILL");
}

export async function isPythonVenvReusable(
  venvPythonPath: string,
  venvDir: string
): Promise<boolean> {
  const siteCheckScript = [
    "import os, sys, sysconfig",
    "venv = os.path.normcase(os.path.realpath(sys.argv[1]))",
    "prefix = os.path.normcase(os.path.realpath(sys.prefix))",
    "purelib = os.path.normcase(os.path.realpath(sysconfig.get_paths().get('purelib') or ''))",
    "inside = os.path.commonpath([venv, purelib]) == venv",
    "raise SystemExit(0 if prefix == venv and inside and os.path.isdir(purelib) else 1)",
  ].join("; ");
  const siteCheck = await runCommand(
    venvPythonPath,
    ["-c", siteCheckScript, venvDir],
    dirname(venvPythonPath),
    undefined,
    10_000
  );
  if (siteCheck.exitCode !== 0) {
    return false;
  }

  const pipCheck = await runCommand(
    venvPythonPath,
    ["-m", "pip", "--version"],
    dirname(venvPythonPath),
    undefined,
    10_000
  );
  return pipCheck.exitCode === 0;
}

export function normalizePythonPackageName(value: string): string | null {
  const match = value.trim().match(/^[A-Za-z0-9_.-]+/u);
  if (!match) {
    return null;
  }
  return match[0].replace(/[-_.]+/gu, "-").toLowerCase();
}

export function parsePythonOutdatedPackages(stdout: string): PythonOutdatedPackage[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .map(function (entry): PythonOutdatedPackage | null {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const name = asNonEmptyString(record["name"]);
      if (name === null) {
        return null;
      }
      return {
        latestVersion: asNonEmptyString(record["latest_version"]),
        name,
        version: asNonEmptyString(record["version"]),
      };
    })
    .filter((entry): entry is PythonOutdatedPackage => entry !== null);
}

export function normalizeRequestId(value: unknown): string | null {
  return asNonEmptyString(value);
}

export function normalizeRoomId(value: unknown): string {
  return asNonEmptyString(value) ?? "";
}

export function normalizeJobId(value: unknown, fallbackPrefix: string): string {
  return (
    asNonEmptyString(value) ??
    `${fallbackPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

export function detectPlatformKey(): PlatformKey | null {
  const report = process.report.getReport() as
    | {
        header?: {
          glibcVersionRuntime?: string;
        };
      }
    | undefined;
  const glibcVersionRuntime = report?.header?.glibcVersionRuntime;
  const isMusl =
    process.platform === "linux" &&
    (glibcVersionRuntime === undefined || glibcVersionRuntime === "");

  if (process.platform === "linux" && process.arch === "x64") {
    return isMusl ? "linux-musl-x64" : "linux-x64";
  }
  if (process.platform === "linux" && process.arch === "arm64") {
    return isMusl ? "linux-musl-arm64" : "linux-arm64";
  }
  if (process.platform === "darwin" && process.arch === "x64") {
    return "darwin-x64";
  }
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "darwin-arm64";
  }
  if (process.platform === "win32" && process.arch === "x64") {
    return "win32-x64";
  }
  if (process.platform === "win32" && process.arch === "arm64") {
    return "win32-arm64";
  }

  return null;
}
