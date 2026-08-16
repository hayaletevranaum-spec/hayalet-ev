import type { SceneLayoutConfig } from "../scene/layout/index.js";
import type { SceneClickableThemeDefinition, SceneRoomId } from "../scene/schema.js";
import type { SceneThemeSourceDefinition } from "./theme-source-contract.js";

export type SceneThemeSourceKind = "built-in" | "installed";

export interface SceneThemeRegistration {
  themeId: string;
  label: string;
  sourceKind: SceneThemeSourceKind;
  sourceRoot: string;
  maps: Record<SceneRoomId, SceneLayoutConfig>;
  clickableDefaults: SceneClickableThemeDefinition;
  source?: SceneThemeSourceDefinition;
}

export interface SceneThemeSummary {
  themeId: string;
  label: string;
  sourceKind: SceneThemeSourceKind;
  sourceRoot: string;
}
