import type { PatternRoomDomainData } from "../data/pattern-room-domain.js";
import type {
  LocalAuthoredEdge,
  PatternRoomLocalOverlay,
} from "../state/pattern-room-local-state.js";
import {
  PATTERN_ROOM_CASE_PACKET_VERSION,
  type PatternRoomCasePacket,
  type PatternRoomCasePacketBoardNote,
  type PatternRoomCasePacketConnection,
  type PatternRoomCasePacketDebate,
  type PatternRoomCasePacketEvidence,
  type PatternRoomCasePacketLimits,
  type PatternRoomCasePacketSource,
} from "../types/pattern-room-case-packet.js";
import type {
  PatternEdge,
  PatternEdgeType,
  PatternNode,
  PatternSourceType,
  SourceItem,
} from "../types/pattern-room-domain.js";

export type PatternRoomCasePacketProjectionInput = {
  readonly domain: PatternRoomDomainData;
  readonly overlay?: PatternRoomLocalOverlay;
  readonly topicLabel?: string;
  readonly researchQuestion?: string;
};

export type PatternRoomCasePacketProjectionOptions = Partial<PatternRoomCasePacketLimits>;

const DEFAULT_LIMITS: PatternRoomCasePacketLimits = {
  maxSources: 20,
  maxEvidence: 30,
  maxBoardNotes: 30,
  maxConnections: 30,
  excerptMaxLength: 500,
};

const CASE_PACKET_CAUTION =
  "Bu paket kullanıcı tarafından eklenen ve henüz dışarıdan denetlenmemiş yerel araştırma izlerinden hazırlanmıştır; sonuç veya doğrulama beyanı içermez.";

const SOURCE_TYPE_LABELS: Readonly<Record<PatternSourceType, string>> = {
  book: "Kitap / Metin",
  religious_text: "Dini metin",
  newspaper: "Gazete",
  subtitle_archive: "Altyazı arşivi",
  web_archive: "Web arşivi",
  visual: "Görsel kaynak",
  laboratory_result: "Laboratory sonucu",
  number_analysis: "Sayı analizi",
  personal_note: "Kişisel not",
  unknown: "Belirsiz kaynak",
};

const EDGE_TYPE_LABELS: Readonly<Record<PatternEdgeType, string>> = {
  supports: "destekliyor",
  contradicts: "çelişiyor",
  references: "referans veriyor",
  derived_from: "türetildi",
  inspired_by: "ilham aldı",
  questions: "sorguluyor",
  needs_review: "inceleme gerekiyor",
};

function normalizePlainText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function keepPreviewLanguageCautious(value: string): string {
  return value
    .replace(/Gerçek AI, provider veya relay çağrısı yapılmadı\./g, "Dış üretim çağrısı yapılmadı.")
    .replace(/\bkesin hüküm değil\b/gi, "hüküm dili değil")
    .replace(/\bkesin hukum degil\b/gi, "hüküm dili değil")
    .replace(/\bkesin sonuç\b/gi, "sonuç")
    .replace(/\bkesin cevap\b/gi, "cevap")
    .replace(/\bkanıtlandı\b/gi, "öne sürüldü")
    .replace(/\bdoğrulandı\b/gi, "denetlendi")
    .replace(/\bnihai\b/gi, "son")
    .replace(/\bAI sonucu\b/gi, "dış üretim sonucu");
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
}

function resolveLimits(
  options: PatternRoomCasePacketProjectionOptions | undefined
): PatternRoomCasePacketLimits {
  return {
    maxSources: normalizeLimit(options?.maxSources, DEFAULT_LIMITS.maxSources),
    maxEvidence: normalizeLimit(options?.maxEvidence, DEFAULT_LIMITS.maxEvidence),
    maxBoardNotes: normalizeLimit(options?.maxBoardNotes, DEFAULT_LIMITS.maxBoardNotes),
    maxConnections: normalizeLimit(options?.maxConnections, DEFAULT_LIMITS.maxConnections),
    excerptMaxLength: normalizeLimit(options?.excerptMaxLength, DEFAULT_LIMITS.excerptMaxLength),
  };
}

