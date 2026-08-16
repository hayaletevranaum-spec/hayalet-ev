import type { SceneObjectConfig, SceneDebugNodeSelection } from "../layout/index.js";
import type { SceneObjectClickableThemeDefinition } from "../schema.js";
import { hasSceneNodeLabel, isSceneDebugSelectionForObject } from "../layout/index.js";
import {
  resolveSceneLabelFontFamily,
  resolveSceneObjectGlow,
} from "../../scene-system/scene-clickable-theme.js";

interface SceneProjection {
  offsetX: number;
  offsetY: number;
  scale: number;
}

interface SceneObjectLayerClassNames {
  item: string;
  button: string;
  label: string;
}

export interface RenderSceneObjectLayerOptions {
  layer: HTMLElement;
  nodes: readonly SceneObjectConfig[];
  themeDefaults: SceneObjectClickableThemeDefinition;
  projection: SceneProjection;
  cssVarPrefix: string;
  classNames: SceneObjectLayerClassNames;
  selection: SceneDebugNodeSelection;
  clickableLabels?: boolean;
  resolveLabel(node: SceneObjectConfig): string;
  onActivate(node: SceneObjectConfig): void;
}

function setVar(
  style: CSSStyleDeclaration,
  cssVarPrefix: string,
  suffix: string,
  value: string
): void {
  style.setProperty(`--${cssVarPrefix}-${suffix}`, value);
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

function applyObjectThemeVars(
  style: CSSStyleDeclaration,
  themeDefaults: SceneObjectClickableThemeDefinition
): void {
  setClickableVar(style, "frame-depth", `${themeDefaults.frame.depthRem}rem`);
  setClickableVar(style, "frame-inset", `-${themeDefaults.frame.insetRem}rem`);
  setClickableColorVar(style, "frame-border", "255 226 192", themeDefaults.frame.borderAlpha);
  setClickableColorVar(
    style,
    "frame-inner-ring",
    "255 255 255",
    themeDefaults.frame.innerRingAlpha
  );
  setClickableVar(style, "shadow-y", `${themeDefaults.frame.shadowYPx}px`);
  setClickableVar(style, "shadow-blur", `${themeDefaults.frame.shadowBlurPx}px`);
  setClickableVar(style, "lift", `-${themeDefaults.frame.liftPx}px`);
}

function applyLabelThemeVars(
  style: CSSStyleDeclaration,
  themeDefaults: SceneObjectClickableThemeDefinition["label"]
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

export function renderSceneObjectLayer(options: RenderSceneObjectLayerOptions): void {
  const {
    layer,
    nodes,
    themeDefaults,
    projection,
    cssVarPrefix,
    classNames,
    selection,
    clickableLabels = false,
    resolveLabel,
    onActivate,
  } = options;
  const fragment = document.createDocumentFragment();
  applyObjectThemeVars(layer.style, themeDefaults);
  applyLabelThemeVars(layer.style, themeDefaults.label);

  nodes.forEach((node) => {
    const labelText = resolveLabel(node);
    const selected = isSceneDebugSelectionForObject(selection, node);
    const resolvedGlow = resolveSceneObjectGlow(node.frame, themeDefaults);
    const wrapper = document.createElement("div");
    wrapper.className = classNames.item;
    wrapper.classList.add("scene-clickable__item");

    const button = document.createElement("button");
    button.type = "button";
    button.className = classNames.button;
    button.classList.add("scene-clickable__button", "scene-clickable__button--object");
    button.dataset["clickableKind"] = "object";
    button.dataset["objectId"] = node.id;
    button.dataset["frameVariant"] = node.frame.variant;
    button.classList.toggle("is-selected", selected);
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
    setClickableVar(button.style, "frame-rotate", `${node.frame.rotateDeg}deg`);
    setClickableVar(button.style, "frame-perspective", `${node.frame.perspectiveDeg}deg`);
    setClickableVar(button.style, "hover-glow-hue", `${resolvedGlow.hueDeg}deg`);
    setClickableVar(button.style, "hover-glow-alpha", `${resolvedGlow.alpha}`);
    setVar(
      button.style,
      cssVarPrefix,
      "left",
      `${projection.offsetX + node.rect.leftPx * projection.scale}px`
    );
    setVar(
      button.style,
      cssVarPrefix,
      "top",
      `${projection.offsetY + node.rect.topPx * projection.scale}px`
    );
    setVar(button.style, cssVarPrefix, "width", `${node.rect.widthPx * projection.scale}px`);
    setVar(button.style, cssVarPrefix, "height", `${node.rect.heightPx * projection.scale}px`);
    setVar(button.style, cssVarPrefix, "frame-rotate", `${node.frame.rotateDeg}deg`);
    setVar(button.style, cssVarPrefix, "frame-perspective", `${node.frame.perspectiveDeg}deg`);
    setVar(button.style, cssVarPrefix, "hover-glow-hue", `${resolvedGlow.hueDeg}deg`);
    setVar(button.style, cssVarPrefix, "hover-glow-alpha", `${resolvedGlow.alpha}`);
    button.ariaLabel = labelText;
    button.addEventListener("click", () => {
      onActivate(node);
    });

    wrapper.append(button);

    if (themeDefaults.label.visible && hasSceneNodeLabel(node)) {
      const label = document.createElement("span");
      label.className = classNames.label;
      label.classList.add("scene-clickable__label", "scene-clickable__label--object");
      label.classList.toggle("is-selected", selected);
      label.textContent = labelText;
      setClickableVar(
        label.style,
        "label-left",
        `${projection.offsetX + node.label.centerXPx * projection.scale}px`
      );
      setClickableVar(
        label.style,
        "label-top",
        `${projection.offsetY + node.label.topPx * projection.scale}px`
      );
      setClickableVar(label.style, "label-width", `${node.label.widthPx * projection.scale}px`);
      setClickableVar(label.style, "label-height", `${node.label.heightPx * projection.scale}px`);
      setClickableVar(label.style, "label-rotate", `${node.label.rotateDeg}deg`);
      setClickableVar(
        label.style,
        "label-frame-perspective",
        `${node.label.framePerspectiveDeg}deg`
      );
      setClickableVar(
        label.style,
        "label-font-size",
        `${node.label.fontSizePx * projection.scale * themeDefaults.label.fontScale}px`
      );
      setClickableVar(
        label.style,
        "label-letter-spacing",
        `${node.label.letterSpacingPx * projection.scale * themeDefaults.label.trackingScale}px`
      );
      setClickableVar(
        label.style,
        "label-font-family",
        resolveSceneLabelFontFamily(node.label.fontPreset, themeDefaults.label)
      );
      setVar(
        label.style,
        cssVarPrefix,
        "label-left",
        `${projection.offsetX + node.label.centerXPx * projection.scale}px`
      );
      setVar(
        label.style,
        cssVarPrefix,
        "label-top",
        `${projection.offsetY + node.label.topPx * projection.scale}px`
      );
      setVar(
        label.style,
        cssVarPrefix,
        "label-width",
        `${node.label.widthPx * projection.scale}px`
      );
      setVar(
        label.style,
        cssVarPrefix,
        "label-height",
        `${node.label.heightPx * projection.scale}px`
      );
      setVar(label.style, cssVarPrefix, "label-rotate", `${node.label.rotateDeg}deg`);
      setVar(
        label.style,
        cssVarPrefix,
        "label-frame-perspective",
        `${node.label.framePerspectiveDeg}deg`
      );
      setVar(
        label.style,
        cssVarPrefix,
        "label-font-size",
        `${node.label.fontSizePx * projection.scale * themeDefaults.label.fontScale}px`
      );
      setVar(
        label.style,
        cssVarPrefix,
        "label-letter-spacing",
        `${node.label.letterSpacingPx * projection.scale * themeDefaults.label.trackingScale}px`
      );
      setVar(
        label.style,
        cssVarPrefix,
        "label-font-family",
        resolveSceneLabelFontFamily(node.label.fontPreset, themeDefaults.label)
      );
      if (clickableLabels) {
        label.dataset["clickable"] = "true";
        label.tabIndex = 0;
        label.role = "button";
        label.ariaLabel = labelText;
        label.addEventListener("keydown", (event: KeyboardEvent) => {
          if (event.key !== "Enter" && event.key !== " ") {
            return;
          }
          event.preventDefault();
          onActivate(node);
        });
      } else {
        label.ariaHidden = "true";
      }
      label.addEventListener("click", () => {
        onActivate(node);
      });
      wrapper.append(label);
    }

    fragment.appendChild(wrapper);
  });

  layer.replaceChildren(fragment);
}
