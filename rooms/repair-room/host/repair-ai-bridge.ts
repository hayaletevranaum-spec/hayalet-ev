import {
  REPAIR_AI_MIN_RESOURCE_CONFIDENCE,
  REPAIR_AI_RETRY_BASE_DELAY_MS,
  REPAIR_AI_RETRY_MAX_ATTEMPTS,
  REPAIR_AI_RETRY_MAX_DELAY_MS,
  REPAIR_KNOWLEDGE_PACK_SCHEMA_VERSION,
  REPAIR_PROTOCOL_KEYS,
  REPAIR_PROTOCOL_SCENARIOS,
  REPAIR_ROOM_ID,
  REPAIR_UI_COMMANDS,
  type RepairUiCommandName,
} from "../shared/repair-constants.js";
import type {
  RepairAiSeverity,
  RepairChatTurn,
  RepairCommonFailure,
  RepairImageRect,
  RepairKnowledgeSpatialRef,
  RepairKnowledgePack,
  RepairKnowledgePackResource,
  RepairMeasurementEvent,
  RepairOperatorProfile,
  RepairSession,
  RepairTestPoint,
  RepairWizardDraft,
} from "../shared/types/index.js";
import type { RepairAiTargetSlot } from "../shared/ui/state.js";

export type RepairAiDispatchBridge = (
  payload: Record<string, unknown>
) => Promise<unknown> | unknown;

export const REPAIR_AI_TARGET_SLOT: RepairAiTargetSlot = "ai2";

export interface RepairAiChatReplyRequest {
  dispatchBridge?: RepairAiDispatchBridge;
  locale: string;
  operatorProfile: RepairOperatorProfile;
  operatorTurn: RepairChatTurn;
  recentTurns: RepairChatTurn[];
  session: RepairSession | null;
  targetSlot?: RepairAiTargetSlot;
}

export interface RepairAiChatReplyResult {
  success: boolean;
  text: string | null;
  contextRefs: string[];
  rejectedRoomCommandCount: number;
  roomCommands: RepairAiRoomCommand[];
  message?: string;
}

interface RepairAiChatReplyPayload {
  replyText: string;
  contextRefs: string[];
  rejectedRoomCommandCount: number;
  roomCommands: RepairAiRoomCommand[];
}

export interface RepairAiRoomCommand {
  commandName: RepairUiCommandName;
  payload: Record<string, unknown>;
  reason: string | null;
}

export interface RepairAiTacticalObservation {
  kind: RepairAiSeverity;
  text: string;
  region: RepairImageRect | null;
  contextRefs: string[];
  linkedEventIds: string[];
  linkedMeasurementIds: string[];
}

export interface RepairAiTacticalObservationRequest {
  dispatchBridge?: RepairAiDispatchBridge;
  locale: string;
  operatorProfile: RepairOperatorProfile;
  session: RepairSession;
  targetSlot?: RepairAiTargetSlot;
  triggeringEvent: RepairMeasurementEvent;
}

export interface RepairAiTacticalObservationResult {
  success: boolean;
  observations: RepairAiTacticalObservation[];
  message?: string;
}

export interface RepairAiKnowledgeResearchRequest {
  dispatchBridge?: RepairAiDispatchBridge;
  draft: RepairWizardDraft;
  locale: string;
  operatorProfile: RepairOperatorProfile;
  targetSlot?: RepairAiTargetSlot;
}

export interface RepairAiKnowledgeResearchResult {
  success: boolean;
  contextRefs: string[];
  pack: RepairKnowledgePack | null;
  message?: string;
}

export interface RepairAiRiskDetectionRequest {
  dispatchBridge?: RepairAiDispatchBridge;
  locale: string;
  operatorProfile: RepairOperatorProfile;
  session: RepairSession;
  targetSlot?: RepairAiTargetSlot;
}

export interface RepairAiRiskObservation {
  severity: "low" | "medium" | "high" | "critical";
  category: "operator-safety" | "equipment-reliability";
  text: string;
  region: RepairImageRect | null;
  recommendedAction: string;
  contextRefs: string[];
}

export interface RepairAiRiskDetectionResult {
  success: boolean;
  risks: RepairAiRiskObservation[];
  message?: string;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && Array.isArray(value) === false
    ? (value as Record<string, unknown>)
    : {};
}

