// @ts-nocheck

import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(moduleDirname, "..", "..");
const configPath = join(projectRoot, "config", "backup-scopes.json");
const backupDir = join(projectRoot, "backups");
const defaultLocale = "en";

function toPosix(value) {
  return value.replaceAll("\\", "/");
}

function createError(code, message, context = {}) {
  const error = new Error(message);
  error.code = code;
  error.context = context;
  return error;
}

function normalizeScopeIds(scopeIds) {
  if (!Array.isArray(scopeIds)) {
    return [];
  }

  const normalized = [];
  for (const scopeId of scopeIds) {
    const trimmed = typeof scopeId === "string" ? scopeId.trim() : "";
    if (trimmed !== "" && normalized.includes(trimmed) === false) {
      normalized.push(trimmed);
    }
  }
  return normalized;
}

async function readJsonFile(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function listFilesRecursive(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath)));
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegex(globPattern) {
  const pattern = toPosix(globPattern);
  let regex = "^";

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const nextChar = pattern[index + 1];

    if (char === "*" && nextChar === "*") {
      regex += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      regex += "[^/]*";
      continue;
    }

    regex += escapeRegExp(char ?? "");
  }

  regex += "$";
  return new RegExp(regex);
}

function getLiteralIncludeRoot(pattern) {
  const normalized = toPosix(pattern);
  const wildcardIndex = normalized.search(/[*]/);
  if (wildcardIndex === -1) {
    return normalized;
  }

  const prefix = normalized.slice(0, wildcardIndex);
  const withoutTrailingSlash = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  if (withoutTrailingSlash === "") {
    return ".";
  }

  const lastSlash = withoutTrailingSlash.lastIndexOf("/");
  return lastSlash === -1 ? "." : withoutTrailingSlash.slice(0, lastSlash);
}

function createScopeMatchers(definition) {
  return {
    include: definition.include.map((pattern) => ({
      pattern,
      regex: globToRegex(pattern),
    })),
    exclude: definition.exclude.map((pattern) => ({
      pattern,
      regex: globToRegex(pattern),
    })),
  };
}

function matchesAny(pathValue, matchers) {
  return matchers.some((matcher) => matcher.regex.test(pathValue));
}

async function collectScopeFiles(definition) {
  const matchers = createScopeMatchers(definition);
  const candidateFiles = new Set();

  for (const pattern of definition.include) {
    const rootCandidate = getLiteralIncludeRoot(pattern);
    const absoluteRoot = resolve(projectRoot, rootCandidate);
    if (existsSync(absoluteRoot) === false) {
      continue;
    }

    const stats = await stat(absoluteRoot);
    if (stats.isDirectory()) {
      const nestedFiles = await listFilesRecursive(absoluteRoot);
      for (const filePath of nestedFiles) {
        candidateFiles.add(filePath);
      }
      continue;
    }

    if (stats.isFile()) {
      candidateFiles.add(absoluteRoot);
    }
  }

  const selectedFiles = [];
  for (const filePath of candidateFiles) {
    const relativePath = toPosix(relative(projectRoot, filePath));
    if (relativePath.startsWith("..")) {
      continue;
    }
    if (matchesAny(relativePath, matchers.include) === false) {
      continue;
    }
    if (matchesAny(relativePath, matchers.exclude) === true) {
      continue;
    }

    selectedFiles.push({
      absolutePath: filePath,
      relativePath,
    });
  }

  selectedFiles.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return selectedFiles;
}

