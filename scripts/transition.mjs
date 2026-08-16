import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readAssistantSlotSettingsReport } from "./lib/settings-status.mjs";
import {
  appendRuntimeEvent,
  buildControlForAction,
  createTransitionId,
  didTerminationFail,
  getRuntimeStatus,
  getTransitionActionConfig,
  isActionAllowedFromMode,
  isTransitionAction,
  resolveActionForTargetMode,
  terminateProcesses,
  waitForMode,
  writeControl,
} from "./lib/transition-runtime.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = dirname(__dirname);

const runtimeControlPath = join(root, "data", "assistant-runtime.json");
const runtimeEventLogPath = join(root, "data", "assistant-runtime-events.log");

function parseNumber(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeModeInput(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.toLowerCase();
}

function parseOptions(argv) {
  const options = {
    wait: false,
    waitExplicit: false,
    timeoutMs: 90000,
    intervalMs: 500,
    maxStaleMs: 60000,
    waitTimeoutMs: 10000,
    signal: "SIGTERM",
  };

  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--wait") {
      options.wait = true;
      options.waitExplicit = true;
      continue;
    }

    if (token === "--no-wait") {
      options.wait = false;
      options.waitExplicit = true;
      continue;
    }

    if (token.startsWith("--timeout=")) {
      options.timeoutMs = parseNumber(token.slice("--timeout=".length), options.timeoutMs);
      continue;
    }

    if (token === "--timeout") {
      const next = argv[index + 1];
      options.timeoutMs = parseNumber(next ?? "", options.timeoutMs);
      index += 1;
      continue;
    }

    if (token.startsWith("--interval=")) {
      options.intervalMs = parseNumber(token.slice("--interval=".length), options.intervalMs);
      continue;
    }

    if (token === "--interval") {
      const next = argv[index + 1];
      options.intervalMs = parseNumber(next ?? "", options.intervalMs);
      index += 1;
      continue;
    }

    if (token.startsWith("--max-stale=")) {
      options.maxStaleMs = parseNumber(token.slice("--max-stale=".length), options.maxStaleMs);
      continue;
    }

    if (token === "--max-stale") {
      const next = argv[index + 1];
      options.maxStaleMs = parseNumber(next ?? "", options.maxStaleMs);
      index += 1;
      continue;
    }

    if (token.startsWith("--wait-timeout=")) {
      options.waitTimeoutMs = parseNumber(token.slice("--wait-timeout=".length), options.waitTimeoutMs);
      continue;
    }

    if (token === "--wait-timeout") {
      const next = argv[index + 1];
      options.waitTimeoutMs = parseNumber(next ?? "", options.waitTimeoutMs);
      index += 1;
      continue;
    }

    if (token.startsWith("--signal=")) {
      const signal = token.slice("--signal=".length).trim();
      if (signal !== "") {
        options.signal = signal;
      }
      continue;
    }

    if (token === "--signal") {
      const signal = (argv[index + 1] ?? "").trim();
      if (signal !== "") {
        options.signal = signal;
      }
      index += 1;
      continue;
    }

    positionals.push(token);
  }

  return {
    options,
    positionals,
  };
}

