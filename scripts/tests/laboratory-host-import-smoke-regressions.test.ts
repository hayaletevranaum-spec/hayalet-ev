import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildRoomHostModuleDataUrl } from "../../src/js/modules/rooms/room-host-source.ts";
import { createRoomBuiltArtifact, createRoomInstalledCopy } from "./helpers/room-installed-copy.ts";

async function importRoomHostModule(targetPath: string): Promise<Record<string, unknown>> {
  const absolutePath = resolve(targetPath);
  const moduleUrl = await buildRoomHostModuleDataUrl(absolutePath, async (filePath) => {
    return await readFile(filePath, "utf8");
  });
  return (await import(`${moduleUrl}#smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`)) as Record<string, unknown>;
}

void test("laboratory build artifact host imports cleanly through the room host loader graph", async () => {
  const buildArtifact = await createRoomBuiltArtifact("laboratory");

  try {
    const moduleNamespace = (await importRoomHostModule(`${buildArtifact.rootDir}/host/index.js`)) as {
      default?: { activate?: unknown };
    };
    assert.equal(typeof moduleNamespace.default?.activate, "function");
  } finally {
    await buildArtifact.cleanup();
  }
});

void test("laboratory installed host imports cleanly through the portable room host loader graph", async () => {
  const installedCopy = await createRoomInstalledCopy("laboratory");

  try {
    const moduleNamespace = (await importRoomHostModule(`${installedCopy.rootDir}/host/index.js`)) as {
      default?: { activate?: unknown };
    };
    assert.equal(typeof moduleNamespace.default?.activate, "function");
  } finally {
    await installedCopy.cleanup();
  }
});
