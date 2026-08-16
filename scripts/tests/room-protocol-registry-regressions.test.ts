import test from "node:test";
import assert from "node:assert/strict";
import type { InstalledRoomRecord } from "../../src/types/rooms.ts";
import { RoomProtocolRegistry } from "../../src/js/modules/rooms/room-protocol-registry.ts";

const room: InstalledRoomRecord = {
  id: "game-room",
  name: "Game Room",
  version: "2.1.0",
  installedDir: "/workspace/rooms/.build/game-room/runtime",
  sourceDir: "/workspace/rooms/game-room",
  manifestPath: "/workspace/rooms/.build/game-room/runtime/manifest.json",
  runtimeEntryPath: "/workspace/rooms/.build/game-room/runtime/ui/index.html",
  hostEntryPath: "/workspace/rooms/.build/game-room/runtime/host/index.js",
  defaultFeatureId: "backgammon",
  features: [
    { id: "backgammon", name: "Tavla" },
    { id: "team-tetris", name: "Team Tetris" },
  ],
  protocolSpecs: [
    {
      key: "game-room-backgammon-user-start",
      room: "game-room",
      scenario: "backgammon-user-start",
      title: "[START][GAME-ROOM][Tavla][USER-FIRST]",
      editable: true,
    },
    {
      key: "game-room-team-tetris-ai-opening",
      room: "game-room",
      scenario: "team-tetris-ai-opening",
      title: "[TURN][GAME-ROOM][TEAM-TETRIS][AI][OPENING]",
      editable: true,
    },
  ],
  installedAt: "2026-03-08T00:00:00.000Z",
  updatedAt: "2026-03-08T00:00:00.000Z",
};

void test("RoomProtocolRegistry resolves manifest protocol metadata", async () => {
  RoomProtocolRegistry.reset();
  await RoomProtocolRegistry.syncInstalledRooms([room]);

  const resolved = RoomProtocolRegistry.resolve("game-room", "backgammon-user-start");
  const teamTetrisResolved = RoomProtocolRegistry.resolve("game-room", "team-tetris-ai-opening");

  assert.equal(resolved?.key, "game-room-backgammon-user-start");
  assert.equal(resolved.title, "[START][GAME-ROOM][Tavla][USER-FIRST]");
  assert.equal(teamTetrisResolved?.key, "game-room-team-tetris-ai-opening");
  assert.deepEqual(RoomProtocolRegistry.listKnownKeys(), [
    "game-room-backgammon-user-start",
    "game-room-team-tetris-ai-opening",
  ]);
});

void test("RoomProtocolRegistry merges runtime and saved protocol bodies", async () => {
  RoomProtocolRegistry.reset();
  await RoomProtocolRegistry.syncInstalledRooms([room]);
  RoomProtocolRegistry.registerRuntimeProtocols("game-room", {
    "game-room-backgammon-user-start": "Prepare the Tavla board for the user-first match.",
  });

  const merged = await RoomProtocolRegistry.mergeProtocolMap({
    "game-room-backgammon-user-start": "Saved override body",
  });

  assert.equal(merged["game-room-backgammon-user-start"], "Saved override body");
});

void test("RoomProtocolRegistry prefers locale-specific bodies and falls back to Turkish", async () => {
  const readFileCalls: string[] = [];
  const electronWindow = {
    electronAPI: {
      readFile: (filePath: string): string | null => {
        readFileCalls.push(filePath);

        if (filePath.endsWith("/protocols/en/game-room-backgammon-user-start.md")) {
          return "EN localized body";
        }

        if (filePath.endsWith("/protocols/tr/game-room-backgammon-user-start.md")) {
          return "TR fallback body";
        }

        if (filePath.endsWith("/protocols/game-room-backgammon-user-start.md")) {
          return "EN base body";
        }

        return null;
      },
    },
  };

  Object.assign(globalThis, { window: electronWindow });

  RoomProtocolRegistry.reset();
  await RoomProtocolRegistry.syncInstalledRooms([room]);

  const mergedTr = await RoomProtocolRegistry.mergeProtocolMap({}, { locale: "tr" });
  const mergedEn = await RoomProtocolRegistry.mergeProtocolMap({}, { locale: "en" });
  const mergedEnUs = await RoomProtocolRegistry.mergeProtocolMap({}, { locale: "en-US" });
  const mergedDe = await RoomProtocolRegistry.mergeProtocolMap({}, { locale: "de" });

  assert.equal(mergedTr["game-room-backgammon-user-start"], "TR fallback body");
  assert.equal(mergedEn["game-room-backgammon-user-start"], "EN localized body");
  assert.equal(mergedEnUs["game-room-backgammon-user-start"], "TR fallback body");
  assert.equal(mergedDe["game-room-backgammon-user-start"], "TR fallback body");
  assert.ok(
    readFileCalls.some((filePath) =>
      filePath.endsWith("/protocols/en/game-room-backgammon-user-start.md")
    )
  );
  assert.ok(
    readFileCalls.some((filePath) =>
      filePath.endsWith("/protocols/tr/game-room-backgammon-user-start.md")
    )
  );

  delete (globalThis as { window?: unknown }).window;
});
