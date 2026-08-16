import { createHash } from "crypto";
import { mkdir, readFile, rename, rm, writeFile } from "fs/promises";
import { join } from "path";
import { Paths } from "../paths.ts";
import { inspectCompanionArtifactCache } from "../../scripts/lib/android-companion-artifact.mjs";
import { fileExists } from "./adb-helper.ts";
import {
  normalizeText,
  type DirectCompanionModelDescriptor,
  type CompanionTranscriptModelDownloadDescriptor,
  type CompanionManifestRecord,
} from "./types-and-defaults.ts";
import type { CaptureAndroidArtifactStatus } from "../../src/types/capture.ts";

export const CAPTURE_ANDROID_COMPANION_PACKAGE = "com.hayaletev.androidcompanion";
export const CAPTURE_ANDROID_MAIN_ACTIVITY = "com.hayaletev.androidcompanion/.MainActivity";
export const CAPTURE_BRIDGE_PORT = 48_561;

export function getCaptureProjectRoot(): string {
  return Paths.getProjectRoot();
}

export function resolveCompanionTranscriptModelPaths(): { modelDir: string; tempDir: string } {
  const rootDir = join(Paths.getDataDir(), "transcript", "android-models");
  return {
    modelDir: rootDir,
    tempDir: join(rootDir, "tmp"),
  };
}

export function getCompanionManifestPath(): string {
  return join(
    getCaptureProjectRoot(),
    "android-companion",
    "app",
    "src",
    "main",
    "assets",
    "companion-manifest.json"
  );
}

export function getCompanionArtifactDir(): string {
  return join(getCaptureProjectRoot(), "dist", "android-companion");
}

export function getCompanionSourceRoot(): string {
  return join(getCaptureProjectRoot(), "android-companion");
}

export function getCompanionArtifactManifestPath(): string {
  return join(getCompanionArtifactDir(), "manifest.json");
}

export function getCompanionWrapperPath(): string {
  return process.platform === "win32"
    ? join(getCaptureProjectRoot(), "android-companion", "gradlew.bat")
    : join(getCaptureProjectRoot(), "android-companion", "gradlew");
}

export function getCompanionApkPath(): string {
  return join(
    getCaptureProjectRoot(),
    "android-companion",
    "app",
    "build",
    "outputs",
    "apk",
    "debug",
    "app-debug.apk"
  );
}

export function getCompanionBuildScriptPath(): string {
  return join(getCaptureProjectRoot(), "scripts", "build-android-companion.mjs");
}

export function sha1Hex(buffer: Buffer): string {
  return createHash("sha1").update(buffer).digest("hex");
}

