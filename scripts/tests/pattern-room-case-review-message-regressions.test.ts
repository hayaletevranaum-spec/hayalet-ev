import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createPatternRoomCaseReviewMessage } from "../../rooms/pattern-room/shared/adapters/pattern-room-case-review-message-adapter.ts";
import type { PatternRoomCasePacket } from "../../rooms/pattern-room/shared/types/pattern-room-case-packet.ts";
import { PATTERN_ROOM_SNAPSHOT_VERSION } from "../../rooms/pattern-room/shared/types/pattern-room-snapshot.ts";
import {
  flattenRoomCommandSpecs,
  flattenRoomProtocolSpecs,
  resolveRoomProtocolFilePath,
  validateRoomManifest,
  type RoomManifest,
} from "../../src/types/rooms.ts";

const PATTERN_ROOM_ROOT = resolve("rooms/pattern-room");
const MANIFEST_PATH = resolve(PATTERN_ROOM_ROOT, "manifest.json");
const PROTOCOL_KEY = "pattern-room-case-review";
const PROTOCOL_SCENARIO = "case-review";

function createCasePacketFixture(extraText = ""): PatternRoomCasePacket {
  return {
    packetVersion: 1,
    roomId: "pattern-room",
    topicLabel: "Yerel vaka",
    researchQuestion: "Yerel vaka hangi soruya yanıt arıyor?",
    generatedFrom: "local-view-model",
    caution:
      "Bu paket kullanıcı tarafından eklenen ve henüz dışarıdan denetlenmemiş yerel araştırma izlerinden hazırlanmıştır; sonuç veya doğrulama beyanı içermez.",
    sources: [
      {
        id: "source-001",
        label: "Seyir defteri",
        typeLabel: "Yerel Kaynak",
        origin: "Kullanıcı arşivi",
        status: "unverified",
        preview: `Kısa kaynak önizlemesi. ${extraText}`.trim(),
        segmentCount: 2,
      },
    ],
    evidence: [
      {
        id: "evidence-001",
        label: "Seçili alıntı",
        sourceLabel: "Seyir defteri",
        excerptPreview: `Alıntı önizlemesi. ${extraText}`.trim(),
        interpretationPreview: "Kullanıcı yorumu ayrı kalır.",
        layer: "evidence",
      },
    ],
    boardNotes: [
      {
        id: "note-001",
        label: "Belirsizlik",
        type: "Belirsizlik",
        layer: "uncertainty",
        contentPreview: "Eksik bağlam notu.",
      },
    ],
    connections: [
      {
        id: "edge-001",
        sourceId: "evidence-001",
        sourceLabel: "Seçili alıntı",
        edgeTypeLabel: "soru doğuruyor",
        targetId: "note-001",
        targetLabel: "Belirsizlik",
        notePreview: "Yerel ilişki notu.",
      },
    ],
    debate: {
      phaseLabel: "pending",
      statusLabel: "Hazır değil",
      referenceCount: 1,
      turnCount: 0,
      verdictPreview: null,
      turnPreviews: [],
    },
    openQuestions: ["Hangi kaynaklar yeniden okunmalı?"],
    limits: {
      maxSources: 20,
      maxEvidence: 30,
      maxBoardNotes: 30,
      maxConnections: 30,
      excerptMaxLength: 500,
    },
  };
}

function readPatternRoomManifest(): RoomManifest {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as unknown;
  const result = validateRoomManifest(manifest);

  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.ok(result.manifest);

  return result.manifest;
}

function readProtocolText(): string {
  const manifest = readPatternRoomManifest();
  const spec = flattenRoomProtocolSpecs(manifest).find((candidate) => {
    return candidate.key === PROTOCOL_KEY;
  });

  assert.ok(spec);
  assert.equal(spec.scenario, PROTOCOL_SCENARIO);

  const protocolPath = resolve(PATTERN_ROOM_ROOT, resolveRoomProtocolFilePath(spec) as string);
  assert.equal(existsSync(protocolPath), true);
  return readFileSync(protocolPath, "utf8");
}

