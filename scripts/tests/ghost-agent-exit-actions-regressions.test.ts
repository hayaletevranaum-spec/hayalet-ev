import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRuntimePatchForGhostExit,
  shouldStopSystemActiveServersOnGhostExit,
} from "../../ghost-agent/electron/ghost-exit-actions.ts";

void test("ghost exit action 'close' switches runtime to terminal idle", () => {
  const patch = buildRuntimePatchForGhostExit("close");

  assert.deepEqual(patch, {
    desiredMode: "terminal",
    phase: "idle",
  });
});

void test("ghost exit action 'return-main' switches runtime to soft idle", () => {
  const patch = buildRuntimePatchForGhostExit("return-main");

  assert.deepEqual(patch, {
    desiredMode: "soft",
    phase: "idle",
  });
});

void test("ghost exit server policy stops active servers only on close", () => {
  assert.equal(shouldStopSystemActiveServersOnGhostExit("close"), true);
  assert.equal(shouldStopSystemActiveServersOnGhostExit("return-main"), false);
});
