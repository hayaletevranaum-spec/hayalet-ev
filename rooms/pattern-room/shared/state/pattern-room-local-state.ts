import { createPatternRoomDebateDummyTurn } from "../data/pattern-room-debate-dummy-turns.js";
import type {
  DebateRole,
  DebateTurn,
  PatternActorId,
  PatternEdgeType,
  PatternLayer,
  PatternNode,
  SourceItem,
  Topic,
} from "../types/pattern-room-domain.js";
import type {
  PatternRoomEvidenceCandidate,
  PatternRoomEvidenceCandidatePromotionInput,
  PatternRoomEvidenceCandidatePromotionResult,
} from "../types/pattern-room-evidence-candidate.js";
import type {
  SourceImportEvidenceDraft,
  SourceImportResult,
} from "../source-workbench/types/source-package.js";

export type LocalNote = {
  id: string;
  text: string;
  createdAt: string;
  importBatchId?: string | null;
};

export type LocalAuthoredNode = {
  id: string;
  nodeType: "claim" | "inspiration" | "uncertainty";
  label: string;
  content: string;
  createdAt: string;
  importBatchId?: string | null;
};

export type LocalAuthoredSource = {
  id: string;
  label: string;
  origin: string;
  note: string;
  createdAt: string;
  segments?: readonly LocalAuthoredSourceSegment[];
  importBatchId?: string | null;
};

export type LocalAuthoredSourceSegment = {
  id: string;
  label: string;
  text: string;
  order: number;
};

export type LocalAuthoredEvidence = {
  id: string;
  label: string;
  excerpt: string;
  interpretation: string | null;
  layer: PatternLayer;
  createdAt: string;
  sourceId?: string | null;
  sourceLabel?: string | null;
  importBatchId?: string | null;
};

export type LocalAuthoredEvidenceOptions = {
  sourceId?: string | null;
  sourceLabel?: string | null;
};

export type LocalAuthoredEdge = {
  id: string;
  edgeType: PatternEdgeType;
  sourceId: string;
  targetId: string;
  note: string | null;
  createdAt: string;
  importBatchId?: string | null;
};

export type SourceImportApplyOptions = {
  importBatchId?: string;
};

export type SourceImportApplySummary = {
  sourcesAdded: number;
  evidenceAdded: number;
  nodesAdded: number;
  edgesAdded: number;
  notesAdded: number;
  edgesDropped: number;
  duplicatesSkipped: number;
  warnings: readonly string[];
};

export type CleanupSummary = {
  sourcesRemoved: number;
  evidenceRemoved: number;
  nodesRemoved: number;
  edgesRemoved: number;
  notesRemoved: number;
  pinsRemoved: number;
  refsRemoved: number;
  turnRefsRemoved: number;
  batchesRemoved: number;
  resetPerformed: boolean;
  warnings: readonly string[];
};

export type DebateLocalPhase =
  | "idle"
  | "preparation"
  | "role_assignment"
  | "opening"
  | "counter_argument"
  | "evidence_review"
  | "weak_point"
  | "judge_mapping"
  | "completed";

export type DebateLocalTurn = {
  id: string;
  actorId: PatternActorId;
  role: DebateRole["role"];
  content: string;
  stance: DebateTurn["stance"];
  phaseKey: DebateLocalPhase;
  turnIndex: number;
  referencedIds?: readonly string[];
};

export type PatternRoomLocalOverlay = {
  caseLabel?: string;
  researchQuestion?: string;
  deskNodeIds: readonly string[];
  pinnedSourceIds: readonly string[];
  sourcePinnedLayerById: Readonly<Record<string, PatternLayer>>;
  debateReferenceIds: readonly string[];
  debatePhase: DebateLocalPhase;
  debateLocalTurns: readonly DebateLocalTurn[];
  debateRolesConnected: Readonly<Record<string, boolean>>;
  debateLocalVerdict: string | null;
  localNotes: readonly LocalNote[];
  localAuthoredNodes: readonly LocalAuthoredNode[];
  localAuthoredSources: readonly LocalAuthoredSource[];
  localAuthoredEvidence: readonly LocalAuthoredEvidence[];
  localEvidenceCandidates?: readonly PatternRoomEvidenceCandidate[];
  localAuthoredEdges: readonly LocalAuthoredEdge[];
};

export type PatternRoomLocalGuards = {
  debateReportReflected: boolean;
  noteIndex: number;
};

export type PatternRoomLocalDomainReference = {
  readonly topic: Pick<Topic, "id"> & Partial<Pick<Topic, "label" | "description">>;
  readonly nodes: readonly PatternNode[];
  readonly sources: readonly SourceItem[];
};

export type PatternRoomLocalState = {
  getTopicId: () => string;
  updateCaseIdentity: (caseLabel: string, researchQuestion: string) => boolean;
  sendToDesk: (nodeId: string) => void;
  pinSource: (sourceId: string, layer: PatternLayer) => void;
  addToDebate: (entityId: string) => void;
  addLocalNote: (text: string) => void;
  addAuthoredClaim: (label: string, content: string) => void;
  addAuthoredInspiration: (label: string, content: string) => void;
  addAuthoredUncertainty: (label: string, content: string) => void;
  addAuthoredSource: (label: string, origin: string, note: string) => void;
  addAuthoredEvidence: (
    label: string,
    excerpt: string,
    interpretation?: string,
    layer?: PatternLayer,
    options?: LocalAuthoredEvidenceOptions
  ) => void;
  addEvidenceCandidate: (
    suggestionId: string,
    text: string,
    reviewSessionId?: string | null
  ) => boolean;
  promoteEvidenceCandidate: (
    input: PatternRoomEvidenceCandidatePromotionInput
  ) => PatternRoomEvidenceCandidatePromotionResult;
  removeEvidenceCandidate: (candidateId: string) => boolean;
  addAuthoredEdge: (
    edgeType: PatternEdgeType,
    sourceId: string,
    targetId: string,
    note?: string
  ) => void;
  updateLocalEdge: (edgeId: string, edgeType: PatternEdgeType, note?: string) => boolean;
  applySourceImportResult: (
    result: SourceImportResult,
    options?: SourceImportApplyOptions
  ) => SourceImportApplySummary;
  resetOverlayToEmpty: () => CleanupSummary;
  removeLocalSource: (sourceId: string) => CleanupSummary;
  removeLocalNode: (nodeId: string) => CleanupSummary;
  removeLocalEvidence: (evidenceId: string) => CleanupSummary;
  removeLocalEdge: (edgeId: string) => CleanupSummary;
  removeLocalNote: (noteId: string) => CleanupSummary;
  removeImportBatch: (batchId: string) => CleanupSummary;
  resolveEntityExists: (id: string) => boolean;
  resolveEntityLabel: (id: string) => string | null;
  prepareDebate: () => void;
  assignDebateRoles: () => void;
  startDebate: () => void;
  advanceDebatePhase: () => void;
  completeDebate: () => void;
  reflectDebateToReport: () => void;
  getOverlay: () => PatternRoomLocalOverlay;
  getGuards: () => PatternRoomLocalGuards;
  restoreOverlay: (overlay: PatternRoomLocalOverlay, guards: PatternRoomLocalGuards) => void;
  subscribe: (listener: () => void) => () => void;
};

