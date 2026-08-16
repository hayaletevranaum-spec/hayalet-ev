import { existsSync } from "fs";
import { mkdir, readFile, readdir, rm, writeFile } from "fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "path";

import {
  cloneSceneLayout,
  isSceneLayoutConfig,
} from "../src/js/scene/layout/scene-layout-serialization.ts";
import type { SceneLayoutConfig } from "../src/js/scene/layout/index.js";
import {
  SCENE_ROOM_IDS,
  type SceneCharacterThemeDefinition,
  type SceneCharacterVisualConfig,
  type SceneLoadingThemeDefinition,
  type SceneRoomId,
  type SceneRoomThemeDefinition,
  type SceneThemeViewDefinition,
} from "../src/js/scene/schema.ts";
import {
  cloneSceneClickableTheme,
  isSceneClickableThemeDefinition,
} from "../src/js/scene-system/scene-clickable-theme-core.ts";
import type { SceneThemeRegistration } from "../src/js/scene-system/scene-theme-registry-contract.ts";
import type { SceneThemeSourceDefinition } from "../src/js/scene-system/theme-source-contract.ts";
import { Paths } from "./paths.ts";

const INSTALLED_SCENE_THEME_DOCUMENT_VERSION = 1;
const INSTALLED_SCENE_THEME_DOCUMENT_FILE = "theme.json";
const INSTALLED_SCENE_THEME_BUNDLE_SCHEMA_VERSION = 1;

type SceneThemeImportConflictStrategy = "reject" | "replace" | "rename";

interface InstalledSceneThemeBundleFile {
  encoding: "base64";
  content: string;
}

interface InstalledSceneThemeBundleManifest {
  themeId: string;
  label: string;
  entryFile: typeof INSTALLED_SCENE_THEME_DOCUMENT_FILE;
}

interface InstalledSceneThemeBundle {
  schemaVersion: number;
  manifest: InstalledSceneThemeBundleManifest;
  files: Record<string, InstalledSceneThemeBundleFile>;
  exportedAt: string;
}

interface InstalledSceneThemeDocument {
  version: number;
  themeId: string;
  label?: string;
  source: SceneThemeSourceDefinition;
}

interface SceneThemePackageManagerOptions {
  installedRoot?: string;
}

interface SceneThemeOperationResult {
  success: boolean;
  error?: string;
  path?: string;
  theme?: SceneThemeRegistration;
  themeId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && Array.isArray(value) === false;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeSceneThemePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function normalizeSceneThemeId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSceneThemeLabel(value: unknown, fallbackThemeId: string): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallbackThemeId;
}

function normalizeSceneThemeBundlePath(value: string): string | null {
  const normalizedPath = value.replace(/\\/g, "/").trim().replace(/^\/+/, "");
  if (normalizedPath === "") {
    return null;
  }

  const segments = normalizedPath.split("/");
  if (segments.some((segment) => segment.trim() === "" || segment === "." || segment === "..")) {
    return null;
  }

  return normalizedPath;
}

function resolveThemeLocalPath(themeRoot: string, relativePath: string): string | null {
  const resolvedPath = resolve(themeRoot, relativePath);
  const normalizedThemeRoot = resolve(themeRoot);
  if (
    resolvedPath === normalizedThemeRoot ||
    resolvedPath.startsWith(`${normalizedThemeRoot}${sep}`)
  ) {
    return normalizeSceneThemePath(resolvedPath);
  }

  return null;
}

function resolveSceneThemeAssetPath(themeRoot: string, assetPath: unknown): string | null {
  if (typeof assetPath !== "string") {
    return null;
  }

  const trimmedPath = assetPath.trim();
  if (trimmedPath === "") {
    return null;
  }

  if (
    trimmedPath.startsWith("data:") ||
    trimmedPath.startsWith("http://") ||
    trimmedPath.startsWith("https://") ||
    trimmedPath.startsWith("blob:") ||
    trimmedPath.startsWith("file://") ||
    trimmedPath.startsWith("/assets/")
  ) {
    return trimmedPath;
  }

  if (isAbsolute(trimmedPath)) {
    return normalizeSceneThemePath(trimmedPath);
  }

  return resolveThemeLocalPath(themeRoot, trimmedPath);
}

