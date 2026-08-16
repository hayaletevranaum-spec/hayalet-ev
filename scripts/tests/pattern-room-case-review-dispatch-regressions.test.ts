import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createPatternRoomCaseReviewDispatchDraft as createDispatchDraftFromMessage } from "../../rooms/pattern-room/shared/adapters/pattern-room-case-review-dispatch-adapter.ts";
import { createPatternRoomCaseReviewMessage } from "../../rooms/pattern-room/shared/adapters/pattern-room-case-review-message-adapter.ts";
import type { PatternRoomCasePacket } from "../../rooms/pattern-room/shared/types/pattern-room-case-packet.ts";
import type {
  PatternRoomCaseReviewDispatchRoleSlot,
  PatternRoomCaseReviewTargetSlot,
} from "../../rooms/pattern-room/shared/types/pattern-room-case-review-dispatch.ts";
import { PATTERN_ROOM_SNAPSHOT_VERSION } from "../../rooms/pattern-room/shared/types/pattern-room-snapshot.ts";
import {
  flattenRoomCommandSpecs,
  flattenRoomProtocolSpecs,
  validateRoomManifest,
  type RoomManifest,
} from "../../src/types/rooms.ts";

const MANIFEST_PATH = resolve("rooms/pattern-room/manifest.json");
const PROTOCOL_KEY = "pattern-room-case-review";
const PROTOCOL_SCENARIO = "case-review";

