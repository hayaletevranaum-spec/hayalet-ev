import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildRoomHostModuleDataUrl } from "../../src/js/modules/rooms/room-host-source.ts";
import {
  PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND,
  PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND,
} from "../../rooms/pattern-room/shared/types/pattern-room-case-review-dispatch.ts";
import {
  PATTERN_ROOM_LOAD_COMMAND,
  PATTERN_ROOM_SAVE_COMMAND,
} from "../../rooms/pattern-room/shared/types/pattern-room-persistence.ts";
import { createRoomBuiltArtifact, createRoomInstalledCopy } from "./helpers/room-installed-copy.ts";

type PatternRoomHostModule = {
  default?: {
    activate?: (api: Record<string, unknown>) => {
      commands: Record<string, unknown>;
      dispose?: () => void;
      onRoomEvent?: (event: unknown) => void;
    };
  };
};

async function importRoomHostModule(targetPath: string): Promise<PatternRoomHostModule> {
  const absolutePath = resolve(targetPath);
  const moduleUrl = await buildRoomHostModuleDataUrl(absolutePath, async (filePath) => {
    return await readFile(filePath, "utf8");
  });
  return (await import(
    `${moduleUrl}#pattern-room-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )) as PatternRoomHostModule;
}

function assertPatternRoomHostModule(moduleNamespace: PatternRoomHostModule): void {
  assert.equal(typeof moduleNamespace.default?.activate, "function");
  const activation = (moduleNamespace.default as NonNullable<typeof moduleNamespace.default>)
    .activate!({});
  assert.deepEqual(Object.keys(activation.commands).sort(), [
    PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND,
    PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND,
    PATTERN_ROOM_LOAD_COMMAND,
    PATTERN_ROOM_SAVE_COMMAND,
  ]);
  assert.equal(typeof activation.commands[PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND], "function");
  assert.equal(typeof activation.commands[PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND], "function");
  assert.equal(typeof activation.commands[PATTERN_ROOM_LOAD_COMMAND], "function");
  assert.equal(typeof activation.commands[PATTERN_ROOM_SAVE_COMMAND], "function");
  assert.equal(typeof activation.onRoomEvent, "function");
  activation.onRoomEvent?.({ type: "host-context" });
  activation.dispose?.();
}

void test("pattern-room build artifact host imports with persistence commands", async () => {
  const buildArtifact = await createRoomBuiltArtifact("pattern-room");

  try {
    assertPatternRoomHostModule(
      await importRoomHostModule(`${buildArtifact.rootDir}/host/index.js`)
    );
  } finally {
    await buildArtifact.cleanup();
  }
});

void test("pattern-room installed host imports with persistence commands", async () => {
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    assertPatternRoomHostModule(
      await importRoomHostModule(`${installedCopy.rootDir}/host/index.js`)
    );
  } finally {
    await installedCopy.cleanup();
  }
});
