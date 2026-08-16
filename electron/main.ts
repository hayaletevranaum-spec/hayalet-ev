import { app, BrowserWindow, dialog, shell, ipcMain } from "electron";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { basename, dirname, join } from "path";
import { initPaths, Paths } from "./paths.ts";
import { deviceActionHandler } from "./device-manager.ts";
import {
  capturePageHandler,
  captureWebContentsPageHandler,
  screenshotCaptureHandler,
} from "./screenshot-manager.ts";
import { whisperLoad, whisperSave } from "./whisper-manager.ts";
import { buildInstalledRoomRecord } from "./room-package-manager.ts";
import {
  commandInit,
  commandWrite,
  commandPaths,
  commandStageAttachments,
  commandStageTemp,
  commandCleanupTemp,
  commandMoveFailed,
  commandArchiveCopy,
  commandCleanupJob,
  commandMove,
} from "./command-manager.ts";
import { DatabaseManager } from "./database/index.ts";
import {
  fmWriteFileAtomic,
  readFileAsBase64,
  copyToAssets,
  copyFileTo,
  deleteAsset,
  generateTree,
  loadProtocols,
  saveProtocol,
} from "./file-manager.ts";
import {
  createWindow as createAppWindow,
  initWindowManager,
  setTrayIconPath,
  setMainWindow,
} from "./window-manager.ts";
import { parseStartupFlagsFromArgv } from "./startup-flags.ts";
import { loadSettings, saveSettings } from "./settings-manager.ts";
import { catboxUpload, uguuUpload } from "./webview-manager.ts";
import {
  googledriveStartAuth,
  googledriveExchangeCode,
  googledriveDisconnect,
  googledriveUpload,
  googleDriveT,
} from "./googledrive-manager.ts";
import { opencodeServerManager } from "./opencode-server-manager.ts";
import { llmServerManager } from "./llm-server-manager.ts";
import {
  archiveOpencodeUiSession,
  ensureOpencodeUiSession,
  listOpencodeUiSessions,
  readOpencodeUiSession,
} from "./opencode-ui-session-store.ts";
import { OpencodeUiSessionWatcherRegistry } from "./opencode-ui-session-watcher.ts";

import { readConsoleLogs, readErrorLogs, readAllLogs, queryLogs } from "./logger/log-reader.ts";
import {
  deleteInactiveLogSessions,
  listSessions,
  updateAppState,
  getAppState,
} from "./logger/session-manager.ts";
import { writeStateSnapshot } from "./logger/log-writer.ts";
import { SessionManager } from "./session-manager.ts";

