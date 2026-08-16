// NOTE: All path construction must go through this module; avoid process.cwd() or ../ paths elsewhere.
// NOTE: Dev/prod detection should only happen here.

import { existsSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import type { PathConfig, PathResolver } from "./types/paths.ts";
import { readElectronAppLanguageSync } from "./i18n/language-service.ts";
import { getBuiltInLanguagePack } from "../shared/i18n/bundled-languages.ts";
import { translateCatalog } from "../shared/i18n/catalog.ts";
import { DEFAULT_APP_LANGUAGE } from "../src/types/i18n.ts";
import {
  buildLegacyUs1ProjectedAccountIdFromRemoteAccountId,
  extractRemoteEmailFromAccountId,
  isRemoteEmailAccountId,
} from "../src/types/archive.ts";
import {
  detectPackagedMode,
  resolveAssetsDir,
  resolveConfigDir,
  resolveDataDir,
  resolveProjectRoot,
} from "./path-roots.ts";

let config: (PathConfig & { electronDir: string }) | null = null;
const MAIN_APP_LOG_DIR_NAME = "app";
const ROOM_RUNTIME_RESIDUE_POLICY = Object.freeze({
  cleanupTrigger: "deleteData",
  ownsPackageContent: false,
  preserveByDefault: true,
} as const);

function pathsT(key: string): string {
  const locale = readElectronAppLanguageSync();
  const activeCatalog =
    getBuiltInLanguagePack(locale)?.catalog ??
    getBuiltInLanguagePack(DEFAULT_APP_LANGUAGE)?.catalog;
  const fallbackCatalog = getBuiltInLanguagePack(DEFAULT_APP_LANGUAGE)?.catalog;

  return translateCatalog(
    activeCatalog ?? fallbackCatalog ?? {},
    `electron.paths.${key}`,
    undefined,
    fallbackCatalog
  );
}

// NOTE: Call after app.whenReady() in main.ts.
export function initPaths(electronDirname: string): void {
  if (config !== null) {
    console.warn(pathsT("alreadyInitialized"));
    return;
  }

  const projectRoot = resolveProjectRoot();
  const isPackaged = detectPackagedMode();

  config = {
    projectRoot,
    dataDir: resolveDataDir(),
    configDir: resolveConfigDir(),
    logsDir: join(projectRoot, "logs"),
    commandsDir: join(projectRoot, "commands"),
    assetsDir: resolveAssetsDir(),
    isPackaged,
    electronDir: electronDirname,
  };
}

function getConfig(): PathConfig & { electronDir: string } {
  if (config === null) {
    throw new Error(pathsT("notInitialized"));
  }
  return config;
}

const paths: PathResolver = {
  getProjectRoot(): string {
    return getConfig().projectRoot;
  },

  getDataDir(): string {
    return getConfig().dataDir;
  },

  getConfigDir(): string {
    return getConfig().configDir;
  },

  getLogsDir(): string {
    return getConfig().logsDir;
  },

  getMainAppLogsDir(): string {
    return join(getConfig().logsDir, MAIN_APP_LOG_DIR_NAME);
  },

  getCommandsDir(): string {
    return getConfig().commandsDir;
  },

  getAssetsDir(): string {
    return getConfig().assetsDir;
  },

  getRoomsWorkspaceDir(): string {
    // NOTE: `rooms/` is the single editable room source tree in development.
    return join(getConfig().projectRoot, "rooms");
  },

  getBundledRoomsDir(): string {
    // NOTE: Packaged room workflows resolve against the projected external workspace root.
    return join(getConfig().projectRoot, "rooms");
  },

  getGeneratedRoomsDir(): string {
    // NOTE: Generated room runtime artifacts are disposable and must not be edited as source.
    return join(this.getRoomsWorkspaceDir(), ".build");
  },

  getRoomRuntimeBuildDir(roomId: string): string {
    return join(this.getGeneratedRoomsDir(), roomId, "runtime");
  },

  getInstalledRoomsDir(): string {
    // NOTE: Legacy generated install copies live here for migration/rollback only.
    return join(getConfig().dataDir, "rooms");
  },

  getInstalledSceneThemesDir(): string {
    return join(getConfig().dataDir, "scene-themes");
  },

  getRoomStorageDir(roomId: string): string {
    // NOTE: Room runtime state and generated artifacts live outside the package tree.
    return join(getConfig().dataDir, "room-storage", roomId);
  },

  getRoomPartitionsRoot(): string {
    return join(getConfig().dataDir, "electron-user-data", "Partitions");
  },

  getRoomPartitionDir(roomId: string): string {
    // NOTE: Room webview/session partitions are runtime residue, not package content.
    // NOTE: Retain them by default so reinstalls can reuse session state; only explicit deleteData cleanup removes them.
    return join(this.getRoomPartitionsRoot(), `room-${roomId}`);
  },

  getRoomRuntimeResiduePolicy(): {
    readonly cleanupTrigger: "deleteData";
    readonly ownsPackageContent: false;
    readonly preserveByDefault: true;
  } {
    return ROOM_RUNTIME_RESIDUE_POLICY;
  },

  getRoomsRegistryPath(): string {
    return join(getConfig().configDir, "rooms.json");
  },

  getInstalledRoomDir(roomId: string): string {
    return join(this.getInstalledRoomsDir(), roomId);
  },

  getInstalledSceneThemeDir(themeId: string): string {
    return join(this.getInstalledSceneThemesDir(), themeId);
  },

  sanitizeAccountId(accountId: string): string {
    if (isRemoteEmailAccountId(accountId)) {
      const remoteEmail = extractRemoteEmailFromAccountId(accountId) ?? "unknown";
      return `${remoteEmail.replace(/[@.]/g, "_")}_remote_email`;
    }

    const parts = accountId.split("_");
    const provider = parts[parts.length - 1] ?? "unknown";
    const emailCandidate = parts.slice(0, -1).join("_");
    const email = emailCandidate === "" ? "unknown" : emailCandidate;

    const safeEmail = email.replace(/[@.]/g, "_");

    return `${safeEmail}_${provider}`;
  },

  getAccountDir(accountId: string): string {
    const safeName = this.sanitizeAccountId(accountId);
    const primaryPath = join(getConfig().dataDir, safeName);
    if (existsSync(primaryPath) || !isRemoteEmailAccountId(accountId)) {
      return primaryPath;
    }

    const legacyProjectedAccountId = buildLegacyUs1ProjectedAccountIdFromRemoteAccountId(accountId);
    if (legacyProjectedAccountId === null) {
      return primaryPath;
    }

    const legacyPath = join(getConfig().dataDir, this.sanitizeAccountId(legacyProjectedAccountId));
    return existsSync(legacyPath) ? legacyPath : primaryPath;
  },

  getAccountDbPath(accountId: string): string {
    return join(this.getAccountDir(accountId), "archive.db");
  },

  getAccountMailSidecarDbPath(accountId: string): string {
    return join(this.getAccountDir(accountId), "mail-sidecar.db");
  },

  getWhispersPath(): string {
    return join(getConfig().dataDir, "whispers.json");
  },

  getPreloadPath(filename: string): string {
    const cfg = getConfig();
    return join(cfg.electronDir, filename);
  },

  getPreloadFileUrl(filename: string): string {
    const filePath = this.getPreloadPath(filename);
    return pathToFileURL(filePath).href;
  },

  getIconPath(): string {
    const cfg = getConfig();
    if (cfg.isPackaged) {
      return join(process.resourcesPath, "app.asar", "src/assets/icon.png");
    } else {
      return join(cfg.assetsDir, "icon.png");
    }
  },

  getHtmlEntryPath(): string {
    const cfg = getConfig();
    if (cfg.isPackaged) {
      return join(process.resourcesPath, "app.asar", "dist", "renderer", "index.html");
    } else {
      return join(cfg.projectRoot, "dist", "renderer", "index.html");
    }
  },

  getProviderConfigPath(providerId: string): string {
    const cfg = getConfig();
    return join(cfg.projectRoot, "src/js/modules/webview/providers", providerId, "config.ts");
  },

  getProtocolsPath(): string {
    return join(getConfig().dataDir, "protocols.json");
  },

  isPackaged(): boolean {
    return getConfig().isPackaged;
  },
};

export { paths as Paths };
