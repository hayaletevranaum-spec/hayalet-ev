import type { PatternEdgeType } from "./pattern-room-domain.js";

export const PATTERN_ROOM_CASE_REVIEW_RESULT_VERSION = 1 as const;

export const PATTERN_ROOM_CASE_REVIEW_SECTION_KEYS = [
  "observation",
  "evidence",
  "analysis",
  "counterArgument",
  "missingInformation",
  "openQuestions",
  "confidenceNotes",
] as const;

export type PatternRoomCaseReviewSectionKey =
  (typeof PATTERN_ROOM_CASE_REVIEW_SECTION_KEYS)[number];

export type PatternRoomCaseReviewSuggestionKind =
  | "review_observation"
  | "review_analysis"
  | "review_counter_argument"
  | "evidence_candidate"
  | "connection_candidate"
  | "open_question"
  | "uncertainty_note";

export type PatternRoomCaseReviewResultItem = {
  readonly id: string;
  readonly section: PatternRoomCaseReviewSectionKey;
  readonly text: string;
};

export type PatternRoomCaseReviewSection = {
  readonly key: PatternRoomCaseReviewSectionKey;
  readonly label: string;
  readonly items: readonly PatternRoomCaseReviewResultItem[];
  readonly rawText: string;
};

export type PatternRoomCaseReviewConnectionSuggestion = {
  readonly sourceId: string;
  readonly edgeType: PatternEdgeType;
  readonly targetId: string;
  readonly note: string | null;
  readonly rawText: string;
};

export type PatternRoomCaseReviewSuggestion = {
  readonly id: string;
  readonly kind: PatternRoomCaseReviewSuggestionKind;
  readonly text: string;
  readonly section: PatternRoomCaseReviewSectionKey;
  readonly sourceItemId: string | null;
  readonly connection: PatternRoomCaseReviewConnectionSuggestion | null;
};

export type PatternRoomCaseReviewWarningCode =
  "empty-reply" | "malformed-format" | "unknown-section" | "empty-section" | "invalid-connection";

export type PatternRoomCaseReviewWarning = {
  readonly code: PatternRoomCaseReviewWarningCode;
  readonly message: string;
  readonly section: PatternRoomCaseReviewSectionKey | null;
  readonly rawText: string | null;
};

export type PatternRoomCaseReviewResult = {
  readonly resultVersion: typeof PATTERN_ROOM_CASE_REVIEW_RESULT_VERSION;
  readonly sections: Readonly<
    Record<PatternRoomCaseReviewSectionKey, PatternRoomCaseReviewSection>
  >;
  readonly items: readonly PatternRoomCaseReviewResultItem[];
  readonly suggestions: readonly PatternRoomCaseReviewSuggestion[];
  readonly warnings: readonly PatternRoomCaseReviewWarning[];
  readonly confidence: readonly string[];
  readonly missingEvidence: readonly string[];
  readonly suggestedConnections: readonly PatternRoomCaseReviewConnectionSuggestion[];
  readonly openQuestions: readonly string[];
  readonly summary: string;
  readonly rawText: string;
  readonly fallbackUsed: boolean;
};
