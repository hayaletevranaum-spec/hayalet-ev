import { generateUniqueId } from "../../constants/index.js";
import {
  getErrorMessage,
  type CommandPayload,
  type CommandProvider,
  type SlotBridgeAction,
  type SlotBridgeAttachmentDescriptor,
  type SlotBridgeConnectPolicy,
  type SlotBridgeEnvelope,
  type SlotBridgeProjectRef,
  type SlotBridgeProtocolDescriptor,
  type SlotBridgeReply,
  type SlotBridgeResult,
  type SlotBridgeSessionRef,
} from "@shared/index.js";
import type { AppSettings } from "@shared/settings.js";
import { AppState } from "../app-state.js";
import { ConversationListManager } from "../conversation-list-manager.js";
import { RoomCommandRegistry } from "../rooms/room-command-registry.js";
import { SlotController, SlotState } from "../slot-controller.js";
import { SettingsManager } from "../settings-manager.js";
import { TrafficManager } from "../traffic-manager.js";
import { replaceProtocolTagsWithResolver } from "../../../../shared/protocol-tags.js";
import { resolveOpencodeUiDbPath } from "../../pages/assistant/opencode-preferences.js";
import { AssistantProviderRegistry } from "../../pages/assistant/provider-registry.js";
import { hashString } from "../webview/providers/shared/scraper-helpers.js";
import { ProviderRegistry } from "../webview/provider-registry.js";
import {
  getSlotBridgeCoreEngine,
  registerSlotBridgeHandler,
  type SlotBridgeCoreEngineRef,
} from "./slot-bridge-runtime.js";
import {
  finalizeSlotBridgeProjectSessionResult,
  prepareSlotBridgeProjectSessionEnvelope,
  readSlotBridgeProjectRef,
  shouldReturnProjectSessionWarningOnly,
  type SlotBridgeProjectSessionContext,
} from "./slot-bridge-project-sessions.js";

export const SLOT_BRIDGE_COMMAND_NAME = "SlotBridge";

export const SLOT_BRIDGE_ACTIONS = [
  "message.send",
  "message.sendWait",
  "connection.ensure",
  "session.open",
  "session.switch",
  "session.sync",
  "room.command",
] as const satisfies readonly SlotBridgeAction[];

const SLOT_BRIDGE_RETIRED_ACTIONS = ["message.sendWithAttachments", "file.send"] as const;

export type SlotBridgeActionKey = (typeof SLOT_BRIDGE_ACTIONS)[number];
export type SlotBridgeActionCategory = "ai0" | "ai1-ai2" | "us1";
type SlotBridgeRetiredActionKey = (typeof SLOT_BRIDGE_RETIRED_ACTIONS)[number];
type NormalizedSlotBridgeEnvelope = SlotBridgeEnvelope & {
  retiredAction?: SlotBridgeRetiredActionKey | null;
};

interface SlotBridgeConversationListManagerRef {
  refresh(options: { silent?: boolean; forceSelectId?: string; provider?: string }): Promise<void>;
  updateSelection(
    conversationId: string,
    options?: { silent?: boolean; provider?: string | null }
  ): boolean;
}

interface SlotBridgeWebviewRef {
  executeJavaScript(script: string): Promise<unknown>;
}

interface SlotBridgeWebviewManagerRef {
  syncProvider(provider: string, opts?: Record<string, unknown>): Promise<unknown>;
  resolveWebview(provider: string): SlotBridgeWebviewRef | null;
}

const SLOT_BRIDGE_ACTION_SET = new Set<string>(SLOT_BRIDGE_ACTIONS);
const SLOT_BRIDGE_TIMEOUT_MS = 45_000;
const SLOT_BRIDGE_READY_WAIT_TIMEOUT_MS = 60_000;
const SLOT_BRIDGE_READY_POLL_INTERVAL_MS = 250;
const SLOT_BRIDGE_IDEMPOTENCY_TTL_MS = 5 * 60_000;

const SLOT_BRIDGE_ACTION_CATEGORIES: Record<SlotBridgeActionKey, SlotBridgeActionCategory[]> = {
  "message.send": ["ai0", "ai1-ai2", "us1"],
  "message.sendWait": ["ai0", "ai1-ai2", "us1"],
  "connection.ensure": ["ai0", "ai1-ai2", "us1"],
  "session.open": ["ai0", "ai1-ai2"],
  "session.switch": ["ai0", "ai1-ai2", "us1"],
  "session.sync": ["ai0", "ai1-ai2", "us1"],
  "room.command": ["ai0", "ai1-ai2", "us1"],
};

const SLOT_BRIDGE_AUTO_CONNECT_ACTIONS = new Set<SlotBridgeActionKey>([
  "message.send",
  "message.sendWait",
  "session.open",
  "session.switch",
]);

type SlotBridgeMessageRequestCacheEntry = {
  brokerMessageId: string;
  createdAt: number;
  promise: Promise<SlotBridgeResult>;
  result?: SlotBridgeResult;
};

const slotBridgeMessageRequestCache = new Map<string, SlotBridgeMessageRequestCacheEntry>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && Array.isArray(value) === false;
}

function normalizeSlotBridgeAction(value: unknown): SlotBridgeActionKey | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return SLOT_BRIDGE_ACTION_SET.has(normalized) ? (normalized as SlotBridgeActionKey) : null;
}

function normalizeRetiredSlotBridgeAction(value: unknown): SlotBridgeRetiredActionKey | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return SLOT_BRIDGE_RETIRED_ACTIONS.includes(normalized as SlotBridgeRetiredActionKey)
    ? (normalized as SlotBridgeRetiredActionKey)
    : null;
}

export function getSlotBridgeAction(value: unknown): SlotBridgeActionKey | null {
  return normalizeSlotBridgeAction(value);
}

export function getSlotBridgeActionCategories(
  action: SlotBridgeActionKey
): SlotBridgeActionCategory[] {
  return SLOT_BRIDGE_ACTION_CATEGORIES[action];
}

function normalizeCommandProvider(value: unknown): CommandProvider | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized === "ai0" ||
    normalized === "ai1" ||
    normalized === "ai2" ||
    normalized === "room-ui" ||
    normalized === "us1" ||
    normalized === "user" ||
    normalized === "system"
    ? normalized
    : null;
}

function normalizeSlotId(value: unknown): "ai0" | "ai1" | "ai2" | null {
  return value === "ai0" || value === "ai1" || value === "ai2" ? value : null;
}

function normalizeMessageTarget(value: unknown): "ai0" | "ai1" | "ai2" | "us1" | null {
  return value === "us1" ? "us1" : normalizeSlotId(value);
}

function normalizeSessionTarget(
  action: "session.open" | "session.switch",
  value: unknown
): "ai0" | "ai1" | "ai2" | "us1" | null {
  return action === "session.switch" ? normalizeMessageTarget(value) : normalizeSlotId(value);
}

function getSlotProviderConfig(
  slot: "ai0" | "ai1" | "ai2"
): { providerId: string; config: Record<string, unknown> } | null {
  const providerId = AppState.getProviderIdForSlot(slot)?.trim() ?? "";
  if (providerId === "") {
    return null;
  }
  const config = ProviderRegistry.get(providerId);
  return config !== null ? { providerId, config } : null;
}

function isLocalSessionSlot(slot: "ai0" | "ai1" | "ai2"): boolean {
  if (slot === "ai0") {
    return false;
  }
  const provider = getSlotProviderConfig(slot);
  return (
    provider?.config["syncOnDefaultPage"] === true &&
    provider.config["preserveSyncUrlQuery"] === true &&
    typeof provider.config["baseUrl"] === "string"
  );
}

