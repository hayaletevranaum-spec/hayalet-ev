import type { PatternViewId } from "../types/pattern-room.js";
import {
  PATTERN_ROOM_SNAPSHOT_VERSION,
  type PatternRoomCanvasMode,
  type PatternRoomPresentationState,
  type PatternRoomSessionSnapshot,
} from "../types/pattern-room-snapshot.js";
import {
  PATTERN_LAYERS,
  type PatternEdgeType,
  type PatternLayer,
} from "../types/pattern-room-domain.js";
import type {
  DebateLocalPhase,
  DebateLocalTurn,
  LocalAuthoredEdge,
  LocalAuthoredEvidence,
  LocalAuthoredNode,
  LocalAuthoredSource,
  LocalAuthoredSourceSegment,
  LocalNote,
  PatternRoomLocalDomainReference,
  PatternRoomLocalGuards,
  PatternRoomLocalOverlay,
  PatternRoomLocalState,
} from "./pattern-room-local-state.js";
import type { PatternRoomEvidenceCandidate } from "../types/pattern-room-evidence-candidate.js";

type SnapshotRecord = Record<string, unknown>;

export type PatternRoomSnapshotRestoreResult = {
  overlay: PatternRoomLocalOverlay;
  activeView: PatternViewId;
  presentation?: PatternRoomPresentationState;
  guards: PatternRoomLocalGuards;
};

const PATTERN_VIEW_IDS = ["overview", "board", "desk", "archive", "tenth-man", "report"] as const;
const PATTERN_CANVAS_MODES = ["board", "graph"] as const;

const DEBATE_LOCAL_PHASES = [
  "idle",
  "preparation",
  "role_assignment",
  "opening",
  "counter_argument",
  "evidence_review",
  "weak_point",
  "judge_mapping",
  "completed",
] as const;

const PATTERN_ACTOR_IDS = ["AI0", "AI1", "AI2", "US1", "system"] as const;

const DEBATE_ROLE_IDS = ["researcher", "advocate", "tenth-man", "arbiter"] as const;

const DEBATE_STANCES = ["support", "oppose", "neutral", "question"] as const;

const LOCAL_AUTHORED_NODE_TYPES = ["claim", "inspiration", "uncertainty"] as const;

const PATTERN_EDGE_TYPES: readonly PatternEdgeType[] = [
  "supports",
  "contradicts",
  "references",
  "derived_from",
  "inspired_by",
  "questions",
  "needs_review",
];

const TURN_PHASES_WITH_LOCAL_TURNS = new Set<DebateLocalPhase>([
  "opening",
  "counter_argument",
  "evidence_review",
  "weak_point",
  "judge_mapping",
  "completed",
]);

const CONNECTED_ROLE_PHASES = new Set<DebateLocalPhase>([
  "role_assignment",
  "opening",
  "counter_argument",
  "evidence_review",
  "weak_point",
  "judge_mapping",
  "completed",
]);

const ROLE_CONNECTION_IDS = ["AI0", "AI1", "AI2", "US1"] as const;

function createSnapshotId(topicId: string, createdAt: string): string {
  return `pattern-room-snapshot-${topicId}-${createdAt.replace(/[^0-9]/g, "")}`;
}

function cloneNotes(notes: readonly LocalNote[]): LocalNote[] {
  return notes.map((note) => {
    return { ...note };
  });
}

function isPatternLayer(value: unknown): value is PatternLayer {
  return PATTERN_LAYERS.includes(value as PatternLayer);
}

function isRecord(value: unknown): value is SnapshotRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function readImportBatchId(record: SnapshotRecord): { importBatchId?: string | null } {
  const importBatchId = record["importBatchId"];
  if (importBatchId === null || typeof importBatchId === "string") {
    return { importBatchId };
  }
  return {};
}

function readOptionalSnapshotString(
  record: SnapshotRecord,
  key: string
): string | null | undefined {
  const value = record[key];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmedValue = value.trim();
  return trimmedValue === "" ? undefined : trimmedValue;
}

