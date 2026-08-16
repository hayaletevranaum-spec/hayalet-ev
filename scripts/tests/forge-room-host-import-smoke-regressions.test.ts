import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildRoomHostModuleDataUrl } from "../../src/js/modules/rooms/room-host-source.ts";
import { createRoomBuiltArtifact, createRoomInstalledCopy } from "./helpers/room-installed-copy.ts";

type RoomRegistry = {
  rooms?: Array<{
    hostEntryPath?: string;
    id?: string;
  }>;
};

async function importRoomHostModule(targetPath: string): Promise<Record<string, unknown>> {
  const absolutePath = resolve(targetPath);
  const moduleUrl = await buildRoomHostModuleDataUrl(absolutePath, async (filePath) => {
    return await readFile(filePath, "utf8");
  });
  return (await import(`${moduleUrl}#smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`)) as Record<string, unknown>;
}

async function resolveLiveForgeRoomHostEntryPath() {
  const legacyRepoDataCopyPath = resolve("data/rooms/forge-room/host/index.js");

  try {
    const registry = JSON.parse(await readFile(resolve("config/rooms.json"), "utf8")) as RoomRegistry;
    const registryHostEntryPath = registry.rooms?.find((room) => room.id === "forge-room")?.hostEntryPath;
    if (typeof registryHostEntryPath === "string" && registryHostEntryPath.trim() !== "") {
      return resolve(registryHostEntryPath);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return legacyRepoDataCopyPath;
}

void test("forge-room build artifact host imports cleanly through the room host loader graph", async () => {
  const buildArtifact = await createRoomBuiltArtifact("forge-room");

  try {
    const moduleNamespace = (await importRoomHostModule(`${buildArtifact.rootDir}/host/index.js`)) as {
      default?: { activate?: unknown };
    };
    assert.equal(typeof moduleNamespace.default?.activate, "function");
  } finally {
    await buildArtifact.cleanup();
  }
});

void test("forge-room installed host imports cleanly through the portable room host loader graph", async () => {
  const installedCopy = await createRoomInstalledCopy("forge-room");

  try {
    const moduleNamespace = (await importRoomHostModule(`${installedCopy.rootDir}/host/index.js`)) as {
      default?: { activate?: unknown };
    };
    assert.equal(typeof moduleNamespace.default?.activate, "function");
  } finally {
    await installedCopy.cleanup();
  }
});

void test("forge-room live installed host artifact imports cleanly from the repo registry", async (t) => {
  const repoHostEntryPath = await resolveLiveForgeRoomHostEntryPath();
  try {
    await access(repoHostEntryPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      t.skip(`forge-room live installed host artifact is unavailable at ${repoHostEntryPath}`);
      return;
    }
    throw error;
  }

  const moduleNamespace = (await importRoomHostModule(repoHostEntryPath)) as {
    default?: { activate?: unknown };
  };
  assert.equal(typeof moduleNamespace.default?.activate, "function");
});
