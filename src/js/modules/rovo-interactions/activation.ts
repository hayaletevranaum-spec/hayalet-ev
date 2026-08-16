import type { RovoInteractionActivationSnapshot } from "./types.js";

const OPENCODE_UI_ACCOUNT_ID = "opencode_ui_opencode_at_opencode_com";
const APP_MODES = new Set(["terminal", "app", "ghost-agent", "transitioning", "conflict"]);
const EFFECTIVE_MODES = new Set([
  "terminal",
  "app",
  "ghost-agent",
  "transitioning",
  "conflict",
  "opencode-terminal-mode",
  "other-provider-cli",
]);

function readAssistantAccountId(settings: unknown): string | null {
  if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
    return null;
  }

  const assistantSlot = (settings as Record<string, unknown>)["assistantSlot"];
  if (assistantSlot === null || typeof assistantSlot !== "object" || Array.isArray(assistantSlot)) {
    return null;
  }

  const accountId = (assistantSlot as Record<string, unknown>)["accountId"];
  return typeof accountId === "string" && accountId.trim() !== "" ? accountId.trim() : null;
}

function readAssistantRuntimeState(runtime: unknown): {
  mode: "terminal" | "soft" | "ghost-agent" | null;
  phase: "idle" | "preparing-handoff" | "in-ghost" | "returning" | null;
} {
  if (runtime === null || typeof runtime !== "object" || Array.isArray(runtime)) {
    return { mode: null, phase: null };
  }

  const record = runtime as Record<string, unknown>;
  const rawMode = typeof record["desiredMode"] === "string" ? record["desiredMode"].trim() : "";
  const rawPhase = typeof record["phase"] === "string" ? record["phase"].trim() : "";
  const mode: "terminal" | "soft" | "ghost-agent" | null =
    rawMode === "terminal" || rawMode === "soft" || rawMode === "ghost-agent" ? rawMode : null;
  const phase: "idle" | "preparing-handoff" | "in-ghost" | "returning" | null =
    rawPhase === "idle" ||
    rawPhase === "preparing-handoff" ||
    rawPhase === "in-ghost" ||
    rawPhase === "returning"
      ? rawPhase
      : null;

  return { mode, phase };
}

function readInteractionContext(context: unknown): {
  appMode: "terminal" | "app" | "ghost-agent" | "transitioning" | "conflict" | null;
  effectiveMode:
    | "terminal"
    | "app"
    | "ghost-agent"
    | "transitioning"
    | "conflict"
    | "opencode-terminal-mode"
    | "other-provider-cli"
    | null;
} {
  if (context === null || typeof context !== "object" || Array.isArray(context)) {
    return { appMode: null, effectiveMode: null };
  }

  const record = context as Record<string, unknown>;
  const rawAppMode = typeof record["appMode"] === "string" ? record["appMode"].trim() : "";
  const rawEffectiveMode =
    typeof record["effectiveMode"] === "string" ? record["effectiveMode"].trim() : "";
  const appMode = APP_MODES.has(rawAppMode)
    ? (rawAppMode as "terminal" | "app" | "ghost-agent" | "transitioning" | "conflict")
    : null;
  const effectiveMode = EFFECTIVE_MODES.has(rawEffectiveMode)
    ? (rawEffectiveMode as
        | "terminal"
        | "app"
        | "ghost-agent"
        | "transitioning"
        | "conflict"
        | "opencode-terminal-mode"
        | "other-provider-cli")
    : null;

  return { appMode, effectiveMode };
}

