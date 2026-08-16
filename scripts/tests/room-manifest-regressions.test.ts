import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ROOM_SCHEMA_VERSION,
  isValidRoomCommandName,
  isValidRoomId,
  normalizeRoomRelativePath,
  resolveRoomProtocolFilePath,
  validateRoomManifest,
} from "../../src/types/rooms.ts";

void test("validateRoomManifest accepts a minimal valid room manifest", () => {
  const result = validateRoomManifest({
    schemaVersion: ROOM_SCHEMA_VERSION,
    id: "game-room",
    name: "Game Room",
    version: "2.1.0",
    menu: {
      label: "Game Room",
      icon: "GM",
      iconSrc: "assets/nav-icon.svg",
    },
    runtime: {
      uiEntry: "ui/index.html",
      hostEntry: "host/index.js",
    },
    defaultFeatureId: "backgammon",
    features: [
      {
        id: "backgammon",
        name: "Tavla",
        commandSpecs: [{ name: "GameRoomBackgammonAiMove", scope: "ai-slots" }],
        protocolSpecs: [
          {
            key: "game-room-backgammon-user-start",
            room: "game-room",
            scenario: "backgammon-user-start",
            title: "[START][GAME-ROOM][Tavla][USER-FIRST]",
            editable: true,
          },
        ],
        scene: {
          hotspot: {
            id: "game-room-backgammon",
            rect: { leftPx: 100, topPx: 200, widthPx: 180, heightPx: 120 },
            label: { text: "Tavla" },
          },
          view: {
            id: "backgammon-closeup",
            backgroundSrc: "assets/backgammon-view.webp",
          },
        },
      },
    ],
    scene: {
      referenceSize: { width: 1600, height: 900 },
      roomBackgroundSrc: "assets/room-background.webp",
      roomsHotspot: {
        id: "game-room-door",
        rect: { leftPx: 700, topPx: 240, widthPx: 160, heightPx: 300 },
      },
      backHotspot: {
        id: "game-room-back",
        rect: { leftPx: 70, topPx: 180, widthPx: 120, heightPx: 240 },
      },
    },
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.manifest?.id, "game-room");
  assert.equal(result.manifest.menu.iconSrc, "assets/nav-icon.svg");
  assert.equal(result.manifest.runtime.uiEntry, "ui/index.html");
  assert.equal(result.manifest.defaultFeatureId, "backgammon");
});

void test("validateRoomManifest rejects invalid ids, commands, and unsafe paths", () => {
  const result = validateRoomManifest({
    schemaVersion: ROOM_SCHEMA_VERSION,
    id: "Game Room",
    name: "Bad Room",
    version: "1.0",
    menu: {
      label: "Bad",
      iconSrc: "../escape.svg",
    },
    runtime: {
      uiEntry: "../ui/index.html",
      hostEntry: "/host/index.js",
    },
    defaultFeatureId: "broken",
    features: [
      {
        id: "broken",
        name: "Broken",
        commandSpecs: [{ name: "Game.Room" }],
      },
    ],
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /id must match/);
  assert.match(result.errors.join("\n"), /version must look like semver/);
  assert.match(result.errors.join("\n"), /runtime\.uiEntry must be a safe relative path/);
  assert.match(result.errors.join("\n"), /runtime\.hostEntry must be a safe relative path/);
  assert.match(result.errors.join("\n"), /menu\.iconSrc must be a safe relative path/);
  assert.match(result.errors.join("\n"), /commandSpecs\[0\]\.name must match/);
});

void test("validateRoomManifest allows workbench rooms to keep scene entries only for visible entry features", () => {
  const result = validateRoomManifest({
    schemaVersion: ROOM_SCHEMA_VERSION,
    id: "laboratory",
    name: "Laboratory",
    version: "1.0.0",
    menu: {
      label: "Laboratory",
      icon: "LB",
    },
    runtime: {
      uiEntry: "ui/index.html",
      hostEntry: "host/index.js",
    },
    defaultFeatureId: "media-analysis",
    workbench: {
      experienceId: "analysis-workbench",
      primaryFeatureId: "media-analysis",
      availableFeatureIds: ["media-analysis", "audio-analysis"],
    },
    features: [
      {
        id: "media-analysis",
        name: "Analysis Workbench",
        scene: {
          hotspot: {
            id: "laboratory-media-analysis",
            rect: { leftPx: 100, topPx: 200, widthPx: 180, heightPx: 120 },
            label: { text: "Analysis Workbench" },
          },
          view: {
            id: "media-analysis-console",
            backgroundSrc: "features/media-analysis/assets/media-analysis-view.webp",
          },
        },
      },
      {
        id: "audio-analysis",
        name: "Audio Analysis",
      },
    ],
    scene: {
      referenceSize: { width: 1600, height: 900 },
      roomBackgroundSrc: "assets/room-background.webp",
      roomsHotspot: {
        id: "laboratory-door",
        rect: { leftPx: 700, topPx: 240, widthPx: 160, heightPx: 300 },
      },
      backHotspot: {
        id: "laboratory-back",
        rect: { leftPx: 70, topPx: 180, widthPx: 120, heightPx: 240 },
      },
    },
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.manifest?.workbench?.experienceId, "analysis-workbench");
  assert.equal(
    result.manifest.features.find((feature) => feature.id === "audio-analysis")?.scene,
    undefined
  );
});

void test("normalizeRoomRelativePath blocks traversal and preserves safe paths", () => {
  assert.equal(normalizeRoomRelativePath("ui/index.html"), "ui/index.html");
  assert.equal(normalizeRoomRelativePath("ui\\index.html"), "ui/index.html");
  assert.equal(normalizeRoomRelativePath("../escape.js"), null);
  assert.equal(normalizeRoomRelativePath("/absolute/file.js"), null);
});

void test("protocol specs support explicit safe relative paths", () => {
  const result = validateRoomManifest({
    schemaVersion: ROOM_SCHEMA_VERSION,
    id: "protocol-room",
    name: "Protocol Room",
    version: "1.0.0",
    menu: {
      label: "Protocol Room",
    },
    runtime: {
      uiEntry: "ui/index.html",
      hostEntry: "host/index.js",
    },
    defaultFeatureId: "primary",
    features: [
      {
        id: "primary",
        name: "Primary",
        protocolSpecs: [
          {
            key: "primary-start",
            room: "protocol-room",
            scenario: "primary-start",
            title: "[START][PROTOCOL-ROOM][PRIMARY]",
            path: "main-functions/primary/protocols/primary-start.md",
          },
        ],
      },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(
    result.manifest?.features[0]?.protocolSpecs?.[0]?.path,
    "main-functions/primary/protocols/primary-start.md"
  );
  assert.equal(
    resolveRoomProtocolFilePath(result.manifest.features[0].protocolSpecs[0]),
    "main-functions/primary/protocols/primary-start.md"
  );
});

void test("room id and command validators match project rules", () => {
  assert.equal(isValidRoomId("game-room"), true);
  assert.equal(isValidRoomId("game_room"), false);
  assert.equal(isValidRoomCommandName("GameRoomStartMatch"), true);
  assert.equal(isValidRoomCommandName("Game.Room"), false);
});

void test("game-room manifest documents the US1 Tavla transport contract", () => {
  const manifest = JSON.parse(readFileSync("rooms/game-room/manifest.json", "utf8")) as Record<string, unknown>;
  const result = validateRoomManifest(manifest);

  assert.equal(result.valid, true);
  const backgammonFeature = result.manifest?.features.find(
    (feature) => feature.id === "backgammon"
  );
  assert.ok(backgammonFeature);
  assert.equal(
    backgammonFeature.protocolSpecs?.some(
      (spec) => spec.key === "game-room-backgammon-us1-transport"
    ),
    true
  );
});

void test("game-room manifest documents the Team Tetris AI and US1 contracts", () => {
  const manifest = JSON.parse(readFileSync("rooms/game-room/manifest.json", "utf8")) as Record<string, unknown>;
  const result = validateRoomManifest(manifest);

  assert.equal(result.valid, true);
  const teamTetrisFeature = result.manifest?.features.find(
    (feature) => feature.id === "team-tetris"
  );
  assert.ok(teamTetrisFeature);
  assert.equal(
    teamTetrisFeature.protocolSpecs?.some(
      (spec) => spec.key === "game-room-team-tetris-ai-opening"
    ),
    true
  );
  assert.equal(
    teamTetrisFeature.protocolSpecs.some(
      (spec) => spec.key === "game-room-team-tetris-ai-followup"
    ),
    true
  );
  assert.equal(
    teamTetrisFeature.protocolSpecs.some(
      (spec) => spec.key === "game-room-team-tetris-us1-transport"
    ),
    true
  );
});

void test("game-room manifest contains only the implemented Tavla and Team Tetris features", () => {
  const manifest = JSON.parse(readFileSync("rooms/game-room/manifest.json", "utf8")) as Record<string, unknown>;
  const result = validateRoomManifest(manifest);

  assert.equal(result.valid, true);
  assert.deepEqual(
    result.manifest?.features.map((feature) => feature.id),
    ["backgammon", "team-tetris"]
  );
});

void test("room manifest readers stay split from the main room contract module", () => {
  const roomsSource = readFileSync("src/types/rooms.ts", "utf8");
  const manifestTypesSource = readFileSync("src/types/room-manifest-types.ts", "utf8");
  const installedTypesSource = readFileSync("src/types/room-installed-types.ts", "utf8");
  const schemaVersionSource = readFileSync("src/types/room-schema-version.ts", "utf8");
  const readersSource = readFileSync("src/types/room-manifest-readers.ts", "utf8");
  const helpersSource = readFileSync("src/types/room-manifest-helpers.ts", "utf8");
  const validationSource = readFileSync("src/types/room-manifest-validation.ts", "utf8");
  const sceneGuardsSource = readFileSync("src/types/room-scene-guards.ts", "utf8");
  const sceneReadersSource = readFileSync("src/types/room-scene-readers.ts", "utf8");

  assert.match(roomsSource, /from "\.\/room-manifest-helpers\.js"/);
  assert.match(roomsSource, /from "\.\/room-schema-version\.js"/);
  assert.match(roomsSource, /from "\.\/room-manifest-types\.js"/);
  assert.match(roomsSource, /from "\.\/room-installed-types\.js"/);
  assert.match(roomsSource, /from "\.\/room-manifest-validation\.js"/);
  assert.match(roomsSource, /from "\.\/room-scene-guards\.js"/);
  assert.match(schemaVersionSource, /export const ROOM_SCHEMA_VERSION = 2 as const;/);
  assert.match(manifestTypesSource, /export interface RoomManifest \{/);
  assert.match(manifestTypesSource, /export interface RoomBundle \{/);
  assert.match(installedTypesSource, /export interface InstalledRoomRecord \{/);
  assert.match(installedTypesSource, /export interface RoomRegistryState \{/);
  assert.match(readersSource, /export function readMenuConfig\(/);
  assert.match(readersSource, /export function readRuntimeConfig\(/);
  assert.match(readersSource, /export function readCommandSpecs\(/);
  assert.match(readersSource, /export function readProtocolSpecs\(/);
  assert.match(readersSource, /export function readI18nConfig\(/);
  assert.match(helpersSource, /export function flattenRoomCommandSpecs\(/);
  assert.match(helpersSource, /export function flattenRoomProtocolSpecs\(/);
  assert.match(helpersSource, /export function resolveRoomProtocolFilePath\(/);
  assert.match(helpersSource, /export function collectRoomManifestRequiredFilePaths\(/);
  assert.match(validationSource, /export function validateRoomManifest\(/);
  assert.match(validationSource, /from "\.\/room-manifest-readers\.js"/);
  assert.match(validationSource, /from "\.\/room-scene-guards\.js"/);
  assert.match(validationSource, /from "\.\/room-scene-readers\.js"/);
  assert.match(sceneGuardsSource, /export const ROOM_SCENE_CHARACTER_KINDS/);
  assert.match(sceneGuardsSource, /export function isRoomSceneCharacterKind\(/);
  assert.match(sceneGuardsSource, /export function isRoomScenePageShellVariant\(/);
  assert.match(sceneReadersSource, /export function createRoomSceneReaders\(/);
  assert.match(sceneReadersSource, /function readFeatureManifest\(/);
  assert.match(sceneReadersSource, /function readSceneConfig\(/);
});
