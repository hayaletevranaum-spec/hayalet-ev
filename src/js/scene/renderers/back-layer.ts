import type { SceneBackConfig } from "../layout/index.js";
import type { SceneBackClickableThemeDefinition } from "../schema.js";
import { hasSceneNodeLabel } from "../layout/index.js";
import {
  resolveSceneBackGlow,
  resolveSceneLabelFontFamily,
} from "../../scene-system/scene-clickable-theme.js";

interface SceneProjection {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export interface RenderSceneBackLayerOptions {
  host: HTMLElement;
  node: SceneBackConfig | null;
  themeDefaults: SceneBackClickableThemeDefinition;
  projection: SceneProjection;
  resolveLabel(node: SceneBackConfig): string;
  onActivate(node: SceneBackConfig): void;
}

function setClickableVar(style: CSSStyleDeclaration, suffix: string, value: string): void {
  style.setProperty(`--scene-clickable-${suffix}`, value);
}

function setClickableColorVar(
  style: CSSStyleDeclaration,
  suffix: string,
  rgb: string,
  alpha: number
): void {
  setClickableVar(style, suffix, `rgb(${rgb} / ${Number(alpha.toFixed(3))})`);
}

function applyBackLabelThemeVars(
  style: CSSStyleDeclaration,
  themeDefaults: SceneBackClickableThemeDefinition["label"]
): void {
  setClickableVar(style, "label-pad-y", `${themeDefaults.padYRem}rem`);
  setClickableVar(style, "label-pad-x", `${themeDefaults.padXRem}rem`);
  setClickableColorVar(style, "label-border", "255 225 190", themeDefaults.borderAlpha);
  setClickableVar(
    style,
    "label-bg",
    [
      `linear-gradient(180deg, rgb(50 30 24 / ${themeDefaults.backgroundAlpha}), rgb(18 10 8 / ${themeDefaults.backgroundAlpha}))`,
      `rgb(18 10 8 / ${themeDefaults.backgroundAlpha})`,
    ].join(", ")
  );
  setClickableVar(
    style,
    "label-bg-active",
    [
      `linear-gradient(180deg, rgb(62 38 30 / ${themeDefaults.activeBackgroundAlpha}), rgb(24 14 11 / ${themeDefaults.activeBackgroundAlpha}))`,
      `rgb(24 14 11 / ${themeDefaults.activeBackgroundAlpha})`,
    ].join(", ")
  );
  setClickableColorVar(style, "label-active-ring", "126 201 255", themeDefaults.activeRingAlpha);
}

export function renderSceneBackLayer(options: RenderSceneBackLayerOptions): void {
  const { host, node, themeDefaults, projection, resolveLabel, onActivate } = options;
  host.querySelectorAll("[data-scene-generated-back='true']").forEach((element) => {
    element.remove();
  });

  if (node === null) {
    return;
  }

  applyBackLabelThemeVars(host.style, themeDefaults.label);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "scene-clickable__button scene-clickable__button--back";
  button.dataset["sceneGeneratedBack"] = "true";
  button.dataset["clickableKind"] = "back";
  button.dataset["frameVariant"] = "flat";
  const resolvedGlow = resolveSceneBackGlow(node.glow, themeDefaults);
  button.style.left = `${projection.offsetX + node.rect.leftPx * projection.scale}px`;
  button.style.top = `${projection.offsetY + node.rect.topPx * projection.scale}px`;
  button.style.width = `${node.rect.widthPx * projection.scale}px`;
  button.style.height = `${node.rect.heightPx * projection.scale}px`;
  button.style.right = "auto";
  button.style.bottom = "auto";
  setClickableVar(
    button.style,
    "left",
    `${projection.offsetX + node.rect.leftPx * projection.scale}px`
  );
  setClickableVar(
    button.style,
    "top",
    `${projection.offsetY + node.rect.topPx * projection.scale}px`
  );
  setClickableVar(button.style, "width", `${node.rect.widthPx * projection.scale}px`);
  setClickableVar(button.style, "height", `${node.rect.heightPx * projection.scale}px`);
  setClickableVar(button.style, "frame-rotate", "0deg");
  setClickableVar(button.style, "frame-perspective", "0deg");
  setClickableVar(button.style, "hover-glow-hue", `${resolvedGlow.hueDeg}deg`);
  setClickableVar(button.style, "hover-glow-alpha", `${resolvedGlow.alpha}`);
  setClickableVar(button.style, "back-arrow-shift", `${themeDefaults.arrowShiftRem}rem`);
  button.ariaLabel = resolveLabel(node);
  button.addEventListener("click", () => {
    onActivate(node);
  });

  const arrow = document.createElement("span");
  arrow.className = "scene-clickable__arrow";
  arrow.ariaHidden = "true";
  arrow.textContent = "←";

  button.appendChild(arrow);

  if (themeDefaults.label.visible && hasSceneNodeLabel(node)) {
    const copy = document.createElement("span");
    copy.className = "scene-clickable__label scene-clickable__label--back";
    copy.ariaHidden = "true";
    copy.textContent = resolveLabel(node);
    setClickableVar(
      copy.style,
      "label-left",
      `${(node.label.centerXPx - node.rect.leftPx) * projection.scale}px`
    );
    setClickableVar(
      copy.style,
      "label-top",
      `${(node.label.topPx - node.rect.topPx) * projection.scale}px`
    );
    setClickableVar(copy.style, "label-width", `${node.label.widthPx * projection.scale}px`);
    setClickableVar(copy.style, "label-height", `${node.label.heightPx * projection.scale}px`);
    setClickableVar(copy.style, "label-rotate", `${node.label.rotateDeg}deg`);
    setClickableVar(
      copy.style,
      "label-font-family",
      resolveSceneLabelFontFamily(node.label.fontPreset, themeDefaults.label)
    );
    setClickableVar(
      copy.style,
      "label-font-size",
      `${node.label.fontSizePx * projection.scale * themeDefaults.label.fontScale}px`
    );
    setClickableVar(
      copy.style,
      "label-letter-spacing",
      `${node.label.letterSpacingPx * projection.scale * themeDefaults.label.trackingScale}px`
    );
    button.appendChild(copy);
  }

  host.appendChild(button);
}
