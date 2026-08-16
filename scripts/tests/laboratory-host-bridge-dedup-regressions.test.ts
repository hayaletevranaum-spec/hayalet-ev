import assert from "node:assert/strict";
import test from "node:test";
import type { LabStoreEvent } from "../../rooms/laboratory/domain/lab-types.ts";
import { createLabHostBridge } from "../../rooms/laboratory/runtime/lab-host-bridge.ts";

function createSnapshot(storedPath: string, activeProjectId = "project-1") {
  return {
    ready: true,
    activeProjectId,
    activeProject: {
      id: activeProjectId,
      source: {
        kind: "video",
        status: "ready",
        storedPath,
      },
    },
  };
}

void test("laboratory host bridge suppresses the duplicate source-state paired with media-state", () => {
  const emitted: LabStoreEvent[] = [];
  const bridge = createLabHostBridge({
    emit(event) {
      emitted.push(event);
    },
  });
  const snapshot = createSnapshot("/tmp/source.mp4");

  bridge.handleHostMessage({
    type: "media-state",
    payload: {
      requestId: "request-1",
      action: "source-pick-local",
      snapshot,
    },
  });
  bridge.handleHostMessage({
    type: "source-state",
    payload: {
      requestId: "request-1",
      action: "source-pick-local",
      snapshot: structuredClone(snapshot),
    },
  });

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0]?.type, "snapshot-received");
});

void test("laboratory host bridge keeps standalone source-state updates", () => {
  const emitted: LabStoreEvent[] = [];
  const bridge = createLabHostBridge({
    emit(event) {
      emitted.push(event);
    },
  });

  bridge.handleHostMessage({
    type: "source-state",
    payload: {
      requestId: "request-standalone",
      action: "source-pick-local",
      snapshot: createSnapshot("/tmp/standalone.mp4"),
    },
  });

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0]?.type, "source-snapshot-received");
});

void test("laboratory host bridge does not suppress a changed source-state", () => {
  const emitted: LabStoreEvent[] = [];
  const bridge = createLabHostBridge({
    emit(event) {
      emitted.push(event);
    },
  });

  bridge.handleHostMessage({
    type: "media-state",
    payload: {
      requestId: "request-2",
      action: "source-pick-local",
      snapshot: createSnapshot("/tmp/source-a.mp4"),
    },
  });
  bridge.handleHostMessage({
    type: "source-state",
    payload: {
      requestId: "request-2",
      action: "source-pick-local",
      snapshot: createSnapshot("/tmp/source-b.mp4"),
    },
  });

  assert.deepEqual(
    emitted.map(function (event) {
      return event.type;
    }),
    ["snapshot-received", "source-snapshot-received"]
  );
});

void test("laboratory host bridge expires duplicate pairing when another host message intervenes", () => {
  const emitted: LabStoreEvent[] = [];
  const bridge = createLabHostBridge({
    emit(event) {
      emitted.push(event);
    },
  });
  const snapshot = createSnapshot("/tmp/source.mp4");

  bridge.handleHostMessage({
    type: "media-state",
    payload: {
      requestId: "request-3",
      action: "source-pick-local",
      snapshot,
    },
  });
  bridge.handleHostMessage({
    type: "host-context",
    payload: { featureId: "media-analysis" },
  });
  bridge.handleHostMessage({
    type: "source-state",
    payload: {
      requestId: "request-3",
      action: "source-pick-local",
      snapshot: structuredClone(snapshot),
    },
  });

  assert.deepEqual(
    emitted.map(function (event) {
      return event.type;
    }),
    ["snapshot-received", "context-received", "source-snapshot-received"]
  );
});
