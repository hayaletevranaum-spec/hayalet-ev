import type {
  RepairAiMarkEvent,
  RepairLivePreviewState,
  RepairMeasurementEvent,
} from "../types/index.js";
import type { RepairUiSnapshotMeta, RepairUiState } from "./state.js";

export interface RepairStateHostMessage {
  type: "repair-state";
  snapshot: RepairUiState;
  meta: RepairUiSnapshotMeta;
}

export interface RepairHostContextMessage {
  type: "host-context";
  locale: string;
  translations: Record<string, unknown>;
}

export interface RepairFeedEventHostMessage {
  type: "repair-feed-event";
  event: RepairAiMarkEvent;
}

export interface RepairMeasurementReadingHostMessage {
  type: "repair-measurement-reading";
  reading: RepairMeasurementEvent;
}

export interface RepairChatReplyHostMessage {
  type: "repair-chat-reply";
  turnId: string;
  text: string;
  occurredAt: string;
  contextRefs: string[];
}

export interface RepairResearchProgressHostMessage {
  type: "repair-research-progress";
  step:
    | "searching-device-info"
    | "finding-schematics"
    | "collecting-board-images"
    | "analyzing-common-failures"
    | "preparing-knowledge-pack"
    | "complete";
  completed: boolean;
}

export interface RepairTranscriptIngressHostMessage {
  type: "transcript-ingress";
  requestId: string;
  text: string;
  source: "pc-mic" | "android-bridge" | "synthetic-test";
  target: string | null;
  isFinal: boolean;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

export interface RepairCaptureFeedStatusHostMessage {
  type: "capture-feed-status";
  requestId: string;
  mode: "camera-feed" | "interactive-mirror";
  ok: boolean;
  preview: RepairLivePreviewState | null;
}

export interface RepairCaptureDictationStatusHostMessage {
  type: "capture-dictation-status";
  requestId: string;
  createdAt: string;
  source: "android-bridge";
  target: string;
  deviceId: string | null;
  status: "started" | "transcribing" | "done" | "failed";
  message: string;
}

export interface RepairCaptureAmbientStatusHostMessage {
  type: "capture-ambient-status";
  requestId: string;
  createdAt: string;
  source: "android-bridge";
  target: string;
  deviceId: string | null;
  status:
    "started" | "wake-detected" | "capturing" | "transcribing" | "done" | "stopped" | "failed";
  message: string;
  transcript: string | null;
  metadata: Record<string, unknown> | null;
}

export interface RepairCaptureMediaIngressHostMessage {
  type: "capture-media-ingress";
  requestId: string;
  createdAt: string;
  source: "android-bridge";
  target: string;
  asset: {
    name: string;
    originalName: string;
    path: string;
    importedAt: number;
  };
  metadata: Record<string, unknown> | null;
}

export interface RepairTtsStatusHostMessage {
  type: "tts-status";
  requestId: string;
  target: string;
  mode: "local" | "android";
  status: "queued" | "preparing" | "playing" | "done" | "stopped" | "failed";
  message: string;
  error: string | null;
  source: "local" | "android-bridge";
}

export interface RepairCommandResultHostMessage {
  type: "command-result";
  command: string;
  result: Record<string, unknown>;
}

export type RepairHostMessage =
  | RepairHostContextMessage
  | RepairStateHostMessage
  | RepairFeedEventHostMessage
  | RepairMeasurementReadingHostMessage
  | RepairChatReplyHostMessage
  | RepairResearchProgressHostMessage
  | RepairTranscriptIngressHostMessage
  | RepairCaptureFeedStatusHostMessage
  | RepairCaptureDictationStatusHostMessage
  | RepairCaptureAmbientStatusHostMessage
  | RepairCaptureMediaIngressHostMessage
  | RepairTtsStatusHostMessage
  | RepairCommandResultHostMessage;

type RepairHostMessageRecord = Record<string, unknown>;

function toRecord(value: unknown): RepairHostMessageRecord {
  return value !== null && typeof value === "object" && Array.isArray(value) === false
    ? (value as RepairHostMessageRecord)
    : {};
}

function unwrapHostPayload(value: unknown): RepairHostMessageRecord {
  const envelope = toRecord(value);
  const payload = toRecord(envelope["payload"]);
  return Object.keys(payload).length > 0 ? payload : envelope;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNullableString(value: unknown): string | null {
  return value === null || typeof value === "string" ? value : null;
}

function hasNullableStringShape(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && Array.isArray(value) === false
    ? (value as Record<string, unknown>)
    : null;
}

function isRepairUiState(value: unknown): value is RepairUiState {
  return value !== null && typeof value === "object" && Array.isArray(value) === false;
}

function isRepairUiSnapshotMeta(value: unknown): value is RepairUiSnapshotMeta {
  const record = toRecord(value);
  return (
    typeof record["schemaVersion"] === "number" &&
    typeof record["generatedAt"] === "string" &&
    Array.isArray(record["events"]) &&
    value !== null &&
    typeof value === "object" &&
    Array.isArray(value) === false
  );
}

export function normalizeRepairHostMessage(value: unknown): RepairHostMessage | null {
  const envelope = toRecord(value);
  const type = typeof envelope["type"] === "string" ? envelope["type"] : "";
  const payload = unwrapHostPayload(value);

  if (type === "host-context") {
    const locale = payload["locale"];
    const translations = payload["translations"];
    if (
      typeof locale === "string" &&
      locale.trim() !== "" &&
      typeof translations === "object" &&
      translations !== null &&
      Array.isArray(translations) === false
    ) {
      return { type, locale: locale.trim(), translations: translations as Record<string, unknown> };
    }
  }

  if (type === "repair-state") {
    const snapshot = payload["snapshot"];
    const meta = payload["meta"];
    if (isRepairUiState(snapshot) && isRepairUiSnapshotMeta(meta)) {
      const nextSnapshot: RepairUiState = snapshot;
      const nextMeta: RepairUiSnapshotMeta = meta;
      return { type, snapshot: nextSnapshot, meta: nextMeta };
    }
  }

  if (type === "repair-feed-event") {
    const event = payload["event"];
    if (typeof event === "object" && event !== null) {
      return { type, event: event as RepairAiMarkEvent };
    }
  }

  if (type === "repair-measurement-reading") {
    const reading = payload["reading"];
    if (typeof reading === "object" && reading !== null) {
      return { type, reading: reading as RepairMeasurementEvent };
    }
  }

  if (type === "repair-chat-reply") {
    const turnId = payload["turnId"];
    const text = payload["text"];
    const occurredAt = payload["occurredAt"];
    const contextRefs = payload["contextRefs"];
    if (
      typeof turnId === "string" &&
      typeof text === "string" &&
      typeof occurredAt === "string" &&
      Array.isArray(contextRefs)
    ) {
      return {
        type,
        turnId,
        text,
        occurredAt,
        contextRefs: contextRefs.filter((entry): entry is string => typeof entry === "string"),
      };
    }
  }

  if (type === "repair-research-progress") {
    const step = payload["step"];
    const completed = payload["completed"];
    if (typeof step === "string" && typeof completed === "boolean") {
      return { type, step: step as RepairResearchProgressHostMessage["step"], completed };
    }
  }

  if (type === "transcript-ingress") {
    const requestId = payload["requestId"];
    const text = payload["text"];
    const source = payload["source"];
    const target = payload["target"];
    const isFinal = payload["isFinal"];
    const createdAt = payload["createdAt"];
    const metadata = payload["metadata"];
    if (
      typeof requestId === "string" &&
      typeof text === "string" &&
      (source === "pc-mic" || source === "android-bridge" || source === "synthetic-test") &&
      (target === null || typeof target === "string") &&
      typeof isFinal === "boolean" &&
      typeof createdAt === "string" &&
      (metadata === null || (typeof metadata === "object" && Array.isArray(metadata) === false))
    ) {
      return {
        type,
        requestId,
        text,
        source,
        target,
        isFinal,
        createdAt,
        metadata: metadata as Record<string, unknown> | null,
      };
    }
  }

  if (type === "capture-feed-status") {
    const requestId = payload["requestId"];
    const mode = payload["mode"];
    const ok = payload["ok"];
    const preview = payload["preview"];
    if (
      typeof requestId === "string" &&
      (mode === "camera-feed" || mode === "interactive-mirror") &&
      typeof ok === "boolean" &&
      (preview === null || (typeof preview === "object" && Array.isArray(preview) === false))
    ) {
      return {
        type,
        requestId,
        mode,
        ok,
        preview: preview as RepairLivePreviewState | null,
      };
    }
  }

  if (type === "capture-dictation-status") {
    const requestId = readString(payload["requestId"]);
    const createdAt = readString(payload["createdAt"]);
    const source = payload["source"];
    const target = readString(payload["target"]);
    const deviceId = readNullableString(payload["deviceId"]);
    const status = payload["status"];
    const message = readString(payload["message"]);
    if (
      requestId !== null &&
      createdAt !== null &&
      source === "android-bridge" &&
      target !== null &&
      hasNullableStringShape(payload["deviceId"]) &&
      (status === "started" ||
        status === "transcribing" ||
        status === "done" ||
        status === "failed") &&
      message !== null
    ) {
      return { type, requestId, createdAt, source, target, deviceId, status, message };
    }
  }

  if (type === "capture-ambient-status") {
    const requestId = readString(payload["requestId"]);
    const createdAt = readString(payload["createdAt"]);
    const source = payload["source"];
    const target = readString(payload["target"]);
    const deviceId = readNullableString(payload["deviceId"]);
    const status = payload["status"];
    const message = readString(payload["message"]);
    const transcript = readNullableString(payload["transcript"] ?? null);
    const metadata = readRecord(payload["metadata"]) ?? null;
    if (
      requestId !== null &&
      createdAt !== null &&
      source === "android-bridge" &&
      target !== null &&
      hasNullableStringShape(payload["deviceId"]) &&
      (status === "started" ||
        status === "wake-detected" ||
        status === "capturing" ||
        status === "transcribing" ||
        status === "done" ||
        status === "stopped" ||
        status === "failed") &&
      message !== null
    ) {
      return {
        type,
        requestId,
        createdAt,
        source,
        target,
        deviceId,
        status,
        message,
        transcript,
        metadata,
      };
    }
  }

  if (type === "capture-media-ingress") {
    const requestId = readString(payload["requestId"]);
    const createdAt = readString(payload["createdAt"]);
    const source = payload["source"];
    const target = readString(payload["target"]);
    const asset = readRecord(payload["asset"]);
    const metadata = readRecord(payload["metadata"]) ?? null;
    const importedAt =
      asset === null ? null : payload["asset"] !== null ? asset["importedAt"] : null;
    if (
      requestId !== null &&
      createdAt !== null &&
      source === "android-bridge" &&
      target !== null &&
      asset !== null &&
      typeof asset["name"] === "string" &&
      typeof asset["originalName"] === "string" &&
      typeof asset["path"] === "string" &&
      typeof importedAt === "number" &&
      Number.isFinite(importedAt)
    ) {
      return {
        type,
        requestId,
        createdAt,
        source,
        target,
        asset: {
          name: asset["name"],
          originalName: asset["originalName"],
          path: asset["path"],
          importedAt,
        },
        metadata,
      };
    }
  }

  if (type === "tts-status") {
    const requestId = readString(payload["requestId"]);
    const target = readString(payload["target"]);
    const mode = payload["mode"];
    const status = payload["status"];
    const message = readString(payload["message"]);
    const error = readNullableString(payload["error"]);
    const source = payload["source"];
    if (
      requestId !== null &&
      target !== null &&
      (mode === "local" || mode === "android") &&
      (status === "queued" ||
        status === "preparing" ||
        status === "playing" ||
        status === "done" ||
        status === "stopped" ||
        status === "failed") &&
      message !== null &&
      hasNullableStringShape(payload["error"]) &&
      (source === "local" || source === "android-bridge")
    ) {
      return { type, requestId, target, mode, status, message, error, source };
    }
  }

  if (type === "command-result") {
    const command = readString(payload["command"] ?? envelope["command"]);
    const result = readRecord(payload["result"] ?? envelope["result"]);
    if (command !== null && result !== null) {
      return { type, command, result };
    }
  }

  return null;
}

export function isRepairHostMessage(value: unknown): value is RepairHostMessage {
  return normalizeRepairHostMessage(value) !== null;
}