export async function downloadFile(url: string, destinationPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || response.body == null) {
    throw new Error(`Download failed with status ${response.status} for ${url}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destinationPath, buffer);
}

export function assertCompanionModelBuffer(
  descriptor: CompanionTranscriptModelDownloadDescriptor,
  modelBuffer: Buffer
): void {
  const actualSha1 = sha1Hex(modelBuffer);
  if (actualSha1 !== descriptor.expectedSha1) {
    throw new Error(
      `Android transcript model checksum mismatch. Expected ${descriptor.expectedSha1}, got ${actualSha1}.`
    );
  }

  if (descriptor.expectedBytes !== null && modelBuffer.byteLength !== descriptor.expectedBytes) {
    throw new Error(
      `Android transcript model size mismatch. Expected ${descriptor.expectedBytes}, got ${modelBuffer.byteLength}.`
    );
  }
}

export async function ensureDirectCompanionModelArchive(
  descriptor: DirectCompanionModelDescriptor
): Promise<string> {
  const paths = resolveCompanionTranscriptModelPaths();
  await Promise.all([
    mkdir(paths.modelDir, { recursive: true }),
    mkdir(paths.tempDir, { recursive: true }),
  ]);

  const modelPath = join(paths.modelDir, descriptor.fileName);
  if (await fileExists(modelPath)) {
    const existingBuffer = await readFile(modelPath);
    try {
      assertCompanionModelBuffer(descriptor, existingBuffer);
      return modelPath;
    } catch {
      await rm(modelPath, { force: true });
    }
  }

  const tempPath = join(paths.tempDir, `${descriptor.fileName}.download`);
  await rm(tempPath, { force: true });
  await downloadFile(descriptor.downloadUrl, tempPath);

  try {
    const downloadedBuffer = await readFile(tempPath);
    assertCompanionModelBuffer(descriptor, downloadedBuffer);
    await rename(tempPath, modelPath);
    return modelPath;
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

export function parseJavaMajorVersion(output: string | null): number | null {
  const normalized = normalizeText(output);
  if (normalized === null) {
    return null;
  }

  const versionToken =
    normalized.match(/version "([^"]+)"/)?.[1] ??
    normalized.match(/openjdk (\d+(?:\.\d+){0,2})/)?.[1] ??
    null;
  if (versionToken === null) {
    return null;
  }

  const majorToken = versionToken.split(".")[0]?.trim() ?? "";
  const major = Number.parseInt(majorToken, 10);
  return Number.isFinite(major) ? major : null;
}

export function summarizeCompanionBuildFailure(output: string | null): string {
  const normalized = normalizeText(output);
  if (normalized === null) {
    return "Android companion build failed.";
  }

  const javaMajor = parseJavaMajorVersion(normalized);
  if (javaMajor !== null && javaMajor > 21) {
    return `Android companion build is blocked: Java ${String(javaMajor)} desteklenmiyor. JDK 17 veya 21 kullan.`;
  }

  if (
    normalized.includes("JAVA_HOME is not set") ||
    normalized.includes("no 'java' command could be found")
  ) {
    return "Android companion build is blocked: Java bulunamadi. JAVA_HOME ayarla veya Java kur.";
  }

  if (
    normalized.includes("ANDROID_HOME") ||
    normalized.includes("ANDROID_SDK_ROOT") ||
    normalized.includes("sdk.dir")
  ) {
    return "Android companion build is blocked: Android SDK yolu bulunamadi. ANDROID_SDK_ROOT veya local.properties ayarla.";
  }

  const firstLine =
    normalized
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line !== "") ?? null;

  return firstLine !== null
    ? `Android companion build failed: ${firstLine}`
    : "Android companion build failed.";
}

export async function readCompanionManifest(): Promise<CaptureAndroidArtifactStatus> {
  const companionManifestPath = getCompanionManifestPath();
  const companionArtifactManifestPath = getCompanionArtifactManifestPath();
  const companionWrapperPath = getCompanionWrapperPath();
  const fallback: CaptureAndroidArtifactStatus = {
    buildState: "missing",
    applicationId: CAPTURE_ANDROID_COMPANION_PACKAGE,
    mainActivity: CAPTURE_ANDROID_MAIN_ACTIVITY,
    versionName: null,
    versionCode: null,
    apkPath: null,
    builtAt: null,
    sourceManifestPath: companionManifestPath,
    bridgePort: CAPTURE_BRIDGE_PORT,
  };

  if ((await fileExists(companionManifestPath)) !== true) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(
      await readFile(companionManifestPath, "utf8")
    ) as CompanionManifestRecord;
    const artifactState = await inspectCompanionArtifactCache({
      companionRoot: getCompanionSourceRoot(),
      artifactManifestPath: companionArtifactManifestPath,
      extraInputRoots: [join(getCaptureProjectRoot(), "data", "transcript", "whisper.cpp-src")],
    });
    const artifactReady =
      artifactState.artifactReady === true && artifactState.artifactFresh === true;
    const wrapperReady = await fileExists(companionWrapperPath);

    return {
      buildState: artifactReady
        ? "artifact-ready"
        : wrapperReady
          ? "source-ready"
          : "build-blocked",
      applicationId: normalizeText(parsed.applicationId) ?? CAPTURE_ANDROID_COMPANION_PACKAGE,
      mainActivity: normalizeText(parsed.mainActivity) ?? CAPTURE_ANDROID_MAIN_ACTIVITY,
      versionName: normalizeText(parsed.versionName),
      versionCode:
        typeof parsed.versionCode === "number" && Number.isFinite(parsed.versionCode)
          ? parsed.versionCode
          : typeof parsed.versionCode === "string" && parsed.versionCode.trim() !== ""
            ? Number(parsed.versionCode)
            : null,
      apkPath: artifactReady ? artifactState.apkPath : null,
      builtAt: artifactState.builtAt,
      sourceManifestPath: companionManifestPath,
      bridgePort:
        typeof parsed.bridgePort === "number" && Number.isFinite(parsed.bridgePort)
          ? parsed.bridgePort
          : CAPTURE_BRIDGE_PORT,
    };
  } catch {
    return fallback;
  }
}
