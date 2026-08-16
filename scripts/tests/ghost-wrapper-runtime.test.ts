import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeControl,
  normalizeMainAppUiMode,
  normalizeWrapperRestartRequest,
  resolveMainAppScriptName,
  shouldStartGhost,
  toGhostRunningControl,
  toGhostOnlyStartControl,
  toPostGhostControl,
  shouldReopenMainAfterGhost,
  formatWrapperEvent,
  buildMainAppLaunchArgs,
  toMainRunningControl,
} from "../lib/ghost-wrapper-runtime.mjs";

void test("normalizeControl fills defaults and validates enum fields", () => {
  const control = normalizeControl(
    {
      workflowSessionId: 42,
      desiredMode: "invalid",
      phase: "unknown",
      updatedAt: 123,
    },
    "2026-03-01T10:00:00.000Z"
  );

  assert.equal(control.workflowSessionId, "");
  assert.equal(control.desiredMode, "soft");
  assert.equal(control.phase, "idle");
  assert.equal(control.updatedAt, "2026-03-01T10:00:00.000Z");
});

void test("shouldStartGhost only returns true for ghost handoff phases", () => {
  assert.equal(
    shouldStartGhost({
      workflowSessionId: "wf-1",
      desiredMode: "ghost-agent",
      phase: "preparing-handoff",
      updatedAt: "2026-03-01T10:00:00.000Z",
    }),
    true
  );

  assert.equal(
    shouldStartGhost({
      workflowSessionId: "wf-1",
      desiredMode: "ghost-agent",
      phase: "in-ghost",
      updatedAt: "2026-03-01T10:00:00.000Z",
    }),
    true
  );

  assert.equal(
    shouldStartGhost({
      workflowSessionId: "wf-1",
      desiredMode: "soft",
      phase: "preparing-handoff",
      updatedAt: "2026-03-01T10:00:00.000Z",
    }),
    false
  );
});

void test("toGhostRunningControl updates phase only", () => {
  const result = toGhostRunningControl(
    {
      workflowSessionId: "wf-2",
      desiredMode: "ghost-agent",
      phase: "preparing-handoff",
      updatedAt: "old",
    },
    "2026-03-01T10:01:00.000Z"
  );

  assert.equal(result.workflowSessionId, "wf-2");
  assert.equal(result.desiredMode, "ghost-agent");
  assert.equal(result.phase, "in-ghost");
  assert.equal(result.updatedAt, "2026-03-01T10:01:00.000Z");
});

void test("toPostGhostControl resets ghost mode to soft idle", () => {
  const result = toPostGhostControl(
    {
      workflowSessionId: "wf-3",
      desiredMode: "ghost-agent",
      phase: "in-ghost",
      updatedAt: "old",
    },
    "2026-03-01T10:02:00.000Z"
  );

  assert.equal(result.desiredMode, "soft");
  assert.equal(result.phase, "idle");
  assert.equal(result.updatedAt, "2026-03-01T10:02:00.000Z");
});

void test("shouldReopenMainAfterGhost stops wrapper cycle for terminal mode", () => {
  assert.equal(
    shouldReopenMainAfterGhost({
      workflowSessionId: "wf-stop",
      desiredMode: "terminal",
      phase: "idle",
      updatedAt: "2026-03-01T10:02:00.000Z",
    }),
    false
  );

  assert.equal(
    shouldReopenMainAfterGhost({
      workflowSessionId: "wf-return",
      desiredMode: "soft",
      phase: "idle",
      updatedAt: "2026-03-01T10:02:00.000Z",
    }),
    true
  );
});

void test("formatWrapperEvent creates timestamped log line", () => {
  const line = formatWrapperEvent(
    "wrapper.start",
    {
      desiredMode: "ghost-agent",
      phase: "preparing-handoff",
    },
    "2026-03-01T10:03:00.000Z"
  );

  assert.match(line, /^\[2026-03-01T10:03:00.000Z\] wrapper\.start /);
  assert.match(line, /desiredMode=ghost-agent/);
  assert.match(line, /phase=preparing-handoff/);
});

void test("toGhostOnlyStartControl sets ghost-agent mode and in-ghost phase", () => {
  const result = toGhostOnlyStartControl(
    {
      workflowSessionId: "wf-go",
      desiredMode: "soft",
      phase: "idle",
      updatedAt: "old",
    },
    "2026-03-02T10:00:00.000Z"
  );

  assert.equal(result.workflowSessionId, "wf-go");
  assert.equal(result.desiredMode, "ghost-agent");
  assert.equal(result.phase, "in-ghost");
  assert.equal(result.updatedAt, "2026-03-02T10:00:00.000Z");
});

void test("toPostGhostControl after ghost-only: close button sets terminal idle (wrapper stops)", () => {
  // Ghost-only: ghost kapandıktan sonra ghost exit action 'close' → terminal+idle yazıldı
  const result = toPostGhostControl(
    {
      workflowSessionId: "wf-go",
      desiredMode: "terminal",
      phase: "idle",
      updatedAt: "old",
    },
    "2026-03-02T10:01:00.000Z"
  );

  assert.equal(result.desiredMode, "terminal");
  assert.equal(result.phase, "idle");
  assert.equal(shouldReopenMainAfterGhost(result), false);
});

