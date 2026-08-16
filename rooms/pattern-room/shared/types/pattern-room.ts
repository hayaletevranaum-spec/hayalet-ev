import type { DebateLocalPhase, DebateLocalTurn } from "../state/pattern-room-local-state.js";
import type { LongTextSourceKind } from "../source-producers/index.js";
import type { PatternEdgeType } from "./pattern-room-domain.js";

export type PatternViewId = "overview" | "board" | "desk" | "archive" | "tenth-man" | "report";

export type PatternBoardCategoryTone = "evidence" | "analysis" | "commentary" | "uncertainty";

export type PatternBoardLayerId = "evidence" | "analysis" | "interpretation" | "uncertainty";

export type PatternBoardPin = {
  id: string;
  label: string;
  layer: PatternBoardLayerId;
  layerLabel: string;
  tone: PatternBoardCategoryTone;
  confidenceLabel: string;
  content: string;
  sourceId: string | null;
  sourceLabel: string;
  origin: string | null;
  kind: "node" | "source" | "evidence" | "placeholder";
  isLocal: boolean;
};

export type PatternClaim = {
  id: string;
  label: string;
  summary: string;
  stance: "primary" | "counter";
};

export type PatternBoardCategory = {
  id: string;
  label: string;
  tone: PatternBoardCategoryTone;
  summary: string;
  pins: PatternBoardPin[];
};

export type PatternSource = {
  id: string;
  label: string;
  sourceTypeLabel: string;
  origin: string;
  status: "mocked" | "local";
  note: string;
  notePreview?: string;
  metadataLine?: string;
  segments?: readonly PatternSourceSegment[];
  isLocal?: boolean;
};

export type PatternSourceSegment = {
  id: string;
  label: string;
  text: string;
  order: number;
};

export type PatternDummyRole = {
  id: string;
  label: string;
  note: string;
  connected?: boolean;
};

export type PatternDebateReference = {
  id: string;
  label: string;
  note: string;
  kind: "node" | "source" | "evidence";
};

export type PatternReportMetric = {
  id: string;
  label: string;
  value: number;
};

export type PatternReportSection = {
  id: string;
  label: string;
  tone: PatternBoardCategoryTone;
  note: string;
  metrics: PatternReportMetric[];
  bullets: string[];
  items: PatternReportItem[];
  emptyMessage: string;
};

export type PatternReportItem = {
  id: string;
  label: string;
  body: string;
  meta: string[];
  detail: string | null;
};

export type PatternAuthoredEvidenceOptions = {
  sourceId?: string;
  sourceLabel?: string;
};

export type PatternConnectionOption = {
  id: string;
  label: string;
  kind: "node" | "source" | "evidence";
  isLocal: boolean;
};

export type PatternConnectionScope = "domain" | "local";

export type PatternConnection = {
  id: string;
  edgeType: PatternEdgeType;
  edgeTypeLabel: string;
  sourceId: string;
  sourceLabel: string;
  targetId: string;
  targetLabel: string;
  note: string | null;
  scope: PatternConnectionScope;
  editable: boolean;
};

export type PatternTenthManSession = {
  id: string;
  label: string;
  status: "dummy" | "active" | "completed";
  prompt: string;
  roles: PatternDummyRole[];
  references: PatternDebateReference[];
  phase?: DebateLocalPhase;
  turns?: DebateLocalTurn[];
  verdict?: string | null;
};

export type PatternReportSummary = {
  id: string;
  label: string;
  status: "dummy";
  sections: PatternReportSection[];
};

export type PatternRoomWorkspaceModel = {
  roomTitle: string;
  roomLabel: string;
  roomSummary: string;
  subject: string;
  researchQuestion: string;
  boardCategories: PatternBoardCategory[];
  connectionOptions: PatternConnectionOption[];
  connections: PatternConnection[];
  claims: PatternClaim[];
  sources: PatternSource[];
  tenthManSession: PatternTenthManSession;
  reportSummary: PatternReportSummary;
};

export type PatternSampleSourceImportStatus = {
  packageId: string;
  message: string;
  duplicate: boolean;
  sourcesAdded: number;
  evidenceAdded: number;
  nodesAdded: number;
  edgesAdded: number;
  notesAdded: number;
  duplicatesSkipped: number;
  warningCount: number;
};

export type PatternUserTextSourceImportInput = {
  title: string;
  text: string;
  language?: string;
};

export type PatternUserTextSourceImportStatus = {
  packageIds: readonly string[];
  message: string;
  success: boolean;
  duplicate: boolean;
  sourcesAdded: number;
  evidenceAdded: number;
  nodesAdded: number;
  edgesAdded: number;
  notesAdded: number;
  duplicatesSkipped: number;
  warningCount: number;
  errorCount: number;
};

export type PatternLongTextSourceImportInput = {
  title: string;
  origin: string;
  sourceKind: LongTextSourceKind;
  chapter?: string;
  page?: string;
  text: string;
  language?: string;
};

export type PatternLongTextSourceImportStatus = PatternUserTextSourceImportStatus & {
  segmentCount: number;
};

export type PatternPanelActions = {
  updateCaseIdentity: (caseLabel: string, researchQuestion: string) => void;
  getSelectedNodeId: () => string | null;
  selectNode: (nodeId: string | null) => void;
  getSelectedConnectionId: () => string | null;
  selectConnection: (connectionId: string | null) => void;
  sendNodeToDesk: (nodeId: string) => void;
  addNodeToDebate: (nodeId: string) => void;
  pinSourceToBoard: (sourceId: string, layer: PatternBoardLayerId) => void;
  addSourceToDebate: (sourceId: string) => void;
  addLocalNote: (text: string) => void;
  addAuthoredClaim: (label: string, content: string) => void;
  addAuthoredInspiration: (label: string, content: string) => void;
  addAuthoredUncertainty: (label: string, content: string) => void;
  addAuthoredSource: (label: string, origin: string, note: string) => void;
  removeLocalSource: (sourceId: string) => void;
  removeLocalNode: (nodeId: string) => void;
  removeLocalEvidence: (evidenceId: string) => void;
  resetLocalSession: () => void;
  addAuthoredEvidence: (
    label: string,
    excerpt: string,
    interpretation?: string,
    layer?: PatternBoardLayerId,
    options?: PatternAuthoredEvidenceOptions
  ) => void;
  addAuthoredEdge: (
    edgeType: PatternEdgeType,
    sourceId: string,
    targetId: string,
    note?: string
  ) => void;
  updateLocalEdge: (edgeId: string, edgeType: PatternEdgeType, note?: string) => void;
  importUserTextSource: (
    input: PatternUserTextSourceImportInput
  ) => PatternUserTextSourceImportStatus;
  importLongTextSource: (
    input: PatternLongTextSourceImportInput
  ) => PatternLongTextSourceImportStatus;
  importSampleSourcePackage: (packageId?: string) => PatternSampleSourceImportStatus;
  prepareDebate: () => void;
  assignDebateRoles: () => void;
  startDebate: () => void;
  advanceDebatePhase: () => void;
  completeDebate: () => void;
  reflectDebateToReport: () => void;
};