function assertPreviewOrder(message: ReturnType<typeof createPatternRoomCaseReviewMessage>): void {
  const protocolIndex = message.previewText.indexOf(message.sections.protocolNotice);
  const roleIndex = message.previewText.indexOf(message.sections.roleInstructions);
  const packetIndex = message.previewText.indexOf(message.sections.casePacket);
  const taskIndex = message.previewText.indexOf(message.sections.taskPrompt);

  assert.equal(protocolIndex >= 0, true);
  assert.equal(roleIndex > protocolIndex, true);
  assert.equal(packetIndex > roleIndex, true);
  assert.equal(taskIndex > packetIndex, true);
}

function assertForbiddenTermsStayInAvoidanceContext(value: string): void {
  const forbiddenTerms = ["kanıtlandı", "kesin", "doğrulandı", "nihai sonuç"];
  const contextPattern = /kaçınılacak|uyarı bağlamında|yasağı/i;

  value.split(/\r?\n/).forEach((line) => {
    forbiddenTerms.forEach((term) => {
      if (line.toLocaleLowerCase("tr").includes(term)) {
        assert.match(line, contextPattern, `Unexpected verdict wording context: ${line}`);
      }
    });
  });
}

void test("pattern-room case review message composer creates an AI0 message", () => {
  const packet = createCasePacketFixture();
  const message = createPatternRoomCaseReviewMessage({
    protocolText: readProtocolText(),
    casePacket: packet,
    roleSlot: "AI0",
    taskPrompt: "Yerel izleri ayrıştır ve açık soruları çıkar.",
  });

  assert.equal(message.messageVersion, 1);
  assert.equal(message.roomId, "pattern-room");
  assert.equal(message.protocolKey, PROTOCOL_KEY);
  assert.equal(message.scenario, PROTOCOL_SCENARIO);
  assert.equal(message.roleSlot, "AI0");
  assert.match(message.roleLabel, /araştırmacı \/ düzenleyici/);
  assert.match(message.sections.protocolNotice, /protocolKey: pattern-room-case-review/);
  assert.match(message.sections.protocolNotice, /Pattern Room \/ İz Sürme Odası/);
  assert.match(message.sections.casePacket, /Bu paket kullanıcı tarafından eklenen/);
  assert.match(message.previewText, /Yerel izleri ayrıştır/);
  assert.deepEqual(message.warnings, []);
});

void test("pattern-room case review message composer keeps role instructions distinct", () => {
  const protocolText = "Pattern Room protokol metni.";
  const packet = createCasePacketFixture();
  const messages = ["AI1", "AI2", "US1"].map((roleSlot) => {
    return createPatternRoomCaseReviewMessage({
      protocolText,
      casePacket: packet,
      roleSlot: roleSlot as "AI1" | "AI2" | "US1",
      taskPrompt: "Rolüne göre değerlendir.",
    });
  });

  assert.equal(new Set(messages.map((message) => message.sections.roleInstructions)).size, 3);
  assert.match(messages[0]?.sections.roleInstructions ?? "", /savunucu/);
  assert.match(messages[1]?.sections.roleInstructions ?? "", /role: AI2 — 10\. Adam/);
  assert.doesNotMatch(messages[1]?.sections.roleInstructions ?? "", /role: AI2 - AI2/);
  assert.match(messages[2]?.sections.roleInstructions ?? "", /hakem/);
});

void test("pattern-room case review preview preserves protocol role packet task order", () => {
  const message = createPatternRoomCaseReviewMessage({
    protocolText: readProtocolText(),
    casePacket: createCasePacketFixture(),
    roleSlot: "AI2",
    taskPrompt: "Karşı argümanları ve boşlukları çıkar.",
  });

  assertPreviewOrder(message);
  assert.match(message.previewText, /caution/);
  assert.match(message.previewText, /Bu paket kullanıcı tarafından eklenen/);
});

