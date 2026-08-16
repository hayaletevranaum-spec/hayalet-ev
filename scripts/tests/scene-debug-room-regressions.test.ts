import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { createRoomInstalledCopy } from "./helpers/room-installed-copy.ts";

import {
  buildSceneRoomDefinition,
  cloneSceneLayout,
  getSceneBackNodeForView,
  listSceneDebugNodes,
} from "../../src/js/scene/layout/index.ts";
import { getSceneRoomLayout } from "../../src/js/scene-system/scene-layout-registry.ts";

interface RoomManifestFeature {
  id: string;
  scene?: {
    hotspot: { id: string };
    view: { id: string; backgroundSrc: string };
  };
}

interface RoomManifest {
  features?: RoomManifestFeature[];
  workbench?: { experienceId: string };
}

const entranceSceneLayout = getSceneRoomLayout("entrance");
const assistantSceneLayout = getSceneRoomLayout("assistant");
const analyzeSceneLayout = getSceneRoomLayout("analyze");
const settingsSceneLayout = getSceneRoomLayout("settings");
const serverSceneLayout = getSceneRoomLayout("server");
const roomsSceneLayout = getSceneRoomLayout("rooms");

void test("scene debug room registry includes all unified scene rooms", () => {
  const roomRegistrySource = readFileSync("src/js/scene-editor/scene-debug-room-registry.ts", "utf8");

  assert.match(roomRegistrySource, /const SCENE_DEBUG_ROOM_LABEL_KEYS/);
  assert.match(roomRegistrySource, /entrance:\s*"sideNav\.entranceLabel"/);
  assert.match(roomRegistrySource, /analyze:\s*"sideNav\.analyzeLabel"/);
  assert.match(roomRegistrySource, /assistant:\s*"sideNav\.assistantLabel"/);
  assert.match(roomRegistrySource, /server:\s*"sideNav\.serverLabel"/);
  assert.match(roomRegistrySource, /rooms:\s*"sideNav\.roomsLabel"/);
  assert.match(roomRegistrySource, /settings:\s*"settingsHub\.openButton"/);
  assert.match(roomRegistrySource, /export const SCENE_DEBUG_ROOMS/);
  assert.doesNotMatch(roomRegistrySource, /export const SCENE_EDITOR_ROOMS/);
  assert.match(roomRegistrySource, /SCENE_ROOM_IDS\.map/);
  assert.match(roomRegistrySource, /export function getSceneDebugRoomOptions/);
  assert.match(roomRegistrySource, /export function getSceneEditorRoomOptions/);
  assert.match(roomRegistrySource, /export function openSceneEditorRoom/);
});

void test("scene debug room registry derives installed room options from room metadata", () => {
  const roomRegistrySource = readFileSync("src/js/scene-editor/scene-debug-room-registry.ts", "utf8");

  assert.match(roomRegistrySource, /function getInstalledSceneDebugRooms\(\)/);
  assert.match(roomRegistrySource, /RoomRegistry\.getInstalledRooms\(\)/);
  assert.match(roomRegistrySource, /\.filter\(\(room\) => room\.scene !== undefined\)/);
  assert.match(roomRegistrySource, /const page = getRoomPageName\(room\.id\)/);
  assert.match(roomRegistrySource, /label:\s*room\.name/);
  assert.match(roomRegistrySource, /return \[\.\.\.SCENE_DEBUG_ROOMS, \.\.\.getInstalledSceneDebugRooms\(\)\]\.map/);
});

void test("room scene debug helpers merge installed room hotspots into the corridor layout", () => {
  const source = readFileSync("src/js/modules/rooms/room-scene-debug.ts", "utf8");

  assert.match(source, /function mergeRoomsCorridorLayout/);
  assert.match(source, /buildInstalledRoomCorridorNode\(room\)/);
  assert.match(source, /const installedNodes = normalizeInstalledRooms\(rooms\)/);
  assert.match(source, /createRoomsCorridorSceneDebugStore/);
  assert.match(source, /type:\s*"screen"/);
  assert.match(source, /screen:\s*"primary"/);
  assert.match(source, /return room\.scene\?\.characterRosterPreset \?\? "all-characters";/);
  assert.match(source, /return \[\];/);
  assert.doesNotMatch(source, /room\.id !== "game-room"/);
  assert.doesNotMatch(source, /room\.id === "game-room"/);
});