void test("toPostGhostControl after ghost-only: return-main button sets soft idle (app reopens)", () => {
  // Ghost-only: ghost exit action 'return-main' → soft+idle yazıldı
  const result = toPostGhostControl(
    {
      workflowSessionId: "wf-go",
      desiredMode: "soft",
      phase: "idle",
      updatedAt: "old",
    },
    "2026-03-02T10:02:00.000Z"
  );

  assert.equal(result.desiredMode, "soft");
  assert.equal(result.phase, "idle");
  assert.equal(shouldReopenMainAfterGhost(result), true);
});

void test("toPostGhostControl after ghost-only crash: ghost-agent mode resets to soft (app reopens)", () => {
  // Ghost beklenmedik kapanırsa in-ghost+ghost-agent durumu soft'a döner
  const result = toPostGhostControl(
    {
      workflowSessionId: "wf-go",
      desiredMode: "ghost-agent",
      phase: "in-ghost",
      updatedAt: "old",
    },
    "2026-03-02T10:03:00.000Z"
  );

  assert.equal(result.desiredMode, "soft");
  assert.equal(result.phase, "idle");
  assert.equal(shouldReopenMainAfterGhost(result), true);
});

void test("buildMainAppLaunchArgs keeps default launch arguments on normal cycle", () => {
  const args = buildMainAppLaunchArgs("/tmp/main.js", false);

  assert.deepEqual(args, ["/tmp/main.js", "--no-sandbox"]);
});

void test("buildMainAppLaunchArgs enables assistant startup flags after ghost return", () => {
  const args = buildMainAppLaunchArgs("/tmp/main.js", true);

  assert.deepEqual(args, [
    "/tmp/main.js",
    "--no-sandbox",
    "--start-page=assistant",
    "--auto-connect",
  ]);
});

void test("buildMainAppLaunchArgs supports direct-launch options for scene mode", () => {
  const args = buildMainAppLaunchArgs("/tmp/main.js", {
    assistantStartup: true,
    uiMode: "scene",
    sceneDebug: true,
    cdpPort: "9555",
  });

  assert.deepEqual(args, [
    "/tmp/main.js",
    "--no-sandbox",
    "--remote-debugging-port=9555",
    "--start-page=assistant",
    "--auto-connect",
    "--ui-mode=scene",
    "--scene-debug",
  ]);
});

void test("buildMainAppLaunchArgs ignores sceneDebug outside scene mode", () => {
  const args = buildMainAppLaunchArgs("/tmp/main.js", {
    assistantStartup: false,
    uiMode: "classic",
    sceneDebug: true,
    cdpPort: null,
  });

  assert.deepEqual(args, ["/tmp/main.js", "--no-sandbox"]);
});

void test("normalizeMainAppUiMode falls back to classic", () => {
  assert.equal(normalizeMainAppUiMode("scene"), "scene");
  assert.equal(normalizeMainAppUiMode("classic"), "classic");
  assert.equal(normalizeMainAppUiMode("unexpected"), "classic");
});

void test("normalizeWrapperRestartRequest normalizes uiMode and sceneDebug", () => {
  assert.deepEqual(normalizeWrapperRestartRequest({ uiMode: "scene", sceneDebug: true }), {
    uiMode: "scene",
    sceneDebug: true,
  });

  assert.deepEqual(normalizeWrapperRestartRequest({ uiMode: "invalid", sceneDebug: "yes" }), {
    uiMode: "classic",
    sceneDebug: false,
  });
});

void test("resolveMainAppScriptName picks the correct npm script for uiMode and startup flags", () => {
  assert.equal(resolveMainAppScriptName(false, "classic"), "electron:dev");
  assert.equal(resolveMainAppScriptName(false, "scene"), "electron:dev:scene");
  assert.equal(resolveMainAppScriptName(false, "scene", true), "electron:dev:scene:debug");
  assert.equal(resolveMainAppScriptName(true, "classic"), "electron:dev:assistant");
  assert.equal(resolveMainAppScriptName(true, "scene"), "electron:dev:assistant:scene");
  assert.equal(resolveMainAppScriptName(true, "scene", true), "electron:dev:assistant:scene:debug");
});

void test("toMainRunningControl forces soft idle for active main app", () => {
  const result = toMainRunningControl(
    {
      workflowSessionId: "wf-main",
      desiredMode: "terminal",
      phase: "idle",
      updatedAt: "old",
    },
    "2026-03-04T10:40:00.000Z"
  );

  assert.equal(result.workflowSessionId, "wf-main");
  assert.equal(result.desiredMode, "soft");
  assert.equal(result.phase, "idle");
  assert.equal(result.updatedAt, "2026-03-04T10:40:00.000Z");
});
