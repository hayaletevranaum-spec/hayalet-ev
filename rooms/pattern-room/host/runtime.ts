import type {
  SlotBridgeEnvelope,
  SlotBridgeResult,
} from "../shared/types/pattern-room-slot-bridge.js";

import { createPatternRoomCaseReviewHash } from "../shared/adapters/pattern-room-case-review-hash.js";
import { parsePatternRoomCaseReviewResult } from "../shared/adapters/pattern-room-case-review-parser.js";
import { PATTERN_ROOM_DOMAIN } from "../shared/data/pattern-room-domain.js";
import {
  createPatternRoomCaseReviewRuntimeState,
  isPatternRoomCaseReviewRuntimeState,
  reducePatternRoomCaseReviewRuntimeState,
} from "../shared/state/pattern-room-case-review-state.js";
import { migratePatternRoomSnapshot } from "../shared/state/pattern-room-snapshot-migration.js";
import { parsePatternRoomSessionSnapshot } from "../shared/state/pattern-room-snapshot.js";
import {
  PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND,
  PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND,
  PATTERN_ROOM_CASE_REVIEW_DISPATCH_FAILED_EVENT,
  PATTERN_ROOM_CASE_REVIEW_DISPATCH_PROTOCOL,
  PATTERN_ROOM_CASE_REVIEW_DISPATCHED_EVENT,
  PATTERN_ROOM_CASE_REVIEW_DISPATCH_ACTION,
  PATTERN_ROOM_CASE_REVIEW_DISPATCH_CONNECT_POLICY,
  type PatternRoomCaseReviewControlCommandPayload,
  type PatternRoomCaseReviewDispatchCommandPayload,
  type PatternRoomCaseReviewDispatchDraft,
  type PatternRoomCaseReviewDispatchedEventPayload,
  type PatternRoomCaseReviewDispatchFailedEventPayload,
  type PatternRoomCaseReviewDispatchRoleSlot,
  type PatternRoomCaseReviewTargetSlot,
} from "../shared/types/pattern-room-case-review-dispatch.js";
import {
  PATTERN_ROOM_LOAD_COMMAND,
  PATTERN_ROOM_LOADED_EVENT,
  PATTERN_ROOM_SAVE_COMMAND,
  PATTERN_ROOM_SAVED_EVENT,
  PATTERN_ROOM_SAVE_FAILED_EVENT,
  type PatternRoomLoadedEventPayload,
  type PatternRoomSavedEventPayload,
  type PatternRoomSaveFailedEventPayload,
} from "../shared/types/pattern-room-persistence.js";
import type {
  PatternRoomSnapshotMeta,
  PatternRoomStorageAdapter,
} from "../shared/types/pattern-room-storage.js";
import { getPatternRoomCaseReviewRoleProfile } from "../shared/types/pattern-room-case-review-role.js";
import {
  PATTERN_ROOM_CASE_REVIEW_EVENT,
  type PatternRoomCaseReviewEvent,
  type PatternRoomCaseReviewEventPayload,
  type PatternRoomCaseReviewReply,
  type PatternRoomCaseReviewRuntimeState,
  type PatternRoomCaseReviewSession,
} from "../shared/types/pattern-room-case-review-session.js";
import type { PatternRoomSessionSnapshot } from "../shared/types/pattern-room-snapshot.js";

const PATTERN_ROOM_ID = "pattern-room";
const STORAGE_PATH_STATE_KEYS = ["storageDir", "runtimePaths", "paths"] as const;
const DEFAULT_FAILURE_MESSAGE = "Pattern Room persistence failed.";
const DEFAULT_DISPATCH_FAILURE_MESSAGE = "Pattern Room case review dispatch failed.";
const PATTERN_ROOM_CASE_REVIEW_RUNTIME_STATE_KEY = "pattern-room:case-review-runtime";
const MAX_COMPLETED_CASE_REVIEW_REQUESTS = 256;
const SNAPSHOT_FILE_SUFFIX = ".snapshot.json";
const SAFE_TOPIC_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const CASE_REVIEW_TARGET_SLOT_BY_ROLE: Readonly<
  Record<PatternRoomCaseReviewDispatchRoleSlot, PatternRoomCaseReviewTargetSlot>
> = {
  AI0: "ai0",
  AI1: "ai1",
  AI2: "ai2",
  US1: "us1",
};

type PatternRoomCommandExposure = "public" | "internal";

type PatternRoomCommandScope = "room-ui" | "ai-slots" | "assistant" | "us1" | "system";

type PatternRoomCommandResult =
  | { ignored?: true; success: true }
  | {
      code?: string;
      error: string;
      success: false;
    };

type PatternRoomCommandHandler = (payload?: unknown) => Promise<PatternRoomCommandResult>;

type PatternRoomElectronApi = {
  fmWriteFileAtomic?: (payload: {
    data: string;
    encoding?: string;
    path: string;
  }) => Promise<Record<string, unknown>>;
  readDirectoryFiles?: (
    dirPath: string
  ) => Promise<Array<{ isDirectory?: unknown; name?: unknown; path?: unknown }>>;
  readFile?: (path: string) => Promise<string | null>;
  roomToolsCall?: (
    request:
      | {
          operation: "resolve-paths";
          roomId: string;
        }
      | {
          operation: "delete-path";
          recursive?: boolean;
          roomId: string;
          targetPath: string;
        }
  ) => Promise<Record<string, unknown>>;
};

export type PatternRoomHostApi = {
  dispatchBridge?: (payload: Record<string, unknown>) => Promise<unknown>;
  getState?: (key: string) => unknown;
  setState?: (key: string, value: unknown) => void;
  log?: (level: string, message: string) => void;
  notifyRoom?: (type: string, payload?: Record<string, unknown>) => void;
  registerCommand?: (
    commandName: string,
    handler: PatternRoomCommandHandler,
    options?: {
      description?: string;
      exposure?: PatternRoomCommandExposure;
      scope?: PatternRoomCommandScope;
    }
  ) => void;
};

