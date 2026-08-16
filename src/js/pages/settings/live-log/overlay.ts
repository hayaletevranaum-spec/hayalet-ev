import { LogCategory } from "@shared/logging-core";
import { MAX_LOGS_SERVER } from "@limits";
import { Logger } from "../../../modules/logger/index.js";
import { AppI18n } from "../../../modules/i18n/index.js";
import { Toast } from "../../../ui/toast-manager.js";
import {
  appendEntries,
  asText,
  createInitialOverlayState,
  decodeBase64ToUtf8,
  isOverlayApp,
  isRecord,
  joinPath,
  normalizeLogEntry,
} from "./overlay-model.js";
import { t as entranceT } from "../panel-i18n.js";
import {
  renderDetail,
  renderEntries,
  setActiveTabUI,
  setPauseButtonUI,
  syncSessionSelect,
} from "./overlay-render.js";
import { registerSettingsPanelLifecycle } from "../controller.js";

interface SetupLiveLogOverlayOptions {
  formatLogCategory: (category: string) => string;
  escapeHtml: (text: string) => string;
}

interface DeleteInactiveSessionsResult {
  deletedCount: number;
}

function isDeleteInactiveSessionsResult(value: unknown): value is DeleteInactiveSessionsResult {
  return isRecord(value) && typeof value["deletedCount"] === "number";
}

let liveLogOverlayInitialized = false;