const REPAIR_AI_ROOM_COMMAND_ALLOWLIST = new Set<RepairUiCommandName>([
  REPAIR_UI_COMMANDS.addMeasurement,
  REPAIR_UI_COMMANDS.addTimelineEvent,
  REPAIR_UI_COMMANDS.focusInvestigationRegion,
  REPAIR_UI_COMMANDS.focusKnowledgeSpatialRef,
  REPAIR_UI_COMMANDS.focusOverlayEntity,
  REPAIR_UI_COMMANDS.promoteKnowledgeRegion,
  REPAIR_UI_COMMANDS.toggleFreezeFrame,
  REPAIR_UI_COMMANDS.jumpToEvent,
  REPAIR_UI_COMMANDS.speakGuidance,
  REPAIR_UI_COMMANDS.dismissAiMark,
]);

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asNonEmptyString(item))
    .filter((item): item is string => item !== null);
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRepairAiSeverity(value: unknown): RepairAiSeverity | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "info" || normalized === "note") return "info";
  if (normalized === "suggestion" || normalized === "recommendation") return "suggestion";
  if (normalized === "action" || normalized === "next_step" || normalized === "next-step") {
    return "action";
  }
  if (normalized === "risk" || normalized === "warning" || normalized === "danger") {
    return "risk";
  }
  return null;
}

function asImageRect(value: unknown): RepairImageRect | null {
  const record = toRecord(value);
  const xPx = asFiniteNumber(record["xPx"]);
  const yPx = asFiniteNumber(record["yPx"]);
  const widthPx = asFiniteNumber(record["widthPx"]);
  const heightPx = asFiniteNumber(record["heightPx"]);
  if (xPx === null || yPx === null || widthPx === null || heightPx === null) return null;
  return {
    xPx,
    yPx,
    widthPx: Math.max(1, widthPx),
    heightPx: Math.max(1, heightPx),
  };
}

function isValidLocalAssetSrc(src: string): boolean {
  return (
    src.startsWith("shared/assets/") || src.startsWith("main-functions/") || src.startsWith("i18n/")
  );
}

function isValidExternalResourceUrl(src: string): boolean {
  try {
    const url = new URL(src);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validateResourceSrc(src: string | null): string | null {
  if (src === null) return null;
  const trimmed = src.trim();
  if (trimmed === "") return null;
  if (isValidLocalAssetSrc(trimmed) || isValidExternalResourceUrl(trimmed)) return trimmed;
  return null;
}

function validateResourceUrl(src: string | null): string | null {
  if (src === null) return null;
  const trimmed = src.trim();
  if (trimmed === "") return null;
  if (isValidLocalAssetSrc(trimmed) || isValidExternalResourceUrl(trimmed)) return trimmed;
  return null;
}

function validateSpatialRect(
  rect: RepairImageRect | null,
  imageBounds: { widthPx: number; heightPx: number } | null
): RepairImageRect | null {
  if (rect === null) return null;
  if (rect.xPx < 0 || rect.yPx < 0 || rect.widthPx <= 0 || rect.heightPx <= 0) return null;
  if (imageBounds !== null) {
    if (
      rect.xPx + rect.widthPx > imageBounds.widthPx + 100 ||
      rect.yPx + rect.heightPx > imageBounds.heightPx + 100
    ) {
      return null;
    }
  }
  return rect;
}

function asConfidence(value: unknown, fallback = 0.5): number {
  const numeric = asFiniteNumber(value);
  if (numeric === null) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function asNullableInteger(value: unknown): number | null {
  const numeric = asFiniteNumber(value);
  return numeric === null ? null : Math.max(1, Math.round(numeric));
}

function readSpatialRef(value: unknown): RepairKnowledgeSpatialRef | null {
  const record = toRecord(value);
  const label = asNonEmptyString(record["label"] ?? record["name"]);
  if (label === null) return null;
  const pointRecord = toRecord(record["point"] ?? record["pinAt"]);
  const xPx = asFiniteNumber(pointRecord["xPx"] ?? record["xPx"]);
  const yPx = asFiniteNumber(pointRecord["yPx"] ?? record["yPx"]);
  const point = xPx === null || yPx === null ? null : { xPx, yPx };
  const region = validateSpatialRect(asImageRect(record["region"] ?? record["rect"]), null);
  if (point === null && region === null) return null;
  const kind = asNonEmptyString(record["kind"]);
  return {
    kind:
      kind === "region" || kind === "component" || kind === "rail" || kind === "board-coordinate"
        ? kind
        : region !== null
          ? "region"
          : "board-coordinate",
    label,
    point,
    region,
    componentId: asNonEmptyString(record["componentId"] ?? record["component"]),
    rail: asNonEmptyString(record["rail"]),
    linkedSnapshotId: asNonEmptyString(record["linkedSnapshotId"] ?? record["snapshotId"]),
  };
}

function readSpatialRefs(value: unknown): NonNullable<RepairKnowledgePackResource["spatialRefs"]> {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => readSpatialRef(entry))
    .filter(
      (entry): entry is NonNullable<RepairKnowledgePackResource["spatialRefs"]>[number] =>
        entry !== null
    );
}

function asResourceKind(value: unknown): RepairKnowledgePackResource["kind"] {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    normalized === "schematic" ||
    normalized === "board-image" ||
    normalized === "thread" ||
    normalized === "datasheet" ||
    normalized === "note"
  ) {
    return normalized;
  }
  if (normalized === "board_image" || normalized === "board image") return "board-image";
  return "note";
}

function slugifyRepairId(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? fallback : slug;
}

function readKnowledgeResources(value: unknown): RepairKnowledgePackResource[] {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  return value.flatMap((entry, index): RepairKnowledgePackResource[] => {
    const record = toRecord(entry);
    const label =
      asNonEmptyString(record["label"]) ??
      asNonEmptyString(record["title"]) ??
      asNonEmptyString(record["name"]);
    if (label === null) return [];
    const id =
      asNonEmptyString(record["id"]) ??
      `${asResourceKind(record["kind"])}-${slugifyRepairId(label, String(index + 1))}`;
    if (seenIds.has(id)) return [];
    seenIds.add(id);
    const rawUrl =
      asNonEmptyString(record["url"]) ??
      asNonEmptyString(record["sourceUrl"]) ??
      asNonEmptyString(record["href"]);
    const rawSrc = asNonEmptyString(record["src"]) ?? rawUrl;
    const validatedSrc = validateResourceSrc(rawSrc);
    const sourceUrl = validateResourceUrl(rawUrl ?? rawSrc);
    const downloadUrl = validateResourceUrl(asNonEmptyString(record["downloadUrl"]) ?? sourceUrl);
    const spatialRefs = readSpatialRefs(record["spatialRefs"]);
    return [
      {
        id,
        label,
        kind: asResourceKind(record["kind"] ?? record["type"]),
        src: validatedSrc,
        ...(sourceUrl === null ? {} : { sourceUrl }),
        ...(downloadUrl === null ? {} : { downloadUrl }),
        addedBy: "ai",
        source: asNonEmptyString(record["source"]) ?? "Asistan AI kanıt araştırması",
        pages: asNullableInteger(record["pages"]),
        confidence: asConfidence(record["confidence"]),
        ...(spatialRefs.length === 0 ? {} : { spatialRefs }),
      },
    ];
  });
}

function readCommonFailures(value: unknown): RepairCommonFailure[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index): RepairCommonFailure[] => {
    const record = toRecord(entry);
    const label =
      asNonEmptyString(record["label"]) ??
      asNonEmptyString(record["title"]) ??
      asNonEmptyString(record["failure"]);
    const recommendedAction =
      asNonEmptyString(record["recommendedAction"]) ??
      asNonEmptyString(record["action"]) ??
      asNonEmptyString(record["nextStep"]);
    if (label === null || recommendedAction === null) return [];
    return [
      {
        id:
          asNonEmptyString(record["id"]) ?? `failure-${slugifyRepairId(label, String(index + 1))}`,
        label,
        rationale: asNonEmptyString(record["rationale"]) ?? "Asistan AI kanıt eşleşmesi.",
        affectedPart:
          asNonEmptyString(record["affectedPart"]) ?? asNonEmptyString(record["component"]),
        recommendedAction,
        confidence: asConfidence(record["confidence"]),
        spatialRef: null,
      },
    ];
  });
}