function createLocalSessionId(providerId: string): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const randomId =
    typeof cryptoApi?.randomUUID === "function"
      ? cryptoApi.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${providerId}-${randomId}`;
}

function readLocalSessionIdFromUrl(url: string): string {
  if (url.trim() === "") {
    return "";
  }
  try {
    return new URL(url).searchParams.get("session")?.trim() ?? "";
  } catch {
    return "";
  }
}

function readRequestedLocalSessionId(
  sessionRef: SlotBridgeSessionRef | null | undefined,
  providerId: string
): string {
  const requested = sessionRef?.id?.trim() ?? "";
  if (requested !== "") {
    return requested;
  }
  return createLocalSessionId(providerId);
}

function buildLocalSessionUrl(
  slot: "ai0" | "ai1" | "ai2",
  sessionId: string
): { sessionId: string; url: string } | null {
  const provider = getSlotProviderConfig(slot);
  const baseUrl = typeof provider?.config["baseUrl"] === "string" ? provider.config["baseUrl"] : "";
  if (provider === null || baseUrl === "" || sessionId.trim() === "") {
    return null;
  }

  try {
    const url = new URL(baseUrl);
    url.searchParams.set("session", sessionId.trim());
    return { sessionId: sessionId.trim(), url: url.toString() };
  } catch {
    return null;
  }
}

function readCommandProviderArray(value: unknown): CommandProvider[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const next: CommandProvider[] = [];
  value.forEach((item) => {
    const normalized = normalizeCommandProvider(item);
    if (normalized !== null && next.includes(normalized) !== true) {
      next.push(normalized);
    }
  });
  return next;
}

function normalizeConnectPolicy(
  action: SlotBridgeActionKey,
  value: unknown,
  force: boolean
): SlotBridgeConnectPolicy {
  if (value === "never" || value === "ensure" || value === "require-ready") {
    return value;
  }
  return force === true || SLOT_BRIDGE_AUTO_CONNECT_ACTIONS.has(action) ? "ensure" : "never";
}

function readTimeoutMs(value: unknown, fallback = SLOT_BRIDGE_TIMEOUT_MS): number {
  if (typeof value !== "number" || Number.isFinite(value) !== true) {
    return fallback;
  }
  return Math.max(1_000, Math.trunc(value));
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readSessionRef(value: unknown): SlotBridgeSessionRef | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value["id"] === "string" ? value["id"].trim() : "";
  const conversationId =
    typeof value["conversationId"] === "string" ? value["conversationId"].trim() : "";
  const threadId = typeof value["threadId"] === "string" ? value["threadId"].trim() : "";
  const openHint = typeof value["openHint"] === "string" ? value["openHint"].trim() : "";

  if (id === "" && conversationId === "" && threadId === "" && openHint === "") {
    return null;
  }

  return {
    ...(id !== "" ? { id } : {}),
    ...(conversationId !== "" ? { conversationId } : {}),
    ...(threadId !== "" ? { threadId } : {}),
    ...(openHint !== "" ? { openHint } : {}),
  };
}

function readProjectRef(value: unknown): SlotBridgeProjectRef | null {
  return readSlotBridgeProjectRef(value);
}

function toAttachmentDescriptor(value: unknown): SlotBridgeAttachmentDescriptor | null {
  if (!isRecord(value)) {
    return null;
  }

  const name =
    typeof value["name"] === "string" && value["name"].trim() !== "" ? value["name"].trim() : "";
  if (name === "") {
    return null;
  }

  const kind =
    value["kind"] === "attachment-ref" ||
    value["kind"] === "filesystem" ||
    value["kind"] === "archive-attachment" ||
    value["kind"] === "generated-image"
      ? value["kind"]
      : undefined;
  const ref = typeof value["ref"] === "string" ? value["ref"].trim() : "";
  const path = typeof value["path"] === "string" ? value["path"].trim() : "";
  const url = typeof value["url"] === "string" ? value["url"].trim() : "";
  const archivePath = typeof value["archivePath"] === "string" ? value["archivePath"].trim() : "";
  const mimeType = typeof value["mimeType"] === "string" ? value["mimeType"].trim() : "";
  const sourceSlot = normalizeSlotId(value["sourceSlot"]);
  const conversationId =
    typeof value["conversationId"] === "string" ? value["conversationId"].trim() : "";
  const messageId = typeof value["messageId"] === "string" ? value["messageId"].trim() : "";
  const size =
    typeof value["size"] === "number" && Number.isFinite(value["size"]) ? value["size"] : undefined;

  return {
    name,
    ...(kind !== undefined ? { kind } : {}),
    ...(ref !== "" ? { ref } : {}),
    ...(path !== "" ? { path } : {}),
    ...(url !== "" ? { url } : {}),
    ...(archivePath !== "" ? { archivePath } : {}),
    ...(mimeType !== "" ? { mimeType } : {}),
    ...(sourceSlot !== null ? { sourceSlot } : {}),
    ...(conversationId !== "" ? { conversationId } : {}),
    ...(messageId !== "" ? { messageId } : {}),
    ...(size !== undefined ? { size } : {}),
  };
}

function readAttachments(value: unknown): SlotBridgeAttachmentDescriptor[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const descriptor = toAttachmentDescriptor(item);
    return descriptor !== null ? [descriptor] : [];
  });
}

function readProtocolDescriptor(envelope: SlotBridgeEnvelope): SlotBridgeProtocolDescriptor | null {
  const actionPayload = isRecord(envelope.payload) ? envelope.payload : {};
  const protocolPayload = isRecord(actionPayload["protocol"]) ? actionPayload["protocol"] : {};
  const source = Object.keys(protocolPayload).length > 0 ? protocolPayload : actionPayload;

  const room =
    typeof source["room"] === "string" && source["room"].trim() !== "" ? source["room"].trim() : "";
  const scenario =
    typeof source["scenario"] === "string" && source["scenario"].trim() !== ""
      ? source["scenario"].trim()
      : "";
  const protocolKey =
    typeof source["protocolKey"] === "string" && source["protocolKey"].trim() !== ""
      ? source["protocolKey"].trim()
      : "";
  const fallbackTitle =
    typeof source["fallbackTitle"] === "string" && source["fallbackTitle"].trim() !== ""
      ? source["fallbackTitle"].trim()
      : typeof source["title"] === "string" && source["title"].trim() !== ""
        ? source["title"].trim()
        : "";
  const preface =
    typeof source["preface"] === "string" && source["preface"].trim() !== ""
      ? source["preface"].trim()
      : null;
  const textPosition =
    source["textPosition"] === "before" ||
    source["textPosition"] === "after" ||
    source["textPosition"] === "replace"
      ? source["textPosition"]
      : undefined;
  const context = isRecord(source["context"]) ? source["context"] : null;

  if (
    room === "" &&
    scenario === "" &&
    protocolKey === "" &&
    fallbackTitle === "" &&
    preface === null
  ) {
    return null;
  }

  return {
    ...(room !== "" ? { room } : {}),
    ...(scenario !== "" ? { scenario } : {}),
    ...(protocolKey !== "" ? { protocolKey } : {}),
    ...(fallbackTitle !== "" ? { fallbackTitle } : {}),
    ...(preface !== null ? { preface } : {}),
    ...(context !== null ? { context } : {}),
    ...(textPosition !== undefined ? { textPosition } : {}),
  };
}

function hasEnvelopeKeys(source: Record<string, unknown>): boolean {
  const envelopeKeys = [
    "action",
    "brokerMessageId",
    "clientRequestId",
    "payload",
    "toSlot",
    "toSlots",
    "target",
    "targets",
    "replyToSlot",
    "delivery",
    "wait",
    "timeoutMs",
    "force",
    "connectPolicy",
    "sessionRef",
    "session",
    "projectRef",
    "project",
    "attachments",
  ];
  return envelopeKeys.some((key) => key in source);
}

function buildActionPayload(
  source: Record<string, unknown>,
  fallback: Record<string, unknown>,
  rawArgs = ""
): Record<string, unknown> {
  if (Object.keys(fallback).length > 0 && hasEnvelopeKeys(source) === false) {
    return {
      ...fallback,
      ...(rawArgs.trim() !== "" && typeof fallback["rawArgs"] !== "string"
        ? { rawArgs: rawArgs.trim() }
        : {}),
    };
  }

  if (isRecord(source["payload"])) {
    const nestedPayload = source["payload"];
    return {
      ...fallback,
      ...nestedPayload,
      ...(rawArgs.trim() !== "" && typeof nestedPayload["rawArgs"] !== "string"
        ? { rawArgs: rawArgs.trim() }
        : {}),
    };
  }

  const knownKeys = new Set([
    "version",
    "reqId",
    "clientRequestId",
    "brokerMessageId",
    "action",
    "fromSlot",
    "toSlot",
    "replyToSlot",
    "delivery",
    "wait",
    "timeoutMs",
    "force",
    "connectPolicy",
    "sessionRef",
    "session",
    "projectRef",
    "project",
    "attachments",
  ]);

  const derived = Object.entries(source).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (knownKeys.has(key)) {
      return acc;
    }
    acc[key] = value;
    return acc;
  }, {});

  return Object.keys(derived).length > 0 ? { ...fallback, ...derived } : fallback;
}

function buildTopLevelActionPayload(payload: CommandPayload = {}): Record<string, unknown> {
  const knownKeys = new Set([
    "version",
    "reqId",
    "clientRequestId",
    "brokerMessageId",
    "action",
    "fromSlot",
    "toSlot",
    "replyToSlot",
    "delivery",
    "wait",
    "timeoutMs",
    "force",
    "connectPolicy",
    "sessionRef",
    "session",
    "projectRef",
    "project",
    "attachments",
    "payload",
    "args",
    "provider",
    "source",
    "target",
    "targets",
    "message",
  ]);

  return Object.entries(payload).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (knownKeys.has(key)) {
      return acc;
    }
    acc[key] = value;
    return acc;
  }, {});
}

function buildImplicitSlotBridgeClientRequestId(params: {
  action: SlotBridgeActionKey;
  fromSlot: CommandProvider;
  payloadFingerprint: Record<string, unknown>;
  replyToSlot: CommandProvider;
  sessionRef: SlotBridgeSessionRef | null;
  toSlot: CommandProvider | null;
  toSlots: CommandProvider[];
}): string {
  return `slotbridge-implicit:${hashString(
    JSON.stringify({
      action: params.action,
      fromSlot: params.fromSlot,
      payloadFingerprint: params.payloadFingerprint,
      replyToSlot: params.replyToSlot,
      sessionRef: params.sessionRef,
      toSlot: params.toSlot,
      toSlots: params.toSlots,
    })
  )}`;
}

function normalizeEnvelope(payload: CommandPayload = {}): NormalizedSlotBridgeEnvelope {
  const parsedArgs = parseJsonRecord(typeof payload.args === "string" ? payload.args : "") ?? {};
  const directPayload = isRecord(payload["payload"]) ? payload["payload"] : {};
  const fallbackPayload = {
    ...buildTopLevelActionPayload(payload),
    ...directPayload,
  };
  const rawSessionRef =
    parsedArgs["sessionRef"] ??
    parsedArgs["session"] ??
    payload["sessionRef"] ??
    payload["session"] ??
    null;
  const sessionRef = readSessionRef(rawSessionRef);
  const projectRef = readProjectRef(
    parsedArgs["projectRef"] ??
      parsedArgs["project"] ??
      payload["projectRef"] ??
      payload["project"] ??
      directPayload["projectRef"] ??
      directPayload["project"] ??
      null
  );
  const fromSlot =
    normalizeCommandProvider(parsedArgs["fromSlot"]) ??
    normalizeCommandProvider(payload["fromSlot"]) ??
    normalizeCommandProvider(payload.provider) ??
    normalizeCommandProvider(payload.source) ??
    "system";
  const toSlot =
    normalizeCommandProvider(parsedArgs["toSlot"]) ??
    normalizeCommandProvider(parsedArgs["target"]) ??
    normalizeCommandProvider(payload["toSlot"]) ??
    normalizeCommandProvider(payload["target"]) ??
    null;
  const replyToSlot =
    normalizeCommandProvider(parsedArgs["replyToSlot"]) ??
    normalizeCommandProvider(payload["replyToSlot"]) ??
    fromSlot;
  const toSlots = readCommandProviderArray(
    parsedArgs["toSlots"] ??
      parsedArgs["targets"] ??
      payload["toSlots"] ??
      payload["targets"] ??
      directPayload["toSlots"] ??
      directPayload["targets"]
  );
  const force = parsedArgs["force"] === true || payload["force"] === true;
  const requestedAction = parsedArgs["action"] ?? payload["action"];
  const retiredAction = normalizeRetiredSlotBridgeAction(requestedAction);
  const action = normalizeSlotBridgeAction(requestedAction) ?? "message.send";
  const explicitClientRequestId =
    typeof parsedArgs["clientRequestId"] === "string" && parsedArgs["clientRequestId"].trim() !== ""
      ? parsedArgs["clientRequestId"].trim()
      : typeof payload["clientRequestId"] === "string" && payload["clientRequestId"].trim() !== ""
        ? payload["clientRequestId"].trim()
        : "";
  const reqId =
    typeof parsedArgs["reqId"] === "string" && parsedArgs["reqId"].trim() !== ""
      ? parsedArgs["reqId"].trim()
      : typeof payload["reqId"] === "string" && payload["reqId"].trim() !== ""
        ? payload["reqId"].trim()
        : generateUniqueId("slotbridge");
  const explicitBrokerMessageId =
    typeof parsedArgs["brokerMessageId"] === "string" && parsedArgs["brokerMessageId"].trim() !== ""
      ? parsedArgs["brokerMessageId"].trim()
      : typeof payload["brokerMessageId"] === "string" && payload["brokerMessageId"].trim() !== ""
        ? payload["brokerMessageId"].trim()
        : "";

  return {
    version:
      typeof parsedArgs["version"] === "number" && Number.isFinite(parsedArgs["version"])
        ? Math.trunc(parsedArgs["version"])
        : typeof payload["version"] === "number" && Number.isFinite(payload["version"])
          ? Math.trunc(payload["version"])
          : 1,
    reqId,
    clientRequestId:
      explicitClientRequestId !== ""
        ? explicitClientRequestId
        : buildImplicitSlotBridgeClientRequestId({
            action,
            fromSlot,
            payloadFingerprint: {
              args: parsedArgs,
              attachments: payload["attachments"] ?? directPayload["attachments"] ?? null,
              fallbackPayload,
              projectRef,
              message:
                typeof payload["message"] === "string" && payload["message"].trim() !== ""
                  ? payload["message"].trim()
                  : null,
            },
            replyToSlot,
            sessionRef,
            toSlot,
            toSlots,
          }),
    ...(explicitBrokerMessageId !== ""
      ? {
          brokerMessageId: explicitBrokerMessageId,
        }
      : {}),
    action,
    ...(retiredAction !== null ? { retiredAction } : {}),
    fromSlot,
    toSlot,
    ...(toSlots.length > 0 ? { toSlots } : {}),
    replyToSlot,
    delivery:
      parsedArgs["delivery"] === "sync" || parsedArgs["delivery"] === "async"
        ? parsedArgs["delivery"]
        : action === "message.sendWait"
          ? "sync"
          : "async",
    wait: parsedArgs["wait"] === true || action === "message.sendWait",
    timeoutMs: readTimeoutMs(parsedArgs["timeoutMs"] ?? payload["timeoutMs"]),
    force,
    connectPolicy: normalizeConnectPolicy(
      action,
      parsedArgs["connectPolicy"] ?? payload["connectPolicy"],
      force
    ),
    sessionRef,
    projectRef,
    payload: buildActionPayload(
      parsedArgs,
      fallbackPayload,
      typeof payload.args === "string" ? payload.args : ""
    ),
    attachments: readAttachments(parsedArgs["attachments"] ?? payload.attachments),
  };
}

function buildResult(
  envelope: SlotBridgeEnvelope,
  partial: Partial<SlotBridgeResult> = {}
): SlotBridgeResult {
  const success = partial.success !== false;
  const result: SlotBridgeResult = {
    success,
    ok: success,
    reply: partial.reply ?? null,
    session: partial.session ?? envelope.sessionRef ?? null,
    artifacts: partial.artifacts ?? [],
  };
  if (typeof envelope.reqId === "string" && envelope.reqId !== "") {
    result.reqId = envelope.reqId;
  }
  if (typeof envelope.clientRequestId === "string" && envelope.clientRequestId !== "") {
    result.clientRequestId = envelope.clientRequestId;
  }
  if (typeof envelope.brokerMessageId === "string" && envelope.brokerMessageId !== "") {
    result.brokerMessageId = envelope.brokerMessageId;
  }
  if (partial.code !== undefined) {
    result.code = partial.code;
  }
  if (partial.message !== undefined) {
    result.message = partial.message;
  }
  if (partial.error !== undefined) {
    result.error = partial.error;
  }
  if (partial.data !== undefined) {
    result.data = partial.data;
  }
  return result;
}

function buildErrorResult(
  envelope: SlotBridgeEnvelope,
  code: string,
  message: string,
  detail?: unknown
): SlotBridgeResult {
  return buildResult(envelope, {
    success: false,
    code,
    message,
    ...(detail !== undefined ? { error: getErrorMessage(detail) } : {}),
  });
}

function buildRetiredActionMessage(action: SlotBridgeRetiredActionKey): string {
  if (action === "message.sendWithAttachments") {
    return "message.sendWithAttachments was removed. Use message.send or message.sendWait with attachments instead.";
  }
  return "file.send was removed. Use message.send or message.sendWait with attachments instead.";
}

function readActionText(envelope: SlotBridgeEnvelope, payload: CommandPayload): string {
  const actionPayload = isRecord(envelope.payload) ? envelope.payload : {};
  const candidates = [
    actionPayload["text"],
    actionPayload["message"],
    payload["text"],
    payload["message"],
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate.trim();
    }
  }
  return "";
}

function replaceProtocolTags(text: string): string {
  return replaceProtocolTagsWithResolver(text, (provider) => AppState.getNickname(provider));
}

async function resolveProtocolActionText(envelope: SlotBridgeEnvelope): Promise<string> {
  const protocol = readProtocolDescriptor(envelope);
  if (protocol === null) {
    return "";
  }

  const [{ ProtocolHandler: protocolHandler }, { resolveComposedProtocolMessage }] =
    await Promise.all([
      import("../protocol-handler.js"),
      import("../protocol-message-composer.js"),
    ]);
  const descriptor = protocolHandler.resolveDescriptor({
    context: protocol.context ?? {},
    fallbackTitle: protocol.fallbackTitle ?? "",
    ...(protocol.room !== undefined ? { room: protocol.room } : {}),
    ...(protocol.scenario !== undefined ? { scenario: protocol.scenario } : {}),
    ...(protocol.protocolKey !== undefined ? { protocolKey: protocol.protocolKey } : {}),
  });
  if (descriptor === null) {
    return "";
  }

  const resolved = await resolveComposedProtocolMessage({
    fallbackTitle: descriptor.fallbackTitle,
    ...(descriptor.protocolKey !== undefined ? { protocolKey: descriptor.protocolKey } : {}),
    ...(protocol.preface !== undefined ? { preface: protocol.preface } : {}),
  });
  return replaceProtocolTags(resolved.message);
}

function mergeActionText(
  text: string,
  protocolText: string,
  textPosition: SlotBridgeProtocolDescriptor["textPosition"] = "after"
): string {
  const plain = text.trim();
  const protocol = protocolText.trim();
  if (protocol === "") {
    return plain;
  }
  if (plain === "" || textPosition === "replace") {
    return protocol;
  }
  return textPosition === "before" ? `${plain}\n\n${protocol}` : `${protocol}\n\n${plain}`;
}

async function composeActionText(
  envelope: SlotBridgeEnvelope,
  payload: CommandPayload
): Promise<string> {
  const protocol = readProtocolDescriptor(envelope);
  const plainText = readActionText(envelope, payload);
  if (protocol === null) {
    return plainText;
  }

  const protocolText = await resolveProtocolActionText(envelope);
  return mergeActionText(plainText, protocolText, protocol.textPosition ?? "after");
}

function readActionPage(envelope: SlotBridgeEnvelope, payload: CommandPayload): string {
  const actionPayload = isRecord(envelope.payload) ? envelope.payload : {};
  const candidates = [actionPayload["page"], payload["page"]];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate.trim();
    }
  }
  return `slot-bridge:${envelope.action}`;
}

function readArchiveFolders(envelope: SlotBridgeEnvelope): Record<string, string> | undefined {
  const actionPayload = isRecord(envelope.payload) ? envelope.payload : {};
  const candidate = actionPayload["archiveFolders"];
  if (!isRecord(candidate)) {
    return undefined;
  }

  const next = Object.entries(candidate).reduce<Record<string, string>>((acc, [key, value]) => {
    if (typeof value === "string" && value.trim() !== "") {
      acc[key] = value.trim();
    }
    return acc;
  }, {});

  return Object.keys(next).length > 0 ? next : undefined;
}

function readActionRemoteUserId(envelope: SlotBridgeEnvelope): string | null {
  const actionPayload = isRecord(envelope.payload) ? envelope.payload : {};
  const candidate = actionPayload["remoteUserId"];
  return typeof candidate === "string" && candidate.trim() !== "" ? candidate.trim() : null;
}

function buildRequestMarker(reqId: string | undefined): string {
  const normalizedReqId = typeof reqId === "string" ? reqId.trim() : "";
  return normalizedReqId !== "" ? `<!-- hev-req:${normalizedReqId} -->` : "";
}

function appendRequestMarker(text: string, envelope: SlotBridgeEnvelope): string {
  if (
    (typeof envelope.clientRequestId === "string" && envelope.clientRequestId.trim() !== "") ||
    (typeof envelope.brokerMessageId === "string" && envelope.brokerMessageId.trim() !== "")
  ) {
    return text;
  }

  const marker = buildRequestMarker(envelope.reqId);
  if (marker === "") {
    return text;
  }
  if (text.includes(marker)) {
    return text;
  }
  return text !== "" ? `${text}\n${marker}` : marker;
}

function pruneMessageRequestCache(now = Date.now()): void {
  for (const [key, entry] of slotBridgeMessageRequestCache.entries()) {
    if (now - entry.createdAt > SLOT_BRIDGE_IDEMPOTENCY_TTL_MS) {
      slotBridgeMessageRequestCache.delete(key);
    }
  }
}

function readClientRequestId(envelope: SlotBridgeEnvelope): string {
  if (typeof envelope.clientRequestId === "string" && envelope.clientRequestId.trim() !== "") {
    return envelope.clientRequestId.trim();
  }
  if (typeof envelope.reqId === "string" && envelope.reqId.trim() !== "") {
    return envelope.reqId.trim();
  }
  return "";
}

function buildMessageRequestCacheKey(
  envelope: SlotBridgeEnvelope,
  targets: UnifiedMessageTarget[],
  clientRequestId: string
): string {
  const sessionId =
    envelope.sessionRef?.conversationId?.trim() ?? envelope.sessionRef?.id?.trim() ?? "";
  return [
    envelope.action,
    envelope.fromSlot ?? "system",
    [...targets].sort().join(","),
    envelope.replyToSlot ?? "",
    sessionId,
    clientRequestId,
  ].join("|");
}

function buildMessageBrokerMessageId(
  envelope: SlotBridgeEnvelope,
  targets: UnifiedMessageTarget[],
  clientRequestId: string
): string {
  const explicitBrokerMessageId =
    typeof envelope.brokerMessageId === "string" ? envelope.brokerMessageId.trim() : "";
  if (explicitBrokerMessageId !== "") {
    return explicitBrokerMessageId;
  }

  const sessionId =
    envelope.sessionRef?.conversationId?.trim() ?? envelope.sessionRef?.id?.trim() ?? "";
  return `broker:${hashString(
    [
      envelope.action,
      envelope.fromSlot ?? "system",
      [...targets].sort().join(","),
      envelope.replyToSlot ?? "",
      sessionId,
      clientRequestId,
    ].join("|")
  )}`;
}

async function runMessageActionIdempotent(
  envelope: SlotBridgeEnvelope,
  targets: UnifiedMessageTarget[],
  execute: (nextEnvelope: SlotBridgeEnvelope) => Promise<SlotBridgeResult>
): Promise<SlotBridgeResult> {
  const clientRequestId = readClientRequestId(envelope);
  if (clientRequestId === "") {
    return await execute(envelope);
  }

  pruneMessageRequestCache();
  const cacheKey = buildMessageRequestCacheKey(envelope, targets, clientRequestId);
  const cached = slotBridgeMessageRequestCache.get(cacheKey);
  if (cached?.result !== undefined) {
    return cached.result;
  }
  if (cached !== undefined) {
    return await cached.promise;
  }

  const idempotentEnvelope: SlotBridgeEnvelope = {
    ...envelope,
    clientRequestId,
    brokerMessageId: buildMessageBrokerMessageId(envelope, targets, clientRequestId),
  };

  const entry: SlotBridgeMessageRequestCacheEntry = {
    brokerMessageId: idempotentEnvelope.brokerMessageId ?? "",
    createdAt: Date.now(),
    promise: Promise.resolve(buildErrorResult(envelope, "SLOT_BRIDGE_FAILED", "Uninitialized")),
  };

  entry.promise = (async (): Promise<SlotBridgeResult> => {
    const result = await execute(idempotentEnvelope);
    entry.result = result;
    return result;
  })().catch((error) => {
    slotBridgeMessageRequestCache.delete(cacheKey);
    throw error;
  });

  slotBridgeMessageRequestCache.set(cacheKey, entry);
  return await entry.promise;
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export const slotBridgeRuntime = {
  getConversationListManager: async (): Promise<SlotBridgeConversationListManagerRef> => {
    await Promise.resolve();
    return ConversationListManager;
  },
  getCoreEngine: async (): Promise<SlotBridgeCoreEngineRef> => {
    const coreEngine = await Promise.resolve(getSlotBridgeCoreEngine());
    return coreEngine;
  },
  getWebviewManager: async (): Promise<SlotBridgeWebviewManagerRef> => {
    const module = await import("../webview-manager.js");
    return module.WebviewManager;
  },
};

async function getConversationListManager(): Promise<SlotBridgeConversationListManagerRef> {
  return await slotBridgeRuntime.getConversationListManager();
}

async function getCoreEngine(): Promise<SlotBridgeCoreEngineRef> {
  return await slotBridgeRuntime.getCoreEngine();
}

async function getWebviewManager(): Promise<SlotBridgeWebviewManagerRef> {
  return await slotBridgeRuntime.getWebviewManager();
}

type UnifiedMessageTarget = "ai0" | "ai1" | "ai2" | "us1";

type ReplyTrafficState = {
  loading: string;
  send: string;
  thinking: string;
};

type ResolvedSendAttachment = {
  name: string;
  path: string;
  mimeType?: string;
};

type SlotBridgeTargetReadyResult =
  | {
      success: true;
    }
  | {
      success: false;
      code: string;
      message: string;
    };

function readMessageTargets(envelope: SlotBridgeEnvelope): UnifiedMessageTarget[] {
  const direct = normalizeMessageTarget(envelope.toSlot);
  const list = (envelope.toSlots ?? [])
    .map((item) => normalizeMessageTarget(item))
    .filter((item): item is UnifiedMessageTarget => item !== null);
  const next = direct !== null ? [direct, ...list] : [...list];
  return next.filter((item, index) => next.indexOf(item) === index);
}

function isAiMessageTarget(target: UnifiedMessageTarget): target is "ai0" | "ai1" | "ai2" {
  return target === "ai0" || target === "ai1" || target === "ai2";
}

function readReplyTrafficState(targetSlot: UnifiedMessageTarget): ReplyTrafficState {
  if (!isAiMessageTarget(targetSlot)) {
    return {
      loading: "idle",
      send: "idle",
      thinking: "idle",
    };
  }

  const state = TrafficManager.getState(targetSlot);
  return {
    loading: state?.status.loading ?? "idle",
    send: state?.status.send ?? "idle",
    thinking: state?.status.thinking ?? "idle",
  };
}

function hasBusyReplyTraffic(targetSlot: UnifiedMessageTarget): boolean {
  const state = readReplyTrafficState(targetSlot);
  return state.loading === "busy" || state.send === "busy" || state.thinking === "busy";
}

type StructuredReplyState = "none" | "partial" | "complete";

function readStructuredReplyBody(text: string): { body: string; structured: boolean } {
  const trimmed = text.trim();
  if (trimmed === "") {
    return { body: "", structured: false };
  }

  const withoutJsonPrefix = trimmed.replace(/^json\b\s*/i, "").trimStart();
  if (withoutJsonPrefix.startsWith("```")) {
    const fencedBodyMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(withoutJsonPrefix);
    if (fencedBodyMatch === null) {
      return { body: withoutJsonPrefix, structured: true };
    }
    const fencedBody = fencedBodyMatch[1] ?? "";
    return { body: fencedBody.trim(), structured: true };
  }

  return {
    body: withoutJsonPrefix,
    structured: withoutJsonPrefix.startsWith("{") || withoutJsonPrefix.startsWith("["),
  };
}

