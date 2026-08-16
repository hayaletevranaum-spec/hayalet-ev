import type { PatternLayer } from "./pattern-room-domain.js";

export type PatternRoomEvidenceCandidate = {
  readonly id: string;
  readonly suggestionId: string;
  readonly text: string;
  readonly reviewSessionId: string | null;
  readonly origin: "ai-case-review";
  readonly sourceSection: "evidence";
  readonly status: "candidate";
  readonly createdAt: string;
};

export type PatternRoomEvidenceCandidatePromotionInput = {
  readonly candidateId: string;
  readonly sourceId: string;
  readonly excerpt: string;
  readonly label?: string;
  readonly interpretation?: string;
  readonly layer?: PatternLayer;
};

export type PatternRoomEvidenceCandidatePromotionResult = {
  readonly candidateId: string;
  readonly promoted: boolean;
  readonly evidenceId: string | null;
  readonly warnings: readonly string[];
};