function readTestPoints(value: unknown): RepairTestPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index): RepairTestPoint[] => {
    const record = toRecord(entry);
    const label =
      asNonEmptyString(record["label"]) ??
      asNonEmptyString(record["name"]) ??
      asNonEmptyString(record["id"]);
    const expectedValue = asFiniteNumber(record["expectedValue"] ?? record["value"]);
    const unit = asNonEmptyString(record["unit"]);
    if (label === null || expectedValue === null || unit === null) return [];
    return [
      {
        id: asNonEmptyString(record["id"]) ?? `tp-${slugifyRepairId(label, String(index + 1))}`,
        label,
        rail: asNonEmptyString(record["rail"]) ?? label,
        expectedValue,
        unit,
        tolerance: asFiniteNumber(record["tolerance"]),
        pinAt: null,
        spatialRef: null,
      },
    ];
  });
}

function readBridgeReplyText(result: Record<string, unknown>): string | null {
  const reply = toRecord(result["reply"]);
  return (
    asNonEmptyString(reply["text"]) ??
    asNonEmptyString(reply["content"]) ??
    asNonEmptyString(result["text"]) ??
    asNonEmptyString(result["content"]) ??
    asNonEmptyString(result["message"]) ??
    null
  );
}

function extractJsonValue(rawText: string): unknown | null {
  const trimmed = rawText.trim();
  if (trimmed === "") return null;

  const attempts = new Set<string>([trimmed]);
  const fenceMatches = trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
  for (const match of fenceMatches) {
    if (typeof match[1] === "string" && match[1].trim() !== "") {
      attempts.add(match[1].trim());
    }
  }

  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    attempts.add(trimmed.slice(objectStart, objectEnd + 1).trim());
  }

  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    attempts.add(trimmed.slice(arrayStart, arrayEnd + 1).trim());
  }

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as unknown;
    } catch {
      continue;
    }
  }

  return null;
}

