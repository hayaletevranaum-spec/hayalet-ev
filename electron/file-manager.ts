import { join, dirname, basename, resolve } from "path";
import { mkdir, writeFile, rename, readdir, readFile, copyFile, rm } from "fs/promises";
import { existsSync } from "fs";
import { shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { getLoggerCore } from "./logger/index.js";
import { LogCategory, LogLevel } from "@shared/index.js";
import { Paths } from "./paths.ts";
import { loadSettings } from "./settings-manager.ts";
import type { TranslationParams } from "../src/types/i18n.ts";
import { DEFAULT_APP_LANGUAGE } from "../src/types/i18n.ts";
import { loadAvailableLanguage } from "./i18n/language-service.ts";
import { translateCatalog } from "../shared/i18n/catalog.js";
import { getBuiltInLanguagePack } from "../shared/i18n/bundled-languages.js";
import { normalizeAppLanguage } from "../shared/i18n/locale.js";
import {
  canonicalizeProtocolKey,
  DEFAULT_PROTOCOL_KEYS,
  normalizeStoredProtocols,
  resolveStoredProtocolEntryForLocale,
  type StoredProtocolMap,
  upsertStoredProtocolEntry,
} from "../shared/protocol-storage.ts";

const logger = getLoggerCore();

interface ResultBase {
  success: boolean;
  message?: string;
  path?: string;
  [key: string]: unknown;
}

async function translateElectronMessage(key: string, params?: TranslationParams): Promise<string> {
  let settings: { general?: { language?: unknown } };
  try {
    settings = (await loadSettings()) ?? {};
  } catch {
    settings = {};
  }

  const locale = normalizeAppLanguage(settings.general?.language);
  const fallbackPack = getBuiltInLanguagePack(DEFAULT_APP_LANGUAGE);
  const activePack = (await loadAvailableLanguage(locale)) ?? fallbackPack;
  const activeCatalog = activePack?.catalog ?? {};
  const fallbackCatalog = fallbackPack?.catalog;

  return translateCatalog(activeCatalog, key, params, fallbackCatalog);
}

async function fileManagerT(key: string, params?: TranslationParams): Promise<string> {
  return await translateElectronMessage(`electron.fileManager.${key}`, params);
}

async function ensureDir(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}

export { ensureDir };

export async function fmTempPath(
  _event: IpcMainInvokeEvent,
  prefix: string = "tmp",
  ext: string = "tmp"
): Promise<ResultBase> {
  try {
    const cleanPrefix = prefix.replace(/[^\w.-]+/g, "_");
    const cleanExt = ext.toString().replace(/^[.]+/, "");
    const filename = `${cleanPrefix}-${Date.now()}-${Math.random().toString(16).slice(2)}${cleanExt.length > 0 ? `.${cleanExt}` : ""}`;
    const baseDir = Paths.getCommandsDir();
    await ensureDir(baseDir);
    const fullPath = join(baseDir, filename);
    return { success: true, path: fullPath };
  } catch (error: unknown) {
    return { success: false, message: (error as Error).message };
  }
}

export async function fmEnsureDirs(
  _event: IpcMainInvokeEvent,
  scope: string = "all"
): Promise<ResultBase> {
  try {
    const scopes = scope === "all" ? ["data", "logs", "commands"] : [scope];
    const resolved: Record<string, string> = {};
    await Promise.all(
      scopes.map(async (key) => {
        let p: string;
        if (key === "data") p = Paths.getDataDir();
        else if (key === "logs") p = Paths.getLogsDir();
        else if (key === "commands") p = Paths.getCommandsDir();
        else return;
        await ensureDir(p);
        resolved[key] = p;
      })
    );
    return { success: true, paths: resolved };
  } catch (err: unknown) {
    return { success: false, message: (err as Error).message };
  }
}

export async function fmWriteFileAtomic(
  _event: IpcMainInvokeEvent,
  payload: { path: string; data: string; encoding?: BufferEncoding }
): Promise<ResultBase> {
  try {
    const { path: targetPath, data, encoding = "utf-8" } = payload;
    if (targetPath.length === 0) throw new Error(await fileManagerT("pathMissing"));
    const dir = dirname(targetPath);
    await ensureDir(dir);
    const tmpPath = `${targetPath}.${Date.now()}.tmp`;
    const buffer =
      typeof data === "string"
        ? Buffer.from(data, encoding === "base64" ? "base64" : encoding)
        : Buffer.from(data);
    await writeFile(tmpPath, buffer);
    await rename(tmpPath, targetPath);
    return { success: true, path: targetPath };
  } catch (error: unknown) {
    return { success: false, message: (error as Error).message };
  }
}

export async function readFileAsBase64(
  _event: IpcMainInvokeEvent,
  filePath: string
): Promise<string | null> {
  try {
    if (filePath.length === 0 || !existsSync(filePath)) return null;
    const buffer = await readFile(filePath);
    return buffer.toString("base64");
  } catch (err: unknown) {
    return null;
  }
}

export async function copyToAssets(
  _event: IpcMainInvokeEvent,
  srcPath: string,
  _role: string = "",
  accountInfo: { id?: string; email?: string; provider?: string } | null = null
): Promise<ResultBase> {
  try {
    if (srcPath.length === 0 || !existsSync(srcPath)) {
      throw new Error(await fileManagerT("sourceFileMissing"));
    }
    const role = String(_role).trim().toLowerCase();
    let avatarDir = Paths.getAssetsDir();

    if (role === "user") {
      avatarDir = Paths.getDataDir();
    } else if (role === "assistant") {
      avatarDir = join(Paths.getDataDir(), "shared");
    } else if (role === "account") {
      const accountId = typeof accountInfo?.id === "string" ? accountInfo.id.trim() : "";
      if (accountId !== "") {
        avatarDir = Paths.getAccountDir(accountId);
      } else {
        avatarDir = Paths.getDataDir();
      }
    }

    if (!existsSync(avatarDir)) {
      await mkdir(avatarDir, { recursive: true });
    }
    const baseName = basename(srcPath);
    const parts = baseName.split(".");
    const ext = parts.length > 1 ? "." + parts.pop() : "";
    let candidate;

    if (
      accountInfo?.email !== undefined &&
      accountInfo.email.length > 0 &&
      accountInfo.provider !== undefined &&
      accountInfo.provider.length > 0
    ) {
      const safeEmail = String(accountInfo.email)
        .trim()
        .replace(/@/g, "at")
        .replace(/[^a-z0-9.-]/gi, "");
      const safeProvider = String(accountInfo.provider)
        .trim()
        .replace(/[^a-z0-9_-]/gi, "");
      candidate = `${safeEmail}-${safeProvider}${ext}`;
    } else if (role.length > 0) {
      const normalizedRole = role.replace(/[^a-z0-9_-]+/g, "");
      const safeRole = normalizedRole.length > 0 ? normalizedRole : "avatar";
      candidate = `${safeRole}${ext}`;
    } else {
      const stemBase = parts.join(".");
      const stem = stemBase.length > 0 ? stemBase : "avatar";
      candidate = `${stem}${ext}`;
      let counter = 1;
      while (existsSync(join(avatarDir, candidate))) {
        candidate = `${stem} (${counter})${ext}`;
        counter += 1;
      }
    }

    if (role === "user") {
      try {
        const entries = await readdir(avatarDir);
        await Promise.all(
          entries
            .filter((name) => /^user\.[^./\\]+$/i.test(name))
            .map(async (name) => {
              await rm(join(avatarDir, name), { force: true });
            })
        );
      } catch (e) {
        void logger.logInternalT(
          LogCategory.FILE_MANAGER,
          LogLevel.WARNING,
          "electron.fileManager.logs.userAvatarRemoveFailed",
          { message: e instanceof Error ? e.message : String(e) },
          { error: e instanceof Error ? e.message : String(e) }
        );
      }
    }

    const destPath = join(avatarDir, candidate);
    await copyFile(srcPath, destPath);
    return { success: true, path: destPath, fileName: candidate };
  } catch (error: unknown) {
    return { success: false, message: (error as Error).message };
  }
}

export async function copyFileTo(
  _event: IpcMainInvokeEvent,
  srcPath: string,
  destDir: string
): Promise<ResultBase> {
  try {
    if (srcPath.length === 0 || destDir.length === 0) {
      throw new Error(await fileManagerT("parametersMissing"));
    }
    if (!existsSync(srcPath)) throw new Error(await fileManagerT("sourceFileMissing"));
    await mkdir(destDir, { recursive: true });
    const base = basename(srcPath);
    let candidate = base;
    let counter = 1;
    while (existsSync(join(destDir, candidate))) {
      const parts = base.split(".");
      const ext = parts.length > 1 ? "." + parts.pop() : "";
      const stemBase = parts.join(".");
      const stem = stemBase.length > 0 ? stemBase : "file";
      candidate = `${stem} (${counter})${ext}`;
      counter += 1;
    }
    const target = join(destDir, candidate);
    await copyFile(srcPath, target);
    return { success: true, path: target, name: candidate };
  } catch (error: unknown) {
    return { success: false, message: (error as Error).message };
  }
}

export async function deleteAsset(
  _event: IpcMainInvokeEvent,
  assetPath: string
): Promise<ResultBase> {
  try {
    if (assetPath.length === 0) throw new Error(await fileManagerT("assetPathMissing"));
    const target = assetPath;
    if (!existsSync(target)) {
      return { success: true, message: await fileManagerT("assetNotFound") };
    }
    await rm(target, { force: true });
    return { success: true };
  } catch (error: unknown) {
    return { success: false, message: (error as Error).message };
  }
}

interface GenerateTreeOptions {
  maxDepth?: number;
  exclude?: string[];
}

export async function generateTree(
  _event: IpcMainInvokeEvent,
  basePath: string = "",
  options: GenerateTreeOptions = {}
): Promise<ResultBase & { tree?: string }> {
  try {
    if (basePath.length === 0) basePath = Paths.getProjectRoot();
    const maxDepth = options.maxDepth ?? 10;
    const excludePatterns = options.exclude ?? ["node_modules", "dist", ".vite"];
    const isProject = basePath === "project" || basePath === ".";
    if (isProject) basePath = Paths.getProjectRoot();
    if (!existsSync(basePath)) {
      return { success: false, message: await fileManagerT("pathNotFound", { path: basePath }) };
    }
    const shouldExclude = (name: string): boolean =>
      excludePatterns.some((pattern) => {
        if (pattern.includes("*")) {
          const regex = new RegExp(pattern.replace(/\*/g, ".*"));
          return regex.test(name);
        }
        return name === pattern;
      });
    const buildTree = async (
      dir: string,
      depth: number = 0,
      prefix: string = ""
    ): Promise<string[]> => {
      if (depth > maxDepth) return [];
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        const lines: string[] = [];
        const filtered = entries.filter((e) => !shouldExclude(e.name));
        const blocks = await Promise.all(
          filtered.map(async (entry, idx): Promise<string[]> => {
            const isLast = idx === filtered.length - 1;
            const connector = isLast ? "└── " : "├── ";
            const nextPrefix = prefix + (isLast ? "    " : "│   ");
            const head = prefix + connector + entry.name + (entry.isDirectory() ? "/" : "");
            if (!entry.isDirectory()) return [head];
            const childLines: string[] = await buildTree(
              join(dir, entry.name),
              depth + 1,
              nextPrefix
            );
            return [head, ...childLines];
          })
        );
        blocks.forEach((block) => lines.push(...block));
        return lines;
      } catch (err: unknown) {
        return [];
      }
    };
    const lines = [basePath + "/"];
    const treeLines = await buildTree(basePath);
    lines.push(...treeLines);
    const treeContent = lines.join("\n");
    const tempDir = Paths.getCommandsDir();
    await ensureDir(tempDir);
    const timestamp = Date.now();
    const treeFile = join(tempDir, `tree-${timestamp}.txt`);
    await writeFile(treeFile, treeContent, "utf-8");
    return {
      success: true,
      path: treeFile,
      content: treeContent,
      fileName: `tree-${timestamp}.txt`,
      lines: lines.length,
    };
  } catch (error: unknown) {
    return { success: false, message: (error as Error).message };
  }
}

