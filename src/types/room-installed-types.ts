import type {
  RoomCommandSpec,
  RoomProtocolSpec,
  RoomSceneCharacterConfig,
  RoomSceneChromeConfig,
  RoomSceneHotspotConfig,
  RoomSceneTransparentWindowConfig,
  RoomWorkbenchConfig,
} from "./room-manifest-types.js";
import type { RoomSchemaVersion } from "./room-schema-version.js";
import type { RoomSceneCharacterRosterPreset } from "./room-scene-guards.js";

export interface InstalledRoomFeatureSceneViewRecord {
  id: string;
  backgroundPath: string;
  panelArtPath?: string;
  transparentWindow?: RoomSceneTransparentWindowConfig;
}

export interface InstalledRoomFeatureSceneRecord {
  hotspot: RoomSceneHotspotConfig;
  view: InstalledRoomFeatureSceneViewRecord;
}

export interface InstalledRoomFeatureRecord {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  commandSpecs?: RoomCommandSpec[];
  protocolSpecs?: RoomProtocolSpec[];
  scene?: InstalledRoomFeatureSceneRecord;
}

export interface InstalledRoomSceneRecord {
  referenceSize: {
    width: number;
    height: number;
  };
  roomBackgroundPath: string;
  roomsHotspot: RoomSceneHotspotConfig;
  backHotspot: RoomSceneHotspotConfig;
  characterRosterPreset?: RoomSceneCharacterRosterPreset;
  characters?: RoomSceneCharacterConfig[];
  chrome?: RoomSceneChromeConfig;
}

export interface InstalledRoomRecord {
  id: string;
  name: string;
  version: string;
  description?: string;
  icon?: string;
  iconPath?: string;
  isWorkspaceFallback?: boolean;
  sourceDir: string;
  installedDir: string;
  manifestPath: string;
  runtimeEntryPath: string;
  hostEntryPath: string;
  defaultFeatureId: string;
  features: InstalledRoomFeatureRecord[];
  workbench?: RoomWorkbenchConfig;
  scene?: InstalledRoomSceneRecord;
  i18nBaseDir?: string;
  commandSpecs?: RoomCommandSpec[];
  protocolSpecs?: RoomProtocolSpec[];
  installedAt: string;
  updatedAt: string;
}

export interface RoomRegistryState {
  version: RoomSchemaVersion;
  updatedAt: string;
  rooms: InstalledRoomRecord[];
}

export interface StartupRoomProtocolSnapshot {
  roomId: string;
  key: string;
  body: string;
}

export interface StartupRoomsSnapshot {
  rooms: InstalledRoomRecord[];
  protocols: StartupRoomProtocolSnapshot[];
}

export interface StartupRoomsSyncResult {
  success: boolean;
  snapshot: StartupRoomsSnapshot | null;
  syncedRoomIds?: string[];
  error?: string;
}