function parseRepairAiChatReply(rawText: string): RepairAiChatReplyPayload | null {
  const parsed = toRecord(extractJsonValue(rawText));
  const replyText =
    asNonEmptyString(parsed["replyText"]) ??
    asNonEmptyString(parsed["text"]) ??
    asNonEmptyString(parsed["message"]) ??
    asNonEmptyString(parsed["guidance"]);
  if (replyText === null) return null;
  const roomCommandResult = parseRepairAiRoomCommands(parsed["roomCommands"] ?? parsed["commands"]);
  return {
    replyText,
    contextRefs: asStringArray(parsed["contextRefs"]),
    rejectedRoomCommandCount: roomCommandResult.rejectedCount,
    roomCommands: roomCommandResult.commands,
  };
}

function readRoomCommandEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return Object.keys(toRecord(value)).length > 0 ? [value] : [];
}

function parseRepairAiRoomCommands(value: unknown): {
  commands: RepairAiRoomCommand[];
  rejectedCount: number;
} {
  let rejectedCount = 0;
  const commands = readRoomCommandEntries(value).flatMap((entry): RepairAiRoomCommand[] => {
    const record = toRecord(entry);
    const commandName = asNonEmptyString(record["commandName"] ?? record["command"]);
    if (
      commandName === null ||
      !REPAIR_AI_ROOM_COMMAND_ALLOWLIST.has(commandName as RepairUiCommandName)
    ) {
      rejectedCount += 1;
      return [];
    }
    const payloadRecord = toRecord(record["payload"] ?? record["args"]);
    return [
      {
        commandName: commandName as RepairUiCommandName,
        payload: payloadRecord,
        reason: asNonEmptyString(record["reason"]),
      },
    ];
  });
  return { commands: commands.slice(0, 2), rejectedCount };
}

function readObservationEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const parsed = toRecord(value);
  const candidates = [
    parsed["observations"],
    parsed["observation"],
    parsed["events"],
    parsed["items"],
    parsed["marks"],
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (Object.keys(toRecord(candidate)).length > 0) return [candidate];
  }
  return Object.keys(parsed).length > 0 ? [parsed] : [];
}

function parseRepairAiTacticalObservations(rawText: string): RepairAiTacticalObservation[] {
  const parsed = extractJsonValue(rawText);
  return readObservationEntries(parsed)
    .flatMap((entry): RepairAiTacticalObservation[] => {
      const record = toRecord(entry);
      const kind = asRepairAiSeverity(record["kind"] ?? record["severity"]);
      const text =
        asNonEmptyString(record["text"]) ??
        asNonEmptyString(record["body"]) ??
        asNonEmptyString(record["message"]) ??
        asNonEmptyString(record["rationale"]);
      if (kind === null || text === null) return [];
      return [
        {
          kind,
          text,
          region: asImageRect(record["region"] ?? record["rect"]),
          contextRefs: asStringArray(record["contextRefs"]),
          linkedEventIds: asStringArray(record["linkedEventIds"]),
          linkedMeasurementIds: asStringArray(record["linkedMeasurementIds"]),
        },
      ];
    })
    .slice(0, 3);
}

function parseRepairAiKnowledgePack(rawText: string): RepairKnowledgePack | null {
  const parsed = toRecord(extractJsonValue(rawText));
  const packRecord =
    Object.keys(toRecord(parsed["knowledgePack"])).length > 0
      ? toRecord(parsed["knowledgePack"])
      : parsed;
  const modelNumber =
    asNonEmptyString(packRecord["modelNumber"]) ??
    asNonEmptyString(packRecord["model"]) ??
    asNonEmptyString(packRecord["boardCode"]);
  const deviceLabel =
    asNonEmptyString(packRecord["deviceLabel"]) ??
    asNonEmptyString(packRecord["device"]) ??
    modelNumber;
  if (modelNumber === null || deviceLabel === null) return null;

  const allResources = readKnowledgeResources(packRecord["resources"]);
  const resources = allResources.filter((r) => r.confidence >= REPAIR_AI_MIN_RESOURCE_CONFIDENCE);
  const allCommonFailures = readCommonFailures(
    packRecord["commonFailures"] ?? packRecord["knownFailures"]
  );
  const commonFailures = allCommonFailures.filter(
    (f) => f.confidence >= REPAIR_AI_MIN_RESOURCE_CONFIDENCE
  );
  const testPoints = readTestPoints(packRecord["testPoints"]);
  const notes = asStringArray(packRecord["notes"]);
  if (
    resources.length === 0 &&
    commonFailures.length === 0 &&
    testPoints.length === 0 &&
    notes.length === 0
  ) {
    return null;
  }

  return {
    schemaVersion: REPAIR_KNOWLEDGE_PACK_SCHEMA_VERSION,
    id:
      asNonEmptyString(packRecord["id"]) ??
      `ai-kp-${slugifyRepairId(modelNumber, String(Date.now()))}`,
    modelNumber,
    deviceLabel,
    stats: {
      schematics: resources.filter((resource) => resource.kind === "schematic").length,
      boardImages: resources.filter((resource) => resource.kind === "board-image").length,
      commonFailures: commonFailures.length,
      repairNotes: notes.length + resources.filter((resource) => resource.kind === "note").length,
      testPoints: testPoints.length,
    },
    resources,
    commonFailures,
    testPoints,
    notes,
    createdAt: asNonEmptyString(packRecord["createdAt"]) ?? new Date().toISOString(),
  };
}