export function setupLiveLogOverlay({
  formatLogCategory,
  escapeHtml,
}: SetupLiveLogOverlayOptions): void {
  const electronApi = window.electronAPI;
  if (electronApi == null) {
    Logger.warn(LogCategory.ENTRANCE, entranceT("logs.liveOverlayBridgeUnavailable"));
    return;
  }

  const loggerApi = electronApi["logger"] as {
    getLogPaths: () => Promise<{
      console: string;
      error: string;
      sessionDir: string;
      logDir: string;
    }>;
    deleteInactiveSessions: () => Promise<{ deletedCount: number }>;
  };
  type LogApi = {
    readFile: (path: string) => Promise<string | null>;
    readDirectoryFiles: (path: string) => Promise<unknown[]>;
  };
  const logApi = electronApi as LogApi;
  const readFile = logApi.readFile;
  const readDirectoryFiles = logApi.readDirectoryFiles;
  const showMessageBox = electronApi["showMessageBox"] as (
    options: Record<string, unknown>
  ) => Promise<{ response: number }>;
  const ipcRenderer = electronApi["ipcRenderer"] as {
    on: (channel: string, callback: (...args: unknown[]) => void) => void;
  };

  const overlay = document.getElementById("live-log-overlay");
  const overlayContent = document.getElementById("live-log-content");
  const pauseBtn = document.getElementById("live-log-pause") as HTMLButtonElement | null;
  const clearBtn = document.getElementById("live-log-clear") as HTMLButtonElement | null;
  const deleteInactiveBtn = document.getElementById(
    "live-log-delete-inactive"
  ) as HTMLButtonElement | null;
  const appTabs = document.getElementById("live-log-app-tabs");
  const sessionSelect = document.getElementById(
    "live-log-session-select"
  ) as HTMLSelectElement | null;
  const levelSelect = document.getElementById("live-log-level-select") as HTMLSelectElement | null;
  const searchInput = document.getElementById("live-log-search") as HTMLInputElement | null;
  const metrics = document.getElementById("live-log-metrics");
  const detailMessage = document.getElementById("live-log-message");
  const detailMeta = document.getElementById("live-log-meta");
  const detailContext = document.getElementById("live-log-context");

  if (
    !overlay ||
    !overlayContent ||
    !pauseBtn ||
    !clearBtn ||
    !deleteInactiveBtn ||
    !appTabs ||
    !sessionSelect ||
    !levelSelect ||
    !searchInput ||
    !metrics ||
    !detailMessage ||
    !detailMeta ||
    !detailContext
  ) {
    Logger.debug(LogCategory.ENTRANCE, entranceT("logs.liveOverlayElementsMissing"));
    return;
  }

  if (liveLogOverlayInitialized) {
    return;
  }
  liveLogOverlayInitialized = true;

  const appButtons = Array.from(appTabs.querySelectorAll<HTMLButtonElement>("button[data-app]"));
  const maxLogs = Math.max(MAX_LOGS_SERVER * 20, 500);
  const pollIntervalMs = 2000;
  const state = createInitialOverlayState();
  let deleteInactiveBusy = false;

  const getAppDirCandidates = (app: typeof state.activeApp): string[] => [app];

  const setDeleteInactiveButtonUI = (): void => {
    deleteInactiveBtn.textContent = deleteInactiveBusy
      ? entranceT("liveLog.deleteInactiveBusy")
      : entranceT("liveLog.deleteInactive");
    deleteInactiveBtn.title = deleteInactiveBusy
      ? entranceT("liveLog.deleteInactiveBusyTitle")
      : entranceT("liveLog.deleteInactiveTitle");
    deleteInactiveBtn.disabled = deleteInactiveBusy;
  };

  const render = (): void => {
    renderEntries({
      state,
      overlayContent,
      levelSelect,
      searchInput,
      metrics,
      detailMessage,
      detailMeta,
      detailContext,
      formatLogCategory,
      escapeHtml,
      maxLogs,
    });
  };

  const ensureBaseLogsDir = async (): Promise<boolean> => {
    if (state.baseLogsDir !== "") {
      return true;
    }

    try {
      const pathsRaw = await loggerApi.getLogPaths();
      const appLogDir =
        isRecord(pathsRaw) && typeof (pathsRaw as { logDir?: unknown }).logDir === "string"
          ? ((pathsRaw as { logDir?: unknown }).logDir as string)
          : "";

      if (appLogDir === "") {
        return false;
      }

      const trimmed = appLogDir.replace(/[\\/]app[\\/]?$/i, "");
      if (trimmed !== appLogDir) {
        state.baseLogsDir = trimmed;
        return true;
      }

      const slashIndex = Math.max(appLogDir.lastIndexOf("/"), appLogDir.lastIndexOf("\\"));
      state.baseLogsDir = slashIndex > 0 ? appLogDir.slice(0, slashIndex) : appLogDir;
      return state.baseLogsDir !== "";
    } catch (error) {
      Logger.warn(
        LogCategory.ENTRANCE,
        entranceT("logs.liveOverlayBasePathMissing", {
          message: error instanceof Error ? error.message : String(error),
        })
      );
      return false;
    }
  };

  const loadSessions = async (): Promise<void> => {
    const app = state.activeApp;
    const ok = await ensureBaseLogsDir();
    if (!ok) {
      state.sessionsByApp[app] = [];
      return;
    }

    try {
      const sessionSet = new Set<string>();

      for (const appDirName of getAppDirCandidates(app)) {
        const appDir = joinPath(state.baseLogsDir, appDirName);
        try {
          // eslint-disable-next-line no-await-in-loop -- NOTE: directory scan is sequential per candidate.
          const entriesRaw = await readDirectoryFiles(appDir);
          const entries = Array.isArray(entriesRaw) ? entriesRaw : [];
          entries
            .filter((entry) => isRecord(entry) && entry["isDirectory"] === true)
            .map((entry) => asText((entry as Record<string, unknown>)["name"]))
            .filter((name) => name !== "" && !name.startsWith("."))
            .forEach((name) => {
              sessionSet.add(name);
            });
        } catch {}
      }

      const sessions = Array.from(sessionSet).sort((a, b) => b.localeCompare(a));

      state.sessionsByApp[app] = sessions;

      const selected = state.selectedSessionByApp[app];
      if (selected === "" || !sessions.includes(selected)) {
        state.selectedSessionByApp[app] = sessions[0] ?? "";
      }
    } catch {
      state.sessionsByApp[app] = [];
      state.selectedSessionByApp[app] = "";
    }
  };

  const loadActiveSessionLogs = async (force = false): Promise<void> => {
    const app = state.activeApp;
    const sessionId = state.selectedSessionByApp[app];

    if (sessionId === "") {
      state.entriesByApp[app] = [];
      state.selectedEntryId = "";
      render();
      return;
    }

    let encoded = "";
    for (const appDirName of getAppDirCandidates(app)) {
      const structuredPath = joinPath(state.baseLogsDir, appDirName, sessionId, "structured.jsonl");
      try {
        // eslint-disable-next-line no-await-in-loop -- NOTE: probe paths sequentially until a hit.
        const nextEncoded = await readFile(structuredPath);
        if (typeof nextEncoded === "string" && nextEncoded !== "") {
          encoded = nextEncoded;
          break;
        }
      } catch {}
    }

    if (typeof encoded !== "string" || encoded === "") {
      if (force) {
        state.entriesByApp[app] = [];
        state.selectedEntryId = "";
        render();
      }
      return;
    }

    const content = decodeBase64ToUtf8(encoded);
    const fingerprint = `${content.length}:${content.slice(-160)}`;

    if (!force && fingerprint === state.lastFingerprintByApp[app]) {
      return;
    }

    state.lastFingerprintByApp[app] = fingerprint;

    const parsed = content
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => {
        try {
          const raw = JSON.parse(line) as unknown;
          return isRecord(raw) ? normalizeLogEntry(app, sessionId, raw) : null;
        } catch {
          return null;
        }
      })
      .filter((entry) => entry !== null)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, maxLogs);

    state.entriesByApp[app] = parsed;
    render();
  };

  const refreshActiveApp = async (forceLogs = false): Promise<void> => {
    await loadSessions();
    syncSessionSelect(state, sessionSelect);
    await loadActiveSessionLogs(forceLogs);
  };

  const stopPolling = (): void => {
    if (state.pollTimer !== null) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  };

  const startPolling = (): void => {
    stopPolling();
    state.pollTimer = setInterval(() => {
      if (state.paused || overlay.classList.contains("is-hidden")) {
        return;
      }
      void loadActiveSessionLogs(false);
    }, pollIntervalMs);
  };

  const activate = (): void => {
    overlay.setAttribute("aria-hidden", "false");
    setActiveTabUI(state, appButtons);
    setPauseButtonUI(state, pauseBtn);
    void (async (): Promise<void> => {
      await refreshActiveApp(true);
      startPolling();
    })();
  };

  const deactivate = (): void => {
    overlay.setAttribute("aria-hidden", "true");
    stopPolling();
  };

  const handleIncomingPayload = (payload: unknown): void => {
    if (state.paused) {
      return;
    }

    const packets = Array.isArray(payload) ? payload : [payload];
    const selectedSession = state.selectedSessionByApp["app"];
    const fallbackSession = selectedSession !== "" ? selectedSession : "live";

    const incoming = packets
      .map((packet) => {
        if (!isRecord(packet)) {
          return null;
        }
        return normalizeLogEntry("app", fallbackSession, packet);
      })
      .filter((entry) => entry !== null);

    appendEntries(state, "app", incoming, maxLogs);

    if (!overlay.classList.contains("is-hidden") && state.activeApp === "app") {
      render();
    }
  };

  appButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const app = button.dataset["app"];
      if (!isOverlayApp(app)) {
        return;
      }

      state.activeApp = app;
      state.selectedEntryId = "";
      setActiveTabUI(state, appButtons);
      renderDetail(detailMessage, detailMeta, detailContext, null);
      void refreshActiveApp(true);
    });
  });

  sessionSelect.addEventListener("change", () => {
    state.selectedSessionByApp[state.activeApp] = sessionSelect.value;
    state.lastFingerprintByApp[state.activeApp] = "";
    state.selectedEntryId = "";
    void loadActiveSessionLogs(true);
  });

  levelSelect.addEventListener("change", () => {
    render();
  });

  searchInput.addEventListener("input", () => {
    render();
  });

  pauseBtn.addEventListener("click", () => {
    state.paused = !state.paused;
    setPauseButtonUI(state, pauseBtn);
    if (!state.paused) {
      void loadActiveSessionLogs(true);
    }
  });

  clearBtn.addEventListener("click", () => {
    state.entriesByApp[state.activeApp] = [];
    state.selectedEntryId = "";
    state.lastFingerprintByApp[state.activeApp] = "";
    render();
    renderDetail(detailMessage, detailMeta, detailContext, null);
  });

  deleteInactiveBtn.addEventListener("click", () => {
    void (async (): Promise<void> => {
      if (deleteInactiveBusy) {
        return;
      }

      const confirmation = await showMessageBox({
        type: "warning",
        buttons: [
          entranceT("liveLog.deleteInactiveConfirmAction"),
          entranceT("liveLog.cancelAction"),
        ],
        defaultId: 1,
        cancelId: 1,
        title: entranceT("liveLog.deleteInactiveConfirmTitle"),
        message: entranceT("liveLog.deleteInactiveConfirmMessage"),
        detail: entranceT("liveLog.deleteInactiveConfirmDetail"),
      });

      if (confirmation.response !== 0) {
        return;
      }

      deleteInactiveBusy = true;
      setDeleteInactiveButtonUI();

      try {
        const resultRaw = await loggerApi.deleteInactiveSessions();
        const result = isDeleteInactiveSessionsResult(resultRaw) ? resultRaw : { deletedCount: 0 };

        state.entriesByApp.app = [];
        state.entriesByApp["mcp-server"] = [];
        state.entriesByApp["ghost-agent"] = [];
        state.entriesByApp["android-companion"] = [];
        state.sessionsByApp.app = [];
        state.sessionsByApp["mcp-server"] = [];
        state.sessionsByApp["ghost-agent"] = [];
        state.sessionsByApp["android-companion"] = [];
        state.lastFingerprintByApp.app = "";
        state.lastFingerprintByApp["mcp-server"] = "";
        state.lastFingerprintByApp["ghost-agent"] = "";
        state.lastFingerprintByApp["android-companion"] = "";
        state.selectedEntryId = "";

        await refreshActiveApp(true);

        if (result.deletedCount > 0) {
          Toast.success(
            entranceT("liveLog.deleteInactiveSuccess", { count: result.deletedCount }),
            entranceT("liveLog.deleteInactiveSuccessDetail")
          );
        } else {
          Toast.info(
            entranceT("liveLog.deleteInactiveEmpty"),
            entranceT("liveLog.deleteInactiveEmptyDetail")
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Logger.error(LogCategory.ENTRANCE, `Live log cleanup failed: ${message}`);
        Toast.error(entranceT("liveLog.deleteInactiveError"), message);
      } finally {
        deleteInactiveBusy = false;
        setDeleteInactiveButtonUI();
      }
    })();
  });

  ipcRenderer.on("log:ui-notify-batch", (_event: unknown, payload: unknown) => {
    handleIncomingPayload(payload);
  });

  AppI18n.subscribe(() => {
    syncSessionSelect(state, sessionSelect);
    setPauseButtonUI(state, pauseBtn);
    setDeleteInactiveButtonUI();
    render();
  });

  setPauseButtonUI(state, pauseBtn);
  setDeleteInactiveButtonUI();
  render();
  Logger.debug(LogCategory.ENTRANCE, entranceT("logs.liveOverlayReady"));

  registerSettingsPanelLifecycle("live-log", {
    onEnter: () => {
      activate();
    },
    onActivate: () => {
      activate();
    },
    onDeactivate: () => {
      deactivate();
    },
    onExit: () => {
      deactivate();
    },
  });
}
