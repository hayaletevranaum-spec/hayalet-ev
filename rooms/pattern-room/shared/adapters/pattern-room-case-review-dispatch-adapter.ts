import type { PatternRoomCaseReviewMessage } from "../types/pattern-room-case-review-message.js";
import {
  PATTERN_ROOM_CASE_REVIEW_DISPATCH_ACTION,
  PATTERN_ROOM_CASE_REVIEW_DISPATCH_CONNECT_POLICY,
  PATTERN_ROOM_CASE_REVIEW_DISPATCH_PROTOCOL,
  PATTERN_ROOM_CASE_REVIEW_TIMEOUT_MS,
  type PatternRoomCaseReviewDispatchDraft,
} from "../types/pattern-room-case-review-dispatch.js";
import { getPatternRoomCaseReviewRoleProfile } from "../types/pattern-room-case-review-role.js";

export type PatternRoomCaseReviewDispatchOptions = {
  readonly page?: string | null;
  readonly timeoutMs?: number;
};

export type PatternRoomCaseReviewDispatchInput = {
  readonly reviewMessage: PatternRoomCaseReviewMessage;
  readonly options?: PatternRoomCaseReviewDispatchOptions;
};

function normalizePlainText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function normalizeTimeoutMs(value: number | undefined): number {
  if (value === undefined || Number.isFinite(value) === false) {
    return PATTERN_ROOM_CASE_REVIEW_TIMEOUT_MS;
  }

  return Math.max(1, Math.floor(value));
}

export function createPatternRoomCaseReviewDispatchDraft(
  input: PatternRoomCaseReviewDispatchInput
): PatternRoomCaseReviewDispatchDraft {
  const roleProfile = getPatternRoomCaseReviewRoleProfile(input.reviewMessage.roleSlot);
  const page = normalizePlainText(input.options?.page);

  return {
    roleSlot: input.reviewMessage.roleSlot,
    targetSlot: roleProfile.targetSlot,
    packetHash: input.reviewMessage.packetHash,
    payload: {
      action: PATTERN_ROOM_CASE_REVIEW_DISPATCH_ACTION,
      toSlot: roleProfile.targetSlot,
      connectPolicy: PATTERN_ROOM_CASE_REVIEW_DISPATCH_CONNECT_POLICY,
      timeoutMs: normalizeTimeoutMs(input.options?.timeoutMs),
      payload: {
        text: input.reviewMessage.dispatchText,
        protocol: { ...PATTERN_ROOM_CASE_REVIEW_DISPATCH_PROTOCOL },
        ...(page === "" ? {} : { page }),
      },
    },
    warnings: [...input.reviewMessage.warnings],
  };
}
