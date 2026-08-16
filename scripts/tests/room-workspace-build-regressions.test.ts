import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ROOM_SCHEMA_VERSION } from "../../src/types/rooms.ts";
import {
  readWorkspaceRoomsFromRoot,
  type RoomWorkspaceRoot,
} from "../../electron/rooms/workspace-discovery.ts";
import { buildWorkspaceRoomArtifact } from "../../electron/rooms/workspace-room-build.ts";

async function writeTempRoomFile(
  roomRoot: string,
  relativePath: string,
  content: string | Buffer = ""
): Promise<void> {
  const targetPath = join(roomRoot, relativePath);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content);
}

void test("workspace room discovery and build support TypeScript runtime sources", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "room-build-ts-"));
  const workspaceRoot = join(tempRoot, "rooms");
  const roomRoot = join(workspaceRoot, "ts-proof-room");
  const buildRoot = join(tempRoot, "room-storage");
  const runtimeBuildRoot = join(workspaceRoot, ".build");

  try {
    await mkdir(roomRoot, { recursive: true });
    await writeTempRoomFile(
      roomRoot,
      "manifest.json",
      JSON.stringify(
        {
          schemaVersion: ROOM_SCHEMA_VERSION,
          id: "ts-proof-room",
          name: "TS Proof Room",
          version: "1.0.0",
          menu: {
            label: "TS Proof",
          },
          runtime: {
            uiEntry: "ui/index.html",
            hostEntry: "host/index.js",
          },
          defaultFeatureId: "proof-feature",
          features: [
            {
              id: "proof-feature",
              name: "Proof Feature",
              scene: {
                hotspot: {
                  id: "proof-feature-hotspot",
                  rect: { leftPx: 40, topPx: 60, widthPx: 220, heightPx: 140 },
                },
                view: {
                  id: "proof-feature-view",
                  backgroundSrc: "assets/proof-feature-view.webp",
                },
              },
            },
          ],
          scene: {
            referenceSize: { width: 1600, height: 900 },
            roomBackgroundSrc: "assets/proof-room.webp",
            roomsHotspot: {
              id: "proof-room-door",
              rect: { leftPx: 700, topPx: 220, widthPx: 180, heightPx: 320 },
            },
            backHotspot: {
              id: "proof-room-back",
              rect: { leftPx: 48, topPx: 164, widthPx: 180, heightPx: 248 },
            },
          },
        },
        null,
        2
      )
    );
    await writeTempRoomFile(
      roomRoot,
      "host/index.ts",
      [
        'import createProofRuntime from "./runtime.js";',
        "",
        "export default createProofRuntime();",
        "",
      ].join("\n")
    );
    await writeTempRoomFile(
      roomRoot,
      "host/runtime.ts",
      [
        "export default function createProofRuntime() {",
        "  return {",
        "    activate() {",
        "      return {",
        "        commands: {},",
        "      };",
        "    },",
        "  };",
        "}",
        "",
      ].join("\n")
    );
    await writeTempRoomFile(
      roomRoot,
      "ui/index.html",
      [
        "<!doctype html>",
        '<html lang="en">',
        "  <body>",
        '    <div id="app"></div>',
        '    <script type="module" src="./bootstrap.js"></script>',
        "  </body>",
        "</html>",
        "",
      ].join("\n")
    );
    await writeTempRoomFile(
      roomRoot,
      "ui/bootstrap.ts",
      ['console.log("ts-proof-room bootstrap");', ""].join("\n")
    );
    await writeTempRoomFile(roomRoot, "assets/proof-room.webp");
    await writeTempRoomFile(roomRoot, "assets/proof-feature-view.webp");
    await writeTempRoomFile(roomRoot, "assets/obsolete.txt", "stale");

    const workspaceRooms = await readWorkspaceRoomsFromRoot({
      readOnly: false,
      root: workspaceRoot,
      sourceKind: "workspace",
    } satisfies RoomWorkspaceRoot);
    const workspaceRoom = workspaceRooms.find((entry) => entry.manifest?.id === "ts-proof-room");

    assert.ok(workspaceRoom);
    assert.equal(workspaceRoom.valid, true);
    assert.deepEqual(workspaceRoom.errors , []);

    const buildResult = await buildWorkspaceRoomArtifact({
      getRoomRuntimeBuildDir: (roomId) => join(runtimeBuildRoot, roomId, "runtime"),
      getRoomStorageRoot: (roomId) => join(buildRoot, roomId),
      roomId: "ts-proof-room",
      roomPackageError: async (_key, detail) =>
        detail instanceof Error ? detail.message : String((detail as string | undefined) ?? "room-package-error"),
      roomPackageT: async (_key, params) => String(params?.["path"] ?? params?.["roomId"] ?? "ok"),
      workspaceRooms,
    });

    assert.equal(buildResult.success, true);

    const builtHostEntry = join(buildResult.artifact.buildDir, "host/index.js");
    const builtHostRuntime = join(buildResult.artifact.buildDir, "host/runtime.js");
    const builtUiBootstrap = join(buildResult.artifact.buildDir, "ui/bootstrap.js");
    const copiedHtml = join(buildResult.artifact.buildDir, "ui/index.html");
    const copiedTsHost = join(buildResult.artifact.buildDir, "host/index.ts");
    const obsoleteRuntimeFile = join(buildResult.artifact.buildDir, "assets/obsolete.txt");

    await access(builtHostEntry);
    await access(builtHostRuntime);
    await access(builtUiBootstrap);
    await access(copiedHtml);
    await access(obsoleteRuntimeFile);
    await assert.rejects(async () => { await access(copiedTsHost); });

    const builtHostSource = await readFile(builtHostEntry, "utf8");
    const builtRuntimeSource = await readFile(builtHostRuntime, "utf8");
    assert.match(builtHostSource, /runtime\.js/);
    assert.match(builtRuntimeSource, /commands/);

    await rm(join(roomRoot, "assets/obsolete.txt"), { force: true });
    const rebuildResult = await buildWorkspaceRoomArtifact({
      getRoomRuntimeBuildDir: (roomId) => join(runtimeBuildRoot, roomId, "runtime"),
      getRoomStorageRoot: (roomId) => join(buildRoot, roomId),
      roomId: "ts-proof-room",
      roomPackageError: async (_key, detail) =>
        detail instanceof Error ? detail.message : String((detail as string | undefined) ?? "room-package-error"),
      roomPackageT: async (_key, params) => String(params?.["path"] ?? params?.["roomId"] ?? "ok"),
      workspaceRooms,
    });

    assert.equal(rebuildResult.success, true);
    await assert.rejects(async () => { await access(obsoleteRuntimeFile); });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
