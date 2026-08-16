import test from "node:test";
import assert from "node:assert/strict";

import { createPatternRoomCasePacketFromProjection } from "../../rooms/pattern-room/shared/adapters/pattern-room-case-packet-projection.ts";
import { PATTERN_ROOM_DOMAIN_TEST_FIXTURE } from "../../rooms/pattern-room/shared/data/testing/pattern-room-domain.fixture.ts";
import { createLocalState } from "../../rooms/pattern-room/shared/state/pattern-room-local-state.ts";

void test("structured Case Packet projection reads domain and local overlay without report strings", () => {
  const state = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  state.addAuthoredSource("Yerel belge", "Kullanıcı arşivi", "Belge içeriği");
  state.addAuthoredClaim("Yerel iddia", "İddia metni");
  state.addAuthoredUncertainty("Açık soru", "Hangi kaynak bunu doğrulayabilir?");
  state.addAuthoredEvidence(
    "Yerel pasaj",
    "Seçili kaynak pasajı",
    "Kullanıcı bağlamı",
    "evidence",
    {
      sourceId: "source-navigation-log",
      sourceLabel: "Seyir defteri",
    }
  );
  state.addAuthoredEdge(
    "supports",
    "source-navigation-log",
    "node-horizon-claim",
    "Kullanıcı bağlantısı"
  );

  const packet = createPatternRoomCasePacketFromProjection({
    domain: PATTERN_ROOM_DOMAIN_TEST_FIXTURE,
    overlay: state.getOverlay(),
  });

  assert.equal(packet.topicLabel, "Dunya'nin sekli arastirmasi");
  assert.equal(
    packet.sources.some((source) => source.label === "Yerel belge"),
    true
  );
  assert.equal(
    packet.evidence.some((evidence) => evidence.label === "Yerel pasaj"),
    true
  );
  assert.equal(
    packet.boardNotes.some((note) => note.label === "Yerel iddia"),
    true
  );
  assert.equal(
    packet.connections.some((connection) => connection.id === "local-edge-001"),
    true
  );
  assert.equal(
    packet.openQuestions.some((question) => question.includes("Hangi kaynak")),
    true
  );
});

void test("structured Case Packet projection preserves packet limits", () => {
  const packet = createPatternRoomCasePacketFromProjection(
    { domain: PATTERN_ROOM_DOMAIN_TEST_FIXTURE },
    {
      maxSources: 1,
      maxEvidence: 1,
      maxBoardNotes: 1,
      maxConnections: 1,
      excerptMaxLength: 24,
    }
  );

  assert.equal(packet.sources.length, 1);
  assert.equal(packet.evidence.length, 1);
  assert.equal(packet.boardNotes.length, 1);
  assert.equal(packet.connections.length, 1);
  assert.equal(packet.sources[0]!.preview.length <= 24, true);
});