function hasLocalIdFormat(value: unknown, prefix: string): value is string {
  return typeof value === "string" && new RegExp(`^${prefix}-\\d{3,}$`).test(value);
}

function getLocalIdIndex(id: string, prefix: string): number {
  const match = new RegExp(`^${prefix}-(\\d{3,})$`).exec(id);
  if (match === null) {
    return 0;
  }
  return Number.parseInt(match[1] ?? "0", 10);
}

function getMaxLocalIdIndex(values: readonly { id: string }[], prefix: string): number {
  return values.reduce((maxIndex, value) => {
    return Math.max(maxIndex, getLocalIdIndex(value.id, prefix));
  }, 0);
}

function isPatternViewId(value: unknown): value is PatternViewId {
  return typeof value === "string" && PATTERN_VIEW_IDS.some((viewId) => viewId === value);
}

function isPatternCanvasMode(value: unknown): value is PatternRoomCanvasMode {
  return (
    typeof value === "string" && PATTERN_CANVAS_MODES.some((canvasMode) => canvasMode === value)
  );
}

function isDebateLocalPhase(value: unknown): value is DebateLocalPhase {
  return typeof value === "string" && DEBATE_LOCAL_PHASES.some((phase) => phase === value);
}

function isPatternActorId(value: unknown): value is DebateLocalTurn["actorId"] {
  return typeof value === "string" && PATTERN_ACTOR_IDS.some((actorId) => actorId === value);
}

function isDebateRole(value: unknown): value is DebateLocalTurn["role"] {
  return typeof value === "string" && DEBATE_ROLE_IDS.some((role) => role === value);
}

function isDebateStance(value: unknown): value is DebateLocalTurn["stance"] {
  return typeof value === "string" && DEBATE_STANCES.some((stance) => stance === value);
}

function isLocalAuthoredNodeType(value: unknown): value is LocalAuthoredNode["nodeType"] {
  return (
    typeof value === "string" && LOCAL_AUTHORED_NODE_TYPES.some((nodeType) => nodeType === value)
  );
}

function isPatternEdgeType(value: unknown): value is PatternEdgeType {
  return typeof value === "string" && PATTERN_EDGE_TYPES.some((edgeType) => edgeType === value);
}

function parseLayerRecord(value: unknown): Record<string, PatternLayer> | null {
  if (!isRecord(value)) {
    return null;
  }

  const layerById: Record<string, PatternLayer> = {};
  Object.entries(value).forEach(([sourceId, layer]) => {
    if (isPatternLayer(layer)) {
      layerById[sourceId] = layer;
    }
  });
  return layerById;
}

function parseRoleConnections(value: unknown): Record<string, boolean> | null {
  if (!isRecord(value)) {
    return null;
  }

  const roleConnections: Record<string, boolean> = {};
  Object.entries(value).forEach(([roleId, connected]) => {
    if (typeof connected === "boolean") {
      roleConnections[roleId] = connected;
    }
  });
  return roleConnections;
}

function parseLocalNotes(value: unknown): LocalNote[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const notes: LocalNote[] = [];
  for (const note of value) {
    if (
      !isRecord(note) ||
      typeof note["id"] !== "string" ||
      typeof note["text"] !== "string" ||
      typeof note["createdAt"] !== "string"
    ) {
      return null;
    }

    notes.push({
      id: note["id"],
      text: note["text"],
      createdAt: note["createdAt"],
      ...readImportBatchId(note),
    });
  }
  return notes;
}

function parseLocalAuthoredNodes(value: unknown): LocalAuthoredNode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const nodes: LocalAuthoredNode[] = [];
  for (const node of value) {
    if (
      !isRecord(node) ||
      !hasLocalIdFormat(node["id"], "local-node") ||
      !isLocalAuthoredNodeType(node["nodeType"]) ||
      typeof node["label"] !== "string" ||
      typeof node["content"] !== "string" ||
      typeof node["createdAt"] !== "string" ||
      node["label"].trim() === "" ||
      node["content"].trim() === ""
    ) {
      continue;
    }

    nodes.push({
      id: node["id"],
      nodeType: node["nodeType"],
      label: node["label"],
      content: node["content"],
      createdAt: node["createdAt"],
      ...readImportBatchId(node),
    });
  }
  return nodes;
}

