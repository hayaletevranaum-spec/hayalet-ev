import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RoomPackageManager } from "../../electron/room-package-manager.ts";
import { ROOM_SCHEMA_VERSION } from "../../src/types/rooms.ts";

interface RoomPackageManagerTestAccess {
  buildWorkspaceInstalledRoomRecord(
    room: { manifest: { id: string }; dirPath: string }
  ): Promise<{ id: string; isWorkspaceFallback?: boolean } | null>;
}


function encodeBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

async function writeRoomFixture(baseDir: string, roomId: string, roomName: string): Promise<void> {
  await mkdir(join(baseDir, roomId, "ui"), { recursive: true });
  await mkdir(join(baseDir, roomId, "host"), { recursive: true });
  await mkdir(join(baseDir, roomId, "assets"), { recursive: true });

  await writeFile(
    join(baseDir, roomId, "manifest.json"),
    JSON.stringify(
      {
        schemaVersion: ROOM_SCHEMA_VERSION,
        id: roomId,
        name: roomName,
        version: "1.0.0",
        menu: { label: roomName },
        runtime: {
          uiEntry: "ui/index.html",
          hostEntry: "host/index.js",
        },
        defaultFeatureId: "primary",
        features: [
          {
            id: "primary",
            name: "Primary",
          },
        ],
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    join(baseDir, roomId, "ui", "index.html"),
    `<!doctype html><html><body>${roomName}</body></html>`,
    "utf8"
  );
  await writeFile(join(baseDir, roomId, "host", "index.js"), "export {};\n", "utf8");
  await writeFile(join(baseDir, roomId, "assets", "readme.txt"), `${roomId} asset`, "utf8");
}

async function writeRoomRuntimeDataFixture(
  dataRoot: string,
  roomId: string
): Promise<{ roomStorageDir: string; roomPartitionDir: string }> {
  const roomStorageDir = join(dataRoot, "room-storage", roomId);
  const roomPartitionDir = join(dataRoot, "electron-user-data", "Partitions", `room-${roomId}`);

  await mkdir(roomStorageDir, { recursive: true });
  await mkdir(roomPartitionDir, { recursive: true });
  await writeFile(join(roomStorageDir, "state.json"), JSON.stringify({ roomId }), "utf8");
  await writeFile(join(roomPartitionDir, "session.json"), JSON.stringify({ roomId }), "utf8");

  return {
    roomStorageDir,
    roomPartitionDir,
  };
}

async function waitForFsTick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 25));
}