function findStructuredReplyBoundary(text: string): number | null {
  const startChar = text.charAt(0);
  if (startChar !== "{" && startChar !== "[") {
    return null;
  }

  let braceDepth = startChar === "{" ? 1 : 0;
  let bracketDepth = startChar === "[" ? 1 : 0;
  let inString = false;
  let escapeNext = false;

  for (let index = 1; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (inString) {
      if (char === "\\") {
        escapeNext = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      braceDepth += 1;
      continue;
    }

    if (char === "}") {
      braceDepth -= 1;
      if (braceDepth < 0) {
        return null;
      }
    } else if (char === "[") {
      bracketDepth += 1;
    } else if (char === "]") {
      bracketDepth -= 1;
      if (bracketDepth < 0) {
        return null;
      }
    }

    if (braceDepth === 0 && bracketDepth === 0) {
      return index + 1;
    }
  }

  return null;
}

function readStructuredReplyState(text: string): StructuredReplyState {
  const { body, structured } = readStructuredReplyBody(text);
  if (!structured) {
    return "none";
  }

  const normalized = body.trim();
  if (normalized === "") {
    return "partial";
  }

  try {
    JSON.parse(normalized);
    return "complete";
  } catch {
    const boundary = findStructuredReplyBoundary(normalized);
    return boundary === null ? "partial" : "complete";
  }
}

function isSameReplySnapshot(left: SlotBridgeReply | null, right: SlotBridgeReply | null): boolean {
  if (left === null || right === null) {
    return false;
  }

  if (left.messageId !== right.messageId) {
    return false;
  }

  if ((left.text ?? "").trim() !== (right.text ?? "").trim()) {
    return false;
  }

  const leftAttachments = left.attachments ?? [];
  const rightAttachments = right.attachments ?? [];
  if (leftAttachments.length !== rightAttachments.length) {
    return false;
  }

  return leftAttachments.every((attachment, index) => {
    const other = rightAttachments[index];
    if (other === undefined) {
      return false;
    }
    return (
      attachment.name === other.name &&
      attachment.path === other.path &&
      attachment.archivePath === other.archivePath
    );
  });
}

function getElectronApi():
  | {
      us1SendMessage?: (params: Record<string, unknown>) => Promise<unknown>;
      us1SyncMessages?: (params?: Record<string, unknown>) => Promise<unknown>;
      dbGetMessages?: (query: Record<string, unknown>) => Promise<unknown>;
      dbGetAttachments?: (query: Record<string, unknown>) => Promise<unknown>;
    }
  | undefined {
  return window.electronAPI;
}

async function ensureConnected(
  slot: "ai0" | "ai1" | "ai2",
  envelope: SlotBridgeEnvelope,
  options: { waitForReady?: boolean } = {}
): Promise<SlotBridgeTargetReadyResult> {
  if (AppState.isAssigned(slot) !== true) {
    return {
      success: false,
      code: "TARGET_UNASSIGNED",
      message: `${slot.toUpperCase()} has no assigned account`,
    };
  }

  const slotState = SlotController.getState(slot);
  if (slotState?.state === SlotState.CONNECTING) {
    if (options.waitForReady === true) {
      return await waitForAiSlotReady(slot);
    }
    return { success: true };
  }

  if (AppState.isConnected(slot) === true) {
    if (options.waitForReady === true) {
      return await waitForAiSlotReady(slot);
    }
    return { success: true };
  }

  if (envelope.connectPolicy === "ensure") {
    if (slot === "ai0") {
      const assistantResult = await ensureAssistantConnected(envelope);
      if (assistantResult.success !== true) {
        return assistantResult;
      }
      if (options.waitForReady === true) {
        return await waitForAiSlotReady(slot);
      }
      return { success: true };
    }

    const coreEngine = await getCoreEngine();
    const result = await coreEngine.setConnection(slot, true, { force: envelope.force === true });
    if (result.success !== true) {
      return {
        success: false,
        code: "CONNECT_FAILED",
        message: result.message ?? `${slot.toUpperCase()} could not connect`,
      };
    }
    if (options.waitForReady === true) {
      return await waitForAiSlotReady(slot);
    }
    return { success: true };
  }

  if (envelope.connectPolicy === "require-ready") {
    return {
      success: false,
      code: "TARGET_NOT_READY",
      message: `${slot.toUpperCase()} is not ready`,
    };
  }

  return {
    success: false,
    code: "TARGET_UNREACHABLE",
    message: `${slot.toUpperCase()} is offline`,
  };
}

function isAssistantToolsReadyForSlot(slot: "ai0" | "ai1" | "ai2"): boolean {
  if (slot !== "ai0") {
    return true;
  }

  return (
    AppState.getProviderIdForSlot("ai0") !== "opencode-ui" ||
    AppState.isAssistantToolsReady() === true
  );
}

function isAiSlotReady(slot: "ai0" | "ai1" | "ai2"): boolean {
  const state = SlotController.getState(slot);
  if (state === null) {
    return false;
  }

  if (
    AppState.isConnected(slot) !== true ||
    state.state !== SlotState.CONNECTED ||
    state.urlExcluded === true ||
    state.domReady !== true ||
    isAssistantToolsReadyForSlot(slot) !== true
  ) {
    return false;
  }

  const trafficState = TrafficManager.getState(slot);
  if (trafficState === null) {
    return false;
  }

  return (
    trafficState.lastHref !== "" &&
    trafficState.readyState === "ready" &&
    trafficState.status.loading !== "busy"
  );
}

function resolveAssistantResumeEnabled(settings: AppSettings | null): boolean {
  return settings?.assistants?.resumeLastSession !== false;
}

function resolveAssistantResumeSessionId(providerId: string, settings: AppSettings | null): string {
  if (!resolveAssistantResumeEnabled(settings)) {
    return "";
  }

  if (providerId === "opencode-ui") {
    return typeof settings?.assistants?.lastOpencodeUiSessionId === "string"
      ? settings.assistants.lastOpencodeUiSessionId
      : "";
  }

  return "";
}

function resolveAssistantConnectUrl(baseUrl: string, providerId: string): string {
  const settings = SettingsManager.getSnapshot() as AppSettings | null;

  if (providerId === "opencode-ui" && baseUrl !== "") {
    try {
      const isPackagedFileRoute = window.location.protocol === "file:" && baseUrl.startsWith("/");
      const parsed = new URL(
        isPackagedFileRoute ? `.${baseUrl}` : baseUrl,
        isPackagedFileRoute ? new URL(".", window.location.href) : window.location.origin
      );
      parsed.searchParams.set(
        "resumeMode",
        resolveAssistantResumeEnabled(settings) ? "last" : "new"
      );
      const resumeSessionId = resolveAssistantResumeSessionId(providerId, settings);
      if (resumeSessionId !== "") {
        parsed.searchParams.set("resumeSessionId", resumeSessionId);
      }

      const dbPath = resolveOpencodeUiDbPath(settings);
      if (dbPath !== "") {
        parsed.searchParams.set("dbPath", dbPath);
      }

      const themeManager =
        window.__ThemeManager !== null && typeof window.__ThemeManager === "object"
          ? (window.__ThemeManager as { current?: unknown })
          : null;
      const currentTheme =
        typeof themeManager?.current === "string" && themeManager.current.trim() !== ""
          ? themeManager.current.trim()
          : "";
      if (currentTheme !== "") {
        parsed.searchParams.set("theme", currentTheme);
      }

      if (isPackagedFileRoute) {
        return parsed.toString();
      }

      return baseUrl.startsWith("/")
        ? `${parsed.pathname}${parsed.search}${parsed.hash}`
        : parsed.toString();
    } catch {
      return baseUrl;
    }
  }

  return baseUrl;
}

async function ensureAssistantConnected(
  envelope: SlotBridgeEnvelope
): Promise<SlotBridgeTargetReadyResult> {
  const providerId = AppState.getProviderIdForSlot("ai0");
  if (typeof providerId !== "string" || providerId.trim() === "") {
    return {
      success: false,
      code: "TARGET_UNASSIGNED",
      message: "AI0 has no assigned provider",
    };
  }

  const adapter = AssistantProviderRegistry.getAdapter(providerId);
  if (adapter === null) {
    return {
      success: false,
      code: "CONNECT_FAILED",
      message: `AI0 adapter is unavailable for ${providerId}`,
    };
  }

  AppState.setAssistantToolsReady(providerId !== "opencode-ui");

  const serverResult = await adapter.startServer("auto");
  if (
    serverResult.success !== true ||
    typeof serverResult.url !== "string" ||
    serverResult.url === ""
  ) {
    AppState.setAssistantToolsReady(true);
    return {
      success: false,
      code: "CONNECT_FAILED",
      message: serverResult.error ?? `AI0 could not start the ${adapter.name} server`,
    };
  }

  const serverReady =
    serverResult.alreadyRunning === true
      ? true
      : await adapter.waitForReady(serverResult.url, 90_000);
  if (serverReady !== true) {
    AppState.setAssistantToolsReady(true);
    try {
      await adapter.stopServer();
    } catch {}
    return {
      success: false,
      code: "CONNECT_FAILED",
      message: `AI0 did not finish starting ${adapter.name}`,
    };
  }

  const connectResult = await SlotController.connect("ai0", {
    force: envelope.force === true,
    url: resolveAssistantConnectUrl(serverResult.url, providerId),
  });
  if (connectResult.success !== true) {
    AppState.setAssistantToolsReady(true);
    return {
      success: false,
      code: "CONNECT_FAILED",
      message: connectResult.message,
    };
  }

  try {
    await SettingsManager.set("assistants.lastConnected", providerId);
  } catch {}

  return { success: true };
}

async function waitForAiSlotReady(
  slot: "ai0" | "ai1" | "ai2",
  timeoutMs = SLOT_BRIDGE_READY_WAIT_TIMEOUT_MS
): Promise<SlotBridgeTargetReadyResult> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (isAiSlotReady(slot)) {
      return { success: true };
    }
    // NOTE: readiness polling must stay sequential to preserve timeout semantics.
    // eslint-disable-next-line no-await-in-loop
    await sleep(SLOT_BRIDGE_READY_POLL_INTERVAL_MS);
  }

  return {
    success: false,
    code: "TARGET_NOT_READY",
    message: `${slot.toUpperCase()} did not finish loading`,
  };
}

