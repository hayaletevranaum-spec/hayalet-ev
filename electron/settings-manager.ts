import { join } from "path";
import { readFile, writeFile, mkdir, rename } from "fs/promises";
import { existsSync } from "fs";
import type { IpcMainInvokeEvent } from "electron";
import { Paths } from "./paths.ts";
import { getLoggerCore } from "./logger/index.js";
import type { AppSettings } from "@shared/settings.js";
import { LogCategory, LogLevel } from "@shared/index.js";
import { createDefaultSettings } from "@shared/settings-defaults.js";
import { us1RelayIdentityService } from "./us1-relay/identity-service.ts";

const logger = getLoggerCore();

function getConfigDir(): string {
  return Paths.getConfigDir();
}

function getSettingsPath(): string {
  return join(getConfigDir(), "settings.json");
}

function getLegacySettingsPath(): string {
  return join(Paths.getProjectRoot(), "dist", "config", "settings.json");
}

async function writeSettingsFileAtomic(settingsPath: string, data: string): Promise<void> {
  const tempPath = `${settingsPath}.${process.pid}.${Date.now().toString(36)}.tmp`;
  await writeFile(tempPath, data, { encoding: "utf-8", mode: 0o644 });
  await rename(tempPath, settingsPath);
}

async function migrateLegacySettings(): Promise<void> {
  const settingsPath = getSettingsPath();
  if (existsSync(settingsPath)) return;

  const legacyPath = getLegacySettingsPath();
  if (!existsSync(legacyPath)) return;

  const data = await readFile(legacyPath, "utf-8");
  await writeSettingsFileAtomic(settingsPath, data);
}

export async function loadSettings(): Promise<AppSettings | null> {
  try {
    await mkdir(getConfigDir(), { recursive: true });
    await migrateLegacySettings();

    if (existsSync(getSettingsPath())) {
      const data = await readFile(getSettingsPath(), "utf-8");
      const parsed = JSON.parse(data) as AppSettings;
      if (us1RelayIdentityService.syncSettingsMetadata(parsed) === true) {
        await writeSettingsFileAtomic(getSettingsPath(), JSON.stringify(parsed, null, 2));
      }
      return parsed;
    }

    const defaults = createDefaultSettings();
    us1RelayIdentityService.syncSettingsMetadata(defaults);
    const jsonString = JSON.stringify(defaults, null, 2);
    await writeSettingsFileAtomic(getSettingsPath(), jsonString);
    await logger.logInternalT(
      LogCategory.SETTINGS,
      LogLevel.INFO,
      "electron.settings.createdDefaultFile",
      undefined,
      {
        settingsPath: getSettingsPath(),
      }
    );

    return defaults;
  } catch (error) {
    await logger.logInternalT(
      LogCategory.SETTINGS,
      LogLevel.ERROR,
      "electron.settings.loadFailed",
      { message: (error as Error).message },
      {
        settingsPath: getSettingsPath(),
        error: {
          name: (error as Error).name,
          message: (error as Error).message,
          stack: (error as Error).stack,
        },
      }
    );
    return null;
  }
}

export async function saveSettings(
  eventOrSettings: IpcMainInvokeEvent | object | null,
  maybeSettings?: object | null
): Promise<boolean> {
  try {
    const settings =
      typeof maybeSettings === "undefined" || maybeSettings === null
        ? (eventOrSettings as object)
        : maybeSettings;

    await mkdir(getConfigDir(), { recursive: true });

    const jsonString = JSON.stringify(settings, null, 2);
    await writeSettingsFileAtomic(getSettingsPath(), jsonString);

    return true;
  } catch (error) {
    await logger.logInternalT(
      LogCategory.SETTINGS,
      LogLevel.ERROR,
      "electron.settings.saveFailed",
      { message: (error as Error).message },
      {
        settingsPath: getSettingsPath(),
        error: {
          name: (error as Error).name,
          message: (error as Error).message,
          stack: (error as Error).stack,
        },
      }
    );
    return false;
  }
}
