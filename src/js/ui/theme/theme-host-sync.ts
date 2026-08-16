import type { ThemeAppearanceSettings, ThemeId } from "@shared/settings.js";

import { THEME_CONFIG } from "./theme-constants.js";
import type { ThemeInfo } from "./theme-contract.js";

export function resolveThemeFromSearchParams(
  search: string,
  availableThemes: readonly ThemeInfo[]
): ThemeId | null {
  const themeParam = new URLSearchParams(search).get("theme");
  if (themeParam == null || themeParam === "") {
    return null;
  }

  return availableThemes.find((item) => item.id === themeParam)?.id ?? null;
}

export function isOpencodeUiThemeHost(activeProviderId: string, currentUrl: string): boolean {
  return activeProviderId === "opencode-ui" || currentUrl.includes("/pages/opencode-ui.html");
}

export function buildInlineThemeSyncScript(
  theme: ThemeId,
  appearance: Required<ThemeAppearanceSettings>
): string {
  return `(function() {
    try {
      const parseScaleFactor = function(value) {
        const parsed = Number.parseFloat(String(value || "").trim());
        if (Number.isFinite(parsed) === false || parsed <= 0) {
          return null;
        }

        return parsed;
      };
      const nextTheme = ${JSON.stringify(theme)};
      const nextAppearance = ${JSON.stringify(appearance)};
      const root = document.documentElement;
      const nextAppUiScale = Number(nextAppearance.uiScale) || 100;
      const currentSceneUiScale = Number.parseInt(root.getAttribute("data-scene-ui-scale") || "", 10);
      const computedRootStyle =
        typeof window.getComputedStyle === "function" ? window.getComputedStyle(root) : null;
      const currentSceneScaleFromFactor = parseScaleFactor(
        root.style.getPropertyValue("--scene-ui-scale-factor") ||
          computedRootStyle?.getPropertyValue("--scene-ui-scale-factor")
      );
      const currentSceneScaleFromRelativeFactor = parseScaleFactor(
        root.style.getPropertyValue("--scene-ui-relative-scale-factor") ||
          computedRootStyle?.getPropertyValue("--scene-ui-relative-scale-factor")
      );
      const nextSceneUiScale = Number.isFinite(currentSceneUiScale)
        ? currentSceneUiScale
        : currentSceneScaleFromFactor !== null
          ? Math.round(currentSceneScaleFromFactor * 100)
          : currentSceneScaleFromRelativeFactor !== null
            ? Math.round(currentSceneScaleFromRelativeFactor * nextAppUiScale)
            : nextAppUiScale;
      const nextRelativeSceneScale = nextSceneUiScale / nextAppUiScale;
      if (window.__ThemeManager && typeof window.__ThemeManager.set === "function") {
        window.__ThemeManager.set(nextTheme, false);
      }

      root.setAttribute(${JSON.stringify(THEME_CONFIG.attribute)}, nextTheme);
      root.setAttribute("data-theme-mode", nextAppearance.mode);
      root.setAttribute("data-theme-motion", nextAppearance.motion);
      root.setAttribute("data-theme-scale", nextAppearance.textScale);
      root.setAttribute("data-theme-surface", nextAppearance.surface);
      root.setAttribute("data-theme-contrast", nextAppearance.contrast);
      root.setAttribute("data-app-ui-scale", String(nextAppUiScale));
      root.setAttribute("data-scene-ui-scale", String(nextSceneUiScale));
      root.style.setProperty(
        "--app-ui-scale-factor",
        String(nextAppUiScale / 100)
      );
      root.style.setProperty(
        "--scene-ui-scale-factor",
        String(nextSceneUiScale / 100)
      );
      root.style.setProperty(
        "--scene-ui-relative-scale-factor",
        String(nextRelativeSceneScale)
      );
      try {
        localStorage.setItem(
          ${JSON.stringify(THEME_CONFIG.appearanceStorageKey)},
          JSON.stringify(nextAppearance)
        );
      } catch (_) {}
      return true;
    } catch (_) {
      return false;
    }
  })();`;
}