function parseLocalAuthoredSourceSegments(
  value: unknown
): LocalAuthoredSourceSegment[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const segments = value.flatMap((segment) => {
    if (
      !isRecord(segment) ||
      typeof segment["id"] !== "string" ||
      typeof segment["label"] !== "string" ||
      typeof segment["text"] !== "string" ||
      typeof segment["order"] !== "number" ||
      !Number.isFinite(segment["order"]) ||
      segment["id"].trim() === "" ||
      segment["label"].trim() === "" ||
      segment["text"].trim() === ""
    ) {
      return [];
    }

    return [
      {
        id: segment["id"].trim(),
        label: segment["label"].trim(),
        text: segment["text"].trim(),
        order: segment["order"],
      },
    ];
  });

  return segments.length === 0 ? undefined : segments;
}

function parseLocalAuthoredSources(value: unknown): LocalAuthoredSource[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const sources: LocalAuthoredSource[] = [];
  for (const source of value) {
    if (
      !isRecord(source) ||
      !hasLocalIdFormat(source["id"], "local-source") ||
      typeof source["label"] !== "string" ||
      typeof source["origin"] !== "string" ||
      typeof source["note"] !== "string" ||
      typeof source["createdAt"] !== "string" ||
      source["label"].trim() === "" ||
      source["origin"].trim() === ""
    ) {
      continue;
    }

    const segments = parseLocalAuthoredSourceSegments(source["segments"]);
    sources.push({
      id: source["id"],
      label: source["label"],
      origin: source["origin"],
      note: source["note"],
      createdAt: source["createdAt"],
      ...(segments === undefined ? {} : { segments }),
      ...readImportBatchId(source),
    });
  }
  return sources;
}

function parseLocalAuthoredEvidence(value: unknown): LocalAuthoredEvidence[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const evidenceItems: LocalAuthoredEvidence[] = [];
  for (const evidence of value) {
    const interpretation = isRecord(evidence) ? evidence["interpretation"] : undefined;
    const sourceId = isRecord(evidence)
      ? readOptionalSnapshotString(evidence, "sourceId")
      : undefined;
    const sourceLabel = isRecord(evidence)
      ? readOptionalSnapshotString(evidence, "sourceLabel")
      : undefined;
    if (
      !isRecord(evidence) ||
      !hasLocalIdFormat(evidence["id"], "local-evidence") ||
      typeof evidence["label"] !== "string" ||
      typeof evidence["excerpt"] !== "string" ||
      (interpretation !== null && typeof interpretation !== "string") ||
      !isPatternLayer(evidence["layer"]) ||
      typeof evidence["createdAt"] !== "string" ||
      evidence["label"].trim() === "" ||
      evidence["excerpt"].trim() === ""
    ) {
      continue;
    }

    evidenceItems.push({
      id: evidence["id"],
      label: evidence["label"],
      excerpt: evidence["excerpt"],
      interpretation,
      layer: evidence["layer"],
      createdAt: evidence["createdAt"],
      ...(sourceId === undefined ? {} : { sourceId }),
      ...(sourceLabel === undefined ? {} : { sourceLabel }),
      ...readImportBatchId(evidence),
    });
  }
  return evidenceItems;
}