void test("entrance scene layout keeps room targets and whisper return in one layout registry", () => {
  assert.deepEqual(
    entranceSceneLayout.objects.map((node) => node.id),
    ["door-analyze", "door-assistant", "door-server", "door-settings", "hatch-rooms", "board-whisper"]
  );
  assert.equal(getSceneBackNodeForView(entranceSceneLayout, "whisper")?.id, "back-whisper");
  assert.equal(
    entranceSceneLayout.objects.find((node) => node.id === "board-whisper")?.action.type,
    "whisper"
  );

  const originalWhisperLeft =
    entranceSceneLayout.objects.find((node) => node.id === "board-whisper")?.rect.leftPx;
  const cloned = cloneSceneLayout(entranceSceneLayout);
  (cloned.objects.find((node) => node.id === "board-whisper") as { rect: { leftPx: number; widthPx?: number } }).rect.leftPx = 408;
  (cloned.backs.find((node) => node.id === "back-whisper") as { rect: { leftPx?: number; widthPx: number } }).rect.widthPx = 140;

  assert.equal(
    entranceSceneLayout.objects.find((node) => node.id === "board-whisper")?.rect.leftPx,
    originalWhisperLeft
  );
  assert.equal(cloned.objects.find((node) => node.id === "board-whisper")?.rect.leftPx, 408);
  assert.equal(cloned.backs.find((node) => node.id === "back-whisper")?.rect.widthPx, 140);
});

void test("assistant scene layout uses objects plus one view-scoped back node", () => {
  assert.deepEqual(
    assistantSceneLayout.objects.map((node) => node.id),
    ["door-entrance", "screen-primary"]
  );
  assert.equal(getSceneBackNodeForView(assistantSceneLayout, "primary")?.id, "back-primary");
  assert.deepEqual(assistantSceneLayout.characters.map((node) => node.id), ["anchor-ai0"]);
});

void test("analyze scene layout keeps table and archive returns on the shared contract", () => {
  assert.deepEqual(
    analyzeSceneLayout.objects.map((node) => node.id),
    ["door-entrance", "screen-primary", "screen-archive"]
  );
  assert.equal(getSceneBackNodeForView(analyzeSceneLayout, "table")?.id, "back-table");
  assert.equal(getSceneBackNodeForView(analyzeSceneLayout, "archive")?.id, "back-archive");

  const room = buildSceneRoomDefinition("analyze", analyzeSceneLayout);
  assert.equal(room.id, "analyze");
  assert.ok(room.nodes.some((node) => node.kind === "object" && node.id === "screen-primary"));
  assert.ok(room.nodes.some((node) => node.kind === "back" && node.id === "back-table"));
  assert.ok(room.nodes.some((node) => node.kind === "character" && node.id === "anchor-ai1-primary"));
});

void test("settings scene layout defines close, panels, one back, and one user character", () => {
  assert.deepEqual(
    settingsSceneLayout.objects.map((node) => node.id),
    [
      "door-close",
      "panel-theme",
      "panel-accounts",
      "panel-capture",
      "panel-backup",
      "panel-rooms",
      "panel-live-log",
      "panel-languages",
    ]
  );
  assert.equal(settingsSceneLayout.objects[0]?.action.type, "settings-scene-close");
  assert.equal(getSceneBackNodeForView(settingsSceneLayout, "panel")?.id, "back-panel");
  assert.deepEqual(settingsSceneLayout.characters.map((node) => node.id), ["anchor-user"]);
});

void test("server scene layout stays on the same contract with one back node", () => {
  assert.deepEqual(
    serverSceneLayout.objects.map((node) => node.id),
    ["door-entrance", "screen-primary"]
  );
  assert.equal(getSceneBackNodeForView(serverSceneLayout, "primary")?.id, "back-primary");
  assert.deepEqual(
    serverSceneLayout.characters.map((node) => node.id),
    ["anchor-ai1-primary", "anchor-ai2-primary"]
  );
});

void test("rooms scene layout ships with one object entrance and no extra nodes", () => {
  assert.deepEqual(roomsSceneLayout.objects.map((node) => node.id), ["door-entrance"]);
  assert.deepEqual(roomsSceneLayout.backs, []);
  assert.deepEqual(roomsSceneLayout.characters, []);

  const room = buildSceneRoomDefinition("rooms", roomsSceneLayout);
  assert.equal(room.id, "rooms");
  assert.deepEqual(room.nodes.map((node) => node.kind), ["object"]);
});