const ROLE_CONNECTION_IDS = ["AI0", "AI1", "AI2", "US1"] as const;

const PATTERN_EDGE_TYPES: readonly PatternEdgeType[] = [
  "supports",
  "contradicts",
  "references",
  "derived_from",
  "inspired_by",
  "questions",
  "needs_review",
];

const NEXT_DEBATE_TURN_PHASE: Partial<Record<DebateLocalPhase, DebateLocalPhase>> = {
  opening: "counter_argument",
  counter_argument: "evidence_review",
  evidence_review: "weak_point",
  weak_point: "judge_mapping",
};

function appendUnique(values: string[], value: string): boolean {
  if (values.includes(value)) {
    return false;
  }
  values.push(value);
  return true;
}

function cloneNotes(notes: readonly LocalNote[]): LocalNote[] {
  return notes.map((note) => {
    return { ...note };
  });
}

function cloneAuthoredNodes(nodes: readonly LocalAuthoredNode[]): LocalAuthoredNode[] {
  return nodes.map((node) => {
    return { ...node };
  });
}

function cloneAuthoredSourceSegments(
  segments: readonly LocalAuthoredSourceSegment[] | undefined
): LocalAuthoredSourceSegment[] | undefined {
  if (segments === undefined) {
    return undefined;
  }

  return segments.map((segment) => {
    return { ...segment };
  });
}

function cloneAuthoredSources(sources: readonly LocalAuthoredSource[]): LocalAuthoredSource[] {
  return sources.map((source) => {
    const segments = cloneAuthoredSourceSegments(source.segments);
    return {
      ...source,
      ...(segments === undefined ? {} : { segments }),
    };
  });
}

function cloneAuthoredEvidence(
  evidenceItems: readonly LocalAuthoredEvidence[]
): LocalAuthoredEvidence[] {
  return evidenceItems.map((evidence) => {
    return { ...evidence };
  });
}

function cloneEvidenceCandidates(
  candidates: readonly PatternRoomEvidenceCandidate[]
): PatternRoomEvidenceCandidate[] {
  return candidates.map((candidate) => {
    return { ...candidate };
  });
}

function cloneAuthoredEdges(edges: readonly LocalAuthoredEdge[]): LocalAuthoredEdge[] {
  return edges.map((edge) => {
    return { ...edge };
  });
}

function cloneTurns(turns: readonly DebateLocalTurn[]): DebateLocalTurn[] {
  return turns.map((turn) => {
    return turn.referencedIds === undefined
      ? { ...turn }
      : { ...turn, referencedIds: [...turn.referencedIds] };
  });
}

function createLocalId(prefix: string, index: number): string {
  return `${prefix}-${String(index).padStart(3, "0")}`;
}

function getLocalIdIndex(id: string, prefix: string): number {
  const match = new RegExp(`^${prefix}-(\\d{3,})$`).exec(id);
  if (match === null) {
    return 0;
  }
  return Number.parseInt(match[1] ?? "0", 10);
}

function createEmptyCleanupSummary(): CleanupSummary {
  return {
    sourcesRemoved: 0,
    evidenceRemoved: 0,
    nodesRemoved: 0,
    edgesRemoved: 0,
    notesRemoved: 0,
    pinsRemoved: 0,
    refsRemoved: 0,
    turnRefsRemoved: 0,
    batchesRemoved: 0,
    resetPerformed: false,
    warnings: [],
  };
}

function getMaxLocalIdIndex(values: readonly { id: string }[], prefix: string): number {
  return values.reduce((maxIndex, value) => {
    return Math.max(maxIndex, getLocalIdIndex(value.id, prefix));
  }, 0);
}

function isPatternEdgeType(value: string): value is PatternEdgeType {
  return PATTERN_EDGE_TYPES.includes(value as PatternEdgeType);
}

function createDuplicateKey(...parts: readonly string[]): string {
  return parts
    .map((part) => {
      return part.trim().toLocaleLowerCase();
    })
    .join("\n");
}

function normalizeLocalSourceSegments(
  segments: readonly LocalAuthoredSourceSegment[] | undefined
): LocalAuthoredSourceSegment[] {
  if (segments === undefined) {
    return [];
  }

  return segments.flatMap((segment, index) => {
    const id = segment.id.trim();
    const label = segment.label.trim();
    const text = segment.text.trim();
    if (id === "" || label === "" || text === "") {
      return [];
    }

    return [
      {
        id,
        label,
        text,
        order: Number.isFinite(segment.order) ? segment.order : index,
      },
    ];
  });
}

function readOptionalImportText(value: string | null): string | null {
  const trimmedValue = value?.trim() ?? "";
  return trimmedValue === "" ? null : trimmedValue;
}

function readImportBatchId(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim() ?? "";
  return trimmedValue === "" ? undefined : trimmedValue;
}

function createEvidenceInterpretation(draft: SourceImportEvidenceDraft): string | null {
  const interpretation = readOptionalImportText(draft.interpretation);
  const contextParts = [
    readOptionalImportText(draft.timecode) === null
      ? null
      : `Zaman: ${readOptionalImportText(draft.timecode)}`,
    readOptionalImportText(draft.page) === null
      ? null
      : `Sayfa: ${readOptionalImportText(draft.page)}`,
    readOptionalImportText(draft.speaker) === null
      ? null
      : `Konuşmacı: ${readOptionalImportText(draft.speaker)}`,
    readOptionalImportText(draft.context) === null
      ? null
      : `Bağlam: ${readOptionalImportText(draft.context)}`,
  ].flatMap((part) => {
    return part === null ? [] : [part];
  });

  if (contextParts.length === 0) {
    return interpretation;
  }

  const contextSummary = `Kaynak bağlamı: ${contextParts.join(" · ")}`;
  return interpretation === null ? contextSummary : `${interpretation}\n\n${contextSummary}`;
}

