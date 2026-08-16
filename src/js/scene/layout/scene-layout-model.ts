import type {
  SceneBackNodeDefinition,
  SceneCharacterKind,
  SceneCharacterPlacementNodeDefinition,
  SceneCharacterSlot,
  SceneObjectNodeDefinition,
  SceneLayoutDefinition,
  SceneNodeDefinition,
  SceneNodeKind,
  SceneRoomDefinition,
  SceneRoomId,
} from "../schema.js";
import { SCENE_LABEL_FONT_PRESETS } from "../schema.js";

export const SCENE_LAYOUT_LABEL_FONT_PRESETS = SCENE_LABEL_FONT_PRESETS;

export type SceneLayoutLabelFontPreset = (typeof SCENE_LAYOUT_LABEL_FONT_PRESETS)[number];
export type SceneObjectConfig = SceneObjectNodeDefinition;

export type SceneBackConfig = SceneBackNodeDefinition;

export interface SceneCharacterPlacementConfig extends SceneCharacterPlacementNodeDefinition {
  characterKind: SceneCharacterKind;
  preferredSlot?: SceneCharacterSlot;
}

export interface SceneLayoutConfig extends SceneLayoutDefinition {
  objects: SceneObjectConfig[];
  backs: SceneBackConfig[];
  characters: SceneCharacterPlacementConfig[];
}

export type SceneDebugSelectableNodeKind = SceneNodeKind;

export type SceneDebugNodeSelection = {
  kind: SceneDebugSelectableNodeKind;
  id: string;
} | null;

export interface SceneDebugNodeListEntry {
  kind: SceneDebugSelectableNodeKind;
  id: string;
  label: string;
  viewId?: string | null;
}

export function getSceneObjectNodesForView(
  sceneLayout: SceneLayoutConfig,
  viewId: string | null = null
): SceneObjectConfig[] {
  return sceneLayout.objects.filter((sceneObject) => sceneObject.viewId === viewId);
}

export function getSceneBackNodeForView(
  sceneLayout: SceneLayoutConfig,
  viewId: string
): SceneBackConfig | null {
  return sceneLayout.backs.find((back) => back.viewId === viewId) ?? null;
}

export function hasSceneNodeLabel(node: SceneObjectConfig | SceneBackConfig): boolean {
  if (!node.label.visible) {
    return false;
  }

  return node.label.textKey !== "" || (node.label.customText?.trim() ?? "") !== "";
}

function getSceneDebugNodeLabel(
  node: SceneObjectConfig | SceneBackConfig | SceneCharacterPlacementConfig
): string {
  if (node.kind === "character") {
    return node.id;
  }

  const customLabel = node.label.customText?.trim() ?? "";
  if (customLabel !== "") {
    return customLabel;
  }

  if (node.label.textKey !== "") {
    return node.label.textKey;
  }

  return node.id;
}

export function resolveSceneNodeLabelText(
  node: SceneObjectConfig | SceneBackConfig,
  translate: (key: string) => string
): string {
  const customLabel = node.label.customText?.trim() ?? "";
  if (customLabel !== "") {
    return customLabel;
  }

  if (node.label.textKey !== "") {
    return translate(node.label.textKey);
  }

  return node.id;
}

export function buildSceneNodesFromLayout(sceneLayout: SceneLayoutConfig): SceneNodeDefinition[] {
  return [...sceneLayout.objects, ...sceneLayout.backs, ...sceneLayout.characters];
}

export function listSceneDebugNodes(sceneLayout: SceneLayoutConfig): SceneDebugNodeListEntry[] {
  return buildSceneNodesFromLayout(sceneLayout).map((node) => ({
    kind: node.kind,
    id: node.id,
    label: getSceneDebugNodeLabel(
      node as SceneObjectConfig | SceneBackConfig | SceneCharacterPlacementConfig
    ),
    ...("viewId" in node ? { viewId: node.viewId } : {}),
  }));
}

export function resolveSceneObjectForSelection(
  sceneLayout: SceneLayoutConfig,
  selection: SceneDebugNodeSelection
): SceneObjectConfig | null {
  if (selection?.kind !== "object") {
    return null;
  }

  return sceneLayout.objects.find((sceneObject) => sceneObject.id === selection.id) ?? null;
}

export function resolveSceneBackForSelection(
  sceneLayout: SceneLayoutConfig,
  selection: SceneDebugNodeSelection
): SceneBackConfig | null {
  if (selection?.kind !== "back") {
    return null;
  }

  return sceneLayout.backs.find((back) => back.id === selection.id) ?? null;
}

export function resolveSceneCharacterForSelection(
  sceneLayout: SceneLayoutConfig,
  selection: SceneDebugNodeSelection
): SceneCharacterPlacementConfig | null {
  if (selection?.kind !== "character") {
    return null;
  }

  return sceneLayout.characters.find((character) => character.id === selection.id) ?? null;
}

export function isSceneDebugSelectionForObject(
  selection: SceneDebugNodeSelection,
  sceneObject: SceneObjectConfig
): boolean {
  return selection?.kind === "object" && selection.id === sceneObject.id;
}

export function buildSceneRoomDefinition(
  roomId: SceneRoomId,
  sceneLayout: SceneLayoutConfig
): SceneRoomDefinition {
  return {
    id: roomId,
    page: roomId,
    referenceSize: {
      width: sceneLayout.referenceSize.width,
      height: sceneLayout.referenceSize.height,
    },
    nodes: buildSceneNodesFromLayout(sceneLayout),
  };
}
