import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { RoomPackageManager } from "../../electron/room-package-manager.ts";

async function waitForFsTick(): Promise<void> {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
}

void test("forge-room installs into the registry and startup sync refreshes the installed copy", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "forge-room-install-sync-"));
  const workspaceRoot = join(tempRoot, "rooms");
  const installedRoot = join(tempRoot, "data", "rooms");
  const registryPath = join(tempRoot, "config", "rooms.json");
  const forgeWorkspaceCopy = join(workspaceRoot, "forge-room");

  try {
    await cp(resolve("rooms/forge-room"), forgeWorkspaceCopy, { recursive: true });

    const manager = new RoomPackageManager({
      workspaceRoot,
      installedRoot,
      registryPath,
    });

    const installResult = await manager.installFromWorkspace("forge-room");
    assert.equal(installResult.success, true, installResult.error);
    assert.equal(installResult.room?.id, "forge-room");
    assert.equal(
      installResult.room.runtimeEntryPath,
      join(installedRoot, "forge-room", "ui", "index.html")
    );
    assert.equal(installResult.room.hostEntryPath, join(installedRoot, "forge-room", "host", "index.js"));
    assert.equal(installResult.room.workbench?.experienceId, "forge-workbench");
    assert.equal(installResult.room.features[0]?.scene?.view.id, "forge-room-console");
    assert.equal(existsSync(join(installedRoot, "forge-room", "ui", "index.js")), true);

    const registry = JSON.parse(await readFile(registryPath, "utf8")) as {
      rooms: Array<{
        defaultFeatureId?: string;
        id?: string;
        workbench?: { experienceId?: string; primaryFeatureId?: string };
      }>;
    };
    const forgeRegistryEntry = registry.rooms.find((room) => room.id === "forge-room");
    assert.equal(forgeRegistryEntry?.defaultFeatureId, "forge-workbench");
    assert.equal(forgeRegistryEntry.workbench?.experienceId, "forge-workbench");
    assert.equal(forgeRegistryEntry.workbench.primaryFeatureId, "forge-workbench");

    await waitForFsTick();
    await writeFile(
      join(forgeWorkspaceCopy, "ui", "index.html"),
      [
        "<!doctype html>",
        '<html lang="en">',
        "  <body>",
        '    <div id="app" data-forge-sync="updated"></div>',
        '    <script type="module" src="./bootstrap.js"></script>',
        "  </body>",
        "</html>",
        "",
      ].join("\n"),
      "utf8"
    );

    const syncResult = await manager.syncLinkedWorkspaceRoomsOnStartup();
    assert.equal(syncResult.success, true, syncResult.error);
    assert.deepEqual(syncResult.syncedRoomIds, ["forge-room"]);
    assert.equal(syncResult.snapshot?.rooms.some((room) => room.id === "forge-room"), true);
    assert.match(
      await readFile(join(installedRoot, "forge-room", "ui", "index.html"), "utf8"),
      /data-forge-sync="updated"/
    );

    const secondSyncResult = await manager.syncLinkedWorkspaceRoomsOnStartup();
    assert.equal(secondSyncResult.success, true, secondSyncResult.error);
    assert.deepEqual(secondSyncResult.syncedRoomIds, []);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
