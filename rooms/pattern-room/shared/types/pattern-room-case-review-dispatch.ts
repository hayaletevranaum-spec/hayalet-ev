import type {
  PatternRoomCaseReviewApplyMode,
  PatternRoomCaseReviewApplySummary,
  PatternRoomCaseReviewDispatchOperation,
} from "./pattern-room-case-review-session.js";
import type {
  PatternRoomCaseReviewRoleSlot,
  PatternRoomCaseReviewTargetSlot,
} from "./pattern-room-case-review-role.js";

export { PATTERN_ROOM_CASE_REVIEW_EVENT } from "./pattern-room-case-review-session.js";

export const PATTERN_ROOM_CASE_REVIEW_DISPATCH_ACTION = "message.sendWait" as const;
export const PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND = "pattern:case-review-dispatch" as const;
export const PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND = "pattern:case-review-control" as const;
export const PATTERN_ROOM_CASE_REVIEW_DISPATCHED_EVENT = "pattern:case-review-dispatched" as const;
export const PATTERN_ROOM_CASE_REVIEW_DISPATCH_FAILED_EVENT =
  "pattern:case-review-dispatch-failed" as const;
export const PATTERN_ROOM_CASE_REVIEW_DISPATCH_CONNECT_POLICY = "ensure" as const;
export const PATTERN_ROOM_CASE_REVIEW_TIMEOUT_MS = 120_000 as const;
export const PATTERN_ROOM_CASE_REVIEW_DISPATCH_PROTOCOL = {
  room: "pattern-room",
  scenario: "case-review",
  protocolKey: "pattern-room-case-review",
} as const;

export type PatternRoomCaseReviewDispatchRoleSlot = PatternRoomCaseReviewRoleSlot;

export type { PatternRoomCaseReviewTargetSlot };

export type PatternRoomCaseReviewDispatchProtocol =
  typeof PATTERN_ROOM_CASE_REVIEW_DISPATCH_PROTOCOL;

export type PatternRoomCaseReviewDispatchPayload = {
  readonly action: typeof PATTERN_ROOM_CASE_REVIEW_DISPATCH_ACTION;
  readonly toSlot: PatternRoomCaseReviewTargetSlot;
  readonly connectPolicy: typeof PATTERN_ROOM_CASE_REVIEW_DISPATCH_CONNECT_POLICY;
  readonly timeoutMs: number;
  readonly payload: {
    readonly text: string;
    readonly protocol: PatternRoomCaseReviewDispatchProtocol;
    readonly page?: string;
  };
};

export type PatternRoomCaseReviewDispatchDraft = {
  readonly roleSlot: PatternRoomCaseReviewDispatchRoleSlot;
  readonly targetSlot: PatternRoomCaseReviewTargetSlot;
  readonly packetHash: string;
  readonly payload: PatternRoomCaseReviewDispatchPayload;
  readonly warnings: readonly string[];
};

export type PatternRoomCaseReviewDispatchCommandPayload = {
  readonly sessionId: string;
  readonly requestId: string;
  readonly operation: PatternRoomCaseReviewDispatchOperation;
  readonly parentSessionId?: string | null;
  readonly attempt?: number;
  readonly draft: PatternRoomCaseReviewDispatchDraft;
};

export type PatternRoomCaseReviewControlCommandPayload =
  | {
      readonly action: "cancel";
      readonly sessionId: string;
      readonly requestId: string;
    }
  | {
      readonly action: "apply";
      readonly sessionId: string;
      readonly requestId: string;
      readonly mode: PatternRoomCaseReviewApplyMode;
      readonly summary?: PatternRoomCaseReviewApplySummary;
    };

export type PatternRoomCaseReviewDispatchedEventPayload = {
  readonly roleSlot: PatternRoomCaseReviewDispatchRoleSlot;
  readonly success: true;
  readonly targetSlot: PatternRoomCaseReviewTargetSlot;
  readonly warnings: readonly string[];
  readonly sessionId?: string;
  readonly requestId?: string;
};

export type PatternRoomCaseReviewDispatchFailedEventPayload = {
  readonly error: string;
  readonly success: false;
  readonly sessionId?: string;
  readonly requestId?: string;
};