export type PatternRoomHostActivation = {
  commands: Record<
    | typeof PATTERN_ROOM_SAVE_COMMAND
    | typeof PATTERN_ROOM_LOAD_COMMAND
    | typeof PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND
    | typeof PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND,
    PatternRoomCommandHandler
  >;
  dispose: () => Promise<void>;
  onRoomEvent: (event: unknown) => void;
  onRoomReady: () => Promise<void>;
};

export type PatternRoomHostRuntime = {
  activate: (api: PatternRoomHostApi) => PatternRoomHostActivation;
};

export type PatternRoomStorageFactoryContext = {
  api: PatternRoomHostApi;
  storageDir: string;
};

export type PatternRoomHostRuntimeOptions = {
  createStorageAdapter?: (
    context: PatternRoomStorageFactoryContext
  ) => PatternRoomStorageAdapter | Promise<PatternRoomStorageAdapter>;
  storageAdapter?: PatternRoomStorageAdapter;
  storageDir?: string;
  now?: () => string;
  parseCaseReviewResult?: typeof parsePatternRoomCaseReviewResult;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && Array.isArray(value) === false;
}

function isCaseReviewRoleSlot(value: unknown): value is PatternRoomCaseReviewDispatchRoleSlot {
  return value === "AI0" || value === "AI1" || value === "AI2" || value === "US1";
}

