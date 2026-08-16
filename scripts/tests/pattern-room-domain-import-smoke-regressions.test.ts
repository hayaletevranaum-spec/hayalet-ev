import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import createPatternRoomHostRuntime from "../../rooms/pattern-room/host/runtime.ts";
import { PATTERN_ROOM_DOMAIN_TEST_FIXTURE } from "../../rooms/pattern-room/shared/data/testing/pattern-room-domain.fixture.ts";
import {
  PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND,
  PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND,
} from "../../rooms/pattern-room/shared/types/pattern-room-case-review-dispatch.ts";
import {
  PATTERN_ROOM_LOAD_COMMAND,
  PATTERN_ROOM_SAVE_COMMAND,
} from "../../rooms/pattern-room/shared/types/pattern-room-persistence.ts";
import {
  DEBATE_SESSION_STATUSES,
  PATTERN_LAYERS,
  PATTERN_RELIABILITY_LEVELS,
  PATTERN_SOURCE_TYPES,
} from "../../rooms/pattern-room/shared/types/pattern-room-domain.ts";
import type {
  DebateSession,
  EvidenceItem,
  PatternEdge,
  PatternNode,
  ReportTrace,
  SourceItem,
  Topic,
} from "../../rooms/pattern-room/shared/types/pattern-room-domain.ts";

const EXPECTED_PATTERN_SOURCE_TYPES = [
  "book",
  "religious_text",
  "newspaper",
  "subtitle_archive",
  "web_archive",
  "visual",
  "laboratory_result",
  "number_analysis",
  "personal_note",
  "unknown",
] as const;

const EXPECTED_PATTERN_RELIABILITY_LEVELS = [
  "unverified",
  "user_provided",
  "verified",
  "disputed",
  "unknown",
] as const;

const EXPECTED_DEBATE_SESSION_STATUSES = [
  "mock",
  "pending",
  "active",
  "completed",
  "cancelled",
] as const;

const EXPECTED_PATTERN_LAYERS = ["evidence", "analysis", "interpretation", "uncertainty"] as const;

async function listTypeScriptFiles(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const filePaths: string[] = [];

  const dirResults = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => await listTypeScriptFiles(join(directoryPath, entry.name)))
  );
  for (const dirResult of dirResults) {
    filePaths.push(...dirResult);
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      filePaths.push(join(directoryPath, entry.name));
    }
  }

  return filePaths;
}

void test("pattern-room phase 2B domain literal reference sets stay stable", () => {
  assert.deepEqual(PATTERN_SOURCE_TYPES, EXPECTED_PATTERN_SOURCE_TYPES);
  assert.deepEqual(PATTERN_RELIABILITY_LEVELS, EXPECTED_PATTERN_RELIABILITY_LEVELS);
  assert.deepEqual(DEBATE_SESSION_STATUSES, EXPECTED_DEBATE_SESSION_STATUSES);
  assert.deepEqual(PATTERN_LAYERS, EXPECTED_PATTERN_LAYERS);
});

void test("pattern-room phase 2B domain mock imports with the expected static shape", () => {
  const topic: Topic = PATTERN_ROOM_DOMAIN_TEST_FIXTURE.topic;
  const nodes: PatternNode[] = PATTERN_ROOM_DOMAIN_TEST_FIXTURE.nodes;
  const edges: PatternEdge[] = PATTERN_ROOM_DOMAIN_TEST_FIXTURE.edges;
  const sources: SourceItem[] = PATTERN_ROOM_DOMAIN_TEST_FIXTURE.sources;
  const evidence: EvidenceItem[] = PATTERN_ROOM_DOMAIN_TEST_FIXTURE.evidence;
  const debateSession: DebateSession = PATTERN_ROOM_DOMAIN_TEST_FIXTURE.debateSession;
  const reportTrace: ReportTrace[] = PATTERN_ROOM_DOMAIN_TEST_FIXTURE.reportTrace;

  assert.equal(topic.rootNodeId, "node-horizon-claim");
  assert.equal(nodes.length, 4);
  assert.equal(edges.length, 3);
  assert.equal(sources.length, 4);
  assert.equal(evidence.length, 2);
  assert.equal(debateSession.status, "mock");
  assert.deepEqual(
    debateSession.roles.map((role) => role.slotId),
    ["AI0", "AI1", "AI2", "US1"]
  );
  assert.equal(
    debateSession.roles.every((role) => !role.connected && role.provider === null),
    true
  );
  assert.equal(debateSession.turns.length, 2);
  assert.equal(reportTrace.length, 3);
});

