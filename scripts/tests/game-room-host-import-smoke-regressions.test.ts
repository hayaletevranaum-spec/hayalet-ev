import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildRoomHostModuleDataUrl } from "../../src/js/modules/rooms/room-host-source.ts";
import { createRoomBuiltArtifact, createRoomInstalledCopy } from "./helpers/room-installed-copy.ts";

async function importRoomHostModule(targetPath: string): Promise<{ default?: { activate?: unknown } }> {
  const absolutePath = resolve(targetPath);
  const moduleUrl = await buildRoomHostModuleDataUrl(absolutePath, async (filePath) => {
    return await readFile(filePath, "utf8");
  });
  return await import(`${moduleUrl}#game-room-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`) as { default?: { activate?: unknown } };
}

void test("game-room build artifact host imports cleanly through the room host loader graph", async () => {
  const buildArtifact = await createRoomBuiltArtifact("game-room");

  try {
    const moduleNamespace = await importRoomHostModule(`${buildArtifact.rootDir}/host/index.js`);

    assert.equal(typeof moduleNamespace.default?.activate, "function");
  } finally {
    await buildArtifact.cleanup();
  }
});

void test("game-room installed host imports cleanly through the portable room host loader graph", async () => {
  const installedCopy = await createRoomInstalledCopy("game-room");

  try {
    const moduleNamespace = await importRoomHostModule(`${installedCopy.rootDir}/host/index.js`);

    assert.equal(typeof moduleNamespace.default?.activate, "function");
  } finally {
    await installedCopy.cleanup();
  }
});