function summarizeSession(session: RepairSession | null): Record<string, unknown> {
  if (session === null) {
    return {
      active: false,
    };
  }

  return {
    active: true,
    id: session.id,
    title: session.title,
    status: session.status,
    riskLevel: session.riskLevel,
    deviceInfo: session.deviceInfo,
    symptoms: session.symptoms,
    knowledgePackId: session.knowledgePackId,
    recentEvents: session.events.slice(-8).map((event) => ({
      id: event.id,
      kind: event.kind,
      occurredAt: event.occurredAt,
      source: event.source,
      title: "title" in event ? event.title : undefined,
      label: "label" in event ? event.label : undefined,
      reference: "reference" in event ? event.reference : undefined,
      rawDisplay: "rawDisplay" in event ? event.rawDisplay : undefined,
      unit: "unit" in event ? event.unit : undefined,
    })),
  };
}

function summarizeOperatorProfile(profile: RepairOperatorProfile): Record<string, unknown> {
  return {
    displayName: profile.displayName,
    tools: profile.bench.tools
      .filter((tool) => tool.available)
      .map((tool) => ({
        category: tool.category,
        label: tool.label,
        capabilities: tool.capabilities,
        model: tool.model,
      })),
    safety: profile.bench.safety.filter((item) => item.available).map((item) => item.label),
    preferences: profile.preferences,
    skills: profile.skills,
  };
}

interface RepairAiProjectSeed {
  boardCode: string;
  deviceType: string;
  manufacturer: string;
  model: string;
}

function buildRepairDraftProjectId(seed: RepairAiProjectSeed): string {
  const boardCode = seed.boardCode.trim();
  const fallbackId = [seed.deviceType, seed.manufacturer, seed.model]
    .map((value) => value.trim())
    .filter(Boolean)
    .join("/");
  return boardCode !== "" ? boardCode : fallbackId;
}

function buildRepairDraftProjectRefFromSeed(
  seed: RepairAiProjectSeed
): Record<string, unknown> | null {
  const projectId = buildRepairDraftProjectId(seed);
  if (projectId === "") return null;
  const title = [seed.manufacturer, seed.model, seed.boardCode]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");
  return {
    roomId: REPAIR_ROOM_ID,
    projectId: `draft:${projectId}`,
    ...(title !== "" ? { title } : {}),
  };
}

function buildRepairProjectRef(session: RepairSession | null): Record<string, unknown> | null {
  if (session === null) return null;
  const draftProjectRef = buildRepairDraftProjectRefFromSeed(session.deviceInfo);
  return {
    roomId: REPAIR_ROOM_ID,
    projectId: session.id,
    title: session.title,
    ...(draftProjectRef !== null ? { aliases: [draftProjectRef] } : {}),
  };
}

function buildRepairDraftProjectRef(draft: RepairWizardDraft): Record<string, unknown> | null {
  return buildRepairDraftProjectRefFromSeed(draft);
}

function isTransientAiError(message: string | undefined): boolean {
  if (message === undefined) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("timeout") ||
    lower.includes("rate limit") ||
    lower.includes("network") ||
    lower.includes("unavailable") ||
    lower.includes("temporarily")
  );
}

async function retryAiDispatch<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (attempt >= REPAIR_AI_RETRY_MAX_ATTEMPTS || !isTransientAiError(message)) {
      throw error;
    }
    const delay = Math.min(
      REPAIR_AI_RETRY_MAX_DELAY_MS,
      REPAIR_AI_RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
    return retryAiDispatch(fn, attempt + 1);
  }
}

function buildRepairAiChatPrompt(request: RepairAiChatReplyRequest): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      task: "repair-room-assistant-chat",
      locale: request.locale,
      outputSchema: {
        replyText: "short operator-facing guidance text",
        contextRefs: ["session/event/test-point ids that support the guidance"],
        roomCommands: [
          {
            commandName: Array.from(REPAIR_AI_ROOM_COMMAND_ALLOWLIST).join(" | "),
            payload: "JSON payload accepted by that Repair Room command",
            reason: "why this command is safe and useful now",
          },
        ],
      },
      constraints: [
        "Return JSON only.",
        "Do not invent part designators, rails, or test points that are not present in context.",
        "Prioritize safety, verification, and reversible diagnostic steps.",
        "Keep replyText concise enough for a hands-busy repair bench.",
        "Only include roomCommands when the command can be executed safely from visible context.",
        "Use only commandName values listed in outputSchema.roomCommands; never emit ++cmd text.",
      ],
      operatorTurn: request.operatorTurn,
      recentTurns: request.recentTurns.slice(-8),
      session: summarizeSession(request.session),
      operatorProfile: summarizeOperatorProfile(request.operatorProfile),
    },
    null,
    2
  );
}

