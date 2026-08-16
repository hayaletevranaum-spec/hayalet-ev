import type { ThemeAppearanceSettings, ThemeId } from "@shared/settings.js";

export type ThemeChangeCallback = (theme: ThemeId) => void;

export interface ThemeInfo {
  id: ThemeId;
  icon: string;
  isDark: boolean;
}

export interface ThemeConfig {
  appearanceStorageKey: string;
  legacyThemeStorageKey: string;
  attribute: string;
  transitionDuration: number;
  channelName: string;
}

export interface ThemeSyncPayload {
  theme?: ThemeId;
  appearance?: ThemeAppearanceSettings;
}

export interface ApplyAppearanceOptions {
  animate?: boolean;
  persistLocal?: boolean;
  persistSettings?: boolean;
  broadcast?: boolean;
}
