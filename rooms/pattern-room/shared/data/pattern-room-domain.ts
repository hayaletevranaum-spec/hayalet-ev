import type {
  DebateRole,
  PatternRoomDomainData as PatternRoomDomainDataContract,
} from "../types/pattern-room-domain.js";

export type PatternRoomDomainData = PatternRoomDomainDataContract;

const EMPTY_CASE_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const EMPTY_CASE_TOPIC_ID = "pattern-room-local-case";
const EMPTY_CASE_REVIEW_ID = "pattern-room-local-review";

const DEFAULT_REVIEW_ROLES: DebateRole[] = [
  {
    slotId: "AI0",
    role: "researcher",
    label: "AI0 Researcher",
    connected: false,
    provider: null,
  },
  {
    slotId: "AI1",
    role: "advocate",
    label: "AI1 Advocate",
    connected: false,
    provider: null,
  },
  {
    slotId: "AI2",
    role: "tenth-man",
    label: "AI2 Tenth Man",
    connected: false,
    provider: null,
  },
  {
    slotId: "US1",
    role: "arbiter",
    label: "US1 Arbiter",
    connected: false,
    provider: null,
  },
];

export function createEmptyPatternRoomDomain(): PatternRoomDomainData {
  return {
    topic: {
      id: EMPTY_CASE_TOPIC_ID,
      label: "Yeni Araştırma",
      description: "Henüz araştırma konusu ve vaka verisi eklenmedi.",
      status: "draft",
      createdAt: EMPTY_CASE_TIMESTAMP,
      updatedAt: EMPTY_CASE_TIMESTAMP,
      rootNodeId: null,
    },
    nodes: [],
    edges: [],
    sources: [],
    evidence: [],
    debateSession: {
      id: EMPTY_CASE_REVIEW_ID,
      topicId: EMPTY_CASE_TOPIC_ID,
      status: "pending",
      prompt: "Araştırma verileri ve inceleme referansları eklendikten sonra oturum hazırlanabilir.",
      roles: DEFAULT_REVIEW_ROLES.map((role) => ({ ...role })),
      turns: [],
      verdict: null,
      startedAt: EMPTY_CASE_TIMESTAMP,
      endedAt: null,
    },
    reportTrace: [],
  };
}

export const PATTERN_ROOM_DOMAIN: PatternRoomDomainData = createEmptyPatternRoomDomain();
