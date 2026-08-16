import type { PatternRoomCaseReviewRoleSlot } from "./pattern-room-case-review-role.js";

export type { PatternRoomCaseReviewRoleSlot } from "./pattern-room-case-review-role.js";

export const PATTERN_ROOM_CASE_REVIEW_MESSAGE_VERSION = 1 as const;
export const PATTERN_ROOM_CASE_REVIEW_PROTOCOL_KEY = "pattern-room-case-review" as const;
export const PATTERN_ROOM_CASE_REVIEW_SCENARIO = "case-review" as const;

export type PatternRoomCaseReviewMessageSections = {
  readonly protocolNotice: string;
  readonly roleInstructions: string;
  readonly casePacket: string;
  readonly taskPrompt: string;
};

export type PatternRoomCaseReviewMessage = {
  readonly messageVersion: typeof PATTERN_ROOM_CASE_REVIEW_MESSAGE_VERSION;
  readonly roomId: "pattern-room";
  readonly protocolKey: typeof PATTERN_ROOM_CASE_REVIEW_PROTOCOL_KEY;
  readonly scenario: typeof PATTERN_ROOM_CASE_REVIEW_SCENARIO;
  readonly roleSlot: PatternRoomCaseReviewRoleSlot;
  readonly roleLabel: string;
  readonly reviewLabel: string;
  readonly packetHash: string;
  readonly sections: PatternRoomCaseReviewMessageSections;
  readonly dispatchText: string;
  readonly previewText: string;
  readonly warnings: readonly string[];
};
