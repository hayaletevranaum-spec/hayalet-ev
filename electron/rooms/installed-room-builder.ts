import { join } from "path";
import type {
  InstalledRoomFeatureRecord,
  InstalledRoomRecord,
  InstalledRoomSceneRecord,
  RoomManifest,
} from "@shared/index.js";
import { flattenRoomCommandSpecs, flattenRoomProtocolSpecs } from "@shared/index.js";
import {
  cloneInstalledFeatures,
  cloneSceneCharacters,
  cloneSceneChrome,
  cloneSceneHotspot,
  cloneTransparentWindow,
  optionalCommandSpecs,
  optionalInstalledFeatureScene,
  optionalProtocolSpecs,
  optionalScene,
} from "./installed-room-record.ts";

function optionalDescription(
  description: string | undefined
): { description: string } | Record<string, never> {
  return typeof description === "string" ? { description } : {};
}

export function optionalI18nBaseDir(
  i18nBaseDir: string | undefined
): { i18nBaseDir: string } | Record<string, never> {
  return typeof i18nBaseDir === "string" ? { i18nBaseDir } : {};
}

function optionalWorkbench(
  workbench: RoomManifest["workbench"] | undefined
): { workbench: NonNullable<RoomManifest["workbench"]> } | Record<string, never> {
  return workbench === undefined
    ? {}
    : {
        workbench: {
          ...workbench,
          ...(Array.isArray(workbench.availableFeatureIds)
            ? { availableFeatureIds: [...workbench.availableFeatureIds] }
            : {}),
        },
      };
}

export function buildInstalledRoomRecord(
  manifest: RoomManifest,
  options: {
    sourceDir: string;
    installedDir: string;
    installedAt: string;
    updatedAt: string;
  }
): InstalledRoomRecord {
  const { sourceDir, installedDir, installedAt, updatedAt } = options;
  const features: InstalledRoomFeatureRecord[] = manifest.features.map((feature) => {
    const scene =
      feature.scene === undefined
        ? undefined
        : {
            hotspot: cloneSceneHotspot(feature.scene.hotspot),
            view: {
              id: feature.scene.view.id,
              backgroundPath: join(installedDir, feature.scene.view.backgroundSrc),
              ...(feature.scene.view.panelArtSrc !== undefined
                ? { panelArtPath: join(installedDir, feature.scene.view.panelArtSrc) }
                : {}),
              ...(feature.scene.view.transparentWindow !== undefined
                ? {
                    transparentWindow: cloneTransparentWindow(feature.scene.view.transparentWindow),
                  }
                : {}),
            },
          };

    return {
      id: feature.id,
      name: feature.name,
      ...(feature.description !== undefined ? { description: feature.description } : {}),
      ...(feature.icon !== undefined ? { icon: feature.icon } : {}),
      ...optionalCommandSpecs(feature.commandSpecs),
      ...optionalProtocolSpecs(feature.protocolSpecs),
      ...optionalInstalledFeatureScene(scene),
    };
  });

  const scene: InstalledRoomSceneRecord | undefined =
    manifest.scene === undefined
      ? undefined
      : {
          referenceSize: { ...manifest.scene.referenceSize },
          roomBackgroundPath: join(installedDir, manifest.scene.roomBackgroundSrc),
          roomsHotspot: cloneSceneHotspot(manifest.scene.roomsHotspot),
          backHotspot: cloneSceneHotspot(manifest.scene.backHotspot),
          ...(manifest.scene.characterRosterPreset !== undefined
            ? { characterRosterPreset: manifest.scene.characterRosterPreset }
            : {}),
          ...(manifest.scene.characters !== undefined
            ? { characters: cloneSceneCharacters(manifest.scene.characters) }
            : {}),
          ...(manifest.scene.chrome !== undefined
            ? { chrome: cloneSceneChrome(manifest.scene.chrome) }
            : {}),
        };

  const commandSpecs = flattenRoomCommandSpecs(manifest);
  const protocolSpecs = flattenRoomProtocolSpecs(manifest);

  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    ...optionalDescription(manifest.description),
    ...(manifest.menu.icon !== undefined ? { icon: manifest.menu.icon } : {}),
    ...(manifest.menu.iconSrc !== undefined
      ? { iconPath: join(installedDir, manifest.menu.iconSrc) }
      : {}),
    sourceDir,
    installedDir,
    manifestPath: join(installedDir, "manifest.json"),
    runtimeEntryPath: join(installedDir, manifest.runtime.uiEntry),
    hostEntryPath: join(installedDir, manifest.runtime.hostEntry),
    defaultFeatureId: manifest.defaultFeatureId,
    features: cloneInstalledFeatures(features),
    ...optionalWorkbench(manifest.workbench),
    ...optionalScene(scene),
    ...optionalI18nBaseDir(
      manifest.i18n !== undefined ? join(installedDir, manifest.i18n.baseDir) : undefined
    ),
    ...optionalCommandSpecs(commandSpecs),
    ...optionalProtocolSpecs(protocolSpecs),
    installedAt,
    updatedAt,
  };
}