async function collectFilesRecursive(
  baseDir: string,
  currentDir: string = baseDir
): Promise<Array<{ relativePath: string; absolutePath: string }>> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry): Promise<Array<{ relativePath: string; absolutePath: string }>> => {
      const absolutePath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "dist") {
          return [];
        }
        return await collectFilesRecursive(baseDir, absolutePath);
      }

      const relativePath = normalizeSceneThemePath(absolutePath.slice(baseDir.length + 1));
      return [{ relativePath, absolutePath }];
    })
  );

  return nestedFiles
    .flat()
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function cloneCharacterVisualConfig(
  value: unknown,
  themeRoot: string
): SceneCharacterVisualConfig | null {
  if (isRecord(value) === false) {
    return null;
  }

  const bodySrc = resolveSceneThemeAssetPath(themeRoot, value["bodySrc"]);
  if (bodySrc === null) {
    return null;
  }

  if (
    isFiniteNumber(value["bodyScale"]) === false ||
    isFiniteNumber(value["headTopPct"]) === false ||
    isFiniteNumber(value["headLeftPct"]) === false ||
    isFiniteNumber(value["headSizePct"]) === false ||
    isFiniteNumber(value["avatarScale"]) === false
  ) {
    return null;
  }

  return {
    bodySrc,
    bodyScale: value["bodyScale"],
    headTopPct: value["headTopPct"],
    headLeftPct: value["headLeftPct"],
    headSizePct: value["headSizePct"],
    avatarScale: value["avatarScale"],
  };
}

function cloneLoadingTheme(value: unknown, themeRoot: string): SceneLoadingThemeDefinition | null {
  if (isRecord(value) === false || isFiniteNumber(value["frameDurationMs"]) === false) {
    return null;
  }

  const framesRaw = value["frames"];
  if (Array.isArray(framesRaw) === false || framesRaw.length === 0) {
    return null;
  }

  const frames = framesRaw
    .map((entry) => resolveSceneThemeAssetPath(themeRoot, entry))
    .filter((entry): entry is string => entry !== null);

  if (frames.length !== framesRaw.length) {
    return null;
  }

  return {
    frameDurationMs: value["frameDurationMs"],
    frames,
  };
}

function cloneCharacterTheme(
  value: unknown,
  themeRoot: string
): SceneCharacterThemeDefinition | null {
  if (isRecord(value) === false || isRecord(value["roles"]) === false) {
    return null;
  }

  const roles = Object.fromEntries(
    Object.entries(value["roles"])
      .map(([roleId, config]) => [roleId, cloneCharacterVisualConfig(config, themeRoot)])
      .filter((entry): entry is [string, SceneCharacterVisualConfig] => entry[1] !== null)
  );
  const fallbackRole =
    typeof value["fallbackRole"] === "string" ? value["fallbackRole"].trim() : "";

  if (fallbackRole === "" || roles[fallbackRole] === undefined || Object.keys(roles).length === 0) {
    return null;
  }

  return {
    roles,
    fallbackRole,
  };
}

function cloneSceneThemeViewDefinition(
  value: unknown,
  themeRoot: string
): SceneThemeViewDefinition | null {
  if (isRecord(value) === false) {
    return null;
  }

  const backgroundSrc =
    value["backgroundSrc"] === undefined
      ? undefined
      : resolveSceneThemeAssetPath(themeRoot, value["backgroundSrc"]);
  const panelArtSrc =
    value["panelArtSrc"] === undefined
      ? undefined
      : resolveSceneThemeAssetPath(themeRoot, value["panelArtSrc"]);

  if (
    (value["backgroundSrc"] !== undefined && backgroundSrc === null) ||
    (value["panelArtSrc"] !== undefined && panelArtSrc === null)
  ) {
    return null;
  }

  if (backgroundSrc === undefined && panelArtSrc === undefined) {
    return null;
  }

  return {
    ...(typeof backgroundSrc === "string" ? { backgroundSrc } : {}),
    ...(typeof panelArtSrc === "string" ? { panelArtSrc } : {}),
  };
}

