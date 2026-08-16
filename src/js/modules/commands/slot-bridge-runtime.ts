import type { CommandPayload, CommandProvider, SlotBridgeResult } from "@shared/index.js";
import { AppI18n } from "../i18n/index.js";
import { replaceProtocolTags } from "../core/send-actions.js";

export interface SlotBridgeCoreEngineRef {
  ensureReady(): Promise<void>;
  setActiveTargets(targets?: string[]): void;
  setConnection(
    provider: string,
    connected: boolean,
    opts?: { force?: boolean; url?: string }
  ): Promise<{ success: boolean; message?: string }>;
  sendBatchInternal(payload: {
    targets?: string[];
    text?: string;
    page?: string;
    attachments?: Array<{ name: string; path: string; mimeType?: string }>;
    [key: string]: unknown;
  }): Promise<{ success: boolean; message?: string }>;
  sendMessageInternal(payload: {
    provider?: string;
    text?: string;
    page?: string;
    attachments?: unknown[];
    [key: string]: unknown;
  }): Promise<{ success: boolean; message?: string }>;
}

export interface SlotBridgeProtocolRequest {
  room?: string;
  scenario?: string;
  targets?: string[];
  context?: Record<string, unknown>;
  mode?: string | null;
  preface?: string | null;
}

interface SlotBridgeDispatchDefaults {
  provider?: CommandProvider;
  source?: CommandProvider;
  fromSlot?: CommandProvider;
  message?: string;
}

interface SlotBridgeRelayRef {
  startProtocolSession?: (options: {
    providers?: string[];
    protocolPayload?: Record<string, unknown>;
    attachments?: Array<{ name: string; path: string; mimeType?: string }>;
  }) => Promise<void>;
  startSession?: (options: { providers?: string[] }) => Promise<void>;
  stopProtocolSession?: () => Promise<void>;
  stopSession?: () => Promise<void>;
  stopAssistantRelaySession?: () => Promise<void>;
}

interface SlotBridgeProtocolDispatchOptions extends SlotBridgeDispatchDefaults {
  ensureReady?: () => Promise<void>;
  relay?: SlotBridgeRelayRef | null;
}

let slotBridgeCoreEngine: SlotBridgeCoreEngineRef | null = null;
let slotBridgeHandlerRef: ((payload: CommandPayload) => Promise<SlotBridgeResult>) | null = null;

export function registerSlotBridgeCoreEngine(coreEngine: SlotBridgeCoreEngineRef): void {
  slotBridgeCoreEngine = coreEngine;
}

export function registerSlotBridgeHandler(
  handler: (payload: CommandPayload) => Promise<SlotBridgeResult>
): void {
  slotBridgeHandlerRef = handler;
}

export function getSlotBridgeCoreEngine(): SlotBridgeCoreEngineRef {
  if (slotBridgeCoreEngine === null) {
    throw new Error("SlotBridge core engine runtime is not registered");
  }

  return slotBridgeCoreEngine;
}

function normalizeDispatchDefaults(
  options: SlotBridgeDispatchDefaults = {}
): Required<SlotBridgeDispatchDefaults> {
  const provider = options.provider ?? "system";
  const source = options.source ?? provider;
  const fromSlot = options.fromSlot ?? source;
  return {
    provider,
    source,
    fromSlot,
    message: options.message ?? "++cmd:SlotBridge",
  };
}

export async function dispatchInternalSlotBridge(
  payload: CommandPayload = {},
  options: SlotBridgeDispatchDefaults = {}
): Promise<SlotBridgeResult> {
  const defaults = normalizeDispatchDefaults(options);
  if (slotBridgeHandlerRef === null) {
    throw new Error("SlotBridge handler runtime is not registered");
  }

  return await slotBridgeHandlerRef({
    provider: defaults.provider,
    source: defaults.source,
    fromSlot: defaults.fromSlot,
    message: defaults.message,
    ...payload,
  });
}

