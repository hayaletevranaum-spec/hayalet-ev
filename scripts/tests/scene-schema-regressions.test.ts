import assert from "node:assert/strict";
import test from "node:test";

import { SCENE_NODE_KINDS, SCENE_ROOM_IDS } from "../../src/js/scene/schema.ts";
import {
  buildSceneNodesFromLayout,
  buildSceneRoomDefinition,
} from "../../src/js/scene/layout/index.ts";
import { getSceneRoomLayout } from "../../src/js/scene-system/scene-layout-registry.ts";

const entranceSceneLayout = getSceneRoomLayout("entrance");
const assistantSceneLayout = getSceneRoomLayout("assistant");
const serverSceneLayout = getSceneRoomLayout("server");
const roomsSceneLayout = getSceneRoomLayout("rooms");

void test("scene schema exposes the canonical room and node registries", () => {
  assert.deepEqual(SCENE_ROOM_IDS, ["entrance", "analyze", "assistant", "server", "rooms", "settings"]);
  assert.deepEqual(SCENE_NODE_KINDS, ["object", "back", "character"]);
});

void test("entrance scene layout can be represented through the shared node schema", () => {
  const nodes = buildSceneNodesFromLayout(entranceSceneLayout);

  assert.ok(nodes.some((node) => node.kind === "object" && node.id === "door-analyze"));
  assert.ok(nodes.some((node) => node.kind === "object" && node.id === "door-settings"));
  assert.ok(nodes.some((node) => node.kind === "object" && node.id === "hatch-rooms"));
  assert.ok(
    nodes.some(
      (node) => node.kind === "object" && node.id === "board-whisper" && node.action.type === "whisper"
    )
  );
  assert.ok(nodes.some((node) => node.kind === "back" && node.id === "back-whisper"));
  assert.ok(nodes.some((node) => node.kind === "character" && node.id === "anchor-assistant"));
});

void test("assistant room definition keeps room metadata alongside shared scene nodes", () => {
  const room = buildSceneRoomDefinition("assistant", assistantSceneLayout);

  assert.equal(room.referenceSize.width, 1920);
  assert.equal(room.referenceSize.height, 1080);
  assert.ok(room.nodes.some((node) => node.kind === "object" && node.id === "door-entrance"));
  assert.ok(room.nodes.some((node) => node.kind === "object" && node.id === "screen-primary"));
  assert.ok(room.nodes.some((node) => node.kind === "back" && node.id === "back-primary"));
  assert.ok(room.nodes.some((node) => node.kind === "character" && node.id === "anchor-ai0"));
  assert.ok(room.nodes.every((node) => SCENE_NODE_KINDS.includes(node.kind)));
});

void test("server room definition participates in the shared scene schema", () => {
  const room = buildSceneRoomDefinition("server", serverSceneLayout);

  assert.equal(room.referenceSize.width, 1920);
  assert.equal(room.referenceSize.height, 1080);
  assert.ok(room.nodes.some((node) => node.kind === "object" && node.id === "door-entrance"));
  assert.ok(room.nodes.some((node) => node.kind === "object" && node.id === "screen-primary"));
  assert.ok(room.nodes.some((node) => node.kind === "back" && node.id === "back-primary"));
  assert.ok(room.nodes.some((node) => node.kind === "character" && node.id === "anchor-ai1-primary"));
  assert.ok(room.nodes.every((node) => SCENE_NODE_KINDS.includes(node.kind)));
});

void test("rooms room definition keeps a single object entrance link", () => {
  const room = buildSceneRoomDefinition("rooms", roomsSceneLayout);

  assert.equal(room.referenceSize.width, 1920);
  assert.equal(room.referenceSize.height, 1080);
  assert.deepEqual(room.nodes.map((node) => node.kind), ["object"]);
  assert.ok(room.nodes.some((node) => node.kind === "object" && node.id === "door-entrance"));
});
