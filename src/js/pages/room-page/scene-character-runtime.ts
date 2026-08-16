import type { SceneLayoutConfig } from "../../scene/layout/index.js";
import {
  buildSceneCharacterRoster,
  resolveSceneAvatarSource,
} from "../../scene/characters/index.js";
import { renderSceneCharacterLayer } from "../../scene/renderers/character-layer.js";
import { getRoomSceneDepthScale, getRoomSceneProjection } from "./scene-render-runtime.js";

interface RenderRoomPageSceneCharactersParams {
  page: HTMLElement;
  referenceSize: { width: number; height: number };
  sceneDebugEnabled: boolean;
  sceneLayout: SceneLayoutConfig;
  isStale: () => boolean;
}

export async function renderRoomPageSceneCharacters({
  isStale,
  page,
  referenceSize,
  sceneDebugEnabled,
  sceneLayout,
}: RenderRoomPageSceneCharactersParams): Promise<void> {
  const layer = page.querySelector<HTMLElement>("[data-room-role='scene-characters']");
  const host = page.querySelector<HTMLElement>("[data-room-role='scene-room']");
  if (layer === null || host === null) {
    return;
  }

  const characters = buildSceneCharacterRoster(
    sceneLayout.characters,
    sceneLayout.characterRosterPreset
  );
  if (characters.length === 0) {
    layer.replaceChildren();
    return;
  }

  await renderSceneCharacterLayer({
    layer,
    characters,
    projection: getRoomSceneProjection(host, referenceSize),
    sceneDebugEnabled,
    interactive: false,
    selectedCharacterId: null,
    isStale,
    getDepthScale: (depth) => getRoomSceneDepthScale(depth),
    resolveAvatarSource: async (character) => {
      return await resolveSceneAvatarSource(character.avatarSource);
    },
    getNodeClassName: (character) =>
      `entrance-scene__character room-scene__character is-${character.state}`,
    getFallbackHeadLabel: (character) => character.headLabel ?? "?",
    onActivate: () => {},
  });
}
