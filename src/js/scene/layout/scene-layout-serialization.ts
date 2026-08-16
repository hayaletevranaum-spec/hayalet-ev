import { SCENE_CHARACTER_ROSTER_PRESETS, SCENE_LABEL_FONT_PRESETS } from "../schema.js";
import type {
  SceneObjectFrameDefinition,
  SceneNodeGlowDefinition,
  SceneNodeLabelDefinition,
  SceneNodeRect,
} from "../schema.js";
import type {
  SceneBackConfig,
  SceneCharacterPlacementConfig,
  SceneObjectConfig,
  SceneLayoutConfig,
} from "./scene-layout-model.js";

function cloneRect(source: SceneNodeRect): SceneNodeRect {
  return { ...source };
}

function cloneGlow(source: SceneNodeGlowDefinition): SceneNodeGlowDefinition {
  return { ...source };
}

function cloneFrame(source: SceneObjectFrameDefinition): SceneObjectFrameDefinition {
  return { ...source };
}

function cloneLabel(source: SceneNodeLabelDefinition): SceneNodeLabelDefinition {
  return { ...source };
}

function cloneObject(source: SceneObjectConfig): SceneObjectConfig {
  return {
    ...source,
    action: { ...source.action },
    rect: cloneRect(source.rect),
    frame: cloneFrame(source.frame),
    label: cloneLabel(source.label),
  };
}

function cloneBack(source: SceneBackConfig): SceneBackConfig {
  return {
    ...source,
    action: { ...source.action },
    rect: cloneRect(source.rect),
    glow: cloneGlow(source.glow),
    label: cloneLabel(source.label),
  };
}

function cloneCharacter(source: SceneCharacterPlacementConfig): SceneCharacterPlacementConfig {
  return {
    ...source,
  };
}

export function cloneSceneLayout(source: SceneLayoutConfig): SceneLayoutConfig {
  return {
    characterRosterPreset: source.characterRosterPreset,
    referenceSize: { ...source.referenceSize },
    objects: source.objects.map(cloneObject),
    backs: source.backs.map(cloneBack),
    characters: source.characters.map(cloneCharacter),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNodeRect(value: unknown): value is SceneNodeRect {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isFiniteNumber(value["leftPx"]) &&
    isFiniteNumber(value["topPx"]) &&
    isFiniteNumber(value["widthPx"]) &&
    isFiniteNumber(value["heightPx"])
  );
}

function isGlow(value: unknown): value is SceneNodeGlowDefinition {
  if (!isRecord(value)) {
    return false;
  }

  return isFiniteNumber(value["hueDeg"]) && isFiniteNumber(value["alpha"]);
}

function isLabel(value: unknown): value is SceneNodeLabelDefinition {
  if (!isRecord(value)) {
    return false;
  }

  const fontPreset = value["fontPreset"];
  return (
    typeof value["visible"] === "boolean" &&
    typeof value["textKey"] === "string" &&
    (value["customText"] === undefined || typeof value["customText"] === "string") &&
    isFiniteNumber(value["centerXPx"]) &&
    isFiniteNumber(value["topPx"]) &&
    isFiniteNumber(value["widthPx"]) &&
    isFiniteNumber(value["heightPx"]) &&
    isFiniteNumber(value["rotateDeg"]) &&
    isFiniteNumber(value["fontSizePx"]) &&
    isFiniteNumber(value["letterSpacingPx"]) &&
    typeof fontPreset === "string" &&
    SCENE_LABEL_FONT_PRESETS.includes(fontPreset as (typeof SCENE_LABEL_FONT_PRESETS)[number]) &&
    isFiniteNumber(value["framePerspectiveDeg"])
  );
}

function isObjectFrame(value: unknown): value is SceneObjectFrameDefinition {
  if (!isRecord(value) || !isGlow(value)) {
    return false;
  }

  return (
    (value["variant"] === "flat" ||
      value["variant"] === "upper" ||
      value["variant"] === "left-angled" ||
      value["variant"] === "right-angled") &&
    isFiniteNumber(value["rotateDeg"]) &&
    isFiniteNumber(value["perspectiveDeg"])
  );
}

function isObject(value: unknown): value is SceneObjectConfig {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value["kind"] === "object" &&
    typeof value["id"] === "string" &&
    (value["viewId"] === null || typeof value["viewId"] === "string") &&
    isRecord(value["action"]) &&
    isNodeRect(value["rect"]) &&
    isObjectFrame(value["frame"]) &&
    isLabel(value["label"])
  );
}

function isBack(value: unknown): value is SceneBackConfig {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value["kind"] === "back" &&
    typeof value["id"] === "string" &&
    typeof value["viewId"] === "string" &&
    isRecord(value["action"]) &&
    value["action"]["type"] === "back" &&
    isNodeRect(value["rect"]) &&
    isGlow(value["glow"]) &&
    isLabel(value["label"])
  );
}

function isCharacterPlacement(value: unknown): value is SceneCharacterPlacementConfig {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value["kind"] === "character" &&
    typeof value["id"] === "string" &&
    typeof value["characterKind"] === "string" &&
    (value["preferredSlot"] === undefined || typeof value["preferredSlot"] === "string") &&
    isFiniteNumber(value["leftPx"]) &&
    isFiniteNumber(value["bottomPx"]) &&
    isFiniteNumber(value["scale"]) &&
    isFiniteNumber(value["depth"])
  );
}

export function isSceneLayoutConfig(value: unknown): value is SceneLayoutConfig {
  if (!isRecord(value)) {
    return false;
  }

  const preset = value["characterRosterPreset"];
  return (
    typeof preset === "string" &&
    SCENE_CHARACTER_ROSTER_PRESETS.includes(
      preset as (typeof SCENE_CHARACTER_ROSTER_PRESETS)[number]
    ) &&
    isRecord(value["referenceSize"]) &&
    isFiniteNumber(value["referenceSize"]["width"]) &&
    isFiniteNumber(value["referenceSize"]["height"]) &&
    Array.isArray(value["objects"]) &&
    value["objects"].every(isObject) &&
    Array.isArray(value["backs"]) &&
    value["backs"].every(isBack) &&
    Array.isArray(value["characters"]) &&
    value["characters"].every(isCharacterPlacement)
  );
}

export function parseSceneLayoutDraft(raw: string): SceneLayoutConfig | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isSceneLayoutConfig(parsed) ? cloneSceneLayout(parsed) : null;
  } catch {
    return null;
  }
}

export function serializeSceneLayout(sceneLayout: SceneLayoutConfig): string {
  return JSON.stringify(sceneLayout, null, 2);
}