async function setUs1ConnectionState(connected: boolean): Promise<boolean> {
  return await SettingsManager.patch((settings) => {
    const currentUs1Slot =
      settings["us1Slot"] !== null &&
      typeof settings["us1Slot"] === "object" &&
      Array.isArray(settings["us1Slot"]) === false
        ? (settings["us1Slot"] as Record<string, unknown>)
        : {};
    const communicationSystem =
      currentUs1Slot["communicationSystem"] === "relay-e2ee" ? "relay-e2ee" : "mail";
    const nextState = connected ? "connected" : "disconnected";
    settings["us1Slot"] = {
      ...currentUs1Slot,
      connectionState: nextState,
      relayConnectionState: communicationSystem === "relay-e2ee" ? nextState : "disconnected",
      ...(currentUs1Slot["rememberConnectionStatus"] === true
        ? { lastConnectionState: nextState }
        : {}),
    };
  });
}

async function ensureUs1Target(envelope: SlotBridgeEnvelope): Promise<SlotBridgeTargetReadyResult> {
  if (AppState.hasUs1Identity() !== true) {
    return {
      success: false,
      code: "TARGET_UNASSIGNED",
      message: "US1 has no assigned identity",
    };
  }

  if (AppState.isUs1Connected() === true) {
    return { success: true };
  }

  if (envelope.connectPolicy === "ensure") {
    const patched = await setUs1ConnectionState(true);
    if (patched !== true) {
      return {
        success: false,
        code: "CONNECT_FAILED",
        message: "US1 could not connect",
      };
    }
    return { success: true };
  }

  if (envelope.connectPolicy === "require-ready") {
    return {
      success: false,
      code: "TARGET_NOT_READY",
      message: "US1 is not ready",
    };
  }

  return {
    success: false,
    code: "TARGET_UNREACHABLE",
    message: "US1 is offline",
  };
}

async function ensureMessageTarget(
  target: UnifiedMessageTarget,
  envelope: SlotBridgeEnvelope
): Promise<SlotBridgeTargetReadyResult> {
  if (target === "us1") {
    return await ensureUs1Target(envelope);
  }

  return await ensureConnected(target, envelope, { waitForReady: true });
}

interface NormalizedReplyMessage {
  id: string;
  role: string;
  text: string;
  author?: string;
  brokerMessageId?: string;
  clientRequestId?: string;
  eventSeq?: number | null;
}

function normalizeReplyMessage(value: unknown): NormalizedReplyMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value["id"] === "string" ? value["id"].trim() : "";
  const role = typeof value["role"] === "string" ? value["role"].trim() : "";
  if (id === "" || role === "") {
    return null;
  }

  const textCandidates = [value["text"], value["content"]];
  const text = textCandidates
    .find((candidate): candidate is string => typeof candidate === "string")
    ?.trim();
  const author = typeof value["author"] === "string" ? value["author"].trim() : "";
  const brokerMessageId =
    typeof value["brokerMessageId"] === "string"
      ? value["brokerMessageId"].trim()
      : typeof value["broker_message_id"] === "string"
        ? value["broker_message_id"].trim()
        : "";
  const clientRequestId =
    typeof value["clientRequestId"] === "string"
      ? value["clientRequestId"].trim()
      : typeof value["client_request_id"] === "string"
        ? value["client_request_id"].trim()
        : "";
  const eventSeq =
    typeof value["eventSeq"] === "number" && Number.isFinite(value["eventSeq"])
      ? Math.trunc(value["eventSeq"])
      : typeof value["event_seq"] === "number" && Number.isFinite(value["event_seq"])
        ? Math.trunc(value["event_seq"])
        : null;

  return {
    id,
    role,
    text: text ?? "",
    ...(author !== "" ? { author } : {}),
    ...(brokerMessageId !== "" ? { brokerMessageId } : {}),
    ...(clientRequestId !== "" ? { clientRequestId } : {}),
    ...(eventSeq !== null ? { eventSeq } : {}),
  };
}

async function listConversationMessages(
  slot: UnifiedMessageTarget,
  conversationId: string | null,
  options: {
    afterSeq?: number | null;
  } = {}
): Promise<NormalizedReplyMessage[]> {
  const accountId = AppState.getArchiveAccountIdForProvider(slot);
  if (accountId === null || conversationId === null || conversationId === "") {
    return [];
  }

  const electronApi = getElectronApi();
  if (electronApi === undefined) {
    return [];
  }

  const dbGetMessages = electronApi.dbGetMessages;
  if (typeof dbGetMessages !== "function") {
    return [];
  }

  const afterSeq =
    typeof options.afterSeq === "number" && Number.isFinite(options.afterSeq)
      ? Math.trunc(options.afterSeq)
      : undefined;
  const raw = await dbGetMessages(
    afterSeq !== undefined
      ? {
          accountId,
          conversationId,
          afterSeq,
        }
      : {
          accountId,
          conversationId,
        }
  );
  const rows = isRecord(raw) && Array.isArray(raw["data"]) ? raw["data"] : [];
  return rows.flatMap((row) => {
    const normalized = normalizeReplyMessage(row);
    return normalized !== null ? [normalized] : [];
  });
}