async function sha256Buffer(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

async function sha256String(value) {
  return await sha256Buffer(Buffer.from(value, "utf8"));
}

async function readScopeManifest() {
  const manifest = await readJsonFile(configPath);
  if (!Array.isArray(manifest.scopes) || !Array.isArray(manifest.presets)) {
    throw createError("INVALID_SCOPE_MANIFEST", "Backup scope manifest is invalid");
  }
  return manifest;
}

function resolveScopeSelection(manifest, options = {}) {
  const explicitScopeIds = normalizeScopeIds(options.scopeIds);
  const presetId = typeof options.presetId === "string" ? options.presetId.trim() : "";
  const scopeDefinitions = manifest.scopes.map((scope) => ({ ...scope }));
  const scopeMap = new Map(scopeDefinitions.map((scope) => [scope.id, scope]));
  const presetMap = new Map(manifest.presets.map((preset) => [preset.id, preset]));

  const selectedScopeIds = [];
  if (presetId !== "") {
    const preset = presetMap.get(presetId);
    if (preset === undefined) {
      throw createError("UNKNOWN_PRESET", `Unknown backup preset: ${presetId}`, { presetId });
    }
    selectedScopeIds.push(...normalizeScopeIds(preset.scopeIds));
  }

  if (explicitScopeIds.includes("all")) {
    selectedScopeIds.push(...scopeDefinitions.map((scope) => scope.id));
  } else {
    selectedScopeIds.push(...explicitScopeIds);
  }

  const normalizedSelection = normalizeScopeIds(selectedScopeIds);
  if (normalizedSelection.length === 0) {
    throw createError("NO_SCOPE_SELECTION", "At least one backup scope must be selected");
  }

  const selectedScopes = normalizedSelection.map((scopeId) => {
    const scope = scopeMap.get(scopeId);
    if (scope === undefined) {
      throw createError("UNKNOWN_SCOPE", `Unknown backup scope: ${scopeId}`, { scopeId });
    }
    return scope;
  });

  return {
    selectedScopeIds: normalizedSelection,
    selectedScopes,
  };
}

function formatTimestamp(date = new Date()) {
  return date.toISOString().replaceAll(":", "-");
}

function sanitizeName(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function deriveOutputPath(options = {}) {
  if (typeof options.outputPath === "string" && options.outputPath.trim() !== "") {
    return resolve(projectRoot, options.outputPath);
  }

  const labelPart =
    typeof options.label === "string" && options.label.trim() !== ""
      ? sanitizeName(options.label)
      : sanitizeName(options.selectedScopeIds.join("-"));

  return join(backupDir, `${formatTimestamp()}-${labelPart || "backup"}.hevbak`);
}

function resolveStoredBackupPath(filePath) {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    throw createError("BACKUP_FILE_REQUIRED", "Backup file is required");
  }

  const resolvedFilePath = resolve(projectRoot, filePath);
  const normalizedBackupDir = toPosix(resolve(backupDir)).toLowerCase();
  const normalizedFilePath = toPosix(resolvedFilePath).toLowerCase();
  if (normalizedFilePath.startsWith(`${normalizedBackupDir}/`) === false) {
    throw createError("BACKUP_FILE_FORBIDDEN", "Only stored backup files can be deleted", {
      filePath: resolvedFilePath,
    });
  }
  if (resolvedFilePath.endsWith(".hevbak") === false) {
    throw createError("BACKUP_FILE_EXTENSION", "Backup file must end with .hevbak", {
      filePath: resolvedFilePath,
    });
  }

  return resolvedFilePath;
}

export async function listScopes() {
  const manifest = await readScopeManifest();
  return manifest.scopes;
}

export async function listPresets() {
  const manifest = await readScopeManifest();
  return manifest.presets;
}

export async function createBackup(options = {}) {
  const manifest = await readScopeManifest();
  const selection = resolveScopeSelection(manifest, options);
  const outputPath = deriveOutputPath({
    outputPath: options.outputPath,
    label: options.label,
    selectedScopeIds: selection.selectedScopeIds,
  });
  const createdAt = new Date().toISOString();

  const entries = [];
  const scopeSummaries = [];

  for (const scope of selection.selectedScopes) {
    const files = await collectScopeFiles(scope);
    let scopeBytes = 0;

    for (const file of files) {
      const content = await readFile(file.absolutePath);
      const checksum = await sha256Buffer(content);
      scopeBytes += content.byteLength;

      const fileStats = await stat(file.absolutePath);
      entries.push({
        scopeId: scope.id,
        path: file.relativePath,
        size: content.byteLength,
        checksum,
        mtimeMs: fileStats.mtimeMs,
        contentBase64: content.toString("base64"),
      });
    }

    scopeSummaries.push({
      scopeId: scope.id,
      fileCount: files.length,
      totalBytes: scopeBytes,
    });
  }

  const bundleManifest = {
    bundleId: randomUUID(),
    schemaVersion: 1,
    createdAt,
    createdBy: typeof options.createdBy === "string" && options.createdBy.trim() !== "" ? options.createdBy : "user",
    sourceVersion: typeof options.sourceVersion === "string" && options.sourceVersion.trim() !== "" ? options.sourceVersion : null,
    selectedScopes: selection.selectedScopeIds,
    restoreMode:
      selection.selectedScopes.some((scope) => scope.requiresColdRestore === true) ? "cold" : "hot",
    label: typeof options.label === "string" && options.label.trim() !== "" ? options.label.trim() : null,
    note: typeof options.note === "string" && options.note.trim() !== "" ? options.note.trim() : null,
    entries: scopeSummaries,
  };

  const bundle = {
    manifest: bundleManifest,
    files: entries,
    checksums: {
      manifest: await sha256String(JSON.stringify(bundleManifest)),
    },
  };

  await ensureDir(dirname(outputPath));
  await writeFile(outputPath, JSON.stringify(bundle, null, 2), "utf8");

  const outputStats = await stat(outputPath);

  return {
    success: true,
    bundlePath: outputPath,
    bundle: bundleManifest,
    selectedScopes: selection.selectedScopeIds,
    totalBytes: outputStats.size,
  };
}

export async function inspectBackup(filePath) {
  const resolvedFilePath = resolve(projectRoot, filePath);
  const bundle = await readJsonFile(resolvedFilePath);
  if (!bundle || typeof bundle !== "object" || !bundle.manifest || !Array.isArray(bundle.files)) {
    throw createError("INVALID_BUNDLE", `Backup bundle is invalid: ${resolvedFilePath}`, {
      filePath: resolvedFilePath,
    });
  }

  return {
    filePath: resolvedFilePath,
    manifest: bundle.manifest,
    files: bundle.files,
    checksums: bundle.checksums ?? {},
  };
}

export async function listBackups(options = {}) {
  await ensureDir(backupDir);
  const entries = await readdir(backupDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".hevbak"))
    .map((entry) => join(backupDir, entry.name));

  const items = [];
  for (const filePath of files) {
    try {
      const bundle = await inspectBackup(filePath);
      const fileStats = await stat(filePath);
      items.push({
        filePath,
        createdAt: bundle.manifest.createdAt ?? null,
        label: bundle.manifest.label ?? null,
        selectedScopes: Array.isArray(bundle.manifest.selectedScopes)
          ? bundle.manifest.selectedScopes
          : [],
        totalBytes: fileStats.size,
        restoreMode: bundle.manifest.restoreMode ?? null,
      });
    } catch {
      items.push({
        filePath,
        createdAt: null,
        label: null,
        selectedScopes: [],
        totalBytes: null,
        restoreMode: null,
        invalid: true,
      });
    }
  }

  items.sort((left, right) => {
    const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
    const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
    return rightTime - leftTime;
  });

  if (typeof options.limit === "number" && Number.isFinite(options.limit) && options.limit > 0) {
    return items.slice(0, options.limit);
  }

  return items;
}

