import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * @typedef {Record<string, unknown>} CompanionArtifactManifest
 */

/**
 * @typedef {{
 *   latestPath: string | null,
 *   latestMtimeMs: number | null,
 * }} CompanionLatestInputInfo
 */

/**
 * @typedef {{
 *   companionRoot: string,
 *   artifactManifestPath: string,
 *   extraInputRoots?: string[],
 * }} CompanionArtifactCacheOptions
 */

/**
 * @typedef {{
 *   artifactManifest: CompanionArtifactManifest | null,
 *   artifactReady: boolean,
 *   artifactFresh: boolean,
 *   stale: boolean,
 *   apkPath: string | null,
 *   builtAt: string | null,
 *   buildTimestampMs: number | null,
 *   latestInputPath: string | null,
 *   latestInputMtimeMs: number | null,
 * }} CompanionArtifactCacheStatus
 */

/**
 * @param {string} targetPath
 * @returns {Promise<boolean>}
 */
async function fileExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeText(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * @param {string} relativePath
 * @returns {string}
 */
function normalizeRelativePath(relativePath) {
  return relativePath.split("\\").join("/");
}

/**
 * @param {string} relativePath
 * @returns {boolean}
 */
function shouldTrackCompanionBuildInput(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (
    normalized === "" ||
    normalized === "." ||
    normalized === ".gitignore" ||
    normalized === "README.md" ||
    normalized === "local.properties"
  ) {
    return false;
  }

  return (
    normalized !== ".gradle" &&
    normalized.startsWith(".gradle/") !== true &&
    normalized !== "build" &&
    normalized.startsWith("build/") !== true &&
    normalized !== "app/build" &&
    normalized.startsWith("app/build/") !== true
  );
}

/**
 * @param {string} companionRoot
 * @returns {Promise<CompanionLatestInputInfo>}
 */
async function resolveLatestCompanionInput(companionRoot) {
  if ((await fileExists(companionRoot)) !== true) {
    return {
      latestPath: null,
      latestMtimeMs: null,
    };
  }

  /** @type {string[]} */
  const queue = [""];
  /** @type {string | null} */
  let latestPath = null;
  /** @type {number | null} */
  let latestMtimeMs = null;

  while (queue.length > 0) {
    const currentRelativePath = queue.shift();
    const currentAbsolutePath =
      currentRelativePath && currentRelativePath !== ""
        ? join(companionRoot, currentRelativePath)
        : companionRoot;
    const entries = await readdir(currentAbsolutePath, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      const relativePath =
        currentRelativePath && currentRelativePath !== ""
          ? join(currentRelativePath, entry.name)
          : entry.name;
      const normalizedRelativePath = normalizeRelativePath(relativePath);

      if (shouldTrackCompanionBuildInput(normalizedRelativePath) !== true) {
        continue;
      }

      if (entry.isDirectory()) {
        queue.push(relativePath);
        continue;
      }

      if (entry.isFile() !== true) {
        continue;
      }

      const stats = await stat(join(companionRoot, relativePath));
      if (latestMtimeMs === null || stats.mtimeMs > latestMtimeMs) {
        latestMtimeMs = stats.mtimeMs;
        latestPath = normalizedRelativePath;
      }
    }
  }

  return {
    latestPath,
    latestMtimeMs,
  };
}

/**
 * @param {CompanionLatestInputInfo[]} inputs
 * @returns {CompanionLatestInputInfo}
 */
function resolveLatestInput(inputs) {
  return inputs.reduce(
    (latest, input) => {
      if (
        input.latestMtimeMs !== null &&
        (latest.latestMtimeMs === null || input.latestMtimeMs > latest.latestMtimeMs)
      ) {
        return input;
      }
      return latest;
    },
    { latestPath: null, latestMtimeMs: null }
  );
}

/**
 * @param {string} artifactManifestPath
 * @param {CompanionArtifactManifest | null} artifactManifest
 * @param {string | null} apkPath
 * @returns {Promise<number | null>}
 */
async function resolveArtifactTimestampMs(artifactManifestPath, artifactManifest, apkPath) {
  const builtAt = normalizeText(artifactManifest?.["builtAt"]);
  if (builtAt !== null) {
    const builtAtMs = Date.parse(builtAt);
    if (Number.isFinite(builtAtMs)) {
      return builtAtMs;
    }
  }

  /** @type {number[]} */
  const candidates = [];
  if (typeof apkPath === "string" && apkPath.trim() !== "" && (await fileExists(apkPath)) === true) {
    candidates.push((await stat(apkPath)).mtimeMs);
  }

  if ((await fileExists(artifactManifestPath)) === true) {
    candidates.push((await stat(artifactManifestPath)).mtimeMs);
  }

  if (candidates.length === 0) {
    return null;
  }

  return Math.max(...candidates);
}

/**
 * @param {CompanionArtifactCacheOptions} options
 * @returns {Promise<CompanionArtifactCacheStatus>}
 */
export async function inspectCompanionArtifactCache(options) {
  const { companionRoot, artifactManifestPath, extraInputRoots = [] } = options;
  if ((await fileExists(artifactManifestPath)) !== true) {
    return {
      artifactManifest: null,
      artifactReady: false,
      artifactFresh: false,
      stale: false,
      apkPath: null,
      builtAt: null,
      buildTimestampMs: null,
      latestInputPath: null,
      latestInputMtimeMs: null,
    };
  }

  /** @type {CompanionArtifactManifest} */
  const artifactManifest = JSON.parse(await readFile(artifactManifestPath, "utf8"));
  const apkPath = normalizeText(artifactManifest?.["apkPath"]);
  const artifactReady = apkPath !== null && (await fileExists(apkPath)) === true;
  const { latestPath, latestMtimeMs } = resolveLatestInput(
    await Promise.all([
      resolveLatestCompanionInput(companionRoot),
      ...extraInputRoots.map(async (inputRoot) => {
        const input = await resolveLatestCompanionInput(inputRoot);
        return {
          latestPath: input.latestPath === null ? null : `${inputRoot}:${input.latestPath}`,
          latestMtimeMs: input.latestMtimeMs,
        };
      }),
    ])
  );
  const buildTimestampMs = await resolveArtifactTimestampMs(
    artifactManifestPath,
    artifactManifest,
    apkPath
  );
  const artifactFresh =
    artifactReady === true &&
    buildTimestampMs !== null &&
    (latestMtimeMs === null || latestMtimeMs <= buildTimestampMs);

  return {
    artifactManifest,
    artifactReady,
    artifactFresh,
    stale: artifactReady === true && artifactFresh !== true,
    apkPath,
    builtAt: normalizeText(artifactManifest?.["builtAt"]),
    buildTimestampMs,
    latestInputPath: latestPath,
    latestInputMtimeMs: latestMtimeMs,
  };
}
