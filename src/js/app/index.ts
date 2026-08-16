import { AppState } from "../modules/app-state.js";
import { getErrorMessage } from "@shared/index.js";
import { Logger, LogCategory, LogLevel, LogVisibility } from "../modules/logger/index.js";
import { TrafficManager } from "../modules/traffic-manager.js";
import { CoreEngine, registerServerCommands } from "../modules/core-engine.js";
import { ServerCommands } from "../modules/server-commands.js";
import { SettingsManager } from "../modules/settings-manager.js";
import { SlotController, SlotEvent } from "../modules/slot-controller.js";
import { WebviewManager } from "../modules/webview-manager.js";
import { ConversationListManager } from "../modules/conversation-list-manager.js";
import { RoomRegistry } from "../modules/rooms/room-registry.js";
import { AppI18n } from "../modules/i18n/index.js";
import { SplashScreen } from "../ui/splash-screen.js";
import { applyUiMode } from "../ui/ui-mode.js";
import { initAppOverlayHost } from "../ui/overlay-system.js";
import { ThemeManager } from "../ui/theme/index.js";
import { isAssistantAccountsSettingsPath, isAssistantSlotSettingsPath } from "@shared/settings.js";
import { loadSceneThemeAssetDraft } from "../scene-editor/scene-theme-asset-state.js";
import { SceneThemeManager, SceneUiScaleManager } from "../scene-system/index.js";
import { syncInstalledSceneThemeRegistrationsFromElectron } from "../scene-system/scene-theme-installed-registry.js";

import type { PageController } from "./types.js";
import { ensureElectronApiFallback } from "./electron-fallback.js";
import { applyShellStaticTranslations, bootstrapShellI18n } from "./shell-i18n.js";
import {
  setupNavigation,
  setupWindowControls,
  setupTopBarButtons,
  showPage,
  setControllers,
  setupReportPanel,
} from "./navigation.js";
import { updateIndicatorAvatars } from "./indicators.js";
import { setupOperationsIndicators } from "./operations-indicators.js";
import {
  updateRelayIndicator,
  setupTopBarRelayButtons,
  updateRelayButtonStates,
} from "./relay-ui.js";
import {
  injectPageTemplates,
  setupUILogListener,
  initControllers,
  registerWebviews,
} from "./page-init.js";
import { setupTopbarWorkspaceTools } from "./topbar-tool-overlays.js";

declare global {
  interface Window {
    SlotController: typeof SlotController;
    WebviewManager: typeof WebviewManager;
    AppState: typeof AppState;
  }
}

const controllers: Record<string, PageController> = {};

if (!window.electronAPI) {
  ensureElectronApiFallback();
}

let isInitializing = false;
let isInitialized = false;
let sceneThemeUnsubscribe: (() => void) | null = null;