export function createLocalState(
  domainMock: PatternRoomLocalDomainReference
): PatternRoomLocalState {
  const domainRef = domainMock;
  const defaultCaseLabel = domainRef.topic.label?.trim() || "Yeni Araştırma";
  const defaultResearchQuestion = domainRef.topic.description?.trim() || "";
  let caseLabel = defaultCaseLabel;
  let researchQuestion = defaultResearchQuestion;
  const deskNodeIds: string[] = [];
  const pinnedSourceIds: string[] = [];
  const sourcePinnedLayerById: Record<string, PatternLayer> = {};
  const debateReferenceIds: string[] = [];
  const debateLocalTurns: DebateLocalTurn[] = [];
  const debateRolesConnected: Record<string, boolean> = {};
  const localNotes: LocalNote[] = [];
  const localAuthoredNodes: LocalAuthoredNode[] = [];
  const localAuthoredSources: LocalAuthoredSource[] = [];
  const localAuthoredEvidence: LocalAuthoredEvidence[] = [];
  const localEvidenceCandidates: PatternRoomEvidenceCandidate[] = [];
  const localAuthoredEdges: LocalAuthoredEdge[] = [];
  const listeners = new Set<() => void>();
  let debatePhase: DebateLocalPhase = "idle";
  let debateLocalVerdict: string | null = null;
  let debateReportReflected = false;
  let noteIndex = 0;
  let authoredNodeIndex = 0;
  let authoredSourceIndex = 0;
  let authoredEvidenceIndex = 0;
  let evidenceCandidateIndex = 0;
  let authoredEdgeIndex = 0;

  ROLE_CONNECTION_IDS.forEach((roleId) => {
    debateRolesConnected[roleId] = false;
  });

  function hasNode(nodeId: string): boolean {
    return domainRef.nodes.some((node) => node.id === nodeId);
  }

  function hasSource(sourceId: string): boolean {
    return domainRef.sources.some((source) => source.id === sourceId);
  }

  function hasLocalAuthoredNode(nodeId: string): boolean {
    return localAuthoredNodes.some((node) => node.id === nodeId);
  }

  function hasLocalAuthoredSource(sourceId: string): boolean {
    return localAuthoredSources.some((source) => source.id === sourceId);
  }

  function hasLocalAuthoredEvidence(evidenceId: string): boolean {
    return localAuthoredEvidence.some((evidence) => evidence.id === evidenceId);
  }

  function hasSourceEntity(sourceId: string): boolean {
    return hasSource(sourceId) || hasLocalAuthoredSource(sourceId);
  }

  function resolveSourceLabel(sourceId: string): string | null {
    const domainSource = domainRef.sources.find((source) => source.id === sourceId);
    if (domainSource !== undefined) {
      return domainSource.label;
    }
    return localAuthoredSources.find((source) => source.id === sourceId)?.label ?? null;
  }

  function resolveEntityExists(id: string): boolean {
    return (
      hasNode(id) ||
      hasSource(id) ||
      hasLocalAuthoredNode(id) ||
      hasLocalAuthoredSource(id) ||
      hasLocalAuthoredEvidence(id)
    );
  }

  function resolveEntityLabel(id: string): string | null {
    const domainNode = domainRef.nodes.find((node) => node.id === id);
    if (domainNode !== undefined) {
      return domainNode.label;
    }

    const domainSource = domainRef.sources.find((source) => source.id === id);
    if (domainSource !== undefined) {
      return domainSource.label;
    }

    const localNode = localAuthoredNodes.find((node) => node.id === id);
    if (localNode !== undefined) {
      return localNode.label;
    }

    const localSource = localAuthoredSources.find((source) => source.id === id);
    if (localSource !== undefined) {
      return localSource.label;
    }

    const localEvidence = localAuthoredEvidence.find((evidence) => evidence.id === id);
    return localEvidence?.label ?? null;
  }

  function hasDebateReference(entityId: string): boolean {
    return resolveEntityExists(entityId);
  }

  function notify(): void {
    listeners.forEach((listener) => {
      listener();
    });
  }

  function addLocalNoteRecord(
    text: string,
    createdAt = new Date().toISOString(),
    importBatchId?: string
  ): string | null {
    const trimmedText = text.trim();
    if (trimmedText === "") {
      return null;
    }
    noteIndex += 1;
    const id = createLocalId("local-note", noteIndex);
    localNotes.push({
      id,
      text: trimmedText,
      createdAt,
      ...(importBatchId === undefined ? {} : { importBatchId }),
    });
    return id;
  }

  function addAuthoredNodeRecord(
    nodeType: LocalAuthoredNode["nodeType"],
    label: string,
    content: string,
    createdAt = new Date().toISOString(),
    importBatchId?: string
  ): string | null {
    const trimmedLabel = label.trim();
    const trimmedContent = content.trim();
    if (trimmedLabel === "" || trimmedContent === "") {
      return null;
    }

    authoredNodeIndex += 1;
    const id = createLocalId("local-node", authoredNodeIndex);
    localAuthoredNodes.push({
      id,
      nodeType,
      label: trimmedLabel,
      content: trimmedContent,
      createdAt,
      ...(importBatchId === undefined ? {} : { importBatchId }),
    });
    return id;
  }

  function addAuthoredSourceRecord(
    label: string,
    origin: string,
    note: string,
    createdAt = new Date().toISOString(),
    importBatchId?: string,
    segments?: readonly LocalAuthoredSourceSegment[]
  ): string | null {
    const trimmedLabel = label.trim();
    const trimmedOrigin = origin.trim();
    const trimmedNote = note.trim();
    const localSegments = normalizeLocalSourceSegments(segments);
    if (trimmedLabel === "" || trimmedOrigin === "") {
      return null;
    }

    authoredSourceIndex += 1;
    const id = createLocalId("local-source", authoredSourceIndex);
    localAuthoredSources.push({
      id,
      label: trimmedLabel,
      origin: trimmedOrigin,
      note: trimmedNote,
      createdAt,
      ...(localSegments.length === 0 ? {} : { segments: localSegments }),
      ...(importBatchId === undefined ? {} : { importBatchId }),
    });
    return id;
  }

  function addAuthoredEvidenceRecord(
    label: string,
    excerpt: string,
    interpretation?: string,
    layer?: PatternLayer,
    createdAt = new Date().toISOString(),
    importBatchId?: string,
    options?: LocalAuthoredEvidenceOptions
  ): string | null {
    const trimmedLabel = label.trim();
    const trimmedExcerpt = excerpt.trim();
    const trimmedInterpretation = interpretation?.trim() ?? "";
    const trimmedSourceId = options?.sourceId?.trim() ?? "";
    const trimmedSourceLabel = options?.sourceLabel?.trim() ?? "";
    if (trimmedLabel === "" || trimmedExcerpt === "") {
      return null;
    }

    authoredEvidenceIndex += 1;
    const id = createLocalId("local-evidence", authoredEvidenceIndex);
    localAuthoredEvidence.push({
      id,
      label: trimmedLabel,
      excerpt: trimmedExcerpt,
      interpretation: trimmedInterpretation === "" ? null : trimmedInterpretation,
      layer: layer ?? "evidence",
      createdAt,
      ...(trimmedSourceId === "" ? {} : { sourceId: trimmedSourceId }),
      ...(trimmedSourceLabel === "" ? {} : { sourceLabel: trimmedSourceLabel }),
      ...(importBatchId === undefined ? {} : { importBatchId }),
    });
    return id;
  }

  function addEvidenceCandidateRecord(
    suggestionId: string,
    text: string,
    reviewSessionId?: string | null,
    createdAt = new Date().toISOString()
  ): string | null {
    const trimmedSuggestionId = suggestionId.trim();
    const trimmedText = text.trim();
    const normalizedSessionId = reviewSessionId?.trim() ?? "";
    if (trimmedSuggestionId === "" || trimmedText === "") {
      return null;
    }

    const duplicate = localEvidenceCandidates.some((candidate) => {
      return (
        candidate.suggestionId === trimmedSuggestionId &&
        (candidate.reviewSessionId ?? "") === normalizedSessionId
      );
    });
    if (duplicate) {
      return null;
    }

    evidenceCandidateIndex += 1;
    const id = createLocalId("local-evidence-candidate", evidenceCandidateIndex);
    localEvidenceCandidates.push({
      id,
      suggestionId: trimmedSuggestionId,
      text: trimmedText,
      reviewSessionId: normalizedSessionId === "" ? null : normalizedSessionId,
      origin: "ai-case-review",
      sourceSection: "evidence",
      status: "candidate",
      createdAt,
    });
    return id;
  }

  function createPromotionFailure(
    candidateId: string,
    warning: string
  ): PatternRoomEvidenceCandidatePromotionResult {
    return {
      candidateId,
      promoted: false,
      evidenceId: null,
      warnings: [warning],
    };
  }

  function promoteEvidenceCandidate(
    input: PatternRoomEvidenceCandidatePromotionInput
  ): PatternRoomEvidenceCandidatePromotionResult {
    const candidateId = input.candidateId.trim();
    const sourceId = input.sourceId.trim();
    const excerpt = input.excerpt.trim();
    const candidateIndex = localEvidenceCandidates.findIndex((candidate) => {
      return candidate.id === candidateId;
    });
    const candidate = localEvidenceCandidates[candidateIndex];
    if (candidateIndex < 0 || candidate === undefined) {
      return createPromotionFailure(candidateId, "Evidence candidate was not found.");
    }
    if (!hasSourceEntity(sourceId)) {
      return createPromotionFailure(
        candidateId,
        "Evidence promotion requires an existing source id."
      );
    }
    if (excerpt === "") {
      return createPromotionFailure(
        candidateId,
        "Evidence promotion requires a non-empty selected source excerpt."
      );
    }

    const sourceLabel = resolveSourceLabel(sourceId);
    if (sourceLabel === null) {
      return createPromotionFailure(candidateId, "Evidence source label could not be resolved.");
    }

    const label = input.label?.trim() || `AI Evidence Candidate ${candidate.id}`;
    const interpretation = input.interpretation?.trim() || candidate.text;
    const evidenceId = addAuthoredEvidenceRecord(
      label,
      excerpt,
      interpretation,
      input.layer ?? "evidence",
      new Date().toISOString(),
      undefined,
      { sourceId, sourceLabel }
    );
    if (evidenceId === null) {
      return createPromotionFailure(candidateId, "Evidence promotion could not create evidence.");
    }

    localEvidenceCandidates.splice(candidateIndex, 1);
    notify();
    return {
      candidateId,
      promoted: true,
      evidenceId,
      warnings: [],
    };
  }

  function removeEvidenceCandidate(candidateId: string): boolean {
    const trimmedCandidateId = candidateId.trim();
    const candidateIndex = localEvidenceCandidates.findIndex((candidate) => {
      return candidate.id === trimmedCandidateId;
    });
    if (candidateIndex < 0) {
      return false;
    }
    localEvidenceCandidates.splice(candidateIndex, 1);
    notify();
    return true;
  }

  function addAuthoredEdgeRecord(
    edgeType: PatternEdgeType,
    sourceId: string,
    targetId: string,
    note?: string,
    createdAt = new Date().toISOString(),
    importBatchId?: string
  ): string | null {
    const trimmedSourceId = sourceId.trim();
    const trimmedTargetId = targetId.trim();
    const trimmedNote = note?.trim() ?? "";
    if (
      trimmedSourceId === "" ||
      trimmedTargetId === "" ||
      trimmedSourceId === trimmedTargetId ||
      !isPatternEdgeType(edgeType) ||
      !resolveEntityExists(trimmedSourceId) ||
      !resolveEntityExists(trimmedTargetId)
    ) {
      return null;
    }

    authoredEdgeIndex += 1;
    const id = createLocalId("local-edge", authoredEdgeIndex);
    localAuthoredEdges.push({
      id,
      edgeType,
      sourceId: trimmedSourceId,
      targetId: trimmedTargetId,
      note: trimmedNote === "" ? null : trimmedNote,
      createdAt,
      ...(importBatchId === undefined ? {} : { importBatchId }),
    });
    return id;
  }

  function appendDebateTurn(phaseKey: DebateLocalPhase): void {
    debateLocalTurns.push(createPatternRoomDebateDummyTurn(phaseKey, debateLocalTurns.length));
  }

  function setRolesConnected(connected: boolean): void {
    ROLE_CONNECTION_IDS.forEach((roleId) => {
      debateRolesConnected[roleId] = connected;
    });
  }

  function clearSourcePinnedLayers(): void {
    Object.keys(sourcePinnedLayerById).forEach((sourceId) => {
      delete sourcePinnedLayerById[sourceId];
    });
  }

  function countPinnedReferences(sourceId: string): number {
    return pinnedSourceIds.includes(sourceId) || sourcePinnedLayerById[sourceId] !== undefined
      ? 1
      : 0;
  }

  function removePinnedSourceReference(sourceId: string): number {
    const pinsRemoved = countPinnedReferences(sourceId);
    const pinnedSourceIndex = pinnedSourceIds.indexOf(sourceId);
    if (pinnedSourceIndex >= 0) {
      pinnedSourceIds.splice(pinnedSourceIndex, 1);
    }
    delete sourcePinnedLayerById[sourceId];
    return pinsRemoved;
  }

  function removePinnedSourceReferences(sourceIds: ReadonlySet<string>): number {
    let pinsRemoved = 0;
    sourceIds.forEach((sourceId) => {
      pinsRemoved += removePinnedSourceReference(sourceId);
    });
    return pinsRemoved;
  }

  function removeDeskNodeReferences(nodeIds: ReadonlySet<string>): number {
    const initialLength = deskNodeIds.length;
    for (let index = deskNodeIds.length - 1; index >= 0; index -= 1) {
      const nodeId = deskNodeIds[index];
      if (nodeId !== undefined && nodeIds.has(nodeId)) {
        deskNodeIds.splice(index, 1);
      }
    }
    return initialLength - deskNodeIds.length;
  }

  function removeDebateReferences(entityIds: ReadonlySet<string>): number {
    const initialLength = debateReferenceIds.length;
    for (let index = debateReferenceIds.length - 1; index >= 0; index -= 1) {
      const referenceId = debateReferenceIds[index];
      if (referenceId !== undefined && entityIds.has(referenceId)) {
        debateReferenceIds.splice(index, 1);
      }
    }
    return initialLength - debateReferenceIds.length;
  }

  function removeDebateTurnReferences(entityIds: ReadonlySet<string>): number {
    let referencesRemoved = 0;
    debateLocalTurns.forEach((turn, index) => {
      if (turn.referencedIds === undefined) {
        return;
      }
      const referencedIds = turn.referencedIds.filter((referenceId) => {
        return !entityIds.has(referenceId);
      });
      const removedFromTurn = turn.referencedIds.length - referencedIds.length;
      if (removedFromTurn === 0) {
        return;
      }
      referencesRemoved += removedFromTurn;
      debateLocalTurns[index] = {
        ...turn,
        referencedIds,
      };
    });
    return referencesRemoved;
  }

  function removeLocalEdgesTouchingEntities(entityIds: ReadonlySet<string>): number {
    const initialLength = localAuthoredEdges.length;
    for (let index = localAuthoredEdges.length - 1; index >= 0; index -= 1) {
      const edge = localAuthoredEdges[index];
      if (edge !== undefined && (entityIds.has(edge.sourceId) || entityIds.has(edge.targetId))) {
        localAuthoredEdges.splice(index, 1);
      }
    }
    return initialLength - localAuthoredEdges.length;
  }

  function sweepOrphanLocalEdges(): number {
    const initialLength = localAuthoredEdges.length;
    for (let index = localAuthoredEdges.length - 1; index >= 0; index -= 1) {
      const edge = localAuthoredEdges[index];
      if (
        edge === undefined ||
        !resolveEntityExists(edge.sourceId) ||
        !resolveEntityExists(edge.targetId)
      ) {
        localAuthoredEdges.splice(index, 1);
      }
    }
    return initialLength - localAuthoredEdges.length;
  }

  function hasCleanupChanges(summary: CleanupSummary): boolean {
    return (
      summary.sourcesRemoved > 0 ||
      summary.evidenceRemoved > 0 ||
      summary.nodesRemoved > 0 ||
      summary.edgesRemoved > 0 ||
      summary.notesRemoved > 0 ||
      summary.pinsRemoved > 0 ||
      summary.refsRemoved > 0 ||
      summary.turnRefsRemoved > 0 ||
      summary.batchesRemoved > 0 ||
      summary.resetPerformed
    );
  }

  function createDebateVerdict(): string {
    const referenceCount = debateReferenceIds.length;
    const turnCount = debateLocalTurns.length;
    return `Local 10. Adam oturumu tamamlandı: ${referenceCount} referans üzerinden ${turnCount} dummy tur işlendi. Gerçek AI, provider veya relay çağrısı yapılmadı.`;
  }

  function createDebateReportSummary(): string {
    const turnSummary = debateLocalTurns
      .map((turn) => {
        return `${turn.actorId}: ${turn.content}`;
      })
      .join(" ");
    return `10. Adam local oturum özeti: ${debateLocalVerdict ?? createDebateVerdict()} ${turnSummary}`;
  }

  function applySourceImportResult(
    result: SourceImportResult,
    options: SourceImportApplyOptions = {}
  ): SourceImportApplySummary {
    const importedAt = new Date().toISOString();
    const importBatchId = readImportBatchId(options.importBatchId);
    const draftIdToLocalId = new Map<string, string>();
    const summary = {
      sourcesAdded: 0,
      evidenceAdded: 0,
      nodesAdded: 0,
      edgesAdded: 0,
      notesAdded: 0,
      edgesDropped: 0,
      duplicatesSkipped: 0,
      warnings: result.warnings.map((warning) => {
        return warning.message;
      }),
    };
    const sourceKeys = new Set(
      localAuthoredSources.map((source) => {
        return createDuplicateKey(source.label, source.origin);
      })
    );
    const evidenceKeys = new Set(
      localAuthoredEvidence.map((evidence) => {
        return createDuplicateKey(evidence.excerpt);
      })
    );
    const nodeKeys = new Set(
      localAuthoredNodes.map((node) => {
        return createDuplicateKey(node.label, node.content);
      })
    );

    result.sources.forEach((source) => {
      const sourceKey = createDuplicateKey(source.label, source.origin);
      if (sourceKeys.has(sourceKey)) {
        summary.duplicatesSkipped += 1;
        summary.warnings.push(`Duplicate source draft skipped: ${source.draftId}`);
        return;
      }

      const localId = addAuthoredSourceRecord(
        source.label,
        source.origin,
        source.note,
        importedAt,
        importBatchId,
        source.segments
      );
      if (localId === null) {
        summary.warnings.push(`Source draft skipped because it was incomplete: ${source.draftId}`);
        return;
      }

      sourceKeys.add(sourceKey);
      draftIdToLocalId.set(source.draftId, localId);
      summary.sourcesAdded += 1;
    });

    result.evidence.forEach((evidence) => {
      const evidenceKey = createDuplicateKey(evidence.excerpt);
      if (evidenceKeys.has(evidenceKey)) {
        summary.duplicatesSkipped += 1;
        summary.warnings.push(`Duplicate evidence draft skipped: ${evidence.draftId}`);
        return;
      }

      const localId = addAuthoredEvidenceRecord(
        evidence.label,
        evidence.excerpt,
        createEvidenceInterpretation(evidence) ?? undefined,
        "evidence",
        importedAt,
        importBatchId
      );
      if (localId === null) {
        summary.warnings.push(
          `Evidence draft skipped because it was incomplete: ${evidence.draftId}`
        );
        return;
      }

      evidenceKeys.add(evidenceKey);
      draftIdToLocalId.set(evidence.draftId, localId);
      summary.evidenceAdded += 1;
    });

    result.nodes.forEach((node) => {
      const nodeKey = createDuplicateKey(node.label, node.content);
      if (nodeKeys.has(nodeKey)) {
        summary.duplicatesSkipped += 1;
        summary.warnings.push(`Duplicate node draft skipped: ${node.draftId}`);
        return;
      }

      const localId = addAuthoredNodeRecord(
        node.nodeType,
        node.label,
        node.content,
        importedAt,
        importBatchId
      );
      if (localId === null) {
        summary.warnings.push(`Node draft skipped because it was incomplete: ${node.draftId}`);
        return;
      }

      nodeKeys.add(nodeKey);
      draftIdToLocalId.set(node.draftId, localId);
      summary.nodesAdded += 1;
    });

    result.notes.forEach((note) => {
      const localId = addLocalNoteRecord(note.text, importedAt, importBatchId);
      if (localId === null) {
        summary.warnings.push(`Note draft skipped because it was empty: ${note.draftId}`);
        return;
      }

      draftIdToLocalId.set(note.draftId, localId);
      summary.notesAdded += 1;
    });

    result.edges.forEach((edge) => {
      const sourceId = draftIdToLocalId.get(edge.sourceDraftId);
      const targetId = draftIdToLocalId.get(edge.targetDraftId);
      if (sourceId === undefined || targetId === undefined) {
        summary.edgesDropped += 1;
        summary.warnings.push(
          `Edge draft dropped because a draft endpoint was not imported: ${edge.draftId}`
        );
        return;
      }

      const localId = addAuthoredEdgeRecord(
        edge.edgeType,
        sourceId,
        targetId,
        edge.note ?? undefined,
        importedAt,
        importBatchId
      );
      if (localId === null) {
        summary.edgesDropped += 1;
        summary.warnings.push(
          `Edge draft dropped because the mapped endpoints were not valid local entities: ${edge.draftId}`
        );
        return;
      }

      draftIdToLocalId.set(edge.draftId, localId);
      summary.edgesAdded += 1;
    });

    if (
      summary.sourcesAdded > 0 ||
      summary.evidenceAdded > 0 ||
      summary.nodesAdded > 0 ||
      summary.edgesAdded > 0 ||
      summary.notesAdded > 0
    ) {
      notify();
    }

    return {
      ...summary,
      warnings: [...summary.warnings],
    };
  }

  function resetOverlayToEmpty(): CleanupSummary {
    const pinnedReferences = new Set([...pinnedSourceIds, ...Object.keys(sourcePinnedLayerById)]);
    const summary: CleanupSummary = {
      sourcesRemoved: localAuthoredSources.length,
      evidenceRemoved: localAuthoredEvidence.length,
      nodesRemoved: localAuthoredNodes.length,
      edgesRemoved: localAuthoredEdges.length,
      notesRemoved: localNotes.length,
      pinsRemoved: pinnedReferences.size,
      refsRemoved: debateReferenceIds.length,
      turnRefsRemoved: debateLocalTurns.reduce((count, turn) => {
        return count + (turn.referencedIds?.length ?? 0);
      }, 0),
      batchesRemoved: 0,
      resetPerformed: true,
      warnings: [],
    };

    deskNodeIds.length = 0;
    pinnedSourceIds.length = 0;
    clearSourcePinnedLayers();
    debateReferenceIds.length = 0;
    debatePhase = "idle";
    debateLocalTurns.length = 0;
    debateLocalVerdict = null;
    setRolesConnected(false);
    localNotes.length = 0;
    localAuthoredNodes.length = 0;
    localAuthoredSources.length = 0;
    localAuthoredEvidence.length = 0;
    localEvidenceCandidates.length = 0;
    localAuthoredEdges.length = 0;
    debateReportReflected = false;
    noteIndex = 0;
    authoredNodeIndex = 0;
    authoredSourceIndex = 0;
    authoredEvidenceIndex = 0;
    evidenceCandidateIndex = 0;
    authoredEdgeIndex = 0;
    notify();

    return summary;
  }

  function removeLocalSource(sourceId: string): CleanupSummary {
    const trimmedSourceId = sourceId.trim();
    const sourceIndex = localAuthoredSources.findIndex((source) => {
      return source.id === trimmedSourceId;
    });
    if (sourceIndex < 0) {
      return createEmptyCleanupSummary();
    }

    const summary = createEmptyCleanupSummary();
    const removedEntityIds = new Set<string>([trimmedSourceId]);
    localAuthoredSources.splice(sourceIndex, 1);
    summary.sourcesRemoved = 1;

    for (let index = localAuthoredEvidence.length - 1; index >= 0; index -= 1) {
      const evidence = localAuthoredEvidence[index];
      if (evidence?.sourceId === trimmedSourceId) {
        localAuthoredEvidence.splice(index, 1);
        removedEntityIds.add(evidence.id);
        summary.evidenceRemoved += 1;
      }
    }

    summary.pinsRemoved = removePinnedSourceReference(trimmedSourceId);
    summary.refsRemoved = removeDebateReferences(removedEntityIds);
    summary.turnRefsRemoved = removeDebateTurnReferences(removedEntityIds);
    summary.edgesRemoved = removeLocalEdgesTouchingEntities(removedEntityIds);
    summary.edgesRemoved += sweepOrphanLocalEdges();
    notify();

    return summary;
  }

  function removeLocalNode(nodeId: string): CleanupSummary {
    const trimmedNodeId = nodeId.trim();
    const nodeIndex = localAuthoredNodes.findIndex((node) => {
      return node.id === trimmedNodeId;
    });
    if (nodeIndex < 0) {
      return createEmptyCleanupSummary();
    }

    const summary = createEmptyCleanupSummary();
    const removedNodeIds = new Set([trimmedNodeId]);
    localAuthoredNodes.splice(nodeIndex, 1);
    summary.nodesRemoved = 1;
    removeDeskNodeReferences(removedNodeIds);
    summary.refsRemoved = removeDebateReferences(removedNodeIds);
    summary.turnRefsRemoved = removeDebateTurnReferences(removedNodeIds);
    summary.edgesRemoved = removeLocalEdgesTouchingEntities(removedNodeIds);
    summary.edgesRemoved += sweepOrphanLocalEdges();
    notify();

    return summary;
  }

  function removeLocalEvidence(evidenceId: string): CleanupSummary {
    const trimmedEvidenceId = evidenceId.trim();
    const evidenceIndex = localAuthoredEvidence.findIndex((evidence) => {
      return evidence.id === trimmedEvidenceId;
    });
    if (evidenceIndex < 0) {
      return createEmptyCleanupSummary();
    }

    const summary = createEmptyCleanupSummary();
    const removedEvidenceIds = new Set([trimmedEvidenceId]);
    localAuthoredEvidence.splice(evidenceIndex, 1);
    summary.evidenceRemoved = 1;
    summary.refsRemoved = removeDebateReferences(removedEvidenceIds);
    summary.turnRefsRemoved = removeDebateTurnReferences(removedEvidenceIds);
    summary.edgesRemoved = removeLocalEdgesTouchingEntities(removedEvidenceIds);
    summary.edgesRemoved += sweepOrphanLocalEdges();
    notify();

    return summary;
  }

  function removeLocalEdge(edgeId: string): CleanupSummary {
    const trimmedEdgeId = edgeId.trim();
    const edgeIndex = localAuthoredEdges.findIndex((edge) => {
      return edge.id === trimmedEdgeId;
    });
    if (edgeIndex < 0) {
      return createEmptyCleanupSummary();
    }

    const summary = createEmptyCleanupSummary();
    localAuthoredEdges.splice(edgeIndex, 1);
    summary.edgesRemoved = 1;
    notify();

    return summary;
  }

  function removeLocalNote(noteId: string): CleanupSummary {
    const trimmedNoteId = noteId.trim();
    const noteIndexToRemove = localNotes.findIndex((note) => {
      return note.id === trimmedNoteId;
    });
    if (noteIndexToRemove < 0) {
      return createEmptyCleanupSummary();
    }

    const summary = createEmptyCleanupSummary();
    localNotes.splice(noteIndexToRemove, 1);
    summary.notesRemoved = 1;
    notify();

    return summary;
  }

  function removeImportBatch(batchId: string): CleanupSummary {
    const importBatchId = readImportBatchId(batchId);
    if (importBatchId === undefined) {
      return createEmptyCleanupSummary();
    }

    const summary = createEmptyCleanupSummary();
    const removedSourceIds = new Set<string>();
    const removedNodeIds = new Set<string>();
    const removedEvidenceIds = new Set<string>();
    const removedEntityIds = new Set<string>();
    const edgeIdsRemovedByBatch = new Set<string>();

    for (let index = localAuthoredSources.length - 1; index >= 0; index -= 1) {
      const source = localAuthoredSources[index];
      if (source?.importBatchId === importBatchId) {
        localAuthoredSources.splice(index, 1);
        removedSourceIds.add(source.id);
        removedEntityIds.add(source.id);
        summary.sourcesRemoved += 1;
      }
    }

    for (let index = localAuthoredNodes.length - 1; index >= 0; index -= 1) {
      const node = localAuthoredNodes[index];
      if (node?.importBatchId === importBatchId) {
        localAuthoredNodes.splice(index, 1);
        removedNodeIds.add(node.id);
        removedEntityIds.add(node.id);
        summary.nodesRemoved += 1;
      }
    }

    for (let index = localAuthoredEvidence.length - 1; index >= 0; index -= 1) {
      const evidence = localAuthoredEvidence[index];
      if (evidence?.importBatchId === importBatchId) {
        localAuthoredEvidence.splice(index, 1);
        removedEvidenceIds.add(evidence.id);
        removedEntityIds.add(evidence.id);
        summary.evidenceRemoved += 1;
      }
    }

    for (let index = localNotes.length - 1; index >= 0; index -= 1) {
      const note = localNotes[index];
      if (note?.importBatchId === importBatchId) {
        localNotes.splice(index, 1);
        summary.notesRemoved += 1;
      }
    }

    for (let index = localAuthoredEdges.length - 1; index >= 0; index -= 1) {
      const edge = localAuthoredEdges[index];
      if (edge?.importBatchId === importBatchId) {
        localAuthoredEdges.splice(index, 1);
        edgeIdsRemovedByBatch.add(edge.id);
        summary.edgesRemoved += 1;
      }
    }

    if (removedEntityIds.size > 0) {
      summary.pinsRemoved = removePinnedSourceReferences(removedSourceIds);
      removeDeskNodeReferences(removedNodeIds);
      summary.refsRemoved = removeDebateReferences(removedEntityIds);
      summary.turnRefsRemoved = removeDebateTurnReferences(removedEntityIds);

      for (let index = localAuthoredEdges.length - 1; index >= 0; index -= 1) {
        const edge = localAuthoredEdges[index];
        if (
          edge !== undefined &&
          !edgeIdsRemovedByBatch.has(edge.id) &&
          (removedEntityIds.has(edge.sourceId) || removedEntityIds.has(edge.targetId))
        ) {
          localAuthoredEdges.splice(index, 1);
          summary.edgesRemoved += 1;
        }
      }
    }

    summary.edgesRemoved += sweepOrphanLocalEdges();
    if (hasCleanupChanges(summary)) {
      summary.batchesRemoved = 1;
      notify();
    }

    return summary;
  }

  return {
    getTopicId(): string {
      return domainRef.topic.id;
    },
    updateCaseIdentity(nextCaseLabel: string, nextResearchQuestion: string): boolean {
      const normalizedLabel = nextCaseLabel.trim();
      const normalizedQuestion = nextResearchQuestion.trim();
      if (normalizedLabel === "") {
        return false;
      }
      if (caseLabel === normalizedLabel && researchQuestion === normalizedQuestion) {
        return false;
      }
      caseLabel = normalizedLabel;
      researchQuestion = normalizedQuestion;
      notify();
      return true;
    },
    sendToDesk(nodeId: string): void {
      if (!hasNode(nodeId)) {
        return;
      }
      if (appendUnique(deskNodeIds, nodeId)) {
        notify();
      }
    },
    pinSource(sourceId: string, layer: PatternLayer): void {
      if (!hasSource(sourceId)) {
        return;
      }
      const wasPinned = appendUnique(pinnedSourceIds, sourceId);
      const previousLayer = sourcePinnedLayerById[sourceId];
      sourcePinnedLayerById[sourceId] = layer;
      if (wasPinned || previousLayer !== layer) {
        notify();
      }
    },
    addToDebate(entityId: string): void {
      if (!hasDebateReference(entityId)) {
        return;
      }
      if (appendUnique(debateReferenceIds, entityId)) {
        notify();
      }
    },
    addLocalNote(text: string): void {
      if (addLocalNoteRecord(text)) {
        notify();
      }
    },
    addAuthoredClaim(label: string, content: string): void {
      if (addAuthoredNodeRecord("claim", label, content)) {
        notify();
      }
    },
    addAuthoredInspiration(label: string, content: string): void {
      if (addAuthoredNodeRecord("inspiration", label, content)) {
        notify();
      }
    },
    addAuthoredUncertainty(label: string, content: string): void {
      if (addAuthoredNodeRecord("uncertainty", label, content)) {
        notify();
      }
    },
    addAuthoredSource(label: string, origin: string, note: string): void {
      if (addAuthoredSourceRecord(label, origin, note)) {
        notify();
      }
    },
    addAuthoredEvidence(
      label: string,
      excerpt: string,
      interpretation?: string,
      layer?: PatternLayer,
      options?: LocalAuthoredEvidenceOptions
    ): void {
      if (
        addAuthoredEvidenceRecord(
          label,
          excerpt,
          interpretation,
          layer,
          undefined,
          undefined,
          options
        )
      ) {
        notify();
      }
    },
    addEvidenceCandidate(
      suggestionId: string,
      text: string,
      reviewSessionId?: string | null
    ): boolean {
      if (addEvidenceCandidateRecord(suggestionId, text, reviewSessionId)) {
        notify();
        return true;
      }
      return false;
    },
    promoteEvidenceCandidate(
      input: PatternRoomEvidenceCandidatePromotionInput
    ): PatternRoomEvidenceCandidatePromotionResult {
      return promoteEvidenceCandidate(input);
    },
    removeEvidenceCandidate(candidateId: string): boolean {
      return removeEvidenceCandidate(candidateId);
    },
    addAuthoredEdge(
      edgeType: PatternEdgeType,
      sourceId: string,
      targetId: string,
      note?: string
    ): void {
      if (addAuthoredEdgeRecord(edgeType, sourceId, targetId, note)) {
        notify();
      }
    },
    updateLocalEdge(edgeId: string, edgeType: PatternEdgeType, note?: string): boolean {
      if (!PATTERN_EDGE_TYPES.includes(edgeType)) {
        return false;
      }
      const edgeIndex = localAuthoredEdges.findIndex((edge) => edge.id === edgeId);
      if (edgeIndex < 0) {
        return false;
      }
      const edge = localAuthoredEdges[edgeIndex];
      if (edge === undefined) {
        return false;
      }
      const normalizedNote = note?.trim() || null;
      if (edge.edgeType === edgeType && edge.note === normalizedNote) {
        return false;
      }
      localAuthoredEdges[edgeIndex] = { ...edge, edgeType, note: normalizedNote };
      notify();
      return true;
    },
    applySourceImportResult(
      result: SourceImportResult,
      options?: SourceImportApplyOptions
    ): SourceImportApplySummary {
      return applySourceImportResult(result, options);
    },
    resetOverlayToEmpty(): CleanupSummary {
      return resetOverlayToEmpty();
    },
    removeLocalSource(sourceId: string): CleanupSummary {
      return removeLocalSource(sourceId);
    },
    removeLocalNode(nodeId: string): CleanupSummary {
      return removeLocalNode(nodeId);
    },
    removeLocalEvidence(evidenceId: string): CleanupSummary {
      return removeLocalEvidence(evidenceId);
    },
    removeLocalEdge(edgeId: string): CleanupSummary {
      return removeLocalEdge(edgeId);
    },
    removeLocalNote(noteId: string): CleanupSummary {
      return removeLocalNote(noteId);
    },
    removeImportBatch(batchId: string): CleanupSummary {
      return removeImportBatch(batchId);
    },
    resolveEntityExists(id: string): boolean {
      return resolveEntityExists(id);
    },
    resolveEntityLabel(id: string): string | null {
      return resolveEntityLabel(id);
    },
    prepareDebate(): void {
      if (debateReferenceIds.length === 0) {
        return;
      }
      debatePhase = "preparation";
      debateLocalTurns.length = 0;
      debateLocalVerdict = null;
      debateReportReflected = false;
      setRolesConnected(false);
      notify();
    },
    assignDebateRoles(): void {
      if (debatePhase !== "preparation") {
        return;
      }
      debatePhase = "role_assignment";
      setRolesConnected(true);
      notify();
    },
    startDebate(): void {
      if (debatePhase !== "role_assignment") {
        return;
      }
      debatePhase = "opening";
      debateLocalTurns.length = 0;
      appendDebateTurn("opening");
      notify();
    },
    advanceDebatePhase(): void {
      const nextPhase = NEXT_DEBATE_TURN_PHASE[debatePhase];
      if (nextPhase === undefined) {
        return;
      }
      debatePhase = nextPhase;
      appendDebateTurn(nextPhase);
      notify();
    },
    completeDebate(): void {
      if (debatePhase !== "judge_mapping") {
        return;
      }
      debatePhase = "completed";
      debateLocalVerdict = createDebateVerdict();
      notify();
    },
    reflectDebateToReport(): void {
      if (debatePhase !== "completed" || debateReportReflected) {
        return;
      }
      if (addLocalNoteRecord(createDebateReportSummary())) {
        debateReportReflected = true;
        notify();
      }
    },
    getOverlay(): PatternRoomLocalOverlay {
      return {
        ...(caseLabel === defaultCaseLabel ? {} : { caseLabel }),
        ...(researchQuestion === defaultResearchQuestion ? {} : { researchQuestion }),
        deskNodeIds: [...deskNodeIds],
        pinnedSourceIds: [...pinnedSourceIds],
        sourcePinnedLayerById: { ...sourcePinnedLayerById },
        debateReferenceIds: [...debateReferenceIds],
        debatePhase,
        debateLocalTurns: cloneTurns(debateLocalTurns),
        debateRolesConnected: { ...debateRolesConnected },
        debateLocalVerdict,
        localNotes: cloneNotes(localNotes),
        localAuthoredNodes: cloneAuthoredNodes(localAuthoredNodes),
        localAuthoredSources: cloneAuthoredSources(localAuthoredSources),
        localAuthoredEvidence: cloneAuthoredEvidence(localAuthoredEvidence),
        localEvidenceCandidates: cloneEvidenceCandidates(localEvidenceCandidates),
        localAuthoredEdges: cloneAuthoredEdges(localAuthoredEdges),
      };
    },
    getGuards(): PatternRoomLocalGuards {
      return {
        debateReportReflected,
        noteIndex,
      };
    },
    restoreOverlay(overlay: PatternRoomLocalOverlay, guards: PatternRoomLocalGuards): void {
      caseLabel = overlay.caseLabel?.trim() || defaultCaseLabel;
      researchQuestion =
        overlay.researchQuestion === undefined
          ? defaultResearchQuestion
          : overlay.researchQuestion.trim();
      deskNodeIds.splice(0, deskNodeIds.length, ...overlay.deskNodeIds);
      pinnedSourceIds.splice(0, pinnedSourceIds.length, ...overlay.pinnedSourceIds);

      clearSourcePinnedLayers();
      Object.entries(overlay.sourcePinnedLayerById).forEach(([sourceId, layer]) => {
        sourcePinnedLayerById[sourceId] = layer;
      });

      debateReferenceIds.splice(0, debateReferenceIds.length, ...overlay.debateReferenceIds);
      debateLocalTurns.splice(0, debateLocalTurns.length, ...cloneTurns(overlay.debateLocalTurns));

      ROLE_CONNECTION_IDS.forEach((roleId) => {
        debateRolesConnected[roleId] = overlay.debateRolesConnected[roleId] ?? false;
      });

      localNotes.splice(0, localNotes.length, ...cloneNotes(overlay.localNotes));
      localAuthoredNodes.splice(
        0,
        localAuthoredNodes.length,
        ...cloneAuthoredNodes(overlay.localAuthoredNodes)
      );
      localAuthoredSources.splice(
        0,
        localAuthoredSources.length,
        ...cloneAuthoredSources(overlay.localAuthoredSources)
      );
      localAuthoredEvidence.splice(
        0,
        localAuthoredEvidence.length,
        ...cloneAuthoredEvidence(overlay.localAuthoredEvidence)
      );
      localEvidenceCandidates.splice(
        0,
        localEvidenceCandidates.length,
        ...cloneEvidenceCandidates(overlay.localEvidenceCandidates ?? [])
      );
      localAuthoredEdges.splice(
        0,
        localAuthoredEdges.length,
        ...cloneAuthoredEdges(overlay.localAuthoredEdges)
      );
      debatePhase = overlay.debatePhase;
      debateLocalVerdict = overlay.debateLocalVerdict;
      debateReportReflected = guards.debateReportReflected;
      noteIndex = Math.max(guards.noteIndex, getMaxLocalIdIndex(localNotes, "local-note"));
      authoredNodeIndex = getMaxLocalIdIndex(localAuthoredNodes, "local-node");
      authoredSourceIndex = getMaxLocalIdIndex(localAuthoredSources, "local-source");
      authoredEvidenceIndex = getMaxLocalIdIndex(localAuthoredEvidence, "local-evidence");
      evidenceCandidateIndex = getMaxLocalIdIndex(
        localEvidenceCandidates,
        "local-evidence-candidate"
      );
      authoredEdgeIndex = getMaxLocalIdIndex(localAuthoredEdges, "local-edge");
      notify();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
