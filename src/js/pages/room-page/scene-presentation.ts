import type { InstalledRoomFeatureRecord, InstalledRoomRecord } from "@shared/index.js";
import type { SceneClickableThemeDefinition } from "../../scene/schema.js";
import type { SceneObjectConfig } from "../../scene/layout/index.js";
import { renderSceneBackLayer } from "../../scene/renderers/back-layer.js";
import { renderSceneObjectLayer } from "../../scene/renderers/object-layer.js";
import {
  buildRoomBackNode,
  buildRoomSceneObject,
  buildRoomSceneViewBackNode,
  buildStandardSceneViewBackButton,
  resolveSceneTextValue,
} from "./scene-helpers.js";
import {
  applyRoomSceneImageSource,
  applyRoomSceneRuntimeFrame,
  getRoomSceneProjection,
} from "./scene-render-runtime.js";

interface RenderRoomSceneHotspotsParams {
  page: HTMLElement;
  referenceSize: { width: number; height: number };
  room: InstalledRoomRecord;
  sceneClickableTheme: SceneClickableThemeDefinition;
  onActivateFeature: (featureId: string) => void;
}

export function renderRoomSceneHotspots({
  onActivateFeature,
  page,
  referenceSize,
  room,
  sceneClickableTheme,
}: RenderRoomSceneHotspotsParams): void {
  const layer = page.querySelector<HTMLElement>("[data-room-role='scene-hotspots']");
  const host = page.querySelector<HTMLElement>("[data-room-role='scene-room']");
  if (layer === null || host === null) {
    return;
  }

  const projection = getRoomSceneProjection(host, referenceSize);
  const nodes = room.features
    .map((feature) => buildRoomSceneObject(feature))
    .filter((node): node is SceneObjectConfig => node !== null);

  renderSceneObjectLayer({
    layer,
    nodes,
    themeDefaults: sceneClickableTheme.object,
    projection,
    cssVarPrefix: "scene-hotspot",
    classNames: {
      item: "room-scene__hotspot-item",
      button: "room-scene__hotspot",
      label: "room-scene__hotspot-label",
    },
    selection: null,
    clickableLabels: true,
    resolveLabel: (node) => {
      const feature = room.features.find((item) => item.scene?.hotspot.id === node.id) ?? null;
      return feature?.name ?? node.id;
    },
    onActivate: (node) => {
      const feature = room.features.find((item) => item.scene?.hotspot.id === node.id) ?? null;
      if (feature !== null) {
        onActivateFeature(feature.id);
      }
    },
  });
}

interface RenderRoomSceneBackParams {
  page: HTMLElement;
  referenceSize: { width: number; height: number };
  room: InstalledRoomRecord;
  sceneClickableTheme: SceneClickableThemeDefinition;
  backToRoomsLabel: string;
  onBackToRooms: () => void;
}

export function renderRoomSceneBack({
  backToRoomsLabel,
  onBackToRooms,
  page,
  referenceSize,
  room,
  sceneClickableTheme,
}: RenderRoomSceneBackParams): void {
  const host = page.querySelector<HTMLElement>("[data-room-role='scene-room-back-host']");
  const sceneRoom = page.querySelector<HTMLElement>("[data-room-role='scene-room']");
  if (host === null || sceneRoom === null) {
    return;
  }

  renderSceneBackLayer({
    host,
    node: buildRoomBackNode(room, {
      idSuffix: "-room-return",
      viewId: "room",
      fallbackLabel: backToRoomsLabel,
    }),
    themeDefaults: sceneClickableTheme.back,
    projection: getRoomSceneProjection(sceneRoom, referenceSize),
    resolveLabel: (node) => resolveSceneTextValue(room.scene?.backHotspot.label, node.id),
    onActivate: onBackToRooms,
  });
}

interface RenderRoomSceneViewParams {
  backButtonVariant: "scene-back-layer" | "standard-button";
  closeLabel: string;
  feature: InstalledRoomFeatureRecord;
  page: HTMLElement;
  referenceSize: { width: number; height: number };
  room: InstalledRoomRecord;
  sceneClickableTheme: SceneClickableThemeDefinition;
  sceneDebugEnabled: boolean;
  onCloseFeatureView: () => void;
  refreshEditor: () => void;
  ensureStandardBackHost: (page: HTMLElement, view: HTMLElement) => HTMLElement;
  getStandardBackHost: (page: HTMLElement) => HTMLElement | null;
}

export function renderRoomSceneView({
  backButtonVariant,
  closeLabel,
  ensureStandardBackHost,
  feature,
  getStandardBackHost,
  onCloseFeatureView,
  page,
  referenceSize,
  room,
  sceneClickableTheme,
  sceneDebugEnabled,
  refreshEditor,
}: RenderRoomSceneViewParams): void {
  const view = page.querySelector<HTMLElement>("[data-room-role='scene-view']");
  const background = page.querySelector<HTMLImageElement>(
    "[data-room-role='scene-view-background']"
  );
  const panelArt = page.querySelector<HTMLImageElement>("[data-room-role='scene-view-panel-art']");
  const backHost = page.querySelector<HTMLElement>("[data-room-role='scene-back-host']");
  const runtimeSlot = page.querySelector<HTMLElement>("[data-room-role='scene-runtime-slot']");

  if (
    feature.scene === undefined ||
    view === null ||
    background === null ||
    panelArt === null ||
    backHost === null ||
    runtimeSlot === null
  ) {
    return;
  }

  applyRoomSceneImageSource({
    image: background,
    sourcePath: feature.scene.view.backgroundPath,
    refreshEditor: sceneDebugEnabled,
    onRefreshEditor: refreshEditor,
  });
  background.alt = "";

  if (feature.scene.view.panelArtPath !== undefined) {
    panelArt.hidden = false;
    applyRoomSceneImageSource({
      image: panelArt,
      sourcePath: feature.scene.view.panelArtPath,
    });
    panelArt.alt = "";
  } else {
    panelArt.hidden = true;
    delete panelArt.dataset["roomAssetSourcePath"];
    panelArt.removeAttribute("src");
  }

  applyRoomSceneRuntimeFrame(runtimeSlot, feature);

  if (backButtonVariant === "standard-button") {
    const standardBackHost = ensureStandardBackHost(page, view);
    backHost.replaceChildren();
    const button = buildStandardSceneViewBackButton(closeLabel);
    button.addEventListener("click", onCloseFeatureView);
    standardBackHost.replaceChildren(button);
    return;
  }

  getStandardBackHost(page)?.remove();
  renderSceneBackLayer({
    host: backHost,
    node: buildRoomSceneViewBackNode(room),
    themeDefaults: sceneClickableTheme.back,
    projection: getRoomSceneProjection(view, referenceSize),
    resolveLabel: (node) => node.label.customText?.trim() ?? closeLabel,
    onActivate: onCloseFeatureView,
  });
}
