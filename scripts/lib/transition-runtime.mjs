import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname } from "node:path";

import { defaultControl, formatWrapperEvent, normalizeControl } from "./ghost-wrapper-runtime.mjs";
import { hasProcessPathFragment, readProcessEntries } from "./process-entries.mjs";
import { resolveWhereAmI } from "./whereami-runtime.mjs";

const MODE_SET = new Set(["terminal", "app", "ghost-agent", "transitioning", "conflict"]);

const ACTION_CONFIG = Object.freeze({
  "main-close": {
    desiredMode: "terminal",
    phase: "idle",
    closeTarget: "main",
    expectedMode: "terminal",
    requiresWrapper: false,
    stampWorkflow: false,
  },
  "main-to-ghost": {
    desiredMode: "ghost-agent",
    phase: "preparing-handoff",
    closeTarget: "main",
    expectedMode: "ghost-agent",
    requiresWrapper: false,
    stampWorkflow: true,
  },
  "ghost-close": {
    desiredMode: "terminal",
    phase: "idle",
    closeTarget: "ghost",
    expectedMode: "terminal",
    requiresWrapper: false,
    stampWorkflow: false,
  },
  "ghost-return-main": {
    desiredMode: "soft",
    phase: "returning",
    closeTarget: "ghost",
    expectedMode: "app",
    requiresWrapper: false,
    stampWorkflow: false,
  },
});

const ACTION_ALLOWED_SOURCE_MODES = Object.freeze({
  "main-close": ["app"],
  "main-to-ghost": ["app"],
  "ghost-close": ["ghost-agent"],
  "ghost-return-main": ["ghost-agent"],
});

function nowIso() {
  return new Date().toISOString();
}

function createDefaultControl(now = nowIso()) {
  return defaultControl(now);
}

export function createTransitionId(prefix = "tr") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getTransitionActionConfig(action) {
  if (typeof action !== "string") return null;
  return ACTION_CONFIG[action] ?? null;
}

export function isTransitionAction(value) {
  return getTransitionActionConfig(value) !== null;
}

export function getActionExpectedMode(action) {
  const config = getTransitionActionConfig(action);
  return config === null ? null : config.expectedMode;
}

export function isActionAllowedFromMode(action, currentMode) {
  if (!MODE_SET.has(currentMode)) {
    return {
      allowed: false,
      reason: `Unknown current mode: ${String(currentMode)}`,
    };
  }

  const allowedModes = ACTION_ALLOWED_SOURCE_MODES[action];
  if (!Array.isArray(allowedModes) || allowedModes.length === 0) {
    return {
      allowed: false,
      reason: `No allowed source-mode rule for action ${String(action)}`,
    };
  }

  if (allowedModes.includes(currentMode)) {
    return {
      allowed: true,
      reason: "",
    };
  }

  return {
    allowed: false,
    reason: `Action ${String(action)} is only allowed from ${allowedModes.join(", ")} mode. Current: ${currentMode}`,
  };
}

export function buildControlForAction(rawControl, action, options = {}) {
  const config = getTransitionActionConfig(action);
  if (config === null) {
    throw new Error(`Unknown transition action: ${String(action)}`);
  }

  const now = typeof options.now === "string" ? options.now : nowIso();
  const current = normalizeControl(rawControl, now);
  const transitionId =
    typeof options.transitionId === "string" && options.transitionId !== ""
      ? options.transitionId
      : createTransitionId("wf");

  return normalizeControl(
    {
      ...current,
      desiredMode: config.desiredMode,
      phase: config.phase,
      workflowSessionId: config.stampWorkflow ? transitionId : current.workflowSessionId,
      updatedAt: now,
    },
    now
  );
}

export function isMainAppProcess(args) {
  return (
    hasProcessPathFragment(args, "dist/electron/main.js") &&
    !hasProcessPathFragment(args, "dist/ghost-agent/electron/main.js")
  );
}

export function isGhostAppProcess(args) {
  return hasProcessPathFragment(args, "dist/ghost-agent/electron/main.js");
}

