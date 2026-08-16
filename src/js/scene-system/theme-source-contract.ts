import type {
  SceneCharacterThemeDefinition,
  SceneClickableThemeDefinition,
  SceneLoadingThemeDefinition,
  SceneRoomId,
  SceneRoomThemeDefinition,
} from "../scene/schema.js";
import type { SceneLayoutConfig } from "../scene/layout/index.js";

export interface SceneThemeSourceDefinition {
  themeId: string;
  loading: SceneLoadingThemeDefinition;
  characters: SceneCharacterThemeDefinition;
  rooms: Record<SceneRoomId, SceneRoomThemeDefinition>;
  clickableDefaults: SceneClickableThemeDefinition;
  maps: Record<SceneRoomId, SceneLayoutConfig>;
}