function isCaseReviewTargetSlot(value: unknown): value is PatternRoomCaseReviewTargetSlot {
  return value === "ai0" || value === "ai1" || value === "ai2" || value === "us1";
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function readStorageDir(value: unknown): string | null {
  const directValue = asNonEmptyString(value);
  if (directValue !== null) {
    return directValue;
  }

  if (!isRecord(value)) {
    return null;
  }

  return asNonEmptyString(value["storageDir"]) ?? readStorageDir(value["paths"]);
}

function readCommandPayload(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) {
    return {};
  }

  return {
    ...toRecord(payload["roomArgs"]),
    ...toRecord(payload["roomPayload"]),
    ...toRecord(payload["payload"]),
    ...payload,
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function assertSafeTopicId(topicId: string): void {
  if (SAFE_TOPIC_ID_PATTERN.test(topicId) !== true) {
    throw new Error("Unsafe Pattern Room snapshot topicId.");
  }
}

function createSnapshotMeta(snapshot: PatternRoomSessionSnapshot): PatternRoomSnapshotMeta {
  return {
    snapshotId: snapshot.snapshotId,
    topicId: snapshot.topicId,
    schemaVersion: snapshot.schemaVersion,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}

function joinStoragePath(baseDir: string, fileName: string): string {
  const trimmedBaseDir = baseDir.replace(/[\\/]+$/, "");
  const separator = trimmedBaseDir.includes("\\") && !trimmedBaseDir.includes("/") ? "\\" : "/";
  return `${trimmedBaseDir}${separator}${fileName}`;
}

function getSnapshotFileName(topicId: string): string {
  assertSafeTopicId(topicId);
  return `${topicId}${SNAPSHOT_FILE_SUFFIX}`;
}

function decodeBase64Utf8(value: string): string | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function readElectronApi(): PatternRoomElectronApi | null {
  if (typeof window === "undefined") {
    return null;
  }

  const electronApi = window.electronAPI as PatternRoomElectronApi | undefined;
  return typeof electronApi?.roomToolsCall === "function" ? electronApi : null;
}

async function resolveStorageDir(api: PatternRoomHostApi): Promise<string | null> {
  for (const stateKey of STORAGE_PATH_STATE_KEYS) {
    const stateValue = api.getState?.(stateKey);
    const stateStorageDir = readStorageDir(stateValue);
    if (stateStorageDir !== null) {
      return stateStorageDir;
    }
  }

  const electronApi = readElectronApi();
  if (electronApi === null) {
    return null;
  }

  const result = await electronApi.roomToolsCall?.({
    operation: "resolve-paths",
    roomId: PATTERN_ROOM_ID,
  });
  return readStorageDir(result);
}

class PatternRoomElectronStorageAdapter implements PatternRoomStorageAdapter {
  private readonly baseDir: string;
  private readonly electronApi: PatternRoomElectronApi;

  constructor(baseDir: string, electronApi: PatternRoomElectronApi) {
    this.baseDir = baseDir;
    this.electronApi = electronApi;
  }

  async save(snapshot: PatternRoomSessionSnapshot): Promise<void> {
    assertSafeTopicId(snapshot.topicId);
    const parsedSnapshot = migratePatternRoomSnapshot(snapshot);
    if (parsedSnapshot === null) {
      throw new Error("Pattern Room snapshot cannot be persisted.");
    }

    const writeResult = await this.electronApi.fmWriteFileAtomic?.({
      data: `${JSON.stringify(parsedSnapshot, null, 2)}\n`,
      encoding: "utf-8",
      path: this.getSnapshotPath(snapshot.topicId),
    });

    if (writeResult?.["success"] !== true) {
      throw new Error("Pattern Room snapshot write failed.");
    }
  }

  async load(topicId: string): Promise<PatternRoomSessionSnapshot | null> {
    assertSafeTopicId(topicId);
    return await this.readSnapshotFile(this.getSnapshotPath(topicId));
  }

  async list(): Promise<PatternRoomSnapshotMeta[]> {
    const entries = await this.listSnapshotFileEntries();
    const snapshots = await Promise.all(
      entries.map(async (entry) => {
        return await this.readSnapshotFile(entry.path);
      })
    );

    return snapshots
      .filter((snapshot): snapshot is PatternRoomSessionSnapshot => snapshot !== null)
      .map(createSnapshotMeta)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async delete(snapshotId: string): Promise<void> {
    const entries = await this.listSnapshotFileEntries();
    const snapshots = await Promise.all(
      entries.map(async (entry) => {
        return {
          path: entry.path,
          snapshot: await this.readSnapshotFile(entry.path),
        };
      })
    );
    const target = snapshots.find(({ snapshot }) => snapshot?.snapshotId === snapshotId);
    if (target === undefined) {
      return;
    }

    const deleteResult = await this.electronApi.roomToolsCall?.({
      operation: "delete-path",
      recursive: false,
      roomId: PATTERN_ROOM_ID,
      targetPath: target.path,
    });

    if (deleteResult?.["success"] !== true) {
      throw new Error("Pattern Room snapshot delete failed.");
    }
  }

  private getSnapshotPath(topicId: string): string {
    return joinStoragePath(this.baseDir, getSnapshotFileName(topicId));
  }

  private async listSnapshotFileEntries(): Promise<Array<{ name: string; path: string }>> {
    const entries = (await this.electronApi.readDirectoryFiles?.(this.baseDir)) ?? [];
    return entries
      .filter((entry) => entry.isDirectory !== true)
      .map((entry) => {
        return {
          name: asNonEmptyString(entry.name),
          path: asNonEmptyString(entry.path),
        };
      })
      .filter((entry): entry is { name: string; path: string } => {
        return entry.name !== null && entry.path !== null;
      })
      .filter((entry) => entry.name.endsWith(SNAPSHOT_FILE_SUFFIX))
      .filter((entry) =>
        SAFE_TOPIC_ID_PATTERN.test(entry.name.slice(0, -SNAPSHOT_FILE_SUFFIX.length))
      );
  }

  private async readSnapshotFile(filePath: string): Promise<PatternRoomSessionSnapshot | null> {
    const encoded = await this.electronApi.readFile?.(filePath);
    if (typeof encoded !== "string" || encoded.trim() === "") {
      return null;
    }

    const decoded = decodeBase64Utf8(encoded);
    if (decoded === null) {
      return null;
    }

    try {
      return migratePatternRoomSnapshot(JSON.parse(decoded) as unknown);
    } catch {
      return null;
    }
  }
}

function getSafeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : DEFAULT_FAILURE_MESSAGE;
  const normalized = message.trim().replace(/\s+/g, " ").slice(0, 160);
  if (normalized === "" || normalized.includes("/") || normalized.includes("\\")) {
    return DEFAULT_FAILURE_MESSAGE;
  }
  return normalized;
}

function getSafeDispatchErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : DEFAULT_DISPATCH_FAILURE_MESSAGE;
  const normalized = message.trim().replace(/\s+/g, " ").slice(0, 160);
  if (normalized === "" || normalized.includes("/") || normalized.includes("\\")) {
    return DEFAULT_DISPATCH_FAILURE_MESSAGE;
  }
  return normalized;
}

function isSlotBridgeResult(value: unknown): value is SlotBridgeResult {
  return isRecord(value) && typeof value["success"] === "boolean";
}

function readCaseReviewReply(
  result: SlotBridgeResult,
  receivedAt: string
): PatternRoomCaseReviewReply | null {
  if (!isRecord(result.reply) || typeof result.reply["text"] !== "string") {
    return null;
  }

  const text = result.reply["text"].trim();
  if (text === "") {
    return null;
  }

  return {
    brokerMessageId:
      asNonEmptyString(result.reply["brokerMessageId"]) ?? asNonEmptyString(result.brokerMessageId),
    clientRequestId:
      asNonEmptyString(result.reply["clientRequestId"]) ?? asNonEmptyString(result.clientRequestId),
    messageId: asNonEmptyString(result.reply["messageId"]),
    receivedAt,
    responseHash: createPatternRoomCaseReviewHash(text),
    text,
  };
}

function hasValidSlotBridgeCorrelation(
  result: SlotBridgeResult,
  requestId: string,
  reply: PatternRoomCaseReviewReply | null
): boolean {
  return (
    result.clientRequestId === requestId &&
    (result.reqId === undefined || result.reqId === requestId) &&
    (reply === null || reply.clientRequestId === null || reply.clientRequestId === requestId)
  );
}

function getSlotBridgeFailureMessage(result: SlotBridgeResult): string {
  return (
    asNonEmptyString(result.error) ??
    asNonEmptyString(result.message) ??
    DEFAULT_DISPATCH_FAILURE_MESSAGE
  );
}

function createCaseReviewBridgeEnvelope(
  request: PatternRoomCaseReviewDispatchCommandPayload
): SlotBridgeEnvelope & Record<string, unknown> {
  return {
    ...request.draft.payload,
    action: PATTERN_ROOM_CASE_REVIEW_DISPATCH_ACTION,
    clientRequestId: request.requestId,
    replyToSlot: "room-ui",
    reqId: request.requestId,
    wait: true,
  };
}

function isCaseReviewDispatchOperation(
  value: unknown
): value is PatternRoomCaseReviewDispatchCommandPayload["operation"] {
  return value === "start" || value === "retry" || value === "resend";
}

function isCaseReviewApplyMode(
  value: unknown
): value is Extract<PatternRoomCaseReviewControlCommandPayload, { action: "apply" }>["mode"] {
  return (
    value === "all" || value === "open-questions-only" || value === "evidence-suggestions-only"
  );
}

function cloneCaseReviewDispatchDraft(
  draft: PatternRoomCaseReviewDispatchDraft
): PatternRoomCaseReviewDispatchDraft {
  return Object.freeze({
    roleSlot: draft.roleSlot,
    targetSlot: draft.targetSlot,
    packetHash: draft.packetHash,
    payload: Object.freeze({
      ...draft.payload,
      payload: Object.freeze({
        ...draft.payload.payload,
        protocol: Object.freeze({ ...draft.payload.payload.protocol }),
      }),
    }),
    warnings: Object.freeze([...draft.warnings]),
  });
}

function reconstructCaseReviewLastEvent(
  session: PatternRoomCaseReviewSession
): PatternRoomCaseReviewEvent | null {
  const requestId = session.requestId;

  switch (session.lastEvent) {
    case "preview-created":
      return {
        metadata: session.metadata,
        occurredAt: session.startedAt,
        packetHash: session.packetHash,
        reviewLabel: session.reviewLabel,
        role: session.role,
        sessionId: session.sessionId,
        type: "preview-created",
      };
    case "dispatch-started":
      if (requestId === null) {
        return null;
      }
      return {
        attempt: session.attempt,
        occurredAt: session.startedAt,
        operation: session.operation,
        parentSessionId: session.parentSessionId,
        requestId,
        sessionId: session.sessionId,
        type: "dispatch-started",
      };
    case "dispatch-sent":
    case "waiting-reply":
      if (requestId === null) {
        return null;
      }
      return {
        occurredAt: session.startedAt,
        requestId,
        sessionId: session.sessionId,
        type: session.lastEvent,
      };
    case "reply-received":
      if (requestId === null || session.reply === null) {
        return null;
      }
      return {
        occurredAt: session.reply.receivedAt,
        reply: session.reply,
        requestId,
        sessionId: session.sessionId,
        type: "reply-received",
      };
    case "parsed":
    case "review-ready":
      if (requestId === null || session.result === null) {
        return null;
      }
      return {
        occurredAt: session.completedAt ?? session.reply?.receivedAt ?? session.startedAt,
        requestId,
        result: session.result,
        sessionId: session.sessionId,
        type: session.lastEvent,
      };
    case "review-applied": {
      const mode = session.applySummary?.mode ?? session.metadata["applyMode"];
      if (requestId === null || !isCaseReviewApplyMode(mode)) {
        return null;
      }
      return {
        mode,
        occurredAt: session.appliedAt ?? session.completedAt ?? session.startedAt,
        requestId,
        sessionId: session.sessionId,
        ...(session.applySummary === null ? {} : { summary: session.applySummary }),
        type: "review-applied",
      };
    }
    case "dispatch-failed":
    case "timeout":
    case "reply-invalid":
    case "parse-failed":
      if (requestId === null || session.error === null) {
        return null;
      }
      return {
        error: session.error,
        occurredAt: session.failedAt ?? session.startedAt,
        requestId,
        sessionId: session.sessionId,
        type: session.lastEvent,
      };
    case "cancelled":
      return {
        occurredAt: session.cancelledAt ?? session.startedAt,
        reason: session.error?.message ?? null,
        requestId,
        sessionId: session.sessionId,
        type: "cancelled",
      };
    default:
      return null;
  }
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isCaseReviewDispatchDraft(value: unknown): value is PatternRoomCaseReviewDispatchDraft {
  if (
    !isRecord(value) ||
    !isCaseReviewRoleSlot(value["roleSlot"]) ||
    asNonEmptyString(value["packetHash"]) === null
  ) {
    return false;
  }

  const expectedTargetSlot = CASE_REVIEW_TARGET_SLOT_BY_ROLE[value["roleSlot"]];
  if (value["targetSlot"] !== expectedTargetSlot || !Array.isArray(value["warnings"])) {
    return false;
  }

  if (
    value["warnings"].every((warning) => typeof warning === "string") !== true ||
    !isRecord(value["payload"])
  ) {
    return false;
  }

  const bridgePayload = value["payload"];
  if (
    bridgePayload["action"] !== PATTERN_ROOM_CASE_REVIEW_DISPATCH_ACTION ||
    bridgePayload["toSlot"] !== expectedTargetSlot ||
    !isCaseReviewTargetSlot(bridgePayload["toSlot"]) ||
    bridgePayload["connectPolicy"] !== PATTERN_ROOM_CASE_REVIEW_DISPATCH_CONNECT_POLICY ||
    !isPositiveInteger(bridgePayload["timeoutMs"]) ||
    !isRecord(bridgePayload["payload"])
  ) {
    return false;
  }

  const payloadBody = bridgePayload["payload"];
  const protocol = payloadBody["protocol"];
  if (
    asNonEmptyString(payloadBody["text"]) === null ||
    !isRecord(protocol) ||
    Object.hasOwn(protocol, "context") ||
    protocol["room"] !== PATTERN_ROOM_CASE_REVIEW_DISPATCH_PROTOCOL.room ||
    protocol["scenario"] !== PATTERN_ROOM_CASE_REVIEW_DISPATCH_PROTOCOL.scenario ||
    protocol["protocolKey"] !== PATTERN_ROOM_CASE_REVIEW_DISPATCH_PROTOCOL.protocolKey
  ) {
    return false;
  }

  return payloadBody["page"] === undefined || asNonEmptyString(payloadBody["page"]) !== null;
}

function readCaseReviewDispatchRequest(
  payload: unknown
): PatternRoomCaseReviewDispatchCommandPayload | null {
  const value = readCommandPayload(payload);
  const sessionId = asNonEmptyString(value["sessionId"]);
  const requestId = asNonEmptyString(value["requestId"]);
  const operation = value["operation"];
  const draft = value["draft"];
  const attempt = value["attempt"];
  const parentSessionId = value["parentSessionId"];

  if (
    sessionId === null ||
    requestId === null ||
    !isCaseReviewDispatchOperation(operation) ||
    !isCaseReviewDispatchDraft(draft) ||
    (attempt !== undefined && !isPositiveInteger(attempt)) ||
    (parentSessionId !== undefined &&
      parentSessionId !== null &&
      asNonEmptyString(parentSessionId) === null)
  ) {
    return null;
  }

  const normalizedParentSessionId =
    parentSessionId === undefined || parentSessionId === null
      ? null
      : asNonEmptyString(parentSessionId);
  if (
    operation === "resend" &&
    (normalizedParentSessionId === null || normalizedParentSessionId === sessionId)
  ) {
    return null;
  }

  return {
    attempt: attempt ?? 1,
    draft,
    operation,
    parentSessionId: normalizedParentSessionId,
    requestId,
    sessionId,
  };
}

function isCaseReviewApplySummary(
  value: unknown
): value is NonNullable<
  Extract<PatternRoomCaseReviewControlCommandPayload, { action: "apply" }>["summary"]
> {
  if (!isRecord(value) || !isCaseReviewApplyMode(value["mode"])) {
    return false;
  }

  return (
    [
      "boardNotesAdded",
      "evidenceAdded",
      "openQuestionsAdded",
      "uncertaintyAdded",
      "connectionsAdded",
      "skipped",
    ].every((key) => {
      const count = value[key];
      return typeof count === "number" && Number.isInteger(count) && count >= 0;
    }) &&
    Array.isArray(value["warnings"]) &&
    value["warnings"].every((warning) => typeof warning === "string")
  );
}

function readCaseReviewControlRequest(
  payload: unknown
): PatternRoomCaseReviewControlCommandPayload | null {
  const value = readCommandPayload(payload);
  const sessionId = asNonEmptyString(value["sessionId"]);
  const requestId = asNonEmptyString(value["requestId"]);
  if (sessionId === null || requestId === null) {
    return null;
  }

  if (value["action"] === "cancel") {
    return {
      action: "cancel",
      requestId,
      sessionId,
    };
  }

  if (
    value["action"] !== "apply" ||
    !isCaseReviewApplyMode(value["mode"]) ||
    (value["summary"] !== undefined && !isCaseReviewApplySummary(value["summary"]))
  ) {
    return null;
  }

  return {
    action: "apply",
    mode: value["mode"],
    requestId,
    sessionId,
    ...(value["summary"] === undefined ? {} : { summary: value["summary"] }),
  };
}

export default function createPatternRoomHostRuntime(
  options: PatternRoomHostRuntimeOptions = {}
): PatternRoomHostRuntime {
  return {
    activate(api: PatternRoomHostApi): PatternRoomHostActivation {
      let storageAdapter: PatternRoomStorageAdapter | null = options.storageAdapter ?? null;
      let saveQueue: Promise<void> = Promise.resolve();
      let disposed = false;
      const activeRequestByTarget = new Map<PatternRoomCaseReviewTargetSlot, string>();
      const currentRequestBySession = new Map<string, string>();
      const dispatchPromiseByRequest = new Map<string, Promise<PatternRoomCommandResult>>();
      const completedRequests: Array<{
        requestId: string;
        requestKey: string;
        sessionId: string;
      }> = [];
      const storedReviewState = api.getState?.(PATTERN_ROOM_CASE_REVIEW_RUNTIME_STATE_KEY);
      let reviewState: PatternRoomCaseReviewRuntimeState = isPatternRoomCaseReviewRuntimeState(
        storedReviewState
      )
        ? storedReviewState
        : createPatternRoomCaseReviewRuntimeState();
      api.setState?.(PATTERN_ROOM_CASE_REVIEW_RUNTIME_STATE_KEY, reviewState);

      async function getStorageAdapter(): Promise<PatternRoomStorageAdapter> {
        if (storageAdapter !== null) {
          return storageAdapter;
        }

        const storageDir = asNonEmptyString(options.storageDir) ?? (await resolveStorageDir(api));
        if (storageDir === null) {
          throw new Error("Pattern Room storage path is unavailable.");
        }

        storageAdapter =
          (await options.createStorageAdapter?.({ api, storageDir })) ??
          new PatternRoomElectronStorageAdapter(storageDir, readElectronApi() ?? {});
        return storageAdapter;
      }

      function notifyLoaded(snapshot: PatternRoomSessionSnapshot | null): void {
        api.notifyRoom?.(PATTERN_ROOM_LOADED_EVENT, {
          snapshot,
        } satisfies PatternRoomLoadedEventPayload);
      }

      function notifySaved(): void {
        api.notifyRoom?.(PATTERN_ROOM_SAVED_EVENT, {
          success: true,
        } satisfies PatternRoomSavedEventPayload);
      }

      function notifySaveFailed(error: string): void {
        api.notifyRoom?.(PATTERN_ROOM_SAVE_FAILED_EVENT, {
          error,
          success: false,
        } satisfies PatternRoomSaveFailedEventPayload);
      }

      function notifyCaseReviewDispatched(
        request: PatternRoomCaseReviewDispatchCommandPayload
      ): void {
        api.notifyRoom?.(PATTERN_ROOM_CASE_REVIEW_DISPATCHED_EVENT, {
          requestId: request.requestId,
          roleSlot: request.draft.roleSlot,
          sessionId: request.sessionId,
          success: true,
          targetSlot: request.draft.targetSlot,
          warnings: [...request.draft.warnings],
        } satisfies PatternRoomCaseReviewDispatchedEventPayload);
      }

      function notifyCaseReviewDispatchFailed(
        error: string,
        request?: PatternRoomCaseReviewDispatchCommandPayload
      ): void {
        api.notifyRoom?.(PATTERN_ROOM_CASE_REVIEW_DISPATCH_FAILED_EVENT, {
          error,
          ...(request === undefined
            ? {}
            : {
                requestId: request.requestId,
                sessionId: request.sessionId,
              }),
          success: false,
        } satisfies PatternRoomCaseReviewDispatchFailedEventPayload);
      }

      function getCaseReviewTimestamp(): string {
        return asNonEmptyString(options.now?.()) ?? new Date().toISOString();
      }

      function commitCaseReviewEvent(event: PatternRoomCaseReviewEvent): boolean {
        if (disposed) {
          return false;
        }

        const nextState = reducePatternRoomCaseReviewRuntimeState(reviewState, event);
        if (nextState === reviewState) {
          return false;
        }

        reviewState = nextState;
        api.setState?.(PATTERN_ROOM_CASE_REVIEW_RUNTIME_STATE_KEY, reviewState);
        api.notifyRoom?.(PATTERN_ROOM_CASE_REVIEW_EVENT, {
          event,
          state: reviewState,
        } satisfies PatternRoomCaseReviewEventPayload);
        return true;
      }

      function notifyCaseReviewState(): void {
        const activeSession = reviewState.activeSession;
        if (disposed || activeSession === null) {
          return;
        }

        const event = reconstructCaseReviewLastEvent(activeSession);
        if (event === null) {
          return;
        }

        api.notifyRoom?.(PATTERN_ROOM_CASE_REVIEW_EVENT, {
          event,
          state: reviewState,
        } satisfies PatternRoomCaseReviewEventPayload);
      }

      function retainCompletedCaseReviewRequest(
        request: PatternRoomCaseReviewDispatchCommandPayload,
        requestKey: string,
        dispatchPromise: Promise<PatternRoomCommandResult>
      ): void {
        const markCompleted = (): void => {
          if (dispatchPromiseByRequest.get(requestKey) !== dispatchPromise) {
            return;
          }

          completedRequests.push({
            requestId: request.requestId,
            requestKey,
            sessionId: request.sessionId,
          });
          while (completedRequests.length > MAX_COMPLETED_CASE_REVIEW_REQUESTS) {
            const expiredRequest = completedRequests.shift();
            if (expiredRequest !== undefined) {
              dispatchPromiseByRequest.delete(expiredRequest.requestKey);
              if (
                currentRequestBySession.get(expiredRequest.sessionId) === expiredRequest.requestId
              ) {
                currentRequestBySession.delete(expiredRequest.sessionId);
              }
            }
          }
        };

        void dispatchPromise.then(markCompleted, markCompleted);
      }

      function isCurrentCaseReviewRequest(
        request: PatternRoomCaseReviewDispatchCommandPayload,
        requestKey: string
      ): boolean {
        return (
          disposed === false &&
          activeRequestByTarget.get(request.draft.targetSlot) === requestKey &&
          currentRequestBySession.get(request.sessionId) === request.requestId &&
          reviewState.activeSession?.sessionId === request.sessionId &&
          reviewState.activeSession.requestId === request.requestId
        );
      }

      function finishCaseReviewFailure(
        request: PatternRoomCaseReviewDispatchCommandPayload,
        requestKey: string,
        type: Extract<
          PatternRoomCaseReviewEvent,
          {
            type: "dispatch-failed" | "timeout" | "reply-invalid" | "parse-failed";
          }
        >["type"],
        code: string,
        error: string
      ): PatternRoomCommandResult {
        if (!isCurrentCaseReviewRequest(request, requestKey)) {
          return { ignored: true, success: true };
        }

        const safeError = getSafeDispatchErrorMessage(new Error(error));
        const committed = commitCaseReviewEvent({
          error: {
            code,
            message: safeError,
          },
          occurredAt: getCaseReviewTimestamp(),
          requestId: request.requestId,
          sessionId: request.sessionId,
          type,
        });
        if (!committed) {
          return { ignored: true, success: true };
        }

        notifyCaseReviewDispatchFailed(safeError, request);
        return {
          code,
          error: safeError,
          success: false,
        };
      }

      async function enqueueSave(snapshot: PatternRoomSessionSnapshot): Promise<void> {
        const saveAttempt = saveQueue.then(async () => {
          const store = await getStorageAdapter();
          await store.save(snapshot);
        });
        saveQueue = saveAttempt.catch(() => undefined);
        await saveAttempt;
      }

      async function saveSnapshot(payload: unknown): Promise<PatternRoomCommandResult> {
        const commandPayload = readCommandPayload(payload);
        const snapshot = parsePatternRoomSessionSnapshot(commandPayload["snapshot"]);
        if (snapshot === null) {
          const error = "Pattern Room snapshot payload is invalid.";
          notifySaveFailed(error);
          return {
            error,
            success: false,
          };
        }

        try {
          await enqueueSave(snapshot);
          notifySaved();
          return { success: true };
        } catch (error) {
          const message = getSafeErrorMessage(error);
          notifySaveFailed(message);
          return {
            error: message,
            success: false,
          };
        }
      }

      async function loadSnapshot(payload: unknown): Promise<PatternRoomCommandResult> {
        const commandPayload = readCommandPayload(payload);
        const topicId = asNonEmptyString(commandPayload["topicId"]);
        if (topicId === null) {
          notifyLoaded(null);
          return {
            error: "Pattern Room topic id is required.",
            success: false,
          };
        }

        try {
          const store = await getStorageAdapter();
          notifyLoaded(await store.load(topicId));
          return { success: true };
        } catch (error) {
          api.log?.("warn", getSafeErrorMessage(error));
          notifyLoaded(null);
          return {
            error: getSafeErrorMessage(error),
            success: false,
          };
        }
      }

      async function runCaseReviewDispatch(
        request: PatternRoomCaseReviewDispatchCommandPayload,
        requestKey: string
      ): Promise<PatternRoomCommandResult> {
        try {
          if (typeof api.dispatchBridge !== "function") {
            return finishCaseReviewFailure(
              request,
              requestKey,
              "dispatch-failed",
              "BRIDGE_UNAVAILABLE",
              "Pattern Room dispatch bridge is unavailable."
            );
          }

          let pendingResult: Promise<unknown>;
          try {
            pendingResult = api.dispatchBridge(createCaseReviewBridgeEnvelope(request));
          } catch (error) {
            return finishCaseReviewFailure(
              request,
              requestKey,
              "dispatch-failed",
              "DISPATCH_THROWN",
              getSafeDispatchErrorMessage(error)
            );
          }

          if (
            !commitCaseReviewEvent({
              occurredAt: getCaseReviewTimestamp(),
              requestId: request.requestId,
              sessionId: request.sessionId,
              type: "dispatch-sent",
            })
          ) {
            void pendingResult.catch(() => undefined);
            return { ignored: true, success: true };
          }
          notifyCaseReviewDispatched(request);

          if (
            !commitCaseReviewEvent({
              occurredAt: getCaseReviewTimestamp(),
              requestId: request.requestId,
              sessionId: request.sessionId,
              type: "waiting-reply",
            })
          ) {
            void pendingResult.catch(() => undefined);
            return { ignored: true, success: true };
          }

          let bridgeResultValue: unknown;
          try {
            bridgeResultValue = await pendingResult;
          } catch (error) {
            return finishCaseReviewFailure(
              request,
              requestKey,
              "dispatch-failed",
              "DISPATCH_REJECTED",
              getSafeDispatchErrorMessage(error)
            );
          }

          if (!isCurrentCaseReviewRequest(request, requestKey)) {
            return { ignored: true, success: true };
          }

          if (!isSlotBridgeResult(bridgeResultValue)) {
            return finishCaseReviewFailure(
              request,
              requestKey,
              "dispatch-failed",
              "BRIDGE_RESULT_INVALID",
              "Pattern Room dispatch bridge returned an invalid result."
            );
          }

          if (bridgeResultValue.success !== true) {
            const code = asNonEmptyString(bridgeResultValue.code) ?? "DISPATCH_FAILED";
            const failureType =
              code === "TARGET_TIMEOUT"
                ? "timeout"
                : code === "PARTIAL_REPLY_STALLED"
                  ? "reply-invalid"
                  : "dispatch-failed";
            return finishCaseReviewFailure(
              request,
              requestKey,
              failureType,
              code,
              getSlotBridgeFailureMessage(bridgeResultValue)
            );
          }

          const reply = readCaseReviewReply(bridgeResultValue, getCaseReviewTimestamp());
          if (!hasValidSlotBridgeCorrelation(bridgeResultValue, request.requestId, reply)) {
            return finishCaseReviewFailure(
              request,
              requestKey,
              "reply-invalid",
              "REPLY_CORRELATION_INVALID",
              "Pattern Room dispatch bridge correlation is invalid."
            );
          }

          if (reply === null) {
            return finishCaseReviewFailure(
              request,
              requestKey,
              "reply-invalid",
              "REPLY_INVALID",
              "Pattern Room case review reply is blank or invalid."
            );
          }

          if (
            !commitCaseReviewEvent({
              occurredAt: reply.receivedAt,
              reply,
              requestId: request.requestId,
              sessionId: request.sessionId,
              type: "reply-received",
            })
          ) {
            return { ignored: true, success: true };
          }

          let result: ReturnType<typeof parsePatternRoomCaseReviewResult>;
          try {
            result = (options.parseCaseReviewResult ?? parsePatternRoomCaseReviewResult)(
              reply.text
            );
          } catch (error) {
            return finishCaseReviewFailure(
              request,
              requestKey,
              "parse-failed",
              "REPLY_PARSE_FAILED",
              getSafeDispatchErrorMessage(error)
            );
          }

          if (!isCurrentCaseReviewRequest(request, requestKey)) {
            return { ignored: true, success: true };
          }

          if (
            !commitCaseReviewEvent({
              occurredAt: getCaseReviewTimestamp(),
              requestId: request.requestId,
              result,
              sessionId: request.sessionId,
              type: "parsed",
            }) ||
            !commitCaseReviewEvent({
              occurredAt: getCaseReviewTimestamp(),
              requestId: request.requestId,
              result,
              sessionId: request.sessionId,
              type: "review-ready",
            })
          ) {
            return { ignored: true, success: true };
          }

          return { success: true };
        } finally {
          if (activeRequestByTarget.get(request.draft.targetSlot) === requestKey) {
            activeRequestByTarget.delete(request.draft.targetSlot);
          }
        }
      }

      function dispatchCaseReview(payload: unknown): Promise<PatternRoomCommandResult> {
        const request = readCaseReviewDispatchRequest(payload);
        if (request === null) {
          const error = "Pattern Room case review dispatch request is invalid.";
          notifyCaseReviewDispatchFailed(error);
          return Promise.resolve({
            code: "DISPATCH_REQUEST_INVALID",
            error,
            success: false,
          });
        }

        if (disposed) {
          return Promise.resolve({
            code: "HOST_DISPOSED",
            error: "Pattern Room host runtime is disposed.",
            success: false,
          });
        }

        const requestKey = `${request.sessionId}:${request.requestId}`;
        const duplicatePromise = dispatchPromiseByRequest.get(requestKey);
        if (duplicatePromise !== undefined) {
          return duplicatePromise;
        }

        const activeSession = reviewState.activeSession;
        if (
          request.operation === "retry" &&
          (activeSession === null ||
            activeSession.sessionId !== request.sessionId ||
            activeSession.role !== request.draft.roleSlot ||
            activeSession.packetHash !== request.draft.packetHash)
        ) {
          const error = "Pattern Room retry must preserve the review session role and packet.";
          notifyCaseReviewDispatchFailed(error, request);
          return Promise.resolve({
            code: "RETRY_CONTEXT_INVALID",
            error,
            success: false,
          });
        }

        const activeRequestKey = activeRequestByTarget.get(request.draft.targetSlot);
        if (activeRequestKey !== undefined) {
          const error = "Pattern Room case review target already has an active request.";
          notifyCaseReviewDispatchFailed(error, request);
          return Promise.resolve({
            code: "TARGET_BUSY",
            error,
            success: false,
          });
        }

        if (
          (request.operation === "start" || request.operation === "resend") &&
          activeSession !== null &&
          activeSession.sessionId !== request.sessionId &&
          activeSession.requestId !== null &&
          (activeSession.status === "dispatching" || activeSession.status === "waiting-reply")
        ) {
          const supersededRequestId = activeSession.requestId;
          const supersededSessionId = activeSession.sessionId;
          if (
            commitCaseReviewEvent({
              occurredAt: getCaseReviewTimestamp(),
              reason: "Superseded by a newer Pattern Room case review.",
              requestId: supersededRequestId,
              sessionId: supersededSessionId,
              type: "cancelled",
            }) &&
            currentRequestBySession.get(supersededSessionId) === supersededRequestId
          ) {
            currentRequestBySession.delete(supersededSessionId);
          }
        }

        activeRequestByTarget.set(request.draft.targetSlot, requestKey);
        currentRequestBySession.set(request.sessionId, request.requestId);

        if (request.operation === "start" || request.operation === "resend") {
          const roleProfile = getPatternRoomCaseReviewRoleProfile(request.draft.roleSlot);
          commitCaseReviewEvent({
            metadata: {
              attempt: request.attempt ?? 1,
              operation: request.operation,
              parentSessionId: request.parentSessionId ?? null,
              dispatchDraft: cloneCaseReviewDispatchDraft(request.draft),
              targetSlot: request.draft.targetSlot,
              warnings: [...request.draft.warnings],
            },
            occurredAt: getCaseReviewTimestamp(),
            packetHash: request.draft.packetHash,
            reviewLabel: roleProfile.reviewLabel,
            role: request.draft.roleSlot,
            sessionId: request.sessionId,
            type: "preview-created",
          });
        }

        const dispatchStarted = commitCaseReviewEvent({
          attempt: request.attempt ?? 1,
          occurredAt: getCaseReviewTimestamp(),
          operation: request.operation,
          parentSessionId: request.parentSessionId ?? null,
          requestId: request.requestId,
          sessionId: request.sessionId,
          type: "dispatch-started",
        });
        if (!dispatchStarted) {
          activeRequestByTarget.delete(request.draft.targetSlot);
          if (currentRequestBySession.get(request.sessionId) === request.requestId) {
            currentRequestBySession.delete(request.sessionId);
          }
          const error = "Pattern Room case review session transition is invalid.";
          notifyCaseReviewDispatchFailed(error, request);
          return Promise.resolve({
            code: "SESSION_TRANSITION_INVALID",
            error,
            success: false,
          });
        }

        const dispatchPromise = runCaseReviewDispatch(request, requestKey);
        dispatchPromiseByRequest.set(requestKey, dispatchPromise);
        retainCompletedCaseReviewRequest(request, requestKey, dispatchPromise);
        return dispatchPromise;
      }

      function controlCaseReview(payload: unknown): Promise<PatternRoomCommandResult> {
        const request = readCaseReviewControlRequest(payload);
        if (request === null) {
          return Promise.resolve({
            code: "CONTROL_REQUEST_INVALID",
            error: "Pattern Room case review control request is invalid.",
            success: false,
          });
        }

        if (disposed) {
          return Promise.resolve({
            code: "HOST_DISPOSED",
            error: "Pattern Room host runtime is disposed.",
            success: false,
          });
        }

        const activeSession = reviewState.activeSession;
        if (
          activeSession === null ||
          activeSession.sessionId !== request.sessionId ||
          activeSession.requestId !== request.requestId
        ) {
          return Promise.resolve({
            code: "CONTROL_TARGET_INVALID",
            error: "Pattern Room case review control target is not active.",
            success: false,
          });
        }

        if (request.action === "cancel") {
          if (activeSession.status === "cancelled") {
            return Promise.resolve({ ignored: true, success: true });
          }

          const committed = commitCaseReviewEvent({
            occurredAt: getCaseReviewTimestamp(),
            reason: "Cancelled by the Pattern Room user.",
            requestId: request.requestId,
            sessionId: request.sessionId,
            type: "cancelled",
          });
          if (!committed) {
            return Promise.resolve({
              code: "CANCEL_NOT_ALLOWED",
              error: "Pattern Room case review cannot be cancelled in its current state.",
              success: false,
            });
          }

          if (currentRequestBySession.get(request.sessionId) === request.requestId) {
            currentRequestBySession.delete(request.sessionId);
          }
          const requestKey = `${request.sessionId}:${request.requestId}`;
          for (const [targetSlot, activeRequestKey] of activeRequestByTarget) {
            if (activeRequestKey === requestKey) {
              activeRequestByTarget.delete(targetSlot);
            }
          }
          return Promise.resolve({ success: true });
        }

        if (activeSession.status === "applied") {
          return Promise.resolve({ ignored: true, success: true });
        }

        const committed = commitCaseReviewEvent({
          mode: request.mode,
          occurredAt: getCaseReviewTimestamp(),
          requestId: request.requestId,
          sessionId: request.sessionId,
          ...(request.summary === undefined ? {} : { summary: request.summary }),
          type: "review-applied",
        });
        if (!committed) {
          return Promise.resolve({
            code: "APPLY_NOT_ALLOWED",
            error: "Pattern Room case review is not ready to apply.",
            success: false,
          });
        }

        return Promise.resolve({ success: true });
      }

      api.registerCommand?.(PATTERN_ROOM_SAVE_COMMAND, saveSnapshot, {
        description: "Persist the active Pattern Room snapshot from the room UI runtime.",
        exposure: "internal",
        scope: "room-ui",
      });
      api.registerCommand?.(PATTERN_ROOM_LOAD_COMMAND, loadSnapshot, {
        description: "Load a Pattern Room snapshot for the room UI runtime.",
        exposure: "internal",
        scope: "room-ui",
      });
      api.registerCommand?.(PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND, dispatchCaseReview, {
        description: "Dispatch a prepared Pattern Room case review draft from the room UI runtime.",
        exposure: "internal",
        scope: "room-ui",
      });
      api.registerCommand?.(PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND, controlCaseReview, {
        description: "Cancel or apply the active Pattern Room case review session.",
        exposure: "internal",
        scope: "room-ui",
      });

      return {
        commands: {
          [PATTERN_ROOM_SAVE_COMMAND]: saveSnapshot,
          [PATTERN_ROOM_LOAD_COMMAND]: loadSnapshot,
          [PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND]: dispatchCaseReview,
          [PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND]: controlCaseReview,
        },
        async dispose(): Promise<void> {
          disposed = true;
          activeRequestByTarget.clear();
          currentRequestBySession.clear();
          dispatchPromiseByRequest.clear();
          completedRequests.splice(0);
          await saveQueue;
        },
        onRoomEvent(_event: unknown): void {
          return undefined;
        },
        async onRoomReady(): Promise<void> {
          await loadSnapshot({
            topicId: PATTERN_ROOM_DOMAIN.topic.id,
          });
          notifyCaseReviewState();
        },
      };
    },
  };
}
