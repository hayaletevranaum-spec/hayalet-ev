import type {
  RoomSceneCharacterKind,
  RoomSceneCharacterRosterPreset,
  RoomSceneCharacterSlot,
  RoomScenePageShellVariant,
  RoomSceneViewBackButtonVariant,
  RoomSceneWindowControlsVisibility,
} from "./room-scene-guards.js";
import type { RoomSchemaVersion } from "./room-schema-version.js";

export type RoomCommandScope = "room-ui" | "ai-slots" | "assistant" | "us1" | "system";
export type RoomCommandExposure = "public" | "internal";

export interface RoomMenuConfig {
  label: string;
  icon?: string;
  iconSrc?: string;
  order?: number;
}

export interface RoomRuntimeConfig {
  uiEntry: string;
  hostEntry: string;
}

export interface RoomCommandSpec {
  name: string;
  description?: string;
  scope?: RoomCommandScope;
  exposure?: RoomCommandExposure;
}

export interface RoomProtocolSpec {
  key: string;
  room: string;
  scenario: string;
  title: string;
  editable?: boolean;
  path?: string;
}

export interface RoomSceneRect {
  leftPx: number;
  topPx: number;
  widthPx: number;
  heightPx: number;
}

export interface RoomSceneTextConfig {
  text?: string;
  textKey?: string;
}

export interface RoomSceneHotspotConfig {
  id: string;
  rect: RoomSceneRect;
  label?: RoomSceneTextConfig;
}

export interface RoomSceneTransparentWindowConfig {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

export interface RoomSceneCharacterConfig {
  id: string;
  characterKind: RoomSceneCharacterKind;
  preferredSlot?: RoomSceneCharacterSlot;
  leftPx: number;
  bottomPx: number;
  scale: number;
  depth: number;
}

export interface RoomSceneChromeConfig {
  windowControlsVisibility?: RoomSceneWindowControlsVisibility;
  viewBackButtonVariant?: RoomSceneViewBackButtonVariant;
  pageShellVariant?: RoomScenePageShellVariant;
}

export interface RoomFeatureSceneViewConfig {
  id: string;
  backgroundSrc: string;
  panelArtSrc?: string;
  transparentWindow?: RoomSceneTransparentWindowConfig;
}

export interface RoomFeatureSceneConfig {
  hotspot: RoomSceneHotspotConfig;
  view: RoomFeatureSceneViewConfig;
}

export interface RoomSceneConfig {
  referenceSize: {
    width: number;
    height: number;
  };
  roomBackgroundSrc: string;
  roomsHotspot: RoomSceneHotspotConfig;
  backHotspot: RoomSceneHotspotConfig;
  characterRosterPreset?: RoomSceneCharacterRosterPreset;
  characters?: RoomSceneCharacterConfig[];
  chrome?: RoomSceneChromeConfig;
}

export interface RoomI18nConfig {
  baseDir: string;
}

export interface RoomFeatureManifest {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  commandSpecs?: RoomCommandSpec[];
  protocolSpecs?: RoomProtocolSpec[];
  scene?: RoomFeatureSceneConfig;
}

export interface RoomWorkbenchConfig {
  experienceId: string;
  label?: string;
  description?: string;
  mode?: "guided";
  primaryFeatureId?: string;
  availableFeatureIds?: string[];
}

export interface RoomManifest {
  schemaVersion: RoomSchemaVersion;
  id: string;
  name: string;
  version: string;
  description?: string;
  menu: RoomMenuConfig;
  runtime: RoomRuntimeConfig;
  defaultFeatureId: string;
  features: RoomFeatureManifest[];
  workbench?: RoomWorkbenchConfig;
  scene?: RoomSceneConfig;
  i18n?: RoomI18nConfig;
  storageNamespace?: string;
  engineRange?: string;
  permissions?: string[];
  commandSpecs?: RoomCommandSpec[];
  protocolSpecs?: RoomProtocolSpec[];
}

export interface RoomBundleFile {
  encoding: "base64";
  content: string;
}

export interface RoomBundle {
  schemaVersion: RoomSchemaVersion;
  manifest: RoomManifest;
  files: Record<string, RoomBundleFile>;
  exportedAt: string;
}

export interface RoomManifestValidationResult {
  valid: boolean;
  errors: string[];
  manifest?: RoomManifest;
}

export interface RoomWorkspaceEntry {
  dirName: string;
  dirPath: string;
  valid: boolean;
  errors: string[];
  manifest?: RoomManifest;
  sourceKind?: "workspace" | "bundle";
  readOnly?: boolean;
}
