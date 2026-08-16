import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PatternRoomJsonStore } from "../../rooms/pattern-room/host/pattern-room-json-store.ts";
import { PATTERN_ROOM_DOMAIN_TEST_FIXTURE } from "../../rooms/pattern-room/shared/data/testing/pattern-room-domain.fixture.ts";
import { createLocalState } from "../../rooms/pattern-room/shared/state/pattern-room-local-state.ts";
import { createSnapshot } from "../../rooms/pattern-room/shared/state/pattern-room-snapshot.ts";
import type { PatternRoomSessionSnapshot } from "../../rooms/pattern-room/shared/types/pattern-room-snapshot.ts";

function createTestSnapshot(): PatternRoomSessionSnapshot {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.addLocalNote("Storage contract smoke note");
  return createSnapshot(localState, "archive");
}

async function withTempStore(
  run: (store: PatternRoomJsonStore, rootDir: string) => Promise<void>
): Promise<void> {
  const rootDir = await mkdtemp(join(tmpdir(), "pattern-room-storage-"));
  try {
    await run(new PatternRoomJsonStore(rootDir), rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

async function assertOnlyFinalSnapshotFile(rootDir: string, topicId: string): Promise<void> {
  assert.deepEqual((await readdir(rootDir)).sort(), [`${topicId}.snapshot.json`]);
}

void test("pattern-room storage contract saves and loads a session snapshot", async () => {
  await withTempStore(async (store) => {
    const snapshot = createTestSnapshot();

    await store.save(snapshot);
    const loaded = await store.load(snapshot.topicId);

    assert.deepEqual(loaded, snapshot);
  });
});

void test("pattern-room storage contract overwrites the topic snapshot on upsert", async () => {
  await withTempStore(async (store) => {
    const snapshot = createTestSnapshot();
    const updatedSnapshot: PatternRoomSessionSnapshot = {
      ...snapshot,
      snapshotId: `${snapshot.snapshotId}-updated`,
      updatedAt: "2026-05-21T10:30:00.000Z",
    };

    await store.save(snapshot);
    await store.save(updatedSnapshot);

    const loaded = await store.load(snapshot.topicId);
    const listed = await store.list();

    assert.equal(loaded?.snapshotId, updatedSnapshot.snapshotId);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.snapshotId, updatedSnapshot.snapshotId);
  });
});

void test("pattern-room storage contract lists snapshot metadata", async () => {
  await withTempStore(async (store) => {
    const snapshot = createTestSnapshot();

    await store.save(snapshot);

    assert.deepEqual(await store.list(), [
      {
        snapshotId: snapshot.snapshotId,
        topicId: snapshot.topicId,
        schemaVersion: snapshot.schemaVersion,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      },
    ]);
  });
});

void test("pattern-room storage contract deletes snapshots by snapshot id", async () => {
  await withTempStore(async (store) => {
    const snapshot = createTestSnapshot();

    await store.save(snapshot);
    await store.delete(snapshot.snapshotId);

    assert.equal(await store.load(snapshot.topicId), null);
    assert.deepEqual(await store.list(), []);
  });
});

void test("pattern-room storage contract returns null for a missing topic", async () => {
  await withTempStore(async (store) => {
    assert.equal(await store.load("missing-topic"), null);
  });
});

void test("pattern-room storage contract safely handles corrupted JSON", async () => {
  await withTempStore(async (store, rootDir) => {
    await writeFile(join(rootDir, "corrupt-topic.snapshot.json"), "{not json", "utf8");

    assert.equal(await store.load("corrupt-topic"), null);
    assert.deepEqual(await store.list(), []);
  });
});

void test("pattern-room storage contract rejects unsupported snapshot schema versions", async () => {
  await withTempStore(async (store, rootDir) => {
    const snapshot = createTestSnapshot();
    const futureSnapshot = {
      ...snapshot,
      topicId: "future-topic",
      schemaVersion: 99,
    };

    await writeFile(
      join(rootDir, "future-topic.snapshot.json"),
      `${JSON.stringify(futureSnapshot, null, 2)}\n`,
      "utf8"
    );

    assert.equal(await store.load("future-topic"), null);
    assert.deepEqual(await store.list(), []);
  });
});

void test("pattern-room storage contract rejects path traversal topic ids", async () => {
  await withTempStore(async (store) => {
    const snapshot = createTestSnapshot();
    const unsafeSnapshot: PatternRoomSessionSnapshot = {
      ...snapshot,
      topicId: "../escape",
    };

    await assert.rejects(store.save(unsafeSnapshot), /Unsafe Pattern Room snapshot topicId/);
    await assert.rejects(store.load("../escape"), /Unsafe Pattern Room snapshot topicId/);
  });
});

void test("pattern-room storage contract leaves only the final topic file after save and upsert", async () => {
  await withTempStore(async (store, rootDir) => {
    const snapshot = createTestSnapshot();
    const updatedSnapshot: PatternRoomSessionSnapshot = {
      ...snapshot,
      snapshotId: `${snapshot.snapshotId}-guard`,
      updatedAt: "2026-05-21T10:45:00.000Z",
    };

    await store.save(snapshot);
    await assertOnlyFinalSnapshotFile(rootDir, snapshot.topicId);

    await store.save(updatedSnapshot);
    await assertOnlyFinalSnapshotFile(rootDir, snapshot.topicId);

    const persisted = JSON.parse(
      await readFile(join(rootDir, `${snapshot.topicId}.snapshot.json`), "utf8")
    ) as PatternRoomSessionSnapshot;
    assert.equal(persisted.snapshotId, updatedSnapshot.snapshotId);
  });
});
