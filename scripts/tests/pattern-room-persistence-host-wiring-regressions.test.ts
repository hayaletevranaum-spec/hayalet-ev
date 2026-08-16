import { PATTERN_ROOM_DOMAIN } from "../../rooms/pattern-room/shared/data/pattern-room-domain.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { RoomCommandRegistry } from "../../src/js/modules/rooms/room-command-registry.ts";
import type { InstalledRoomRecord } from "../../src/types/rooms.ts";
import createPatternRoomHostRuntime from "../../rooms/pattern-room/host/runtime.ts";
import { PATTERN_ROOM_DOMAIN_TEST_FIXTURE } from "../../rooms/pattern-room/shared/data/testing/pattern-room-domain.fixture.ts";
import { createLocalState } from "../../rooms/pattern-room/shared/state/pattern-room-local-state.ts";
import { createSnapshot } from "../../rooms/pattern-room/shared/state/pattern-room-snapshot.ts";
import {
  PATTERN_ROOM_LOAD_COMMAND,
  PATTERN_ROOM_LOADED_EVENT,
  PATTERN_ROOM_SAVE_COMMAND,
  PATTERN_ROOM_SAVED_EVENT,
  PATTERN_ROOM_SAVE_FAILED_EVENT,
} from "../../rooms/pattern-room/shared/types/pattern-room-persistence.ts";
import type {
  PatternRoomSnapshotMeta,
  PatternRoomStorageAdapter,
} from "../../rooms/pattern-room/shared/types/pattern-room-storage.ts";
import type { PatternRoomSessionSnapshot } from "../../rooms/pattern-room/shared/types/pattern-room-snapshot.ts";

type PatternRoomNotification = {
  payload: Record<string, unknown>;
  type: string;
};

const PATTERN_ROOM_RECORD: InstalledRoomRecord = {
  id: "pattern-room",
  name: "Pattern Room",
  version: "2.0.0",
  installedDir: "/workspace/rooms/.build/pattern-room/runtime",
  sourceDir: "/workspace/rooms/pattern-room",
  manifestPath: "/workspace/rooms/.build/pattern-room/runtime/manifest.json",
  runtimeEntryPath: "/workspace/rooms/.build/pattern-room/runtime/ui/index.html",
  hostEntryPath: "/workspace/rooms/.build/pattern-room/runtime/host/index.js",
  defaultFeatureId: "pattern-workbench",
  features: [{ id: "pattern-workbench", name: "Pattern Workbench" }],
  commandSpecs: [],
  installedAt: "2026-05-21T00:00:00.000Z",
  updatedAt: "2026-05-21T00:00:00.000Z",
};

function createTestSnapshot(snapshotId: string): PatternRoomSessionSnapshot {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.addLocalNote(`Persistence host note ${snapshotId}`);
  return {
    ...createSnapshot(localState, "archive"),
    snapshotId,
  };
}

function createMockStorageAdapter(
  overrides: Partial<PatternRoomStorageAdapter> = {}
): PatternRoomStorageAdapter {
  return {
    async delete(_snapshotId: string): Promise<void> {
      await Promise.resolve();
    },
    async list(): Promise<PatternRoomSnapshotMeta[]> {
      return await Promise.resolve([]);
    },
    async load(_topicId: string): Promise<PatternRoomSessionSnapshot | null> {
      return await Promise.resolve(null);
    },
    async save(_snapshot: PatternRoomSessionSnapshot): Promise<void> {
      await Promise.resolve();
    },
    ...overrides,
  };
}

function activateWithStore(store: PatternRoomStorageAdapter): {
  activation: ReturnType<ReturnType<typeof createPatternRoomHostRuntime>["activate"]>;
  notifications: PatternRoomNotification[];
} {
  const notifications: PatternRoomNotification[] = [];
  const activation = createPatternRoomHostRuntime({
    storageAdapter: store,
  }).activate({
    notifyRoom(type, payload = {}) {
      notifications.push({ payload, type });
    },
  });

  return { activation, notifications };
}

async function withMockWindow<T>(
  windowValue: Record<string, unknown>,
  run: () => Promise<T>
): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowValue,
  });

  try {
    return await run();
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "window", descriptor);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
}

function createDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolvePromise: (() => void) | null = null;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(): void {
      resolvePromise?.();
    },
  };
}

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

