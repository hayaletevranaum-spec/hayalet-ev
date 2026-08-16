import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createPatternRoomCasePacketFromProjection } from "../../rooms/pattern-room/shared/adapters/pattern-room-case-packet-projection.ts";
import { PATTERN_ROOM_DOMAIN_TEST_FIXTURE } from "../../rooms/pattern-room/shared/data/testing/pattern-room-domain.fixture.ts";
import {
  createLocalState,
  type PatternRoomLocalOverlay,
} from "../../rooms/pattern-room/shared/state/pattern-room-local-state.ts";
import { PATTERN_ROOM_SNAPSHOT_VERSION } from "../../rooms/pattern-room/shared/types/pattern-room-snapshot.ts";

function createLongText(label: string): string {
  return Array.from({ length: 24 }, (_value, index) => {
    return `${label} ${index + 1}: kullanıcı tarafından eklenen uzun yerel araştırma parçası.`;
  }).join(" ");
}

function createCasePacketFixture(): {
  beforeDomain: string;
  overlay: PatternRoomLocalOverlay;
} {
  const beforeDomain = JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);

  localState.updateCaseIdentity(
    "Kuzey Koridoru Sensör Olayı",
    "Elektrik kesintisi sırasında koridorda fiziksel hareket oldu mu?"
  );
  localState.addAuthoredSource("Uzun kaynak başlığı", "Kullanıcı arşivi", createLongText("Kaynak"));
  localState.addAuthoredClaim("Yerel iddia", "Kullanıcı tarafından eklenen iddia.");
  localState.addAuthoredInspiration("Yerel ilham", "Kullanıcı tarafından eklenen ilham.");
  localState.addAuthoredUncertainty("Eksik bağlam", "Sonraki araştırma için belirsizlik.");
  localState.addAuthoredEvidence(
    "Kaynaklı kanıt",
    createLongText("Alıntı"),
    "Kullanıcı yorumu ayrı kalır.",
    "evidence",
    { sourceId: "local-source-001", sourceLabel: "Uzun kaynak başlığı" }
  );
  localState.addAuthoredEdge(
    "supports",
    "local-node-001",
    "local-evidence-001",
    createLongText("Bağ")
  );
  localState.addLocalNote("Kullanıcı takip notu.");
  localState.addToDebate("local-node-001");
  localState.prepareDebate();
  localState.assignDebateRoles();
  localState.startDebate();
  localState.advanceDebatePhase();
  localState.advanceDebatePhase();
  localState.advanceDebatePhase();
  localState.advanceDebatePhase();
  localState.completeDebate();

  const baseOverlay = localState.getOverlay();
  const firstSource = baseOverlay.localAuthoredSources[0];
  assert.ok(firstSource);

  return {
    beforeDomain,
    overlay: {
      ...baseOverlay,
      localAuthoredSources: [
        {
          ...firstSource,
          segments: [
            { id: "segment-001", label: "Segment 1", order: 0, text: "İlk segment." },
            { id: "segment-002", label: "Segment 2", order: 1, text: "İkinci segment." },
          ],
        },
      ],
    },
  };
}

function flattenPacketText(value: unknown): string {
  return JSON.stringify(value);
}

void test("pattern-room structured case packet is deterministic and read-only", () => {
  const { beforeDomain, overlay } = createCasePacketFixture();
  const beforeOverlay = JSON.stringify(overlay);
  const input = { domain: PATTERN_ROOM_DOMAIN_TEST_FIXTURE, overlay };

  const firstPacket = createPatternRoomCasePacketFromProjection(input);
  const secondPacket = createPatternRoomCasePacketFromProjection(input);

  assert.deepEqual(firstPacket, secondPacket);
  assert.equal(firstPacket.packetVersion, 1);
  assert.equal(firstPacket.roomId, "pattern-room");
  assert.equal(firstPacket.generatedFrom, "local-view-model");
  assert.equal(firstPacket.topicLabel, "Kuzey Koridoru Sensör Olayı");
  assert.equal(
    firstPacket.researchQuestion,
    "Elektrik kesintisi sırasında koridorda fiziksel hareket oldu mu?"
  );
  assert.equal(JSON.stringify(overlay), beforeOverlay);
  assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
});

