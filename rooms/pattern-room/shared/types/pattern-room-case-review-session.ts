import type { PatternRoomCaseReviewResult } from "./pattern-room-case-review-result.js";
import type { PatternRoomCaseReviewRoleSlot } from "./pattern-room-case-review-role.js";

export const PATTERN_ROOM_CASE_REVIEW_EVENT = "pattern:case-review-event" as const;

export type PatternRoomCaseReviewDispatchOperation = "start" | "retry" | "resend";

export type PatternRoomCaseReviewApplyMode =
  "all" | "open-questions-only" | "evidence-suggestions-only";

export type PatternRoomCaseReviewApplySummary = {
  readonly mode: PatternRoomCaseReviewApplyMode;
  readonly boardNotesAdded: number;
  readonly evidenceAdded: number;
  readonly evidenceCandidatesAdded?: number;
  readonly openQuestionsAdded: number;
  readonly uncertaintyAdded: number;
  readonly connectionsAdded: number;
  readonly skipped: number;
  readonly warnings: readonly string[];
};

export type PatternRoomCaseReviewSessionStatus =
  | "preview"
  | "dispatching"
  | "waiting-reply"
  | "ready"
  | "failed"
  | "timed-out"
  | "cancelled"
  | "applied";

export type PatternRoomCaseReviewReply = {
  readonly text: string;
  readonly responseHash: string;
  readonly messageId: string | null;
  readonly clientRequestId: string | null;
  readonly brokerMessageId: string | null;
  readonly receivedAt: string;
};

export type PatternRoomCaseReviewError = {
  readonly code: string;
  readonly message: string;
};

export type PatternRoomCaseReviewSession = {
  readonly sessionId: string;
  readonly role: PatternRoomCaseReviewRoleSlot;
  readonly reviewLabel: string;
  readonly status: PatternRoomCaseReviewSessionStatus;
  readonly requestId: string | null;
  readonly operation: PatternRoomCaseReviewDispatchOperation;
  readonly parentSessionId: string | null;
  readonly attempt: number;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly failedAt: string | null;
  readonly cancelledAt: string | null;
  readonly appliedAt: string | null;
  readonly reply: PatternRoomCaseReviewReply | null;
  readonly result: PatternRoomCaseReviewResult | null;
  readonly applySummary: PatternRoomCaseReviewApplySummary | null;
  readonly error: PatternRoomCaseReviewError | null;
  readonly packetHash: string;
  readonly responseHash: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly lastEvent: PatternRoomCaseReviewEventType;
};

export type PatternRoomCaseReviewHistoryEntry = {
  readonly sessionId: string;
  readonly requestId: string | null;
  readonly timestamp: string;
  readonly role: PatternRoomCaseReviewRoleSlot;
  readonly packetHash: string;
  readonly responseHash: string | null;
  readonly state: PatternRoomCaseReviewSessionStatus;
  readonly operation: PatternRoomCaseReviewDispatchOperation;
  readonly attempt: number;
};

export type PatternRoomCaseReviewRuntimeState = {
  readonly activeSession: PatternRoomCaseReviewSession | null;
  readonly history: readonly PatternRoomCaseReviewHistoryEntry[];
  readonly seenReplyKeys: readonly string[];
  readonly revision: number;
};

export type PatternRoomCaseReviewEventType =
  | "preview-created"
  | "dispatch-started"
  | "dispatch-sent"
  | "waiting-reply"
  | "reply-received"
  | "parsed"
  | "review-ready"
  | "review-applied"
  | "dispatch-failed"
  | "timeout"
  | "reply-invalid"
  | "parse-failed"
  | "cancelled";

type PatternRoomCaseReviewBaseEvent = {
  readonly sessionId: string;
  readonly occurredAt: string;
};

export type PatternRoomCaseReviewEvent =
  | (PatternRoomCaseReviewBaseEvent & {
      readonly type: "preview-created";
      readonly role: PatternRoomCaseReviewRoleSlot;
      readonly reviewLabel: string;
      readonly packetHash: string;
      readonly metadata?: Readonly<Record<string, unknown>>;
    })
  | (PatternRoomCaseReviewBaseEvent & {
      readonly type: "dispatch-started";
      readonly requestId: string;
      readonly operation: PatternRoomCaseReviewDispatchOperation;
      readonly parentSessionId?: string | null;
      readonly attempt?: number;
    })
  | (PatternRoomCaseReviewBaseEvent & {
      readonly type: "dispatch-sent" | "waiting-reply";
      readonly requestId: string;
    })
  | (PatternRoomCaseReviewBaseEvent & {
      readonly type: "reply-received";
      readonly requestId: string;
      readonly reply: PatternRoomCaseReviewReply;
    })
  | (PatternRoomCaseReviewBaseEvent & {
      readonly type: "parsed" | "review-ready";
      readonly requestId: string;
      readonly result: PatternRoomCaseReviewResult;
    })
  | (PatternRoomCaseReviewBaseEvent & {
      readonly type: "review-applied";
      readonly requestId: string;
      readonly mode: PatternRoomCaseReviewApplyMode;
      readonly summary?: PatternRoomCaseReviewApplySummary;
    })
  | (PatternRoomCaseReviewBaseEvent & {
      readonly type: "dispatch-failed" | "timeout" | "reply-invalid" | "parse-failed";
      readonly requestId: string;
      readonly error: PatternRoomCaseReviewError;
    })
  | (PatternRoomCaseReviewBaseEvent & {
      readonly type: "cancelled";
      readonly requestId: string | null;
      readonly reason?: string | null;
    });

export type PatternRoomCaseReviewEventPayload = {
  readonly event: PatternRoomCaseReviewEvent;
  readonly state: PatternRoomCaseReviewRuntimeState;
};
