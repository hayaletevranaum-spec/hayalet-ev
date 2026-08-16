import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defaultControl, normalizeControl } from "./lib/ghost-wrapper-runtime.mjs";
import { hasProcessPathFragment, readProcessEntries } from "./lib/process-entries.mjs";
import { readAssistantSlotSettingsReport } from "./lib/settings-status.mjs";
import { resolveWhereamiProviderContext } from "./lib/whereami-provider-context.mjs";
import { resolveWhereAmI } from "./lib/whereami-runtime.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = dirname(__dirname);
const runtimeControlPath = join(root, "data", "assistant-runtime.json");

function nowIso() {
  return new Date().toISOString();
}

async function readRuntimeControl() {
  const fallback = defaultControl(nowIso());
  try {
    const raw = await readFile(runtimeControlPath, "utf-8");
    const parsed = JSON.parse(raw);
    return normalizeControl(parsed, nowIso());
  } catch {
    return fallback;
  }
}

function isMainAppProcess(args) {
  return (
    hasProcessPathFragment(args, "dist/electron/main.js") &&
    !hasProcessPathFragment(args, "dist/ghost-agent/electron/main.js")
  );
}

function isGhostAppProcess(args) {
  return hasProcessPathFragment(args, "dist/ghost-agent/electron/main.js");
}

function isWrapperProcess(args) {
  return hasProcessPathFragment(args, "scripts/ghost-agent-wrapper.mjs");
}

function isOpencodeServeProcess(args) {
  return /\bopencode\b.*\bserve\b/i.test(args);
}

function buildProcessProbes(entries) {
  const mainProcess = entries.some((entry) => isMainAppProcess(entry.args));
  const ghostProcess = entries.some((entry) => isGhostAppProcess(entry.args));
  const wrapperProcess = entries.some((entry) => isWrapperProcess(entry.args));
  const opencodeServerRunning = entries.some((entry) => isOpencodeServeProcess(entry.args));

  return {
    mainProcess,
    ghostProcess,
    wrapperProcess,
    opencodeServerRunning,
  };
}

function parseModeOnlyFlag(argv) {
  return argv.includes("--mode-only");
}

async function main() {
  const modeOnly = parseModeOnlyFlag(process.argv.slice(2));

  const [control, processEntries, assistantSlotSettings] = await Promise.all([
    readRuntimeControl(),
    readProcessEntries(),
    readAssistantSlotSettingsReport(root),
  ]);
  const probes = buildProcessProbes(processEntries);

  const resolved = resolveWhereAmI({
    control,
    probes,
    nowIso: nowIso(),
  });
  const providerContext = resolveWhereamiProviderContext({
    entries: processEntries,
    currentPid: process.pid,
    resolvedMode: resolved.mode,
    probes,
  });
  const effectiveMode =
    typeof providerContext.effectiveMode === "string" && providerContext.effectiveMode !== ""
      ? providerContext.effectiveMode
      : resolved.mode;

  const providerContextOutput = { ...providerContext };

  const payload = {
    ...resolved,
    mode: effectiveMode,
    appMode: resolved.mode,
    effectiveMode,
    providerContext: providerContextOutput,
    assistantSlotSettings,
    timestamp: nowIso(),
    runtimeControlPath,
  };

  if (modeOnly) {
    process.stdout.write(`${payload.mode}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  }

  if (payload.shouldStop) {
    process.exitCode = 2;
  }
}

void main();
