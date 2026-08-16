import type { SceneCharacterDescriptor } from "../characters/index.js";

interface SceneProjection {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export interface RenderSceneCharacterLayerOptions {
  layer: HTMLElement;
  characters: readonly SceneCharacterDescriptor[];
  projection: SceneProjection;
  sceneDebugEnabled: boolean;
  interactive: boolean;
  selectedCharacterId: string | null;
  menuOpenCharacterId?: string | null;
  isStale?(): boolean;
  getDepthScale(depth: number): number;
  resolveAvatarSource(character: SceneCharacterDescriptor): Promise<string | null>;
  getNodeClassName(character: SceneCharacterDescriptor): string;
  getNodeId?(character: SceneCharacterDescriptor): string | null;
  getFallbackHeadLabel(character: SceneCharacterDescriptor): string;
  onActivate(character: SceneCharacterDescriptor, node: HTMLElement): void;
}

export async function renderSceneCharacterLayer(
  options: RenderSceneCharacterLayerOptions
): Promise<void> {
  const {
    layer,
    characters,
    projection,
    sceneDebugEnabled,
    interactive,
    selectedCharacterId,
    menuOpenCharacterId = null,
    isStale,
    getDepthScale,
    resolveAvatarSource,
    getNodeClassName,
    getNodeId,
    getFallbackHeadLabel,
    onActivate,
  } = options;

  const avatarSources = await Promise.all(
    characters.map(async (character) => await resolveAvatarSource(character))
  );
  if (isStale?.() === true) {
    return;
  }
  const fragment = document.createDocumentFragment();

  characters.forEach((character, index) => {
    const avatarSource = avatarSources[index] ?? null;
    const depth = Number.isFinite(character.depth) ? Math.max(1, character.depth) : 1;
    const node = document.createElement("div");
    const customId = getNodeId?.(character) ?? null;
    if (customId !== null) {
      node.id = customId;
    }
    node.className = getNodeClassName(character);
    if (menuOpenCharacterId === character.id) {
      node.classList.add("is-menu-open");
    }
    if (character.slot !== null) {
      node.dataset["slot"] = character.slot;
    }
    node.dataset["characterId"] = character.id;
    node.dataset["kind"] = character.kind;
    node.dataset["role"] = character.role;
    node.dataset["variant"] = character.variant;
    node.dataset["anchorId"] = character.anchorId;
    node.classList.toggle("is-selected", selectedCharacterId === character.anchorId);
    node.style.setProperty(
      "--scene-character-left",
      `${projection.offsetX + character.leftPx * projection.scale}px`
    );
    node.style.setProperty(
      "--scene-character-bottom",
      `${projection.offsetY + character.bottomPx * projection.scale}px`
    );
    node.style.setProperty("--scene-character-scale", String(character.scale));
    node.style.setProperty("--scene-character-depth", String(depth));
    node.style.setProperty("--scene-character-depth-scale", String(getDepthScale(depth)));
    node.style.setProperty("--scene-character-body-scale", String(character.bodyScale));
    node.style.setProperty("--scene-character-head-top", `${character.headTopPct}%`);
    node.style.setProperty("--scene-character-head-left", `${character.headLeftPct}%`);
    node.style.setProperty("--scene-character-head-size", `${character.headSizePct}%`);
    node.style.setProperty("--scene-character-avatar-scale", String(character.avatarScale));

    if (interactive) {
      node.tabIndex = 0;
      node.role = "button";
      node.setAttribute("aria-label", character.label);
    } else {
      node.tabIndex = -1;
      node.removeAttribute("role");
      node.removeAttribute("aria-label");
    }

    const stage = document.createElement("div");
    stage.className = "entrance-scene__character-stage";

    const body = document.createElement("img");
    body.className = "entrance-scene__character-body";
    body.src = character.bodySrc;
    body.alt = "";
    body.ariaHidden = "true";
    stage.appendChild(body);

    const head = document.createElement("span");
    head.className = "entrance-scene__character-head";
    head.ariaHidden = "true";
    if (avatarSource !== null) {
      const avatar = document.createElement("img");
      avatar.className = "entrance-scene__character-avatar";
      avatar.src = avatarSource;
      avatar.alt = "";
      avatar.ariaHidden = "true";
      head.appendChild(avatar);
    } else {
      const fallback = document.createElement("span");
      fallback.className = "entrance-scene__character-head-fallback";
      fallback.ariaHidden = "true";
      fallback.textContent = getFallbackHeadLabel(character);
      head.appendChild(fallback);
    }
    stage.appendChild(head);

    const label = document.createElement("span");
    label.className = "entrance-scene__character-label";
    label.textContent = character.label;

    const anchorMarker = document.createElement("span");
    anchorMarker.className = "entrance-scene__character-anchor-marker";
    anchorMarker.ariaHidden = String(!sceneDebugEnabled);
    anchorMarker.textContent = character.anchorId;

    node.append(stage, label, anchorMarker);
    node.addEventListener("click", () => {
      onActivate(character, node);
    });
    node.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      onActivate(character, node);
    });
    fragment.appendChild(node);
  });

  layer.replaceChildren(fragment);
}