export function isWrapperProcess(args) {
  return hasProcessPathFragment(args, "scripts/ghost-agent-wrapper.mjs");
}

export function isOpencodeServeProcess(args) {
  return /\bopencode\b.*\bserve\b/i.test(args);
}

export function buildProcessSnapshot(entries) {
  const mainPids = [];
  const ghostPids = [];
  const wrapperPids = [];
  let opencodeServerRunning = false;

  for (const entry of entries) {
    if (isMainAppProcess(entry.args)) {
      mainPids.push(entry.pid);
    }
    if (isGhostAppProcess(entry.args)) {
      ghostPids.push(entry.pid);
    }
    if (isWrapperProcess(entry.args)) {
      wrapperPids.push(entry.pid);
    }
    if (isOpencodeServeProcess(entry.args)) {
      opencodeServerRunning = true;
    }
  }

  return {
    main: {
      alive: mainPids.length > 0,
      pids: mainPids,
    },
    ghost: {
      alive: ghostPids.length > 0,
      pids: ghostPids,
    },
    wrapper: {
      alive: wrapperPids.length > 0,
      pids: wrapperPids,
    },
    opencodeServerRunning,
  };
}

export function buildWhereamiProbes(snapshot) {
  return {
    mainProcess: snapshot.main.alive,
    ghostProcess: snapshot.ghost.alive,
    wrapperProcess: snapshot.wrapper.alive,
    opencodeServerRunning: snapshot.opencodeServerRunning === true,
  };
}

export async function readControl(runtimeControlPath, now = nowIso()) {
  const fallback = createDefaultControl(now);
  try {
    const raw = await readFile(runtimeControlPath, "utf-8");
    return normalizeControl(JSON.parse(raw), now);
  } catch {
    return fallback;
  }
}

export async function writeControl(runtimeControlPath, rawControl, now = nowIso()) {
  const normalized = normalizeControl(rawControl, now);
  await mkdir(dirname(runtimeControlPath), { recursive: true });
  await writeFile(runtimeControlPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
  return normalized;
}

export async function appendRuntimeEvent(runtimeEventLogPath, event, details = {}, now = nowIso()) {
  await mkdir(dirname(runtimeEventLogPath), { recursive: true });
  const line = formatWrapperEvent(event, details, now);
  await appendFile(runtimeEventLogPath, `${line}\n`, "utf-8");
  return line;
}

export async function getRuntimeStatus({ runtimeControlPath, maxStaleMs = 60000, now = nowIso() }) {
  const [control, entries] = await Promise.all([
    readControl(runtimeControlPath, now),
    readProcessEntries(),
  ]);
  const snapshot = buildProcessSnapshot(entries);
  const probes = buildWhereamiProbes(snapshot);
  const resolved = resolveWhereAmI({
    control,
    probes,
    nowIso: now,
    maxStaleMs,
  });

  return {
    control,
    entries,
    snapshot,
    probes,
    resolved,
  };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessExit(pid, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (!isProcessAlive(pid)) return true;
    await sleep(200);
  }
  return !isProcessAlive(pid);
}

async function terminateWindowsProcessTree(pid) {
  if (process.platform !== "win32") return false;
  await new Promise((resolve) => {
    execFile("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, (error) => {
      resolve(error === null);
    });
  });
  return true;
}

