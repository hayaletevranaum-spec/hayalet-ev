import assert from "node:assert/strict";
import test from "node:test";

import {
  buildControlForAction,
  didTerminationFail,
  getActionExpectedMode,
  isActionAllowedFromMode,
  isTransitionAction,
  resolveActionForTargetMode,
} from "../lib/transition-runtime.mjs";
import { hasProcessPathFragment, parsePosixProcessLine } from "../lib/process-entries.mjs";

void test("process entry parser reads POSIX pid ppid args lines", () => {
  assert.deepEqual(parsePosixProcessLine("123 45 node dist/electron/main.js"), {
    pid: 123,
    ppid: 45,
    args: "node dist/electron/main.js",
  });
  assert.equal(parsePosixProcessLine("bad line"), null);
});

void test("process path matching normalizes Windows separators", () => {
  assert.equal(
    hasProcessPathFragment("C:\\App\\dist\\electron\\main.js", "dist/electron/main.js"),
    true
  );
});

void test("isTransitionAction validates supported actions", () => {
  assert.equal(isTransitionAction("main-close"), true);
  assert.equal(isTransitionAction("main-to-ghost"), true);
  assert.equal(isTransitionAction("ghost-close"), true);
  assert.equal(isTransitionAction("ghost-return-main"), true);
  assert.equal(isTransitionAction("unknown"), false);
});

void test("isActionAllowedFromMode enforces button source modes", () => {
  assert.deepEqual(isActionAllowedFromMode("main-to-ghost", "app"), {
    allowed: true,
    reason: "",
  });

  const invalid = isActionAllowedFromMode("main-to-ghost", "ghost-agent");
  assert.equal(invalid.allowed, false);
  assert.match(invalid.reason, /only allowed from app mode/i);
});

void test("didTerminationFail catches exit and error failures", () => {
  assert.equal(
    didTerminationFail({
      failed: false,
      errors: [],
      waitResults: [{ pid: 123, exited: true }],
    }),
    false
  );

  assert.equal(
    didTerminationFail({
      failed: false,
      errors: [],
      waitResults: [{ pid: 123, exited: false }],
    }),
    true
  );

  assert.equal(
    didTerminationFail({
      failed: false,
      errors: [{ pid: 123, message: "EPERM" }],
      waitResults: [],
    }),
    true
  );
});

void test("buildControlForAction stamps workflow session for main-to-ghost", () => {
  const next = buildControlForAction(
    {
      workflowSessionId: "",
      desiredMode: "soft",
      phase: "idle",
      updatedAt: "2026-03-04T10:00:00.000Z",
    },
    "main-to-ghost",
    {
      now: "2026-03-04T10:01:00.000Z",
      transitionId: "wf-test-001",
    }
  );

  assert.equal(next.workflowSessionId, "wf-test-001");
  assert.equal(next.desiredMode, "ghost-agent");
  assert.equal(next.phase, "preparing-handoff");
  assert.equal(next.updatedAt, "2026-03-04T10:01:00.000Z");
});

void test("buildControlForAction keeps workflow for ghost-return-main", () => {
  const next = buildControlForAction(
    {
      workflowSessionId: "wf-existing",
      desiredMode: "ghost-agent",
      phase: "in-ghost",
      updatedAt: "2026-03-04T10:00:00.000Z",
    },
    "ghost-return-main",
    {
      now: "2026-03-04T10:02:00.000Z",
      transitionId: "wf-ignored",
    }
  );

  assert.equal(next.workflowSessionId, "wf-existing");
  assert.equal(next.desiredMode, "soft");
  assert.equal(next.phase, "returning");
  assert.equal(next.updatedAt, "2026-03-04T10:02:00.000Z");
});

void test("getActionExpectedMode returns mode mapping", () => {
  assert.equal(getActionExpectedMode("main-to-ghost"), "ghost-agent");
  assert.equal(getActionExpectedMode("ghost-return-main"), "app");
  assert.equal(getActionExpectedMode("main-close"), "terminal");
  assert.equal(getActionExpectedMode("ghost-close"), "terminal");
});

void test("resolveActionForTargetMode maps valid cross-mode transitions", () => {
  assert.deepEqual(resolveActionForTargetMode("app", "ghost-agent"), {
    action: "main-to-ghost",
    noop: false,
    error: null,
  });

  assert.deepEqual(resolveActionForTargetMode("ghost-agent", "app"), {
    action: "ghost-return-main",
    noop: false,
    error: null,
  });

  assert.deepEqual(resolveActionForTargetMode("app", "terminal"), {
    action: "main-close",
    noop: false,
    error: null,
  });

  assert.deepEqual(resolveActionForTargetMode("ghost-agent", "terminal"), {
    action: "ghost-close",
    noop: false,
    error: null,
  });
});

void test("resolveActionForTargetMode rejects invalid state combinations", () => {
  const fromTerminalToGhost = resolveActionForTargetMode("terminal", "ghost-agent");
  assert.equal(fromTerminalToGhost.action, null);
  assert.equal(fromTerminalToGhost.noop, false);
  assert.match(fromTerminalToGhost.error ?? "", /only be entered from app mode/i);

  const fromTransitioning = resolveActionForTargetMode("transitioning", "terminal");
  assert.equal(fromTransitioning.action, null);
  assert.equal(fromTransitioning.noop, false);
  assert.match(fromTransitioning.error ?? "", /Cannot compute action while mode is transitioning/i);
});

void test("resolveActionForTargetMode returns noop when already at target", () => {
  const result = resolveActionForTargetMode("terminal", "terminal");
  assert.equal(result.action, null);
  assert.equal(result.noop, true);
  assert.match(result.reason ?? "", /already in terminal mode/i);
});