function writeResult(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function fail(payload, exitCode = 2) {
  writeResult({ success: false, ...payload });
  process.exitCode = exitCode;
}

async function rollbackTransitionIntent(statusBefore, action, transitionId, reason, details = {}) {
  const restored = await writeControl(runtimeControlPath, statusBefore.control);
  await appendRuntimeEvent(runtimeEventLogPath, "transition.rollback", {
    transitionId,
    action,
    reason,
    restoredMode: restored.desiredMode === "soft" ? "app" : restored.desiredMode,
    restoredPhase: restored.phase,
    ...details,
  });
  return restored;
}

async function runStatus(options) {
  const [status, assistantSlotSettings] = await Promise.all([
    getRuntimeStatus({ runtimeControlPath, maxStaleMs: options.maxStaleMs }),
    readAssistantSlotSettingsReport(root),
  ]);
  writeResult({
    success: true,
    mode: status.resolved.mode,
    shouldStop: status.resolved.shouldStop,
    reason: status.resolved.reason,
    confidence: status.resolved.confidence,
    appOpen: status.resolved.appOpen,
    electronConnectionAvailable: status.resolved.electronConnectionAvailable,
    control: status.control,
    snapshot: status.snapshot,
    observedSignals: status.resolved.observedSignals,
    assistantSlotSettings,
  });
}

async function runWait(mode, options) {
  const normalizedMode = normalizeModeInput(mode);
  if (normalizedMode === null) {
    fail({
      error: "Mode is required. Usage: node scripts/transition.mjs wait <terminal|app|ghost-agent>",
    });
    return;
  }

  const waited = await waitForMode({
    runtimeControlPath,
    expectedMode: normalizedMode,
    timeoutMs: options.timeoutMs,
    intervalMs: options.intervalMs,
    maxStaleMs: options.maxStaleMs,
  });

  if (!waited.success) {
    fail({
      error: waited.error,
      expectedMode: waited.expectedMode,
      elapsedMs: waited.elapsedMs,
      mode: waited.status?.resolved.mode ?? null,
      shouldStop: waited.status?.resolved.shouldStop ?? null,
      reason: waited.status?.resolved.reason ?? null,
    });
    return;
  }

  writeResult({
    success: true,
    expectedMode: waited.expectedMode,
    elapsedMs: waited.elapsedMs,
    mode: waited.status.resolved.mode,
    shouldStop: waited.status.resolved.shouldStop,
    reason: waited.status.resolved.reason,
    appOpen: waited.status.resolved.appOpen,
    electronConnectionAvailable: waited.status.resolved.electronConnectionAvailable,
    control: waited.status.control,
    snapshot: waited.status.snapshot,
  });
}


async function executeAction(action, options) {
  if (!isTransitionAction(action)) {
    fail({
      error:
        "Unknown action. Valid actions: main-close, main-to-ghost, ghost-close, ghost-return-main.",
      action,
    });
    return;
  }

  const config = getTransitionActionConfig(action);
  if (config === null) {
    fail({ error: `Action config not found for ${action}` });
    return;
  }

  const statusBefore = await getRuntimeStatus({ runtimeControlPath, maxStaleMs: options.maxStaleMs });
  const sourceModeCheck = isActionAllowedFromMode(action, statusBefore.resolved.mode);
  if (sourceModeCheck.allowed !== true) {
    fail({
      error: sourceModeCheck.reason,
      action,
      modeBefore: statusBefore.resolved.mode,
      expectedMode: config.expectedMode,
    });

    return;
  }

  if (config.requiresWrapper && !statusBefore.snapshot.wrapper.alive) {
    fail({
      error: `Action ${action} requires wrapper process, but wrapper is not running.`,
      action,
      modeBefore: statusBefore.resolved.mode,
      snapshot: statusBefore.snapshot,
    });
    return;
  }

  const closePids =
    config.closeTarget === "main"
      ? statusBefore.snapshot.main.pids
      : config.closeTarget === "ghost"
        ? statusBefore.snapshot.ghost.pids
        : [];

  if (config.closeTarget !== "none" && closePids.length === 0) {
    fail({
      error: `Action ${action} requires active ${config.closeTarget} app process to close.`,
      action,
      modeBefore: statusBefore.resolved.mode,
      expectedMode: config.expectedMode,
      snapshot: statusBefore.snapshot,
    });

    return;
  }

  const transitionId = createTransitionId();
  const nextControl = buildControlForAction(statusBefore.control, action, {
    transitionId,
  });

  await writeControl(runtimeControlPath, nextControl);
  await appendRuntimeEvent(runtimeEventLogPath, "transition.intent", {
    transitionId,
    action,
    desiredMode: nextControl.desiredMode,
    phase: nextControl.phase,
    expectedMode: config.expectedMode,
    modeBefore: statusBefore.resolved.mode,
  });

  let termination = {
    killedPids: [],
    waitResults: [],
    errors: [],
  };

  if (closePids.length > 0) {
    termination = await terminateProcesses(closePids, {
      signal: options.signal,
      waitTimeoutMs: options.waitTimeoutMs,
    });

    await appendRuntimeEvent(runtimeEventLogPath, "transition.close", {
      transitionId,
      action,
      closeTarget: config.closeTarget,
      pidCount: termination.killedPids.length,
      signal: options.signal,
    });
  } else {
    await appendRuntimeEvent(runtimeEventLogPath, "transition.close.skip", {
      transitionId,
      action,
      closeTarget: config.closeTarget,
      reason: "no-target-process",
    });
  }

  if (didTerminationFail(termination)) {
    await rollbackTransitionIntent(statusBefore, action, transitionId, "process-termination-failed", {
      failedPidCount: termination.waitResults.filter((item) => item.exited !== true).length,
      errorCount: termination.errors.length,
    });

    fail({
      error: "Transition aborted: target process did not terminate cleanly.",
      action,
      transitionId,
      errors: termination.errors,
      killedPids: termination.killedPids,
      pidExitChecks: termination.waitResults,
    });
    return;
  }

  let waitResult = null;
  const shouldWait = options.wait === true;

  if (shouldWait) {
    waitResult = await waitForMode({
      runtimeControlPath,
      expectedMode: config.expectedMode,
      timeoutMs: options.timeoutMs,
      intervalMs: options.intervalMs,
      maxStaleMs: options.maxStaleMs,
    });

    await appendRuntimeEvent(runtimeEventLogPath, waitResult.success ? "transition.complete" : "transition.timeout", {
      transitionId,
      action,
      expectedMode: config.expectedMode,
      success: waitResult.success,
      elapsedMs: waitResult.elapsedMs,
      finalMode: waitResult.status?.resolved.mode ?? "unknown",
    });

    if (!waitResult.success) {
      await rollbackTransitionIntent(statusBefore, action, transitionId, "wait-timeout", {
        expectedMode: config.expectedMode,
        elapsedMs: waitResult.elapsedMs,
        finalMode: waitResult.status?.resolved.mode ?? "unknown",
      });

      fail({
        error: waitResult.error,
        action,
        transitionId,
        expectedMode: config.expectedMode,
        elapsedMs: waitResult.elapsedMs,
        finalMode: waitResult.status?.resolved.mode ?? null,
        reason: waitResult.status?.resolved.reason ?? null,
      });

      return;
    }
  }

  const statusAfter = await getRuntimeStatus({ runtimeControlPath, maxStaleMs: options.maxStaleMs });

  writeResult({
    success: true,
    action,
    transitionId,
    expectedMode: config.expectedMode,
    waitEnabled: shouldWait,
    modeBefore: statusBefore.resolved.mode,
    modeAfter: statusAfter.resolved.mode,
    reasonAfter: statusAfter.resolved.reason,
    controlAfter: statusAfter.control,
    killedPids: termination.killedPids,
    pidExitChecks: termination.waitResults,
    waitResult:
      waitResult === null
        ? null
        : {
            expectedMode: waitResult.expectedMode,
            elapsedMs: waitResult.elapsedMs,
            finalMode: waitResult.status?.resolved.mode ?? null,
          },
  });

}

async function runSwitch(targetMode, options) {
  const normalizedTargetMode = normalizeModeInput(targetMode);
  if (normalizedTargetMode === null) {
    fail({
      error: "Target mode is required. Usage: node scripts/transition.mjs switch <terminal|app|ghost-agent>",
    });
    return;
  }

  const statusBefore = await getRuntimeStatus({ runtimeControlPath, maxStaleMs: options.maxStaleMs });
  const resolution = resolveActionForTargetMode(statusBefore.resolved.mode, normalizedTargetMode);

  if (resolution.error) {
    fail({
      error: resolution.error,
      modeBefore: statusBefore.resolved.mode,
      targetMode: normalizedTargetMode,
    });
    return;
  }

  if (resolution.noop || resolution.action === null) {
    writeResult({
      success: true,
      action: null,
      noop: true,
      mode: statusBefore.resolved.mode,
      targetMode: normalizedTargetMode,
      reason: resolution.reason ?? "No-op",
      control: statusBefore.control,
      snapshot: statusBefore.snapshot,
    });
    return;
  }

  const effectiveOptions = {
    ...options,
    wait: options.waitExplicit ? options.wait : true,
  };

  await executeAction(resolution.action, effectiveOptions);
}


function printHelp() {
  writeResult({
    success: true,
    usage: [
      "node scripts/transition.mjs status",
      "node scripts/transition.mjs wait <terminal|app|ghost-agent> [--timeout <ms>]",
      "node scripts/transition.mjs trigger <main-close|main-to-ghost|ghost-close|ghost-return-main> [--wait]",
      "node scripts/transition.mjs switch <terminal|app|ghost-agent> [--wait]",

    ],
    options: {
      wait: "Wait until expected mode is observed",
      timeout: "Max wait duration in ms",
      interval: "Polling interval in ms",
      "max-stale": "Stale runtime threshold in ms",
      signal: "Signal used to terminate target app process",
      "wait-timeout": "Per-process exit wait timeout in ms",
    },
  });
}

async function main() {
  const { options, positionals } = parseOptions(process.argv.slice(2));
  const command = positionals[0] ?? "status";

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "status") {
    await runStatus(options);
    return;
  }

  if (command === "wait") {
    await runWait(positionals[1], options);
    return;
  }

  if (command === "trigger") {
    const effectiveOptions = {
      ...options,
      wait: options.waitExplicit ? options.wait : true,
    };
    await executeAction(positionals[1], effectiveOptions);
    return;
  }

  if (command === "switch") {
    await runSwitch(positionals[1], options);
    return;
  }

  fail({
    error: `Unknown command: ${command}`,
    hint: "Use: status | wait | trigger | switch",
  });
}

void main();
