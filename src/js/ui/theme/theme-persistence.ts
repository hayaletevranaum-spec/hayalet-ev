import { isThemeId, type ThemeAppearanceSettings, type ThemeId } from "@shared/settings.js";

import { normalizeThemeAppearance } from "./appearance-normalizer.js";
import type { ThemeConfig, ThemeSyncPayload } from "./theme-contract.js";

export function getStoredLegacyTheme(config: ThemeConfig): ThemeId | null {
  try {
    const stored = localStorage.getItem(config.legacyThemeStorageKey);
    if (stored != null && stored !== "" && isThemeId(stored)) {
      return stored;
    }
  } catch {}
  return null;
}

export function getStoredThemeAppearance(
  config: ThemeConfig
): Required<ThemeAppearanceSettings> | null {
  try {
    const stored = localStorage.getItem(config.appearanceStorageKey);
    if (stored == null || stored === "") {
      return null;
    }
    return normalizeThemeAppearance(JSON.parse(stored));
  } catch {
    return null;
  }
}

export function clearStoredLegacyTheme(config: ThemeConfig): void {
  try {
    localStorage.removeItem(config.legacyThemeStorageKey);
  } catch {}
}

export function storeThemeAppearance(
  config: ThemeConfig,
  appearance: Required<ThemeAppearanceSettings>
): void {
  try {
    localStorage.setItem(config.appearanceStorageKey, JSON.stringify(appearance));
  } catch {}
}

export function createThemeChannel(channelName: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }

  try {
    const channel = new BroadcastChannel(channelName);
    const unref = (channel as BroadcastChannel & { unref?: (() => void) | undefined }).unref;
    if (typeof unref === "function") {
      unref.call(channel);
    }
    return channel;
  } catch {
    return null;
  }
}

export function postThemeSyncPayload(
  channel: BroadcastChannel | null,
  payload: ThemeSyncPayload
): void {
  try {
    channel?.postMessage(payload);
  } catch {}
}