void test("pattern-room structured case packet carries sources, evidence, notes, connections, and debate previews", () => {
  const { overlay } = createCasePacketFixture();
  const packet = createPatternRoomCasePacketFromProjection({
    domain: PATTERN_ROOM_DOMAIN_TEST_FIXTURE,
    overlay,
  });

  assert.ok(packet.sources.some((source) => source.label === "Seyir defteri"));
  const longSource = packet.sources.find((source) => source.label === "Uzun kaynak başlığı");
  assert.ok(longSource);
  assert.equal(longSource.segmentCount, 2);
  assert.equal(longSource.typeLabel, "Uzun metin");

  const evidence = packet.evidence.find((item) => item.label === "Kaynaklı kanıt");
  assert.ok(evidence);
  assert.equal(evidence.sourceLabel, "Uzun kaynak başlığı");
  assert.match(evidence.excerptPreview, /^Alıntı 1:/);
  assert.equal(evidence.interpretationPreview, "Kullanıcı yorumu ayrı kalır.");
  assert.equal(evidence.layer, "evidence");

  assert.deepEqual(
    packet.boardNotes
      .filter((note) => note.id.startsWith("local-node-"))
      .map((note) => ({ type: note.type, layer: note.layer })),
    [
      { type: "claim", layer: "interpretation" },
      { type: "inspiration", layer: "analysis" },
      { type: "uncertainty", layer: "uncertainty" },
    ]
  );

  const connection = packet.connections.find((item) => item.id === "local-edge-001");
  assert.ok(connection);
  assert.equal(connection.sourceId, "local-node-001");
  assert.equal(connection.sourceLabel, "Yerel iddia");
  assert.equal(connection.edgeTypeLabel, "destekliyor");
  assert.equal(connection.targetId, "local-evidence-001");
  assert.equal(connection.targetLabel, "Kaynaklı kanıt");
  assert.match(connection.notePreview ?? "", /^Bağ 1:/);
  assert.equal((connection.notePreview ?? "").length <= 500, true);
  assert.match(connection.notePreview ?? "", /\.\.\.$/);

  assert.equal(packet.debate.referenceCount, 1);
  assert.equal(packet.debate.turnCount, 5);
  assert.equal(packet.debate.phaseLabel, "completed");
  assert.ok(packet.debate.turnPreviews.some((preview) => preview.includes("karşıt argüman")));
  assert.match(packet.debate.verdictPreview ?? "", /Local 10\. Adam oturumu tamamlandı/);
  assert.match(packet.debate.verdictPreview ?? "", /Dış üretim çağrısı yapılmadı/);
  assert.ok(packet.openQuestions.some((question) => question.includes("Kullanıcı takip notu.")));
});

void test("pattern-room structured case packet enforces limits and cautious preview language", () => {
  const { overlay } = createCasePacketFixture();
  const packet = createPatternRoomCasePacketFromProjection(
    { domain: PATTERN_ROOM_DOMAIN_TEST_FIXTURE, overlay },
    {
      maxSources: 1,
      maxEvidence: 30,
      maxBoardNotes: 1,
      maxConnections: 30,
      excerptMaxLength: 80,
    }
  );

  assert.equal(packet.sources.length, 1);
  assert.equal(packet.boardNotes.length, 1);
  assert.equal(packet.limits.excerptMaxLength, 80);

  const evidence = packet.evidence.find((item) => item.label === "Kaynaklı kanıt");
  assert.ok(evidence);
  assert.equal(evidence.excerptPreview.length, 80);
  assert.match(evidence.excerptPreview, /\.\.\.$/);

  const connection = packet.connections.find((item) => item.id === "local-edge-001");
  assert.ok(connection);
  assert.equal((connection.notePreview ?? "").length, 80);
  assert.match(connection.notePreview ?? "", /\.\.\.$/);

  assert.doesNotMatch(
    flattenPacketText(packet),
    /\bkesin\b|kanıtlandı|doğrulandı|ispatlandı|AI sonucu|nihai|final verdict|truth score/i
  );
});

void test("pattern-room structured case packet projection is independent from report rendering and transport", () => {
  const projectionSource = readFileSync(
    resolve("rooms/pattern-room/shared/adapters/pattern-room-case-packet-projection.ts"),
    "utf8"
  );
  const typeSource = readFileSync(
    resolve("rooms/pattern-room/shared/types/pattern-room-case-packet.ts"),
    "utf8"
  );

  assert.doesNotMatch(
    projectionSource,
    /PatternReportItem|PatternReportSection|PatternRoomWorkspaceModel/
  );
  assert.doesNotMatch(projectionSource, /readReportSection|readMetaValue|parseConnectionBody/);
  assert.doesNotMatch(projectionSource, /from\s+["'][^"']*(?:host|ui|pattern-report-panel)/i);
  assert.doesNotMatch(projectionSource, /ipcRenderer|ipcMain|roomAPI|autosave|SourcePackage/i);
  const projectionImportSpecifiers = Array.from(
    projectionSource.matchAll(/from\s+["']([^"']+)["']/g),
    (match) => match[1] ?? ""
  );
  assert.equal(
    projectionImportSpecifiers.some((specifier) => {
      return /(?:^|[/_-])(?:ai|provider|relay)(?:$|[/_.-])/i.test(specifier);
    }),
    false
  );
  assert.doesNotMatch(typeSource, /PatternRoomLocalOverlay|SourcePackage|ipcRenderer|roomAPI/);
  assert.equal(PATTERN_ROOM_SNAPSHOT_VERSION, 1);
});
