export const PATTERN_LAYERS = ["evidence", "analysis", "interpretation", "uncertainty"] as const;

export const PATTERN_SOURCE_TYPES = [
  "book",
  "religious_text",
  "newspaper",
  "subtitle_archive",
  "web_archive",
  "visual",
  "laboratory_result",
  "number_analysis",
  "personal_note",
  "unknown",
] as const;

export const PATTERN_RELIABILITY_LEVELS = [
  "unverified",
  "user_provided",
  "verified",
  "disputed",
  "unknown",
] as const;

export const DEBATE_SESSION_STATUSES = [
  "mock",
  "pending",
  "active",
  "completed",
  "cancelled",
] as const;

export type PatternActorId = "AI0" | "AI1" | "AI2" | "US1" | "system";

export type PatternNodeType =
  | "claim"
  | "source"
  | "quote"
  | "evidence"
  | "inspiration"
  | "analysis"
  | "uncertainty"
  | "contradiction"
  | "decision";

export type PatternEdgeType =
  | "supports"
  | "contradicts"
  | "references"
  | "derived_from"
  | "inspired_by"
  | "questions"
  | "needs_review";

export type PatternLayer = (typeof PATTERN_LAYERS)[number];

export type PatternSourceType = (typeof PATTERN_SOURCE_TYPES)[number];

export type PatternReliability = (typeof PATTERN_RELIABILITY_LEVELS)[number];

export type DebateSessionStatus = (typeof DEBATE_SESSION_STATUSES)[number];

export type PatternTraceType =
  | "node-added"
  | "node-removed"
  | "edge-added"
  | "edge-removed"
  | "source-added"
  | "evidence-added"
  | "debate-started"
  | "debate-turn"
  | "debate-ended"
  | "verdict-set"
  | "confidence-changed"
  | "layer-promoted"
  | "report-generated";

export type Topic = {
  id: string;
  label: string;
  description: string;
  status: "draft" | "active" | "archived";
  createdAt: string;
  updatedAt: string;
  rootNodeId: string | null;
};

export type PatternNode = {
  id: string;
  topicId: string;
  nodeType: PatternNodeType;
  layer: PatternLayer;
  label: string;
  content: string;
  /**
   * Not a truth score; this optional local analysis signal describes how supported or cautious
   * the node is with the current data. Phase 2 nodes may keep it null.
   */
  confidence: number | null;
  sourceRef: string | null;
  createdBy: PatternActorId;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type PatternEdge = {
  id: string;
  topicId: string;
  edgeType: PatternEdgeType;
  sourceNodeId: string;
  targetNodeId: string;
  weight: number;
  createdBy: PatternActorId;
  createdAt: string;
  note: string | null;
};

export type SourceItem = {
  id: string;
  topicId: string;
  label: string;
  sourceType: PatternSourceType;
  origin: string;
  reliability: PatternReliability;
  addedBy: PatternActorId;
  addedAt: string;
};

export type EvidenceItem = {
  id: string;
  topicId: string;
  sourceId: string;
  layer: PatternLayer;
  excerpt: string;
  interpretation: string | null;
  addedBy: PatternActorId;
  addedAt: string;
  linkedNodeIds: string[];
};

export type DebateSession = {
  id: string;
  topicId: string;
  status: DebateSessionStatus;
  prompt: string;
  roles: DebateRole[];
  turns: DebateTurn[];
  verdict: string | null;
  startedAt: string;
  endedAt: string | null;
};

export type DebateRole = {
  slotId: PatternActorId;
  role: "researcher" | "advocate" | "tenth-man" | "arbiter";
  label: string;
  connected: boolean;
  provider: string | null;
};

export type DebateTurn = {
  id: string;
  sessionId: string;
  actorId: PatternActorId;
  content: string;
  stance: "support" | "oppose" | "neutral" | "question";
  referencedNodeIds: string[];
  turnIndex: number;
  createdAt: string;
};

export type ReportTrace = {
  id: string;
  topicId: string;
  traceType: PatternTraceType;
  actorId: PatternActorId | "system";
  summary: string;
  payload: Record<string, unknown>;
  occurredAt: string;
};

export type PatternRoomDomainData = {
  topic: Topic;
  nodes: PatternNode[];
  edges: PatternEdge[];
  sources: SourceItem[];
  evidence: EvidenceItem[];
  debateSession: DebateSession;
  reportTrace: ReportTrace[];
};