function normalizeReplyAttachment(value: unknown): SlotBridgeAttachmentDescriptor | null {
  if (!isRecord(value)) {
    return null;
  }

  const messageId =
    typeof value["messageId"] === "string"
      ? value["messageId"].trim()
      : typeof value["message_id"] === "string"
        ? value["message_id"].trim()
        : "";
  if (messageId === "") {
    return null;
  }

  const originalName =
    typeof value["originalName"] === "string"
      ? value["originalName"].trim()
      : typeof value["original_name"] === "string"
        ? value["original_name"].trim()
        : "";
  if (originalName === "") {
    return null;
  }

  const storedPath =
    typeof value["storedPath"] === "string"
      ? value["storedPath"].trim()
      : typeof value["stored_path"] === "string"
        ? value["stored_path"].trim()
        : "";
  const mimeType =
    typeof value["mimeType"] === "string"
      ? value["mimeType"].trim()
      : typeof value["mime_type"] === "string"
        ? value["mime_type"].trim()
        : "";
  const storedName =
    typeof value["storedName"] === "string"
      ? value["storedName"].trim()
      : typeof value["stored_name"] === "string"
        ? value["stored_name"].trim()
        : "";
  const size =
    typeof value["size"] === "number" && Number.isFinite(value["size"]) ? value["size"] : undefined;

  return {
    name: originalName,
    kind: mimeType.startsWith("image/") ? "generated-image" : "archive-attachment",
    messageId,
    ...(storedPath !== "" ? { archivePath: storedPath, path: storedPath } : {}),
    ...(mimeType !== "" ? { mimeType } : {}),
    ...(storedName !== "" ? { id: storedName } : {}),
    ...(size !== undefined ? { size } : {}),
  };
}

async function listConversationAttachments(
  slot: UnifiedMessageTarget,
  conversationId: string | null
): Promise<SlotBridgeAttachmentDescriptor[]> {
  const accountId = AppState.getArchiveAccountIdForProvider(slot);
  if (accountId === null || conversationId === null || conversationId === "") {
    return [];
  }

  const raw = await getElectronApi()?.["dbGetAttachments"]?.({
    accountId,
    conversationId,
  });
  const rows = Array.isArray((raw as { data?: unknown[] } | undefined)?.data)
    ? ((raw as { data?: unknown[] }).data ?? [])
    : [];
  return rows.flatMap((row) => {
    const normalized = normalizeReplyAttachment(row);
    return normalized !== null ? [normalized] : [];
  });
}

function normalizeLiveReplyAttachment(
  value: unknown,
  messageId: string
): SlotBridgeAttachmentDescriptor | null {
  if (!isRecord(value)) {
    return null;
  }

  const mimeType = typeof value["mimeType"] === "string" ? value["mimeType"].trim() : "";
  const originalName =
    typeof value["originalName"] === "string"
      ? value["originalName"].trim()
      : typeof value["name"] === "string"
        ? value["name"].trim()
        : "";
  const archivePath =
    typeof value["archivePath"] === "string"
      ? value["archivePath"].trim()
      : typeof value["path"] === "string"
        ? value["path"].trim()
        : "";
  const size =
    typeof value["size"] === "number" && Number.isFinite(value["size"]) ? value["size"] : undefined;
  const fallbackMessageId = messageId !== "" ? messageId : "reply";
  const name = originalName !== "" ? originalName : `generated-image-${fallbackMessageId}.png`;

  return {
    name,
    kind: "generated-image",
    messageId,
    ...(archivePath !== "" ? { archivePath, path: archivePath } : {}),
    ...(mimeType !== "" ? { mimeType } : {}),
    ...(size !== undefined ? { size } : {}),
  };
}