function parseLocalEvidenceCandidates(value: unknown): PatternRoomEvidenceCandidate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const candidates: PatternRoomEvidenceCandidate[] = [];
  for (const candidate of value) {
    const reviewSessionId = isRecord(candidate) ? candidate["reviewSessionId"] : undefined;
    if (
      !isRecord(candidate) ||
      !hasLocalIdFormat(candidate["id"], "local-evidence-candidate") ||
      typeof candidate["suggestionId"] !== "string" ||
      typeof candidate["text"] !== "string" ||
      (reviewSessionId !== null && typeof reviewSessionId !== "string") ||
      candidate["origin"] !== "ai-case-review" ||
      candidate["sourceSection"] !== "evidence" ||
      candidate["status"] !== "candidate" ||
      typeof candidate["createdAt"] !== "string" ||
      candidate["suggestionId"].trim() === "" ||
      candidate["text"].trim() === ""
    ) {
      continue;
    }

    candidates.push({
      id: candidate["id"],
      suggestionId: candidate["suggestionId"].trim(),
      text: candidate["text"].trim(),
      reviewSessionId:
        typeof reviewSessionId === "string" && reviewSessionId.trim() !== ""
          ? reviewSessionId.trim()
          : null,
      origin: "ai-case-review",
      sourceSection: "evidence",
      status: "candidate",
      createdAt: candidate["createdAt"],
    });
  }
  return candidates;
}

function parseLocalAuthoredEdges(value: unknown): LocalAuthoredEdge[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const edges: LocalAuthoredEdge[] = [];
  for (const edge of value) {
    const note = isRecord(edge) ? edge["note"] : undefined;
    if (
      !isRecord(edge) ||
      !hasLocalIdFormat(edge["id"], "local-edge") ||
      !isPatternEdgeType(edge["edgeType"]) ||
      typeof edge["sourceId"] !== "string" ||
      typeof edge["targetId"] !== "string" ||
      (note !== null && typeof note !== "string") ||
      typeof edge["createdAt"] !== "string" ||
      edge["sourceId"].trim() === "" ||
      edge["targetId"].trim() === "" ||
      edge["sourceId"] === edge["targetId"]
    ) {
      continue;
    }

    edges.push({
      id: edge["id"],
      edgeType: edge["edgeType"],
      sourceId: edge["sourceId"],
      targetId: edge["targetId"],
      note,
      createdAt: edge["createdAt"],
      ...readImportBatchId(edge),
    });
  }
  return edges;
}

function parseDebateTurns(value: unknown): DebateLocalTurn[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const turns: DebateLocalTurn[] = [];
  for (const turn of value) {
    if (
      !isRecord(turn) ||
      typeof turn["id"] !== "string" ||
      !isPatternActorId(turn["actorId"]) ||
      !isDebateRole(turn["role"]) ||
      typeof turn["content"] !== "string" ||
      !isDebateStance(turn["stance"]) ||
      !isDebateLocalPhase(turn["phaseKey"]) ||
      typeof turn["turnIndex"] !== "number" ||
      !Number.isInteger(turn["turnIndex"])
    ) {
      return null;
    }

    const referencedIds = turn["referencedIds"];
    if (referencedIds !== undefined && !isStringArray(referencedIds)) {
      return null;
    }

    turns.push({
      id: turn["id"],
      actorId: turn["actorId"],
      role: turn["role"],
      content: turn["content"],
      stance: turn["stance"],
      phaseKey: turn["phaseKey"],
      turnIndex: turn["turnIndex"],
      ...(referencedIds === undefined ? {} : { referencedIds }),
    });
  }
  return turns;
}

