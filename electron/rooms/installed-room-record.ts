import { resolve } from "node:path";
import type {
  InstalledRoomFeatureRecord,
  InstalledRoomFeatureSceneRecord,
  InstalledRoomSceneRecord,
  RoomCommandSpec,
  RoomProtocolSpec,
  RoomSceneCharacterConfig,
  RoomSceneChromeConfig,
  RoomSceneHotspotConfig,
  RoomSceneTextConfig,
  RoomSceneTransparentWindowConfig,
} from "@shared/index.js";

function cloneCommandSpecs(
  commandSpecs: RoomCommandSpec[] | undefined
): RoomCommandSpec[] | undefined {
  return commandSpecs?.map((item) => ({ ...item }));
}

function cloneProtocolSpecs(
  protocolSpecs: RoomProtocolSpec[] | undefined
): RoomProtocolSpec[] | undefined {
  return protocolSpecs?.map((item) => ({ ...item }));
}

function cloneSceneText(value: RoomSceneTextConfig): RoomSceneTextConfig {
  return { ...value };
}

export function cloneSceneHotspot(hotspot: RoomSceneHotspotConfig): RoomSceneHotspotConfig {
  return {
    id: hotspot.id,
    rect: { ...hotspot.rect },
    ...(hotspot.label !== undefined ? { label: cloneSceneText(hotspot.label) } : {}),
  };
}

function cloneSceneCharacter(value: RoomSceneCharacterConfig): RoomSceneCharacterConfig {
  return { ...value };
}

export function cloneSceneCharacters(
  value: RoomSceneCharacterConfig[]
): RoomSceneCharacterConfig[] {
  return value.map((character) => cloneSceneCharacter(character));
}

export function cloneSceneChrome(value: RoomSceneChromeConfig): RoomSceneChromeConfig {
  return { ...value };
}

export function cloneTransparentWindow(
  value: RoomSceneTransparentWindowConfig
): RoomSceneTransparentWindowConfig {
  return { ...value };
}

export function cloneInstalledFeatureScene(
  value: InstalledRoomFeatureSceneRecord | undefined
): InstalledRoomFeatureSceneRecord | undefined {
  if (value === undefined) {
    return undefined;
  }

  return {
    hotspot: cloneSceneHotspot(value.hotspot),
    view: {
      id: value.view.id,
      backgroundPath: value.view.backgroundPath,
      ...(value.view.panelArtPath !== undefined ? { panelArtPath: value.view.panelArtPath } : {}),
      ...(value.view.transparentWindow !== undefined
        ? { transparentWindow: cloneTransparentWindow(value.view.transparentWindow) }
        : {}),
    },
  };
}

export function resolveInstalledFeatureScene(
  value: InstalledRoomFeatureSceneRecord | undefined
): InstalledRoomFeatureSceneRecord | undefined {
  if (value === undefined) {
    return undefined;
  }

  return {
    hotspot: cloneSceneHotspot(value.hotspot),
    view: {
      id: value.view.id,
      backgroundPath: resolve(value.view.backgroundPath),
      ...(value.view.panelArtPath !== undefined
        ? { panelArtPath: resolve(value.view.panelArtPath) }
        : {}),
      ...(value.view.transparentWindow !== undefined
        ? { transparentWindow: cloneTransparentWindow(value.view.transparentWindow) }
        : {}),
    },
  };
}

export function cloneInstalledFeatures(
  features: InstalledRoomFeatureRecord[]
): InstalledRoomFeatureRecord[] {
  return features.map((feature) => ({
    ...buildInstalledFeatureRecord(feature),
    ...optionalInstalledFeatureScene(feature.scene),
  }));
}

export function buildInstalledFeatureRecord(
  feature: InstalledRoomFeatureRecord
): Omit<InstalledRoomFeatureRecord, "scene"> {
  return {
    id: feature.id,
    name: feature.name,
    ...(feature.description !== undefined ? { description: feature.description } : {}),
    ...(feature.icon !== undefined ? { icon: feature.icon } : {}),
    ...optionalCommandSpecs(feature.commandSpecs),
    ...optionalProtocolSpecs(feature.protocolSpecs),
  };
}

export function cloneInstalledScene(
  scene: InstalledRoomSceneRecord | undefined
): InstalledRoomSceneRecord | undefined {
  if (scene === undefined) {
    return undefined;
  }

  return {
    referenceSize: { ...scene.referenceSize },
    roomBackgroundPath: scene.roomBackgroundPath,
    roomsHotspot: cloneSceneHotspot(scene.roomsHotspot),
    backHotspot: cloneSceneHotspot(scene.backHotspot),
    ...(scene.characterRosterPreset !== undefined
      ? { characterRosterPreset: scene.characterRosterPreset }
      : {}),
    ...(scene.characters !== undefined
      ? { characters: cloneSceneCharacters(scene.characters) }
      : {}),
    ...(scene.chrome !== undefined ? { chrome: cloneSceneChrome(scene.chrome) } : {}),
  };
}

export function resolveInstalledScene(
  scene: InstalledRoomSceneRecord | undefined
): InstalledRoomSceneRecord | undefined {
  if (scene === undefined) {
    return undefined;
  }

  return {
    referenceSize: { ...scene.referenceSize },
    roomBackgroundPath: resolve(scene.roomBackgroundPath),
    roomsHotspot: cloneSceneHotspot(scene.roomsHotspot),
    backHotspot: cloneSceneHotspot(scene.backHotspot),
    ...(scene.characterRosterPreset !== undefined
      ? { characterRosterPreset: scene.characterRosterPreset }
      : {}),
    ...(scene.characters !== undefined
      ? { characters: cloneSceneCharacters(scene.characters) }
      : {}),
    ...(scene.chrome !== undefined ? { chrome: cloneSceneChrome(scene.chrome) } : {}),
  };
}

export function optionalCommandSpecs(
  commandSpecs: RoomCommandSpec[] | undefined
): { commandSpecs: RoomCommandSpec[] } | Record<string, never> {
  const cloned = cloneCommandSpecs(commandSpecs);
  return Array.isArray(cloned) && cloned.length > 0 ? { commandSpecs: cloned } : {};
}

export function optionalProtocolSpecs(
  protocolSpecs: RoomProtocolSpec[] | undefined
): { protocolSpecs: RoomProtocolSpec[] } | Record<string, never> {
  const cloned = cloneProtocolSpecs(protocolSpecs);
  return Array.isArray(cloned) && cloned.length > 0 ? { protocolSpecs: cloned } : {};
}

export function optionalScene(
  scene: InstalledRoomSceneRecord | undefined
): { scene: InstalledRoomSceneRecord } | Record<string, never> {
  const cloned = cloneInstalledScene(scene);
  return cloned === undefined ? {} : { scene: cloned };
}

export function optionalInstalledFeatureScene(
  scene: InstalledRoomFeatureSceneRecord | undefined
): { scene: InstalledRoomFeatureSceneRecord } | Record<string, never> {
  const cloned = cloneInstalledFeatureScene(scene);
  return cloned === undefined ? {} : { scene: cloned };
}
