import type {
  InstalledRoomFeatureRecord,
  InstalledRoomRecord,
  RoomSceneTextConfig,
} from "@shared/index.js";
import { shellT } from "../../app/shell-i18n.js";
import { AppI18n } from "../../modules/i18n/index.js";
import type { SceneBackConfig, SceneObjectConfig } from "../../scene/layout/index.js";

export const DEFAULT_SCENE_REFERENCE_SIZE = {
  width: 1600,
  height: 900,
} as const;

export const DEFAULT_SCENE_TRANSPARENT_WINDOW = {
  leftPct: 18,
  topPct: 18,
  widthPct: 64,
  heightPct: 58,
} as const;

export function resolveSceneTextValue(
  value: RoomSceneTextConfig | undefined,
  fallback: string
): string {
  if (value?.textKey !== undefined) {
    return AppI18n.t(value.textKey);
  }
  if (value?.text !== undefined && value.text.trim() !== "") {
    return value.text.trim();
  }
  return fallback;
}

export function buildRoomSceneObject(
  feature: InstalledRoomFeatureRecord
): SceneObjectConfig | null {
  if (feature.scene === undefined) {
    return null;
  }

  const rect = feature.scene.hotspot.rect;
  const labelText = resolveSceneTextValue(feature.scene.hotspot.label, feature.name);

  return {
    id: feature.scene.hotspot.id,
    kind: "object",
    viewId: null,
    action: {
      type: "screen",
      screen: "primary",
    },
    rect: { ...rect },
    frame: {
      variant: "flat",
      rotateDeg: 0,
      perspectiveDeg: 0,
      hueDeg: 34,
      alpha: 0.62,
    },
    label: {
      visible: true,
      textKey: "",
      customText: labelText,
      centerXPx: rect.leftPx + rect.widthPx / 2,
      topPx: rect.topPx + rect.heightPx + 18,
      widthPx: Math.max(rect.widthPx, 220),
      heightPx: 44,
      rotateDeg: 0,
      fontSizePx: 25,
      letterSpacingPx: 1.2,
      fontPreset: "display",
      framePerspectiveDeg: 0,
    },
  };
}

export function buildRoomBackNode(
  room: InstalledRoomRecord,
  options: { idSuffix?: string; viewId: string; fallbackLabel: string }
): SceneBackConfig | null {
  if (room.scene === undefined) {
    return null;
  }

  const rect = room.scene.backHotspot.rect;
  const labelText = resolveSceneTextValue(room.scene.backHotspot.label, options.fallbackLabel);

  return {
    id: `${room.scene.backHotspot.id}${options.idSuffix ?? ""}`,
    kind: "back",
    viewId: options.viewId,
    action: {
      type: "back",
      target: "room",
    },
    rect: { ...rect },
    glow: {
      hueDeg: 24,
      alpha: 0.54,
    },
    label: {
      visible: true,
      textKey: "",
      customText: labelText,
      centerXPx: rect.leftPx + rect.widthPx / 2,
      topPx: rect.topPx + rect.heightPx + 16,
      widthPx: Math.max(rect.widthPx, 180),
      heightPx: 40,
      rotateDeg: 0,
      fontSizePx: 24,
      letterSpacingPx: 1,
      fontPreset: "display",
      framePerspectiveDeg: 0,
    },
  };
}

export function buildRoomSceneViewBackNode(room: InstalledRoomRecord): SceneBackConfig | null {
  if (room.scene === undefined) {
    return null;
  }

  const referenceSize = room.scene.referenceSize;
  const widthPx = Math.max(88, Math.round(referenceSize.width * (116 / 1920)));
  const labelWidthPx = Math.max(150, Math.round(referenceSize.width * (180 / 1920)));
  const labelHeightPx = Math.max(34, Math.round(referenceSize.height * (40 / 1080)));
  const labelTopPx = Math.round(referenceSize.height * (490 / 1080));
  const fontSizePx = Math.max(16, Math.round(referenceSize.height * (18 / 1080)));

  return {
    id: `${room.scene.backHotspot.id}-feature-view`,
    kind: "back",
    viewId: "feature-view",
    action: {
      type: "back",
      target: "room",
    },
    rect: {
      leftPx: 0,
      topPx: 0,
      widthPx,
      heightPx: referenceSize.height,
    },
    glow: {
      hueDeg: 33,
      alpha: 0.34,
    },
    label: {
      visible: true,
      textKey: "",
      customText: shellT("settingsHub.scene.returnRoom"),
      centerXPx: widthPx / 2,
      topPx: labelTopPx,
      widthPx: labelWidthPx,
      heightPx: labelHeightPx,
      rotateDeg: 0,
      fontSizePx,
      letterSpacingPx: 1,
      fontPreset: "display",
      framePerspectiveDeg: 0,
    },
  };
}

export function buildStandardSceneViewBackButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "scene-clickable__button scene-clickable__button--back workspace-tool-scene-chrome__back room-scene-view__standard-back-button";
  button.dataset["frameVariant"] = "flat";
  button.title = label;
  button.setAttribute("aria-label", label);

  const arrow = document.createElement("span");
  arrow.className = "scene-clickable__arrow";
  arrow.ariaHidden = "true";
  arrow.textContent = "←";

  const text = document.createElement("span");
  text.className = "scene-clickable__label scene-clickable__label--back";
  text.ariaHidden = "true";
  text.textContent = label;

  button.append(arrow, text);
  return button;
}
