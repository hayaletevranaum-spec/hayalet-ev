export const PATTERN_ROOM_CASE_PACKET_VERSION = 1 as const;

export type PatternRoomCasePacketLimits = {
  maxSources: number;
  maxEvidence: number;
  maxBoardNotes: number;
  maxConnections: number;
  excerptMaxLength: number;
};

export type PatternRoomCasePacketSource = {
  id: string;
  label: string;
  typeLabel: string;
  origin: string;
  status: string;
  preview: string;
  segmentCount?: number | null;
};

export type PatternRoomCasePacketEvidence = {
  id: string;
  label: string;
  sourceLabel?: string | null;
  excerptPreview: string;
  interpretationPreview?: string | null;
  layer: string;
};

export type PatternRoomCasePacketBoardNote = {
  id: string;
  label: string;
  type: string;
  layer: string;
  contentPreview: string;
};

export type PatternRoomCasePacketConnection = {
  id: string;
  sourceId?: string;
  sourceLabel: string;
  edgeTypeLabel: string;
  targetId?: string;
  targetLabel: string;
  notePreview?: string | null;
};

export type PatternRoomCasePacketDebate = {
  phaseLabel: string;
  statusLabel: string;
  referenceCount: number;
  turnCount: number;
  verdictPreview?: string | null;
  turnPreviews: string[];
};

export type PatternRoomCasePacket = {
  packetVersion: typeof PATTERN_ROOM_CASE_PACKET_VERSION;
  roomId: "pattern-room";
  topicLabel: string;
  researchQuestion?: string | null;
  generatedFrom: "local-view-model";
  caution: string;
  sources: PatternRoomCasePacketSource[];
  evidence: PatternRoomCasePacketEvidence[];
  boardNotes: PatternRoomCasePacketBoardNote[];
  connections: PatternRoomCasePacketConnection[];
  debate: PatternRoomCasePacketDebate;
  openQuestions: string[];
  limits: PatternRoomCasePacketLimits;
};
