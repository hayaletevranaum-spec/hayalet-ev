import type {
  RoomFeatureManifest,
  RoomManifest,
  RoomManifestValidationResult,
  RoomWorkbenchConfig,
} from "./rooms.js";
import {
  hasDuplicateValues,
  isRecord,
  isValidRoomId,
  readOptionalString,
  readRequiredString,
} from "./room-validation-primitives.js";
import {
  readCommandSpecs,
  readI18nConfig,
  readMenuConfig,
  readProtocolSpecs,
  readRuntimeConfig,
} from "./room-manifest-readers.js";
import {
  isRoomSceneCharacterKind,
  isRoomSceneCharacterRosterPreset,
  isRoomSceneCharacterSlot,
  isRoomScenePageShellVariant,
  isRoomSceneViewBackButtonVariant,
  isRoomSceneWindowControlsVisibility,
} from "./room-scene-guards.js";
import { createRoomSceneReaders } from "./room-scene-readers.js";

function isValidRoomFeatureId(value: string): boolean {
  return isValidRoomId(value);
}

const roomSceneReaders = createRoomSceneReaders({
  isValidRoomFeatureId,
  isRoomSceneCharacterKind,
  isRoomSceneCharacterSlot,
  isRoomSceneCharacterRosterPreset,
  isRoomSceneWindowControlsVisibility,
  isRoomSceneViewBackButtonVariant,
  isRoomScenePageShellVariant,
});

const { readFeatureManifest, readSceneConfig } = roomSceneReaders;

