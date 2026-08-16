import type { SceneAlphaWindowBounds } from "../../scene/alpha-window.js";
import type {
  SceneLayoutEditorCapability,
  SceneLayoutEditorCapabilityContext,
} from "../scene-editor-capabilities.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderTransparentWindowPreview(
  sourceSrc: string,
  targetLabel: string,
  bounds: SceneAlphaWindowBounds
): string {
  const widthPct = ((bounds.right - bounds.left) / bounds.sourceWidth) * 100;
  const heightPct = ((bounds.bottom - bounds.top) / bounds.sourceHeight) * 100;
  const leftPct = (bounds.left / bounds.sourceWidth) * 100;
  const topPct = (bounds.top / bounds.sourceHeight) * 100;
  const previewRatio = `${bounds.sourceWidth} / ${bounds.sourceHeight}`;
  const safeSourceSrc = escapeHtml(sourceSrc);
  const safeTargetLabel = escapeHtml(targetLabel);

  return `
    <div
      class="entrance-scene__editor-window-preview"
      aria-hidden="true"
      style="aspect-ratio:${previewRatio};"
    >
      <img
        src="${safeSourceSrc}"
        alt="${safeTargetLabel} transparent window preview"
        loading="lazy"
        class="entrance-scene__editor-window-preview-image"
      />
      <div
        class="entrance-scene__editor-window-preview-box"
        style="left:${leftPct.toFixed(2)}%;top:${topPct.toFixed(2)}%;width:${widthPct.toFixed(2)}%;height:${heightPct.toFixed(2)}%;"
      >
        <span class="entrance-scene__editor-window-preview-label">Active Window</span>
      </div>
    </div>
  `;
}

function renderTransparentWindowInputs(targetId: string, bounds: SceneAlphaWindowBounds): string {
  const fields: Array<[keyof SceneAlphaWindowBounds, string]> = [
    ["left", "Left"],
    ["top", "Top"],
    ["right", "Right"],
    ["bottom", "Bottom"],
  ];

  return `
    <div
      class="entrance-scene__editor-grid"
      data-transparent-window-fields="${targetId}"
      data-source-width="${bounds.sourceWidth}"
      data-source-height="${bounds.sourceHeight}"
    >
      ${fields
        .map(
          ([field, label]) => `
            <label class="entrance-scene__editor-row entrance-scene__editor-row--stack">
              <span class="entrance-scene__editor-row-label">${label}</span>
              <input
                type="number"
                class="entrance-scene__editor-input entrance-scene__editor-input--number"
                value="${bounds[field]}"
                data-editor-action="transparent-window-value"
                data-target-id="${targetId}"
                data-window-field="${field}"
              />
            </label>
          `
        )
        .join("")}
    </div>
  `;
}

function buildNextTransparentWindow(
  container: HTMLElement,
  targetId: string
): SceneAlphaWindowBounds | null {
  const sourceWidth = Number(container.dataset["sourceWidth"] ?? "0");
  const sourceHeight = Number(container.dataset["sourceHeight"] ?? "0");
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return null;
  }

  const values = {
    left: Number(
      container.querySelector<HTMLInputElement>(
        `[data-editor-action="transparent-window-value"][data-target-id="${targetId}"][data-window-field="left"]`
      )?.value ?? "0"
    ),
    top: Number(
      container.querySelector<HTMLInputElement>(
        `[data-editor-action="transparent-window-value"][data-target-id="${targetId}"][data-window-field="top"]`
      )?.value ?? "0"
    ),
    right: Number(
      container.querySelector<HTMLInputElement>(
        `[data-editor-action="transparent-window-value"][data-target-id="${targetId}"][data-window-field="right"]`
      )?.value ?? "0"
    ),
    bottom: Number(
      container.querySelector<HTMLInputElement>(
        `[data-editor-action="transparent-window-value"][data-target-id="${targetId}"][data-window-field="bottom"]`
      )?.value ?? "0"
    ),
  };

  if (
    Number.isFinite(values.left) === false ||
    Number.isFinite(values.top) === false ||
    Number.isFinite(values.right) === false ||
    Number.isFinite(values.bottom) === false
  ) {
    return null;
  }

  const left = Math.max(0, Math.min(values.left, sourceWidth - 1));
  const top = Math.max(0, Math.min(values.top, sourceHeight - 1));
  const right = Math.max(left + 1, Math.min(values.right, sourceWidth));
  const bottom = Math.max(top + 1, Math.min(values.bottom, sourceHeight));

  return {
    sourceWidth,
    sourceHeight,
    left,
    top,
    right,
    bottom,
  };
}