function buildRepairAiTacticalPrompt(request: RepairAiTacticalObservationRequest): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      task: "repair-room-assistant-observation",
      locale: request.locale,
      outputSchema: {
        observations: [
          {
            kind: "risk | suggestion | action | info",
            text: "short tactical feed line",
            region: "optional image-space rect {xPx,yPx,widthPx,heightPx}",
            linkedEventIds: ["event ids that support the observation"],
            linkedMeasurementIds: ["measurement event ids that support the observation"],
            contextRefs: ["other stable refs"],
          },
        ],
      },
      constraints: [
        "Return JSON only.",
        "Do not invent part designators, rails, or test points that are not present in context.",
        "Each observation text must be 140 characters or shorter.",
        "Return at most 3 observations.",
        "Use kind=risk only for immediate operator safety or equipment reliability risk.",
      ],
      triggeringEvent: request.triggeringEvent,
      session: summarizeSession(request.session),
      operatorProfile: summarizeOperatorProfile(request.operatorProfile),
    },
    null,
    2
  );
}

function buildRepairAiKnowledgeResearchPrompt(request: RepairAiKnowledgeResearchRequest): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      task: "repair-room-assistant-evidence",
      locale: request.locale,
      outputSchema: {
        knowledgePack: {
          id: "stable lowercase id",
          modelNumber: "board/model identifier",
          deviceLabel: "operator-facing device label",
          resources: [
            {
              id: "resource id",
              label: "resource title",
              kind: "schematic | board-image | thread | datasheet | note",
              source: "source name or URL",
              pages: "number or null",
              confidence: "0..1",
            },
          ],
          commonFailures: [
            {
              id: "failure id",
              label: "short failure label",
              rationale: "why this failure is relevant",
              affectedPart: "part designator or null",
              recommendedAction: "safe diagnostic or repair action",
              confidence: "0..1",
            },
          ],
          testPoints: [
            {
              id: "test point id",
              label: "test point label",
              rail: "rail name",
              expectedValue: "number",
              unit: "V | Ohm | A | Hz",
              tolerance: "number or null",
            },
          ],
          notes: ["safety and diagnostic notes"],
        },
        contextRefs: ["source ids or session refs"],
      },
      constraints: [
        "Return JSON only.",
        "Do not invent exact service-manual availability; mark source as candidate when uncertain.",
        "Prioritize safe, reversible diagnostic steps.",
        "Keep commonFailures and testPoints limited to the provided device context.",
      ],
      draft: request.draft,
      operatorProfile: summarizeOperatorProfile(request.operatorProfile),
    },
    null,
    2
  );
}

function buildRepairAiRiskDetectionPrompt(request: RepairAiRiskDetectionRequest): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      task: "repair-room-assistant-risk-scan",
      locale: request.locale,
      outputSchema: {
        risks: [
          {
            severity: "low | medium | high | critical",
            category: "operator-safety | equipment-reliability",
            text: "short risk description (≤ 140 chars)",
            region: "optional image-space rect {xPx,yPx,widthPx,heightPx}",
            recommendedAction: "minimum action to make the bench safe",
            contextRefs: ["supporting event/session refs"],
          },
        ],
      },
      constraints: [
        "Return JSON only.",
        "Distinguish operator-safety risks (high voltage, residual charge) from equipment-reliability risks (shorted rails, damaged traces).",
        "Never suppress critical risks even if they appear redundant.",
        "Recommend the minimum operator action required to make the bench safe.",
        "Anchor risks to PCB regions when applicable.",
      ],
      session: summarizeSession(request.session),
      operatorProfile: summarizeOperatorProfile(request.operatorProfile),
    },
    null,
    2
  );
}