function generateCorrelationId(prefix: string = "op"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
import type { LogQueryParams } from "./types/index.ts";

function cloneInstalledRoomRecord(record: InstalledRoomRecord): InstalledRoomRecord {
  return {
    ...record,
    features: record.features.map((feature) => ({
      ...feature,
      ...(Array.isArray(feature.commandSpecs)
        ? { commandSpecs: feature.commandSpecs.map((spec) => ({ ...spec })) }
        : {}),
      ...(Array.isArray(feature.protocolSpecs)
        ? { protocolSpecs: feature.protocolSpecs.map((spec) => ({ ...spec })) }
        : {}),
      ...(feature.scene !== undefined
        ? {
            scene: {
              hotspot: {
                ...feature.scene.hotspot,
                rect: { ...feature.scene.hotspot.rect },
                ...(feature.scene.hotspot.label !== undefined
                  ? { label: { ...feature.scene.hotspot.label } }
                  : {}),
              },
              view: {
                ...feature.scene.view,
                ...(feature.scene.view.transparentWindow !== undefined
                  ? { transparentWindow: { ...feature.scene.view.transparentWindow } }
                  : {}),
              },
            },
          }
        : {}),
    })),
    ...(record.scene !== undefined
      ? {
          scene: {
            referenceSize: { ...record.scene.referenceSize },
            roomBackgroundPath: record.scene.roomBackgroundPath,
            roomsHotspot: {
              ...record.scene.roomsHotspot,
              rect: { ...record.scene.roomsHotspot.rect },
              ...(record.scene.roomsHotspot.label !== undefined
                ? { label: { ...record.scene.roomsHotspot.label } }
                : {}),
            },
            backHotspot: {
              ...record.scene.backHotspot,
              rect: { ...record.scene.backHotspot.rect },
              ...(record.scene.backHotspot.label !== undefined
                ? { label: { ...record.scene.backHotspot.label } }
                : {}),
            },
          },
        }
      : {}),
    ...(Array.isArray(record.commandSpecs)
      ? { commandSpecs: record.commandSpecs.map((spec) => ({ ...spec })) }
      : {}),
    ...(Array.isArray(record.protocolSpecs)
      ? { protocolSpecs: record.protocolSpecs.map((spec) => ({ ...spec })) }
      : {}),
  };
}

function readStartupRoomsSnapshot(): StartupRoomsSnapshot | null {
  const registryPath = Paths.getRoomsRegistryPath();
  if (existsSync(registryPath) === false) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(registryPath, "utf8")) as Partial<RoomRegistryState>;
    if (parsed.version !== 2 || Array.isArray(parsed.rooms) === false) {
      return null;
    }
    const rooms = Array.isArray(parsed.rooms)
      ? parsed.rooms
          .map((room) => {
            try {
              if (existsSync(room.manifestPath) === false) {
                return null;
              }

              const validation = validateRoomManifest(
                JSON.parse(readFileSync(room.manifestPath, "utf8"))
              );
              if (validation.valid !== true || validation.manifest === undefined) {
                return null;
              }

              return cloneInstalledRoomRecord(
                buildInstalledRoomRecord(validation.manifest, {
                  sourceDir: room.sourceDir,
                  installedDir: room.installedDir,
                  installedAt: room.installedAt,
                  updatedAt: room.updatedAt,
                })
              );
            } catch {
              return null;
            }
          })
          .filter((room): room is InstalledRoomRecord => room !== null)
      : [];

    if (rooms.length === 0) {
      return null;
    }

    const protocols: StartupRoomProtocolSnapshot[] = [];

    rooms.forEach((room) => {
      (room.protocolSpecs ?? []).forEach((spec) => {
        const protocolPath = join(room.installedDir, "protocols", `${spec.key}.md`);
        let body = "";

        try {
          if (existsSync(protocolPath) === true) {
            body = readFileSync(protocolPath, "utf8");
          }
        } catch {
          body = "";
        }

        protocols.push({
          roomId: room.id,
          key: spec.key,
          body,
        });
      });
    });

    return { rooms, protocols };
  } catch {
    return null;
  }
}

import { setupFsHandlers } from "./handlers/ipc-fs.ts";
import { setupWindowHandlers } from "./handlers/ipc-window.ts";
import { setupProviderHandlers } from "./handlers/ipc-provider.ts";
import { setupSettingsHandlers } from "./handlers/ipc-settings.ts";
import { setupI18nHandlers } from "./handlers/ipc-i18n.ts";
import { setupDatabaseHandlers } from "./handlers/ipc-database.ts";
import { setupMemoryHandlers } from "./handlers/ipc-memory.ts";
import { setupOpencodeUiToolsHandlers } from "./handlers/ipc-opencode-ui-tools.ts";
import { setupLlmServerHandlers } from "./handlers/ipc-llm-server.ts";
import { setupRoomHandlers } from "./handlers/ipc-rooms.ts";
import { setupRoomToolHandlers } from "./handlers/ipc-room-tools.ts";
import { setupSceneThemeHandlers } from "./handlers/ipc-scene-themes.ts";
import { setupBackupHandlers } from "./handlers/ipc-backup.ts";
import { setupCaptureHandlers } from "./handlers/ipc-capture.ts";
import { setupTranscriptHandlers } from "./handlers/ipc-transcript.ts";
import { setupTtsHandlers } from "./handlers/ipc-tts.ts";
import { setupOperationsHandlers } from "./handlers/ipc-operations.ts";
import { setupUs1MailHandlers } from "./handlers/ipc-us1-mail.ts";
import { captureService } from "./capture-service.ts";
import { registerTtsAndroidBridge } from "./tts-service.ts";

