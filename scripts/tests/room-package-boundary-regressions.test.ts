import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  buildInstalledRoomRecord,
  RoomPackageManager,
} from "../../electron/room-package-manager.ts";
import { ROOM_SCHEMA_VERSION } from "../../src/types/rooms.ts";

async function walkFiles(baseDir: string): Promise<string[]> {
  const entries = await readdir(baseDir, { withFileTypes: true });
  const pairs = entries.map((entry) => {
    const absolutePath = join(baseDir, entry.name);
    if (entry.isDirectory()) {
      return { kind: "dir" as const, absolutePath };
    }
    return { kind: "file" as const, absolutePath };
  });
  const subResults = await Promise.all(
    pairs
      .filter((p) => p.kind === "dir")
      .map(async (p) => await walkFiles(p.absolutePath))
  );
  const files = pairs
    .filter((p) => p.kind === "file")
    .map((p) => p.absolutePath)
    .concat(...subResults.flat());
  return files.sort((left, right) => left.localeCompare(right));
}

async function walkDirectories(baseDir: string): Promise<string[]> {
  const entries = await readdir(baseDir, { withFileTypes: true });
  const subDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(baseDir, entry.name));
  const subResults = await Promise.all(subDirs.map(async (dir) => await walkDirectories(dir)));
  return [...subDirs, ...subResults.flat()].sort((left, right) => left.localeCompare(right));
}

