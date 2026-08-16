import type { InstalledRoomFeatureRecord, InstalledRoomRecord } from "@shared/index.js";
import { isSceneUiMode } from "../../ui/ui-mode.js";
import { DEFAULT_SCENE_REFERENCE_SIZE } from "./scene-helpers.js";

export function resolveRoomInitialFeatureId(
  room: InstalledRoomRecord,
  preferredId: string | null
): string {
  if (preferredId !== null && room.features.some((feature) => feature.id === preferredId)) {
    return preferredId;
  }
  if (room.features.some((feature) => feature.id === room.defaultFeatureId)) {
    return room.defaultFeatureId;
  }
  return room.features[0]?.id ?? "";
}

export function getRoomActiveFeature(
  room: InstalledRoomRecord,
  activeFeatureId: string
): InstalledRoomFeatureRecord | null {
  return room.features.find((feature) => feature.id === activeFeatureId) ?? null;
}

export function getRoomSceneFeature(
  room: InstalledRoomRecord,
  sceneFeatureId: string | null
): InstalledRoomFeatureRecord | null {
  if (sceneFeatureId === null) {
    return null;
  }

  return room.features.find((feature) => feature.id === sceneFeatureId) ?? null;
}

export function isRoomSceneFeatureOpen(
  room: InstalledRoomRecord,
  sceneFeatureId: string | null
): boolean {
  return (
    isSceneUiMode() &&
    room.scene !== undefined &&
    getRoomSceneFeature(room, sceneFeatureId)?.scene !== undefined
  );
}

export function getRoomSceneReferenceSize(room: InstalledRoomRecord): {
  width: number;
  height: number;
} {
  return room.scene?.referenceSize ?? DEFAULT_SCENE_REFERENCE_SIZE;
}

export function getRoomPageShellVariant(room: InstalledRoomRecord): "standard" | "immersive-stage" {
  return room.scene?.chrome?.pageShellVariant ?? "standard";
}

export function usesImmersiveRoomPageShell(room: InstalledRoomRecord): boolean {
  return getRoomPageShellVariant(room) === "immersive-stage";
}
