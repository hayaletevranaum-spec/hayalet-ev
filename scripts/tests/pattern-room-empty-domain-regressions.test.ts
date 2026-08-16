import test from "node:test";
import assert from "node:assert/strict";

import {
  PATTERN_ROOM_DOMAIN,
  createEmptyPatternRoomDomain,
} from "../../rooms/pattern-room/shared/data/pattern-room-domain.ts";

void test("Pattern Room production domain starts without sample case data", () => {
  assert.equal(PATTERN_ROOM_DOMAIN.topic.id, "pattern-room-local-case");
  assert.equal(PATTERN_ROOM_DOMAIN.topic.rootNodeId, null);
  assert.deepEqual(PATTERN_ROOM_DOMAIN.nodes, []);
  assert.deepEqual(PATTERN_ROOM_DOMAIN.edges, []);
  assert.deepEqual(PATTERN_ROOM_DOMAIN.sources, []);
  assert.deepEqual(PATTERN_ROOM_DOMAIN.evidence, []);
  assert.deepEqual(PATTERN_ROOM_DOMAIN.reportTrace, []);
  assert.equal(PATTERN_ROOM_DOMAIN.debateSession.status, "pending");
  assert.deepEqual(PATTERN_ROOM_DOMAIN.debateSession.turns, []);
});

void test("empty Pattern Room domain instances do not share mutable arrays", () => {
  const first = createEmptyPatternRoomDomain();
  const second = createEmptyPatternRoomDomain();

  first.nodes.push({
    id: "local-test-node",
    topicId: first.topic.id,
    nodeType: "claim",
    layer: "interpretation",
    label: "Test",
    content: "Test",
    confidence: null,
    sourceRef: null,
    createdBy: "US1",
    createdAt: first.topic.createdAt,
    metadata: {},
  });
  first.debateSession.roles[0]!.connected = true;

  assert.equal(second.nodes.length, 0);
  assert.equal(second.debateSession.roles[0]?.connected, false);
});
