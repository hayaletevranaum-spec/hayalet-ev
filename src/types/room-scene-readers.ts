import {
  hasDuplicateValues,
  isRecord,
  normalizeRoomRelativePath,
  readFiniteNumber,
  readOptionalString,
  readPositiveNumber,
  readRequiredString,
} from "./room-validation-primitives.js";
import { readCommandSpecs, readProtocolSpecs } from "./room-manifest-readers.js";
import type {
  RoomFeatureManifest,
  RoomFeatureSceneConfig,
  RoomSceneCharacterConfig,
  RoomSceneCharacterKind,
  RoomSceneCharacterRosterPreset,
  RoomSceneCharacterSlot,
  RoomSceneChromeConfig,
  RoomSceneConfig,
  RoomSceneHotspotConfig,
  RoomScenePageShellVariant,
  RoomSceneRect,
  RoomSceneTextConfig,
  RoomSceneTransparentWindowConfig,
  RoomSceneViewBackButtonVariant,
  RoomSceneWindowControlsVisibility,
  RoomWorkbenchConfig,
} from "./rooms.js";

interface RoomSceneReaderDeps {
  isValidRoomFeatureId: (value: string) => boolean;
  isRoomSceneCharacterKind: (value: string) => value is RoomSceneCharacterKind;
  isRoomSceneCharacterSlot: (value: string) => value is RoomSceneCharacterSlot;
  isRoomSceneCharacterRosterPreset: (value: string) => value is RoomSceneCharacterRosterPreset;
  isRoomSceneWindowControlsVisibility: (
    value: string
  ) => value is RoomSceneWindowControlsVisibility;
  isRoomSceneViewBackButtonVariant: (value: string) => value is RoomSceneViewBackButtonVariant;
  isRoomScenePageShellVariant: (value: string) => value is RoomScenePageShellVariant;
}