function parseOverlay(value: unknown): PatternRoomLocalOverlay | null {
  if (!isRecord(value)) {
    return null;
  }

  const sourcePinnedLayerById = parseLayerRecord(value["sourcePinnedLayerById"]);
  const debateLocalTurns = parseDebateTurns(value["debateLocalTurns"]);
  const debateRolesConnected = parseRoleConnections(value["debateRolesConnected"]);
  const localNotes = parseLocalNotes(value["localNotes"]);
  const localAuthoredNodes = parseLocalAuthoredNodes(value["localAuthoredNodes"]);
  const localAuthoredSources = parseLocalAuthoredSources(value["localAuthoredSources"]);
  const localAuthoredEvidence = parseLocalAuthoredEvidence(value["localAuthoredEvidence"]);
  const localEvidenceCandidates = parseLocalEvidenceCandidates(value["localEvidenceCandidates"]);
  const localAuthoredEdges = parseLocalAuthoredEdges(value["localAuthoredEdges"]);
  const caseLabel =
    typeof value["caseLabel"] === "string" && value["caseLabel"].trim() !== ""
      ? value["caseLabel"].trim()
      : undefined;
  const researchQuestion =
    typeof value["researchQuestion"] === "string" ? value["researchQuestion"].trim() : undefined;

  if (
    !isStringArray(value["deskNodeIds"]) ||
    !isStringArray(value["pinnedSourceIds"]) ||
    sourcePinnedLayerById === null ||
    !isStringArray(value["debateReferenceIds"]) ||
    !isDebateLocalPhase(value["debatePhase"]) ||
    debateLocalTurns === null ||
    debateRolesConnected === null ||
    (value["debateLocalVerdict"] !== null && typeof value["debateLocalVerdict"] !== "string") ||
    localNotes === null
  ) {
    return null;
  }

  return {
    ...(caseLabel === undefined ? {} : { caseLabel }),
    ...(researchQuestion === undefined ? {} : { researchQuestion }),
    deskNodeIds: value["deskNodeIds"],
    pinnedSourceIds: value["pinnedSourceIds"],
    sourcePinnedLayerById,
    debateReferenceIds: value["debateReferenceIds"],
    debatePhase: value["debatePhase"],
    debateLocalTurns,
    debateRolesConnected,
    debateLocalVerdict: value["debateLocalVerdict"],
    localNotes,
    localAuthoredNodes,
    localAuthoredSources,
    localAuthoredEvidence,
    localEvidenceCandidates,
    localAuthoredEdges,
  };
}

function parsePresentation(value: unknown): PatternRoomPresentationState | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value) || !isPatternCanvasMode(value["canvasMode"])) {
    return null;
  }

  const selectedBoardItemId = value["selectedBoardItemId"];
  const selectedConnectionId = value["selectedConnectionId"];
  if (
    (selectedBoardItemId !== null && typeof selectedBoardItemId !== "string") ||
    (selectedConnectionId !== null && typeof selectedConnectionId !== "string")
  ) {
    return null;
  }

  return {
    canvasMode: value["canvasMode"],
    selectedBoardItemId:
      selectedBoardItemId === null || selectedBoardItemId.trim() === ""
        ? null
        : selectedBoardItemId.trim(),
    selectedConnectionId:
      selectedConnectionId === null || selectedConnectionId.trim() === ""
        ? null
        : selectedConnectionId.trim(),
  };
}

function parseGuards(value: unknown): PatternRoomLocalGuards | null {
  if (
    !isRecord(value) ||
    typeof value["debateReportReflected"] !== "boolean" ||
    typeof value["noteIndex"] !== "number" ||
    !Number.isFinite(value["noteIndex"])
  ) {
    return null;
  }

  return {
    debateReportReflected: value["debateReportReflected"],
    noteIndex: value["noteIndex"],
  };
}

export function parsePatternRoomSessionSnapshot(value: unknown): PatternRoomSessionSnapshot | null {
  if (
    !isRecord(value) ||
    typeof value["snapshotId"] !== "string" ||
    value["roomId"] !== "pattern-room" ||
    typeof value["topicId"] !== "string" ||
    value["schemaVersion"] !== PATTERN_ROOM_SNAPSHOT_VERSION ||
    typeof value["createdAt"] !== "string" ||
    typeof value["updatedAt"] !== "string" ||
    !isPatternViewId(value["activeView"])
  ) {
    return null;
  }

  const overlay = parseOverlay(value["overlay"]);
  const presentation = parsePresentation(value["presentation"]);
  const guards = parseGuards(value["guards"]);
  if (overlay === null || presentation === null || guards === null) {
    return null;
  }

  return {
    snapshotId: value["snapshotId"],
    roomId: "pattern-room",
    topicId: value["topicId"],
    schemaVersion: PATTERN_ROOM_SNAPSHOT_VERSION,
    createdAt: value["createdAt"],
    updatedAt: value["updatedAt"],
    overlay,
    activeView: value["activeView"],
    ...(presentation === undefined ? {} : { presentation }),
    guards,
  };
}

