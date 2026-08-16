import assert from "node:assert/strict";
import test from "node:test";

import { resolveWhereAmI } from "../lib/whereami-runtime.mjs";

interface WhereAmIResult {
  mode: string;
  shouldStop: boolean;
  appOpen: boolean;
  electronConnectionAvailable: boolean;
  observedSignals: {
    opencodeServerRunning: boolean;
  };
  reason: string;
}

void test("returns app when main process is alive in soft idle and OpenCode serve is active", () => {
  const result = resolveWhereAmI({
    control: {
      workflowSessionId: "wf-1",
      desiredMode: "soft",
      phase: "idle",
      updatedAt: "2026-03-02T10:00:00.000Z",
    },
    probes: {
      mainProcess: true,
      ghostProcess: false,
      wrapperProcess: true,
      opencodeServerRunning: true,
    },
    nowIso: "2026-03-02T10:00:10.000Z",
  }) as WhereAmIResult;

  assert.equal(result.mode, "app");
  assert.equal(result.shouldStop, false);
  assert.equal(result.appOpen, true);
  assert.equal(result.electronConnectionAvailable, true);
  assert.equal(result.observedSignals.opencodeServerRunning, true);
});

void test("returns app when main process is alive without OpenCode serve", () => {
  const result = resolveWhereAmI({
    control: {
      workflowSessionId: "wf-1b",
      desiredMode: "soft",
      phase: "idle",
      updatedAt: "2026-03-02T10:00:00.000Z",
    },
    probes: {
      mainProcess: true,
      ghostProcess: false,
      wrapperProcess: true,
      opencodeServerRunning: false,
    },
    nowIso: "2026-03-02T10:00:10.000Z",
  }) as WhereAmIResult;

  assert.equal(result.mode, "app");
  assert.equal(result.shouldStop, false);
  assert.equal(result.appOpen, true);
  assert.equal(result.electronConnectionAvailable, true);
  assert.equal(result.observedSignals.opencodeServerRunning, false);
  assert.equal(result.reason, "Runtime and process probes agree.");
});

void test("returns ghost-agent when ghost process is alive in in-ghost phase", () => {
  const result = resolveWhereAmI({
    control: {
      workflowSessionId: "wf-2",
      desiredMode: "ghost-agent",
      phase: "in-ghost",
      updatedAt: "2026-03-02T10:00:00.000Z",
    },
    probes: {
      mainProcess: false,
      ghostProcess: true,
      wrapperProcess: true,
      opencodeServerRunning: false,
    },
    nowIso: "2026-03-02T10:00:10.000Z",
  }) as WhereAmIResult;

  assert.equal(result.mode, "ghost-agent");
  assert.equal(result.shouldStop, false);
});

void test("returns terminal when no runtime signal and no app processes", () => {
  const result = resolveWhereAmI({
    control: {
      workflowSessionId: "wf-3",
      desiredMode: "terminal",
      phase: "idle",
      updatedAt: "2026-03-02T10:00:00.000Z",
    },
    probes: {
      mainProcess: false,
      ghostProcess: false,
      wrapperProcess: false,
      opencodeServerRunning: false,
    },
    nowIso: "2026-03-02T10:00:10.000Z",
  }) as WhereAmIResult;

  assert.equal(result.mode, "terminal");
  assert.equal(result.shouldStop, false);
  assert.equal(result.appOpen, false);
  assert.equal(result.electronConnectionAvailable, false);
});

void test("returns transitioning during preparing-handoff", () => {
  const result = resolveWhereAmI({
    control: {
      workflowSessionId: "wf-4",
      desiredMode: "ghost-agent",
      phase: "preparing-handoff",
      updatedAt: "2026-03-02T10:00:00.000Z",
    },
    probes: {
      mainProcess: true,
      ghostProcess: false,
      wrapperProcess: true,
      opencodeServerRunning: false,
    },
    nowIso: "2026-03-02T10:00:10.000Z",
  }) as WhereAmIResult;

  assert.equal(result.mode, "transitioning");
  assert.equal(result.shouldStop, false);
});


void test("returns transitioning during returning phase with ghost alive", () => {
  const result = resolveWhereAmI({
    control: {
      workflowSessionId: "wf-return",
      desiredMode: "soft",
      phase: "returning",
      updatedAt: "2026-03-02T10:00:00.000Z",
    },
    probes: {
      mainProcess: false,
      ghostProcess: true,
      wrapperProcess: true,
      opencodeServerRunning: false,
    },
    nowIso: "2026-03-02T10:00:10.000Z",
  }) as WhereAmIResult;

  assert.equal(result.mode, "transitioning");
  assert.equal(result.shouldStop, false);
});


void test("falls back to terminal when preparing-handoff runtime is stale and no processes are alive", () => {
  const result = resolveWhereAmI({
    control: {
      workflowSessionId: "wf-stale",
      desiredMode: "ghost-agent",
      phase: "preparing-handoff",
      updatedAt: "2026-03-02T10:00:00.000Z",
    },
    probes: {
      mainProcess: false,
      ghostProcess: false,
      wrapperProcess: false,
      opencodeServerRunning: false,
    },
    nowIso: "2026-03-02T10:05:00.000Z",
    maxStaleMs: 60000,
  }) as WhereAmIResult;

  assert.equal(result.mode, "terminal");
  assert.equal(result.shouldStop, false);
  assert.match(result.reason, /stale runtime transition/i);
});

void test("returns conflict and stop signal when runtime and process probes disagree", () => {
  const result = resolveWhereAmI({
    control: {
      workflowSessionId: "wf-5",
      desiredMode: "soft",
      phase: "idle",
      updatedAt: "2026-03-02T10:00:00.000Z",
    },
    probes: {
      mainProcess: false,
      ghostProcess: true,
      wrapperProcess: true,
      opencodeServerRunning: false,
    },
    nowIso: "2026-03-02T10:00:10.000Z",
  }) as WhereAmIResult;

  assert.equal(result.mode, "conflict");
  assert.equal(result.shouldStop, true);
  assert.match(result.reason, /runtime.*probe/i);
});