function createCasePacketFixture(extraText = ""): PatternRoomCasePacket {
  return {
    packetVersion: 1,
    roomId: "pattern-room",
    topicLabel: "Yerel vaka",
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
        sourceLabel: "Seçili alıntı",
        edgeTypeLabel: "soru doğuruyor",
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

function createPatternRoomCaseReviewDispatchDraft(input: {
  readonly casePacket: PatternRoomCasePacket;
  readonly roleSlot: PatternRoomCaseReviewDispatchRoleSlot;
  readonly taskPrompt?: string | null;
  readonly options?: {
    readonly page?: string | null;
    readonly maxCasePacketChars?: number;
  };
}) {
  const maxCasePacketChars = input.options?.maxCasePacketChars;
  const page = input.options?.page;
  const reviewMessage = createPatternRoomCaseReviewMessage({
    casePacket: input.casePacket,
    roleSlot: input.roleSlot,
    ...(input.taskPrompt === undefined ? {} : { taskPrompt: input.taskPrompt }),
    ...(maxCasePacketChars === undefined ? {} : { options: { maxCasePacketChars } }),
  });

  return createDispatchDraftFromMessage({
    reviewMessage,
    ...(page === undefined ? {} : { options: { page } }),
  });
}

function readPatternRoomManifest(): RoomManifest {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as unknown;
  const result = validateRoomManifest(manifest);

  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.ok(result.manifest);

  return result.manifest;
}

function assertPayloadTextOrder(text: string): void {
  const roleIndex = text.indexOf("[Role Instructions]");
  const packetIndex = text.indexOf("[Case Packet]");
  const taskIndex = text.indexOf("[Task Prompt]");

  assert.equal(roleIndex >= 0, true);
  assert.equal(packetIndex > roleIndex, true);
  assert.equal(taskIndex > packetIndex, true);
}

void test("pattern-room case review dispatch draft maps AI2 to the ai2 target", () => {
  const draft = createPatternRoomCaseReviewDispatchDraft({
    casePacket: createCasePacketFixture(),
    roleSlot: "AI2",
    taskPrompt: "Karşı argümanları ve boşlukları çıkar.",
  });

  assert.equal(draft.roleSlot, "AI2");
  assert.equal(draft.targetSlot, "ai2");
  assert.equal(draft.payload.toSlot, "ai2");
  assert.match(draft.payload.payload.text, /role: AI2 — 10\. Adam/);
});

void test("pattern-room case review dispatch draft maps every role to its target slot", () => {
  const expected: ReadonlyArray<
    readonly [PatternRoomCaseReviewDispatchRoleSlot, PatternRoomCaseReviewTargetSlot]
  > = [
    ["AI0", "ai0"],
    ["AI1", "ai1"],
    ["AI2", "ai2"],
    ["US1", "us1"],
  ];

  for (const [roleSlot, targetSlot] of expected) {
    const draft = createPatternRoomCaseReviewDispatchDraft({
      casePacket: createCasePacketFixture(),
      roleSlot,
      taskPrompt: "Rolüne göre değerlendir.",
    });

    assert.equal(draft.targetSlot, targetSlot);
    assert.equal(draft.payload.toSlot, targetSlot);
  }
});

void test("pattern-room case review dispatch draft creates a SlotBridge payload skeleton", () => {
  const draft = createPatternRoomCaseReviewDispatchDraft({
    casePacket: createCasePacketFixture(),
    roleSlot: "AI0",
    taskPrompt: "Yerel izleri ayrıştır.",
    options: { page: "ui/index.html" },
  });

  assert.equal(draft.payload.action, "message.sendWait");
  assert.equal(draft.payload.connectPolicy, "ensure");
  assert.deepEqual(draft.payload.payload.protocol, {
    room: "pattern-room",
    scenario: PROTOCOL_SCENARIO,
    protocolKey: PROTOCOL_KEY,
  });
  assert.equal(draft.payload.payload.page, "ui/index.html");
});

void test("pattern-room case review dispatch draft keeps Case Packet in text, not protocol context", () => {
  const draft = createPatternRoomCaseReviewDispatchDraft({
    casePacket: createCasePacketFixture(),
    roleSlot: "AI1",
    taskPrompt: "Dayanakları ve boşlukları ayır.",
  });

  assertPayloadTextOrder(draft.payload.payload.text);
  assert.match(draft.payload.payload.text, /"topicLabel": "Yerel vaka"/);
  assert.match(draft.payload.payload.text, /Bu paket kullanıcı tarafından eklenen/);
  assert.equal(Object.hasOwn(draft.payload.payload.protocol, "context"), false);
  assert.doesNotMatch(JSON.stringify(draft.payload.payload.protocol), /Yerel vaka|Case Packet/);
});

void test("pattern-room case review dispatch draft does not duplicate protocol markdown in text", () => {
  const draft = createPatternRoomCaseReviewDispatchDraft({
    casePacket: createCasePacketFixture(),
    roleSlot: "AI2",
    taskPrompt: "Zayıf noktaları çıkar.",
  });

  assert.doesNotMatch(draft.payload.payload.text, /\[Protocol Notice\]|\[PROTOCOL\]/);
  assert.doesNotMatch(draft.payload.payload.text, /Pattern Room \/ İz Sürme Odası/);
  assert.doesNotMatch(draft.payload.payload.text, /protocolKey: pattern-room-case-review/);
});

void test("pattern-room case review dispatch draft uses a safe default task and truncates packet text", () => {
  const draft = createPatternRoomCaseReviewDispatchDraft({
    casePacket: createCasePacketFixture("Uzun ek bağlam. ".repeat(40)),
    roleSlot: "US1",
    taskPrompt: "   ",
    options: { maxCasePacketChars: 120 },
  });

  assert.equal(draft.warnings.length, 1);
  assert.match(draft.warnings[0] ?? "", /120 karakterlik mesaj sınırına kırpıldı/);
  assert.match(draft.payload.payload.text, /\.\.\.\n\n---\n\n\[Task Prompt\]/);
  assert.match(draft.payload.payload.text, /Bu vaka paketini temkinli biçimde gözden geçir/);
  assert.match(draft.payload.payload.text, /hüküm dili üretmeden/);
  assert.doesNotMatch(draft.payload.payload.text, /kanıtlandı|kesin|doğrulandı|nihai sonuç/i);
});

void test("pattern-room case review dispatch draft is deterministic and does not mutate input", () => {
  const packet = createCasePacketFixture();
  const beforePacket = JSON.stringify(packet);
  const input = {
    casePacket: packet,
    roleSlot: "AI2" as const,
    taskPrompt: "Mevcut izleri temkinli biçimde test et.",
    options: { page: "ui/index.html", maxCasePacketChars: 400 },
  };

  const firstDraft = createPatternRoomCaseReviewDispatchDraft(input);
  const secondDraft = createPatternRoomCaseReviewDispatchDraft(input);

  assert.deepEqual(firstDraft, secondDraft);
  assert.equal(JSON.stringify(packet), beforePacket);
});

void test("pattern-room case review dispatch draft stays independent from runtime and manifest changes", () => {
  const adapterSource = readFileSync(
    resolve("rooms/pattern-room/shared/adapters/pattern-room-case-review-dispatch-adapter.ts"),
    "utf8"
  );
  const typeSource = readFileSync(
    resolve("rooms/pattern-room/shared/types/pattern-room-case-review-dispatch.ts"),
    "utf8"
  );
  const manifest = readPatternRoomManifest();
  const protocolSpecs = flattenRoomProtocolSpecs(manifest);

  assert.doesNotMatch(
    adapterSource,
    /from\s+["'][^"']*(?:host|runtime|ui|provider|relay|slot-bridge|ipc)/i
  );
  assert.doesNotMatch(
    typeSource,
    /from\s+["'][^"']*(?:host|runtime|ui|provider|relay|slot-bridge|ipc)/i
  );
  assert.doesNotMatch(adapterSource, /dispatchBridge|sendWait|ipcMain|ipcRenderer|roomAPI/);
  assert.doesNotMatch(adapterSource, /commandSpecs|protocolSpecs|manifest\.json/);
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