async function initApp(): Promise<void> {
  if (isInitializing || isInitialized) {
    console.warn(AppI18n.t("app.logs.initSkippedDuplicate"));
    return;
  }

  isInitializing = true;
  let initSucceeded = false;

  // NOTE: Inject ServerCommands into CoreEngine to break the circular dependency.
  registerServerCommands(ServerCommands);

  try {
    try {
      const electronApi = window.electronAPI;
      if (electronApi === undefined) {
        const sessionId = "renderer-fallback";
        Logger.init(sessionId);
        Logger.debugT(LogCategory.SYSTEM, "app.logs.loggerInitialized", undefined, { sessionId });
      } else {
        const sessionId = await electronApi.logger.getSessionId();
        Logger.init(sessionId);
        Logger.debugT(LogCategory.SYSTEM, "app.logs.loggerInitialized", undefined, { sessionId });
      }
    } catch (err) {
      console.error(
        AppI18n.t("app.logs.loggerInitError", {
          message: err instanceof Error ? err.message : String(err),
        })
      );
    }

    setupUILogListener();
    Logger.debugT(LogCategory.SYSTEM, "app.logs.uiLogListenerReady");

    await SettingsManager.load();
    await syncInstalledSceneThemeRegistrationsFromElectron();
    SceneThemeManager.connectSettingsManager(SettingsManager);
    SceneUiScaleManager.connectSettingsManager(SettingsManager);
    SceneThemeManager.init();
    SceneUiScaleManager.init();
    await AppI18n.bootstrap(SettingsManager);
    bootstrapShellI18n();
    SplashScreen.setProgress(12);
    const startupFlags = window.electronAPI?.getStartupFlags();
    applyUiMode(startupFlags?.uiMode);
    sceneThemeUnsubscribe ??= SceneThemeManager.onChange(() => {
      void loadSceneThemeAssetDraft();
    });
    await loadSceneThemeAssetDraft();
    initAppOverlayHost();

    SplashScreen.update(18, AppI18n.t("app.startup.startingCore"));

    TrafficManager.init();

    Logger.info(LogCategory.SYSTEM, "[startup] core-engine.init:start");
    await CoreEngine.init();
    Logger.info(LogCategory.SYSTEM, "[startup] core-engine.init:complete");
    SplashScreen.update(52, AppI18n.t("app.startup.syncingLinkedRooms"));
    const preparedRoomsSnapshot = await RoomRegistry.prepareStartupSnapshot(
      startupFlags?.roomsSnapshot ?? null
    );
    SplashScreen.update(60, AppI18n.t("app.startup.loadingRooms"));
    Logger.info(LogCategory.SYSTEM, "[startup] room-registry.load:start");
    await RoomRegistry.loadInstalledRooms(preparedRoomsSnapshot);
    Logger.info(LogCategory.SYSTEM, "[startup] room-registry.load:complete");
    SplashScreen.update(70, AppI18n.t("app.startup.preparingUi"));

    try {
      document.documentElement.setAttribute("spellcheck", "false");
      document.body.setAttribute("spellcheck", "false");
    } catch (e) {
      Logger.debugT(
        LogCategory.SYSTEM,
        "app.logs.spellcheckDisableFailed",
        { message: getErrorMessage(e) },
        {
          error: getErrorMessage(e),
        }
      );
    }
    injectPageTemplates();
    ThemeManager.init();
    registerWebviews();
    applyShellStaticTranslations();
    SplashScreen.update(80, AppI18n.t("app.startup.startingModules"));

    try {
      window.__app_settings_unsub ??= SettingsManager.subscribe(
        ({ changedPaths }: { changedPaths: string[] }) => {
          const shouldUpdateIndicators =
            changedPaths.includes("*") ||
            changedPaths.some(
              (path) =>
                path.startsWith("user") ||
                path.startsWith("accounts") ||
                path.startsWith("remoteUsers") ||
                isAssistantAccountsSettingsPath(path) ||
                path.startsWith("slots") ||
                path.startsWith("us1Slot") ||
                isAssistantSlotSettingsPath(path)
            );

          if (!shouldUpdateIndicators) {
            return;
          }

          try {
            updateIndicatorAvatars();
          } catch (_) {
            void 0;
          }
        }
      );
    } catch (_) {
      Logger.debugT(
        LogCategory.SYSTEM,
        "app.logs.settingsSubscriptionFailed",
        { message: getErrorMessage(_) },
        {
          error: getErrorMessage(_),
        }
      );
    }

    Logger.info(LogCategory.SYSTEM, "[startup] init-controllers:start");
    await initControllers(controllers);
    Logger.info(LogCategory.SYSTEM, "[startup] init-controllers:complete");
    setControllers(controllers);

    window.SlotController = SlotController;
    window.WebviewManager = WebviewManager;
    window.AppState = AppState;
    window.ConversationListManager = ConversationListManager;

    const entranceController = controllers["entrance"] as
      { applyDefaultConnections?: () => void } | undefined;
    entranceController?.applyDefaultConnections?.();

    setupNavigation();
    setupWindowControls();
    setupTopBarButtons();
    setupTopbarWorkspaceTools();
    setupOperationsIndicators();
    setupTopBarRelayButtons();
    setupReportPanel();

    SplashScreen.update(90, AppI18n.t("app.startup.finalizing"));

    const requestedPage = new URLSearchParams(window.location.search).get("page");
    const requestedPageName = requestedPage?.trim();
    const startupPageName = startupFlags?.startPage?.trim();
    const startPageCandidate =
      requestedPageName !== undefined && requestedPageName !== ""
        ? requestedPageName
        : startupPageName !== undefined && startupPageName !== ""
          ? startupPageName
          : "entrance";
    const startPage =
      document.getElementById(`page-${startPageCandidate}`) instanceof HTMLElement
        ? startPageCandidate
        : "entrance";
    const autoConnect = startupFlags?.autoConnect ?? false;

    showPage(startPage);
    updateIndicatorAvatars();
    updateRelayIndicator();
    AppState.subscribe(() => {
      updateIndicatorAvatars();
      updateRelayIndicator();
    });

    SlotController.on(SlotEvent.STATE_CHANGED, () => {
      updateIndicatorAvatars();
      updateRelayIndicator();
      updateRelayButtonStates();
    });

    Logger.panelT(LogCategory.SYSTEM, LogLevel.INFO, "app.logs.appStarted", undefined, {
      visibility: LogVisibility.PANEL,
    });

    SplashScreen.complete();
    await SplashScreen.hide();

    // NOTE: --auto-connect clicks the assistant connect button on the assistant page.
    if (autoConnect && startPage === "assistant") {
      setTimeout(() => {
        const connectBtn = document.getElementById(
          "assistant-connect-btn"
        ) as HTMLButtonElement | null;
        if (connectBtn !== null && !connectBtn.disabled) {
          connectBtn.click();
          Logger.panelT(
            LogCategory.SYSTEM,
            LogLevel.INFO,
            "app.logs.autoConnectClicked",
            undefined,
            {
              visibility: LogVisibility.PANEL,
            }
          );
        }
      }, 500);
    }

    initSucceeded = true;
    isInitialized = true;
  } catch (error) {
    const message = getErrorMessage(error);
    console.error(AppI18n.t("app.logs.appInitFailed", { message }));
    try {
      Logger.errorT(
        LogCategory.SYSTEM,
        "app.logs.appInitFailed",
        { message },
        {
          error: error instanceof Error ? error : new Error(String(error)),
        }
      );
    } catch {
      void 0;
    }
    try {
      SplashScreen.show();
      SplashScreen.setStatus(AppI18n.t("app.startup.startupError"));
      SplashScreen.setProgress(100);
      await SplashScreen.hide();
    } catch {
      void 0;
    }
  } finally {
    isInitializing = false;
    if (!initSucceeded) {
      isInitialized = false;
    }
  }
}

export { showPage, getCurrentPage } from "./navigation.js";

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void initApp());
} else {
  void initApp();
}
