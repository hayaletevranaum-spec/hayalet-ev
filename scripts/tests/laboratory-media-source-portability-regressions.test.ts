import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { RoomPackageManager } from "../../electron/room-package-manager.ts";
import { ROOM_SCHEMA_VERSION } from "../../src/types/rooms.ts";

async function writeWorkspaceRoom(baseDir: string, roomId: string): Promise<void> {
  await mkdir(join(baseDir, roomId, "ui"), { recursive: true });
  await mkdir(join(baseDir, roomId, "host"), { recursive: true });
  await mkdir(join(baseDir, roomId, "assets"), { recursive: true });
  await mkdir(join(baseDir, roomId, "tools"), { recursive: true });

  await writeFile(
    join(baseDir, roomId, "manifest.json"),
    JSON.stringify(
      {
        schemaVersion: ROOM_SCHEMA_VERSION,
        id: roomId,
        name: "Portable Room",
        version: "1.0.0",
        menu: { label: "Portable Room" },
        runtime: {
          uiEntry: "ui/index.html",
          hostEntry: "host/index.js",
        },
        defaultFeatureId: "primary",
        features: [{ id: "primary", name: "Primary" }],
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(join(baseDir, roomId, "ui", "index.html"), "<html></html>", "utf8");
  await writeFile(join(baseDir, roomId, "host", "index.js"), "export {};\n", "utf8");
  await writeFile(join(baseDir, roomId, "assets", "readme.txt"), "tracked", "utf8");
  await writeFile(
    join(baseDir, roomId, "tools", "toolchain.manifest.json"),
    JSON.stringify(
      {
        roomId,
        tools: {
          ffmpeg: { stageSupport: { source: "required", edit: "required", profile: "required" } },
          "transcript-runtime": { stageSupport: { source: "unsupported", edit: "unsupported", profile: "optional" } },
        },
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    join(baseDir, roomId, "tools", "edit-presets.json"),
    JSON.stringify({ schemaVersion: 1, defaultMode: "beginner" }, null, 2),
    "utf8"
  );
  await writeFile(
    join(baseDir, roomId, "tools", "edit-capabilities.json"),
    JSON.stringify({ schemaVersion: 1, stages: { edit: { requiredTools: ["ffmpeg"] } } }, null, 2),
    "utf8"
  );
  await writeFile(
    join(baseDir, roomId, "tools", "profile-presets.json"),
    JSON.stringify({ schemaVersion: 1, defaultMode: "beginner", lanes: {}, presets: {} }, null, 2),
    "utf8"
  );
  await writeFile(
    join(baseDir, roomId, "tools", "profile-capabilities.json"),
    JSON.stringify({ schemaVersion: 1, stages: { profile: { requiredTools: ["ffmpeg"] } } }, null, 2),
    "utf8"
  );
}

void test("installed room export skips room runtime binaries and install snapshots", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "laboratory-portability-"));
  const workspaceRoot = join(tempRoot, "rooms");
  const installedRoot = join(tempRoot, "data", "rooms");
  const registryPath = join(tempRoot, "config", "rooms.json");

  try {
    await writeWorkspaceRoom(workspaceRoot, "laboratory-portable");

    const manager = new RoomPackageManager({
      workspaceRoot,
      installedRoot,
      registryPath,
    });

    const installResult = await manager.installFromWorkspace("laboratory-portable");
    assert.equal(installResult.success, true, installResult.error);

    const installedDir = join(installedRoot, "laboratory-portable");
    await mkdir(join(installedDir, "tools", "runtime", "linux-x64"), { recursive: true });
    await writeFile(
      join(installedDir, "tools", "toolchain.manifest.json"),
      JSON.stringify({ roomId: "laboratory-portable", tools: { ffmpeg: {} } }, null, 2),
      "utf8"
    );
    await writeFile(join(installedDir, "tools", "runtime", "linux-x64", "ffprobe"), "binary", "utf8");
    await writeFile(join(installedDir, ".room-install-files.json"), JSON.stringify({ files: [] }), "utf8");

    const exportResult = await manager.exportInstalledRoomToWorkspace("laboratory-portable", {
      overwrite: true,
    });

    assert.equal(exportResult.success, true, exportResult.error);
    assert.equal(
      existsSync(join(workspaceRoot, "laboratory-portable", "tools", "toolchain.manifest.json")),
      true
    );
    assert.equal(
      existsSync(join(workspaceRoot, "laboratory-portable", "tools", "edit-presets.json")),
      true
    );
    assert.equal(
      existsSync(join(workspaceRoot, "laboratory-portable", "tools", "edit-capabilities.json")),
      true
    );
    assert.equal(
      existsSync(join(workspaceRoot, "laboratory-portable", "tools", "profile-presets.json")),
      true
    );
    assert.equal(
      existsSync(join(workspaceRoot, "laboratory-portable", "tools", "profile-capabilities.json")),
      true
    );
    assert.equal(
      existsSync(join(workspaceRoot, "laboratory-portable", "tools", "runtime", "linux-x64", "ffprobe")),
      false
    );
    assert.equal(
      existsSync(join(workspaceRoot, "laboratory-portable", ".room-install-files.json")),
      false
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