export async function terminateProcesses(pids, options = {}) {
  const signal = typeof options.signal === "string" ? options.signal : "SIGTERM";
  const waitTimeoutMs =
    typeof options.waitTimeoutMs === "number" && options.waitTimeoutMs > 0
      ? options.waitTimeoutMs
      : 10000;

  const killedPids = [];
  const errors = [];

  for (const pid of pids) {
    try {
      process.kill(pid, signal);
      killedPids.push(pid);
    } catch (error) {
      const err = error;
      if (err && typeof err === "object" && "code" in err && err.code === "ESRCH") {
        continue;
      }
      errors.push({
        pid,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const waitResults = await Promise.all(
    killedPids.map(async (pid) => {
      let exited = await waitForProcessExit(pid, waitTimeoutMs);
      if (!exited) {
        await terminateWindowsProcessTree(pid);
        exited = await waitForProcessExit(pid, waitTimeoutMs);
      }
      return { pid, exited };
    })
  );

  const allExited = waitResults.every((item) => item.exited === true);
  const failed = errors.length > 0 || allExited !== true;

  return {
    killedPids,
    waitResults,
    errors,
    allExited,
    failed,
  };
}

export function didTerminationFail(result) {
  if (result === null || typeof result !== "object") return true;
  const typed = result;
  if (typed.failed === true) return true;
  if (Array.isArray(typed.errors) && typed.errors.length > 0) return true;
  if (Array.isArray(typed.waitResults)) {
    return typed.waitResults.some((item) => item.exited !== true);
  }
  return false;
}

export function resolveActionForTargetMode(currentMode, targetMode) {
  if (!MODE_SET.has(currentMode)) {
    return { action: null, noop: false, error: `Unknown current mode: ${String(currentMode)}` };
  }

  if (!MODE_SET.has(targetMode)) {
    return { action: null, noop: false, error: `Unknown target mode: ${String(targetMode)}` };
  }

  if (targetMode === "transitioning" || targetMode === "conflict") {
    return {
      action: null,
      noop: false,
      error: "Target mode must be terminal, app, or ghost-agent.",
    };
  }

  if (currentMode === "transitioning" || currentMode === "conflict") {
    return {
      action: null,
      noop: false,
      error: `Cannot compute action while mode is ${currentMode}. Resolve transition/conflict first.`,
    };
  }

  if (currentMode === targetMode) {
    return {
      action: null,
      noop: true,
      reason: `Already in ${targetMode} mode.`,
    };
  }

  if (targetMode === "ghost-agent") {
    if (currentMode === "app") {
      return { action: "main-to-ghost", noop: false, error: null };
    }
    return {
      action: null,
      noop: false,
      error: "ghost-agent mode can only be entered from app mode.",
    };
  }

  if (targetMode === "app") {
    if (currentMode === "ghost-agent") {
      return { action: "ghost-return-main", noop: false, error: null };
    }
    return {
      action: null,
      noop: false,
      error: "app mode can only be restored from ghost-agent mode.",
    };
  }

  if (targetMode === "terminal") {
    if (currentMode === "app") {
      return { action: "main-close", noop: false, error: null };
    }
    if (currentMode === "ghost-agent") {
      return { action: "ghost-close", noop: false, error: null };
    }
  }

  return {
    action: null,
    noop: false,
    error: `No transition action for ${currentMode} -> ${targetMode}.`,
  };
}

export async function waitForMode({
  runtimeControlPath,
  expectedMode,
  timeoutMs = 90000,
  intervalMs = 500,
  maxStaleMs = 60000,
}) {
  if (!MODE_SET.has(expectedMode)) {
    throw new Error(`Unknown expected mode: ${String(expectedMode)}`);
  }

  const startedAt = Date.now();
  let lastStatus = null;

  while (Date.now() - startedAt <= timeoutMs) {
    const status = await getRuntimeStatus({ runtimeControlPath, maxStaleMs });
    lastStatus = status;

    if (status.resolved.shouldStop === true) {
      return {
        success: false,
        expectedMode,
        elapsedMs: Date.now() - startedAt,
        status,
        error: status.resolved.reason ?? "Transition halted due to stop signal.",
      };
    }

    if (status.resolved.mode === expectedMode && status.resolved.shouldStop !== true) {
      return {
        success: true,
        expectedMode,
        elapsedMs: Date.now() - startedAt,
        status,
      };
    }

    await sleep(intervalMs);
  }

  return {
    success: false,
    expectedMode,
    elapsedMs: Date.now() - startedAt,
    status: lastStatus,
    error: `Timed out waiting for mode ${expectedMode}.`,
  };
}
