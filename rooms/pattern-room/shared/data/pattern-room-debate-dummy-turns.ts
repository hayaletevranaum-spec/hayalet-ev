import type { DebateLocalPhase, DebateLocalTurn } from "../state/pattern-room-local-state.js";

type DebateLocalTurnPhase = Exclude<
  DebateLocalPhase,
  "idle" | "preparation" | "role_assignment" | "completed"
>;

const DUMMY_TURN_BANK: Record<DebateLocalTurnPhase, Omit<DebateLocalTurn, "id" | "turnIndex">> = {
  opening: {
    actorId: "AI0",
    role: "researcher",
    content:
      "AI0 araştırmacı açılışı: seçilen referanslar önce kanıt, analiz ve belirsizlik ayrımıyla okunmalı.",
    stance: "support",
    phaseKey: "opening",
  },
  counter_argument: {
    actorId: "AI2",
    role: "tenth-man",
    content:
      "AI2 karşıt argüman: mevcut çıkarım, görsel bağlam ve perspektif etkisi ayrıştırılmadan güçlü sayılmamalı.",
    stance: "oppose",
    phaseKey: "counter_argument",
  },
  evidence_review: {
    actorId: "AI1",
    role: "advocate",
    content:
      "AI1 savunma: kaynakların birlikte okunması, iddianın en azından araştırılabilir bir iz olduğunu gösteriyor.",
    stance: "support",
    phaseKey: "evidence_review",
  },
  weak_point: {
    actorId: "AI2",
    role: "tenth-man",
    content:
      "AI2 zayıf nokta tespiti: güven düzeyi ve ölçüm koşulları netleşmeden sonuç dili rapora taşınmamalı.",
    stance: "question",
    phaseKey: "weak_point",
  },
  judge_mapping: {
    actorId: "US1",
    role: "arbiter",
    content:
      "US1 hakem değerlendirmesi: karşı argümanlar rapora kesin hüküm değil, takip notu olarak yansıtılmalı.",
    stance: "neutral",
    phaseKey: "judge_mapping",
  },
};

export function createPatternRoomDebateDummyTurn(
  phaseKey: DebateLocalPhase,
  turnIndex: number
): DebateLocalTurn {
  if (
    phaseKey === "idle" ||
    phaseKey === "preparation" ||
    phaseKey === "role_assignment" ||
    phaseKey === "completed"
  ) {
    throw new Error(`Pattern Room debate phase has no dummy turn: ${phaseKey}`);
  }

  return {
    ...DUMMY_TURN_BANK[phaseKey],
    id: `local-debate-turn-${String(turnIndex + 1).padStart(2, "0")}-${phaseKey}`,
    turnIndex,
  };
}
