export type UiMode = "classic" | "scene";

export const DEFAULT_UI_MODE: UiMode = "classic";

export function normalizeUiMode(value: unknown): UiMode {
  return value === "scene" ? "scene" : DEFAULT_UI_MODE;
}

export function applyUiMode(nextUiMode: unknown): UiMode {
  const uiMode = normalizeUiMode(nextUiMode);
  document.documentElement.setAttribute("data-ui-mode", uiMode);
  return uiMode;
}

export function getCurrentUiMode(): UiMode {
  return normalizeUiMode(document.documentElement.getAttribute("data-ui-mode"));
}

export function isSceneUiMode(): boolean {
  return getCurrentUiMode() === "scene";
}