async function waitForQueueCheckpoint(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }
    await tick();
  }

  assert.fail("Timed out waiting for the save queue checkpoint.");
}

function readManifestCommandNames(manifest: Record<string, unknown>): string[] {
  const rootCommandSpecs = Array.isArray(manifest["commandSpecs"])
    ? (manifest["commandSpecs"] as Array<Record<string, unknown>>)
    : [];
  const features = Array.isArray(manifest["features"])
    ? (manifest["features"] as Array<Record<string, unknown>>)
    : [];
  const featureCommandSpecs = features.flatMap((feature) => {
    return Array.isArray(feature["commandSpecs"])
      ? (feature["commandSpecs"] as Array<Record<string, unknown>>)
      : [];
  });

  return [...rootCommandSpecs, ...featureCommandSpecs]
    .map((spec) => spec["name"])
    .filter((name): name is string => typeof name === "string");
}

void test("pattern-room persistence contract exports stable command and event literals", () => {
  assert.equal(PATTERN_ROOM_SAVE_COMMAND, "pattern:save");
  assert.equal(PATTERN_ROOM_LOAD_COMMAND, "pattern:load");
  assert.equal(PATTERN_ROOM_SAVED_EVENT, "pattern:saved");
  assert.equal(PATTERN_ROOM_LOADED_EVENT, "pattern:loaded");
  assert.equal(PATTERN_ROOM_SAVE_FAILED_EVENT, "pattern:save-failed");
});

void test("pattern-room persistence commands stay out of manifest public command specs", async () => {
  const manifest = JSON.parse(
    await readFile(resolve("rooms/pattern-room/manifest.json"), "utf8")
  ) as Record<string, unknown>;
  const commandNames = readManifestCommandNames(manifest);

  assert.equal(commandNames.includes(PATTERN_ROOM_SAVE_COMMAND), false);
  assert.equal(commandNames.includes(PATTERN_ROOM_LOAD_COMMAND), false);
});

void test("pattern-room persistence commands register as internal room-ui commands only", async () => {
  RoomCommandRegistry.reset();
  const snapshot = createTestSnapshot("snapshot-registry-scope");
  const notifications: PatternRoomNotification[] = [];
  const store = createMockStorageAdapter();

  try {
    RoomCommandRegistry.syncInstalledRooms([PATTERN_ROOM_RECORD]);
    const activation = createPatternRoomHostRuntime({
      storageAdapter: store,
    }).activate({
      notifyRoom(type, payload = {}) {
        notifications.push({ payload, type });
      },
      registerCommand(commandName, handler, options = {}) {
        RoomCommandRegistry.registerHandler(PATTERN_ROOM_RECORD.id, commandName, handler, options);
      },
    });

    Object.entries(activation.commands).forEach(([commandName, handler]) => {
      RoomCommandRegistry.registerHandler(PATTERN_ROOM_RECORD.id, commandName, handler);
    });

    for (const commandName of [PATTERN_ROOM_SAVE_COMMAND, PATTERN_ROOM_LOAD_COMMAND]) {
      const metadata = RoomCommandRegistry.getMetadata(commandName, PATTERN_ROOM_RECORD.id);
      assert.equal(metadata?.scope, "room-ui");
      assert.equal(metadata.exposure, "internal");
      assert.equal(RoomCommandRegistry.listPublicCommands().includes(commandName), false);
      assert.equal(
        RoomCommandRegistry.getCatalog().some((entry) => entry.name === commandName),
        false
      );
      assert.equal(
        RoomCommandRegistry.getCatalog("ai1-ai2").some((entry) => entry.name === commandName),
        false
      );
      assert.equal(
        RoomCommandRegistry.getCatalog("ai0").some((entry) => entry.name === commandName),
        false
      );
      assert.equal(
        RoomCommandRegistry.getCatalog("us1").some((entry) => entry.name === commandName),
        false
      );
    }

    assert.deepEqual(
      await RoomCommandRegistry.run(PATTERN_ROOM_SAVE_COMMAND, {
        provider: "room-ui",
        roomId: PATTERN_ROOM_RECORD.id,
        roomPayload: { snapshot },
      }),
      { success: true }
    );
    assert.deepEqual(
      await RoomCommandRegistry.run(PATTERN_ROOM_LOAD_COMMAND, {
        provider: "room-ui",
        roomId: PATTERN_ROOM_RECORD.id,
        roomPayload: { topicId: snapshot.topicId },
      }),
      { success: true }
    );

    const providerResults = await Promise.all(
      (["ai0", "ai1", "ai2", "us1", "system"] as const).map(async (provider) => {
        const result = (await RoomCommandRegistry.run(PATTERN_ROOM_SAVE_COMMAND, {
          provider,
          roomId: PATTERN_ROOM_RECORD.id,
          roomPayload: { snapshot },
        })) as { success?: boolean };
        return { result, provider };
      })
    );
    for (const { result, provider } of providerResults) {
      assert.equal(result.success, false, `provider ${provider} should not run persistence save`);
    }

    const wrongRoomResult = (await RoomCommandRegistry.run(PATTERN_ROOM_SAVE_COMMAND, {
      provider: "room-ui",
      roomId: "forge-room",
      roomPayload: { snapshot },
    })) as { success?: boolean };
    assert.equal(wrongRoomResult.success, false);
    assert.deepEqual(
      notifications.map((entry) => entry.type),
      [PATTERN_ROOM_SAVED_EVENT, PATTERN_ROOM_LOADED_EVENT]
    );
  } finally {
    RoomCommandRegistry.reset();
  }
});