export async function loadRovoInteractionActivationSnapshot(
  providerId = "opencode-ui"
): Promise<RovoInteractionActivationSnapshot> {
  const api = window.electronAPI;
  if (api === undefined) {
    return {
      active: false,
      providerId,
      assistantAccountId: null,
      appMode: null,
      effectiveMode: null,
      assistantRuntimeMode: null,
      assistantRuntimePhase: null,
      opencodeServeRunning: false,
      reason: "Electron bridge is unavailable.",
    };
  }

  const apiLoadSettings = api["loadSettings"] as
    (() => Promise<Record<string, unknown>>) | undefined;
  const apiOpencodeServeStatus = api["opencodeServeStatus"] as
    | (() => Promise<{
        running: boolean;
        port?: number;
        url?: string;
        pid?: number;
        startTime?: number;
      }>)
    | undefined;
  const apiAssistantRuntimeRead = api["assistantRuntimeRead"] as
    (() => Promise<{ success: boolean; state?: unknown }>) | undefined;
  const apiRovoInteractionContextRead = api["rovoInteractionContextRead"] as
    (() => Promise<{ success: boolean; appMode?: string; effectiveMode?: string }>) | undefined;

  const [settingsResult, serveStatusResult, runtimeResult, contextResult] =
    await Promise.allSettled([
      typeof apiLoadSettings === "function" ? apiLoadSettings() : Promise.resolve({}),
      typeof apiOpencodeServeStatus === "function"
        ? apiOpencodeServeStatus()
        : Promise.resolve({ running: false }),
      typeof apiAssistantRuntimeRead === "function"
        ? apiAssistantRuntimeRead()
        : Promise.resolve({ success: false }),
      typeof apiRovoInteractionContextRead === "function"
        ? apiRovoInteractionContextRead()
        : Promise.resolve({ success: false }),
    ]);

  const settings = settingsResult.status === "fulfilled" ? settingsResult.value : null;
  const assistantAccountId = readAssistantAccountId(settings);
  const serveStatus = serveStatusResult.status === "fulfilled" ? serveStatusResult.value : null;
  const opencodeServeRunning = serveStatus?.running === true;
  const runtimePayload = runtimeResult.status === "fulfilled" ? runtimeResult.value : null;
  const runtimeState =
    runtimePayload !== null &&
    typeof runtimePayload === "object" &&
    "success" in runtimePayload &&
    (runtimePayload as { success?: unknown }).success === true &&
    "state" in runtimePayload
      ? (runtimePayload as { state?: unknown }).state
      : null;
  const { mode: assistantRuntimeMode, phase: assistantRuntimePhase } =
    readAssistantRuntimeState(runtimeState);
  const contextPayload = contextResult.status === "fulfilled" ? contextResult.value : null;
  const contextState =
    contextPayload !== null &&
    typeof contextPayload === "object" &&
    "success" in contextPayload &&
    (contextPayload as { success?: unknown }).success === true
      ? contextPayload
      : null;
  const { appMode, effectiveMode } = readInteractionContext(contextState);

  if (providerId !== "opencode-ui") {
    return {
      active: false,
      providerId,
      assistantAccountId,
      appMode,
      effectiveMode,
      assistantRuntimeMode,
      assistantRuntimePhase,
      opencodeServeRunning,
      reason: `Provider ${providerId} is outside the V1 interaction scope.`,
    };
  }

  if (effectiveMode !== "app") {
    return {
      active: false,
      providerId,
      assistantAccountId,
      appMode,
      effectiveMode,
      assistantRuntimeMode,
      assistantRuntimePhase,
      opencodeServeRunning,
      reason:
        effectiveMode === null
          ? "Interaction mode context is unavailable."
          : `Interaction mode ${effectiveMode} is outside the V1 interaction scope.`,
    };
  }

  if (!opencodeServeRunning) {
    return {
      active: false,
      providerId,
      assistantAccountId,
      appMode,
      effectiveMode,
      assistantRuntimeMode,
      assistantRuntimePhase,
      opencodeServeRunning,
      reason: "OpenCode serve is not active.",
    };
  }

  if (assistantAccountId !== OPENCODE_UI_ACCOUNT_ID) {
    return {
      active: false,
      providerId,
      assistantAccountId,
      appMode,
      effectiveMode,
      assistantRuntimeMode,
      assistantRuntimePhase,
      opencodeServeRunning,
      reason: "Assistant slot is not assigned to the OpenCode UI account.",
    };
  }

  return {
    active: true,
    providerId,
    assistantAccountId,
    appMode,
    effectiveMode,
    assistantRuntimeMode,
    assistantRuntimePhase,
    opencodeServeRunning,
    reason: "OpenCode serve is active and the assistant slot uses the OpenCode UI account.",
  };
}
