import {
  PATTERN_LAYERS,
  type DebateRole,
  type DebateSession,
  type EvidenceItem,
  type PatternEdge,
  type PatternEdgeType,
  type PatternLayer,
  type PatternNode,
  type PatternReliability,
  type PatternSourceType,
  type ReportTrace,
  type SourceItem,
  type Topic,
} from "../types/pattern-room-domain.js";
import type {
  PatternBoardCategory,
  PatternBoardCategoryTone,
  PatternBoardPin,
  PatternClaim,
  PatternConnection,
  PatternConnectionOption,
  PatternDebateReference,
  PatternReportItem,
  PatternReportMetric,
  PatternReportSection,
  PatternRoomWorkspaceModel,
  PatternSource,
} from "../types/pattern-room.js";
import type {
  DebateLocalTurn,
  LocalAuthoredEdge,
  LocalAuthoredEvidence,
  LocalAuthoredNode,
  LocalAuthoredSource,
  PatternRoomLocalOverlay,
} from "../state/pattern-room-local-state.js";

export type PatternRoomDomainViewSource = {
  topic: Topic;
  nodes: PatternNode[];
  edges: PatternEdge[];
  sources: SourceItem[];
  evidence: EvidenceItem[];
  debateSession: DebateSession;
  reportTrace: ReportTrace[];
};

export type PatternOverviewViewModel = Pick<
  PatternRoomWorkspaceModel,
  "roomTitle" | "roomLabel" | "roomSummary" | "subject" | "researchQuestion"
>;

export type PatternBoardViewModel = Pick<
  PatternRoomWorkspaceModel,
  "boardCategories" | "connectionOptions"
>;

export type PatternArchiveViewModel = Pick<PatternRoomWorkspaceModel, "sources">;

export type PatternDeskViewModel = Pick<PatternRoomWorkspaceModel, "claims" | "connections">;

export type PatternTenthManViewModel = Pick<PatternRoomWorkspaceModel, "tenthManSession">;

export type PatternReportViewModel = Pick<PatternRoomWorkspaceModel, "reportSummary">;

type PatternReportSectionId =
  | "report-source-summary"
  | "report-evidence-notes"
  | "report-board-notes"
  | "report-local-connections"
  | "report-tenth-man-traces"
  | "report-next-research-notes";

const LAYER_TONES: Record<PatternLayer, PatternBoardCategoryTone> = {
  evidence: "evidence",
  analysis: "analysis",
  interpretation: "commentary",
  uncertainty: "uncertainty",
};

const LAYER_LABELS: Record<PatternLayer, string> = {
  evidence: "Kanıt",
  analysis: "Analiz",
  interpretation: "Yorum",
  uncertainty: "Belirsizlik",
};

const LAYER_SUMMARIES: Record<PatternLayer, string> = {
  evidence: "Doğrudan kaynak, gözlem ve alıntı izleri bu katmanda tutulur.",
  analysis: "Kaynaklardan türeyen temkinli çıkarımlar ayrı görünür.",
  interpretation: "Yorum ve senaryo notları temkinli dilden ayrılır.",
  uncertainty: "Eksik bağlam, itiraz ve doğrulanmamış noktalar işaretlenir.",
};

