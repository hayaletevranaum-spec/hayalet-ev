import {
  isValidRoomCommandName,
  isValidRoomId,
  normalizeRoomRelativePath,
} from "./room-validation-primitives.js";
import { ROOM_SCHEMA_VERSION } from "./room-schema-version.js";
import type { RoomManifestValidationResult } from "./room-manifest-types.js";
import {
  collectRoomManifestRequiredFilePaths,
  flattenRoomCommandSpecs,
  flattenRoomProtocolSpecs,
  resolveRoomProtocolFilePath,
} from "./room-manifest-helpers.js";
import { validateRoomManifest as validateRoomManifestCandidate } from "./room-manifest-validation.js";
export { ROOM_SCHEMA_VERSION } from "./room-schema-version.js";
export {
  collectRoomManifestRequiredFilePaths,
  flattenRoomCommandSpecs,
  flattenRoomProtocolSpecs,
  isValidRoomCommandName,
  isValidRoomId,
  normalizeRoomRelativePath,
  resolveRoomProtocolFilePath,
};
export {
  ROOM_SCENE_CHARACTER_KINDS,
  ROOM_SCENE_CHARACTER_ROSTER_PRESETS,
  ROOM_SCENE_CHARACTER_SLOTS,
  ROOM_SCENE_PAGE_SHELL_VARIANTS,
  ROOM_SCENE_VIEW_BACK_BUTTON_VARIANTS,
  ROOM_SCENE_WINDOW_CONTROLS_VISIBILITIES,
} from "./room-scene-guards.js";
export type {
  RoomSceneCharacterKind,
  RoomSceneCharacterRosterPreset,
  RoomSceneCharacterSlot,
  RoomScenePageShellVariant,
  RoomSceneViewBackButtonVariant,
  RoomSceneWindowControlsVisibility,
} from "./room-scene-guards.js";
export type {
  RoomCommandExposure,
  RoomBundle,
  RoomBundleFile,
  RoomCommandScope,
  RoomCommandSpec,
  RoomFeatureManifest,
  RoomWorkbenchConfig,
  RoomFeatureSceneConfig,
  RoomFeatureSceneViewConfig,
  RoomI18nConfig,
  RoomManifest,
  RoomManifestValidationResult,
  RoomMenuConfig,
  RoomProtocolSpec,
  RoomRuntimeConfig,
  RoomSceneCharacterConfig,
  RoomSceneChromeConfig,
  RoomSceneConfig,
  RoomSceneHotspotConfig,
  RoomSceneRect,
  RoomSceneTextConfig,
  RoomSceneTransparentWindowConfig,
  RoomWorkspaceEntry,
} from "./room-manifest-types.js";
export type {
  InstalledRoomFeatureRecord,
  InstalledRoomFeatureSceneRecord,
  InstalledRoomFeatureSceneViewRecord,
  InstalledRoomRecord,
  InstalledRoomSceneRecord,
  RoomRegistryState,
  StartupRoomProtocolSnapshot,
  StartupRoomsSnapshot,
  StartupRoomsSyncResult,
} from "./room-installed-types.js";

export function validateRoomManifest(candidate: unknown): RoomManifestValidationResult {
  return validateRoomManifestCandidate(candidate, ROOM_SCHEMA_VERSION);
}
