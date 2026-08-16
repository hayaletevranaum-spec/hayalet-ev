import { getErrorMessage, type StartupRoomsSnapshot } from "@shared/index.js";
import { ensureElectronApiFallback } from "../../app/electron-fallback.js";
import { bootstrapShellI18n } from "../../app/shell-i18n.js";
import { AppState } from "../../modules/app-state.js";
import { AppI18n } from "../../modules/i18n/index.js";
import { Logger } from "../../modules/logger/index.js";
import { RoomRegistry } from "../../modules/rooms/room-registry.js";
import { SettingsManager } from "../../modules/settings-manager.js";
import { TrafficManager } from "../../modules/traffic-manager.js";
import { ThemeManager } from "../../ui/theme/index.js";

interface BootstrapExternalToolPageOptions {
  applyStaticTranslations?: () => void;
  initializeAppState?: boolean;
  initializeRooms?: boolean;
  initializeTraffic?: boolean;
}

type ExternalPageStartupFlags =
  ReturnType<NonNullable<NonNullable<typeof window.electronAPI>["getStartupFlags"]>> | undefined;

interface ExternalToolBootstrapResult {
  startupFlags: ExternalPageStartupFlags;
}

function applyStaticTranslations(callback?: () => void): void {
  callback?.();
}

export async function bootstrapExternalToolPage(
  options: BootstrapExternalToolPageOptions = {}
): Promise<ExternalToolBootstrapResult> {
  if (!window.electronAPI) {
    ensureElectronApiFallback();
  }

  try {
    const sessionId = window.electronAPI?.logger
      ? await window.electronAPI.logger.getSessionId()
      : "renderer-fallback";
    Logger.init(sessionId);
  } catch (error) {
    console.error(`External page logger init failed: ${getErrorMessage(error)}`);
  }

  await SettingsManager.load();
  await AppI18n.bootstrap(SettingsManager);
  bootstrapShellI18n();
  ThemeManager.init();

  if (options.initializeAppState !== false) {
    AppState.init("ai1");
  }

  if (options.initializeTraffic === true) {
    TrafficManager.init();
  }

  const startupFlags = window.electronAPI?.getStartupFlags();
  if (options.initializeRooms === true) {
    const roomsSnapshot: StartupRoomsSnapshot | null = await RoomRegistry.prepareStartupSnapshot(
      startupFlags?.roomsSnapshot ?? null
    );
    await RoomRegistry.loadInstalledRooms(roomsSnapshot);
  }

  applyStaticTranslations(options.applyStaticTranslations);
  AppI18n.subscribe(() => {
    applyStaticTranslations(options.applyStaticTranslations);
  });

  return { startupFlags };
}