void test("pattern-room host emits saved after a successful save command", async () => {
  const snapshot = createTestSnapshot("snapshot-save-success");
  const savedSnapshots: PatternRoomSessionSnapshot[] = [];
  const { activation, notifications } = activateWithStore(
    createMockStorageAdapter({
      async save(nextSnapshot): Promise<void> {
        savedSnapshots.push(nextSnapshot);
        await Promise.resolve();
      },
    })
  );

  const result = await activation.commands[PATTERN_ROOM_SAVE_COMMAND]({ snapshot });

  assert.deepEqual(result, { success: true });
  assert.deepEqual(savedSnapshots, [snapshot]);
  assert.deepEqual(notifications, [
    {
      payload: { success: true },
      type: PATTERN_ROOM_SAVED_EVENT,
    },
  ]);
});

void test("pattern-room host emits save-failed after an invalid or rejected save command", async () => {
  const rejectedSnapshot = createTestSnapshot("snapshot-save-rejected");
  const { activation, notifications } = activateWithStore(
    createMockStorageAdapter({
      async save(): Promise<void> {
        await Promise.reject(new Error("disk path /private/verbose/details could not be written"));
      },
    })
  );

  const invalidResult = await activation.commands[PATTERN_ROOM_SAVE_COMMAND]({
    snapshot: { roomId: "pattern-room" },
  });
  const rejectedResult = await activation.commands[PATTERN_ROOM_SAVE_COMMAND]({
    snapshot: rejectedSnapshot,
  });

  assert.deepEqual(invalidResult, {
    error: "Pattern Room snapshot payload is invalid.",
    success: false,
  });
  assert.equal(rejectedResult.success, false);
  assert.deepEqual(
    notifications.map((entry) => entry.type),
    [PATTERN_ROOM_SAVE_FAILED_EVENT, PATTERN_ROOM_SAVE_FAILED_EVENT]
  );
  assert.deepEqual(notifications[0]?.payload, {
    error: "Pattern Room snapshot payload is invalid.",
    success: false,
  });
  assert.equal(typeof notifications[1]?.payload["error"], "string");
});

void test("pattern-room host emits loaded with a snapshot or null", async () => {
  const loadedSnapshot = createTestSnapshot("snapshot-load-hit");
  const loadedTopicIds: string[] = [];
  const { activation, notifications } = activateWithStore(
    createMockStorageAdapter({
      async load(topicId): Promise<PatternRoomSessionSnapshot | null> {
        loadedTopicIds.push(topicId);
        return await Promise.resolve(topicId === loadedSnapshot.topicId ? loadedSnapshot : null);
      },
    })
  );

  await activation.commands[PATTERN_ROOM_LOAD_COMMAND]({
    topicId: loadedSnapshot.topicId,
  });
  await activation.commands[PATTERN_ROOM_LOAD_COMMAND]({
    topicId: "missing-topic",
  });

  assert.deepEqual(loadedTopicIds, [loadedSnapshot.topicId, "missing-topic"]);
  assert.deepEqual(notifications, [
    {
      payload: { snapshot: loadedSnapshot },
      type: PATTERN_ROOM_LOADED_EVENT,
    },
    {
      payload: { snapshot: null },
      type: PATTERN_ROOM_LOADED_EVENT,
    },
  ]);
});

