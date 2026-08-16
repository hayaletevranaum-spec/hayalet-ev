import { buildUiModeOptionsMarkup } from "../app/ui-mode/index.js";

interface SceneWindowControlsMountOptions {
  surfaceSelector?: string;
}

function buildSceneWindowControlsMarkup(): string {
  return `
  <div
    class="scene-shell__window-controls"
    aria-label="Scene window controls"
    data-scene-window-controls="true"
  >
    <div class="scene-shell__ui-mode ui-mode-dropdown theme-dropdown" data-ui-mode-dropdown="true">
      <button
        class="scene-shell__window-control scene-shell__window-control--mode ui-mode-dropdown-btn"
        type="button"
        title=""
        aria-label=""
        aria-expanded="false"
        data-shell-i18n-title="uiMode.toggle"
        data-shell-i18n-aria-label="uiMode.toggle"
        data-ui-mode-trigger="true"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M2.5 2.5h6v6h-6zM7.5 7.5h6v6h-6z" />
        </svg>
      </button>
      <div class="ui-mode-dropdown-menu theme-dropdown-menu scene-shell__ui-mode-menu" role="menu">${buildUiModeOptionsMarkup()}</div>
    </div>
    <button
      class="scene-shell__window-control"
      type="button"
      data-window-action="minimize"
      title=""
      aria-label=""
      data-shell-i18n-title="window.minimize"
      data-shell-i18n-aria-label="window.minimize"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <rect x="3" y="7" width="10" height="2" rx="0.5" />
      </svg>
    </button>
    <button
      class="scene-shell__window-control"
      type="button"
      data-window-action="minimize-to-tray"
      title=""
      aria-label=""
      data-shell-i18n-title="window.minimizeToTray"
      data-shell-i18n-aria-label="window.minimizeToTray"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 11L3 6h10l-5 5z" />
      </svg>
    </button>
    <button
      class="scene-shell__window-control"
      type="button"
      data-window-action="fullscreen"
      title=""
      aria-label=""
      data-shell-i18n-title="window.fullscreen"
      data-shell-i18n-aria-label="window.fullscreen"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M3 3h4v2H5v2H3V3zm6 0h4v4h-2V5H9V3zM3 9h2v2h2v2H3V9zm8 2h2v2h-4v-2h2z" />
      </svg>
    </button>
    <button
      class="scene-shell__window-control scene-shell__window-control--close"
      type="button"
      data-window-action="close"
      title=""
      aria-label=""
      data-shell-i18n-title="common.close"
      data-shell-i18n-aria-label="common.closeAriaLabel"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path
          d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"
        />
      </svg>
    </button>
  </div>
`.trim();
}

function resolveTargetSurfaces(
  root: ParentNode,
  options: SceneWindowControlsMountOptions = {}
): HTMLElement[] {
  const selector = options.surfaceSelector ?? ".scene-shell__surface";
  const surfaces = root.querySelectorAll<HTMLElement>(selector);
  if (root instanceof HTMLElement && root.matches(selector)) {
    return [root, ...Array.from(surfaces)];
  }
  return Array.from(surfaces);
}

export function unmountSceneWindowControls(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-scene-window-controls='true']").forEach((node) => {
    node.remove();
  });
}

export function mountSceneWindowControls(
  root: ParentNode = document,
  options: SceneWindowControlsMountOptions = {}
): void {
  resolveTargetSurfaces(root, options).forEach((surface) => {
    if (surface.querySelector("[data-scene-window-controls='true']") !== null) {
      return;
    }

    const anchor =
      Array.from(surface.children).find(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && child.classList.contains("scene-shell__cover-image")
      ) ?? null;
    if (anchor !== null) {
      anchor.insertAdjacentHTML("afterend", buildSceneWindowControlsMarkup());
      return;
    }

    surface.insertAdjacentHTML("afterbegin", buildSceneWindowControlsMarkup());
  });
}
