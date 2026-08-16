import type { PatternActorId } from "./pattern-room-domain.js";

export const PATTERN_ROOM_CASE_REVIEW_ROLE_SLOTS = ["AI0", "AI1", "AI2", "US1"] as const;

export type PatternRoomCaseReviewRoleSlot = Exclude<PatternActorId, "system">;

export type PatternRoomCaseReviewTargetSlot = "ai0" | "ai1" | "ai2" | "us1";

export type PatternRoomCaseReviewRoleProfile = {
  readonly roleSlot: PatternRoomCaseReviewRoleSlot;
  readonly targetSlot: PatternRoomCaseReviewTargetSlot;
  readonly roleLabel: string;
  readonly reviewLabel: string;
  readonly instructions: string;
};

export const PATTERN_ROOM_CASE_REVIEW_ROLE_PROFILES: Readonly<
  Record<PatternRoomCaseReviewRoleSlot, PatternRoomCaseReviewRoleProfile>
> = {
  AI0: {
    roleSlot: "AI0",
    targetSlot: "ai0",
    roleLabel: "AI0 — araştırmacı / düzenleyici",
    reviewLabel: "Araştırmacı İncelemesi",
    instructions:
      "Kaynakları, kanıt notlarını, bağlantıları ve açık soruları düzenle; eksik bağlamları ayrı tut.",
  },
  AI1: {
    roleSlot: "AI1",
    targetSlot: "ai1",
    roleLabel: "AI1 — savunucu / güçlü yorum testçisi",
    reviewLabel: "Güçlü Yorum Testi",
    instructions:
      "Mevcut yorumu en güçlü temkinli haliyle sına; dayanakları, karşı işaretleri ve boşlukları ayır.",
  },
  AI2: {
    roleSlot: "AI2",
    targetSlot: "ai2",
    roleLabel: "AI2 — 10. Adam / karşı argüman ve boşluk arayıcı",
    reviewLabel: "10. Adam İncelemesi",
    instructions:
      "Varsayımları zorla; zayıf noktaları, alternatif açıklamaları ve görülmeyen araştırma sorularını çıkar.",
  },
  US1: {
    roleSlot: "US1",
    targetSlot: "us1",
    roleLabel: "US1 — hakem / son gözden geçiren",
    reviewLabel: "Hakem İncelemesi",
    instructions: "Bulguları, çelişkileri ve karar öncesi açık seçenekleri insan odağında toparla.",
  },
};

export function isPatternRoomCaseReviewRoleSlot(
  value: unknown
): value is PatternRoomCaseReviewRoleSlot {
  return (
    typeof value === "string" &&
    (PATTERN_ROOM_CASE_REVIEW_ROLE_SLOTS as readonly string[]).includes(value)
  );
}

export function getPatternRoomCaseReviewRoleProfile(
  roleSlot: PatternRoomCaseReviewRoleSlot
): PatternRoomCaseReviewRoleProfile {
  return PATTERN_ROOM_CASE_REVIEW_ROLE_PROFILES[roleSlot];
}