export const sceneTransparentWindowCapability: SceneLayoutEditorCapability = {
  id: "transparent-window",
  render(context: SceneLayoutEditorCapabilityContext): string | null {
    const activeAssetTarget = context.activeAssetTarget;
    if (activeAssetTarget?.supportsTransparentWindow !== true) {
      return null;
    }

    const targetId = escapeHtml(activeAssetTarget.id);
    const targetLabelText = activeAssetTarget.label;
    const targetLabel = escapeHtml(targetLabelText);
    const bounds = activeAssetTarget.transparentWindow;

    return `
      <section class="entrance-scene__editor-sidecard entrance-scene__editor-sidecard--capability">
        <div class="entrance-scene__editor-sidecard-header">
          <span class="entrance-scene__editor-sidecard-kicker">Asset Tool</span>
          <div class="entrance-scene__editor-sidecard-title">Transparent Window</div>
        </div>
        <div class="entrance-scene__editor-capability">
          <div class="entrance-scene__editor-capability-copy">
            <div class="entrance-scene__editor-selected-title">${targetLabel}</div>
            <p class="entrance-scene__editor-subtitle">
              Detect the transparent area manually, preview the captured window, then fine-tune the bounds.
            </p>
          </div>
          <div class="entrance-scene__editor-toolbar">
            <button type="button" class="btn btn-ghost btn-sm" data-editor-action="detect-transparent-window" data-target-id="${targetId}">
              Detect Window
            </button>
            <button type="button" class="btn btn-ghost btn-sm" data-editor-action="clear-transparent-window" data-target-id="${targetId}">
              Clear Window
            </button>
          </div>
          ${
            bounds === null
              ? `<p class="entrance-scene__editor-empty">Run detection to capture the transparent area for this surface.</p>`
              : `
                ${renderTransparentWindowPreview(activeAssetTarget.runtimeSrc, targetLabelText, bounds)}
                <div class="entrance-scene__editor-help">
                  <span>Source ${bounds.sourceWidth} × ${bounds.sourceHeight}</span>
                  <span>Width ${bounds.right - bounds.left}px</span>
                  <span>Height ${bounds.bottom - bounds.top}px</span>
                </div>
                ${renderTransparentWindowInputs(targetId, bounds)}
              `
          }
        </div>
      </section>
    `;
  },
  handleAction(context: SceneLayoutEditorCapabilityContext, target: HTMLElement): boolean {
    const action = target.dataset["editorAction"] ?? "";
    const targetId = target.dataset["targetId"] ?? "";
    if (targetId === "") {
      return false;
    }

    if (action === "detect-transparent-window") {
      void context.callbacks.detectSceneAssetTransparentWindow?.(targetId);
      return true;
    }

    if (action === "clear-transparent-window") {
      context.callbacks.clearSceneAssetTransparentWindow?.(targetId);
      return true;
    }

    return false;
  },
  handleChange(context: SceneLayoutEditorCapabilityContext, target: HTMLInputElement): boolean {
    const action = target.dataset["editorAction"] ?? "";
    const targetId = target.dataset["targetId"] ?? "";
    if (action !== "transparent-window-value" || targetId === "") {
      return false;
    }

    const container = target.closest<HTMLElement>(`[data-transparent-window-fields="${targetId}"]`);
    if (container === null) {
      return false;
    }

    const nextBounds = buildNextTransparentWindow(container, targetId);
    if (nextBounds === null) {
      return true;
    }

    context.callbacks.updateSceneAssetTransparentWindow?.(targetId, nextBounds);
    return true;
  },
};
