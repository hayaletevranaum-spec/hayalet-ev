import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  flattenRoomCommandSpecs,
  flattenRoomProtocolSpecs,
  resolveRoomProtocolFilePath,
  validateRoomManifest,
  type InstalledRoomRecord,
  type RoomManifest,
  type RoomProtocolSpec,
} from "../../src/types/rooms.ts";
import { RoomProtocolRegistry } from "../../src/js/modules/rooms/room-protocol-registry.ts";

const PATTERN_ROOM_ROOT = resolve("rooms/pattern-room");
const MANIFEST_PATH = resolve(PATTERN_ROOM_ROOT, "manifest.json");
const PROTOCOL_KEY = "pattern-room-case-review";
const PROTOCOL_SCENARIO = "case-review";

function readPatternRoomManifest(): RoomManifest {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as unknown;
  const result = validateRoomManifest(manifest);

  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.ok(result.manifest);

  return result.manifest;
}

function findCaseReviewSpec(manifest: RoomManifest): RoomProtocolSpec {
  const spec = flattenRoomProtocolSpecs(manifest).find((candidate) => {
    return candidate.key === PROTOCOL_KEY;
  });

  assert.ok(spec);
  return spec;
}

function readCaseReviewProtocol(): string {
  const manifest = readPatternRoomManifest();
  const spec = findCaseReviewSpec(manifest);
  const relativePath = resolveRoomProtocolFilePath(spec);
  assert.ok(relativePath != null);
  const protocolPath = resolve(PATTERN_ROOM_ROOT, relativePath);

  assert.equal(existsSync(protocolPath), true);
  return readFileSync(protocolPath, "utf8");
}

function assertForbiddenTermsStayInAvoidanceContext(markdown: string): void {
  const forbiddenTerms = ["kanıtlandı", "kesin", "doğrulandı", "nihai sonuç"];
  const contextPattern = /kaçınılacak|uyarı bağlamında|yasağı/i;

  markdown.split(/\r?\n/).forEach((line) => {
    forbiddenTerms.forEach((term) => {
      if (line.toLocaleLowerCase("tr").includes(term)) {
        assert.match(line, contextPattern, `Unexpected verdict wording context: ${line}`);
      }
    });
  });
}

void test("pattern-room manifest exposes the static case review protocol spec", () => {
  const manifest = readPatternRoomManifest();
  const spec = findCaseReviewSpec(manifest);

  assert.equal(spec.key, PROTOCOL_KEY);
  assert.equal(spec.room, "pattern-room");
  assert.equal(spec.scenario, PROTOCOL_SCENARIO);
  assert.equal(spec.title, "[START][PATTERN-ROOM][CASE-REVIEW]");
  assert.equal(spec.editable, true);
  assert.equal(spec.path, "protocols/pattern-room-case-review.md");

  assert.deepEqual(flattenRoomCommandSpecs(manifest), []);
  assert.equal(manifest.runtime.uiEntry, "ui/index.html");
  assert.equal(manifest.runtime.hostEntry, "host/index.js");
});