function readLatestSyncedReply(
  slot: UnifiedMessageTarget,
  syncResult: Record<string, unknown> | null,
  conversationId: string | null
): SlotBridgeReply | null {
  const rawMessages = syncResult?.["messages"];
  const messages: unknown[] = Array.isArray(rawMessages) ? rawMessages : [];
  const latestAssistant = [...messages].reverse().find((message: unknown) => {
    if (!isRecord(message)) {
      return false;
    }

    const role = typeof message["role"] === "string" ? message["role"].trim() : "";
    const text =
      [message["text"], message["content"]]
        .find((candidate): candidate is string => typeof candidate === "string")
        ?.trim() ?? "";
    const generatedImages = Array.isArray(message["generatedImages"])
      ? message["generatedImages"]
      : [];
    return role === "assistant" && (text !== "" || generatedImages.length > 0);
  });

  if (!isRecord(latestAssistant)) {
    return null;
  }

  const text =
    [latestAssistant["text"], latestAssistant["content"]]
      .find((candidate): candidate is string => typeof candidate === "string")
      ?.trim() ?? "";
  const messageId =
    [latestAssistant["id"], latestAssistant["messageId"], latestAssistant["domId"]]
      .find((candidate): candidate is string => typeof candidate === "string")
      ?.trim() ?? "";
  const attachments = (
    Array.isArray(latestAssistant["generatedImages"]) ? latestAssistant["generatedImages"] : []
  ).flatMap((asset) => {
    const normalized = normalizeLiveReplyAttachment(asset, messageId);
    return normalized !== null ? [normalized] : [];
  });

  return {
    text,
    slot,
    provider: AppState.getProviderIdForSlot(slot) ?? slot,
    conversationId,
    ...(messageId !== "" ? { messageId } : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
  };
}

async function readLatestArchivedReply(
  slot: UnifiedMessageTarget,
  conversationId: string | null,
  request: Pick<SlotBridgeEnvelope, "reqId" | "clientRequestId" | "brokerMessageId"> = {},
  afterSeq?: number | null
): Promise<SlotBridgeReply | null> {
  const messages = await listConversationMessages(
    slot,
    conversationId,
    afterSeq !== undefined ? { afterSeq } : {}
  );
  const brokerMessageId =
    typeof request.brokerMessageId === "string" ? request.brokerMessageId.trim() : "";
  const clientRequestId =
    typeof request.clientRequestId === "string" ? request.clientRequestId.trim() : "";
  const marker = buildRequestMarker(request.reqId);
  const requestIndex =
    brokerMessageId !== "" || clientRequestId !== "" || marker !== ""
      ? [...messages]
          .map((message, index) => {
            if (message.role !== "user") {
              return -1;
            }
            if (brokerMessageId !== "" && message.brokerMessageId === brokerMessageId) {
              return index;
            }
            if (clientRequestId !== "" && message.clientRequestId === clientRequestId) {
              return index;
            }
            if (marker !== "" && message.text.includes(marker)) {
              return index;
            }
            return -1;
          })
          .reduce(
            (latestIndex, currentIndex) =>
              currentIndex > latestIndex ? currentIndex : latestIndex,
            -1
          )
      : -1;
  const candidateMessages = requestIndex >= 0 ? messages.slice(requestIndex + 1) : messages;
  const latestAssistant = [...candidateMessages]
    .reverse()
    .find((message) => message.role === "assistant");
  if (latestAssistant === undefined) {
    return null;
  }

  const allAttachments = await listConversationAttachments(slot, conversationId);
  const attachments = allAttachments.filter(
    (attachment) => attachment.messageId === latestAssistant.id
  );

  return {
    text: latestAssistant.text,
    slot,
    provider: AppState.getProviderIdForSlot(slot) ?? slot,
    conversationId,
    messageId: latestAssistant.id,
    ...(latestAssistant.brokerMessageId !== undefined
      ? { brokerMessageId: latestAssistant.brokerMessageId }
      : {}),
    ...(latestAssistant.clientRequestId !== undefined
      ? { clientRequestId: latestAssistant.clientRequestId }
      : {}),
    ...(latestAssistant.eventSeq !== undefined ? { eventSeq: latestAssistant.eventSeq } : {}),
    attachments,
  };
}

async function syncReplyTarget(
  target: UnifiedMessageTarget,
  envelope: SlotBridgeEnvelope,
  conversationId: string | null
): Promise<{
  conversationId: string | null;
  generatedImagePendingCount: number;
  latestReply: SlotBridgeReply | null;
}> {
  if (target === "us1") {
    const electronApi = getElectronApi();
    const localSessionId =
      envelope.sessionRef?.id?.trim() ??
      envelope.sessionRef?.conversationId?.trim() ??
      conversationId ??
      null;
    const syncResult = await electronApi?.us1SyncMessages?.({
      localSessionId,
    });
    const record = isRecord(syncResult) ? syncResult : {};
    return {
      conversationId:
        typeof record["conversationId"] === "string" && record["conversationId"] !== ""
          ? record["conversationId"]
          : conversationId,
      generatedImagePendingCount: 0,
      latestReply: null,
    };
  }

  const webviewManager = await getWebviewManager();
  const syncResultRaw = await webviewManager.syncProvider(target, { from: "manual" });
  const syncResult = isRecord(syncResultRaw) ? syncResultRaw : null;
  const nextConversationId =
    syncResult !== null &&
    typeof syncResult["conversationId"] === "string" &&
    syncResult["conversationId"] !== ""
      ? syncResult["conversationId"]
      : conversationId;
  return {
    conversationId: nextConversationId,
    generatedImagePendingCount:
      syncResult !== null && typeof syncResult["generatedImagePendingCount"] === "number"
        ? Math.max(0, Math.trunc(syncResult["generatedImagePendingCount"]))
        : 0,
    latestReply: readLatestSyncedReply(target, syncResult, nextConversationId),
  };
}

async function waitForReply(
  envelope: SlotBridgeEnvelope,
  targetSlot: UnifiedMessageTarget,
  previousReply: SlotBridgeReply | null
): Promise<SlotBridgeResult> {
  const busyReplyStableFallbackMs = 5000;
  const idlePartialReplyStallMs = 6000;
  const deadline = Date.now() + readTimeoutMs(envelope.timeoutMs);
  const pollReply = async (
    conversationId: string | null,
    stableCandidate: SlotBridgeReply | null,
    stablePollCount: number,
    stableSinceMs: number | null
  ): Promise<SlotBridgeResult> => {
    if (Date.now() > deadline) {
      return buildErrorResult(envelope, "TARGET_TIMEOUT", "Timed out while waiting for reply");
    }

    const syncResult = await syncReplyTarget(targetSlot, envelope, conversationId);
    const nextConversationId = syncResult.conversationId;
    const reply =
      syncResult.latestReply ??
      (await readLatestArchivedReply(
        targetSlot,
        nextConversationId,
        envelope,
        previousReply?.eventSeq ?? null
      ));
    const replyChanged =
      reply !== null &&
      (previousReply?.messageId === undefined || previousReply.messageId !== reply.messageId);
    const pendingGeneratedImages = syncResult.generatedImagePendingCount;
    const hasReadableReply =
      reply !== null && ((reply.text ?? "").trim() !== "" || (reply.attachments?.length ?? 0) > 0);
    const replyStable = hasReadableReply && isSameReplySnapshot(stableCandidate, reply);
    const nextStableSinceMs =
      replyChanged && hasReadableReply && pendingGeneratedImages === 0
        ? replyStable
          ? (stableSinceMs ?? Date.now())
          : Date.now()
        : null;
    const replyTrafficBusy = hasBusyReplyTraffic(targetSlot);
    const structuredReplyState = hasReadableReply
      ? readStructuredReplyState(reply.text ?? "")
      : "none";
    const nextStablePollCount =
      replyChanged && hasReadableReply && pendingGeneratedImages === 0
        ? replyStable
          ? stablePollCount + 1
          : 1
        : 0;
    const stableDurationMs =
      nextStableSinceMs !== null ? Math.max(0, Date.now() - nextStableSinceMs) : 0;
    const requiredStableDurationMs = replyTrafficBusy === true ? busyReplyStableFallbackMs : 0;
    const replySettled =
      structuredReplyState !== "partial" &&
      nextStablePollCount >= 2 &&
      stableDurationMs >= requiredStableDurationMs;

    if (replyChanged && hasReadableReply && pendingGeneratedImages === 0 && replySettled) {
      return buildResult(envelope, {
        reply,
        session: {
          ...(envelope.sessionRef ?? {}),
          ...(nextConversationId !== null ? { conversationId: nextConversationId } : {}),
        },
        artifacts: reply.attachments ?? [],
      });
    }

    if (
      replyChanged &&
      hasReadableReply &&
      pendingGeneratedImages === 0 &&
      replyTrafficBusy !== true &&
      structuredReplyState === "partial" &&
      nextStablePollCount >= 2 &&
      stableDurationMs >= idlePartialReplyStallMs
    ) {
      return buildResult(envelope, {
        success: false,
        code: "PARTIAL_REPLY_STALLED",
        message: "Reply stopped before completing.",
        reply,
        session: {
          ...(envelope.sessionRef ?? {}),
          ...(nextConversationId !== null ? { conversationId: nextConversationId } : {}),
        },
        artifacts: reply.attachments ?? [],
        data: {
          partialReply: true,
        },
      });
    }

    const nextStableCandidate =
      replyChanged && hasReadableReply && pendingGeneratedImages === 0 ? reply : stableCandidate;

    await sleep(pendingGeneratedImages > 0 ? 900 : 500);
    return await pollReply(
      nextConversationId,
      nextStableCandidate,
      nextStablePollCount,
      nextStableSinceMs
    );
  };

  return await pollReply(envelope.sessionRef?.conversationId ?? null, null, 0, null);
}

function collectReplyForwardAttachments(
  reply: SlotBridgeReply | null
): Array<{ name: string; path: string }> {
  const seen = new Set<string>();
  return (reply?.attachments ?? []).flatMap((attachment) => {
    const path =
      typeof attachment.path === "string" && attachment.path !== ""
        ? attachment.path
        : typeof attachment.archivePath === "string" && attachment.archivePath !== ""
          ? attachment.archivePath
          : "";
    if (path === "") {
      return [];
    }

    const key = `${attachment.name}::${path}`;
    if (seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [{ name: attachment.name, path }];
  });
}

function buildReplyForwardText(reply: SlotBridgeReply, targetSlot: UnifiedMessageTarget): string {
  const text = typeof reply.text === "string" ? reply.text.trim() : "";
  const senderTag = `<!-- hev-sender:${targetSlot} -->`;
  return text !== "" ? `${text}\n${senderTag}` : senderTag;
}

async function maybeForwardReplyToOrigin(
  envelope: SlotBridgeEnvelope,
  targetSlot: UnifiedMessageTarget,
  reply: SlotBridgeReply | null
): Promise<{ success: boolean; forwarded: boolean; message?: string }> {
  const replyToSlot = normalizeSlotId(envelope.replyToSlot);
  if (replyToSlot === null || replyToSlot === targetSlot || reply === null) {
    return { success: true, forwarded: false };
  }

  const ready = await ensureConnected(replyToSlot, envelope, { waitForReady: true });
  if (ready.success !== true) {
    return {
      success: false,
      forwarded: false,
      message: ready.message,
    };
  }

  const text = buildReplyForwardText(reply, targetSlot);
  const attachments = collectReplyForwardAttachments(reply);
  const coreEngine = await getCoreEngine();
  const sendResult =
    attachments.length > 0
      ? await coreEngine.sendBatchInternal({
          targets: [replyToSlot],
          text,
          page: `slot-bridge:reply:${targetSlot}`,
          attachments,
        })
      : await coreEngine.sendMessageInternal({
          provider: replyToSlot,
          text,
          page: `slot-bridge:reply:${targetSlot}`,
        });

  return sendResult.success === true
    ? { success: true, forwarded: true }
    : {
        success: false,
        forwarded: false,
        message:
          sendResult.message ?? `Reply could not be forwarded to ${replyToSlot.toUpperCase()}`,
      };
}

async function resolveArchiveAttachmentReference(
  descriptor: SlotBridgeAttachmentDescriptor
): Promise<string | null> {
  const ref = descriptor.ref?.trim() ?? "";
  if (ref === "") {
    return null;
  }

  if (ref.startsWith("archive:") !== true) {
    return null;
  }

  const parts = ref.split(":");
  if (parts.length < 5) {
    return null;
  }

  const sourceSlot = normalizeSlotId(parts[1]);
  const conversationId = parts[2]?.trim() ?? "";
  const messageId = parts[3]?.trim() ?? "";
  const originalName = parts.slice(4).join(":").trim();
  if (sourceSlot === null || conversationId === "" || messageId === "" || originalName === "") {
    return null;
  }

  const accountId = AppState.getArchiveAccountIdForProvider(sourceSlot);
  if (accountId === null) {
    return null;
  }

  const attachments = await listConversationAttachments(sourceSlot, conversationId);
  const match = attachments.find(
    (attachment) =>
      attachment.messageId === messageId &&
      attachment.name === originalName &&
      typeof attachment.path === "string" &&
      attachment.path !== ""
  );
  return typeof match?.path === "string" ? match.path : null;
}

async function resolveSendAttachmentPaths(
  envelope: SlotBridgeEnvelope
): Promise<ResolvedSendAttachment[]> {
  const fromSlot = envelope.fromSlot;
  const internalFilesystemAllowed =
    fromSlot === "room-ui" || fromSlot === "system" || fromSlot === "user";
  const attachments = Array.isArray(envelope.attachments) ? envelope.attachments : [];
  return await Promise.all(
    attachments.map(async (attachment) => {
      if (
        typeof attachment.path === "string" &&
        attachment.path !== "" &&
        internalFilesystemAllowed
      ) {
        return {
          name: attachment.name,
          path: attachment.path,
          ...(typeof attachment.mimeType === "string" && attachment.mimeType !== ""
            ? { mimeType: attachment.mimeType }
            : {}),
        };
      }

      const archivePath = await resolveArchiveAttachmentReference(attachment);
      if (archivePath !== null && archivePath !== "") {
        return {
          name: attachment.name,
          path: archivePath,
          ...(typeof attachment.mimeType === "string" && attachment.mimeType !== ""
            ? { mimeType: attachment.mimeType }
            : {}),
        };
      }

      throw new Error(`Attachment reference required for ${attachment.name}`);
    })
  );
}

async function sendUs1Message(
  envelope: SlotBridgeEnvelope,
  text: string,
  attachments: ResolvedSendAttachment[]
): Promise<SlotBridgeResult> {
  const electronApi = getElectronApi();
  const send = electronApi?.us1SendMessage;
  if (typeof send !== "function") {
    return buildErrorResult(envelope, "TARGET_UNREACHABLE", "US1 transport is unavailable");
  }

  const actionPayload = isRecord(envelope.payload) ? envelope.payload : {};
  const remoteUserId = readActionRemoteUserId(envelope);

  const resultRaw = await send({
    ...(typeof envelope.clientRequestId === "string" && envelope.clientRequestId !== ""
      ? { clientRequestId: envelope.clientRequestId }
      : {}),
    ...(typeof envelope.brokerMessageId === "string" && envelope.brokerMessageId !== ""
      ? { brokerMessageId: envelope.brokerMessageId }
      : {}),
    text,
    ...(remoteUserId !== null ? { remoteUserId } : {}),
    localSessionId: envelope.sessionRef?.id?.trim() ?? null,
    attachments: attachments.map((attachment) => ({
      path: attachment.path,
      name: attachment.name,
      ...(attachment.mimeType !== undefined ? { mimeType: attachment.mimeType } : {}),
    })),
    ...(isRecord(actionPayload["roomEvent"]) ? { roomEvent: actionPayload["roomEvent"] } : {}),
    ...(isRecord(actionPayload["roomCommand"])
      ? { roomCommand: actionPayload["roomCommand"] }
      : {}),
  });
  const result = isRecord(resultRaw) ? resultRaw : {};
  if (result["success"] !== true) {
    const errorMessage =
      typeof result["error"] === "string" ? result["error"] : "US1 message could not be sent";
    if (remoteUserId !== null && /requested us1 remote user/i.test(errorMessage)) {
      return buildErrorResult(envelope, "TARGET_SELECTION_FAILED", errorMessage);
    }
    return buildErrorResult(envelope, "SEND_FAILED", errorMessage);
  }

  const session = {
    ...(envelope.sessionRef ?? {}),
    ...(typeof result["localSessionId"] === "string" && result["localSessionId"] !== ""
      ? { id: result["localSessionId"] }
      : {}),
    ...(typeof result["conversationId"] === "string" && result["conversationId"] !== ""
      ? { conversationId: result["conversationId"] }
      : {}),
  };

  return buildResult(envelope, {
    session,
    data: {
      ...(remoteUserId !== null ? { remoteUserId } : {}),
      ...(typeof result["remoteUserId"] === "string" && result["remoteUserId"] !== ""
        ? { remoteUserId: result["remoteUserId"] }
        : {}),
      ...(typeof result["transportMessageId"] === "string" && result["transportMessageId"] !== ""
        ? { transportMessageId: result["transportMessageId"] }
        : {}),
      ...(typeof result["archiveMessageId"] === "string" && result["archiveMessageId"] !== ""
        ? { archiveMessageId: result["archiveMessageId"] }
        : {}),
      ...(typeof result["brokerMessageId"] === "string" && result["brokerMessageId"] !== ""
        ? { brokerMessageId: result["brokerMessageId"] }
        : {}),
    },
  });
}

async function sendAiTargets(
  envelope: SlotBridgeEnvelope,
  targets: Array<"ai0" | "ai1" | "ai2">,
  text: string,
  attachments: ResolvedSendAttachment[],
  page: string
): Promise<SlotBridgeResult> {
  const coreEngine = await getCoreEngine();
  const archiveFolders = readArchiveFolders(envelope);
  const waitForCompletion = envelope.wait === true || envelope.action === "message.sendWait";
  const sendResult =
    attachments.length > 0 || targets.length > 1 || archiveFolders !== undefined
      ? await coreEngine.sendBatchInternal({
          ...(typeof envelope.clientRequestId === "string" && envelope.clientRequestId !== ""
            ? { clientRequestId: envelope.clientRequestId }
            : {}),
          ...(typeof envelope.brokerMessageId === "string" && envelope.brokerMessageId !== ""
            ? { brokerMessageId: envelope.brokerMessageId }
            : {}),
          targets,
          text,
          page,
          waitForCompletion,
          ...(archiveFolders !== undefined ? { archiveFolders } : {}),
          attachments: attachments.map((attachment) => ({
            name: attachment.name,
            path: attachment.path,
          })),
        })
      : await coreEngine.sendMessageInternal({
          ...(typeof envelope.clientRequestId === "string" && envelope.clientRequestId !== ""
            ? { clientRequestId: envelope.clientRequestId }
            : {}),
          ...(typeof envelope.brokerMessageId === "string" && envelope.brokerMessageId !== ""
            ? { brokerMessageId: envelope.brokerMessageId }
            : {}),
          text,
          page,
          waitForCompletion,
          ...(targets[0] !== undefined ? { provider: targets[0] } : {}),
        });

  return sendResult.success === true
    ? buildResult(envelope, {
        session: envelope.sessionRef ?? null,
      })
    : buildErrorResult(envelope, "SEND_FAILED", sendResult.message ?? "Message could not be sent");
}

async function runMessageAction(
  envelope: SlotBridgeEnvelope,
  payload: CommandPayload
): Promise<SlotBridgeResult> {
  const targets = readMessageTargets(envelope);
  if (targets.length === 0) {
    return buildErrorResult(envelope, "TARGET_REQUIRED", "Target slot is required");
  }

  if ((envelope.wait === true || envelope.action === "message.sendWait") && targets.length !== 1) {
    return buildErrorResult(
      envelope,
      "WAIT_SINGLE_TARGET_REQUIRED",
      "message.sendWait requires exactly one target"
    );
  }

  return await runMessageActionIdempotent(
    envelope,
    targets,
    async (activeEnvelope): Promise<SlotBridgeResult> => {
      const readyResults = await Promise.all(
        targets.map(async (target) => ({
          target,
          ready: await ensureMessageTarget(target, activeEnvelope),
        }))
      );
      for (const { ready } of readyResults) {
        if (ready.success !== true) {
          return buildErrorResult(activeEnvelope, ready.code, ready.message);
        }
      }

      let previousReply: SlotBridgeReply | null = null;
      const primaryTarget = targets[0] ?? null;
      if (activeEnvelope.wait === true || activeEnvelope.action === "message.sendWait") {
        if (primaryTarget !== null) {
          const baselineSync = await syncReplyTarget(
            primaryTarget,
            activeEnvelope,
            activeEnvelope.sessionRef?.conversationId ?? activeEnvelope.sessionRef?.id ?? null
          );
          previousReply =
            baselineSync.latestReply ??
            (await readLatestArchivedReply(
              primaryTarget,
              baselineSync.conversationId,
              activeEnvelope
            ));
        }
      }

      const text = appendRequestMarker(
        await composeActionText(activeEnvelope, payload),
        activeEnvelope
      );
      const page = readActionPage(activeEnvelope, payload);
      let attachments: ResolvedSendAttachment[] = [];
      if (Array.isArray(activeEnvelope.attachments) && activeEnvelope.attachments.length > 0) {
        try {
          attachments = await resolveSendAttachmentPaths(activeEnvelope);
        } catch (error) {
          return buildErrorResult(
            activeEnvelope,
            "ATTACHMENT_REFERENCE_REQUIRED",
            getErrorMessage(error),
            error
          );
        }
      }

      if (text === "" && attachments.length === 0) {
        return buildErrorResult(
          activeEnvelope,
          "MESSAGE_REQUIRED",
          "Text is required for this action"
        );
      }

      const aiTargets = targets.filter(
        (target): target is "ai0" | "ai1" | "ai2" => target !== "us1"
      );
      const us1Targets = targets.filter((target): target is "us1" => target === "us1");

      if (aiTargets.length > 0) {
        const aiResult = await sendAiTargets(activeEnvelope, aiTargets, text, attachments, page);
        if (aiResult.success !== true) {
          return aiResult;
        }
      }

      let us1Result: SlotBridgeResult | null = null;
      if (us1Targets.length > 0) {
        if (us1Targets.length > 1 || targets.length > aiTargets.length + 1) {
          return buildErrorResult(
            activeEnvelope,
            "TARGET_UNSUPPORTED",
            "US1 may only be addressed once per unified send action"
          );
        }
        us1Result = await sendUs1Message(activeEnvelope, text, attachments);
        if (us1Result.success !== true) {
          return us1Result;
        }
      }

      if (activeEnvelope.wait === true || activeEnvelope.action === "message.sendWait") {
        if (primaryTarget === null) {
          return buildErrorResult(activeEnvelope, "TARGET_REQUIRED", "Target slot is required");
        }

        const waitResult = await waitForReply(activeEnvelope, primaryTarget, previousReply);
        if (waitResult.success !== true) {
          return waitResult;
        }

        const forwardResult = await maybeForwardReplyToOrigin(
          activeEnvelope,
          primaryTarget,
          waitResult.reply ?? null
        );
        if (forwardResult.success !== true) {
          return buildErrorResult(
            activeEnvelope,
            "REPLY_FORWARD_FAILED",
            forwardResult.message ?? "Reply could not be forwarded"
          );
        }

        const baseData = isRecord(waitResult.data) ? waitResult.data : {};
        return buildResult(activeEnvelope, {
          reply: waitResult.reply ?? null,
          session: waitResult.session ?? activeEnvelope.sessionRef ?? null,
          artifacts: waitResult.artifacts ?? [],
          data: {
            ...baseData,
            replyForwarded: forwardResult.forwarded,
            replyForwardSlot: forwardResult.forwarded ? (activeEnvelope.replyToSlot ?? null) : null,
          },
        });
      }

      return (
        us1Result ?? buildResult(activeEnvelope, { session: activeEnvelope.sessionRef ?? null })
      );
    }
  );
}

async function runConnectionAction(envelope: SlotBridgeEnvelope): Promise<SlotBridgeResult> {
  const targetSlot = normalizeMessageTarget(envelope.toSlot);
  if (targetSlot === null) {
    return buildErrorResult(envelope, "TARGET_REQUIRED", "Target slot is required");
  }

  const readyEnvelope = { ...envelope, connectPolicy: "ensure" as const };
  const ready =
    targetSlot === "us1"
      ? await ensureUs1Target(readyEnvelope)
      : await ensureConnected(targetSlot, readyEnvelope, { waitForReady: true });
  return ready.success === true
    ? buildResult(envelope)
    : buildErrorResult(envelope, ready.code, ready.message);
}

function readSessionSwitchConversationId(
  targetSlot: "ai0" | "ai1" | "ai2" | "us1",
  conversationListManager: SlotBridgeConversationListManagerRef,
  sessionRef: SlotBridgeSessionRef | null | undefined
): string {
  const directConversationId = sessionRef?.conversationId?.trim() ?? "";
  if (directConversationId !== "") {
    return directConversationId;
  }

  const fallbackId = sessionRef?.id?.trim() ?? "";
  if (fallbackId === "") {
    return "";
  }

  if (targetSlot !== "us1") {
    return fallbackId;
  }

  const conversationListState = conversationListManager as unknown as {
    entries?: Array<Record<string, unknown>>;
  };
  const candidateEntries = Array.isArray(conversationListState.entries)
    ? conversationListState.entries
    : [];
  const matchedEntry = candidateEntries.find(
    (entry) =>
      entry["provider"] === "us1" &&
      entry["localSessionId"] === fallbackId &&
      typeof entry["id"] === "string" &&
      entry["id"].trim() !== ""
  );
  return typeof matchedEntry?.["id"] === "string" ? matchedEntry["id"].trim() : "";
}

async function runRoomCommandAction(envelope: SlotBridgeEnvelope): Promise<SlotBridgeResult> {
  const actionPayload = isRecord(envelope.payload) ? envelope.payload : {};
  const commandNameCandidates = [
    actionPayload["commandName"],
    actionPayload["actionId"],
    actionPayload["roomCommand"],
  ];
  const commandName = commandNameCandidates
    .find(
      (candidate): candidate is string => typeof candidate === "string" && candidate.trim() !== ""
    )
    ?.trim();

  if (commandName === undefined) {
    return buildErrorResult(envelope, "ROOM_COMMAND_REQUIRED", "Room command is required");
  }

  const provider = envelope.fromSlot ?? "system";
  const roomPayload = isRecord(actionPayload["roomPayload"])
    ? actionPayload["roomPayload"]
    : Object.entries(actionPayload).reduce<Record<string, unknown>>((acc, [key, value]) => {
        if (
          key === "commandName" ||
          key === "actionId" ||
          key === "roomCommand" ||
          key === "rawArgs" ||
          key === "remoteUserId" ||
          key === "localSessionId" ||
          key === "transportMessageId"
        ) {
          return acc;
        }
        acc[key] = value;
        return acc;
      }, {});
  const rawArgs =
    typeof actionPayload["rawArgs"] === "string"
      ? actionPayload["rawArgs"]
      : JSON.stringify(roomPayload);
  const commandPayload = {
    provider,
    source: provider,
    roomPayload,
    args: rawArgs,
    roomId: actionPayload["roomId"],
    ...(typeof actionPayload["remoteUserId"] === "string" &&
    actionPayload["remoteUserId"].trim() !== ""
      ? { remoteUserId: actionPayload["remoteUserId"].trim() }
      : {}),
    ...(typeof actionPayload["localSessionId"] === "string" &&
    actionPayload["localSessionId"].trim() !== ""
      ? { localSessionId: actionPayload["localSessionId"].trim() }
      : {}),
    ...(typeof actionPayload["transportMessageId"] === "string" &&
    actionPayload["transportMessageId"].trim() !== ""
      ? { transportMessageId: actionPayload["transportMessageId"].trim() }
      : {}),
  };

  const result = await RoomCommandRegistry.run(commandName, commandPayload);
  return isRecord(result)
    ? buildResult(envelope, { data: result })
    : buildResult(envelope, { data: { result } });
}

async function runAi0SessionOpen(envelope: SlotBridgeEnvelope): Promise<SlotBridgeResult> {
  const webviewManager = await getWebviewManager();
  const webview = webviewManager.resolveWebview("ai0");
  if (webview === null) {
    return buildErrorResult(envelope, "TARGET_UNREACHABLE", "Assistant webview is not ready");
  }

  const requestedTitle =
    isRecord(envelope.payload) && typeof envelope.payload["title"] === "string"
      ? envelope.payload["title"]
      : "New session";

  const script = `
    (async function () {
      if (typeof window.OpencodeUiHostBridge?.openSession === "function") {
        return await window.OpencodeUiHostBridge.openSession(${JSON.stringify(requestedTitle)});
      }
      const createSession = window.APIClient?.createSession;
      if (typeof createSession !== "function") {
        return { success: false, error: "session.create unsupported" };
      }
      const title = ${JSON.stringify(requestedTitle)};
      const result = await createSession(title);
      const sessionId =
        typeof result?.sessionId === "string" && result.sessionId.trim() !== ""
          ? result.sessionId.trim()
          : "";
      if (sessionId === "") {
        return { success: false, error: "session id unavailable" };
      }
      if (typeof window.SessionStore?.setActiveSession === "function") {
        window.SessionStore.setActiveSession(sessionId);
      }
      if (typeof window.SessionStore?.setCurrentSession === "function") {
        window.SessionStore.setCurrentSession(sessionId);
      }
      window.electronAPI?.sendToHost?.("opencode-ui-session-changed", { sessionId });
      return { success: true, sessionId };
    })();
  `;

  const rawResult = await webview.executeJavaScript(script);
  const result = isRecord(rawResult) ? rawResult : {};
  if (result["success"] !== true) {
    return buildErrorResult(
      envelope,
      "SESSION_OPEN_FAILED",
      typeof result["error"] === "string" ? result["error"] : "Session could not be opened"
    );
  }

  const sessionId = typeof result["sessionId"] === "string" ? result["sessionId"].trim() : "";
  return buildResult(envelope, {
    session: {
      ...(envelope.sessionRef ?? {}),
      ...(sessionId !== "" ? { id: sessionId } : {}),
    },
  });
}

async function runAi0SessionSwitch(envelope: SlotBridgeEnvelope): Promise<SlotBridgeResult> {
  const sessionId =
    envelope.sessionRef?.id?.trim() ?? envelope.sessionRef?.conversationId?.trim() ?? "";
  if (sessionId === "") {
    return buildErrorResult(envelope, "SESSION_ID_REQUIRED", "Session id is required");
  }

  const webviewManager = await getWebviewManager();
  const webview = webviewManager.resolveWebview("ai0");
  if (webview === null) {
    return buildErrorResult(envelope, "TARGET_UNREACHABLE", "Assistant webview is not ready");
  }

  const script = `
    (async function () {
      const sessionId = ${JSON.stringify(sessionId)};
      if (typeof window.OpencodeUiHostBridge?.switchSession === "function") {
        return await window.OpencodeUiHostBridge.switchSession(sessionId);
      }
      if (typeof window.SessionStore?.setActiveSession === "function") {
        window.SessionStore.setActiveSession(sessionId);
      } else if (typeof window.SessionStore?.setCurrentSession === "function") {
        window.SessionStore.setCurrentSession(sessionId);
      } else {
        return { success: false, error: "session.switch unsupported" };
      }
      window.electronAPI?.sendToHost?.("opencode-ui-session-changed", { sessionId });
      return { success: true, sessionId };
    })();
  `;

  const rawResult = await webview.executeJavaScript(script);
  const result = isRecord(rawResult) ? rawResult : {};
  if (result["success"] !== true) {
    return buildErrorResult(
      envelope,
      "SESSION_SWITCH_FAILED",
      typeof result["error"] === "string" ? result["error"] : "Session could not be selected"
    );
  }

  return buildResult(envelope, {
    session: {
      ...(envelope.sessionRef ?? {}),
      id: sessionId,
    },
  });
}

async function runAiSessionSyncAction(
  envelope: SlotBridgeEnvelope,
  targetSlot: "ai0" | "ai1" | "ai2"
): Promise<SlotBridgeResult> {
  const ready = await ensureConnected(targetSlot, envelope, { waitForReady: true });
  if (ready.success !== true) {
    return buildErrorResult(envelope, ready.code, ready.message);
  }

  const actionPayload = isRecord(envelope.payload) ? envelope.payload : {};
  const includeMessages = actionPayload["includeMessages"] === true;
  const webviewManager = await getWebviewManager();
  const syncResultRaw = await webviewManager.syncProvider(targetSlot, { from: "manual" });
  const syncResult = isRecord(syncResultRaw) ? syncResultRaw : {};
  if (syncResult["success"] === false) {
    return buildErrorResult(
      envelope,
      "SESSION_SYNC_FAILED",
      typeof syncResult["message"] === "string"
        ? syncResult["message"]
        : typeof syncResult["error"] === "string"
          ? syncResult["error"]
          : `${targetSlot.toUpperCase()} messages could not be synced`
    );
  }

  const conversationId =
    typeof syncResult["conversationId"] === "string" && syncResult["conversationId"] !== ""
      ? syncResult["conversationId"]
      : null;
  const webUrl = typeof syncResult["webUrl"] === "string" ? syncResult["webUrl"] : "";
  const localSessionId =
    readLocalSessionIdFromUrl(webUrl) !== ""
      ? readLocalSessionIdFromUrl(webUrl)
      : (envelope.sessionRef?.id?.trim() ?? "");
  const messages =
    includeMessages === true ? await listConversationMessages(targetSlot, conversationId) : [];

  return buildResult(envelope, {
    session: {
      ...(envelope.sessionRef ?? {}),
      ...(localSessionId !== "" ? { id: localSessionId } : {}),
      ...(conversationId !== null ? { conversationId } : {}),
    },
    data: {
      ...syncResult,
      ...(localSessionId !== "" ? { localSessionId } : {}),
      ...(conversationId !== null ? { conversationId } : {}),
      ...(messages.length > 0 ? { messages } : includeMessages === true ? { messages: [] } : {}),
    },
  });
}

async function runSessionSyncAction(envelope: SlotBridgeEnvelope): Promise<SlotBridgeResult> {
  const targetSlot = normalizeMessageTarget(envelope.toSlot);
  if (targetSlot === null) {
    return buildErrorResult(envelope, "TARGET_REQUIRED", "Target slot is required");
  }

  if (targetSlot !== "us1") {
    return await runAiSessionSyncAction(envelope, targetSlot);
  }

  if (AppState.isUs1Connected() !== true) {
    return buildErrorResult(envelope, "TARGET_UNREACHABLE", "US1 is offline");
  }

  const electronApi = getElectronApi();
  const sync = electronApi?.us1SyncMessages;
  const actionPayload = isRecord(envelope.payload) ? envelope.payload : {};
  const skipTransportSync = actionPayload["skipTransportSync"] === true;
  const includeMessages = actionPayload["includeMessages"] === true;
  if (skipTransportSync !== true && typeof sync !== "function") {
    return buildErrorResult(envelope, "TARGET_UNREACHABLE", "US1 sync transport is unavailable");
  }
  const runSync = sync;

  let syncResult: Record<string, unknown> = {};
  if (skipTransportSync !== true && typeof runSync === "function") {
    const resultRaw = await runSync({
      localSessionId:
        envelope.sessionRef?.id?.trim() ?? envelope.sessionRef?.conversationId?.trim() ?? null,
      ...(actionPayload["consumeRoomCommands"] === true ? { consumeRoomCommands: true } : {}),
    });
    syncResult = isRecord(resultRaw) ? resultRaw : {};
    if (syncResult["success"] !== true) {
      return buildErrorResult(
        envelope,
        "SESSION_SYNC_FAILED",
        typeof syncResult["error"] === "string"
          ? syncResult["error"]
          : "US1 messages could not be synced"
      );
    }
  }

  const session = {
    ...(envelope.sessionRef ?? {}),
    ...(typeof syncResult["localSessionId"] === "string" && syncResult["localSessionId"] !== ""
      ? { id: syncResult["localSessionId"] }
      : {}),
    ...(typeof syncResult["conversationId"] === "string" && syncResult["conversationId"] !== ""
      ? { conversationId: syncResult["conversationId"] }
      : {}),
  };
  const conversationId =
    typeof session.conversationId === "string" && session.conversationId !== ""
      ? session.conversationId
      : null;
  const messages =
    includeMessages === true ? await listConversationMessages("us1", conversationId) : [];

  return buildResult(envelope, {
    session,
    data: {
      ...(typeof syncResult["localSessionId"] === "string" && syncResult["localSessionId"] !== ""
        ? { localSessionId: syncResult["localSessionId"] }
        : {}),
      ...(typeof syncResult["conversationId"] === "string" && syncResult["conversationId"] !== ""
        ? { conversationId: syncResult["conversationId"] }
        : {}),
      ...(typeof syncResult["fetchedCount"] === "number"
        ? { fetchedCount: syncResult["fetchedCount"] }
        : {}),
      ...(typeof syncResult["processedCount"] === "number"
        ? { processedCount: syncResult["processedCount"] }
        : {}),
      ...(typeof syncResult["duplicateCount"] === "number"
        ? { duplicateCount: syncResult["duplicateCount"] }
        : {}),
      ...(typeof syncResult["projectedCount"] === "number"
        ? { projectedCount: syncResult["projectedCount"] }
        : {}),
      ...(typeof syncResult["skippedCount"] === "number"
        ? { skippedCount: syncResult["skippedCount"] }
        : {}),
      ...(typeof syncResult["unresolvedSessionCount"] === "number"
        ? { unresolvedSessionCount: syncResult["unresolvedSessionCount"] }
        : {}),
      ...(Array.isArray(syncResult["sessionEvents"])
        ? { sessionEvents: syncResult["sessionEvents"] }
        : {}),
      ...(Array.isArray(syncResult["roomPackages"])
        ? { roomPackages: syncResult["roomPackages"] }
        : {}),
      ...(Array.isArray(syncResult["roomEvents"]) ? { roomEvents: syncResult["roomEvents"] } : {}),
      ...(Array.isArray(syncResult["roomCommands"])
        ? { roomCommands: syncResult["roomCommands"] }
        : {}),
      ...(Array.isArray(syncResult["roomInviteInbox"])
        ? { roomInviteInbox: syncResult["roomInviteInbox"] }
        : {}),
      ...(messages.length > 0 ? { messages } : includeMessages === true ? { messages: [] } : {}),
      ...(skipTransportSync === true ? { skippedTransportSync: true } : {}),
      ...(skipTransportSync === true
        ? {
            fetchedCount: 0,
            processedCount: 0,
            duplicateCount: 0,
            projectedCount: 0,
            skippedCount: 0,
          }
        : {}),
    },
  });
}

async function runSessionAction(envelope: SlotBridgeEnvelope): Promise<SlotBridgeResult> {
  if (envelope.action === "session.sync") {
    return await runSessionSyncAction(envelope);
  }

  const sessionAction = envelope.action === "session.open" ? "session.open" : "session.switch";
  const targetSlot = normalizeSessionTarget(sessionAction, envelope.toSlot);
  if (targetSlot === null) {
    return buildErrorResult(envelope, "TARGET_REQUIRED", "Target slot is required");
  }

  const ready =
    targetSlot === "us1"
      ? await ensureUs1Target(envelope)
      : await ensureConnected(targetSlot, envelope, { waitForReady: true });
  if (ready.success !== true) {
    return buildErrorResult(envelope, ready.code, ready.message);
  }

  if (targetSlot === "ai0") {
    return envelope.action === "session.open"
      ? await runAi0SessionOpen(envelope)
      : await runAi0SessionSwitch(envelope);
  }

  if (sessionAction === "session.open") {
    if (targetSlot === "us1") {
      return buildErrorResult(envelope, "TARGET_REQUIRED", "Target slot is required");
    }
    if (isLocalSessionSlot(targetSlot)) {
      const provider = getSlotProviderConfig(targetSlot);
      const localSession =
        provider !== null
          ? buildLocalSessionUrl(
              targetSlot,
              readRequestedLocalSessionId(envelope.sessionRef, provider.providerId)
            )
          : null;
      if (localSession === null) {
        return buildErrorResult(
          envelope,
          "SESSION_OPEN_FAILED",
          `${targetSlot.toUpperCase()} local session URL could not be built`
        );
      }

      SlotController.navigate(targetSlot, localSession.url);
      return buildResult(envelope, {
        session: {
          ...(envelope.sessionRef ?? {}),
          id: localSession.sessionId,
          conversationId: null,
        },
      });
    }
    SlotController.navigate(targetSlot, null);
    return buildResult(envelope, {
      session: {
        ...(envelope.sessionRef ?? {}),
        conversationId: null,
      },
    });
  }

  if (targetSlot !== "us1" && isLocalSessionSlot(targetSlot)) {
    const sessionId = envelope.sessionRef?.id?.trim() ?? "";
    if (sessionId !== "") {
      const localSession = buildLocalSessionUrl(targetSlot, sessionId);
      if (localSession === null) {
        return buildErrorResult(
          envelope,
          "SESSION_SWITCH_FAILED",
          `${targetSlot.toUpperCase()} local session URL could not be built`
        );
      }

      SlotController.navigate(targetSlot, localSession.url);
      return buildResult(envelope, {
        session: {
          ...(envelope.sessionRef ?? {}),
          id: localSession.sessionId,
        },
      });
    }
  }

  const conversationListManager = await getConversationListManager();
  await conversationListManager.refresh({
    silent: true,
    provider: targetSlot,
  });
  const conversationId = readSessionSwitchConversationId(
    targetSlot,
    conversationListManager,
    envelope.sessionRef
  );
  if (conversationId === "") {
    return buildErrorResult(envelope, "CONVERSATION_ID_REQUIRED", "Conversation id is required");
  }
  const updated = conversationListManager.updateSelection(conversationId, {
    provider: targetSlot,
    silent: false,
  });

  return updated
    ? buildResult(envelope, {
        session: {
          ...(envelope.sessionRef ?? {}),
          conversationId,
        },
      })
    : buildErrorResult(
        envelope,
        "SESSION_SWITCH_FAILED",
        `Conversation ${conversationId} was not found for ${targetSlot.toUpperCase()}`
      );
}

function isProjectMessageAction(envelope: SlotBridgeEnvelope): boolean {
  return envelope.action === "message.send" || envelope.action === "message.sendWait";
}

function isProjectSessionActive(context: SlotBridgeProjectSessionContext): boolean {
  const targetSlot = context.targetSlot;
  const sessionRef = context.binding?.sessionRef ?? null;
  if (targetSlot === null || sessionRef === null) return false;
  const activeConversation = AppState.getState().activeConversations[targetSlot] ?? null;
  if (activeConversation === null || activeConversation === "") return false;
  return [sessionRef.conversationId, sessionRef.id].some(
    (value) =>
      typeof value === "string" && value.trim() !== "" && value.trim() === activeConversation
  );
}

function confirmProjectSessionSwitch(context: SlotBridgeProjectSessionContext): boolean {
  const targetSlot = context.targetSlot ?? context.binding?.slot ?? null;
  const sessionRef = context.binding?.sessionRef ?? null;
  const sessionLabel =
    sessionRef?.conversationId?.trim() ??
    sessionRef?.id?.trim() ??
    context.binding?.webUrl ??
    context.projectRef.projectId;
  const slotLabel = targetSlot === null ? "AI" : targetSlot.toUpperCase();
  return window.confirm(
    `Bu onarım kayıtlı AI oturumuyla devam edecek.\n${slotLabel} üzerinde ${sessionLabel} oturumuna geçilsin mi?`
  );
}

function shouldActivateProjectSessionBeforeAction(
  envelope: SlotBridgeEnvelope,
  context: SlotBridgeProjectSessionContext | null
): boolean {
  return (
    context !== null &&
    isProjectMessageAction(envelope) &&
    context.warning === null &&
    context.targetSlot !== null &&
    (context.binding === null || context.restored === true)
  );
}

async function activateProjectSessionBeforeAction(
  envelope: SlotBridgeEnvelope,
  context: SlotBridgeProjectSessionContext | null
): Promise<SlotBridgeResult | null> {
  if (!shouldActivateProjectSessionBeforeAction(envelope, context) || context === null) {
    return null;
  }

  if (context.binding === null) {
    const openResult = await runSessionAction({
      ...envelope,
      action: "session.open",
      payload: {
        ...(isRecord(envelope.payload) ? envelope.payload : {}),
        title: context.projectRef.title ?? `Repair Room ${context.projectRef.projectId}`,
      },
      sessionRef: null,
      wait: false,
    });
    if (openResult.success === true) {
      envelope.sessionRef = openResult.session ?? null;
      return null;
    }
    return buildErrorResult(
      envelope,
      "PROJECT_SESSION_OPEN_FAILED",
      openResult.message ?? "Project AI session could not be opened",
      openResult.error
    );
  }

  if (isProjectSessionActive(context)) return null;
  if (!confirmProjectSessionSwitch(context)) {
    return buildErrorResult(
      envelope,
      "PROJECT_SESSION_CONFIRMATION_REQUIRED",
      "Kayıtlı AI oturumuna geçiş onaylanmadı."
    );
  }

  const switchResult = await runSessionAction({
    ...envelope,
    action: "session.switch",
    wait: false,
  });
  if (switchResult.success === true) {
    envelope.sessionRef = switchResult.session ?? envelope.sessionRef ?? null;
    return null;
  }

  return buildErrorResult(
    envelope,
    "PROJECT_SESSION_ACTIVATE_FAILED",
    switchResult.message ?? "Project session could not be activated",
    switchResult.error
  );
}

export async function slotBridgeHandler(payload: CommandPayload = {}): Promise<SlotBridgeResult> {
  let envelope = normalizeEnvelope(payload);

  try {
    const preparedProjectSession = prepareSlotBridgeProjectSessionEnvelope(envelope);
    envelope = preparedProjectSession.envelope;
    const projectSessionContext = preparedProjectSession.context;

    let result: SlotBridgeResult;
    if (envelope.retiredAction !== undefined && envelope.retiredAction !== null) {
      result = buildErrorResult(
        envelope,
        "ACTION_RETIRED",
        buildRetiredActionMessage(envelope.retiredAction)
      );
      return await finalizeSlotBridgeProjectSessionResult(envelope, result, projectSessionContext);
    }

    if (shouldReturnProjectSessionWarningOnly(envelope, projectSessionContext)) {
      const warning = projectSessionContext?.warning ?? null;
      result =
        isProjectMessageAction(envelope) && warning !== null
          ? buildErrorResult(envelope, warning.code, warning.message)
          : buildResult(envelope, {
              data: {
                projectSessionSkipped: true,
              },
            });
      return await finalizeSlotBridgeProjectSessionResult(envelope, result, projectSessionContext);
    }

    const activationError = await activateProjectSessionBeforeAction(
      envelope,
      projectSessionContext
    );
    if (activationError !== null) {
      return await finalizeSlotBridgeProjectSessionResult(
        envelope,
        activationError,
        projectSessionContext
      );
    }

    switch (envelope.action) {
      case "message.send":
      case "message.sendWait":
        result = await runMessageAction(envelope, payload);
        break;
      case "connection.ensure":
        result = await runConnectionAction(envelope);
        break;
      case "room.command":
        result = await runRoomCommandAction(envelope);
        break;
      case "session.open":
      case "session.switch":
      case "session.sync":
        result = await runSessionAction(envelope);
        break;
      default:
        result = buildErrorResult(envelope, "ACTION_UNSUPPORTED", "Unsupported action");
        break;
    }
    return await finalizeSlotBridgeProjectSessionResult(envelope, result, projectSessionContext);
  } catch (error) {
    return buildErrorResult(envelope, "SLOT_BRIDGE_FAILED", getErrorMessage(error), error);
  }
}

registerSlotBridgeHandler(slotBridgeHandler);