export async function deleteBackup(filePath) {
  await ensureDir(backupDir);
  const resolvedFilePath = resolveStoredBackupPath(filePath);
  await unlink(resolvedFilePath);

  return {
    success: true,
    filePath: resolvedFilePath,
  };
}

export async function previewBackupRestore(options = {}) {
  const bundle = await inspectBackup(options.filePath);
  const manifest = await readScopeManifest();
  const scopeMap = new Map(manifest.scopes.map((scope) => [scope.id, scope]));
  const selectedScopeIds =
    normalizeScopeIds(options.scopeIds).length > 0
      ? normalizeScopeIds(options.scopeIds)
      : normalizeScopeIds(bundle.manifest.selectedScopes);

  const missingScopes = selectedScopeIds.filter(
    (scopeId) => bundle.manifest.selectedScopes.includes(scopeId) === false
  );
  if (missingScopes.length > 0) {
    throw createError("BUNDLE_SCOPE_MISSING", "Requested scopes are missing from the bundle", {
      missingScopes,
    });
  }

  const selectedScopes = selectedScopeIds
    .map((scopeId) => scopeMap.get(scopeId))
    .filter((scope) => scope !== undefined);

  const relevantFiles = bundle.files.filter((entry) => selectedScopeIds.includes(entry.scopeId));
  const warnings = [];
  const overwrittenFiles = [];

  for (const entry of relevantFiles) {
    const destinationPath = resolve(projectRoot, entry.path);
    if (existsSync(destinationPath)) {
      overwrittenFiles.push(entry.path);
    }
  }

  if (selectedScopes.some((scope) => scope.riskLevel === "very-high")) {
    warnings.push("Restoring user data will overwrite the current runtime state.");
  }
  if (selectedScopes.some((scope) => scope.requiresColdRestore === true)) {
    warnings.push("Selected scopes are safer to restore while related processes are stopped.");
  }

  return {
    success: true,
    filePath: bundle.filePath,
    selectedScopes: selectedScopeIds,
    availableScopes: bundle.manifest.selectedScopes,
    requiresColdRestore: selectedScopes.some((scope) => scope.requiresColdRestore === true),
    restartTargets: [...new Set(selectedScopes.flatMap((scope) => scope.restartTargets ?? []))],
    riskLevel: selectedScopes.some((scope) => scope.riskLevel === "very-high")
      ? "very-high"
      : selectedScopes.some((scope) => scope.riskLevel === "high")
        ? "high"
        : selectedScopes.some((scope) => scope.riskLevel === "medium")
          ? "medium"
          : "low",
    warningCount: warnings.length,
    warnings,
    fileCount: relevantFiles.length,
    overwrittenFilesCount: overwrittenFiles.length,
  };
}