void test("scene editor renders unified section labels", () => {
  const editorSource = readFileSync("src/js/scene-editor/scene-layout-editor.ts", "utf8");
  assert.match(editorSource, /data-editor-action="room"/);
  assert.match(editorSource, /data-editor-action="save-source"/);
  assert.match(editorSource, /data-editor-action="save-theme"/);
  assert.match(editorSource, /entrance-scene__editor-room-list/);
  assert.match(editorSource, /Drafts stay local until you save the room layout or theme defaults\./);
  assert.match(editorSource, /Save Layout/);
  assert.match(editorSource, /Save Theme/);
  assert.match(editorSource, /Objects/);
  assert.match(editorSource, /Backs/);
  assert.match(editorSource, /Characters/);
  assert.match(editorSource, /Theme Defaults/);
  assert.doesNotMatch(editorSource, /Interactives/);
  assert.doesNotMatch(editorSource, /Objects\/Backs/);
  assert.equal(existsSync("src/js/pages/entrance/scene/scene-editor.ts"), false);
  assert.equal(existsSync("src/js/scene/debug"), false);
});

void test("scene pages enable clickable labels and shared clickable classes", () => {
  const controllerTargets = [
    "src/js/pages/entrance/scene/scene-controller.ts",
    "src/js/pages/analyze.ts",
    "src/js/pages/assistant/assistant.ts",
    "src/js/pages/server.ts",
    "src/js/pages/settings/controller.ts",
    "src/js/pages/rooms.ts",
  ];
  const objectLayerSource = readFileSync("src/js/scene/renderers/object-layer.ts", "utf8");
  const backLayerSource = readFileSync("src/js/scene/renderers/back-layer.ts", "utf8");
  const clickableCssSource = readFileSync("src/styles/scene-system/clickable.css", "utf8");
  const entranceCssSource = readFileSync("src/styles/entrance/scene.css", "utf8");

  controllerTargets.forEach((target) => {
    const source = readFileSync(target, "utf8");
    assert.match(source, /clickableLabels:\s*true/);
    assert.match(source, /createSceneDebugRuntimeSession\(/);
    assert.match(source, /getSceneClickableTheme:/);
    assert.match(source, /themeDefaults:/);
    assert.doesNotMatch(source, /createSceneDebugStore\(/);
    assert.doesNotMatch(source, /createSceneDebugThemeStore\(/);
  });
  assert.match(objectLayerSource, /clickableLabels\?: boolean/);
  assert.match(objectLayerSource, /themeDefaults:\s*SceneObjectClickableThemeDefinition/);
  assert.match(objectLayerSource, /resolveSceneObjectGlow/);
  assert.match(objectLayerSource, /scene-clickable__button--object/);
  assert.match(objectLayerSource, /scene-clickable__label--object/);
  assert.match(backLayerSource, /themeDefaults:\s*SceneBackClickableThemeDefinition/);
  assert.match(backLayerSource, /resolveSceneBackGlow/);
  assert.match(backLayerSource, /scene-clickable__button--back/);
  assert.match(backLayerSource, /scene-clickable__label--back/);
  assert.doesNotMatch(backLayerSource, /scene-back-zone/);
  assert.match(objectLayerSource, /label\.dataset\["clickable"\]\s*=\s*"true"/);
  assert.match(objectLayerSource, /label\.tabIndex = 0/);
  assert.match(clickableCssSource, /\.scene-clickable__button/);
  assert.match(clickableCssSource, /\.scene-clickable__label/);
  assert.match(clickableCssSource, /\.scene-clickable__button--back/);
  assert.match(clickableCssSource, /scene-clickable-back-arrow-shift/);
  assert.match(clickableCssSource, /\.scene-clickable__label\[data-clickable="true"\]/);
  assert.match(entranceCssSource, /\.entrance-scene \.entrance-scene__character \{\s*pointer-events: none;/s);
  assert.match(entranceCssSource, /\.entrance-scene \.entrance-scene__character-head,[\s\S]*pointer-events: auto;/);
});

void test("installed laboratory manifest exposes one workbench hotspot while legacy features stay scene-passive", async () => {
  const installedCopy = await createRoomInstalledCopy("laboratory");

  try {
    const manifest = JSON.parse(readFileSync(`${installedCopy.rootDir}/manifest.json`, "utf8")) as RoomManifest;
    const mediaFeature = manifest.features?.find((feature) => feature.id === "media-analysis");
    const audioFeature = manifest.features?.find((feature) => feature.id === "audio-analysis");

    assert.ok(mediaFeature, "media-analysis feature should exist");
    assert.ok(mediaFeature.scene, "media-analysis feature should have a scene");
    assert.equal(manifest.workbench?.experienceId, "analysis-workbench");
    assert.equal(mediaFeature.scene.hotspot.id, "laboratory-media-analysis");
    assert.equal(mediaFeature.scene.view.id, "media-analysis-console");
    assert.equal(
      mediaFeature.scene.view.backgroundSrc,
      "features/media-analysis/assets/media-analysis-view.webp"
    );
    assert.equal(audioFeature?.scene, undefined);
  } finally {
    await installedCopy.cleanup();
  }
});

void test("game-room manifest exposes Team Tetris scene hotspot ids for scene debug visibility", () => {
  const manifest = JSON.parse(readFileSync("rooms/game-room/manifest.json", "utf8")) as RoomManifest;
  const feature = manifest.features?.find((entry) => entry.id === "team-tetris");

  assert.ok(feature, "team-tetris feature should exist");
  assert.ok(feature.scene, "team-tetris feature should have a scene");
  assert.equal(feature.scene.hotspot.id, "game-room-team-tetris");
  assert.equal(feature.scene.view.id, "team-tetris-closeup");
  assert.equal(
    feature.scene.view.backgroundSrc,
    "main-functions/team-tetris/assets/team-tetris-view.webp"
  );
});

void test("entrance and analyze scene layers keep hidden views passive in debug mode", () => {
  const entranceHtmlSource = readFileSync("src/pages/entrance.html", "utf8");
  const analyzeCssSource = readFileSync("src/styles/analyze.css", "utf8");
  const entranceCssSource = readFileSync("src/styles/entrance/scene.css", "utf8");
  const debugOverridesSource = readFileSync("src/styles/scene-editor/debug-overrides.css", "utf8");

  assert.match(entranceHtmlSource, /entrance-scene__room-layer scene-shell__room-layer/);
  assert.match(entranceCssSource, /\.entrance-scene__room-layer\s*\{/);
  assert.match(entranceCssSource, /\.entrance-scene__hotspots\s*\{\s*z-index:\s*2;[\s\S]*pointer-events:\s*none;/);
  assert.match(entranceCssSource, /\.entrance-scene__view-slot\s*\{[\s\S]*pointer-events:\s*none;/);
  assert.match(
    entranceCssSource,
    /\.entrance-scene__view\.is-active \.entrance-scene__view-slot\s*\{[\s\S]*pointer-events:\s*auto;/
  );
  assert.match(analyzeCssSource, /\.analyze-scene__panel-slot\s*\{[\s\S]*pointer-events:\s*none;/);
  assert.match(
    analyzeCssSource,
    /\.analyze-scene__table-view\.is-active \.analyze-scene__panel-slot\s*\{[\s\S]*pointer-events:\s*auto;/
  );
  assert.match(
    debugOverridesSource,
    /:is\(\[data-scene-editor="true"\], \[data-scene-debug="true"\]\)[\s\S]*\.entrance-scene[\s\S]*\.entrance-scene__character,[\s\S]*pointer-events:\s*none;/
  );
  assert.match(
    debugOverridesSource,
    /:is\(\[data-scene-editor="true"\], \[data-scene-debug="true"\]\)[\s\S]*\.analyze-scene[\s\S]*\.entrance-scene__character-head,[\s\S]*pointer-events:\s*auto;/
  );
});

void test("scene debug node list exposes object, back, and character nodes", () => {
  const entranceNodes = listSceneDebugNodes(entranceSceneLayout);
  const analyzeNodes = listSceneDebugNodes(analyzeSceneLayout);
  const roomsNodes = listSceneDebugNodes(roomsSceneLayout);

  assert.ok(entranceNodes.some((node) => node.kind === "object" && node.id === "door-analyze"));
  assert.ok(entranceNodes.some((node) => node.kind === "back" && node.id === "back-whisper"));
  assert.ok(entranceNodes.some((node) => node.kind === "character" && node.id === "anchor-assistant"));
  assert.ok(analyzeNodes.some((node) => node.kind === "object" && node.id === "screen-archive"));
  assert.ok(analyzeNodes.some((node) => node.kind === "back" && node.id === "back-archive"));
  assert.ok(analyzeNodes.some((node) => node.kind === "character" && node.id === "anchor-ai1-primary"));
  assert.ok(roomsNodes.some((node) => node.kind === "object" && node.id === "door-entrance"));
  assert.ok(roomsNodes.every((node) => node.kind !== "character"));
});