void test("pattern-room host default storage uses the preload file bridge", async () => {
  const snapshot = createTestSnapshot("snapshot-preload-bridge");
  const storageDir = "/room-storage/pattern-room";
  const fileByPath = new Map<string, string>();
  const notifications: PatternRoomNotification[] = [];

  await withMockWindow(
    {
      electronAPI: {
        fmWriteFileAtomic(payload: Record<string, unknown>): Record<string, unknown> {
          const filePath = typeof payload["path"] === "string" ? payload["path"] : "";
          const data = typeof payload["data"] === "string" ? payload["data"] : "";
          fileByPath.set(filePath, data);
          return { path: filePath, success: true };
        },
        readDirectoryFiles(): Array<Record<string, unknown>> {
          return Array.from(fileByPath.keys()).map((filePath) => {
            return {
              isDirectory: false,
              name: filePath.split("/").pop(),
              path: filePath,
            };
          });
        },
        readFile(filePath: string): string | null {
          const data = fileByPath.get(filePath);
          return data === undefined ? null : Buffer.from(data, "utf8").toString("base64");
        },
        roomToolsCall(request: Record<string, unknown>): Record<string, unknown> {
          if (request["operation"] === "resolve-paths") {
            return { paths: { storageDir } };
          }
          if (request["operation"] === "delete-path" && typeof request["targetPath"] === "string") {
            fileByPath.delete(request["targetPath"]);
            return { success: true };
          }
          return { success: false };
        },
      },
    },
    async () => {
      const activation = createPatternRoomHostRuntime({ storageDir }).activate({
        notifyRoom(type, payload = {}) {
          notifications.push({ payload, type });
        },
      });

      assert.deepEqual(await activation.commands[PATTERN_ROOM_SAVE_COMMAND]({ snapshot }), {
        success: true,
      });
      assert.deepEqual(
        await activation.commands[PATTERN_ROOM_LOAD_COMMAND]({ topicId: snapshot.topicId }),
        { success: true }
      );
      await activation.dispose();
    }
  );

  assert.deepEqual(
    notifications.map((entry) => entry.type),
    [PATTERN_ROOM_SAVED_EVENT, PATTERN_ROOM_LOADED_EVENT]
  );
  assert.deepEqual(notifications[1]?.payload, { snapshot });
});

void test("pattern-room host serializes save commands without dropping submitted snapshots", async () => {
  const firstSnapshot = createTestSnapshot("snapshot-serial-first");
  const secondSnapshot = createTestSnapshot("snapshot-serial-second");
  const firstSave = createDeferred();
  const events: string[] = [];
  let activeSaves = 0;
  const { activation } = activateWithStore(
    createMockStorageAdapter({
      async save(snapshot): Promise<void> {
        activeSaves += 1;
        assert.equal(activeSaves, 1);
        events.push(`start:${snapshot.snapshotId}`);
        if (snapshot.snapshotId === firstSnapshot.snapshotId) {
          await firstSave.promise;
        }
        events.push(`end:${snapshot.snapshotId}`);
        activeSaves -= 1;
      },
    })
  );

  const firstResult = activation.commands[PATTERN_ROOM_SAVE_COMMAND]({
    snapshot: firstSnapshot,
  });
  const secondResult = activation.commands[PATTERN_ROOM_SAVE_COMMAND]({
    snapshot: secondSnapshot,
  });

  await waitForQueueCheckpoint(() => events.length === 1);
  assert.deepEqual(events, [`start:${firstSnapshot.snapshotId}`]);

  firstSave.resolve();
  assert.deepEqual(await Promise.all([firstResult, secondResult]), [
    { success: true },
    { success: true },
  ]);
  assert.deepEqual(events, [
    `start:${firstSnapshot.snapshotId}`,
    `end:${firstSnapshot.snapshotId}`,
    `start:${secondSnapshot.snapshotId}`,
    `end:${secondSnapshot.snapshotId}`,
  ]);
});

