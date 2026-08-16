import test from "node:test";
import assert from "node:assert/strict";

import { createPatternRoomCaseReviewMessage } from "../../rooms/pattern-room/shared/adapters/pattern-room-case-review-message-adapter.ts";
import { parsePatternRoomCaseReviewResult } from "../../rooms/pattern-room/shared/adapters/pattern-room-case-review-parser.ts";
import type { PatternRoomCasePacket } from "../../rooms/pattern-room/shared/types/pattern-room-case-packet.ts";

const CANONICAL_REPLY = {
  format: "pattern-room-case-review",
  version: 1,
  sections: {
    observation: ["İlk gözlem.", "İkinci gözlem ayrı kalmalı."],
    evidence: ["Kaynak görseli yeniden kontrol edilmeli."],
    analysis: ["Mevcut açıklama tek bir kaynak zincirine dayanıyor."],
    counterArgument: ["Kalibrasyon farkı alternatif açıklama olabilir."],
    missingInformation: ["Orijinal kalibrasyon tablosu eksik."],
    openQuestions: ["Saat damgasını hangi cihaz üretti?"],
    confidenceNotes: ["Kaynak görülmeden güven sınırlı."],
  },
  suggestedConnections: [
    {
      sourceId: "source-001",
      edgeType: "needs_review",
      targetId: "node-001",
      note: "İlişki kullanıcı tarafından kontrol edilmeli.",
    },
  ],
};

function createCasePacket(): PatternRoomCasePacket {
  return {
    packetVersion: 1,
    roomId: "pattern-room",
    topicLabel: "Parser format fixture",
    generatedFrom: "local-view-model",
    caution: "Yerel ve doğrulanmamış çalışma paketi.",
    sources: [],
    evidence: [],
    boardNotes: [],
    connections: [],
    debate: {
      phaseLabel: "pending",
      statusLabel: "Hazır değil",
      referenceCount: 0,
      turnCount: 0,
      verdictPreview: null,
      turnPreviews: [],
    },
    openQuestions: [],
    limits: {
      maxSources: 20,
      maxEvidence: 30,
      maxBoardNotes: 30,
      maxConnections: 30,
      excerptMaxLength: 500,
    },
  };
}

void test("pattern-room parser accepts canonical JSON and fenced JSON without merging array items", () => {
  const serialized = JSON.stringify(CANONICAL_REPLY);
  const direct = parsePatternRoomCaseReviewResult(serialized);
  const fenced = parsePatternRoomCaseReviewResult(`\`\`\`json\n${serialized}\n\`\`\``);

  assert.equal(direct.fallbackUsed, false);
  assert.deepEqual(
    direct.sections.observation.items.map((item) => item.text),
    ["İlk gözlem.", "İkinci gözlem ayrı kalmalı."]
  );
  assert.equal(direct.sections.evidence.items.length, 1);
  assert.equal(
    direct.suggestions.filter((suggestion) => suggestion.kind === "evidence_candidate").length,
    1
  );
  assert.deepEqual(direct.suggestedConnections[0], {
    sourceId: "source-001",
    edgeType: "needs_review",
    targetId: "node-001",
    note: "İlişki kullanıcı tarafından kontrol edilmeli.",
    rawText: JSON.stringify(CANONICAL_REPLY.suggestedConnections[0]),
  });
  assert.equal(fenced.fallbackUsed, false);
  assert.deepEqual(
    fenced.sections.observation.items.map((item) => item.text),
    direct.sections.observation.items.map((item) => item.text)
  );
  assert.equal(Object.isFrozen(direct), true);
  assert.equal(Object.isFrozen(direct.suggestions), true);
});

void test("pattern-room parser accepts Turkish review headings and keeps section boundaries", () => {
  const result = parsePatternRoomCaseReviewResult(
    [
      "Gözlem:",
      "- Saat kaydı ile not arasında fark var.",
      "Kanıt:",
      "- Kaynak görseli yeniden açılmalı.",
      "Analiz:",
      "- İki kayıt aynı olaya ait olabilir.",
      "Karşı Argüman:",
      "- Kayıtlar farklı günlerden olabilir.",
      "Eksik Bilgi:",
      "- Kamera zaman dilimi bilinmiyor.",
      "Açık Sorular:",
      "- Ham dosya metadata değeri nedir?",
      "Güven Notları:",
      "- Kaynak kontrol edilene kadar güven sınırlı.",
    ].join("\n")
  );

  assert.equal(result.fallbackUsed, false);
  assert.equal(result.sections.observation.items[0]?.text, "Saat kaydı ile not arasında fark var.");
  assert.equal(result.sections.evidence.items[0]?.text, "Kaynak görseli yeniden açılmalı.");
  assert.equal(
    result.sections.counterArgument.items[0]?.text,
    "Kayıtlar farklı günlerden olabilir."
  );
  assert.deepEqual(result.missingEvidence, ["Kamera zaman dilimi bilinmiyor."]);
  assert.deepEqual(result.openQuestions, ["Ham dosya metadata değeri nedir?"]);
  assert.deepEqual(result.confidence, ["Kaynak kontrol edilene kadar güven sınırlı."]);
});

void test("pattern-room parser preserves invalid canonical JSON envelopes as cautious fallback analysis", () => {
  const result = parsePatternRoomCaseReviewResult(
    JSON.stringify({
      format: "pattern-room-case-review",
      version: 1,
      sections: { observation: "array değil" },
    })
  );

  assert.equal(result.fallbackUsed, true);
  assert.equal(result.sections.analysis.items.length, 1);
  assert.equal(
    result.warnings.filter((warning) => warning.code === "malformed-format").length >= 1,
    true
  );
  assert.doesNotMatch(result.summary, /kanıtlandı|kesin|doğrulandı|nihai sonuç/i);
});

void test("pattern-room review message requests canonical JSON and documents bilingual heading fallback", () => {
  const message = createPatternRoomCaseReviewMessage({
    casePacket: createCasePacket(),
    roleSlot: "AI2",
    taskPrompt: "Boşlukları ve karşı argümanları çıkar.",
  });

  assert.match(message.sections.taskPrompt, /\[Output Contract\]/);
  assert.match(message.sections.taskPrompt, /"format": "pattern-room-case-review"/);
  assert.match(message.sections.taskPrompt, /"suggestedConnections": \[\]/);
  assert.match(message.sections.taskPrompt, /Observation\/Gözlem/);
  assert.match(message.sections.taskPrompt, /Evidence öğeleri yalnız kanıt adayıdır/);
  assert.doesNotMatch(message.sections.taskPrompt, /```json/);
});