export async function requestRepairAiChatReply(
  request: RepairAiChatReplyRequest
): Promise<RepairAiChatReplyResult> {
  if (typeof request.dispatchBridge !== "function") {
    return {
      success: false,
      text: null,
      contextRefs: [],
      rejectedRoomCommandCount: 0,
      roomCommands: [],
      message: "Asistan AI dispatch bridge is unavailable.",
    };
  }

  const dispatchBridge = request.dispatchBridge;
  const targetSlot = request.targetSlot ?? REPAIR_AI_TARGET_SLOT;
  const projectRef = buildRepairProjectRef(request.session);
  const bridgeResult = toRecord(
    await retryAiDispatch(async () =>
      dispatchBridge({
        action: "message.sendWait",
        timeoutMs: 120000,
        toSlot: targetSlot,
        ...(projectRef !== null ? { projectRef } : {}),
        payload: {
          page: "repair-room:assistant-chat",
          text: buildRepairAiChatPrompt(request),
          protocol: {
            room: REPAIR_ROOM_ID,
            scenario: REPAIR_PROTOCOL_SCENARIOS.assistantChat,
            protocolKey: REPAIR_PROTOCOL_KEYS.assistantChat,
          },
        },
      })
    ).catch((error: unknown) => ({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    }))
  );

  if (bridgeResult["success"] !== true) {
    return {
      success: false,
      text: null,
      contextRefs: [],
      rejectedRoomCommandCount: 0,
      roomCommands: [],
      message: asNonEmptyString(bridgeResult["message"]) ?? "Asistan AI dispatch failed.",
    };
  }

  const replyText = readBridgeReplyText(bridgeResult);
  if (replyText === null) {
    return {
      success: false,
      text: null,
      contextRefs: [],
      rejectedRoomCommandCount: 0,
      roomCommands: [],
      message: "Asistan AI dispatch did not return readable text.",
    };
  }

  const parsed = parseRepairAiChatReply(replyText);
  if (parsed !== null) {
    return {
      success: true,
      text: parsed.replyText,
      contextRefs: parsed.contextRefs,
      rejectedRoomCommandCount: parsed.rejectedRoomCommandCount,
      roomCommands: parsed.roomCommands,
    };
  }

  return {
    success: true,
    text: replyText,
    contextRefs: [],
    rejectedRoomCommandCount: 0,
    roomCommands: [],
  };
}

export async function requestRepairAiKnowledgeResearch(
  request: RepairAiKnowledgeResearchRequest
): Promise<RepairAiKnowledgeResearchResult> {
  if (typeof request.dispatchBridge !== "function") {
    return {
      success: false,
      pack: null,
      contextRefs: [],
      message: "Asistan AI dispatch bridge is unavailable.",
    };
  }

  const dispatchBridge = request.dispatchBridge;
  const targetSlot = request.targetSlot ?? REPAIR_AI_TARGET_SLOT;
  const projectRef = buildRepairDraftProjectRef(request.draft);
  const bridgeResult = toRecord(
    await retryAiDispatch(async () =>
      dispatchBridge({
        action: "message.sendWait",
        timeoutMs: 120000,
        toSlot: targetSlot,
        ...(projectRef !== null ? { projectRef } : {}),
        payload: {
          page: "repair-room:assistant-evidence",
          text: buildRepairAiKnowledgeResearchPrompt(request),
          protocol: {
            room: REPAIR_ROOM_ID,
            scenario: REPAIR_PROTOCOL_SCENARIOS.assistantEvidence,
            protocolKey: REPAIR_PROTOCOL_KEYS.assistantEvidence,
          },
        },
      })
    ).catch((error: unknown) => ({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    }))
  );

  if (bridgeResult["success"] !== true) {
    return {
      success: false,
      pack: null,
      contextRefs: [],
      message:
        asNonEmptyString(bridgeResult["message"]) ?? "Asistan AI kanıt araştırması gönderilemedi.",
    };
  }

  const replyText = readBridgeReplyText(bridgeResult);
  if (replyText === null) {
    return {
      success: false,
      pack: null,
      contextRefs: [],
      message: "Asistan AI kanıt araştırması okunabilir metin döndürmedi.",
    };
  }

  const parsed = toRecord(extractJsonValue(replyText));
  const pack = parseRepairAiKnowledgePack(replyText);
  if (pack === null) {
    return {
      success: false,
      pack: null,
      contextRefs: asStringArray(parsed["contextRefs"]),
      message: "Asistan AI kullanılabilir kanıt paketi döndürmedi.",
    };
  }

  return {
    success: true,
    pack,
    contextRefs: asStringArray(parsed["contextRefs"]),
  };
}