void test("pattern-room phase 2B domain mock cross references point to existing static items", () => {
  const { topic, nodes, edges, sources, evidence, debateSession } =
    PATTERN_ROOM_DOMAIN_TEST_FIXTURE;
  const nodeIds = new Set(nodes.map((node) => node.id));
  const sourceIds = new Set(sources.map((source) => source.id));

  assert.equal(topic.rootNodeId === null || nodeIds.has(topic.rootNodeId), true);

  for (const node of nodes) {
    assert.equal(node.topicId, topic.id);
  }

  for (const edge of edges) {
    assert.equal(edge.topicId, topic.id);
    assert.equal(nodeIds.has(edge.sourceNodeId), true);
    assert.equal(nodeIds.has(edge.targetNodeId), true);
  }

  for (const source of sources) {
    assert.equal(source.topicId, topic.id);
  }

  for (const evidenceItem of evidence) {
    assert.equal(evidenceItem.topicId, topic.id);
    assert.equal(sourceIds.has(evidenceItem.sourceId), true);
    assert.equal(
      evidenceItem.linkedNodeIds.every((nodeId) => nodeIds.has(nodeId)),
      true
    );
  }

  for (const turn of debateSession.turns) {
    assert.equal(turn.sessionId, debateSession.id);
    assert.equal(
      turn.referencedNodeIds.every((nodeId) => nodeIds.has(nodeId)),
      true
    );
  }
});

void test("pattern-room phase 2B tenth-man debate mock remains disconnected", () => {
  const { debateSession } = PATTERN_ROOM_DOMAIN_TEST_FIXTURE;

  assert.equal(debateSession.status, "mock");
  assert.deepEqual(
    debateSession.roles.map((role) => role.slotId),
    ["AI0", "AI1", "AI2", "US1"]
  );
  assert.equal(
    debateSession.roles.every((role) => !role.connected && role.provider === null),
    true
  );
});

void test("pattern-room phase 3B domain mock stays limited to the runtime transition point", async () => {
  const uiFilePaths = await listTypeScriptFiles(resolve("rooms/pattern-room/ui"));
  const domainMockConsumers: string[] = [];

  const uiSources = await Promise.all(
    uiFilePaths.map(async (filePath) => {
      const source = await readFile(filePath, "utf8");
      return { filePath, source };
    })
  );
  for (const { filePath, source } of uiSources) {
    if (
      source.includes("pattern-room-domain.mock") ||
      source.includes("PATTERN_ROOM_DOMAIN_MOCK")
    ) {
      domainMockConsumers.push(relative(process.cwd(), filePath).replace(/\\/g, "/"));
    }
  }

  assert.deepEqual(domainMockConsumers, []);
});

void test("pattern-room phase 3B panels do not import domain types or domain mock data", async () => {
  const panelFilePaths = await listTypeScriptFiles(resolve("rooms/pattern-room/ui/panels"));

  const panelSources = await Promise.all(
    panelFilePaths.map(async (filePath) => {
      const source = await readFile(filePath, "utf8");
      return { filePath, source };
    })
  );
  for (const { filePath, source } of panelSources) {
    assert.equal(source.includes("pattern-room-domain"), false, filePath);
    assert.equal(source.includes("PATTERN_ROOM_DOMAIN"), false, filePath);
  }
});

void test("pattern-room host runtime keeps domain mock usage scoped to ready-load persistence", async () => {
  const activation = createPatternRoomHostRuntime().activate({});
  assert.deepEqual(Object.keys(activation.commands).sort(), [
    PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND,
    PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND,
    PATTERN_ROOM_LOAD_COMMAND,
    PATTERN_ROOM_SAVE_COMMAND,
  ]);

  const hostFilePaths = await listTypeScriptFiles(resolve("rooms/pattern-room/host"));
  const domainMockConsumers: string[] = [];

  const hostSources = await Promise.all(
    hostFilePaths.map(async (filePath) => {
      const source = await readFile(filePath, "utf8");
      return { filePath, source };
    })
  );
  for (const { filePath, source } of hostSources) {
    if (
      source.includes("pattern-room-domain.mock") ||
      source.includes("PATTERN_ROOM_DOMAIN_MOCK")
    ) {
      domainMockConsumers.push(relative(process.cwd(), filePath).replace(/\\/g, "/"));
    }
  }

  assert.deepEqual(domainMockConsumers, []);
});

void test("pattern-room host runtime stays free of Node-only storage imports", async () => {
  const source = await readFile(resolve("rooms/pattern-room/host/runtime.ts"), "utf8");

  assert.equal(source.includes("pattern-room-json-store"), false);
  assert.equal(source.includes("node:fs"), false);
  assert.equal(source.includes("node:path"), false);
});
