import assert from "node:assert/strict";
import test from "node:test";
import { createLabStore } from "../../rooms/laboratory/runtime/lab-store.ts";

void test("laboratory timeline updates structurally share unrelated store branches", () => {
  const store = createLabStore();

  store.dispatch({
    type: "context-received",
    payload: {
      featureId: "media-analysis",
      performanceFixture: {
        nested: Array.from({ length: 128 }, function (_, index) {
          return { id: index, label: `fixture-${String(index)}` };
        }),
      },
    },
  });
  store.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "video",
      mode: "local",
      status: "ready",
      storedPath: "/tmp/structural-sharing.mp4",
      metadata: {
        durationMs: 12_000,
      },
    },
  });
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-structural-sharing",
      type: "source",
      name: "structural-sharing.mp4",
      createdAt: 1,
      localPath: "/tmp/structural-sharing.mp4",
      url: "file:///tmp/structural-sharing.mp4",
      metadata: {
        durationMs: 12_000,
      },
    },
  });

  const before = store.getState();
  const beforeUi = before.ui;
  const beforeWorkspace = before.ui.workspace;
  const beforeContext = before.context;
  const beforeSource = before.source;
  const beforeAssets = before.assets;
  const beforeWorkbench = before.workbench;
  const beforeProjectIndex = before.projectIndex;

  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1_250,
    endMs: 4_750,
  });

  const after = store.getState();
  assert.notEqual(after, before);
  assert.notEqual(after.ui, beforeUi);
  assert.notEqual(after.ui.workspace, beforeWorkspace);
  assert.equal(after.context, beforeContext);
  assert.equal(after.source, beforeSource);
  assert.equal(after.assets, beforeAssets);
  assert.equal(after.workbench, beforeWorkbench);
  assert.equal(after.projectIndex, beforeProjectIndex);

  assert.equal(before.ui.workspace.timelineStartMs, null);
  assert.equal(before.ui.workspace.timelineEndMs, null);
  assert.equal(before.ui.workspace.activeSelection, null);

  assert.equal(after.ui.workspace.timelineStartMs, 1_250);
  assert.equal(after.ui.workspace.timelineEndMs, 4_750);
  assert.equal(after.ui.workspace.activeSelection?.startMs, 1_250);
  assert.equal(after.ui.workspace.activeSelection?.endMs, 4_750);
});

void test("laboratory timeline fast path keeps timeline normalization behavior", () => {
  const store = createLabStore();

  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 2_000.4,
    endMs: 2_000.2,
  });

  const workspace = store.getState().ui.workspace;
  assert.equal(workspace.timelineStartMs, 2_000);
  assert.equal(workspace.timelineEndMs, null);
  assert.equal(workspace.activeSelection, null);
  assert.equal(workspace.selectionLoopEnabled, false);
  assert.equal(workspace.selectionMicroZoomOpen, false);
});