const SOURCE_TYPE_LABELS: Record<PatternSourceType, string> = {
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
const ARCHIVE_SOURCE_NOTE_PREVIEW_LENGTH = 240;
const REPORT_ITEM_PREVIEW_LENGTH = 220;

const RELIABILITY_LABELS: Record<PatternReliability, string> = {
  unverified: "Doğrulanmamış",
  user_provided: "Kullanıcı sağladı",
  verified: "Doğrulanmış",
  disputed: "Tartışmalı",
  unknown: "Güvenilirlik bilinmiyor",
};

const ROLE_NOTES: Record<DebateRole["role"], string> = {
  researcher: "Kanıt izlerini düzenleyen temsili slot.",
  advocate: "Ana açıklamayı savunan temsili slot.",
  "tenth-man": "Karşı argümanları yükselten temsili slot.",
  arbiter: "Gerçek bağlantısı olmayan görsel hakem etiketi.",
};

const LOCAL_AUTHORED_NODE_LAYERS: Record<LocalAuthoredNode["nodeType"], PatternLayer> = {
  claim: "interpretation",
  inspiration: "analysis",
  uncertainty: "uncertainty",
};

const EDGE_TYPE_LABELS: Record<PatternEdgeType, string> = {
  supports: "destekliyor",
  contradicts: "çelişiyor",
  references: "referans veriyor",
  derived_from: "türetildi",
  inspired_by: "ilham aldı",
  questions: "sorguluyor",
  needs_review: "inceleme gerekiyor",
};

const LOCAL_NODE_TYPE_LABELS: Record<LocalAuthoredNode["nodeType"], string> = {
  claim: "İddia",
  inspiration: "İlham",
  uncertainty: "Belirsizlik",
};

const DEBATE_PHASE_LABELS: Record<DebateLocalTurn["phaseKey"], string> = {
  idle: "Beklemede",
  preparation: "Hazırlık",
  role_assignment: "Rol atama",
  opening: "Açılış",
  counter_argument: "Karşı argüman",
  evidence_review: "Kanıt inceleme",
  weak_point: "Zayıf nokta",
  judge_mapping: "Hakem eşlemesi",
  completed: "Tamamlandı",
};

const DEBATE_ROLE_LABELS: Record<DebateLocalTurn["role"], string> = {
  researcher: "Araştırmacı",
  advocate: "Savunucu",
  "tenth-man": "10. Adam / Karşıt",
  arbiter: "Hakem",
};

const REPORT_SECTION_DEFINITIONS: Record<
  PatternReportSectionId,
  {
    label: string;
    tone: PatternBoardCategoryTone;
    note: string;
    emptyMessage: string;
  }
> = {
  "report-source-summary": {
    label: "Kaynak Özeti",
    tone: "evidence",
    note: "Taslak kaynak sayımı Archive görünümündeki domain ve yerel izlerden hazırlanır.",
    emptyMessage: "Henüz kullanıcı tarafından eklenen yerel kaynak yok.",
  },
  "report-evidence-notes": {
    label: "Kanıt Notları",
    tone: "evidence",
    note: "Kullanıcı tarafından eklenen yerel kanıt notları henüz doğrulanmamış iz olarak listelenir.",
    emptyMessage: "Henüz yerel kanıt notu yok.",
  },
  "report-board-notes": {
    label: "Pano Notları",
    tone: "commentary",
    note: "Kullanıcı tarafından eklenen claim, inspiration ve uncertainty pano notları ayrılır.",
    emptyMessage: "Henüz yerel pano notu yok.",
  },
  "report-local-connections": {
    label: "Yerel Bağlantılar",
    tone: "analysis",
    note: "Oda içinde kurulan yerel bağlantılar kesin hüküm üretmeden gösterilir.",
    emptyMessage: "Henüz yerel bağlantı yok.",
  },
  "report-tenth-man-traces": {
    label: "10. Adam İzleri",
    tone: "uncertainty",
    note: "Yerel 10. Adam tur ve özet izleri dış üretim olmadan rapora yansır.",
    emptyMessage: "Henüz 10. Adam tartışması rapora yansıtılmadı.",
  },
  "report-next-research-notes": {
    label: "Sonraki Araştırma Notları",
    tone: "commentary",
    note: "Eksik bağlam, belirsizlik ve kullanıcı notları sonraki araştırma için tutulur.",
    emptyMessage: "Henüz sonraki araştırma notu yok.",
  },
};

const REPORT_SECTION_ORDER: readonly PatternReportSectionId[] = [
  "report-source-summary",
  "report-evidence-notes",
  "report-board-notes",
  "report-local-connections",
  "report-tenth-man-traces",
  "report-next-research-notes",
];

function adaptSubjectLabel(topic: Topic): string {
  const normalizedLabel = topic.label.toLocaleLowerCase("tr-TR");
  if (normalizedLabel.includes("dunya") || normalizedLabel.includes("dünya")) {
    return "Dünya’nın Şekli";
  }
  return topic.label;
}

function indexSourcesById(sources: readonly SourceItem[]): Map<string, SourceItem> {
  return new Map(
    sources.map((source) => {
      return [source.id, source];
    })
  );
}

function indexNodesById(nodes: readonly PatternNode[]): Map<string, PatternNode> {
  return new Map(
    nodes.map((node) => {
      return [node.id, node];
    })
  );
}

function formatConfidence(confidence: number | null): string {
  if (confidence === null) {
    return "Belirtilmemiş";
  }
  return `${Math.round(confidence * 100)}%`;
}

function adaptBoardNodePin(node: PatternNode, source: SourceItem | undefined): PatternBoardPin {
  return {
    id: node.id,
    label: node.label,
    layer: node.layer,
    layerLabel: LAYER_LABELS[node.layer],
    tone: LAYER_TONES[node.layer],
    confidenceLabel: formatConfidence(node.confidence),
    content: node.content,
    sourceId: node.sourceRef,
    sourceLabel: source?.label ?? node.sourceRef ?? "Kaynak yok",
    origin: source?.origin ?? null,
    kind: "node",
    isLocal: false,
  };
}

function adaptBoardSourcePin(source: SourceItem, layer: PatternLayer): PatternBoardPin {
  return {
    id: source.id,
    label: source.label,
    layer,
    layerLabel: LAYER_LABELS[layer],
    tone: LAYER_TONES[layer],
    confidenceLabel: RELIABILITY_LABELS[source.reliability],
    content: adaptSourceNote(source),
    sourceId: source.id,
    sourceLabel: source.label,
    origin: source.origin,
    kind: "source",
    isLocal: true,
  };
}

function adaptLocalAuthoredNodePin(node: LocalAuthoredNode): PatternBoardPin {
  const layer = LOCAL_AUTHORED_NODE_LAYERS[node.nodeType];
  return {
    id: node.id,
    label: node.label,
    layer,
    layerLabel: LAYER_LABELS[layer],
    tone: LAYER_TONES[layer],
    confidenceLabel: "Yerel",
    content: node.content,
    sourceId: null,
    sourceLabel: "Yerel kayıt",
    origin: null,
    kind: "node",
    isLocal: true,
  };
}

function adaptLocalAuthoredEvidencePin(evidence: LocalAuthoredEvidence): PatternBoardPin {
  const interpretation =
    evidence.interpretation === null ? "" : ` Yorum: ${evidence.interpretation}`;
  return {
    id: evidence.id,
    label: evidence.label,
    layer: "evidence",
    layerLabel: LAYER_LABELS.evidence,
    tone: LAYER_TONES.evidence,
    confidenceLabel: "Yerel",
    content: `${evidence.excerpt}${interpretation}`,
    sourceId: evidence.sourceId ?? null,
    sourceLabel: evidence.sourceLabel ?? "Yerel kanıt notu",
    origin: LAYER_LABELS[evidence.layer],
    kind: "evidence",
    isLocal: true,
  };
}

function createLayerPlaceholderPin(layer: PatternLayer): PatternBoardPin {
  return {
    id: `board-placeholder-${layer}`,
    label: LAYER_LABELS[layer],
    layer,
    layerLabel: LAYER_LABELS[layer],
    tone: LAYER_TONES[layer],
    confidenceLabel: "Dummy",
    content: LAYER_SUMMARIES[layer],
    sourceId: null,
    sourceLabel: "Kaynak yok",
    origin: null,
    kind: "placeholder",
    isLocal: false,
  };
}

function adaptClaimNode(node: PatternNode): PatternClaim {
  const stance: PatternClaim["stance"] =
    node.nodeType === "contradiction" || node.nodeType === "uncertainty" ? "counter" : "primary";
  return {
    id: `claim-${node.id}`,
    label: node.label,
    summary: node.content,
    stance,
  };
}

function adaptLocalAuthoredClaimNode(node: LocalAuthoredNode): PatternClaim {
  return {
    id: `claim-${node.id}`,
    label: node.label,
    summary: node.content,
    stance: "primary",
  };
}

function adaptSourceNote(source: SourceItem): string {
  const reliabilityLabel = RELIABILITY_LABELS[source.reliability];
  if (source.sourceType === "personal_note") {
    return `Masa çıktısı geçici kartı; kaynak türü ${SOURCE_TYPE_LABELS[source.sourceType]} ve güvenilirlik ${reliabilityLabel}.`;
  }
  return `${reliabilityLabel}; kaynak origin: ${source.origin}.`;
}

function createArchiveSourceNotePreview(note: string): string {
  const normalizedNote = note.replace(/\s+/g, " ").trim();
  if (normalizedNote.length <= ARCHIVE_SOURCE_NOTE_PREVIEW_LENGTH) {
    return normalizedNote;
  }
  return `${normalizedNote.slice(0, ARCHIVE_SOURCE_NOTE_PREVIEW_LENGTH).trimEnd()}…`;
}

function createReportPreview(text: string, length = REPORT_ITEM_PREVIEW_LENGTH): string {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  if (normalizedText.length <= length) {
    return normalizedText;
  }
  return `${normalizedText.slice(0, length).trimEnd()}…`;
}

function createReportItem(
  id: string,
  label: string,
  body: string,
  meta: readonly string[],
  detail: string | null = null
): PatternReportItem {
  return {
    id,
    label,
    body: createReportPreview(body),
    meta: [...meta],
    detail: detail === null ? null : createReportPreview(detail),
  };
}

function formatReportBullet(item: PatternReportItem): string {
  const meta = item.meta.length === 0 ? "" : ` (${item.meta.join(" · ")})`;
  const detail = item.detail === null ? "" : ` ${item.detail}`;
  return `${item.label}: ${item.body}${detail}${meta}`;
}

function createReportSection(
  id: PatternReportSectionId,
  items: readonly PatternReportItem[],
  metrics: readonly PatternReportMetric[],
  note: string = REPORT_SECTION_DEFINITIONS[id].note
): PatternReportSection {
  const definition = REPORT_SECTION_DEFINITIONS[id];
  return {
    id,
    label: definition.label,
    tone: definition.tone,
    note,
    metrics: metrics.map((metric) => ({ ...metric })),
    bullets: items.length === 0 ? [definition.emptyMessage] : items.map(formatReportBullet),
    items: [...items],
    emptyMessage: definition.emptyMessage,
  };
}

function createReportLocalTraceText(text: string): string {
  return text
    .replace(/\bLocal\b/g, "Yerel")
    .replace(/\bdummy\b/g, "yerel")
    .replace(/\bAI0\s+/g, "Yerel araştırmacı ")
    .replace(/\bAI1\s+/g, "Yerel savunucu ")
    .replace(/\bAI2\s+/g, "Yerel karşıt ")
    .replace(/Gerçek .+ çağrısı yapılmadı\./, "Dış üretim çağrısı yapılmadı.");
}

function adaptLocalAuthoredSource(source: LocalAuthoredSource): PatternSource {
  const note = source.note === "" ? "Oda içinde eklenen yerel kaynak." : source.note;
  return {
    id: source.id,
    label: source.label,
    sourceTypeLabel: "Yerel Kaynak",
    origin: source.origin,
    status: "local",
    note,
    notePreview: createArchiveSourceNotePreview(note),
    ...(source.segments === undefined ? {} : { segments: source.segments }),
    isLocal: true,
  };
}

function adaptNodeConnectionOption(node: PatternNode): PatternConnectionOption {
  return {
    id: node.id,
    label: node.label,
    kind: "node",
    isLocal: false,
  };
}

function adaptSourceConnectionOption(source: SourceItem): PatternConnectionOption {
  return {
    id: source.id,
    label: source.label,
    kind: "source",
    isLocal: false,
  };
}

function adaptLocalNodeConnectionOption(node: LocalAuthoredNode): PatternConnectionOption {
  return {
    id: node.id,
    label: node.label,
    kind: "node",
    isLocal: true,
  };
}

function adaptLocalSourceConnectionOption(source: LocalAuthoredSource): PatternConnectionOption {
  return {
    id: source.id,
    label: source.label,
    kind: "source",
    isLocal: true,
  };
}

function adaptLocalEvidenceConnectionOption(
  evidence: LocalAuthoredEvidence
): PatternConnectionOption {
  return {
    id: evidence.id,
    label: evidence.label,
    kind: "evidence",
    isLocal: true,
  };
}

function adaptConnectionOptions(
  domain: PatternRoomDomainViewSource,
  overlay?: PatternRoomLocalOverlay
): PatternConnectionOption[] {
  return [
    ...domain.nodes.map(adaptNodeConnectionOption),
    ...domain.sources.map(adaptSourceConnectionOption),
    ...(overlay?.localAuthoredNodes.map(adaptLocalNodeConnectionOption) ?? []),
    ...(overlay?.localAuthoredSources.map(adaptLocalSourceConnectionOption) ?? []),
    ...(overlay?.localAuthoredEvidence.map(adaptLocalEvidenceConnectionOption) ?? []),
  ];
}

function adaptRoleLabel(role: DebateRole): string {
  if (role.slotId === "AI0" && role.role === "researcher") {
    return "AI0 — Araştırmacı";
  }
  if (role.slotId === "AI1" && role.role === "advocate") {
    return "AI1 — Savunucu";
  }
  if (role.slotId === "AI2" && role.role === "tenth-man") {
    return "AI2 — 10. Adam / Karşıt";
  }
  if (role.slotId === "US1" && role.role === "arbiter") {
    return "US1 — Hakem / Uzak kullanıcı";
  }
  return `${role.slotId} — ${role.label}`;
}

export function adaptOverviewViewModel(
  domain: PatternRoomDomainViewSource,
  overlay?: PatternRoomLocalOverlay
): PatternOverviewViewModel {
  const subject = overlay?.caseLabel?.trim() || adaptSubjectLabel(domain.topic);
  const researchQuestion =
    overlay?.researchQuestion === undefined
      ? domain.topic.description.trim()
      : overlay.researchQuestion.trim();
  return {
    roomTitle: "İz Sürme Odası",
    roomLabel: "Pattern Room",
    roomSummary:
      researchQuestion === "" ? "Araştırma sorusu henüz tanımlanmadı." : researchQuestion,
    subject,
    researchQuestion,
  };
}

export function adaptBoardViewModel(
  domain: PatternRoomDomainViewSource,
  overlay?: PatternRoomLocalOverlay
): PatternBoardViewModel {
  const sourceById = indexSourcesById(domain.sources);
  const pinnedSourcePinsByLayer = new Map<PatternLayer, PatternBoardPin[]>();
  const localPinsByLayer = new Map<PatternLayer, PatternBoardPin[]>();

  if (overlay !== undefined) {
    for (const sourceId of overlay.pinnedSourceIds) {
      const source = sourceById.get(sourceId);
      if (source === undefined) {
        continue;
      }
      const layer = overlay.sourcePinnedLayerById[sourceId] ?? "evidence";
      const pins = pinnedSourcePinsByLayer.get(layer) ?? [];
      pins.push(adaptBoardSourcePin(source, layer));
      pinnedSourcePinsByLayer.set(layer, pins);
    }

    for (const localNode of overlay.localAuthoredNodes) {
      const pin = adaptLocalAuthoredNodePin(localNode);
      const pins = localPinsByLayer.get(pin.layer) ?? [];
      pins.push(pin);
      localPinsByLayer.set(pin.layer, pins);
    }

    for (const localEvidence of overlay.localAuthoredEvidence) {
      const pin = adaptLocalAuthoredEvidencePin(localEvidence);
      const pins = localPinsByLayer.get(pin.layer) ?? [];
      pins.push(pin);
      localPinsByLayer.set(pin.layer, pins);
    }
  }

  const boardCategories: PatternBoardCategory[] = PATTERN_LAYERS.map((layer) => {
    const nodePins = domain.nodes
      .filter((node) => node.layer === layer)
      .map((node) => {
        const source = node.sourceRef === null ? undefined : sourceById.get(node.sourceRef);
        return adaptBoardNodePin(node, source);
      });
    const pinnedSourcePins = pinnedSourcePinsByLayer.get(layer) ?? [];
    const localPins = localPinsByLayer.get(layer) ?? [];
    const pins = [...nodePins, ...pinnedSourcePins, ...localPins];

    return {
      id: `board-${layer}`,
      label: LAYER_LABELS[layer],
      tone: LAYER_TONES[layer],
      summary: LAYER_SUMMARIES[layer],
      pins: pins.length > 0 ? pins : [createLayerPlaceholderPin(layer)],
    };
  });

  return { boardCategories, connectionOptions: adaptConnectionOptions(domain, overlay) };
}

export function adaptArchiveViewModel(
  domain: PatternRoomDomainViewSource,
  overlay?: PatternRoomLocalOverlay
): PatternArchiveViewModel {
  const sources: PatternSource[] = domain.sources.map((source) => {
    const note = adaptSourceNote(source);
    return {
      id: source.id,
      label: source.label,
      sourceTypeLabel: SOURCE_TYPE_LABELS[source.sourceType],
      origin: source.origin,
      status: "mocked",
      note,
      notePreview: createArchiveSourceNotePreview(note),
      isLocal: false,
    };
  });

  const localSources = overlay?.localAuthoredSources.map(adaptLocalAuthoredSource) ?? [];

  return { sources: [...sources, ...localSources] };
}

export function adaptDeskViewModel(
  domain: PatternRoomDomainViewSource,
  overlay?: PatternRoomLocalOverlay
): PatternDeskViewModel {
  const claimNodes = domain.nodes.filter((node) => {
    return (
      node.nodeType === "claim" ||
      node.nodeType === "decision" ||
      node.nodeType === "contradiction" ||
      node.nodeType === "uncertainty"
    );
  });

  const claims =
    claimNodes.length > 0
      ? claimNodes.map(adaptClaimNode)
      : [
          {
            id: `claim-${domain.topic.id}`,
            label: overlay?.caseLabel?.trim() || domain.topic.label,
            summary:
              overlay?.researchQuestion === undefined
                ? domain.topic.description
                : overlay.researchQuestion.trim(),
            stance: "primary" as const,
          },
        ];

  const nodeById = indexNodesById(domain.nodes);
  const localClaims =
    overlay?.deskNodeIds
      .map((nodeId) => {
        const node = nodeById.get(nodeId);
        if (node === undefined) {
          return null;
        }
        return {
          id: `desk-local-${node.id}`,
          label: node.label,
          summary: `Yerel masaya gönderildi: ${node.content}`,
          stance:
            node.nodeType === "contradiction" || node.nodeType === "uncertainty"
              ? ("counter" as const)
              : ("primary" as const),
        };
      })
      .filter((claim): claim is PatternClaim => claim !== null) ?? [];
  const authoredClaims =
    overlay?.localAuthoredNodes
      .filter((node) => {
        return node.nodeType === "claim";
      })
      .map(adaptLocalAuthoredClaimNode) ?? [];

  return {
    claims: [...claims, ...localClaims, ...authoredClaims],
    connections: adaptConnections(domain, overlay),
  };
}

export function adaptTenthManViewModel(
  domain: PatternRoomDomainViewSource,
  overlay?: PatternRoomLocalOverlay
): PatternTenthManViewModel {
  const nodeById = indexNodesById(domain.nodes);
  const sourceById = indexSourcesById(domain.sources);
  const references =
    overlay?.debateReferenceIds
      .map((referenceId) => {
        const node = nodeById.get(referenceId);
        if (node !== undefined) {
          return {
            id: `debate-reference-node-${node.id}`,
            label: node.label,
            note: `Yerel 10. Adam referansı: ${node.content}`,
            kind: "node" as const,
          };
        }

        const source = sourceById.get(referenceId);
        if (source !== undefined) {
          return {
            id: `debate-reference-source-${source.id}`,
            label: source.label,
            note: `Yerel kaynak referansı: ${source.origin}`,
            kind: "source" as const,
          };
        }

        const localNode = overlay.localAuthoredNodes.find((node) => node.id === referenceId);
        if (localNode !== undefined) {
          return {
            id: `debate-reference-local-node-${localNode.id}`,
            label: localNode.label,
            note: `Yerel öğe referansı: ${localNode.content}`,
            kind: "node" as const,
          };
        }

        const localSource = overlay.localAuthoredSources.find(
          (source) => source.id === referenceId
        );
        if (localSource !== undefined) {
          return {
            id: `debate-reference-local-source-${localSource.id}`,
            label: localSource.label,
            note: `Yerel kaynak referansı: ${localSource.origin}`,
            kind: "source" as const,
          };
        }

        const localEvidence = overlay.localAuthoredEvidence.find((evidence) => {
          return evidence.id === referenceId;
        });
        if (localEvidence !== undefined) {
          return {
            id: `debate-reference-local-evidence-${localEvidence.id}`,
            label: localEvidence.label,
            note: `Yerel kanıt notu: ${localEvidence.excerpt}`,
            kind: "evidence" as const,
          };
        }

        return null;
      })
      .filter((reference): reference is PatternDebateReference => reference !== null) ?? [];

  return {
    tenthManSession: {
      id: domain.debateSession.id,
      label: "Masaya bağlı 10. Adam cihazı",
      status:
        overlay?.debatePhase === "completed"
          ? "completed"
          : overlay?.debatePhase !== undefined && overlay.debatePhase !== "idle"
            ? "active"
            : "dummy",
      prompt: domain.debateSession.prompt,
      roles: domain.debateSession.roles.map((role) => {
        return {
          id: `role-${role.slotId.toLocaleLowerCase("en-US")}-${role.role}`,
          label: adaptRoleLabel(role),
          note: ROLE_NOTES[role.role],
          connected: overlay?.debateRolesConnected[role.slotId] ?? role.connected,
        };
      }),
      references,
      phase: overlay?.debatePhase ?? "idle",
      turns:
        overlay?.debateLocalTurns.map((turn) => {
          return { ...turn };
        }) ?? [],
      verdict: overlay?.debateLocalVerdict ?? null,
    },
  };
}

function resolveConnectionEntityLabel(
  domain: PatternRoomDomainViewSource,
  overlay: PatternRoomLocalOverlay | undefined,
  entityId: string
): string | null {
  const domainNode = domain.nodes.find((node) => node.id === entityId);
  if (domainNode !== undefined) {
    return domainNode.label;
  }

  const domainSource = domain.sources.find((source) => source.id === entityId);
  if (domainSource !== undefined) {
    return domainSource.label;
  }

  const localNode = overlay?.localAuthoredNodes.find((node) => node.id === entityId);
  if (localNode !== undefined) {
    return localNode.label;
  }

  const localSource = overlay?.localAuthoredSources.find((source) => source.id === entityId);
  if (localSource !== undefined) {
    return localSource.label;
  }

  const localEvidence = overlay?.localAuthoredEvidence.find((evidence) => evidence.id === entityId);
  return localEvidence?.label ?? null;
}

function adaptConnections(
  domain: PatternRoomDomainViewSource,
  overlay?: PatternRoomLocalOverlay
): PatternConnection[] {
  const rawDomain = domain.edges.map((edge) => {
    const sourceLabel = resolveConnectionEntityLabel(domain, overlay, edge.sourceNodeId);
    const targetLabel = resolveConnectionEntityLabel(domain, overlay, edge.targetNodeId);
    if (sourceLabel === null || targetLabel === null) {
      return null;
    }
    return {
      id: edge.id,
      edgeType: edge.edgeType,
      edgeTypeLabel: EDGE_TYPE_LABELS[edge.edgeType],
      sourceId: edge.sourceNodeId,
      sourceLabel,
      targetId: edge.targetNodeId,
      targetLabel,
      note: edge.note,
      scope: "domain" as const,
      editable: false,
    };
  });
  const domainConnections = rawDomain.filter((c) => c !== null) as PatternConnection[];

  const rawLocal =
    overlay?.localAuthoredEdges.map((edge) => {
      const sourceLabel = resolveConnectionEntityLabel(domain, overlay, edge.sourceId);
      const targetLabel = resolveConnectionEntityLabel(domain, overlay, edge.targetId);
      if (sourceLabel === null || targetLabel === null) {
        return null;
      }
      return {
        id: edge.id,
        edgeType: edge.edgeType,
        edgeTypeLabel: EDGE_TYPE_LABELS[edge.edgeType],
        sourceId: edge.sourceId,
        sourceLabel,
        targetId: edge.targetId,
        targetLabel,
        note: edge.note,
        scope: "local" as const,
        editable: true,
      };
    }) ?? [];
  const localConnections = rawLocal.filter((c) => c !== null) as PatternConnection[];

  return [...domainConnections, ...localConnections];
}

function adaptLocalConnectionBullet(
  domain: PatternRoomDomainViewSource,
  overlay: PatternRoomLocalOverlay,
  edge: LocalAuthoredEdge
): string | null {
  const sourceLabel = resolveConnectionEntityLabel(domain, overlay, edge.sourceId);
  const targetLabel = resolveConnectionEntityLabel(domain, overlay, edge.targetId);
  if (sourceLabel === null || targetLabel === null) {
    return null;
  }

  return `${sourceLabel} → ${EDGE_TYPE_LABELS[edge.edgeType]} → ${targetLabel}`;
}

function createSourceSummaryReportItems(
  domain: PatternRoomDomainViewSource,
  overlay?: PatternRoomLocalOverlay
): PatternReportItem[] {
  const domainItems = domain.sources.map((source) => {
    return createReportItem(
      `report-domain-source-${source.id}`,
      source.label,
      adaptSourceNote(source),
      [
        "Domain kaynak",
        `Tür: ${SOURCE_TYPE_LABELS[source.sourceType]}`,
        `Köken: ${source.origin}`,
        `Durum: ${RELIABILITY_LABELS[source.reliability]}`,
      ]
    );
  });
  const localItems =
    overlay?.localAuthoredSources.map((source) => {
      const segmentCount = source.segments?.length ?? 0;
      const meta = [
        "Kullanıcı tarafından eklenen",
        `Köken: ${source.origin}`,
        ...(segmentCount > 0 ? [`Segment: ${segmentCount}`] : []),
      ];
      const body = source.note === "" ? "Kaynak metni için kısa not yok." : source.note;
      return createReportItem(`report-source-${source.id}`, source.label, body, meta);
    }) ?? [];

  return [...domainItems, ...localItems];
}

function createEvidenceReportItems(overlay?: PatternRoomLocalOverlay): PatternReportItem[] {
  return (
    overlay?.localAuthoredEvidence.map((evidence) => {
      const sourceLabel = evidence.sourceLabel ?? "Belirtilmemiş";
      return createReportItem(
        `report-evidence-${evidence.id}`,
        evidence.label,
        evidence.excerpt,
        [
          "Kullanıcı tarafından eklenen",
          `Kaynak: ${sourceLabel}`,
          `Katman: ${LAYER_LABELS[evidence.layer]}`,
          "Henüz doğrulanmamış",
        ],
        evidence.interpretation === null ? null : `Yorum: ${evidence.interpretation}`
      );
    }) ?? []
  );
}

function createBoardNoteReportItems(overlay?: PatternRoomLocalOverlay): PatternReportItem[] {
  return (
    overlay?.localAuthoredNodes.map((node) => {
      return createReportItem(`report-board-node-${node.id}`, node.label, node.content, [
        "Kullanıcı tarafından eklenen",
        `Tür: ${LOCAL_NODE_TYPE_LABELS[node.nodeType]}`,
      ]);
    }) ?? []
  );
}

function createLocalConnectionReportItems(
  domain: PatternRoomDomainViewSource,
  overlay?: PatternRoomLocalOverlay
): PatternReportItem[] {
  if (overlay === undefined) {
    return [];
  }

  return overlay.localAuthoredEdges
    .map((edge) => {
      const body = adaptLocalConnectionBullet(domain, overlay, edge);
      if (body === null) {
        return null;
      }
      return createReportItem(
        `report-local-edge-${edge.id}`,
        "Yerel bağlantı",
        body,
        ["Yerel iz", "Kullanıcı tarafından eklenen"],
        edge.note === null ? null : `Not: ${edge.note}`
      );
    })
    .filter((item): item is PatternReportItem => item !== null);
}

function createTenthManReportItems(
  domain: PatternRoomDomainViewSource,
  overlay?: PatternRoomLocalOverlay
): PatternReportItem[] {
  const session = adaptTenthManViewModel(domain, overlay).tenthManSession;
  const referenceItems = session.references.map((reference) => {
    const kindLabel =
      reference.kind === "source"
        ? "Kaynak referansı"
        : reference.kind === "evidence"
          ? "Kanıt referansı"
          : "Pano referansı";
    return createReportItem(
      `report-tenth-reference-${reference.id}`,
      reference.label,
      reference.note,
      ["10. Adam referansı", kindLabel]
    );
  });
  const turnItems =
    overlay?.debateLocalTurns.map((turn) => {
      return createReportItem(
        `report-tenth-turn-${turn.id}`,
        `${DEBATE_ROLE_LABELS[turn.role]} yerel turu`,
        createReportLocalTraceText(turn.content),
        ["Yerel oturum turu", `Faz: ${DEBATE_PHASE_LABELS[turn.phaseKey]}`]
      );
    }) ?? [];
  const verdict = overlay?.debateLocalVerdict ?? null;
  const verdictItems =
    verdict === null
      ? []
      : [
          createReportItem(
            "report-tenth-verdict",
            "Yerel tartışma özeti",
            createReportLocalTraceText(verdict),
            ["Yerel oturum özeti", "Henüz doğrulanmamış"]
          ),
        ];

  return [...referenceItems, ...turnItems, ...verdictItems];
}

function createNextResearchReportItems(overlay?: PatternRoomLocalOverlay): PatternReportItem[] {
  const noteItems =
    overlay?.localNotes.map((note) => {
      return createReportItem(`report-local-note-${note.id}`, "Kullanıcı notu", note.text, [
        "Kullanıcı tarafından eklenen",
        "Sonraki araştırma için",
      ]);
    }) ?? [];
  const uncertaintyItems =
    overlay?.localAuthoredNodes
      .filter((node) => node.nodeType === "uncertainty")
      .map((node) => {
        return createReportItem(`report-next-uncertainty-${node.id}`, node.label, node.content, [
          "Belirsizlik",
          "Sonraki araştırma için",
        ]);
      }) ?? [];

  return [...noteItems, ...uncertaintyItems];
}

export function adaptReportViewModel(
  domain: PatternRoomDomainViewSource,
  overlay?: PatternRoomLocalOverlay
): PatternReportViewModel {
  const sourceItems = createSourceSummaryReportItems(domain, overlay);
  const evidenceItems = createEvidenceReportItems(overlay);
  const boardNoteItems = createBoardNoteReportItems(overlay);
  const connectionItems = createLocalConnectionReportItems(domain, overlay);
  const tenthManItems = createTenthManReportItems(domain, overlay);
  const nextResearchItems = createNextResearchReportItems(overlay);
  const localSourceCount = overlay?.localAuthoredSources.length ?? 0;
  const debateReferenceCount = adaptTenthManViewModel(domain, overlay).tenthManSession.references
    .length;
  const debateTurnCount = overlay?.debateLocalTurns.length ?? 0;
  const debateSummaryCount = overlay?.debateLocalVerdict === null || overlay === undefined ? 0 : 1;

  const itemsBySection: Record<PatternReportSectionId, PatternReportItem[]> = {
    "report-source-summary": sourceItems,
    "report-evidence-notes": evidenceItems,
    "report-board-notes": boardNoteItems,
    "report-local-connections": connectionItems,
    "report-tenth-man-traces": tenthManItems,
    "report-next-research-notes": nextResearchItems,
  };
  const metricsBySection: Record<PatternReportSectionId, PatternReportMetric[]> = {
    "report-source-summary": [{ id: "sources", label: "kaynak", value: sourceItems.length }],
    "report-evidence-notes": [{ id: "evidence", label: "kanıt notu", value: evidenceItems.length }],
    "report-board-notes": [{ id: "board-notes", label: "pano notu", value: boardNoteItems.length }],
    "report-local-connections": [
      { id: "connections", label: "bağlantı", value: connectionItems.length },
    ],
    "report-tenth-man-traces": [
      { id: "references", label: "referans", value: debateReferenceCount },
      { id: "turns", label: "tur", value: debateTurnCount },
      { id: "summary", label: "özet", value: debateSummaryCount },
    ],
    "report-next-research-notes": [
      { id: "research-notes", label: "araştırma notu", value: nextResearchItems.length },
    ],
  };
  const noteBySection: Partial<Record<PatternReportSectionId, string>> = {
    "report-source-summary": `Archive sayımı: ${domain.sources.length} domain kaynak, ${localSourceCount} yerel kaynak.`,
    "report-tenth-man-traces":
      "Seçilmiş referanslar, yerel oturum turları ve varsa oturum özeti birbirinden ayrı gösterilir.",
  };
  const sections: PatternReportSection[] = REPORT_SECTION_ORDER.map((sectionId) => {
    return createReportSection(
      sectionId,
      itemsBySection[sectionId],
      metricsBySection[sectionId],
      noteBySection[sectionId]
    );
  });

  return {
    reportSummary: {
      id: `report-summary-${domain.topic.id}`,
      label: "Taslak rapor terminali",
      status: "dummy",
      sections,
    },
  };
}

export function adaptDomainToViewModels(
  domain: PatternRoomDomainViewSource,
  overlay?: PatternRoomLocalOverlay
): PatternRoomWorkspaceModel {
  return {
    ...adaptOverviewViewModel(domain, overlay),
    ...adaptBoardViewModel(domain, overlay),
    ...adaptArchiveViewModel(domain, overlay),
    ...adaptDeskViewModel(domain, overlay),
    ...adaptTenthManViewModel(domain, overlay),
    ...adaptReportViewModel(domain, overlay),
  };
}