async function writeWorkspaceRoomFixture(baseDir: string, roomId: string): Promise<void> {
  await mkdir(join(baseDir, roomId, "ui"), { recursive: true });
  await mkdir(join(baseDir, roomId, "host"), { recursive: true });

  await writeFile(
    join(baseDir, roomId, "manifest.json"),
    JSON.stringify(
      {
        schemaVersion: ROOM_SCHEMA_VERSION,
        id: roomId,
        name: "Workspace Room",
        version: "1.0.0",
        menu: { label: "Workspace Room" },
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
  await writeFile(
    join(baseDir, roomId, "ui", "index.html"),
    "<!doctype html><html></html>",
    "utf8"
  );
  await writeFile(join(baseDir, roomId, "host", "index.js"), "export {};\n", "utf8");
}

void test("workspace room packages stay free of generated bundle artifacts", async () => {
  const workspaceRoot = resolve("rooms");
  const roomIds = (await readdir(workspaceRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const roomChecks = await Promise.all(
    roomIds.map(async (roomId) => {
      const roomDir = join(workspaceRoot, roomId);
      const roomDirectories = await walkDirectories(roomDir);
      const roomFiles = await walkFiles(roomDir);
      return {
        roomId,
        roomDir,
        roomDirectories,
        roomFiles,
        hasDist: existsSync(join(roomDir, "dist")),
        leakedCaches: roomDirectories.filter(
          (dirPath) => dirPath.endsWith("/__pycache__") || dirPath.endsWith("\\__pycache__")
        ),
        leakedBundles: roomFiles.filter(
          (filePath) => filePath.endsWith(".hevroom") || filePath.endsWith(".hevroom.json")
        ),
      };
    })
  );

  for (const { roomId, hasDist, leakedCaches, leakedBundles } of roomChecks) {
    assert.equal(
      hasDist,
      false,
      `${roomId} should not keep dist outputs in workspace`
    );
    assert.deepEqual(
      leakedCaches.map((dirPath) => relative(workspaceRoot, dirPath)),
      [],
      `${roomId} should not keep runtime cache directories in workspace`
    );
    assert.deepEqual(
      leakedBundles.map((filePath) => relative(workspaceRoot, filePath)),
      [],
      `${roomId} should not keep exported bundles inside rooms/`
    );
  }
});

void test("workspace-only room operations do not recreate installed room roots", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "room-source-boundary-"));
  const workspaceRoot = join(tempRoot, "rooms");
  const installedRoot = join(tempRoot, "data", "rooms");
  const runtimeBuildRoot = join(workspaceRoot, ".build");
  const runtimeBuildDir = join(runtimeBuildRoot, "workspace-room", "runtime");
  const roomPartitionRoot = join(
    tempRoot,
    "data",
    "electron-user-data",
    "Partitions",
    "room-workspace-room"
  );
  const roomBuildRoot = join(
    tempRoot,
    "data",
    "room-storage",
    "workspace-room",
    "build",
    "workspace"
  );
  const registryPath = join(tempRoot, "config", "rooms.json");

  try {
    await writeWorkspaceRoomFixture(workspaceRoot, "workspace-room");

    const manager = new RoomPackageManager({
      workspaceRoot,
      runtimeBuildRoot,
      dataRoot: join(tempRoot, "data"),
      registryPath,
    });

    const workspaceRooms = await manager.listWorkspaceRooms();
    assert.equal(workspaceRooms.length, 1);
    assert.equal(workspaceRooms[0]?.manifest?.id, "workspace-room");
    assert.equal(
      existsSync(installedRoot),
      false,
      "workspace discovery should not recreate generated installed room roots"
    );
    assert.equal(
      existsSync(roomPartitionRoot),
      false,
      "workspace discovery should not create room runtime partitions"
    );

    const packageResult = await manager.packageWorkspaceRoom("workspace-room");
    assert.equal(packageResult.success, true, packageResult.error);
    assert.equal(
      existsSync(installedRoot),
      false,
      "workspace packaging should not recreate generated installed room roots"
    );
    assert.equal(
      existsSync(roomPartitionRoot),
      false,
      "workspace packaging should not create room runtime partitions"
    );
    assert.equal(
      existsSync(roomBuildRoot),
      false,
      "workspace packaging should not materialize generated room builds under room-storage"
    );
    assert.equal(
      existsSync(runtimeBuildDir),
      true,
      "workspace packaging should materialize a generated room build under rooms/.build"
    );
    assert.equal(
      existsSync(
        join(
          tempRoot,
          "data",
          "room-storage",
          "workspace-room",
          "exports",
          "workspace-room.hevroom.json"
        )
      ),
      true
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

void test("room runtime residue is preserved by default and only cleared by explicit deleteData cleanup", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "room-runtime-residue-policy-"));
  const workspaceRoot = join(tempRoot, "rooms");
  const dataRoot = join(tempRoot, "data");
  const runtimeBuildRoot = join(workspaceRoot, ".build");
  const runtimeArtifactRoot = join(runtimeBuildRoot, "workspace-room");
  const runtimeBuildDir = join(runtimeArtifactRoot, "runtime");
  const roomStorageRoot = join(tempRoot, "data", "room-storage", "workspace-room");
  const roomToolRuntimeRoot = join(roomStorageRoot, "tools", "runtime", "linux-x64", "ffmpeg");
  const roomPartitionRoot = join(
    tempRoot,
    "data",
    "electron-user-data",
    "Partitions",
    "room-workspace-room"
  );
  const registryPath = join(tempRoot, "config", "rooms.json");

  try {
    await writeWorkspaceRoomFixture(workspaceRoot, "workspace-room");

    const manager = new RoomPackageManager({
      workspaceRoot,
      runtimeBuildRoot,
      dataRoot,
      registryPath,
    });

    const installResult = await manager.installFromWorkspace("workspace-room");
    assert.equal(installResult.success, true, installResult.error);
    assert.equal(
      existsSync(join(runtimeBuildDir, "manifest.json")),
      true,
      "workspace installs should generate runtime package artifacts under rooms/.build"
    );

    await mkdir(roomStorageRoot, { recursive: true });
    await mkdir(roomToolRuntimeRoot, { recursive: true });
    await mkdir(roomPartitionRoot, { recursive: true });
    await writeFile(
      join(roomStorageRoot, "state.json"),
      JSON.stringify({ roomId: "workspace-room" }),
      "utf8"
    );
    await writeFile(join(roomToolRuntimeRoot, "ffmpeg"), "binary", "utf8");
    await writeFile(
      join(roomPartitionRoot, "session.json"),
      JSON.stringify({ roomId: "workspace-room" }),
      "utf8"
    );

    const removeWithoutData = await manager.removeInstalledRoom("workspace-room");
    assert.equal(removeWithoutData.success, true, removeWithoutData.error);
    assert.equal(
      existsSync(runtimeArtifactRoot),
      false,
      "uninstall should remove the generated runtime artifact even when data is preserved"
    );
    assert.equal(
      existsSync(join(roomStorageRoot, "state.json")),
      true,
      "room-storage residue should be preserved until deleteData is requested"
    );
    assert.equal(
      existsSync(join(roomToolRuntimeRoot, "ffmpeg")),
      true,
      "room-local tool runtimes should stay available across reinstall until deleteData is requested"
    );
    assert.equal(
      existsSync(join(roomPartitionRoot, "session.json")),
      true,
      "room partition residue should be preserved until deleteData is requested"
    );

    const reinstallResult = await manager.installFromWorkspace("workspace-room");
    assert.equal(reinstallResult.success, true, reinstallResult.error);
    assert.equal(
      existsSync(join(runtimeBuildDir, "manifest.json")),
      true,
      "reinstall should regenerate runtime package artifacts from rooms/<room-id>"
    );

    const removeWithData = await manager.removeInstalledRoom("workspace-room", {
      deleteData: true,
    });
    assert.equal(removeWithData.success, true, removeWithData.error);
    assert.equal(
      existsSync(runtimeArtifactRoot),
      false,
      "deleteData uninstall should also remove generated runtime package artifacts"
    );
    assert.equal(
      existsSync(roomStorageRoot),
      false,
      "deleteData cleanup should remove room-storage runtime residue"
    );
    assert.equal(
      existsSync(roomPartitionRoot),
      false,
      "deleteData cleanup should remove room partition runtime residue"
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

void test("delete workspace room removes source and generated artifacts without deleting data by default", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "room-delete-workspace-artifacts-"));
  const workspaceRoot = join(tempRoot, "rooms");
  const dataRoot = join(tempRoot, "data");
  const runtimeBuildRoot = join(workspaceRoot, ".build");
  const runtimeArtifactRoot = join(runtimeBuildRoot, "workspace-room");
  const roomStorageRoot = join(dataRoot, "room-storage", "workspace-room");
  const registryPath = join(tempRoot, "config", "rooms.json");

  try {
    await writeWorkspaceRoomFixture(workspaceRoot, "workspace-room");

    const manager = new RoomPackageManager({
      workspaceRoot,
      runtimeBuildRoot,
      dataRoot,
      registryPath,
    });

    const installResult = await manager.installFromWorkspace("workspace-room");
    assert.equal(installResult.success, true, installResult.error);

    await mkdir(roomStorageRoot, { recursive: true });
    await writeFile(
      join(roomStorageRoot, "state.json"),
      JSON.stringify({ roomId: "workspace-room" }),
      "utf8"
    );

    const deleteResult = await manager.deleteWorkspaceRoom("workspace-room");
    assert.equal(deleteResult.success, true, deleteResult.error);
    assert.equal(
      existsSync(join(workspaceRoot, "workspace-room")),
      false,
      "delete workspace should remove the editable source room"
    );
    assert.equal(
      existsSync(runtimeArtifactRoot),
      false,
      "delete workspace should remove generated runtime package artifacts"
    );
    assert.equal(
      existsSync(join(roomStorageRoot, "state.json")),
      true,
      "delete workspace should preserve room data unless deleteData is explicit"
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

void test("startup sync repairs registry records whose generated runtime manifest was removed", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "room-startup-sync-repair-"));
  const workspaceRoot = join(tempRoot, "rooms");
  const dataRoot = join(tempRoot, "data");
  const runtimeBuildRoot = join(workspaceRoot, ".build");
  const runtimeManifestPath = join(runtimeBuildRoot, "workspace-room", "runtime", "manifest.json");
  const registryPath = join(tempRoot, "config", "rooms.json");

  try {
    await writeWorkspaceRoomFixture(workspaceRoot, "workspace-room");

    const manager = new RoomPackageManager({
      workspaceRoot,
      runtimeBuildRoot,
      dataRoot,
      registryPath,
    });

    const installResult = await manager.installFromWorkspace("workspace-room");
    assert.equal(installResult.success, true, installResult.error);
    await rm(runtimeManifestPath, { force: true });

    const syncResult = await manager.syncLinkedWorkspaceRoomsOnStartup();
    assert.equal(syncResult.success, true, syncResult.error);
    assert.deepEqual(syncResult.syncedRoomIds, ["workspace-room"]);
    assert.equal(
      existsSync(runtimeManifestPath),
      true,
      "startup sync should rebuild missing generated runtime manifests before hydration"
    );
    assert.equal(syncResult.snapshot?.rooms.length, 1);
    assert.equal(syncResult.snapshot.rooms[0]?.id, "workspace-room");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

void test("startup sync restores legacy installed-only room sources before hydration", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "room-legacy-source-restore-"));
  const workspaceRoot = join(tempRoot, "rooms");
  const dataRoot = join(tempRoot, "data");
  const legacyInstalledRoot = join(dataRoot, "rooms");
  const legacyRoomDir = join(legacyInstalledRoot, "legacy-room");
  const runtimeBuildRoot = join(workspaceRoot, ".build");
  const runtimeManifestPath = join(runtimeBuildRoot, "legacy-room", "runtime", "manifest.json");
  const registryPath = join(tempRoot, "config", "rooms.json");
  const now = "2026-04-25T00:00:00.000Z";

  try {
    await writeWorkspaceRoomFixture(legacyInstalledRoot, "legacy-room");
    await mkdir(join(legacyRoomDir, "tools", "runtime", "linux-x64"), { recursive: true });
    await writeFile(join(legacyRoomDir, ".room-install-files.json"), "{}", "utf8");
    await writeFile(
      join(legacyRoomDir, "tools", "runtime", "linux-x64", "ffmpeg"),
      "binary",
      "utf8"
    );

    const manifest = JSON.parse(await readFile(join(legacyRoomDir, "manifest.json"), "utf8")) as Record<string, unknown>;
    const legacyRecord = buildInstalledRoomRecord(manifest as unknown as Parameters<typeof buildInstalledRoomRecord>[0], {
      installedAt: now,
      installedDir: legacyRoomDir,
      sourceDir: legacyRoomDir,
      updatedAt: now,
    });
    await mkdir(join(tempRoot, "config"), { recursive: true });
    await writeFile(
      registryPath,
      JSON.stringify(
        {
          rooms: [legacyRecord],
          updatedAt: now,
          version: ROOM_SCHEMA_VERSION,
        },
        null,
        2
      ),
      "utf8"
    );

    const manager = new RoomPackageManager({
      workspaceRoot,
      runtimeBuildRoot,
      dataRoot,
      registryPath,
    });

    const syncResult = await manager.syncLinkedWorkspaceRoomsOnStartup();
    assert.equal(syncResult.success, true, syncResult.error);
    assert.deepEqual(syncResult.syncedRoomIds, ["legacy-room"]);
    assert.equal(existsSync(join(workspaceRoot, "legacy-room", "manifest.json")), true);
    assert.equal(existsSync(join(workspaceRoot, "legacy-room", ".room-install-files.json")), false);
    assert.equal(
      existsSync(join(workspaceRoot, "legacy-room", "tools", "runtime", "linux-x64", "ffmpeg")),
      false
    );
    assert.equal(existsSync(runtimeManifestPath), true);

    const registry = JSON.parse(await readFile(registryPath, "utf8")) as {
      rooms: Array<{ installedDir?: string; sourceDir?: string }>;
    };
    assert.equal(registry.rooms[0]?.sourceDir, join(workspaceRoot, "legacy-room"));
    assert.equal(registry.rooms[0].installedDir, join(runtimeBuildRoot, "legacy-room", "runtime"));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

void test("generated room cleanup script targets only generated legacy room roots", async () => {
  const cleanupSource = await readFile(
    resolve("scripts/rooms/clean-generated-room-artifacts.ts"),
    "utf8"
  );

  assert.match(cleanupSource, /Paths\.getGeneratedRoomsDir\(\)/);
  assert.match(cleanupSource, /restoreLegacyRoomSource\(roomId\)/);
  assert.match(cleanupSource, /installFromWorkspace\(roomId\)/);
  assert.match(cleanupSource, /syncLinkedWorkspaceRoomsOnStartup\(\)/);
  assert.match(cleanupSource, /join\(roomStorageRoot, roomId, "build"\)/);
  assert.match(cleanupSource, /migrateLegacyToolRuntime\(roomId\)/);
  assert.match(cleanupSource, /Paths\.getInstalledRoomsDir\(\)/);
  assert.doesNotMatch(cleanupSource, /rm\(storageDir/);
});

void test("legacy installed room copies stay absent and runtime bundle exports live under data/room-storage", async () => {
  const installedRoot = resolve("data/rooms");
  const storageRoot = resolve("data/room-storage");
  const installedDirectories = existsSync(installedRoot)
    ? await walkDirectories(installedRoot)
    : [];
  const installedFiles = existsSync(installedRoot) ? await walkFiles(installedRoot) : [];
  const storageFiles = existsSync(storageRoot) ? await walkFiles(storageRoot) : [];

  const installedDistDirs = installedDirectories
    .filter((dirPath) => dirPath.endsWith("/dist") || dirPath.endsWith("\\dist"))
    .map((dirPath) => relative(installedRoot, dirPath));
  const installedRuntimeCaches = installedDirectories
    .filter((dirPath) => dirPath.endsWith("/__pycache__") || dirPath.endsWith("\\__pycache__"))
    .map((dirPath) => relative(installedRoot, dirPath));
  const installedBundleFiles = installedFiles
    .filter((filePath) => filePath.endsWith(".hevroom") || filePath.endsWith(".hevroom.json"))
    .map((filePath) => relative(installedRoot, filePath));
  const storageBundleFiles = storageFiles
    .filter((filePath) => filePath.endsWith(".hevroom") || filePath.endsWith(".hevroom.json"))
    .map((filePath) => relative(storageRoot, filePath));

  assert.deepEqual(
    installedDistDirs,
    [],
    "installed room copies should not contain dist directories"
  );
  assert.deepEqual(
    installedRuntimeCaches,
    [],
    "installed room copies should not contain runtime cache directories"
  );
  assert.deepEqual(
    installedBundleFiles,
    [],
    "installed room copies should not contain exported bundles"
  );
  assert.equal(
    storageBundleFiles.every(
      (filePath) => filePath.includes("/exports/") || filePath.includes("\\exports\\")
    ),
    true,
    "room bundle exports must live under data/room-storage/<room>/exports"
  );
});

void test("generic room core sources do not hardcode room-specific package ids", async () => {
  const coreRoots = [resolve("src"), resolve("electron"), resolve("scripts/rooms")];
  const roomSpecificTokens = ["laboratory", "game-room"];
  const allowedPathSuffixes = [
    "scripts/rooms/build-room-bundle.mjs",
    "scripts/rooms/migrate-room-layouts.mjs",
  ];
  const rootResults = await Promise.all(
    coreRoots
      .filter((rootPath) => existsSync(rootPath))
      .map(async (rootPath) => {
        const files = await walkFiles(rootPath);
        const fileChecks = files
          .map((filePath) => {
            const relativePath = relative(resolve("."), filePath).replace(/\\/g, "/");
            return { filePath, relativePath };
          })
          .filter(({ relativePath }) => !allowedPathSuffixes.includes(relativePath));
        const contents = await Promise.all(
          fileChecks.map(async ({ filePath }) => await readFile(filePath, "utf8"))
        );
        return fileChecks
          .filter((_, i) => roomSpecificTokens.some((token) => contents[i]!.includes(token)))
          .map(({ relativePath }) => relativePath);
      })
  );
  const leaks = rootResults.flat();

  assert.deepEqual(
    leaks,
    [],
    "generic room core should not hardcode current room ids outside explicit room package code"
  );
});