import { registerHandler, handleLoggerAppendBatch } from "./handlers/ipc-helpers.ts";
import { initLogger, shutdownLogger, getLoggerCore } from "./logger/index.js";
import { LogCategory, LogLevel, validateRoomManifest } from "@shared/index.js";
import type {
  InstalledRoomRecord,
  RoomRegistryState,
  StartupRoomProtocolSnapshot,
  StartupRoomsSnapshot,
} from "@shared/index.js";
import { translateElectronMessage } from "./i18n/language-service.ts";

const logger = getLoggerCore();

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = dirname(moduleFilename);

initPaths(moduleDirname);

const appInstanceLabel = app.isPackaged ? app.getName() : basename(Paths.getProjectRoot());
const userDataDir = join(Paths.getDataDir(), "electron-user-data");

app.setName(appInstanceLabel);
mkdirSync(userDataDir, { recursive: true });
app.setPath("userData", userDataDir);

const CDP_PORT = process.env["CDP_PORT"] ?? (app.isPackaged ? 9223 : 9222);
app.commandLine.appendSwitch("remote-debugging-port", CDP_PORT.toString());

let mainWindow: BrowserWindow | null = null;
const opencodeUiSessionWatchers = new OpencodeUiSessionWatcherRegistry();

if (process.stdout.isTTY === true) {
  try {
    process.stdout.write("\x1b" + "[?1004l");
  } catch (e) {
    void logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.WARNING,
      "electron.main.logs.ttyCleanupFailed",
      { message: e instanceof Error ? e.message : String(e) },
      {
        error: e,
      }
    );
  }
}

updateAppState({
  startTime: new Date().toISOString(),
  platform: process.platform,
  nodeVersion: process.version,
});

async function syncOpencodeSettingsOnStartup(): Promise<void> {
  try {
    const settings = await loadSettings();
    if (settings === null) return;

    const settingsRecord = settings as unknown as Record<string, unknown>;
    const assistantsRaw = settingsRecord["assistants"];
    const assistants =
      typeof assistantsRaw === "object" && assistantsRaw !== null
        ? (assistantsRaw as Record<string, unknown>)
        : (settingsRecord["assistants"] = {});
    const opencodeRaw = assistants["opencode"];
    const opencode =
      typeof opencodeRaw === "object" && opencodeRaw !== null
        ? (opencodeRaw as Record<string, unknown>)
        : (assistants["opencode"] = {});

    const defaultPortValue = opencode["defaultPort"];
    if (
      typeof defaultPortValue !== "number" ||
      Number.isInteger(defaultPortValue) !== true ||
      defaultPortValue < 1024 ||
      defaultPortValue > 65535
    ) {
      opencode["defaultPort"] = 4096;
    }

    const hadLegacyBinaryPath = "binaryPath" in opencode;
    if (hadLegacyBinaryPath) {
      delete opencode["binaryPath"];
    }

    const diagnosis = await opencodeServerManager.diagnoseBinary();

    const nextVersion =
      diagnosis.available &&
      typeof diagnosis.version === "string" &&
      diagnosis.version.trim() !== ""
        ? diagnosis.version.trim()
        : null;

    const prevVersion =
      typeof opencode["version"] === "string" && opencode["version"].trim() !== ""
        ? opencode["version"].trim()
        : null;

    opencode["version"] = nextVersion;

    if (prevVersion !== nextVersion || hadLegacyBinaryPath) {
      await saveSettings(settings);
    }

    await logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.INFO,
      "electron.main.logs.startupOpencodeBinaryProbeCompleted",
      undefined,
      {
        available: diagnosis.available,
        version: opencode["version"],
        command: diagnosis.command,
        resolvedPath: diagnosis.resolvedPath ?? null,
        error: diagnosis.error,
      }
    );
  } catch (error) {
    await logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.WARNING,
      "electron.main.logs.startupOpencodeProbeFailed",
      { message: error instanceof Error ? error.message : String(error) },
      {
        error: error instanceof Error ? error.message : String(error),
      }
    );
  }
}