void test("pattern-room host save queue recovers after a failed save", async () => {
  const firstSnapshot = createTestSnapshot("snapshot-fail-first");
  const secondSnapshot = createTestSnapshot("snapshot-recovers-second");
  const attemptedSnapshotIds: string[] = [];
  const { activation, notifications } = activateWithStore(
    createMockStorageAdapter({
      async save(snapshot): Promise<void> {
        attemptedSnapshotIds.push(snapshot.snapshotId);
        if (snapshot.snapshotId === firstSnapshot.snapshotId) {
          throw new Error("first write failed");
        }
        await Promise.resolve();
      },
    })
  );

  const firstResult = await activation.commands[PATTERN_ROOM_SAVE_COMMAND]({
    snapshot: firstSnapshot,
  });
  const secondResult = await activation.commands[PATTERN_ROOM_SAVE_COMMAND]({
    snapshot: secondSnapshot,
  });

  assert.equal(firstResult.success, false);
  assert.deepEqual(secondResult, { success: true });
  assert.deepEqual(attemptedSnapshotIds, [firstSnapshot.snapshotId, secondSnapshot.snapshotId]);
  assert.deepEqual(
    notifications.map((entry) => entry.type),
    [PATTERN_ROOM_SAVE_FAILED_EVENT, PATTERN_ROOM_SAVED_EVENT]
  );
});

void test("pattern-room host ready lifecycle best-effort loads the production topic", async () => {
  const loadedTopicIds: string[] = [];
  const { activation, notifications } = activateWithStore(
    createMockStorageAdapter({
      async load(topicId): Promise<PatternRoomSessionSnapshot | null> {
        loadedTopicIds.push(topicId);
        return await Promise.resolve(null);
      },
    })
  );

  await activation.onRoomReady();

  assert.deepEqual(loadedTopicIds, [PATTERN_ROOM_DOMAIN.topic.id]);
  assert.deepEqual(notifications, [
    {
      payload: { snapshot: null },
      type: PATTERN_ROOM_LOADED_EVENT,
    },
  ]);
});

void test("pattern-room host dispose waits for the pending save queue", async () => {
  const snapshot = createTestSnapshot("snapshot-dispose-waits");
  const saveGate = createDeferred();
  let saved = false;
  const { activation } = activateWithStore(
    createMockStorageAdapter({
      async save(): Promise<void> {
        await saveGate.promise;
        saved = true;
      },
    })
  );

  const saveResult = activation.commands[PATTERN_ROOM_SAVE_COMMAND]({ snapshot });
  const disposeResult = activation.dispose();

  await Promise.resolve();
  assert.equal(saved, false);

  saveGate.resolve();
  await disposeResult;
  assert.deepEqual(await saveResult, { success: true });
  assert.equal(saved, true);
});

void test("pattern-room UI runtime wires internal autosave without public persistence UI", async () => {
  const source = await readFile(
    resolve("rooms/pattern-room/ui/pattern-room-ui-runtime.ts"),
    "utf8"
  );

  const expectedUiRuntimeWiring = [
    "AUTOSAVE_DEBOUNCE_MS = 2000",
    "PATTERN_ROOM_LOADED_EVENT",
    "PATTERN_ROOM_SAVE_COMMAND",
    "PATTERN_ROOM_SAVED_EVENT",
    "PATTERN_ROOM_SAVE_FAILED_EVENT",
    "beforeunload",
    "onHostMessage",
    "sendCommand",
    "restoreSnapshot(payload",
    "flush",
  ];

  for (const expected of expectedUiRuntimeWiring) {
    assert.equal(source.includes(expected), true, `UI runtime is missing ${expected}`);
  }

  const forbiddenUiRuntimeWiring = [
    "PATTERN_ROOM_LOAD_COMMAND",
    '"pattern:load"',
    "visibilitychange",
    "pagehide",
    "sendEvent",
    "setInterval",
    "manualSave",
    "manualLoad",
    "saveStatus",
    "sessionPicker",
  ];

  for (const forbidden of forbiddenUiRuntimeWiring) {
    assert.equal(source.includes(forbidden), false, `UI runtime includes ${forbidden}`);
  }

  assert.equal(source.match(/localState\.subscribe/g)?.length, 1);
});