function filterUniqueIds(
  ids: readonly string[],
  canRestoreId: (candidateId: string) => boolean
): string[] {
  const seenIds = new Set<string>();
  const restoredIds: string[] = [];

  ids.forEach((candidateId) => {
    if (seenIds.has(candidateId) || !canRestoreId(candidateId)) {
      return;
    }
    seenIds.add(candidateId);
    restoredIds.push(candidateId);
  });

  return restoredIds;
}

function filterUniqueRecordsById<T extends { id: string }>(records: readonly T[]): T[] {
  const seenIds = new Set<string>();
  const restoredRecords: T[] = [];

  records.forEach((record) => {
    if (seenIds.has(record.id)) {
      return;
    }
    seenIds.add(record.id);
    restoredRecords.push({ ...record });
  });

  return restoredRecords;
}

function cloneTurnWithFilteredReferences(
  turn: DebateLocalTurn,
  canRestoreEntityId: (candidateId: string) => boolean
): DebateLocalTurn {
  if (turn.referencedIds === undefined) {
    return { ...turn };
  }

  return {
    ...turn,
    referencedIds: filterUniqueIds(turn.referencedIds, canRestoreEntityId),
  };
}

function healDebatePhase(
  phase: DebateLocalPhase,
  turns: readonly DebateLocalTurn[],
  referenceIds: readonly string[]
): DebateLocalPhase {
  if (turns.length === 0 && TURN_PHASES_WITH_LOCAL_TURNS.has(phase)) {
    return referenceIds.length > 0 ? "preparation" : "idle";
  }

  return phase;
}

function healRoleConnections(
  phase: DebateLocalPhase,
  _roleConnections: Readonly<Record<string, boolean>>
): Record<string, boolean> {
  const shouldBeConnected = CONNECTED_ROLE_PHASES.has(phase);
  const healedConnections: Record<string, boolean> = {};

  ROLE_CONNECTION_IDS.forEach((roleId) => {
    healedConnections[roleId] = shouldBeConnected;
  });

  return healedConnections;
}

function healGuards(
  guards: PatternRoomLocalGuards,
  overlay: PatternRoomLocalOverlay
): PatternRoomLocalGuards {
  const guardNoteIndex = Number.isFinite(guards.noteIndex) ? guards.noteIndex : 0;
  return {
    debateReportReflected: guards.debateReportReflected,
    noteIndex: Math.max(0, guardNoteIndex, getMaxLocalIdIndex(overlay.localNotes, "local-note")),
  };
}