void test("pattern-room case review protocol markdown documents cautious room semantics", () => {
  const markdown = readCaseReviewProtocol();

  assert.notEqual(markdown.trim(), "");
  assert.match(markdown, /Pattern Room \/ İz Sürme Odası/);
  assert.match(markdown, /kaynak, kanıt, yorum, belirsizlik ve bağlantı izlerini düzenlemek/);
  assert.match(markdown, /\bevidence\b/);
  assert.match(markdown, /\banalysis\b/);
  assert.match(markdown, /\binterpretation\b/);
  assert.match(markdown, /\buncertainty\b/);
  assert.match(markdown, /source:/);
  assert.match(markdown, /evidence:/);
  assert.match(markdown, /board note:/);
  assert.match(markdown, /connection:/);
  assert.match(markdown, /report:/);
  assert.match(markdown, /Case Packet dinamik ve sınırlı preview verisi/);
  assert.match(markdown, /openQuestions/);
  assert.match(markdown, /limits/);
  assert.match(markdown, /caution/);
  assert.match(markdown, /AI0:/);
  assert.match(markdown, /AI1:/);
  assert.match(markdown, /AI2:/);
  assert.match(markdown, /US1:/);
  assert.match(markdown, /Kaçınılacak dil/);
  assert.match(markdown, /Yeni veri uydurma/);
  assertForbiddenTermsStayInAvoidanceContext(markdown);

  assert.match(markdown, /"format": "pattern-room-case-review"/);
  assert.match(markdown, /"version": 1/);

  const expectedCanonicalSectionKeys = [
    "observation",
    "evidence",
    "analysis",
    "counterArgument",
    "missingInformation",
    "openQuestions",
    "confidenceNotes",
  ];
  const canonicalSectionKeys = [
    ...markdown.matchAll(
      /^\s+"(observation|evidence|analysis|counterArgument|missingInformation|openQuestions|confidenceNotes)"\s*:\s*\[\],?$/gm
    ),
  ].map((match) => match[1]);
  assert.deepEqual(canonicalSectionKeys, expectedCanonicalSectionKeys);

  const codeTick = String.fromCharCode(96);
  const expectedFallbackHeadings = [
    "- " + codeTick + "Observation" + codeTick + " veya " + codeTick + "Gözlem" + codeTick,
    "- " + codeTick + "Evidence" + codeTick + " veya " + codeTick + "Kanıt" + codeTick,
    "- " + codeTick + "Analysis" + codeTick + " veya " + codeTick + "Analiz" + codeTick,
    "- " +
      codeTick +
      "Counter Argument" +
      codeTick +
      " veya " +
      codeTick +
      "Karşı Argüman" +
      codeTick,
    "- " +
      codeTick +
      "Missing Information" +
      codeTick +
      " veya " +
      codeTick +
      "Eksik Bilgi" +
      codeTick,
    "- " + codeTick + "Open Questions" + codeTick + " veya " + codeTick + "Açık Sorular" + codeTick,
    "- " +
      codeTick +
      "Confidence Notes" +
      codeTick +
      " veya " +
      codeTick +
      "Güven Notları" +
      codeTick,
  ];
  assert.deepEqual(
    markdown.split(/\r?\n/).filter((line) => expectedFallbackHeadings.includes(line)),
    expectedFallbackHeadings
  );
  assert.match(
    markdown,
    /\[connection\] source=<sourceId>; type=<edgeType>; target=<targetId>; note=<optional note>/
  );
});

void test("pattern-room protocol spec resolves through the existing room protocol registry", async () => {
  const manifest = readPatternRoomManifest();
  const protocolBody = readCaseReviewProtocol();
  const installedRoom: InstalledRoomRecord = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    installedDir: PATTERN_ROOM_ROOT,
    sourceDir: PATTERN_ROOM_ROOT,
    manifestPath: MANIFEST_PATH,
    runtimeEntryPath: resolve(PATTERN_ROOM_ROOT, manifest.runtime.uiEntry),
    hostEntryPath: resolve(PATTERN_ROOM_ROOT, manifest.runtime.hostEntry),
    defaultFeatureId: manifest.defaultFeatureId,
    features: manifest.features.map((feature) => {
      return {
        id: feature.id,
        name: feature.name,
      };
    }),
    protocolSpecs: flattenRoomProtocolSpecs(manifest),
    installedAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z",
  };

  RoomProtocolRegistry.reset();
  await RoomProtocolRegistry.syncInstalledRooms([installedRoom], {
    startupProtocols: [{ roomId: "pattern-room", key: PROTOCOL_KEY, body: protocolBody }],
  });

  const resolved = RoomProtocolRegistry.resolve("pattern-room", PROTOCOL_SCENARIO);
  const merged = await RoomProtocolRegistry.mergeProtocolMap({});

  assert.equal(resolved?.key, PROTOCOL_KEY);
  assert.equal(resolved.title, "[START][PATTERN-ROOM][CASE-REVIEW]");
  assert.equal(resolved.relativeProtocolPath, "protocols/pattern-room-case-review.md");
  assert.equal(merged[PROTOCOL_KEY], protocolBody);

  RoomProtocolRegistry.reset();
});

void test("pattern-room phase 15D stays static and separate from dispatch or packet composition", () => {
  const manifestSource = readFileSync(MANIFEST_PATH, "utf8");
  const protocolSource = readCaseReviewProtocol();
  const phaseSources = `${manifestSource}\n${protocolSource}`;

  assert.doesNotMatch(phaseSources, /dispatchBridge|SlotBridge|message\.send|protocolDelivered/);
  assert.doesNotMatch(phaseSources, /provider|relay|ipcMain|ipcRenderer|roomAPI/);
  assert.doesNotMatch(phaseSources, /createPatternRoomCasePacket|compose.*CasePacket/i);
  assert.doesNotMatch(manifestSource, /"commandSpecs"\s*:/);
});