export function createRoomSceneReaders(deps: RoomSceneReaderDeps) {
  const {
    isValidRoomFeatureId,
    isRoomSceneCharacterKind,
    isRoomSceneCharacterSlot,
    isRoomSceneCharacterRosterPreset,
    isRoomSceneWindowControlsVisibility,
    isRoomSceneViewBackButtonVariant,
    isRoomScenePageShellVariant,
  } = deps;

  function readSceneRect(
    rawValue: unknown,
    path: string,
    errors: string[]
  ): RoomSceneRect | undefined {
    if (!isRecord(rawValue)) {
      errors.push(`${path} must be an object`);
      return undefined;
    }

    const leftPx = readFiniteNumber(rawValue, "leftPx", errors);
    const topPx = readFiniteNumber(rawValue, "topPx", errors);
    const widthPx = readPositiveNumber(rawValue, "widthPx", errors);
    const heightPx = readPositiveNumber(rawValue, "heightPx", errors);

    if (
      leftPx === undefined ||
      topPx === undefined ||
      widthPx === undefined ||
      heightPx === undefined
    ) {
      return undefined;
    }

    return {
      leftPx,
      topPx,
      widthPx,
      heightPx,
    };
  }

  function readSceneTextConfig(
    rawValue: unknown,
    path: string,
    errors: string[]
  ): RoomSceneTextConfig | undefined {
    if (rawValue === undefined) {
      return undefined;
    }

    if (!isRecord(rawValue)) {
      errors.push(`${path} must be an object`);
      return undefined;
    }

    const text = readOptionalString(rawValue, "text", errors);
    const textKey = readOptionalString(rawValue, "textKey", errors);
    if (text === undefined && textKey === undefined) {
      errors.push(`${path} requires text or textKey`);
      return undefined;
    }

    return {
      ...(text !== undefined ? { text } : {}),
      ...(textKey !== undefined ? { textKey } : {}),
    };
  }

  function readSceneHotspotConfig(
    rawValue: unknown,
    path: string,
    fallbackId: string,
    errors: string[]
  ): RoomSceneHotspotConfig | undefined {
    if (!isRecord(rawValue)) {
      errors.push(`${path} must be an object`);
      return undefined;
    }

    const id = readOptionalString(rawValue, "id", errors) ?? fallbackId;
    const rect = readSceneRect(rawValue["rect"], `${path}.rect`, errors);
    const label = readSceneTextConfig(rawValue["label"], `${path}.label`, errors);
    if (rect === undefined) {
      return undefined;
    }

    return {
      id,
      rect,
      ...(label !== undefined ? { label } : {}),
    };
  }

  function readTransparentWindowConfig(
    rawValue: unknown,
    path: string,
    errors: string[]
  ): RoomSceneTransparentWindowConfig | undefined {
    if (rawValue === undefined) {
      return undefined;
    }

    if (!isRecord(rawValue)) {
      errors.push(`${path} must be an object`);
      return undefined;
    }

    const leftPct = readPositiveNumber(rawValue, "leftPct", errors);
    const topPct = readPositiveNumber(rawValue, "topPct", errors);
    const widthPct = readPositiveNumber(rawValue, "widthPct", errors);
    const heightPct = readPositiveNumber(rawValue, "heightPct", errors);

    if (
      leftPct === undefined ||
      topPct === undefined ||
      widthPct === undefined ||
      heightPct === undefined
    ) {
      return undefined;
    }

    return {
      leftPct,
      topPct,
      widthPct,
      heightPct,
    };
  }

  function readSceneCharacterConfig(
    rawValue: unknown,
    path: string,
    errors: string[]
  ): RoomSceneCharacterConfig | undefined {
    if (!isRecord(rawValue)) {
      errors.push(`${path} must be an object`);
      return undefined;
    }

    const id = readRequiredString(rawValue, "id", errors);
    const characterKindRaw = readRequiredString(rawValue, "characterKind", errors);
    const preferredSlotRaw = readOptionalString(rawValue, "preferredSlot", errors);
    const leftPx = readFiniteNumber(rawValue, "leftPx", errors);
    const bottomPx = readFiniteNumber(rawValue, "bottomPx", errors);
    const scale = readPositiveNumber(rawValue, "scale", errors);
    const depth = readFiniteNumber(rawValue, "depth", errors);

    let characterKind: RoomSceneCharacterKind | undefined;
    if (characterKindRaw !== undefined) {
      if (isRoomSceneCharacterKind(characterKindRaw) === false) {
        errors.push(`${path}.characterKind is invalid`);
      } else {
        characterKind = characterKindRaw;
      }
    }

    let preferredSlot: RoomSceneCharacterSlot | undefined;
    if (preferredSlotRaw !== undefined) {
      if (isRoomSceneCharacterSlot(preferredSlotRaw) === false) {
        errors.push(`${path}.preferredSlot is invalid`);
      } else {
        preferredSlot = preferredSlotRaw;
      }
    }

    if (
      id === undefined ||
      characterKind === undefined ||
      leftPx === undefined ||
      bottomPx === undefined ||
      scale === undefined ||
      depth === undefined
    ) {
      return undefined;
    }

    return {
      id,
      characterKind,
      ...(preferredSlot !== undefined ? { preferredSlot } : {}),
      leftPx,
      bottomPx,
      scale,
      depth,
    };
  }

  function readSceneCharacters(
    rawValue: unknown,
    path: string,
    errors: string[]
  ): RoomSceneCharacterConfig[] | undefined {
    if (rawValue === undefined) {
      return undefined;
    }

    if (!Array.isArray(rawValue)) {
      errors.push(`${path} must be an array`);
      return undefined;
    }

    const parsed = rawValue
      .map((item, index) => readSceneCharacterConfig(item, `${path}[${String(index)}]`, errors))
      .filter((character): character is RoomSceneCharacterConfig => character !== undefined);

    if (hasDuplicateValues(parsed.map((character) => character.id))) {
      errors.push(`${path} ids must be unique`);
    }

    return parsed;
  }

  function readSceneChromeConfig(
    rawValue: unknown,
    path: string,
    errors: string[]
  ): RoomSceneChromeConfig | undefined {
    if (rawValue === undefined) {
      return undefined;
    }

    if (!isRecord(rawValue)) {
      errors.push(`${path} must be an object`);
      return undefined;
    }

    const windowControlsVisibilityRaw = readOptionalString(
      rawValue,
      "windowControlsVisibility",
      errors
    );
    const viewBackButtonVariantRaw = readOptionalString(rawValue, "viewBackButtonVariant", errors);
    const pageShellVariantRaw = readOptionalString(rawValue, "pageShellVariant", errors);

    let windowControlsVisibility: RoomSceneWindowControlsVisibility | undefined;
    if (windowControlsVisibilityRaw !== undefined) {
      if (isRoomSceneWindowControlsVisibility(windowControlsVisibilityRaw) === false) {
        errors.push(`${path}.windowControlsVisibility is invalid`);
      } else {
        windowControlsVisibility = windowControlsVisibilityRaw;
      }
    }

    let viewBackButtonVariant: RoomSceneViewBackButtonVariant | undefined;
    if (viewBackButtonVariantRaw !== undefined) {
      if (isRoomSceneViewBackButtonVariant(viewBackButtonVariantRaw) === false) {
        errors.push(`${path}.viewBackButtonVariant is invalid`);
      } else {
        viewBackButtonVariant = viewBackButtonVariantRaw;
      }
    }

    let pageShellVariant: RoomScenePageShellVariant | undefined;
    if (pageShellVariantRaw !== undefined) {
      if (isRoomScenePageShellVariant(pageShellVariantRaw) === false) {
        errors.push(`${path}.pageShellVariant is invalid`);
      } else {
        pageShellVariant = pageShellVariantRaw;
      }
    }

    if (
      windowControlsVisibility === undefined &&
      viewBackButtonVariant === undefined &&
      pageShellVariant === undefined
    ) {
      return {};
    }

    return {
      ...(windowControlsVisibility !== undefined ? { windowControlsVisibility } : {}),
      ...(viewBackButtonVariant !== undefined ? { viewBackButtonVariant } : {}),
      ...(pageShellVariant !== undefined ? { pageShellVariant } : {}),
    };
  }

  function readFeatureSceneConfig(
    rawValue: unknown,
    featureId: string,
    errors: string[]
  ): RoomFeatureSceneConfig | undefined {
    if (rawValue === undefined) {
      return undefined;
    }

    if (!isRecord(rawValue)) {
      errors.push(`features.${featureId}.scene must be an object`);
      return undefined;
    }

    const hotspot = readSceneHotspotConfig(
      rawValue["hotspot"],
      `features.${featureId}.scene.hotspot`,
      `${featureId}-hotspot`,
      errors
    );

    const viewRaw = rawValue["view"];
    if (!isRecord(viewRaw)) {
      errors.push(`features.${featureId}.scene.view must be an object`);
      return undefined;
    }

    const viewId = readRequiredString(viewRaw, "id", errors);
    const backgroundSrcRaw = readRequiredString(viewRaw, "backgroundSrc", errors);
    const backgroundSrc =
      backgroundSrcRaw !== undefined ? normalizeRoomRelativePath(backgroundSrcRaw) : null;
    if (backgroundSrcRaw !== undefined && backgroundSrc === null) {
      errors.push(`features.${featureId}.scene.view.backgroundSrc must be a safe relative path`);
    }

    const panelArtSrcRaw = readOptionalString(viewRaw, "panelArtSrc", errors);
    const panelArtSrc =
      panelArtSrcRaw !== undefined ? normalizeRoomRelativePath(panelArtSrcRaw) : null;
    if (panelArtSrcRaw !== undefined && panelArtSrc === null) {
      errors.push(`features.${featureId}.scene.view.panelArtSrc must be a safe relative path`);
    }

    const transparentWindow = readTransparentWindowConfig(
      viewRaw["transparentWindow"],
      `features.${featureId}.scene.view.transparentWindow`,
      errors
    );

    if (hotspot === undefined || viewId === undefined || backgroundSrc === null) {
      return undefined;
    }

    return {
      hotspot,
      view: {
        id: viewId,
        backgroundSrc,
        ...(panelArtSrc !== null ? { panelArtSrc } : {}),
        ...(transparentWindow !== undefined ? { transparentWindow } : {}),
      },
    };
  }

  function readFeatureManifest(
    rawValue: unknown,
    index: number,
    errors: string[]
  ): RoomFeatureManifest | undefined {
    if (!isRecord(rawValue)) {
      errors.push(`features[${String(index)}] must be an object`);
      return undefined;
    }

    const id = readRequiredString(rawValue, "id", errors);
    if (id !== undefined && isValidRoomFeatureId(id) === false) {
      errors.push(`features[${String(index)}].id must match /^[a-z0-9]+(?:-[a-z0-9]+)*$/`);
    }
    const name = readRequiredString(rawValue, "name", errors);
    const description = readOptionalString(rawValue, "description", errors);
    const icon = readOptionalString(rawValue, "icon", errors);
    const commandSpecs = readCommandSpecs(
      rawValue["commandSpecs"],
      `features[${String(index)}].commandSpecs`,
      errors
    );
    const protocolSpecs = readProtocolSpecs(
      rawValue["protocolSpecs"],
      `features[${String(index)}].protocolSpecs`,
      errors
    );
    const scene = readFeatureSceneConfig(
      rawValue["scene"],
      id ?? `feature-${String(index)}`,
      errors
    );

    if (id === undefined || name === undefined) {
      return undefined;
    }

    return {
      id,
      name,
      ...(description !== undefined ? { description } : {}),
      ...(icon !== undefined ? { icon } : {}),
      ...(commandSpecs !== undefined ? { commandSpecs } : {}),
      ...(protocolSpecs !== undefined ? { protocolSpecs } : {}),
      ...(scene !== undefined ? { scene } : {}),
    };
  }

  function readSceneConfig(
    rawValue: unknown,
    features: RoomFeatureManifest[],
    workbench: RoomWorkbenchConfig | undefined,
    errors: string[]
  ): RoomSceneConfig | undefined {
    if (rawValue === undefined) {
      return undefined;
    }

    if (!isRecord(rawValue)) {
      errors.push("scene must be an object");
      return undefined;
    }

    const referenceSizeRaw = rawValue["referenceSize"];
    if (!isRecord(referenceSizeRaw)) {
      errors.push("scene.referenceSize must be an object");
      return undefined;
    }

    const width = readPositiveNumber(referenceSizeRaw, "width", errors);
    const height = readPositiveNumber(referenceSizeRaw, "height", errors);
    const roomBackgroundSrcRaw = readRequiredString(rawValue, "roomBackgroundSrc", errors);
    const roomBackgroundSrc =
      roomBackgroundSrcRaw !== undefined ? normalizeRoomRelativePath(roomBackgroundSrcRaw) : null;
    if (roomBackgroundSrcRaw !== undefined && roomBackgroundSrc === null) {
      errors.push("scene.roomBackgroundSrc must be a safe relative path");
    }

    const roomsHotspot = readSceneHotspotConfig(
      rawValue["roomsHotspot"],
      "scene.roomsHotspot",
      "room-entry",
      errors
    );
    const backHotspot = readSceneHotspotConfig(
      rawValue["backHotspot"],
      "scene.backHotspot",
      "room-back",
      errors
    );
    const rosterPresetRaw = readOptionalString(rawValue, "characterRosterPreset", errors);
    const characters = readSceneCharacters(rawValue["characters"], "scene.characters", errors);
    const chrome = readSceneChromeConfig(rawValue["chrome"], "scene.chrome", errors);

    let characterRosterPreset: RoomSceneCharacterRosterPreset | undefined;
    if (rosterPresetRaw !== undefined) {
      if (isRoomSceneCharacterRosterPreset(rosterPresetRaw) === false) {
        errors.push("scene.characterRosterPreset is invalid");
      } else {
        characterRosterPreset = rosterPresetRaw;
      }
    }

    const featureSceneIds = features
      .filter((feature) => feature.scene !== undefined)
      .map((feature) => feature.id);
    const missingFeatureScene = features
      .filter((feature) => feature.scene === undefined)
      .map((feature) => feature.id);
    if (workbench?.experienceId !== undefined) {
      if (featureSceneIds.length === 0) {
        errors.push("scene requires at least one feature.scene when workbench is enabled");
      }
      if (
        workbench.primaryFeatureId !== undefined &&
        features.some(
          (feature) => feature.id === workbench.primaryFeatureId && feature.scene === undefined
        )
      ) {
        errors.push(
          `scene requires feature.scene for workbench.primaryFeatureId: ${workbench.primaryFeatureId}`
        );
      }
    } else if (missingFeatureScene.length > 0) {
      errors.push(`scene requires feature.scene for: ${missingFeatureScene.join(", ")}`);
    }

    if (
      width === undefined ||
      height === undefined ||
      roomBackgroundSrc === null ||
      roomsHotspot === undefined ||
      backHotspot === undefined
    ) {
      return undefined;
    }

    return {
      referenceSize: {
        width,
        height,
      },
      roomBackgroundSrc,
      roomsHotspot,
      backHotspot,
      ...(characterRosterPreset !== undefined ? { characterRosterPreset } : {}),
      ...(characters !== undefined ? { characters } : {}),
      ...(chrome !== undefined ? { chrome } : {}),
    };
  }

  return {
    readFeatureManifest,
    readSceneConfig,
  };
}
