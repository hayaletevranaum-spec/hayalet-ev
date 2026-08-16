import { getSceneHotspotLabelFontFamily } from "../scene/label-font.js";
import { SCENE_LABEL_FONT_PRESETS } from "../scene/schema.js";
import type {
  SceneBackClickableThemeDefinition,
  SceneClickableLabelThemeDefinition,
  SceneClickableThemeDefinition,
  SceneLabelFontPreset,
  SceneNodeGlowDefinition,
  SceneObjectClickableThemeDefinition,
} from "../scene/schema.js";

function cloneLabelTheme(
  source: SceneClickableLabelThemeDefinition
): SceneClickableLabelThemeDefinition {
  return { ...source };
}

function cloneObjectTheme(
  source: SceneObjectClickableThemeDefinition
): SceneObjectClickableThemeDefinition {
  return {
    ...source,
    frame: { ...source.frame },
    label: cloneLabelTheme(source.label),
  };
}

function cloneBackTheme(
  source: SceneBackClickableThemeDefinition
): SceneBackClickableThemeDefinition {
  return {
    ...source,
    label: cloneLabelTheme(source.label),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFontPresetOverride(value: unknown): value is SceneLabelFontPreset | null {
  return (
    value === null ||
    (typeof value === "string" &&
      SCENE_LABEL_FONT_PRESETS.includes(value as (typeof SCENE_LABEL_FONT_PRESETS)[number]))
  );
}

function isLabelTheme(value: unknown): value is SceneClickableLabelThemeDefinition {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value["visible"] === "boolean" &&
    isFontPresetOverride(value["fontPresetOverride"]) &&
    isFiniteNumber(value["fontScale"]) &&
    isFiniteNumber(value["trackingScale"]) &&
    isFiniteNumber(value["padYRem"]) &&
    isFiniteNumber(value["padXRem"]) &&
    isFiniteNumber(value["borderAlpha"]) &&
    isFiniteNumber(value["backgroundAlpha"]) &&
    isFiniteNumber(value["activeBackgroundAlpha"]) &&
    isFiniteNumber(value["activeRingAlpha"])
  );
}

function isObjectTheme(value: unknown): value is SceneObjectClickableThemeDefinition {
  if (!isRecord(value) || !isRecord(value["frame"])) {
    return false;
  }

  return (
    isFiniteNumber(value["glowHueShiftDeg"]) &&
    isFiniteNumber(value["glowAlphaScale"]) &&
    isFiniteNumber(value["frame"]["depthRem"]) &&
    isFiniteNumber(value["frame"]["insetRem"]) &&
    isFiniteNumber(value["frame"]["borderAlpha"]) &&
    isFiniteNumber(value["frame"]["innerRingAlpha"]) &&
    isFiniteNumber(value["frame"]["liftPx"]) &&
    isFiniteNumber(value["frame"]["shadowYPx"]) &&
    isFiniteNumber(value["frame"]["shadowBlurPx"]) &&
    isLabelTheme(value["label"])
  );
}

function isBackTheme(value: unknown): value is SceneBackClickableThemeDefinition {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isFiniteNumber(value["glowHueShiftDeg"]) &&
    isFiniteNumber(value["glowAlphaScale"]) &&
    isFiniteNumber(value["arrowShiftRem"]) &&
    isLabelTheme(value["label"])
  );
}

export function isSceneClickableThemeDefinition(
  value: unknown
): value is SceneClickableThemeDefinition {
  if (!isRecord(value)) {
    return false;
  }

  return isObjectTheme(value["object"]) && isBackTheme(value["back"]);
}

export function cloneSceneClickableTheme(
  source: SceneClickableThemeDefinition
): SceneClickableThemeDefinition {
  return {
    object: cloneObjectTheme(source.object),
    back: cloneBackTheme(source.back),
  };
}

export function parseSceneClickableThemeDraft(raw: string): SceneClickableThemeDefinition | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isSceneClickableThemeDefinition(parsed) ? cloneSceneClickableTheme(parsed) : null;
  } catch {
    return null;
  }
}

export function serializeSceneClickableThemeDraft(
  sceneClickableTheme: SceneClickableThemeDefinition
): string {
  return JSON.stringify(sceneClickableTheme, null, 2);
}

export function serializeSceneClickableThemeSource(
  sceneClickableTheme: SceneClickableThemeDefinition
): string {
  return [
    "export const SCENE_CLICKABLE_DEFAULTS =",
    `${JSON.stringify(sceneClickableTheme, null, 2)} as const;`,
    "",
  ].join("\n");
}

function clampAlpha(value: number): number {
  return Number(Math.min(1, Math.max(0, value)).toFixed(3));
}

function wrapHueDeg(value: number): number {
  const wrapped = ((value % 360) + 360) % 360;
  return Number(wrapped.toFixed(1));
}

export function resolveSceneObjectGlow(
  nodeGlow: Pick<SceneNodeGlowDefinition, "hueDeg" | "alpha">,
  theme: SceneObjectClickableThemeDefinition
): SceneNodeGlowDefinition {
  return {
    hueDeg: wrapHueDeg(nodeGlow.hueDeg + theme.glowHueShiftDeg),
    alpha: clampAlpha(nodeGlow.alpha * theme.glowAlphaScale),
  };
}

export function resolveSceneBackGlow(
  nodeGlow: SceneNodeGlowDefinition,
  theme: SceneBackClickableThemeDefinition
): SceneNodeGlowDefinition {
  return {
    hueDeg: wrapHueDeg(nodeGlow.hueDeg + theme.glowHueShiftDeg),
    alpha: clampAlpha(nodeGlow.alpha * theme.glowAlphaScale),
  };
}

export function resolveSceneLabelFontPreset(
  nodeFontPreset: SceneLabelFontPreset,
  theme: SceneClickableLabelThemeDefinition
): SceneLabelFontPreset {
  return theme.fontPresetOverride ?? nodeFontPreset;
}

export function resolveSceneLabelFontFamily(
  nodeFontPreset: SceneLabelFontPreset,
  theme: SceneClickableLabelThemeDefinition
): string {
  return getSceneHotspotLabelFontFamily(resolveSceneLabelFontPreset(nodeFontPreset, theme));
}