function restoreOverlaySnapshot(
  snapshotOverlay: PatternRoomLocalOverlay,
  domainMock: PatternRoomLocalDomainReference
): PatternRoomLocalOverlay {
  const nodeIds = new Set(
    domainMock.nodes.map((node) => {
      return node.id;
    })
  );
  const sourceIds = new Set(
    domainMock.sources.map((source) => {
      return source.id;
    })
  );
  const hasNode = (candidateId: string): boolean => nodeIds.has(candidateId);
  const hasSource = (candidateId: string): boolean => sourceIds.has(candidateId);
  const localAuthoredNodes = filterUniqueRecordsById(snapshotOverlay.localAuthoredNodes);
  const localAuthoredSources = filterUniqueRecordsById(snapshotOverlay.localAuthoredSources);
  const localAuthoredEvidence = filterUniqueRecordsById(snapshotOverlay.localAuthoredEvidence);
  const localEvidenceCandidates = filterUniqueRecordsById(
    snapshotOverlay.localEvidenceCandidates ?? []
  );
  const localNodeIds = new Set(
    localAuthoredNodes.map((node) => {
      return node.id;
    })
  );
  const localSourceIds = new Set(
    localAuthoredSources.map((source) => {
      return source.id;
    })
  );
  const localEvidenceIds = new Set(
    localAuthoredEvidence.map((evidence) => {
      return evidence.id;
    })
  );
  const hasEntity = (candidateId: string): boolean =>
    hasNode(candidateId) ||
    hasSource(candidateId) ||
    localNodeIds.has(candidateId) ||
    localSourceIds.has(candidateId) ||
    localEvidenceIds.has(candidateId);
  const localAuthoredEdges = filterUniqueRecordsById(snapshotOverlay.localAuthoredEdges).filter(
    (edge) => {
      return (
        edge.sourceId !== edge.targetId && hasEntity(edge.sourceId) && hasEntity(edge.targetId)
      );
    }
  );
  const pinnedSourceIds = filterUniqueIds(snapshotOverlay.pinnedSourceIds, hasSource);
  const sourcePinnedLayerById: Record<string, PatternLayer> = {};

  pinnedSourceIds.forEach((sourceId) => {
    const layer = snapshotOverlay.sourcePinnedLayerById[sourceId];
    if (isPatternLayer(layer)) {
      sourcePinnedLayerById[sourceId] = layer;
    }
  });

  const debateReferenceIds = filterUniqueIds(snapshotOverlay.debateReferenceIds, hasEntity);
  const debateLocalTurns = snapshotOverlay.debateLocalTurns.map((turn) => {
    return cloneTurnWithFilteredReferences(turn, hasEntity);
  });
  const debatePhase = healDebatePhase(
    snapshotOverlay.debatePhase,
    debateLocalTurns,
    debateReferenceIds
  );

  return {
    ...(snapshotOverlay.caseLabel === undefined
      ? {}
      : {
          caseLabel:
            snapshotOverlay.caseLabel.trim() || domainMock.topic.label?.trim() || "Yeni Araştırma",
        }),
    ...(snapshotOverlay.researchQuestion === undefined
      ? {}
      : { researchQuestion: snapshotOverlay.researchQuestion.trim() }),
    deskNodeIds: filterUniqueIds(snapshotOverlay.deskNodeIds, hasNode),
    pinnedSourceIds,
    sourcePinnedLayerById,
    debateReferenceIds,
    debatePhase,
    debateLocalTurns,
    debateRolesConnected: healRoleConnections(debatePhase, snapshotOverlay.debateRolesConnected),
    debateLocalVerdict: debateLocalTurns.length > 0 ? snapshotOverlay.debateLocalVerdict : null,
    localNotes: cloneNotes(snapshotOverlay.localNotes),
    localAuthoredNodes,
    localAuthoredSources,
    localAuthoredEvidence,
    localEvidenceCandidates,
    localAuthoredEdges,
  };
}

export function createSnapshot(
  localState: PatternRoomLocalState,
  activeView: PatternViewId,
  presentation?: PatternRoomPresentationState
): PatternRoomSessionSnapshot {
  const createdAt = new Date().toISOString();
  const topicId = localState.getTopicId();

  return {
    snapshotId: createSnapshotId(topicId, createdAt),
    roomId: "pattern-room",
    topicId,
    schemaVersion: PATTERN_ROOM_SNAPSHOT_VERSION,
    createdAt,
    updatedAt: createdAt,
    overlay: localState.getOverlay(),
    activeView,
    ...(presentation === undefined ? {} : { presentation: { ...presentation } }),
    guards: localState.getGuards(),
  };
}

export function restoreFromSnapshot(
  snapshot: unknown,
  domainMock: PatternRoomLocalDomainReference
): PatternRoomSnapshotRestoreResult | null {
  const parsedSnapshot = parsePatternRoomSessionSnapshot(snapshot);
  if (parsedSnapshot === null) {
    return null;
  }

  if (parsedSnapshot.topicId !== domainMock.topic.id) {
    return null;
  }

  const overlay = restoreOverlaySnapshot(parsedSnapshot.overlay, domainMock);

  return {
    overlay,
    activeView: parsedSnapshot.activeView,
    ...(parsedSnapshot.presentation === undefined
      ? {}
      : { presentation: { ...parsedSnapshot.presentation } }),
    guards: healGuards(parsedSnapshot.guards, overlay),
  };
}