app.on("second-instance", (_event, _commandLine, _workingDirectory) => {
  if (mainWindow !== null) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    void logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.INFO,
      "electron.main.logs.secondInstanceFocused"
    );
  }
});

void app.whenReady().then(async () => {
  try {
    try {
      await initLogger();
      await logger.logInternalT(
        LogCategory.MAIN,
        LogLevel.INFO,
        "electron.main.logs.unifiedLoggerInitialized"
      );
    } catch (e: unknown) {
      await logger.logInternalT(
        LogCategory.MAIN,
        LogLevel.ERROR,
        "electron.main.logs.loggerInitializationFailed",
        { message: (e as Error).message },
        {
          error: {
            name: (e as Error).name,
            message: (e as Error).message,
            stack: (e as Error).stack,
          },
        }
      );
    }

    try {
      await SessionManager.clearStartupCache();
    } catch (e: unknown) {
      await logger.logInternalT(
        LogCategory.MAIN,
        LogLevel.WARNING,
        "electron.main.logs.startupCacheClearFailed",
        { message: (e as Error).message },
        { error: { message: (e as Error).message } }
      );
    }

    await syncOpencodeSettingsOnStartup();

    setupFsHandlers(null);
    setupWindowHandlers();
    setupDatabaseHandlers();
    setupProviderHandlers();
    setupSettingsHandlers();
    setupI18nHandlers();
    setupMemoryHandlers();
    setupCaptureHandlers();
    setupTranscriptHandlers();
    registerTtsAndroidBridge(captureService);
    setupTtsHandlers();
    setupOperationsHandlers();
    setupOpencodeUiToolsHandlers();
    setupLlmServerHandlers();
    setupRoomHandlers(null);
    setupRoomToolHandlers();
    setupSceneThemeHandlers();
    setupBackupHandlers();
    setupUs1MailHandlers();

    const startupFlags = parseStartupFlagsFromArgv(process.argv);
    startupFlags.roomsSnapshot = readStartupRoomsSnapshot();
    mainWindow = createAppWindow({ startupFlags });

    setMainWindow(mainWindow);

    try {
      initWindowManager({ mainWindow });
    } catch (e) {
      void logger.logInternalT(
        LogCategory.MAIN,
        LogLevel.ERROR,
        "electron.main.logs.initWindowManagerFailed",
        { message: e instanceof Error ? e.message : String(e) },
        {
          error: e,
        }
      );
    }

    try {
      const iconPath = Paths.getIconPath();
      setTrayIconPath(iconPath);
    } catch (e) {
      await logger.logInternalT(
        LogCategory.MAIN,
        LogLevel.ERROR,
        "electron.main.logs.trayIconPathError",
        { message: e instanceof Error ? e.message : String(e) },
        {
          error: e,
        }
      );
    }
  } catch (err: unknown) {
    const errorDetails =
      err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : { raw: String(err) };
    await logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.ERROR,
      "electron.main.logs.createAppWindowCriticalFailed",
      undefined,
      {
        error: errorDetails,
      }
    );
    console.error(
      await translateElectronMessage("electron.main.logs.criticalErrorConsole", {
        message: err instanceof Error ? err.message : String(err),
      })
    );
    process.exit(1);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createAppWindow();
    }
  });
});

let cleanupDone = false;

async function shouldKeepAssistantServersRunningOnClose(): Promise<boolean> {
  try {
    const settings = await loadSettings();
    return settings?.assistants?.keepServersOnAppClose === true;
  } catch {
    return false;
  }
}