export async function requestRepairAiTacticalObservations(
  request: RepairAiTacticalObservationRequest
): Promise<RepairAiTacticalObservationResult> {
  if (typeof request.dispatchBridge !== "function") {
    return {
      success: false,
      observations: [],
      message: "Asistan AI dispatch bridge is unavailable.",
    };
  }

  const dispatchBridge = request.dispatchBridge;
  const targetSlot = request.targetSlot ?? REPAIR_AI_TARGET_SLOT;
  const projectRef = buildRepairProjectRef(request.session);
  const bridgeResult = toRecord(
    await retryAiDispatch(async () =>
      dispatchBridge({
        action: "message.sendWait",
        timeoutMs: 120000,
        toSlot: targetSlot,
        ...(projectRef !== null ? { projectRef } : {}),
        payload: {
          page: "repair-room:assistant-observation",
          text: buildRepairAiTacticalPrompt(request),
          protocol: {
            room: REPAIR_ROOM_ID,
            scenario: REPAIR_PROTOCOL_SCENARIOS.assistantObservation,
            protocolKey: REPAIR_PROTOCOL_KEYS.assistantObservation,
          },
        },
      })
    ).catch((error: unknown) => ({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    }))
  );

  if (bridgeResult["success"] !== true) {
    return {
      success: false,
      observations: [],
      message: asNonEmptyString(bridgeResult["message"]) ?? "Asistan AI dispatch failed.",
    };
  }

  const replyText = readBridgeReplyText(bridgeResult);
  if (replyText === null) {
    return {
      success: false,
      observations: [],
      message: "Asistan AI dispatch did not return readable text.",
    };
  }

  const observations = parseRepairAiTacticalObservations(replyText);
  if (observations.length === 0) {
    return {
      success: false,
      observations: [],
      message: "Asistan AI cevabı gözlem içermiyor.",
    };
  }

  return {
    success: true,
    observations,
  };
}

function parseRepairAiRiskObservations(rawText: string): RepairAiRiskObservation[] {
  const parsed = extractJsonValue(rawText);
  const entries = readObservationEntries(parsed);
  return entries
    .flatMap((entry): RepairAiRiskObservation[] => {
      const record = toRecord(entry);
      const rawSeverity = asNonEmptyString(record["severity"] ?? record["level"]);
      if (rawSeverity === null) return [];
      const severity = ["low", "medium", "high", "critical"].includes(rawSeverity.toLowerCase())
        ? (rawSeverity.toLowerCase() as RepairAiRiskObservation["severity"])
        : null;
      if (severity === null) return [];
      const rawCategory = asNonEmptyString(record["category"] ?? record["type"]);
      const category =
        rawCategory === "operator-safety" || rawCategory === "operator safety"
          ? "operator-safety"
          : "equipment-reliability";
      const text =
        asNonEmptyString(record["text"]) ??
        asNonEmptyString(record["description"]) ??
        asNonEmptyString(record["message"]);
      const recommendedAction =
        asNonEmptyString(record["recommendedAction"]) ??
        asNonEmptyString(record["action"]) ??
        asNonEmptyString(record["nextStep"]);
      if (text === null || recommendedAction === null) return [];
      return [
        {
          severity,
          category,
          text,
          region: asImageRect(record["region"] ?? record["rect"]),
          recommendedAction,
          contextRefs: asStringArray(record["contextRefs"]),
        },
      ];
    })
    .slice(0, 5);
}

function hasExplicitEmptyRiskList(rawText: string): boolean {
  const parsed = toRecord(extractJsonValue(rawText));
  const risks = parsed["risks"] ?? parsed["observations"];
  return Array.isArray(risks) && risks.length === 0;
}

export async function requestRepairAiRiskDetection(
  request: RepairAiRiskDetectionRequest
): Promise<RepairAiRiskDetectionResult> {
  if (typeof request.dispatchBridge !== "function") {
    return {
      success: false,
      risks: [],
      message: "Asistan AI dispatch bridge is unavailable.",
    };
  }

  const dispatchBridge = request.dispatchBridge;
  const targetSlot = request.targetSlot ?? REPAIR_AI_TARGET_SLOT;
  const projectRef = buildRepairProjectRef(request.session);
  const bridgeResult = toRecord(
    await retryAiDispatch(async () =>
      dispatchBridge({
        action: "message.sendWait",
        timeoutMs: 120000,
        toSlot: targetSlot,
        ...(projectRef !== null ? { projectRef } : {}),
        payload: {
          page: "repair-room:assistant-risk-scan",
          text: buildRepairAiRiskDetectionPrompt(request),
          protocol: {
            room: REPAIR_ROOM_ID,
            scenario: REPAIR_PROTOCOL_SCENARIOS.assistantRiskScan,
            protocolKey: REPAIR_PROTOCOL_KEYS.assistantRiskScan,
          },
        },
      })
    ).catch((error: unknown) => ({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    }))
  );

  if (bridgeResult["success"] !== true) {
    return {
      success: false,
      risks: [],
      message: asNonEmptyString(bridgeResult["message"]) ?? "Asistan AI risk scan failed.",
    };
  }

  const replyText = readBridgeReplyText(bridgeResult);
  if (replyText === null) {
    return {
      success: false,
      risks: [],
      message: "Asistan AI risk scan did not return readable text.",
    };
  }

  const risks = parseRepairAiRiskObservations(replyText);
  if (risks.length === 0) {
    if (hasExplicitEmptyRiskList(replyText)) {
      return {
        success: true,
        risks: [],
      };
    }
    return {
      success: false,
      risks: [],
      message: "Asistan AI risk scan did not return observations.",
    };
  }

  return {
    success: true,
    risks,
  };
}
