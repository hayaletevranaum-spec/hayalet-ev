import {
  DEFAULT_SCENE_APPEARANCE_SETTINGS,
  DEFAULT_THEME_APPEARANCE_SETTINGS,
  normalizeUiScalePercent,
  type UiScalePercent,
} from "@shared/settings.js";

let currentAppUiScale: UiScalePercent = DEFAULT_THEME_APPEARANCE_SETTINGS.uiScale;
let currentSceneUiScale: UiScalePercent = DEFAULT_SCENE_APPEARANCE_SETTINGS.uiScale;

function formatScaleFactor(value: number): string {
  return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function applyDocumentScaleState(): void {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  const appScaleFactor = currentAppUiScale / 100;
  const sceneScaleFactor = currentSceneUiScale / 100;
  const relativeSceneScaleFactor = sceneScaleFactor / appScaleFactor;

  root.setAttribute("data-app-ui-scale", String(currentAppUiScale));
  root.setAttribute("data-scene-ui-scale", String(currentSceneUiScale));
  root.style.setProperty("--app-ui-scale-factor", formatScaleFactor(appScaleFactor));
  root.style.setProperty("--scene-ui-scale-factor", formatScaleFactor(sceneScaleFactor));
  root.style.setProperty(
    "--scene-ui-relative-scale-factor",
    formatScaleFactor(relativeSceneScaleFactor)
  );
}

export function applyAppUiScale(nextScale: unknown): UiScalePercent {
  currentAppUiScale = normalizeUiScalePercent(nextScale, DEFAULT_THEME_APPEARANCE_SETTINGS.uiScale);
  applyDocumentScaleState();
  return currentAppUiScale;
}

export function applySceneUiScale(nextScale: unknown): UiScalePercent {
  currentSceneUiScale = normalizeUiScalePercent(
    nextScale,
    DEFAULT_SCENE_APPEARANCE_SETTINGS.uiScale
  );
  applyDocumentScaleState();
  return currentSceneUiScale;
}

export function getAppUiScale(): UiScalePercent {
  return currentAppUiScale;
}

export function getSceneUiScale(): UiScalePercent {
  return currentSceneUiScale;
}
