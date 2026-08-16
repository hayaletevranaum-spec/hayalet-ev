import { Logger } from "../logger/index.js";
import { LogCategory } from "@shared/logging-core";
import { AppI18n } from "../i18n/index.js";

interface ElectronApiSettingsBridge {
  loadSettings?: () => Promise<unknown>;
  saveSettings?: (settings: Record<string, unknown>) => Promise<boolean>;
}

function getElectronAPI(): ElectronApiSettingsBridge | null {
  return typeof window !== "undefined" ? (window.electronAPI ?? null) : null;
}

export async function ipcLoadSettings(): Promise<unknown> {
  const api = getElectronAPI();
  if (api === null || typeof api.loadSettings !== "function") {
    Logger.errorT(LogCategory.SETTINGS, "app.logs.settings.loadBridgeUnavailable");
    throw new Error(AppI18n.t("app.logs.settings.loadBridgeUnavailable"));
  }
  return await api.loadSettings();
}

export async function ipcSaveSettings(settings: Record<string, unknown>): Promise<boolean> {
  const api = getElectronAPI();
  if (api === null || typeof api.saveSettings !== "function") {
    Logger.errorT(LogCategory.SETTINGS, "app.logs.settings.saveBridgeUnavailable");
    throw new Error(AppI18n.t("app.logs.settings.saveBridgeUnavailable"));
  }
  return await api.saveSettings(settings);
}
