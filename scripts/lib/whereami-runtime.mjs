import { normalizeControl } from "./ghost-wrapper-runtime.mjs";

export const WHEREAMI_MODES = Object.freeze([
  "terminal",
  "app",
  "ghost-agent",
  "transitioning",
  "conflict",
]);

function isAppOpen(probes) {
  return probes.mainProcess === true;
}

function isElectronConnectionAvailable(probes) {
  return isAppOpen(probes);
}

function toTimestampMs(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function withObserved(control, probes, runtimeAgeMs, staleRuntime) {
  return {
    desiredMode: control.desiredMode,
    phase: control.phase,
    runtimeAgeMs,
    staleRuntime,
    mainProcess: probes.mainProcess,
    ghostProcess: probes.ghostProcess,
    wrapperProcess: probes.wrapperProcess,
    appOpen: isAppOpen(probes),
    electronConnectionAvailable: isElectronConnectionAvailable(probes),
    opencodeServerRunning: probes.opencodeServerRunning === true,
  };
}

function result(mode, shouldStop, reason, confidence, observedSignals) {
  return {
    mode,
    shouldStop,
    reason,
    confidence,
    appOpen: observedSignals.appOpen === true,
    electronConnectionAvailable: observedSignals.electronConnectionAvailable === true,
    observedSignals,
  };
}

function processInferredMode(probes) {
  if (probes.mainProcess && probes.ghostProcess) {
    return "conflict";
  }
  if (probes.ghostProcess) {
    return "ghost-agent";
  }
  if (isAppOpen(probes)) {
    return "app";
  }
  return "terminal";
}

function runtimeExpectedMode(control) {
  if (control.phase === "preparing-handoff" || control.phase === "returning") {
    return "transitioning";
  }
  if (control.phase === "in-ghost") {
    return "ghost-agent";
  }
  if (control.desiredMode === "terminal") {
    return "terminal";
  }
  return "app";
}

export function resolveWhereAmI({
  control,
  probes,
  nowIso = new Date().toISOString(),
  maxStaleMs = 60000,
}) {
  const normalizedControl = normalizeControl(control, nowIso);
  const nowMs = toTimestampMs(nowIso);
  const updatedMs = toTimestampMs(normalizedControl.updatedAt);
  const runtimeAgeMs = nowMs !== null && updatedMs !== null ? Math.max(0, nowMs - updatedMs) : null;
  const staleRuntime = runtimeAgeMs !== null ? runtimeAgeMs > maxStaleMs : true;

  const observedSignals = withObserved(normalizedControl, probes, runtimeAgeMs, staleRuntime);

  const expected = runtimeExpectedMode(normalizedControl);
  const inferred = processInferredMode(probes);

  if (inferred === "conflict") {
    return result(
      "conflict",
      true,
      "Process probes disagree: both app and ghost-agent look alive.",
      0.99,
      observedSignals
    );
  }

  if (expected === "transitioning") {
    if (!probes.mainProcess && !probes.ghostProcess && !probes.wrapperProcess && staleRuntime) {
      return result(
        "terminal",
        false,
        "Stale runtime transition with no active processes; falling back to terminal mode.",
        0.94,
        observedSignals
      );
    }

    return result(
      "transitioning",
      false,
      `Runtime phase is ${normalizedControl.phase}.`,
      0.92,
      observedSignals
    );
  }

  if (expected === inferred) {
    return result(
      inferred,
      false,
      "Runtime and process probes agree.",
      staleRuntime ? 0.8 : 0.97,
      observedSignals
    );
  }

  if (expected === "app" && inferred === "terminal") {
    if (probes.wrapperProcess && !staleRuntime) {
      return result(
        "transitioning",
        false,
        "Wrapper is alive and runtime expects app; likely relaunch window.",
        0.73,
        observedSignals
      );
    }

    return result(
      "terminal",
      false,
      "No active app process was detected; falling back to terminal mode.",
      staleRuntime ? 0.9 : 0.66,
      observedSignals
    );
  }

  if (expected === "terminal" && inferred === "app") {
    return result(
      "conflict",
      true,
      "Runtime expects terminal but app process is still alive.",
      0.95,
      observedSignals
    );
  }

  if (expected === "terminal" && inferred === "ghost-agent") {
    return result(
      "conflict",
      true,
      "Runtime expects terminal but ghost-agent process is alive.",
      0.95,
      observedSignals
    );
  }

  return result(
    "conflict",
    true,
    `Runtime expects ${expected} but process probe says ${inferred}.`,
    0.9,
    observedSignals
  );
}