async function runSequentialAnalyzeRelayStart(
  request: SlotBridgeProtocolRequest,
  relay: SlotBridgeRelayRef | null
): Promise<{ success: boolean; message?: string }> {
  const room = request.room ?? "";
  const scenario = request.scenario ?? "";
  const targets = Array.isArray(request.targets) ? request.targets : [];
  const context =
    typeof request.context === "object" && Array.isArray(request.context) === false
      ? request.context
      : {};
  const preface = typeof request.preface === "string" ? request.preface : null;

  const [{ ProtocolHandler: protocolHandler }, { resolveComposedProtocolMessage }] =
    await Promise.all([
      import("../protocol-handler.js"),
      import("../protocol-message-composer.js"),
    ]);
  const protocolPayload = protocolHandler.buildPayload({
    room,
    scenario,
    targets,
    context,
  });
  if (protocolPayload === null) {
    return { success: false, message: AppI18n.t("app.commands.executor.unknownProtocol") };
  }

  const orderedTargets = [...protocolPayload.targets];
  const starter = typeof context["starter"] === "string" ? context["starter"] : null;
  if (starter !== null && orderedTargets.includes(starter) === true) {
    orderedTargets.splice(orderedTargets.indexOf(starter), 1);
    orderedTargets.unshift(starter);
  }

  if (orderedTargets.length === 0) {
    return { success: false, message: AppI18n.t("app.commands.executor.noConnectedTarget") };
  }

  const resolvedMessage = await resolveComposedProtocolMessage({
    fallbackTitle: protocolPayload.message,
    ...(typeof protocolPayload.protocolKey === "string" && protocolPayload.protocolKey !== ""
      ? { protocolKey: protocolPayload.protocolKey }
      : {}),
    ...(preface !== null ? { preface } : {}),
  });

  if (relay !== null && typeof relay.startProtocolSession === "function") {
    await relay.startProtocolSession({
      providers: orderedTargets,
      protocolPayload: {
        room,
        scenario,
        targets: orderedTargets,
        context,
        message: replaceProtocolTags(resolvedMessage.message),
      },
      attachments: [],
    });
  }

  return { success: true, message: "sequential-session-started" };
}

function applyAnalyzeRelayEffects(
  request: SlotBridgeProtocolRequest,
  success: boolean,
  relay: SlotBridgeRelayRef | null
): void {
  if (success !== true || relay === null || request.room !== "analyze") {
    return;
  }

  const targets = Array.isArray(request.targets) ? request.targets : [];
  if (request.scenario === "ai-ai" && typeof relay.startSession === "function") {
    void relay.startSession({ providers: targets });
    return;
  }

  if (request.scenario === "ai-ai-stop") {
    if (typeof relay.stopProtocolSession === "function") {
      void relay.stopProtocolSession();
    }
    if (typeof relay.stopSession === "function") {
      void relay.stopSession();
    }
    return;
  }

  if (
    request.scenario === "ai-assistant-stop" &&
    typeof relay.stopAssistantRelaySession === "function"
  ) {
    void relay.stopAssistantRelaySession();
  }
}

export async function sendProtocolThroughSlotBridge(
  request: SlotBridgeProtocolRequest = {},
  options: SlotBridgeProtocolDispatchOptions = {}
): Promise<{ success: boolean; message?: string }> {
  if (typeof options.ensureReady === "function") {
    await options.ensureReady();
  }

  const room = request.room ?? "";
  const scenario = request.scenario ?? "";
  const targets = Array.isArray(request.targets) ? request.targets : [];
  const context =
    typeof request.context === "object" && Array.isArray(request.context) === false
      ? request.context
      : {};

  if (room === "analyze" && scenario === "ai-ai" && request.mode === "aiRelaySequential") {
    return await runSequentialAnalyzeRelayStart(request, options.relay ?? null);
  }

  const bridgeResult = await dispatchInternalSlotBridge(
    {
      action: "message.send",
      ...(targets.length === 1 ? { toSlot: targets[0] } : { toSlots: targets }),
      payload: {
        protocol: {
          room,
          scenario,
          ...(typeof request.preface === "string" ? { preface: request.preface } : {}),
          ...(Object.keys(context).length > 0 ? { context } : {}),
        },
      },
    },
    options
  );

  applyAnalyzeRelayEffects(request, bridgeResult.success === true, options.relay ?? null);

  return {
    success: bridgeResult.success,
    ...(bridgeResult.message !== undefined ? { message: bridgeResult.message } : {}),
  };
}
