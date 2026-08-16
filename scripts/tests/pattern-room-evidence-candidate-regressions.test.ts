import test from "node:test";
import assert from "node:assert/strict";

import { PATTERN_ROOM_DOMAIN_TEST_FIXTURE } from "../../rooms/pattern-room/shared/data/testing/pattern-room-domain.fixture.ts";
import { createLocalState } from "../../rooms/pattern-room/shared/state/pattern-room-local-state.ts";
import {
  createSnapshot,
  restoreFromSnapshot,
} from "../../rooms/pattern-room/shared/state/pattern-room-snapshot.ts";

void test("pattern-room evidence candidates persist in snapshots without becoming evidence", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);

  assert.equal(
    localState.addEvidenceCandidate(
      "suggestion-item-001",
      "Saat damgası gerçek kaynaktan yeniden seçilmeli.",
      "session-001"
    ),
    true
  );
  assert.equal(
    localState.addEvidenceCandidate(
      "suggestion-item-001",
      "Saat damgası gerçek kaynaktan yeniden seçilmeli.",
      "session-001"
    ),
    false
  );

  const overlay = localState.getOverlay();
  assert.equal(overlay.localAuthoredEvidence.length, 0);
  assert.equal(overlay.localEvidenceCandidates?.length, 1);
  assert.equal(overlay.localEvidenceCandidates?.[0]?.status, "candidate");

  const snapshot = createSnapshot(localState, "tenth-man");
  const restored = restoreFromSnapshot(snapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  assert.ok(restored);
  assert.equal(restored.overlay.localAuthoredEvidence.length, 0);
  assert.equal(restored.overlay.localEvidenceCandidates?.length, 1);
  assert.equal(restored.overlay.localEvidenceCandidates?.[0]?.reviewSessionId, "session-001");

  const legacyOverlay = { ...snapshot.overlay };
  delete legacyOverlay.localEvidenceCandidates;
  const restoredLegacy = restoreFromSnapshot(
    { ...snapshot, overlay: legacyOverlay },
    PATTERN_ROOM_DOMAIN_TEST_FIXTURE
  );
  assert.ok(restoredLegacy);
  assert.deepEqual(restoredLegacy.overlay.localEvidenceCandidates, []);
});

void test("pattern-room evidence promotion requires an existing source and selected excerpt", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.addEvidenceCandidate(
    "suggestion-item-001",
    "AI yorumu yalnız yorum alanına taşınmalı.",
    "session-002"
  );
  const candidateId = localState.getOverlay().localEvidenceCandidates?.[0]?.id;
  assert.ok(candidateId);

  const missingSource = localState.promoteEvidenceCandidate({
    candidateId,
    sourceId: "missing-source",
    excerpt: "Gerçek alıntı",
  });
  assert.equal(missingSource.promoted, false);
  assert.equal(localState.getOverlay().localEvidenceCandidates?.length, 1);

  const missingExcerpt = localState.promoteEvidenceCandidate({
    candidateId,
    sourceId: "source-navigation-log",
    excerpt: "   ",
  });
  assert.equal(missingExcerpt.promoted, false);
  assert.equal(localState.getOverlay().localAuthoredEvidence.length, 0);

  const promoted = localState.promoteEvidenceCandidate({
    candidateId,
    sourceId: "source-navigation-log",
    excerpt: "22:14 saat damgası",
    label: "Seçilmiş saat damgası",
  });
  assert.equal(promoted.promoted, true);
  assert.ok(promoted.evidenceId);

  const overlay = localState.getOverlay();
  assert.equal(overlay.localEvidenceCandidates?.length, 0);
  assert.equal(overlay.localAuthoredEvidence.length, 1);
  assert.equal(overlay.localAuthoredEvidence[0]?.excerpt, "22:14 saat damgası");
  assert.equal(
    overlay.localAuthoredEvidence[0]?.interpretation,
    "AI yorumu yalnız yorum alanına taşınmalı."
  );
  assert.equal(overlay.localAuthoredEvidence[0]?.sourceId, "source-navigation-log");
  assert.equal(
    overlay.localAuthoredEvidence[0]?.sourceLabel,
    localState.resolveEntityLabel("source-navigation-log")
  );
});
