import {
  createPatternRoomCasePacketFromProjection,
  type PatternRoomCasePacketProjectionInput,
} from "../shared/adapters/pattern-room-case-packet-projection.js";
import { createPatternRoomCaseReviewDispatchDraft } from "../shared/adapters/pattern-room-case-review-dispatch-adapter.js";
import { createPatternRoomCaseReviewMessage } from "../shared/adapters/pattern-room-case-review-message-adapter.js";
import type {
  PatternRoomCaseReviewDispatchDraft,
  PatternRoomCaseReviewDispatchProtocol,
  PatternRoomCaseReviewTargetSlot,
} from "../shared/types/pattern-room-case-review-dispatch.js";
import type { PatternRoomCaseReviewRoleSlot } from "../shared/types/pattern-room-case-review-role.js";

export const PATTERN_CASE_REVIEW_DEFAULT_ROLE_SLOT: PatternRoomCaseReviewRoleSlot = "AI2";
const CASE_REVIEW_PREVIEW_TASK_PROMPT =
  "Bu vaka paketini seçilen inceleme rolüne göre değerlendir; önemli izleri, zayıf noktaları, çelişkileri ve sonraki araştırma sorularını çıkar. Kesin hüküm üretme.";

export type PatternCaseReviewPreviewDraft = {
  dispatchDraft: PatternRoomCaseReviewDispatchDraft;
  roleSlot: PatternRoomCaseReviewRoleSlot;
  targetSlot: PatternRoomCaseReviewTargetSlot;
  protocol: PatternRoomCaseReviewDispatchProtocol;
  reviewLabel: string;
  text: string;
  warnings: readonly string[];
};

export type PatternCaseReviewDispatchStatusKind = "idle" | "sending" | "sent" | "failed";

export type PatternCaseReviewDispatchStatus = {
  kind: PatternCaseReviewDispatchStatusKind;
  message: string | null;
};

export function createPatternCaseReviewPreviewDraft(
  input: PatternRoomCasePacketProjectionInput,
  roleSlot: PatternRoomCaseReviewRoleSlot = PATTERN_CASE_REVIEW_DEFAULT_ROLE_SLOT
): PatternCaseReviewPreviewDraft {
  const casePacket = createPatternRoomCasePacketFromProjection(input);
  const reviewMessage = createPatternRoomCaseReviewMessage({
    casePacket,
    roleSlot,
    taskPrompt: CASE_REVIEW_PREVIEW_TASK_PROMPT,
  });
  const draft = createPatternRoomCaseReviewDispatchDraft({
    reviewMessage,
  });

  return {
    dispatchDraft: draft,
    roleSlot,
    targetSlot: draft.targetSlot,
    protocol: draft.payload.payload.protocol,
    reviewLabel: reviewMessage.reviewLabel,
    text: reviewMessage.previewText,
    warnings: draft.warnings,
  };
}