export async function restoreBackup(options = {}) {
  const preview = await previewBackupRestore(options);
  const bundle = await inspectBackup(options.filePath);
  const selectedScopeIds = preview.selectedScopes;
  const relevantFiles = bundle.files.filter((entry) => selectedScopeIds.includes(entry.scopeId));

  if (options.safetyBackup !== false) {
    await createBackup({
      scopeIds: selectedScopeIds,
      createdBy: typeof options.createdBy === "string" ? options.createdBy : "system",
      label: `safety-${selectedScopeIds.join("-")}`,
      note: `Pre-restore safety backup for ${bundle.filePath}`,
    });
  }

  for (const entry of relevantFiles) {
    const decoded = Buffer.from(entry.contentBase64, "base64");
    const checksum = await sha256Buffer(decoded);
    if (checksum !== entry.checksum) {
      throw createError("CHECKSUM_MISMATCH", `Checksum mismatch for ${entry.path}`, {
        path: entry.path,
      });
    }

    const destinationPath = resolve(projectRoot, entry.path);
    await ensureDir(dirname(destinationPath));
    await writeFile(destinationPath, decoded);
  }

  return {
    success: true,
    restoredScopes: selectedScopeIds,
    restoredFiles: relevantFiles.length,
    bundlePath: bundle.filePath,
  };
}

export function getBackupStorageDir() {
  return backupDir;
}

export function getProjectRoot() {
  return projectRoot;
}

export async function loadCliCatalog(locale = defaultLocale) {
  const normalizedLocale = locale === "tr" ? "tr" : defaultLocale;
  const catalogPath = join(projectRoot, "shared", "languages", normalizedLocale, "index.json");
  return await readJsonFile(catalogPath);
}