function createPreview(value: string | null | undefined, maxLength: number): string {
  const normalized = keepPreviewLanguageCautious(normalizePlainText(value));
  if (maxLength <= 0) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  if (maxLength <= 3) {
    return normalized.slice(0, maxLength);
  }
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function createSourceIndex(
  domain: PatternRoomDomainData,
  overlay: PatternRoomLocalOverlay | undefined
): Map<string, string> {
  const index = new Map<string, string>();
  domain.sources.forEach((source) => index.set(source.id, source.label));
  domain.nodes.forEach((node) => index.set(node.id, node.label));
  overlay?.localAuthoredSources.forEach((source) => index.set(source.id, source.label));
  overlay?.localAuthoredNodes.forEach((node) => index.set(node.id, node.label));
  overlay?.localAuthoredEvidence.forEach((evidence) => index.set(evidence.id, evidence.label));
  return index;
}

function createDomainSourcePreview(source: SourceItem): string {
  return `${source.reliability}; kaynak kökeni: ${source.origin}.`;
}

function createSources(
  domain: PatternRoomDomainData,
  overlay: PatternRoomLocalOverlay | undefined,
  limits: PatternRoomCasePacketLimits
): PatternRoomCasePacketSource[] {
  const domainSources = domain.sources.map((source) => ({
    id: source.id,
    label: normalizePlainText(source.label),
    typeLabel: SOURCE_TYPE_LABELS[source.sourceType],
    origin: normalizePlainText(source.origin),
    status: source.reliability,
    preview: createPreview(createDomainSourcePreview(source), limits.excerptMaxLength),
    segmentCount: null,
  }));
  const localSources =
    overlay?.localAuthoredSources.map((source) => ({
      id: source.id,
      label: normalizePlainText(source.label),
      typeLabel: source.segments === undefined ? "Yerel kaynak" : "Uzun metin",
      origin: normalizePlainText(source.origin),
      status: "local",
      preview: createPreview(source.note, limits.excerptMaxLength),
      segmentCount: source.segments?.length ?? null,
    })) ?? [];

  return [...domainSources, ...localSources].slice(0, limits.maxSources);
}

function createEvidence(
  domain: PatternRoomDomainData,
  overlay: PatternRoomLocalOverlay | undefined,
  limits: PatternRoomCasePacketLimits
): PatternRoomCasePacketEvidence[] {
  const sourceLabels = new Map(domain.sources.map((source) => [source.id, source.label]));
  const domainEvidence = domain.evidence.map((evidence, index) => ({
    id: evidence.id,
    label: normalizePlainText(sourceLabels.get(evidence.sourceId) ?? `Kanıt ${index + 1}`),
    sourceLabel: normalizePlainText(sourceLabels.get(evidence.sourceId)) || null,
    excerptPreview: createPreview(evidence.excerpt, limits.excerptMaxLength),
    interpretationPreview:
      evidence.interpretation === null
        ? null
        : createPreview(evidence.interpretation, limits.excerptMaxLength),
    layer: evidence.layer,
  }));
  const localEvidence =
    overlay?.localAuthoredEvidence.map((evidence) => ({
      id: evidence.id,
      label: normalizePlainText(evidence.label),
      sourceLabel: normalizePlainText(evidence.sourceLabel) || null,
      excerptPreview: createPreview(evidence.excerpt, limits.excerptMaxLength),
      interpretationPreview:
        evidence.interpretation === null
          ? null
          : createPreview(evidence.interpretation, limits.excerptMaxLength),
      layer: evidence.layer,
    })) ?? [];

  return [...domainEvidence, ...localEvidence].slice(0, limits.maxEvidence);
}

function shouldIncludeNodeAsBoardNote(node: PatternNode): boolean {
  return node.nodeType !== "source" && node.nodeType !== "quote" && node.nodeType !== "evidence";
}

function createBoardNotes(
  domain: PatternRoomDomainData,
  overlay: PatternRoomLocalOverlay | undefined,
  limits: PatternRoomCasePacketLimits
): PatternRoomCasePacketBoardNote[] {
  const domainNotes = domain.nodes.filter(shouldIncludeNodeAsBoardNote).map((node) => ({
    id: node.id,
    label: normalizePlainText(node.label),
    type: node.nodeType,
    layer: node.layer,
    contentPreview: createPreview(node.content, limits.excerptMaxLength),
  }));
  const localNotes =
    overlay?.localAuthoredNodes.map((node) => ({
      id: node.id,
      label: normalizePlainText(node.label),
      type: node.nodeType,
      layer:
        node.nodeType === "uncertainty"
          ? "uncertainty"
          : node.nodeType === "claim"
            ? "interpretation"
            : "analysis",
      contentPreview: createPreview(node.content, limits.excerptMaxLength),
    })) ?? [];

  return [...domainNotes, ...localNotes].slice(0, limits.maxBoardNotes);
}

function createConnection(
  edge: Pick<PatternEdge, "id" | "edgeType" | "sourceNodeId" | "targetNodeId" | "note">,
  labels: ReadonlyMap<string, string>,
  limits: PatternRoomCasePacketLimits
): PatternRoomCasePacketConnection | null {
  const sourceLabel = labels.get(edge.sourceNodeId);
  const targetLabel = labels.get(edge.targetNodeId);
  if (sourceLabel === undefined || targetLabel === undefined) {
    return null;
  }
  return {
    id: edge.id,
    sourceId: edge.sourceNodeId,
    sourceLabel: createPreview(sourceLabel, limits.excerptMaxLength),
    edgeTypeLabel: EDGE_TYPE_LABELS[edge.edgeType],
    targetId: edge.targetNodeId,
    targetLabel: createPreview(targetLabel, limits.excerptMaxLength),
    notePreview: edge.note === null ? null : createPreview(edge.note, limits.excerptMaxLength),
  };
}

function createLocalConnection(
  edge: LocalAuthoredEdge,
  labels: ReadonlyMap<string, string>,
  limits: PatternRoomCasePacketLimits
): PatternRoomCasePacketConnection | null {
  return createConnection(
    {
      id: edge.id,
      edgeType: edge.edgeType,
      sourceNodeId: edge.sourceId,
      targetNodeId: edge.targetId,
      note: edge.note,
    },
    labels,
    limits
  );
}

function createConnections(
  domain: PatternRoomDomainData,
  overlay: PatternRoomLocalOverlay | undefined,
  limits: PatternRoomCasePacketLimits
): PatternRoomCasePacketConnection[] {
  const labels = createSourceIndex(domain, overlay);
  const domainConnections = domain.edges.map((edge) => createConnection(edge, labels, limits));
  const localConnections =
    overlay?.localAuthoredEdges.map((edge) => createLocalConnection(edge, labels, limits)) ?? [];

  return [...domainConnections, ...localConnections]
    .filter((connection): connection is PatternRoomCasePacketConnection => connection !== null)
    .slice(0, limits.maxConnections);
}

function createDebate(
  domain: PatternRoomDomainData,
  overlay: PatternRoomLocalOverlay | undefined,
  limits: PatternRoomCasePacketLimits
): PatternRoomCasePacketDebate {
  const turns = overlay?.debateLocalTurns ?? domain.debateSession.turns;
  return {
    phaseLabel: normalizePlainText(overlay?.debatePhase ?? domain.debateSession.status),
    statusLabel: normalizePlainText(domain.debateSession.status),
    referenceCount: overlay?.debateReferenceIds.length ?? 0,
    turnCount: turns.length,
    verdictPreview:
      overlay?.debateLocalVerdict === null || overlay?.debateLocalVerdict === undefined
        ? domain.debateSession.verdict === null
          ? null
          : createPreview(domain.debateSession.verdict, limits.excerptMaxLength)
        : createPreview(overlay.debateLocalVerdict, limits.excerptMaxLength),
    turnPreviews: turns.map((turn) => createPreview(turn.content, limits.excerptMaxLength)),
  };
}

function createOpenQuestions(
  domain: PatternRoomDomainData,
  overlay: PatternRoomLocalOverlay | undefined,
  limits: PatternRoomCasePacketLimits
): string[] {
  const questions = [
    ...domain.nodes
      .filter((node) => node.nodeType === "uncertainty")
      .map((node) => `${node.label}: ${node.content}`),
    ...(overlay?.localAuthoredNodes
      .filter((node) => node.nodeType === "uncertainty")
      .map((node) => `${node.label}: ${node.content}`) ?? []),
    ...(overlay?.localNotes.map((note) => note.text) ?? []),
  ];
  const seen = new Set<string>();
  return questions.flatMap((question) => {
    const preview = createPreview(question, limits.excerptMaxLength);
    const normalized = preview.toLocaleLowerCase("tr");
    if (preview === "" || seen.has(normalized)) {
      return [];
    }
    seen.add(normalized);
    return [preview];
  });
}

export function createPatternRoomCasePacketFromProjection(
  input: PatternRoomCasePacketProjectionInput,
  options?: PatternRoomCasePacketProjectionOptions
): PatternRoomCasePacket {
  const limits = resolveLimits(options);
  return {
    packetVersion: PATTERN_ROOM_CASE_PACKET_VERSION,
    roomId: "pattern-room",
    topicLabel: normalizePlainText(
      input.topicLabel ?? input.overlay?.caseLabel ?? input.domain.topic.label
    ),
    researchQuestion:
      normalizePlainText(
        input.researchQuestion ?? input.overlay?.researchQuestion ?? input.domain.topic.description
      ) || null,
    generatedFrom: "local-view-model",
    caution: CASE_PACKET_CAUTION,
    sources: createSources(input.domain, input.overlay, limits),
    evidence: createEvidence(input.domain, input.overlay, limits),
    boardNotes: createBoardNotes(input.domain, input.overlay, limits),
    connections: createConnections(input.domain, input.overlay, limits),
    debate: createDebate(input.domain, input.overlay, limits),
    openQuestions: createOpenQuestions(input.domain, input.overlay, limits),
    limits,
  };
}