void test("pattern-room case review message composer uses a safe default task prompt", () => {
  const message = createPatternRoomCaseReviewMessage({
    protocolText: "Pattern Room protokol metni.",
    casePacket: createCasePacketFixture(),
    roleSlot: "US1",
    taskPrompt: "   ",
  });

  assert.match(message.sections.taskPrompt, /Bu vaka paketini temkinli biçimde gözden geçir/);
  assert.match(message.sections.taskPrompt, /hüküm dili üretmeden/);
  assert.doesNotMatch(message.sections.taskPrompt, /kanıtlandı|kesin|doğrulandı|nihai sonuç/i);
});

void test("pattern-room case review message composer truncates case packet text with warnings", () => {
  const message = createPatternRoomCaseReviewMessage({
    protocolText: "Pattern Room protokol metni.",
    casePacket: createCasePacketFixture("Uzun ek bağlam. ".repeat(40)),
    roleSlot: "AI0",
    taskPrompt: null,
    options: { maxCasePacketChars: 120 },
  });

  assert.equal(message.warnings.length, 1);
  assert.match(message.warnings[0] ?? "", /120 karakterlik mesaj sınırına kırpıldı/);
  assert.match(message.sections.casePacket, /\.\.\.$/);
  assert.match(message.sections.taskPrompt, /hüküm dili üretmeden/);
});

void test("pattern-room case review message composer does not mutate inputs", () => {
  const packet = createCasePacketFixture();
  const beforePacket = JSON.stringify(packet);
  const protocolText = readProtocolText();
  const taskPrompt = "Mevcut izleri temkinli biçimde sırala.";

  const firstMessage = createPatternRoomCaseReviewMessage({
    protocolText,
    casePacket: packet,
    roleSlot: "AI1",
    taskPrompt,
  });
  const secondMessage = createPatternRoomCaseReviewMessage({
    protocolText,
    casePacket: packet,
    roleSlot: "AI1",
    taskPrompt,
  });

  assert.deepEqual(firstMessage, secondMessage);
  assert.equal(JSON.stringify(packet), beforePacket);
});

void test("pattern-room case review message composer stays independent from transport and manifest changes", () => {
  const adapterSource = readFileSync(
    resolve("rooms/pattern-room/shared/adapters/pattern-room-case-review-message-adapter.ts"),
    "utf8"
  );
  const typeSource = readFileSync(
    resolve("rooms/pattern-room/shared/types/pattern-room-case-review-message.ts"),
    "utf8"
  );
  const manifest = readPatternRoomManifest();
  const protocolSpecs = flattenRoomProtocolSpecs(manifest);

  assert.doesNotMatch(adapterSource, /from\s+["'][^"']*(?:host|ui|provider|relay|slot-bridge)/i);
  assert.doesNotMatch(typeSource, /from\s+["'][^"']*(?:host|ui|provider|relay|slot-bridge)/i);
  assert.doesNotMatch(adapterSource, /dispatchBridge|SlotBridge|ipcMain|ipcRenderer|roomAPI/);
  assert.doesNotMatch(adapterSource, /protocolSpecs|commandSpecs|manifest\.json/);
  assert.equal(PATTERN_ROOM_SNAPSHOT_VERSION, 1);
  assert.deepEqual(flattenRoomCommandSpecs(manifest), []);
  assert.deepEqual(
    protocolSpecs.map((spec) => {
      return {
        key: spec.key,
        path: spec.path,
        room: spec.room,
        scenario: spec.scenario,
      };
    }),
    [
      {
        key: PROTOCOL_KEY,
        path: "protocols/pattern-room-case-review.md",
        room: "pattern-room",
        scenario: PROTOCOL_SCENARIO,
      },
    ]
  );
});

void test("pattern-room case review message composer does not generate verdict wording", () => {
  const message = createPatternRoomCaseReviewMessage({
    protocolText: readProtocolText(),
    casePacket: createCasePacketFixture(),
    roleSlot: "AI2",
    taskPrompt: null,
  });

  assertForbiddenTermsStayInAvoidanceContext(message.previewText);
});