function readWorkbenchConfig(
  candidate: unknown,
  featureIds: string[],
  errors: string[]
): RoomWorkbenchConfig | undefined {
  if (candidate === undefined) {
    return undefined;
  }
  if (!isRecord(candidate)) {
    errors.push("workbench must be an object");
    return undefined;
  }

  const experienceId = readRequiredString(candidate, "experienceId", errors);
  const label = readOptionalString(candidate, "label", errors);
  const description = readOptionalString(candidate, "description", errors);
  const mode = readOptionalString(candidate, "mode", errors);
  if (mode !== undefined && mode !== "guided") {
    errors.push("workbench.mode must be 'guided' when provided");
  }
  const workbenchMode: RoomWorkbenchConfig["mode"] = mode === "guided" ? "guided" : undefined;
  const primaryFeatureId = readOptionalString(candidate, "primaryFeatureId", errors);
  if (primaryFeatureId !== undefined && featureIds.includes(primaryFeatureId) === false) {
    errors.push("workbench.primaryFeatureId must match one of the feature ids");
  }

  const availableFeatureIdsRaw = candidate["availableFeatureIds"];
  let availableFeatureIds: string[] | undefined;
  if (availableFeatureIdsRaw !== undefined) {
    if (!Array.isArray(availableFeatureIdsRaw)) {
      errors.push("workbench.availableFeatureIds must be an array of strings");
    } else {
      const parsed = availableFeatureIdsRaw.filter(
        (value): value is string => typeof value === "string"
      );
      if (parsed.length !== availableFeatureIdsRaw.length) {
        errors.push("workbench.availableFeatureIds must contain only strings");
      } else {
        availableFeatureIds = parsed.map((value) => value.trim()).filter((value) => value !== "");
        if (availableFeatureIds.some((value) => featureIds.includes(value) === false)) {
          errors.push("workbench.availableFeatureIds must match declared feature ids");
        }
        if (hasDuplicateValues(availableFeatureIds)) {
          errors.push("workbench.availableFeatureIds must be unique");
        }
      }
    }
  }

  if (experienceId === undefined) {
    return undefined;
  }

  return {
    experienceId,
    ...(label !== undefined ? { label } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(workbenchMode !== undefined ? { mode: workbenchMode } : {}),
    ...(primaryFeatureId !== undefined ? { primaryFeatureId } : {}),
    ...(availableFeatureIds !== undefined ? { availableFeatureIds } : {}),
  };
}

export function validateRoomManifest(
  candidate: unknown,
  roomSchemaVersion: RoomManifest["schemaVersion"]
): RoomManifestValidationResult {
  const errors: string[] = [];

  if (!isRecord(candidate)) {
    return {
      valid: false,
      errors: ["manifest must be an object"],
    };
  }

  const schemaVersion = candidate["schemaVersion"];
  if (schemaVersion !== roomSchemaVersion) {
    errors.push(`schemaVersion must be ${String(roomSchemaVersion)}`);
  }

  const id = readRequiredString(candidate, "id", errors);
  if (id !== undefined && isValidRoomId(id) === false) {
    errors.push("id must match /^[a-z0-9]+(?:-[a-z0-9]+)*$/");
  }

  const name = readRequiredString(candidate, "name", errors);
  const version = readRequiredString(candidate, "version", errors);
  if (version !== undefined && /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version) === false) {
    errors.push("version must look like semver");
  }

  const description = readOptionalString(candidate, "description", errors);
  const menu = readMenuConfig(candidate, errors);
  const runtime = readRuntimeConfig(candidate, errors);
  const defaultFeatureId = readRequiredString(candidate, "defaultFeatureId", errors);
  const storageNamespace = readOptionalString(candidate, "storageNamespace", errors);
  const engineRange = readOptionalString(candidate, "engineRange", errors);
  const i18n = readI18nConfig(candidate["i18n"], errors);

  const permissionsRaw = candidate["permissions"];
  let permissions: string[] | undefined;
  if (permissionsRaw !== undefined) {
    if (!Array.isArray(permissionsRaw)) {
      errors.push("permissions must be an array of strings");
    } else {
      const parsed = permissionsRaw.filter((value): value is string => typeof value === "string");
      if (parsed.length !== permissionsRaw.length) {
        errors.push("permissions must contain only strings");
      } else {
        permissions = parsed.map((value) => value.trim()).filter((value) => value !== "");
      }
    }
  }

  const commandSpecs = readCommandSpecs(candidate["commandSpecs"], "commandSpecs", errors);
  const protocolSpecs = readProtocolSpecs(candidate["protocolSpecs"], "protocolSpecs", errors);

  const featuresRaw = candidate["features"];
  let features: RoomFeatureManifest[] | undefined;
  if (!Array.isArray(featuresRaw)) {
    errors.push("features must be an array");
  } else if (featuresRaw.length === 0) {
    errors.push("features must contain at least one item");
  } else {
    const parsed = featuresRaw
      .map((item, index) => readFeatureManifest(item, index, errors))
      .filter((feature): feature is RoomFeatureManifest => feature !== undefined);
    if (hasDuplicateValues(parsed.map((feature) => feature.id))) {
      errors.push("features ids must be unique");
    }
    features = parsed;
  }

  if (
    defaultFeatureId !== undefined &&
    features?.some((feature) => feature.id === defaultFeatureId) === false
  ) {
    errors.push("defaultFeatureId must match one of the feature ids");
  }

  const workbench =
    features !== undefined
      ? readWorkbenchConfig(
          candidate["workbench"],
          features.map((feature) => feature.id),
          errors
        )
      : undefined;

  const scene =
    features !== undefined
      ? readSceneConfig(candidate["scene"], features, workbench, errors)
      : undefined;

  if (features !== undefined) {
    const commandNames = [
      ...(commandSpecs ?? []).map((item) => item.name),
      ...features.flatMap((feature) => (feature.commandSpecs ?? []).map((item) => item.name)),
    ];
    if (hasDuplicateValues(commandNames)) {
      errors.push("commandSpecs names must be unique across room and features");
    }

    const protocolKeys = [
      ...(protocolSpecs ?? []).map((item) => item.key),
      ...features.flatMap((feature) => (feature.protocolSpecs ?? []).map((item) => item.key)),
    ];
    if (hasDuplicateValues(protocolKeys)) {
      errors.push("protocolSpecs keys must be unique across room and features");
    }
  }

  if (
    errors.length > 0 ||
    id === undefined ||
    name === undefined ||
    version === undefined ||
    menu === undefined ||
    runtime === undefined ||
    defaultFeatureId === undefined ||
    features === undefined
  ) {
    return {
      valid: false,
      errors,
    };
  }

  const manifest: RoomManifest = {
    schemaVersion: roomSchemaVersion,
    id,
    name,
    version,
    menu,
    runtime,
    defaultFeatureId,
    features,
    ...(workbench !== undefined ? { workbench } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(scene !== undefined ? { scene } : {}),
    ...(i18n !== undefined ? { i18n } : {}),
    ...(storageNamespace !== undefined ? { storageNamespace } : {}),
    ...(engineRange !== undefined ? { engineRange } : {}),
    ...(permissions !== undefined ? { permissions } : {}),
    ...(commandSpecs !== undefined ? { commandSpecs } : {}),
    ...(protocolSpecs !== undefined ? { protocolSpecs } : {}),
  };

  return {
    valid: true,
    errors: [],
    manifest,
  };
}
