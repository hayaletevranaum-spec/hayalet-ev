import { mkdir, readdir, rename, stat, writeFile } from "fs/promises";
import { basename, extname, join } from "path";
import { Paths } from "../paths.ts";
import { normalizeText } from "./types-and-defaults.ts";
import type { CaptureImportedAsset } from "../../src/types/capture.ts";
import type { TranscriptTargetId } from "../../src/types/transcript.ts";

export const CAPTURE_ANALYZE_TARGET = "analyze-compose" satisfies TranscriptTargetId;

export interface CaptureIngressPaths {
  rootDir: string;
  analyzeInboxDir: string;
  analyzeStagedDir: string;
}

export interface AnalyzeIngressSnapshot {
  pendingInboxCount: number;
  latestStagedAsset: CaptureImportedAsset | null;
}

export async function readDirectoryNameSet(directoryPath: string): Promise<Set<string>> {
  return new Set(await readdir(directoryPath));
}

export function resolveAvailableFileName(
  existingNames: Set<string>,
  preferredName: string
): string {
  const extension = extname(preferredName);
  const baseName = extension === "" ? preferredName : preferredName.slice(0, -extension.length);

  let nextName = preferredName;
  let counter = 1;
  while (existingNames.has(nextName)) {
    nextName = `${baseName}-${String(counter)}${extension}`;
    counter += 1;
  }

  return nextName;
}

export async function ensureCaptureIngressPaths(): Promise<CaptureIngressPaths> {
  const rootDir = join(Paths.getDataDir(), "capture-runtime");
  const analyzeInboxDir = join(rootDir, "inbox", "analyze");
  const analyzeStagedDir = join(rootDir, "staged", "analyze");

  await Promise.all([
    mkdir(rootDir, { recursive: true }),
    mkdir(analyzeInboxDir, { recursive: true }),
    mkdir(analyzeStagedDir, { recursive: true }),
  ]);

  return { rootDir, analyzeInboxDir, analyzeStagedDir };
}

export async function moveAnalyzeAssetToStaging(
  sourcePath: string,
  stagedDir: string
): Promise<CaptureImportedAsset> {
  const originalName = basename(sourcePath);
  const stagedNames = await readDirectoryNameSet(stagedDir);
  const nextName = resolveAvailableFileName(stagedNames, originalName);

  const targetPath = join(stagedDir, nextName);
  await rename(sourcePath, targetPath);

  return {
    name: nextName,
    originalName,
    path: targetPath,
    importedAt: Date.now(),
  };
}

export async function readAnalyzeIngressSnapshot(): Promise<AnalyzeIngressSnapshot> {
  const { analyzeInboxDir, analyzeStagedDir } = await ensureCaptureIngressPaths();
  const [inboxEntries, stagedEntries] = await Promise.all([
    readdir(analyzeInboxDir, { withFileTypes: true }),
    readdir(analyzeStagedDir, { withFileTypes: true }),
  ]);

  const stagedFiles = await Promise.all(
    stagedEntries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const filePath = join(analyzeStagedDir, entry.name);
        const fileStat = await stat(filePath).catch(() => null);
        return {
          name: entry.name,
          path: filePath,
          importedAt: fileStat?.mtimeMs ?? 0,
        };
      })
  );
  const latestStagedAsset =
    stagedFiles.sort((left, right) => right.importedAt - left.importedAt)[0] ?? null;

  return {
    pendingInboxCount: inboxEntries.filter((entry) => entry.isFile()).length,
    latestStagedAsset:
      latestStagedAsset === null
        ? null
        : {
            name: latestStagedAsset.name,
            originalName: latestStagedAsset.name,
            path: latestStagedAsset.path,
            importedAt: latestStagedAsset.importedAt,
          },
  };
}

export async function writeAnalyzeAsset(
  fileName: string,
  contentBase64: string,
  destination: "inbox" | "staged"
): Promise<CaptureImportedAsset> {
  const { analyzeInboxDir, analyzeStagedDir } = await ensureCaptureIngressPaths();
  const targetDir = destination === "staged" ? analyzeStagedDir : analyzeInboxDir;
  const normalizedName = normalizeText(fileName) ?? `capture-${Date.now()}.jpg`;
  const existingNames = await readDirectoryNameSet(targetDir);
  const nextName = resolveAvailableFileName(existingNames, normalizedName);

  const targetPath = join(targetDir, nextName);
  await writeFile(targetPath, Buffer.from(contentBase64, "base64"));
  const fileStat = await stat(targetPath).catch(() => null);

  return {
    name: nextName,
    originalName: normalizedName,
    path: targetPath,
    importedAt: fileStat?.mtimeMs ?? Date.now(),
  };
}

export function sanitizeCaptureTargetPathSegment(target: TranscriptTargetId): string {
  const normalized = target.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 96);
  return normalized === "" ? "target" : normalized;
}

export async function writeTargetCaptureAsset(
  target: TranscriptTargetId,
  fileName: string,
  contentBase64: string
): Promise<CaptureImportedAsset> {
  if (target === CAPTURE_ANALYZE_TARGET) {
    return await writeAnalyzeAsset(fileName, contentBase64, "staged");
  }

  const { rootDir } = await ensureCaptureIngressPaths();
  const targetDir = join(rootDir, "staged", sanitizeCaptureTargetPathSegment(target));
  await mkdir(targetDir, { recursive: true });
  const normalizedName = normalizeText(fileName) ?? `capture-${Date.now()}.jpg`;
  const existingNames = await readDirectoryNameSet(targetDir);
  const nextName = resolveAvailableFileName(existingNames, normalizedName);
  const targetPath = join(targetDir, nextName);
  await writeFile(targetPath, Buffer.from(contentBase64, "base64"));
  const fileStat = await stat(targetPath).catch(() => null);

  return {
    name: nextName,
    originalName: normalizedName,
    path: targetPath,
    importedAt: fileStat?.mtimeMs ?? Date.now(),
  };
}