function cloneSceneRoomThemeDefinition(
  value: unknown,
  themeRoot: string
): SceneRoomThemeDefinition | null {
  if (isRecord(value) === false) {
    return null;
  }

  const backgroundSrc = resolveSceneThemeAssetPath(themeRoot, value["backgroundSrc"]);
  if (backgroundSrc === null) {
    return null;
  }

  const panelsRaw = value["panels"];
  if (panelsRaw !== undefined && isRecord(panelsRaw) === false) {
    return null;
  }
  const panelEntries = panelsRaw === undefined ? undefined : Object.entries(panelsRaw);
  const panels =
    panelEntries === undefined
      ? undefined
      : Object.fromEntries(
          panelEntries
            .map(([panelId, panelSrc]) => [
              panelId,
              resolveSceneThemeAssetPath(themeRoot, panelSrc),
            ])
            .filter((entry): entry is [string, string] => entry[1] !== null)
        );
  const viewsRaw = value["views"];
  if (viewsRaw !== undefined && isRecord(viewsRaw) === false) {
    return null;
  }
  const viewEntries = viewsRaw === undefined ? undefined : Object.entries(viewsRaw);
  const views =
    viewEntries === undefined
      ? undefined
      : Object.fromEntries(
          viewEntries
            .map(([viewId, view]) => [viewId, cloneSceneThemeViewDefinition(view, themeRoot)])
            .filter((entry): entry is [string, SceneThemeViewDefinition] => entry[1] !== null)
        );

  if (
    (panelEntries !== undefined &&
      panels !== undefined &&
      Object.keys(panels).length !== panelEntries.length) ||
    (viewEntries !== undefined &&
      views !== undefined &&
      Object.keys(views).length !== viewEntries.length)
  ) {
    return null;
  }

  return {
    backgroundSrc,
    ...(panels !== undefined && Object.keys(panels).length > 0 ? { panels } : {}),
    ...(views !== undefined && Object.keys(views).length > 0 ? { views } : {}),
  };
}

function cloneSceneThemeMaps(value: unknown): Record<SceneRoomId, SceneLayoutConfig> | null {
  if (isRecord(value) === false) {
    return null;
  }

  const entries = SCENE_ROOM_IDS.map((roomId) => {
    const sceneLayout = value[roomId];
    if (isSceneLayoutConfig(sceneLayout) === false) {
      return null;
    }

    return [roomId, cloneSceneLayout(sceneLayout)] as const;
  });

  const validEntries = entries.filter(
    (entry): entry is readonly [SceneRoomId, SceneLayoutConfig] => entry !== null
  );
  if (validEntries.length !== SCENE_ROOM_IDS.length) {
    return null;
  }

  return Object.fromEntries(validEntries) as Record<SceneRoomId, SceneLayoutConfig>;
}

function cloneSceneThemeRooms(
  value: unknown,
  themeRoot: string
): Record<SceneRoomId, SceneRoomThemeDefinition> | null {
  if (isRecord(value) === false) {
    return null;
  }

  const entries = SCENE_ROOM_IDS.map((roomId) => {
    const roomTheme = cloneSceneRoomThemeDefinition(value[roomId], themeRoot);
    if (roomTheme === null) {
      return null;
    }

    return [roomId, roomTheme] as const;
  });

  const validEntries = entries.filter(
    (entry): entry is readonly [SceneRoomId, SceneRoomThemeDefinition] => entry !== null
  );
  if (validEntries.length !== SCENE_ROOM_IDS.length) {
    return null;
  }

  return Object.fromEntries(validEntries) as Record<SceneRoomId, SceneRoomThemeDefinition>;
}

function cloneSceneThemeSource(
  value: unknown,
  themeId: string,
  themeRoot: string
): SceneThemeSourceDefinition | null {
  if (isRecord(value) === false || normalizeSceneThemeId(value["themeId"]) !== themeId) {
    return null;
  }

  const loading = cloneLoadingTheme(value["loading"], themeRoot);
  const characters = cloneCharacterTheme(value["characters"], themeRoot);
  const rooms = cloneSceneThemeRooms(value["rooms"], themeRoot);
  const maps = cloneSceneThemeMaps(value["maps"]);

  if (
    loading === null ||
    characters === null ||
    rooms === null ||
    maps === null ||
    isSceneClickableThemeDefinition(value["clickableDefaults"]) === false
  ) {
    return null;
  }

  return {
    themeId,
    loading,
    characters,
    rooms,
    clickableDefaults: cloneSceneClickableTheme(value["clickableDefaults"]),
    maps,
  };
}

