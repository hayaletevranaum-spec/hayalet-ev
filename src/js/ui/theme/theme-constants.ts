import { THEME_IDS, type ThemeId } from "@shared/settings.js";

import type { ThemeConfig, ThemeInfo } from "./theme-contract.js";

export const THEMES: Record<ThemeId, ThemeInfo> = {
  obsidian: {
    id: "obsidian",
    icon: "🌑",
    isDark: true,
  },
  "ivory-lab": {
    id: "ivory-lab",
    icon: "☀️",
    isDark: false,
  },
  "ember-console": {
    id: "ember-console",
    icon: "🔥",
    isDark: true,
  },
};

export const THEME_ORDER: ThemeId[] = [...THEME_IDS];

export const THEME_CONFIG: ThemeConfig = {
  appearanceStorageKey: "app-theme-appearance",
  legacyThemeStorageKey: "app-theme",
  attribute: "data-theme",
  transitionDuration: 200,
  channelName: "hayalet-ev-theme",
};
