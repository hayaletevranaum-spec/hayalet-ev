import { createPatternRoomCaseReviewHash } from "./pattern-room-case-review-hash.js";
import { createPatternRoomCaseReviewOutputContract } from "./pattern-room-case-review-output-contract.js";
import type { PatternActorId } from "../types/pattern-room-domain.js";
import type { PatternRoomCasePacket } from "../types/pattern-room-case-packet.js";
import {
  PATTERN_ROOM_CASE_REVIEW_MESSAGE_VERSION,
  PATTERN_ROOM_CASE_REVIEW_PROTOCOL_KEY,
  PATTERN_ROOM_CASE_REVIEW_SCENARIO,
  type PatternRoomCaseReviewMessage,
} from "../types/pattern-room-case-review-message.js";
import {
  getPatternRoomCaseReviewRoleProfile,
  isPatternRoomCaseReviewRoleSlot,
  type PatternRoomCaseReviewRoleSlot,
} from "../types/pattern-room-case-review-role.js";

export type PatternRoomCaseReviewMessageOptions = {
  readonly maxCasePacketChars?: number;
};

export type PatternRoomCaseReviewMessageInput = {
  readonly protocolText?: string | null;
  readonly casePacket: PatternRoomCasePacket;
  readonly roleSlot: PatternActorId;
  readonly taskPrompt?: string | null;
  readonly options?: PatternRoomCaseReviewMessageOptions;
};

const DEFAULT_TASK_PROMPT =
  "Bu vaka paketini temkinli biçimde gözden geçir; hüküm dili üretmeden önemli izleri, belirsizlikleri ve sonraki araştırma sorularını çıkar.";

const TRUNCATION_SUFFIX = "...";

function normalizeBlockText(value: string | null | undefined): string {
  return value?.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim() ?? "";
}

function normalizePlainText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function normalizeMaxCasePacketChars(value: number | undefined): number | null {
  if (value === undefined || Number.isFinite(value) === false) {
    return null;
  }

  return Math.max(0, Math.floor(value));
}

function resolveRoleSlot(
  roleSlot: PatternActorId,
  warnings: string[]
): PatternRoomCaseReviewRoleSlot {
  if (isPatternRoomCaseReviewRoleSlot(roleSlot)) {
    return roleSlot;
  }

  warnings.push("system roleSlot case review hedefi değildir; US1 rolü kullanıldı.");
  return "US1";
}

function createProtocolNotice(protocolText: string | null | undefined): string {
  const normalizedProtocolText = normalizeBlockText(protocolText);
  const header = [
    "[Protocol Notice]",
    `protocolKey: ${PATTERN_ROOM_CASE_REVIEW_PROTOCOL_KEY}`,
    `scenario: ${PATTERN_ROOM_CASE_REVIEW_SCENARIO}`,
  ].join("\n");

  if (normalizedProtocolText === "") {
    return `${header}\n\nProtocol içeriği transport sırasında protocolKey üzerinden çözümlenir.`;
  }

  return `${header}\n\n${normalizedProtocolText}`;
}

function createRoleInstructions(roleSlot: PatternRoomCaseReviewRoleSlot): {
  readonly label: string;
  readonly reviewLabel: string;
  readonly section: string;
} {
  const roleProfile = getPatternRoomCaseReviewRoleProfile(roleSlot);
  return {
    label: roleProfile.roleLabel,
    reviewLabel: roleProfile.reviewLabel,
    section: [
      "[Role Instructions]",
      `role: ${roleProfile.roleLabel}`,
      roleProfile.instructions,
    ].join("\n"),
  };
}

function truncateCasePacketBody(
  serializedCasePacket: string,
  maxCasePacketChars: number | null,
  warnings: string[]
): string {
  if (maxCasePacketChars === null || serializedCasePacket.length <= maxCasePacketChars) {
    return serializedCasePacket;
  }

  warnings.push(`Case Packet bölümü ${maxCasePacketChars} karakterlik mesaj sınırına kırpıldı.`);

  if (maxCasePacketChars <= 0) {
    return "";
  }

  if (maxCasePacketChars <= TRUNCATION_SUFFIX.length) {
    return serializedCasePacket.slice(0, maxCasePacketChars);
  }

  return `${serializedCasePacket.slice(0, maxCasePacketChars - TRUNCATION_SUFFIX.length).trimEnd()}${TRUNCATION_SUFFIX}`;
}

function createCasePacketSection(
  casePacket: PatternRoomCasePacket,
  maxCasePacketChars: number | null,
  warnings: string[]
): string {
  const serializedCasePacket = JSON.stringify(casePacket, null, 2);
  const casePacketBody = truncateCasePacketBody(serializedCasePacket, maxCasePacketChars, warnings);

  return [
    "[Case Packet]",
    "Bu bölüm dinamik yerel Case Packet verisinin inceleme görünümüdür.",
    casePacketBody,
  ]
    .filter((part) => part !== "")
    .join("\n");
}

function createTaskPromptSection(taskPrompt: string | null | undefined): string {
  const normalizedTaskPrompt = normalizePlainText(taskPrompt);
  const resolvedTaskPrompt =
    normalizedTaskPrompt === "" ? DEFAULT_TASK_PROMPT : normalizedTaskPrompt;

  return [
    "[Task Prompt]",
    resolvedTaskPrompt,
    "",
    createPatternRoomCaseReviewOutputContract(),
  ].join("\n");
}

export function createPatternRoomCaseReviewMessage(
  input: PatternRoomCaseReviewMessageInput
): PatternRoomCaseReviewMessage {
  const warnings: string[] = [];
  const roleSlot = resolveRoleSlot(input.roleSlot, warnings);
  const roleInstructions = createRoleInstructions(roleSlot);
  const packetHash = createPatternRoomCaseReviewHash(input.casePacket);
  const maxCasePacketChars = normalizeMaxCasePacketChars(input.options?.maxCasePacketChars);
  const sections = {
    protocolNotice: createProtocolNotice(input.protocolText),
    roleInstructions: roleInstructions.section,
    casePacket: createCasePacketSection(input.casePacket, maxCasePacketChars, warnings),
    taskPrompt: createTaskPromptSection(input.taskPrompt),
  };
  const dispatchText = [sections.roleInstructions, sections.casePacket, sections.taskPrompt].join(
    "\n\n---\n\n"
  );

  return {
    messageVersion: PATTERN_ROOM_CASE_REVIEW_MESSAGE_VERSION,
    roomId: "pattern-room",
    protocolKey: PATTERN_ROOM_CASE_REVIEW_PROTOCOL_KEY,
    scenario: PATTERN_ROOM_CASE_REVIEW_SCENARIO,
    roleSlot,
    roleLabel: roleInstructions.label,
    reviewLabel: roleInstructions.reviewLabel,
    packetHash,
    sections,
    dispatchText,
    previewText: [sections.protocolNotice, dispatchText].join("\n\n---\n\n"),
    warnings,
  };
}