void test("RoomPackageManager imports a .hevroom bundle into workspace and installed registry", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "room-bundle-import-"));
  const workspaceRoot = join(tempRoot, "rooms");
  const installedRoot = join(tempRoot, "data", "rooms");
  const registryPath = join(tempRoot, "config", "rooms.json");
  const bundlePath = join(tempRoot, "imports", "game-room-import.hevroom.json");

  try {
    await mkdir(join(tempRoot, "imports"), { recursive: true });

    const bundle = {
      schemaVersion: ROOM_SCHEMA_VERSION,
      manifest: {
        schemaVersion: ROOM_SCHEMA_VERSION,
        id: "game-room-import",
        name: "Game Room Import",
        version: "2.0.0",
        menu: { label: "Game Room Import" },
        runtime: {
          uiEntry: "ui/index.html",
          hostEntry: "host/index.js",
        },
        defaultFeatureId: "chess",
        features: [
          {
            id: "chess",
            name: "Chess",
            scene: {
              hotspot: {
                id: "import-chess",
                rect: { leftPx: 100, topPx: 120, widthPx: 180, heightPx: 120 },
              },
              view: {
                id: "chess-closeup",
                backgroundSrc: "assets/chess-view.svg",
              },
            },
          },
        ],
        scene: {
          referenceSize: { width: 1600, height: 900 },
          roomBackgroundSrc: "assets/room-background.svg",
          roomsHotspot: {
            id: "game-room-import-door",
            rect: { leftPx: 720, topPx: 240, widthPx: 150, heightPx: 320 },
          },
          backHotspot: {
            id: "game-room-import-back",
            rect: { leftPx: 70, topPx: 180, widthPx: 120, heightPx: 240 },
          },
        },
      },
      files: {
        "ui/index.html": {
          encoding: "base64",
          content: encodeBase64("<!doctype html><html><body>Game Room</body></html>"),
        },
        "host/index.js": {
          encoding: "base64",
          content: encodeBase64("module.exports = { activate() { return {}; } };"),
        },
        "assets/room-background.svg": {
          encoding: "base64",
          content: encodeBase64("<svg xmlns='http://www.w3.org/2000/svg'></svg>"),
        },
        "assets/chess-view.svg": {
          encoding: "base64",
          content: encodeBase64("<svg xmlns='http://www.w3.org/2000/svg'></svg>"),
        },
      },
      exportedAt: "2026-03-08T00:00:00.000Z",
    };

    await writeFile(bundlePath, JSON.stringify(bundle, null, 2), "utf8");

    const manager = new RoomPackageManager({
      workspaceRoot,
      installedRoot,
      registryPath,
    });

    const result = await manager.importBundleFile(bundlePath, { overwriteWorkspace: true });

    assert.equal(result.success, true, result.error);
    assert.equal(result.restartRequired, true);
    assert.equal(result.room?.id, "game-room-import");
    assert.equal(result.path, join(workspaceRoot, "game-room-import"));
    assert.equal(existsSync(join(workspaceRoot, "game-room-import", "manifest.json")), true);
    assert.equal(existsSync(join(installedRoot, "game-room-import", "ui", "index.html")), true);

    const workspaceManifest = JSON.parse(
      await readFile(join(workspaceRoot, "game-room-import", "manifest.json"), "utf8")
    ) as { id: string; runtime: { uiEntry: string } };
    assert.equal(workspaceManifest.id, "game-room-import");
    assert.equal(workspaceManifest.runtime.uiEntry, "ui/index.html");

    const installedRooms = await manager.listInstalledRooms();
    assert.equal(installedRooms.length, 1);
    assert.equal(installedRooms[0]?.id, "game-room-import");
    assert.equal(installedRooms[0].defaultFeatureId, "chess");
    assert.equal(installedRooms[0].sourceDir, join(workspaceRoot, "game-room-import"));
    assert.equal(
      installedRooms[0].scene?.roomBackgroundPath,
      join(installedRoot, "game-room-import", "assets", "room-background.svg")
    );
    assert.equal(
      installedRooms[0].features[0]?.scene?.view.backgroundPath,
      join(installedRoot, "game-room-import", "assets", "chess-view.svg")
    );

    const registry = JSON.parse(await readFile(registryPath, "utf8")) as {
      rooms: Array<{
        scene?: { roomBackgroundPath?: string };
        features?: Array<{ scene?: { view?: { backgroundPath?: string } } }>;
      }>;
    };
    assert.equal(
      registry.rooms[0]?.scene?.roomBackgroundPath,
      join(installedRoot, "game-room-import", "assets", "room-background.svg")
    );
    assert.equal(
      registry.rooms[0].features?.[0]?.scene?.view?.backgroundPath,
      join(installedRoot, "game-room-import", "assets", "chess-view.svg")
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

void test("RoomPackageManager packages workspace rooms into room-storage exports by default", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "room-bundle-package-"));
  const workspaceRoot = join(tempRoot, "rooms");
  const dataRoot = join(tempRoot, "data");
  const runtimeBuildRoot = join(workspaceRoot, ".build");
  const registryPath = join(tempRoot, "config", "rooms.json");

  try {
    await writeRoomFixture(workspaceRoot, "package-room", "Package Room");

    const manager = new RoomPackageManager({
      workspaceRoot,
      runtimeBuildRoot,
      dataRoot,
      registryPath,
    });

    const result = await manager.packageWorkspaceRoom("package-room");
    const expectedOutput = join(
      tempRoot,
      "data",
      "room-storage",
      "package-room",
      "exports",
      "package-room.hevroom.json"
    );
    const staleStorageBuildRoot = join(
      tempRoot,
      "data",
      "room-storage",
      "package-room",
      "build",
      "workspace"
    );
    const expectedBuildRoot = join(runtimeBuildRoot, "package-room", "runtime");

    assert.equal(result.success, true, result.error);
    assert.equal(result.path, expectedOutput);
    assert.equal(existsSync(expectedOutput), true);
    assert.equal(existsSync(expectedBuildRoot), true);
    assert.equal(existsSync(join(expectedBuildRoot, "ui", "index.html")), true);
    assert.equal(existsSync(staleStorageBuildRoot), false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

void test("RoomPackageManager startup sync refreshes workspace-linked installed rooms after source edits", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "room-startup-sync-"));
  const workspaceRoot = join(tempRoot, "rooms");
  const dataRoot = join(tempRoot, "data");
  const runtimeBuildRoot = join(workspaceRoot, ".build");
  const runtimeRoomDir = join(runtimeBuildRoot, "sync-room", "runtime");
  const registryPath = join(tempRoot, "config", "rooms.json");

  try {
    await writeRoomFixture(workspaceRoot, "sync-room", "Sync Room");

    const manager = new RoomPackageManager({
      workspaceRoot,
      runtimeBuildRoot,
      dataRoot,
      registryPath,
    });

    const installResult = await manager.installFromWorkspace("sync-room");
    assert.equal(installResult.success, true, installResult.error);

    const initialInstalledRooms = await manager.listInstalledRooms();
    assert.equal(initialInstalledRooms.length, 1);
    const initialRoom = initialInstalledRooms[0];
    assert.ok(initialRoom);
    const initialUpdatedAt = initialRoom.updatedAt;
    assert.match(await readFile(join(runtimeRoomDir, "ui", "index.html"), "utf8"), /Sync Room/);

    await waitForFsTick();
    await writeFile(
      join(workspaceRoot, "sync-room", "ui", "index.html"),
      "<!doctype html><html><body>Sync Room v2</body></html>",
      "utf8"
    );

    const syncResult = await manager.syncLinkedWorkspaceRoomsOnStartup();
    assert.equal(syncResult.success, true, syncResult.error);
    assert.deepEqual(syncResult.syncedRoomIds, ["sync-room"]);
    assert.equal(syncResult.snapshot?.rooms.length, 1);
    assert.ok(syncResult.snapshot.rooms[0]);
    assert.notEqual(syncResult.snapshot.rooms[0].updatedAt, initialUpdatedAt);
    assert.match(await readFile(join(runtimeRoomDir, "ui", "index.html"), "utf8"), /Sync Room v2/);

    const secondSyncResult = await manager.syncLinkedWorkspaceRoomsOnStartup();
    assert.equal(secondSyncResult.success, true, secondSyncResult.error);
    assert.deepEqual(secondSyncResult.syncedRoomIds, []);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

void test("RoomPackageManager rejects bundles with missing scene assets", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "room-bundle-invalid-"));
  const workspaceRoot = join(tempRoot, "rooms");
  const installedRoot = join(tempRoot, "data", "rooms");
  const registryPath = join(tempRoot, "config", "rooms.json");
  const bundlePath = join(tempRoot, "imports", "broken.hevroom.json");

  try {
    await mkdir(join(tempRoot, "imports"), { recursive: true });

    const bundle = {
      schemaVersion: ROOM_SCHEMA_VERSION,
      manifest: {
        schemaVersion: ROOM_SCHEMA_VERSION,
        id: "broken-room",
        name: "Broken Room",
        version: "2.0.0",
        menu: { label: "Broken" },
        runtime: {
          uiEntry: "ui/index.html",
          hostEntry: "host/index.js",
        },
        defaultFeatureId: "chess",
        features: [
          {
            id: "chess",
            name: "Chess",
            scene: {
              hotspot: {
                id: "broken-chess",
                rect: { leftPx: 100, topPx: 100, widthPx: 120, heightPx: 120 },
              },
              view: {
                id: "chess-closeup",
                backgroundSrc: "assets/chess-view.svg",
              },
            },
          },
        ],
        scene: {
          referenceSize: { width: 1600, height: 900 },
          roomBackgroundSrc: "assets/room-background.svg",
          roomsHotspot: {
            id: "broken-door",
            rect: { leftPx: 700, topPx: 240, widthPx: 160, heightPx: 300 },
          },
          backHotspot: {
            id: "broken-back",
            rect: { leftPx: 70, topPx: 180, widthPx: 120, heightPx: 240 },
          },
        },
      },
      files: {
        "ui/index.html": {
          encoding: "base64",
          content: encodeBase64("<!doctype html><html><body>Broken</body></html>"),
        },
        "host/index.js": {
          encoding: "base64",
          content: encodeBase64("module.exports = { activate() { return {}; } };"),
        },
      },
      exportedAt: "2026-03-08T00:00:00.000Z",
    };

    await writeFile(bundlePath, JSON.stringify(bundle, null, 2), "utf8");

    const manager = new RoomPackageManager({
      workspaceRoot,
      installedRoot,
      registryPath,
    });

    const result = await manager.importBundleFile(bundlePath, { overwriteWorkspace: true });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /required asset/i);
    assert.equal(existsSync(join(workspaceRoot, "broken-room")), false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

void test("RoomPackageManager lists bundled rooms and installs them without deleting the bundle source", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "room-bundle-workspace-"));
  const workspaceRoot = join(tempRoot, "rooms");
  const bundledWorkspaceRoot = join(tempRoot, "app.asar", "rooms");
  const dataRoot = join(tempRoot, "data");
  const runtimeBuildRoot = join(workspaceRoot, ".build");
  const runtimeRoomDir = join(runtimeBuildRoot, "workshop", "runtime");
  const registryPath = join(tempRoot, "config", "rooms.json");

  try {
    await writeRoomFixture(bundledWorkspaceRoot, "game-room", "Game Room");
    await writeRoomFixture(bundledWorkspaceRoot, "workshop", "Workshop");

    const manager = new RoomPackageManager({
      workspaceRoot,
      bundledWorkspaceRoot,
      runtimeBuildRoot,
      dataRoot,
      registryPath,
    });

    const workspaceRooms = await manager.listWorkspaceRooms();
    assert.equal(workspaceRooms.length, 2);
    assert.equal(workspaceRooms[0]?.sourceKind, "bundle");
    assert.equal(workspaceRooms[0].readOnly, true);
    assert.equal(workspaceRooms[1]?.sourceKind, "bundle");
    assert.equal(workspaceRooms[1].readOnly, true);

    const installResult = await manager.installFromWorkspace("workshop");
    assert.equal(installResult.success, true, installResult.error);
    assert.equal(installResult.room?.sourceDir, join(bundledWorkspaceRoot, "workshop"));
    assert.equal(existsSync(join(runtimeRoomDir, "ui", "index.html")), true);
    assert.equal(
      existsSync(
        join(dataRoot, "room-storage", "workshop", "build", "workspace", "ui", "index.html")
      ),
      false
    );
    assert.equal(existsSync(join(workspaceRoot, "workshop")), false);

    const roomRuntimeData = await writeRoomRuntimeDataFixture(dataRoot, "workshop");
    const removeResult = await manager.removeInstalledRoom("workshop", { deleteData: true });
    assert.equal(removeResult.success, true, removeResult.error);
    assert.equal(existsSync(join(bundledWorkspaceRoot, "workshop", "manifest.json")), true);
    assert.equal(existsSync(roomRuntimeData.roomStorageDir), false);
    assert.equal(existsSync(roomRuntimeData.roomPartitionDir), false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

void test("RoomPackageManager removeInstalledRoom preserves user files inside installed room data", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "room-remove-installed-"));
  const workspaceRoot = join(tempRoot, "rooms");
  const dataRoot = join(tempRoot, "data");
  const installedRoot = join(dataRoot, "rooms");
  const registryPath = join(tempRoot, "config", "rooms.json");
  const roomDir = join(workspaceRoot, "game-room");

  try {
    await mkdir(join(roomDir, "ui"), { recursive: true });
    await mkdir(join(roomDir, "host"), { recursive: true });
    await mkdir(join(roomDir, "assets"), { recursive: true });

    await writeFile(
      join(roomDir, "manifest.json"),
      JSON.stringify(
        {
          schemaVersion: ROOM_SCHEMA_VERSION,
          id: "game-room",
          name: "Game Room",
          version: "1.0.0",
          menu: { label: "Game Room" },
          runtime: {
            uiEntry: "ui/index.html",
            hostEntry: "host/index.js",
          },
          defaultFeatureId: "chess",
          features: [{ id: "chess", name: "Chess" }],
        },
        null,
        2
      ),
      "utf8"
    );
    await writeFile(join(roomDir, "ui", "index.html"), "<html></html>", "utf8");
    await writeFile(join(roomDir, "host", "index.js"), "export {};\n", "utf8");
    await writeFile(join(roomDir, "assets", "readme.txt"), "tracked", "utf8");

    const manager = new RoomPackageManager({
      workspaceRoot,
      installedRoot,
      registryPath,
    });

    const installResult = await manager.installFromWorkspace("game-room");
    assert.equal(installResult.success, true, installResult.error);

    const installedDir = join(installedRoot, "game-room");
    const roomRuntimeData = await writeRoomRuntimeDataFixture(dataRoot, "game-room");
    await mkdir(join(installedDir, "user-notes"), { recursive: true });
    await writeFile(join(installedDir, "user-notes", "custom.txt"), "keep me", "utf8");

    const removeResult = await manager.removeInstalledRoom("game-room");
    assert.equal(removeResult.success, true, removeResult.error);
    assert.equal(existsSync(roomDir), true);
    assert.equal(existsSync(join(installedDir, "manifest.json")), false);
    assert.equal(existsSync(join(installedDir, "ui", "index.html")), false);
    assert.equal(existsSync(join(installedDir, "host", "index.js")), false);
    assert.equal(existsSync(join(installedDir, "assets", "readme.txt")), false);
    assert.equal(existsSync(join(installedDir, "user-notes", "custom.txt")), true);
    assert.equal(existsSync(join(roomRuntimeData.roomStorageDir, "state.json")), true);
    assert.equal(existsSync(join(roomRuntimeData.roomPartitionDir, "session.json")), true);

    const installedRooms = await manager.listInstalledRooms();
    assert.equal(installedRooms.length, 0);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

void test("RoomPackageManager exportInstalledRoomToWorkspace skips runtime tool payloads", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "room-export-installed-"));
  const workspaceRoot = join(tempRoot, "rooms");
  const dataRoot = join(tempRoot, "data");
  const installedRoot = join(dataRoot, "rooms");
  const registryPath = join(tempRoot, "config", "rooms.json");

  try {
    await writeRoomFixture(workspaceRoot, "game-room", "Game Room");

    const manager = new RoomPackageManager({
      workspaceRoot,
      installedRoot,
      registryPath,
    });

    const installResult = await manager.installFromWorkspace("game-room");
    assert.equal(installResult.success, true, installResult.error);

    const installedDir = join(installedRoot, "game-room");
    await mkdir(join(installedDir, "tools", "runtime", "linux-x64"), { recursive: true });
    await writeFile(
      join(installedDir, "tools", "toolchain.manifest.json"),
      JSON.stringify({ roomId: "game-room", tools: { "yt-dlp": {} } }, null, 2),
      "utf8"
    );
    await writeFile(
      join(installedDir, "tools", "runtime", "linux-x64", "yt-dlp"),
      "binary",
      "utf8"
    );

    const exportResult = await manager.exportInstalledRoomToWorkspace("game-room", {
      overwrite: true,
    });

    assert.equal(exportResult.success, true, exportResult.error);
    assert.equal(existsSync(join(workspaceRoot, "game-room", "manifest.json")), true);
    assert.equal(
      existsSync(join(workspaceRoot, "game-room", "tools", "toolchain.manifest.json")),
      true
    );
    assert.equal(
      existsSync(join(workspaceRoot, "game-room", "tools", "runtime", "linux-x64", "yt-dlp")),
      false
    );
    assert.equal(existsSync(join(workspaceRoot, "game-room", ".room-install-files.json")), false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

void test("RoomPackageManager install and export keep Team Tetris assets and protocols intact", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "room-team-tetris-export-"));
  const workspaceRoot = join(tempRoot, "rooms");
  const dataRoot = join(tempRoot, "data");
  const installedRoot = join(dataRoot, "rooms");
  const registryPath = join(tempRoot, "config", "rooms.json");
  const roomDir = join(workspaceRoot, "game-room");

  try {
    await mkdir(join(roomDir, "ui"), { recursive: true });
    await mkdir(join(roomDir, "host"), { recursive: true });
    await mkdir(join(roomDir, "assets"), { recursive: true });
    await mkdir(join(roomDir, "protocols"), { recursive: true });

    await writeFile(
      join(roomDir, "manifest.json"),
      JSON.stringify(
        {
          schemaVersion: ROOM_SCHEMA_VERSION,
          id: "game-room",
          name: "Game Room",
          version: "1.0.0",
          menu: { label: "Game Room" },
          runtime: {
            uiEntry: "ui/index.html",
            hostEntry: "host/index.js",
          },
          defaultFeatureId: "backgammon",
          features: [
            {
              id: "backgammon",
              name: "Tavla",
            },
            {
              id: "team-tetris",
              name: "Team Tetris",
              protocolSpecs: [
                {
                  key: "game-room-team-tetris-ai-opening",
                  room: "game-room",
                  scenario: "team-tetris-ai-opening",
                  title: "[TURN][GAME-ROOM][TEAM-TETRIS][AI][OPENING]",
                },
                {
                  key: "game-room-team-tetris-ai-followup",
                  room: "game-room",
                  scenario: "team-tetris-ai-followup",
                  title: "[TURN][GAME-ROOM][TEAM-TETRIS][AI][FOLLOWUP]",
                },
                {
                  key: "game-room-team-tetris-us1-transport",
                  room: "game-room",
                  scenario: "team-tetris-us1-transport",
                  title: "[INFO][GAME-ROOM][TEAM-TETRIS][US1-TRANSPORT]",
                },
              ],
              scene: {
                hotspot: {
                  id: "game-room-team-tetris",
                  rect: { leftPx: 100, topPx: 120, widthPx: 180, heightPx: 120 },
                },
                view: {
                  id: "team-tetris-closeup",
                  backgroundSrc: "assets/team-tetris-view.webp",
                },
              },
            },
          ],
        },
        null,
        2
      ),
      "utf8"
    );
    await writeFile(join(roomDir, "ui", "index.html"), "<html></html>", "utf8");
    await writeFile(
      join(roomDir, "host", "index.js"),
      "module.exports = { activate() { return {}; } };\n",
      "utf8"
    );
    await writeFile(join(roomDir, "assets", "team-tetris-view.webp"), "placeholder", "utf8");
    await writeFile(
      join(roomDir, "protocols", "game-room-team-tetris-ai-opening.md"),
      "# opening\n",
      "utf8"
    );
    await writeFile(
      join(roomDir, "protocols", "game-room-team-tetris-ai-followup.md"),
      "# followup\n",
      "utf8"
    );
    await writeFile(
      join(roomDir, "protocols", "game-room-team-tetris-us1-transport.md"),
      "# transport\n",
      "utf8"
    );

    const manager = new RoomPackageManager({
      workspaceRoot,
      installedRoot,
      registryPath,
    });

    const installResult = await manager.installFromWorkspace("game-room");
    assert.equal(installResult.success, true, installResult.error);
    assert.equal(
      existsSync(join(installedRoot, "game-room", "assets", "team-tetris-view.webp")),
      true
    );
    assert.equal(
      existsSync(
        join(installedRoot, "game-room", "protocols", "game-room-team-tetris-ai-opening.md")
      ),
      true
    );

    await rm(join(roomDir, "assets", "team-tetris-view.webp"), { force: true });
    await rm(join(roomDir, "protocols", "game-room-team-tetris-ai-opening.md"), { force: true });
    await rm(join(roomDir, "protocols", "game-room-team-tetris-ai-followup.md"), { force: true });
    await rm(join(roomDir, "protocols", "game-room-team-tetris-us1-transport.md"), { force: true });

    const exportResult = await manager.exportInstalledRoomToWorkspace("game-room", {
      overwrite: true,
    });

    assert.equal(exportResult.success, true, exportResult.error);
    assert.equal(existsSync(join(roomDir, "assets", "team-tetris-view.webp")), true);
    assert.equal(
      existsSync(join(roomDir, "protocols", "game-room-team-tetris-ai-opening.md")),
      true
    );
    assert.equal(
      existsSync(join(roomDir, "protocols", "game-room-team-tetris-ai-followup.md")),
      true
    );
    assert.equal(
      existsSync(join(roomDir, "protocols", "game-room-team-tetris-us1-transport.md")),
      true
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

void test("RoomPackageManager removeInstalledRoom deleteData clears data without deleting workspace room", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "room-remove-installed-delete-data-"));
  const workspaceRoot = join(tempRoot, "rooms");
  const dataRoot = join(tempRoot, "data");
  const installedRoot = join(dataRoot, "rooms");
  const registryPath = join(tempRoot, "config", "rooms.json");
  const roomDir = join(workspaceRoot, "game-room");
  const installedDir = join(installedRoot, "game-room");

  try {
    await writeRoomFixture(workspaceRoot, "game-room", "Game Room");

    const manager = new RoomPackageManager({
      workspaceRoot,
      installedRoot,
      registryPath,
    });

    const installResult = await manager.installFromWorkspace("game-room");
    assert.equal(installResult.success, true, installResult.error);

    const roomRuntimeData = await writeRoomRuntimeDataFixture(dataRoot, "game-room");
    const removeResult = await manager.removeInstalledRoom("game-room", { deleteData: true });
    assert.equal(removeResult.success, true, removeResult.error);
    assert.equal(existsSync(join(roomDir, "manifest.json")), true);
    assert.equal(existsSync(installedDir), false);
    assert.equal(existsSync(roomRuntimeData.roomStorageDir), false);
    assert.equal(existsSync(roomRuntimeData.roomPartitionDir), false);

    const installedRooms = await manager.listInstalledRooms();
    assert.equal(installedRooms.length, 0);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

void test("RoomPackageManager marks dev fallback installed rooms so settings can avoid uninstall actions", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "room-installed-fallback-"));
  const dataRoot = join(tempRoot, "data");
  const workspaceRoot = join(tempRoot, "rooms");
  const installedRoot = join(dataRoot, "rooms");
  const registryPath = join(tempRoot, "config", "rooms.json");

  try {
    await writeRoomFixture(workspaceRoot, "game-room", "Game Room");

    const manager = new RoomPackageManager({
      workspaceRoot,
      installedRoot,
      registryPath,
    });

    const workspaceRooms = await manager.listWorkspaceRooms();
    assert.equal(workspaceRooms.length, 1);
    assert.ok(workspaceRooms[0] != null);
    const roomEntry = workspaceRooms[0];
    const fallbackRoom = await (manager as unknown as RoomPackageManagerTestAccess).buildWorkspaceInstalledRoomRecord(
      roomEntry as { manifest: { id: string }; dirPath: string }
    );

    assert.equal(fallbackRoom?.id, "game-room");
    assert.equal(fallbackRoom.isWorkspaceFallback, true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

void test("RoomPackageManager deleteWorkspaceRoom can remove workspace and data folders together", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "room-delete-workspace-"));
  const workspaceRoot = join(tempRoot, "rooms");
  const dataRoot = join(tempRoot, "data");
  const installedRoot = join(dataRoot, "rooms");
  const registryPath = join(tempRoot, "config", "rooms.json");
  const roomDir = join(workspaceRoot, "game-room");
  const installedDir = join(installedRoot, "game-room");

  try {
    await mkdir(join(roomDir, "ui"), { recursive: true });
    await mkdir(join(roomDir, "host"), { recursive: true });
    await mkdir(installedDir, { recursive: true });

    await writeFile(
      join(roomDir, "manifest.json"),
      JSON.stringify(
        {
          schemaVersion: ROOM_SCHEMA_VERSION,
          id: "game-room",
          name: "Game Room",
          version: "1.0.0",
          menu: { label: "Game Room" },
          runtime: {
            uiEntry: "ui/index.html",
            hostEntry: "host/index.js",
          },
          defaultFeatureId: "chess",
          features: [{ id: "chess", name: "Chess" }],
        },
        null,
        2
      ),
      "utf8"
    );
    await writeFile(join(roomDir, "ui", "index.html"), "<html></html>", "utf8");
    await writeFile(join(roomDir, "host", "index.js"), "export {};\n", "utf8");
    await writeFile(join(installedDir, "orphan.txt"), "remove me", "utf8");
    const roomRuntimeData = await writeRoomRuntimeDataFixture(dataRoot, "game-room");

    const manager = new RoomPackageManager({
      workspaceRoot,
      installedRoot,
      registryPath,
    });

    const deleteResult = await manager.deleteWorkspaceRoom("game-room", { deleteData: true });
    assert.equal(deleteResult.success, true, deleteResult.error);
    assert.equal(existsSync(roomDir), false);
    assert.equal(existsSync(installedDir), false);
    assert.equal(existsSync(roomRuntimeData.roomStorageDir), false);
    assert.equal(existsSync(roomRuntimeData.roomPartitionDir), false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