export async function openPath(targetPath: string): Promise<ResultBase> {
  try {
    if (targetPath.length === 0) throw new Error(await fileManagerT("pathMissing"));

    if (targetPath.startsWith("http://") || targetPath.startsWith("https://")) {
      await shell.openExternal(targetPath);
      return { success: true };
    }

    const absolutePath = resolve(Paths.getProjectRoot(), targetPath);
    const res = await shell.openPath(absolutePath);
    if (res.length > 0) throw new Error(res);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, message: (error as Error).message };
  }
}

function normalizeLocaleKey(locale: unknown): string {
  return normalizeAppLanguage(locale);
}

async function resolveProtocolLocale(): Promise<string> {
  try {
    const settings = (await loadSettings()) as { general?: { language?: unknown } } | null;
    return normalizeLocaleKey(settings?.general?.language);
  } catch {
    return DEFAULT_APP_LANGUAGE;
  }
}

async function writeProtocolsJson(
  protocolsPath: string,
  protocols: StoredProtocolMap
): Promise<void> {
  await ensureDir(Paths.getDataDir());
  await writeFile(protocolsPath, `${JSON.stringify(protocols, null, 2)}\n`, "utf-8");
}

async function ensureProtocolsJson(): Promise<StoredProtocolMap> {
  const protocolsPath = Paths.getProtocolsPath();

  if (existsSync(protocolsPath)) {
    const raw = await readFile(protocolsPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeStoredProtocols(parsed);
    if (normalized.changed === true) {
      await writeProtocolsJson(protocolsPath, normalized.protocols);
    }
    return normalized.protocols;
  }

  const protocols: StoredProtocolMap = {};
  DEFAULT_PROTOCOL_KEYS.forEach((key) => {
    protocols[key] = "";
  });

  await writeProtocolsJson(protocolsPath, protocols);
  await logger.logInternal(
    LogCategory.SYSTEM,
    LogLevel.INFO,
    await fileManagerT("protocolsCreatedFirstRun")
  );
  return protocols;
}

export async function loadProtocols(
  _event: IpcMainInvokeEvent
): Promise<{ success: boolean; protocols?: Record<string, string>; message?: string }> {
  try {
    const [protocols, locale] = await Promise.all([ensureProtocolsJson(), resolveProtocolLocale()]);
    const resolved = Object.fromEntries(
      Object.entries(protocols).map(([key, value]) => [
        key,
        resolveStoredProtocolEntryForLocale(value, locale),
      ])
    );
    return { success: true, protocols: resolved };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await logger.logInternal(
      LogCategory.SYSTEM,
      LogLevel.ERROR,
      await fileManagerT("protocolsReadFailed", { message })
    );
    return { success: false, message };
  }
}

export async function saveProtocol(
  _event: IpcMainInvokeEvent,
  key: string,
  content: string
): Promise<{ success: boolean; message?: string }> {
  try {
    if (key.trim().length === 0) throw new Error(await fileManagerT("protocolKeyMissing"));

    const [protocols, locale] = await Promise.all([ensureProtocolsJson(), resolveProtocolLocale()]);
    const nextProtocols = upsertStoredProtocolEntry(protocols, key, content, locale);
    const protocolsPath = Paths.getProtocolsPath();
    await writeProtocolsJson(protocolsPath, nextProtocols);
    await logger.logInternal(
      LogCategory.SYSTEM,
      LogLevel.INFO,
      await fileManagerT("protocolUpdated", { key: canonicalizeProtocolKey(key) })
    );
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await logger.logInternal(
      LogCategory.SYSTEM,
      LogLevel.ERROR,
      await fileManagerT("protocolSaveFailed", { message })
    );
    return { success: false, message };
  }
}