async function performCleanup(): Promise<void> {
  if (cleanupDone) return;
  cleanupDone = true;

  const keepServersOnAppClose = await shouldKeepAssistantServersRunningOnClose();

  await logger.logInternalT(
    LogCategory.MAIN,
    LogLevel.INFO,
    "electron.main.logs.cleanupStarted",
    undefined,
    {
      keepServersOnAppClose,
    }
  );

  try {
    await captureService.shutdown();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.info(`Capture cleanup failed: ${message}`);
    await logger.logInternal(LogCategory.MAIN, LogLevel.ERROR, "Capture cleanup failed.", {
      message,
    });
  }

  try {
    if (keepServersOnAppClose) {
      console.info(await translateElectronMessage("electron.main.logs.cleanupSkippedBySettings"));
    } else {
      const ocStatus = await opencodeServerManager.findRunningServer(4096, 4110);
      if (ocStatus.running) {
        const ocPort = ocStatus.port != null ? String(ocStatus.port) : "unknown";
        console.info(
          await translateElectronMessage("electron.main.logs.stoppingOpencodeServeConsole", {
            port: ocPort,
          })
        );
        await opencodeServerManager.stop();

        const ocAfter = await opencodeServerManager.findRunningServer(4096, 4110);
        if (ocAfter.running) {
          const afterPort = ocAfter.port != null ? String(ocAfter.port) : "unknown";
          console.info(
            await translateElectronMessage(
              "electron.main.logs.opencodeServeStillRunningAfterStop",
              {
                port: afterPort,
              }
            )
          );
        } else {
          console.info(
            await translateElectronMessage("electron.main.logs.opencodeServeProcessClosed")
          );
        }
      } else {
        console.info(await translateElectronMessage("electron.main.logs.opencodeServeNotRunning"));
      }
    }
    await logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.INFO,
      "electron.main.logs.opencodeServeCleanupDone",
      undefined,
      {
        keepServersOnAppClose,
      }
    );
  } catch (err: unknown) {
    console.info(
      await translateElectronMessage("electron.main.logs.opencodeServeCleanupFailedConsole", {
        message: err instanceof Error ? err.message : String(err),
      })
    );
    await logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.ERROR,
      "electron.main.logs.opencodeServeCleanupFailed",
      { message: err instanceof Error ? err.message : String(err) },
      {
        error: err,
      }
    );
  }

  try {
    await llmServerManager.stop(undefined, { force: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.info(`LLM server cleanup failed: ${message}`);
    await logger.logInternal(LogCategory.MAIN, LogLevel.ERROR, "LLM server cleanup failed.", {
      message,
    });
  }

  try {
    await logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.INFO,
      "electron.main.logs.sessionClosing",
      { reason: "normal" },
      {
        reason: "normal",
      }
    );
    await shutdownLogger();
    console.info(await translateElectronMessage("electron.main.logs.loggerShutdownComplete"));
  } catch (err: unknown) {
    console.error(
      await translateElectronMessage("electron.main.logs.loggerShutdownFailed", {
        message: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    void (async (): Promise<void> => {
      await performCleanup();
      app.quit();
    })();
  }
});

app.on("will-quit", () => {
  void DatabaseManager.closeAll();
  void performCleanup();
});

app.on("before-quit", () => {
  void performCleanup();
});

if (process.platform !== "win32") {
  process.on("SIGTERM", () => {
    app.quit();
  });

  process.on("SIGINT", () => {
    app.quit();
  });
}

registerHandler("device-action", deviceActionHandler);

registerHandler("show-message-box", async (_event, options: Electron.MessageBoxOptions) => {
  if (mainWindow === null) {
    return { response: 0, checkboxChecked: false };
  }
  return await dialog.showMessageBox(mainWindow, options);
});

registerHandler("fm-write-file-atomic", fmWriteFileAtomic);
registerHandler("read-file", readFileAsBase64);
registerHandler("load-protocols", loadProtocols);
registerHandler("save-protocol", saveProtocol);
registerHandler("catbox-upload", catboxUpload);

const ALLOWED_GOOGLE_AUTH_DOMAINS = ["accounts.google.com"];

registerHandler("googledrive-start-auth", async (event) => {
  const result = await googledriveStartAuth(event);
  const authUrl = result.authUrl;
  if (result.success === true && typeof authUrl === "string" && authUrl !== "") {
    try {
      const urlObj = new URL(authUrl);
      if (!ALLOWED_GOOGLE_AUTH_DOMAINS.includes(urlObj.hostname)) {
        return {
          ...result,
          success: false,
          message: await googleDriveT("untrustedUrl", { hostname: urlObj.hostname }),
        };
      }
      await shell.openExternal(authUrl);
    } catch (err: unknown) {
      return {
        ...result,
        message: await googleDriveT("browserOpenFailed", {
          message: err instanceof Error ? err.message : String(err),
        }),
      };
    }
  }
  return result;
});
registerHandler("googledrive-exchange-code", googledriveExchangeCode);
registerHandler("googledrive-disconnect", googledriveDisconnect);
registerHandler("googledrive-upload", googledriveUpload);

registerHandler("uguu-upload", uguuUpload);

registerHandler("whisper-load", whisperLoad);
registerHandler("whisper-save", whisperSave);

registerHandler("command-init", commandInit);
registerHandler("command-write", commandWrite);
registerHandler("command-paths", commandPaths);
registerHandler("command-stage-attachments", commandStageAttachments);
registerHandler("command-stage-temp", commandStageTemp);
registerHandler("command-cleanup-temp", commandCleanupTemp);
registerHandler("command-move-failed", commandMoveFailed);
registerHandler("command-archive-copy", commandArchiveCopy);
registerHandler("command-cleanup-job", commandCleanupJob);
registerHandler("command-move", commandMove);

registerHandler("capture-page", capturePageHandler);
registerHandler("capture-webcontents-page", captureWebContentsPageHandler);
registerHandler("screenshot-capture", screenshotCaptureHandler);

registerHandler("logger:appendBatch", handleLoggerAppendBatch);
ipcMain.on("logger:appendBatch", (event, entries: unknown[]) => {
  void handleLoggerAppendBatch(event, entries);
});

registerHandler("copy-to-assets", copyToAssets);
registerHandler("copy-file-to", copyFileTo);
registerHandler("delete-asset", deleteAsset);
registerHandler("generate-tree", generateTree);

registerHandler(
  "read-console-logs",
  async (_event, tail: number = 100) => await readConsoleLogs(tail)
);
registerHandler("read-error-logs", async (_event, tail: number = 100) => await readErrorLogs(tail));

registerHandler("get-log-paths", () => {
  return {
    sessionDir: logger.getSessionDir(),
    logDir: logger.getLogDir(),
  };
});

registerHandler("get-session-id", () => logger.getSessionId());

registerHandler(
  "read-all-logs",
  async (_event, targetSessionId: string | null = null) => await readAllLogs(targetSessionId)
);
registerHandler("query-logs", async (_event, query: LogQueryParams = {}) => await queryLogs(query));
registerHandler("list-sessions", async () => await listSessions());
registerHandler("delete-inactive-log-sessions", async () => await deleteInactiveLogSessions());

registerHandler("get-app-state", () => getAppState());

registerHandler("write-state-snapshot", async () => {
  await writeStateSnapshot();
  return { success: true };
});

registerHandler(
  "setup-webview-logger",
  async (_event, webviewId: number, slot: string, provider: string) => {
    await logger.logInternalT(
      LogCategory.WEBVIEW,
      LogLevel.INFO,
      "electron.main.logs.webviewLoggerSetup",
      { slot, provider },
      {
        webviewId,
        slot,
        provider,
      }
    );
    return { success: true };
  }
);

registerHandler("generate-correlation-id", (_event, prefix: string = "op") => {
  return generateCorrelationId(prefix);
});

registerHandler(
  "opencode-serve-start",
  async (_event, options?: { port?: number; cors?: string[] }) => {
    try {
      const result = await opencodeServerManager.start(options);
      return { success: true, ...result };
    } catch (err) {
      await logger.logInternalT(
        LogCategory.MAIN,
        LogLevel.ERROR,
        "electron.main.logs.failedToStartOpencodeServe",
        { message: err instanceof Error ? err.message : String(err) },
        {
          error: err instanceof Error ? err.message : String(err),
        }
      );
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }
);

registerHandler("opencode-serve-stop", async () => {
  try {
    await opencodeServerManager.stop();
    return { success: true };
  } catch (err) {
    await logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.ERROR,
      "electron.main.logs.failedToStopOpencodeServe",
      { message: err instanceof Error ? err.message : String(err) },
      {
        error: err instanceof Error ? err.message : String(err),
      }
    );
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
});

registerHandler("opencode-serve-status", async () => {
  const current = opencodeServerManager.getStatus();
  if (current.running === true) {
    return current;
  }
  return await opencodeServerManager.findRunningServer(4096, 4110);
});

registerHandler("opencode-serve-find-port", async (_event, start = 4096, end = 4110) => {
  try {
    const port = await opencodeServerManager.findAvailablePort(start as number, end as number);
    if (port === null) {
      return { error: `No available port found (${String(start)}-${String(end)})` };
    }
    return { port };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
});

registerHandler("opencode-serve-find-running", async (_event, start = 4096, end = 4110) => {
  try {
    return await opencodeServerManager.findRunningServer(start as number, end as number);
  } catch (err) {
    return { running: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
});

registerHandler("opencode-serve-health", async (_event, url: string) => {
  return await opencodeServerManager.checkHealth(url);
});

registerHandler("opencode-serve-doctor", async () => {
  try {
    const info = await opencodeServerManager.diagnoseBinary();
    return {
      success: true,
      ...info,
    };
  } catch (err) {
    return {
      success: false,
      available: false,
      command: "opencode",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
});

registerHandler("opencode-ui-fs-list-sessions", (_event, dbPath?: string) => {
  const options =
    typeof dbPath === "string" && dbPath.trim() !== "" ? { dbPath: dbPath.trim() } : undefined;
  return listOpencodeUiSessions(options);
});

registerHandler(
  "opencode-ui-fs-ensure-session",
  (_event, sessionId: string, title?: string, dbPath?: string) => {
    const options =
      typeof dbPath === "string" && dbPath.trim() !== "" ? { dbPath: dbPath.trim() } : undefined;
    return ensureOpencodeUiSession(sessionId, title, options);
  }
);

registerHandler("opencode-ui-fs-read-session", (_event, sessionId: string, dbPath?: string) => {
  const options =
    typeof dbPath === "string" && dbPath.trim() !== "" ? { dbPath: dbPath.trim() } : undefined;
  return readOpencodeUiSession(sessionId, options);
});

registerHandler(
  "opencode-ui-session-watch-start",
  (event, sessionId: string, dbPath?: string): { success: boolean } => {
    opencodeUiSessionWatchers.start(event.sender, sessionId, dbPath);
    return { success: true };
  }
);

registerHandler("opencode-ui-session-watch-stop", (event): { success: boolean } => {
  opencodeUiSessionWatchers.stop(event.sender);
  return { success: true };
});

registerHandler(
  "opencode-ui-fs-archive-session",
  (_event, sessionId: string, archived?: boolean, dbPath?: string) => {
    const options =
      typeof dbPath === "string" && dbPath.trim() !== "" ? { dbPath: dbPath.trim() } : undefined;
    return archiveOpencodeUiSession(sessionId, archived !== false, options);
  }
);

registerHandler(
  "opencode-ui-api-proxy",
  async (_event, options: { url: string; method: string; body?: string }) => {
    try {
      const fetchOpts: RequestInit = { method: options.method };
      if (options.body !== undefined && options.body !== "") {
        fetchOpts.headers = { "Content-Type": "application/json" };
        fetchOpts.body = options.body;
      }
      const res = await fetch(options.url, fetchOpts);
      const text = await res.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
      return { success: res.ok, status: res.status, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
);