function parseInstalledSceneThemeDocument(
  rawDocument: string,
  themeRoot: string
): InstalledSceneThemeDocument | null {
  let parsedDocument: unknown;

  try {
    parsedDocument = JSON.parse(rawDocument) as unknown;
  } catch {
    return null;
  }

  if (isRecord(parsedDocument) === false) {
    return null;
  }

  if (parsedDocument["version"] !== INSTALLED_SCENE_THEME_DOCUMENT_VERSION) {
    return null;
  }

  const themeId = normalizeSceneThemeId(parsedDocument["themeId"]);
  if (themeId === "") {
    return null;
  }

  const source = cloneSceneThemeSource(parsedDocument["source"], themeId, themeRoot);
  if (source === null) {
    return null;
  }

  return {
    version: INSTALLED_SCENE_THEME_DOCUMENT_VERSION,
    themeId,
    label: normalizeSceneThemeLabel(parsedDocument["label"], themeId),
    source,
  };
}

function validateInstalledSceneThemeBundle(
  candidate: unknown
): { valid: true; bundle: InstalledSceneThemeBundle } | { valid: false; errors: string[] } {
  const errors: string[] = [];

  if (isRecord(candidate) === false) {
    return { valid: false, errors: ["bundle must be an object"] };
  }

  if (candidate["schemaVersion"] !== INSTALLED_SCENE_THEME_BUNDLE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${String(INSTALLED_SCENE_THEME_BUNDLE_SCHEMA_VERSION)}`);
  }

  const manifestRaw = candidate["manifest"];
  if (isRecord(manifestRaw) === false) {
    errors.push("manifest must be an object");
  }

  const themeId =
    isRecord(manifestRaw) === true ? normalizeSceneThemeId(manifestRaw["themeId"]) : "";
  const label =
    isRecord(manifestRaw) === true ? normalizeSceneThemeLabel(manifestRaw["label"], themeId) : "";
  const entryFile =
    isRecord(manifestRaw) === true &&
    manifestRaw["entryFile"] === INSTALLED_SCENE_THEME_DOCUMENT_FILE
      ? INSTALLED_SCENE_THEME_DOCUMENT_FILE
      : null;

  if (themeId === "") {
    errors.push("manifest.themeId must be a non-empty string");
  }
  if (label === "") {
    errors.push("manifest.label must be a non-empty string");
  }
  if (entryFile === null) {
    errors.push(`manifest.entryFile must be ${INSTALLED_SCENE_THEME_DOCUMENT_FILE}`);
  }

  const filesRaw = candidate["files"];
  const files: Record<string, InstalledSceneThemeBundleFile> = {};
  if (isRecord(filesRaw) === false) {
    errors.push("files must be an object");
  } else {
    for (const [rawPath, rawFile] of Object.entries(filesRaw)) {
      const relativePath = normalizeSceneThemeBundlePath(rawPath);
      if (relativePath === null) {
        errors.push(`files[${rawPath}] has invalid path`);
        continue;
      }

      if (isRecord(rawFile) === false) {
        errors.push(`files[${relativePath}] must be an object`);
        continue;
      }

      if (rawFile["encoding"] !== "base64") {
        errors.push(`files[${relativePath}].encoding must be base64`);
        continue;
      }

      if (typeof rawFile["content"] !== "string") {
        errors.push(`files[${relativePath}].content must be a string`);
        continue;
      }

      files[relativePath] = {
        encoding: "base64",
        content: rawFile["content"],
      };
    }
  }

  const exportedAt =
    typeof candidate["exportedAt"] === "string" && candidate["exportedAt"].trim() !== ""
      ? candidate["exportedAt"].trim()
      : new Date().toISOString();

  if (entryFile !== null && files[entryFile] === undefined) {
    errors.push(`files missing entryFile: ${entryFile}`);
  }

  if (errors.length > 0 || entryFile === null) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    bundle: {
      schemaVersion: INSTALLED_SCENE_THEME_BUNDLE_SCHEMA_VERSION,
      manifest: {
        themeId,
        label,
        entryFile,
      },
      files,
      exportedAt,
    },
  };
}

export class SceneThemePackageManager {
  private readonly installedRootOption: string | undefined;

  constructor(options: SceneThemePackageManagerOptions = {}) {
    this.installedRootOption = options.installedRoot;
  }

  getInstalledRoot(): string {
    return this.installedRootOption ?? Paths.getInstalledSceneThemesDir();
  }

  private getInstalledThemeRoot(themeId: string): string {
    return join(this.getInstalledRoot(), themeId);
  }

  private async ensureInstalledRoot(): Promise<void> {
    await mkdir(this.getInstalledRoot(), { recursive: true });
  }

  private async loadInstalledThemeDocument(
    themeRoot: string
  ): Promise<InstalledSceneThemeDocument | null> {
    try {
      return parseInstalledSceneThemeDocument(
        await readFile(join(themeRoot, INSTALLED_SCENE_THEME_DOCUMENT_FILE), "utf-8"),
        themeRoot
      );
    } catch {
      return null;
    }
  }

  private async getInstalledThemeRegistration(
    themeId: string
  ): Promise<SceneThemeRegistration | null> {
    const normalizedThemeId = normalizeSceneThemeId(themeId);
    if (normalizedThemeId === "") {
      return null;
    }

    const registrations = await this.listInstalledThemes();
    return registrations.find((registration) => registration.themeId === normalizedThemeId) ?? null;
  }

  private createImportedThemeId(baseThemeId: string): string {
    const normalizedThemeId = normalizeSceneThemeId(baseThemeId);
    if (normalizedThemeId === "") {
      return "scene-theme";
    }

    return normalizedThemeId;
  }

  private createInstalledThemeDocumentSnapshot(
    themeDocument: InstalledSceneThemeDocument
  ): InstalledSceneThemeDocument {
    return {
      version: INSTALLED_SCENE_THEME_DOCUMENT_VERSION,
      themeId: themeDocument.themeId,
      ...(typeof themeDocument.label === "string" ? { label: themeDocument.label } : {}),
      source: structuredClone(themeDocument.source),
    };
  }

  private resolveImportTargetThemeId(
    requestedThemeId: string,
    strategy: SceneThemeImportConflictStrategy
  ): string | null {
    const normalizedThemeId = this.createImportedThemeId(requestedThemeId);
    const preferredThemeRoot = this.getInstalledThemeRoot(normalizedThemeId);

    if (existsSync(preferredThemeRoot) === false || strategy === "replace") {
      return normalizedThemeId;
    }

    if (strategy === "reject") {
      return null;
    }

    let suffix = 2;
    while (suffix < 10_000) {
      const nextThemeId = `${normalizedThemeId}-${suffix}`;
      if (existsSync(this.getInstalledThemeRoot(nextThemeId)) === false) {
        return nextThemeId;
      }
      suffix += 1;
    }

    return null;
  }

  async listInstalledThemes(): Promise<SceneThemeRegistration[]> {
    const installedRoot = this.getInstalledRoot();
    await mkdir(installedRoot, { recursive: true });

    const entries = await readdir(installedRoot, { withFileTypes: true });
    const registrations: Array<SceneThemeRegistration | null> = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(async (entry) => {
          const themeRoot = join(installedRoot, entry.name);
          const themeDocumentPath = join(themeRoot, INSTALLED_SCENE_THEME_DOCUMENT_FILE);

          try {
            const themeDocument = parseInstalledSceneThemeDocument(
              await readFile(themeDocumentPath, "utf-8"),
              themeRoot
            );
            if (themeDocument === null) {
              return null;
            }

            return {
              themeId: themeDocument.themeId,
              label: themeDocument.label ?? themeDocument.themeId,
              sourceKind: "installed",
              sourceRoot: normalizeSceneThemePath(themeRoot),
              maps: themeDocument.source.maps,
              clickableDefaults: cloneSceneClickableTheme(themeDocument.source.clickableDefaults),
              source: themeDocument.source,
            } satisfies SceneThemeRegistration;
          } catch {
            return null;
          }
        })
    );

    return registrations
      .filter((registration): registration is SceneThemeRegistration => registration !== null)
      .sort((left, right) => left.label.localeCompare(right.label));
  }

  async packageInstalledTheme(
    themeId: string,
    options: { outputFile?: string } = {}
  ): Promise<SceneThemeOperationResult> {
    const normalizedThemeId = normalizeSceneThemeId(themeId);
    if (normalizedThemeId === "") {
      return { success: false, error: "themeId is required" };
    }

    await this.ensureInstalledRoot();
    const themeRoot = this.getInstalledThemeRoot(normalizedThemeId);
    const themeDocument = await this.loadInstalledThemeDocument(themeRoot);
    if (themeDocument === null) {
      return { success: false, error: `Installed scene theme not found: ${normalizedThemeId}` };
    }

    const files = await collectFilesRecursive(themeRoot);
    const bundleEntries = await Promise.all(
      files.map(async (file): Promise<[string, InstalledSceneThemeBundleFile]> => {
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
    const bundleFiles: Record<string, InstalledSceneThemeBundleFile> = {};
    bundleEntries.forEach(([relativePath, file]) => {
      bundleFiles[relativePath] = file;
    });

    const bundle: InstalledSceneThemeBundle = {
      schemaVersion: INSTALLED_SCENE_THEME_BUNDLE_SCHEMA_VERSION,
      manifest: {
        themeId: themeDocument.themeId,
        label: themeDocument.label ?? themeDocument.themeId,
        entryFile: INSTALLED_SCENE_THEME_DOCUMENT_FILE,
      },
      files: bundleFiles,
      exportedAt: new Date().toISOString(),
    };

    const outputFileOverride = options.outputFile?.trim() ?? "";
    const outputFile =
      outputFileOverride !== ""
        ? resolve(outputFileOverride)
        : join(themeRoot, "dist", `${themeDocument.themeId}.hevtheme.json`);
    await mkdir(dirname(outputFile), { recursive: true });
    await writeFile(outputFile, `${JSON.stringify(bundle, null, 2)}\n`, "utf-8");

    const packagedTheme = await this.getInstalledThemeRegistration(themeDocument.themeId);
    return {
      success: true,
      path: outputFile,
      themeId: themeDocument.themeId,
      ...(packagedTheme !== null ? { theme: packagedTheme } : {}),
    };
  }

  async importBundleFile(
    bundleFile: string,
    options: { onConflict?: SceneThemeImportConflictStrategy } = {}
  ): Promise<SceneThemeOperationResult> {
    const normalizedBundleFile = bundleFile.trim();
    if (normalizedBundleFile === "") {
      return { success: false, error: "bundleFile is required" };
    }

    let bundleCandidate: unknown;
    try {
      bundleCandidate = JSON.parse(
        await readFile(resolve(normalizedBundleFile), "utf-8")
      ) as unknown;
    } catch (error) {
      return {
        success: false,
        error: `Scene theme bundle could not be read: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    const validation = validateInstalledSceneThemeBundle(bundleCandidate);
    if (validation.valid !== true) {
      return {
        success: false,
        error: `Scene theme bundle is invalid: ${validation.errors.join("; ")}`,
      };
    }

    const strategy = options.onConflict ?? "reject";
    const targetThemeId = this.resolveImportTargetThemeId(
      validation.bundle.manifest.themeId,
      strategy
    );
    if (targetThemeId === null) {
      return {
        success: false,
        error: `Installed scene theme already exists: ${validation.bundle.manifest.themeId}`,
      };
    }

    const targetThemeRoot = this.getInstalledThemeRoot(targetThemeId);
    const shouldReplace = existsSync(targetThemeRoot) && strategy === "replace";
    await this.ensureInstalledRoot();

    if (shouldReplace) {
      await rm(targetThemeRoot, { recursive: true, force: true });
    }
    await mkdir(targetThemeRoot, { recursive: true });

    try {
      await Promise.all(
        Object.entries(validation.bundle.files).map(async ([relativePath, file]) => {
          const targetPath = join(targetThemeRoot, relativePath);
          await mkdir(dirname(targetPath), { recursive: true });
          await writeFile(targetPath, Buffer.from(file.content, "base64"));
        })
      );

      if (targetThemeId !== validation.bundle.manifest.themeId) {
        const importedThemeDocument = await this.loadInstalledThemeDocument(targetThemeRoot);
        if (importedThemeDocument === null) {
          throw new Error("Imported theme document is invalid after extraction.");
        }

        const rewrittenThemeDocument =
          this.createInstalledThemeDocumentSnapshot(importedThemeDocument);
        rewrittenThemeDocument.themeId = targetThemeId;
        rewrittenThemeDocument.source.themeId = targetThemeId;
        await writeFile(
          join(targetThemeRoot, INSTALLED_SCENE_THEME_DOCUMENT_FILE),
          `${JSON.stringify(rewrittenThemeDocument, null, 2)}\n`,
          "utf-8"
        );
      }

      const importedRegistration = await this.getInstalledThemeRegistration(targetThemeId);
      if (importedRegistration === null) {
        throw new Error("Imported scene theme could not be registered.");
      }

      return {
        success: true,
        path: targetThemeRoot,
        themeId: importedRegistration.themeId,
        theme: importedRegistration,
      };
    } catch (error) {
      await rm(targetThemeRoot, { recursive: true, force: true });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

let sceneThemePackageManager: SceneThemePackageManager | null = null;

export function getSceneThemePackageManager(): SceneThemePackageManager {
  sceneThemePackageManager ??= new SceneThemePackageManager();
  return sceneThemePackageManager;
}
