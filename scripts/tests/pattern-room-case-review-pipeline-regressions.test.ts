import test from "node:test";
import assert from "node:assert/strict";

import "./pattern-room-case-review-parser-formats-regressions.test.ts";

import {
  applyPatternRoomCaseReview,
  previewPatternRoomCaseReviewApply,
} from "../../rooms/pattern-room/shared/adapters/pattern-room-case-review-apply.ts";
import { createPatternRoomCaseReviewDispatchDraft } from "../../rooms/pattern-room/shared/adapters/pattern-room-case-review-dispatch-adapter.ts";
import { createPatternRoomCaseReviewHash } from "../../rooms/pattern-room/shared/adapters/pattern-room-case-review-hash.ts";
import { createPatternRoomCaseReviewMessage } from "../../rooms/pattern-room/shared/adapters/pattern-room-case-review-message-adapter.ts";
import { parsePatternRoomCaseReviewResult } from "../../rooms/pattern-room/shared/adapters/pattern-room-case-review-parser.ts";
import {
  createPatternRoomCaseReviewRuntimeState,
  reducePatternRoomCaseReviewRuntimeState,
} from "../../rooms/pattern-room/shared/state/pattern-room-case-review-state.ts";
import type { PatternRoomCasePacket } from "../../rooms/pattern-room/shared/types/pattern-room-case-packet.ts";
import type {
  PatternRoomCaseReviewEvent,
  PatternRoomCaseReviewReply,
  PatternRoomCaseReviewRuntimeState,
} from "../../rooms/pattern-room/shared/types/pattern-room-case-review-session.ts";

const STRUCTURED_REPLY = [
  "## Observation",
  "- Kamera saat kaydı ile not arasında fark var.",
  "",
  "## Evidence",
  "- Saat damgası yeniden kontrol edilmeli.",
  "",
  "## Analysis",
  "- İki kayıt aynı olayı gösteriyor olabilir.",
  "- [connection] source=source-001; type=supports; target=node-001; note=Exact id bağlantısı",
  "- [connection] source=source-001; type=supports; target=missing-node",
  "",
  "## Counter Argument",
  "- Kayıtlar farklı günlerden olabilir.",
  "",
  "## Missing Information",
  "- Kamera zaman dilimi bilinmiyor.",
  "",
  "## Open Questions",
  "- Ham dosyanın metadata değeri nedir?",
  "",
  "## Confidence Notes",
  "- Orta güven; kaynak metadata eksik.",
].join("\n");

function createCasePacket(): PatternRoomCasePacket {
  return {
    packetVersion: 1,
    roomId: "pattern-room",
    topicLabel: "Runtime review fixture",
    generatedFrom: "local-view-model",
    caution: "Yerel ve doğrulanmamış çalışma paketi.",
    sources: [
      {
        id: "source-001",
        label: "Kamera kaydı",
        typeLabel: "Yerel Kaynak",
        origin: "Kullanıcı arşivi",
        status: "unverified",
        preview: "Saat damgası 22:14.",
        segmentCount: 1,
      },
    ],
    evidence: [
      {
        id: "evidence-001",
        label: "Saat damgası",
        sourceLabel: "Kamera kaydı",
        excerptPreview: "22:14",
        interpretationPreview: null,
        layer: "evidence",
      },
    ],
    boardNotes: [
      {
        id: "node-001",
        label: "Zaman farkı",
        type: "Belirsizlik",
        layer: "uncertainty",
        contentPreview: "Notta 22:18 yazıyor.",
      },
    ],
    connections: [],
    debate: {
      phaseLabel: "pending",
      statusLabel: "Hazır değil",
      referenceCount: 0,
      turnCount: 0,
      verdictPreview: null,
      turnPreviews: [],
    },
    openQuestions: ["Zaman dilimi nedir?"],
    limits: {
      maxSources: 20,
      maxEvidence: 30,
      maxBoardNotes: 30,
      maxConnections: 30,
      excerptMaxLength: 500,
    },
  };
}

function timestamp(step: number): string {
  return `2026-08-03T00:00:${String(step).padStart(2, "0")}.000Z`;
}

function reduce(
  state: PatternRoomCaseReviewRuntimeState,
  event: PatternRoomCaseReviewEvent
): PatternRoomCaseReviewRuntimeState {
  return reducePatternRoomCaseReviewRuntimeState(state, event);
}

function createReply(requestId = "request-001"): PatternRoomCaseReviewReply {
  return {
    text: STRUCTURED_REPLY,
    responseHash: createPatternRoomCaseReviewHash(STRUCTURED_REPLY),
    messageId: "message-001",
    clientRequestId: requestId,
    brokerMessageId: "broker-001",
    receivedAt: timestamp(5),
  };
}

void test("pattern-room review pipeline composes packet, message and sendWait draft deterministically", () => {
  const packet = createCasePacket();
  const before = JSON.stringify(packet);
  const message = createPatternRoomCaseReviewMessage({
    casePacket: packet,
    roleSlot: "AI1",
    taskPrompt: "İzleri rolüne göre incele.",
  });
  const draft = createPatternRoomCaseReviewDispatchDraft({ reviewMessage: message });
  const secondMessage = createPatternRoomCaseReviewMessage({
    casePacket: packet,
    roleSlot: "AI1",
    taskPrompt: "İzleri rolüne göre incele.",
  });
  const secondDraft = createPatternRoomCaseReviewDispatchDraft({ reviewMessage: secondMessage });

  assert.equal(message.packetHash, createPatternRoomCaseReviewHash(packet));
  assert.equal(draft.packetHash, message.packetHash);
  assert.equal(draft.payload.action, "message.sendWait");
  assert.equal(draft.payload.toSlot, "ai1");
  assert.equal(draft.payload.timeoutMs, 120_000);
  assert.equal(draft.payload.payload.text, message.dispatchText);
  assert.doesNotMatch(draft.payload.payload.text, /Pattern Room \/ İz Sürme Odası/);
  assert.deepEqual(message, secondMessage);
  assert.deepEqual(draft, secondDraft);
  assert.equal(JSON.stringify(packet), before);
});

void test("pattern-room review hash canonicalizes object key order and line endings", () => {
  const left = createPatternRoomCaseReviewHash({
    beta: "line one\r\nline two  ",
    alpha: [1, true],
  });
  const right = createPatternRoomCaseReviewHash({
    alpha: [1, true],
    beta: "line one\nline two",
  });

  assert.equal(left, right);
  assert.match(left, /^fnv1a32-[0-9a-f]{8}$/);
});

void test("pattern-room parser creates readonly typed sections and exact connection suggestions", () => {
  const result = parsePatternRoomCaseReviewResult(STRUCTURED_REPLY);

  assert.equal(result.fallbackUsed, false);
  assert.equal(
    result.sections.observation.items[0]?.text,
    "Kamera saat kaydı ile not arasında fark var."
  );
  assert.equal(result.sections.analysis.items.length, 1);
  assert.equal(result.suggestedConnections.length, 2);
  assert.deepEqual(result.suggestedConnections[0], {
    sourceId: "source-001",
    edgeType: "supports",
    targetId: "node-001",
    note: "Exact id bağlantısı",
    rawText:
      "[connection] source=source-001; type=supports; target=node-001; note=Exact id bağlantısı",
  });
  assert.deepEqual(result.openQuestions, ["Ham dosyanın metadata değeri nedir?"]);
  assert.equal(
    result.suggestions.filter((suggestion) => suggestion.kind === "evidence_candidate").length,
    1
  );
  assert.equal(
    result.suggestions.filter((suggestion) => suggestion.kind === "connection_candidate").length,
    2
  );
  assert.equal(Object.isFrozen(result.suggestions), true);
  assert.deepEqual(result.missingEvidence, ["Kamera zaman dilimi bilinmiyor."]);
  assert.deepEqual(result.confidence, ["Orta güven; kaynak metadata eksik."]);
  assert.equal(result.summary, "Kamera saat kaydı ile not arasında fark var.");
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.sections), true);
  assert.equal(Object.isFrozen(result.sections.observation.items), true);
});

void test("pattern-room parser preserves malformed and empty replies without producing a verdict", () => {
  const malformed = parsePatternRoomCaseReviewResult(
    "Bu biçimsiz cevap yalnız ham bir gözlem taşıyor."
  );
  const empty = parsePatternRoomCaseReviewResult("   ");
  const partiallyMalformed = parsePatternRoomCaseReviewResult(
    [
      "## Observation",
      "- Korunan gözlem.",
      "## Unexpected Section",
      "- İzin verilmeyen bölüm içeriği kaybolmamalı.",
      "## Evidence",
      "- Korunan kanıt.",
    ].join("\n")
  );

  assert.equal(malformed.fallbackUsed, true);
  assert.equal(
    malformed.sections.analysis.items[0]?.text,
    "Bu biçimsiz cevap yalnız ham bir gözlem taşıyor."
  );
  assert.equal(
    malformed.warnings.some((warning) => warning.code === "malformed-format"),
    true
  );
  assert.equal(empty.fallbackUsed, true);
  assert.equal(empty.items.length, 0);
  assert.equal(empty.warnings[0]?.code, "empty-reply");
  assert.equal(partiallyMalformed.fallbackUsed, true);
  assert.equal(
    partiallyMalformed.sections.analysis.items.some((item) => {
      return item.text === "İzin verilmeyen bölüm içeriği kaybolmamalı.";
    }),
    true
  );
  assert.equal(
    partiallyMalformed.warnings.some((warning) => warning.code === "unknown-section"),
    true
  );
  assert.doesNotMatch(malformed.summary, /kanıtlandı|kesin|doğrulandı|nihai sonuç/i);
});

void test("pattern-room immutable lifecycle completes the required event order", () => {
  const parsed = parsePatternRoomCaseReviewResult(STRUCTURED_REPLY);
  const initial = createPatternRoomCaseReviewRuntimeState();
  const metadataWarnings = ["Taslak uyarısı."];
  const preview = reduce(initial, {
    type: "preview-created",
    sessionId: "session-001",
    occurredAt: timestamp(1),
    role: "AI2",
    reviewLabel: "10. Adam İncelemesi",
    packetHash: "packet-hash",
    metadata: { warnings: metadataWarnings },
  });
  metadataWarnings.push("Stored metadata'ya sızmamalı.");
  const started = reduce(preview, {
    type: "dispatch-started",
    sessionId: "session-001",
    occurredAt: timestamp(2),
    requestId: "request-001",
    operation: "start",
    attempt: 1,
  });
  const sent = reduce(started, {
    type: "dispatch-sent",
    sessionId: "session-001",
    occurredAt: timestamp(3),
    requestId: "request-001",
  });
  const waiting = reduce(sent, {
    type: "waiting-reply",
    sessionId: "session-001",
    occurredAt: timestamp(4),
    requestId: "request-001",
  });
  const received = reduce(waiting, {
    type: "reply-received",
    sessionId: "session-001",
    occurredAt: timestamp(5),
    requestId: "request-001",
    reply: createReply(),
  });
  const parsedState = reduce(received, {
    type: "parsed",
    sessionId: "session-001",
    occurredAt: timestamp(6),
    requestId: "request-001",
    result: parsed,
  });
  const ready = reduce(parsedState, {
    type: "review-ready",
    sessionId: "session-001",
    occurredAt: timestamp(7),
    requestId: "request-001",
    result: parsed,
  });
  const applyWarnings = ["Exact-id bağlantısı atlandı."];
  const applied = reduce(ready, {
    type: "review-applied",
    sessionId: "session-001",
    occurredAt: timestamp(8),
    requestId: "request-001",
    mode: "all",
    summary: {
      mode: "all",
      boardNotesAdded: 3,
      evidenceAdded: 1,
      openQuestionsAdded: 1,
      uncertaintyAdded: 2,
      connectionsAdded: 1,
      skipped: 1,
      warnings: applyWarnings,
    },
  });
  applyWarnings.push("Stored state'e sızmamalı.");

  assert.equal(initial.activeSession, null);
  assert.equal(preview.activeSession?.status, "preview");
  assert.deepEqual(preview.activeSession?.metadata["warnings"], ["Taslak uyarısı."]);
  assert.equal(
    Object.isFrozen(preview.activeSession?.metadata["warnings"] as readonly string[]),
    true
  );
  assert.equal(started.activeSession?.lastEvent, "dispatch-started");
  assert.equal(sent.activeSession?.lastEvent, "dispatch-sent");
  assert.equal(waiting.activeSession?.status, "waiting-reply");
  assert.equal(received.activeSession?.lastEvent, "reply-received");
  assert.equal(parsedState.activeSession?.lastEvent, "parsed");
  assert.equal(ready.activeSession?.status, "ready");
  assert.equal(ready.activeSession?.completedAt, timestamp(7));
  assert.equal(ready.history.length, 1);
  assert.equal(ready.history[0]?.responseHash, createReply().responseHash);
  assert.equal(applied.activeSession?.status, "applied");
  assert.equal(applied.activeSession?.appliedAt, timestamp(8));
  assert.deepEqual(
    [preview, started, sent, waiting, received, parsedState, ready, applied].map(
      (state) => state.activeSession?.lastEvent
    ),
    [
      "preview-created",
      "dispatch-started",
      "dispatch-sent",
      "waiting-reply",
      "reply-received",
      "parsed",
      "review-ready",
      "review-applied",
    ]
  );
  assert.equal(Object.isFrozen(applied), true);
  assert.equal(Object.isFrozen(applied.activeSession), true);
  assert.equal(Object.isFrozen(applied.activeSession?.applySummary), true);
  assert.equal(Object.isFrozen(applied.activeSession?.applySummary?.warnings), true);
  assert.deepEqual(applied.activeSession?.applySummary?.warnings, ["Exact-id bağlantısı atlandı."]);
  assert.equal(Object.isFrozen(applied.history), true);
  assert.equal(preview.activeSession?.requestId, null);
  assert.notEqual(ready, parsedState);
});

void test("pattern-room reducer ignores duplicate, stale and cancelled late replies", () => {
  let state = createPatternRoomCaseReviewRuntimeState();
  state = reduce(state, {
    type: "preview-created",
    sessionId: "session-stale",
    occurredAt: timestamp(1),
    role: "AI0",
    reviewLabel: "Araştırmacı İncelemesi",
    packetHash: "packet-hash",
  });
  state = reduce(state, {
    type: "dispatch-started",
    sessionId: "session-stale",
    occurredAt: timestamp(2),
    requestId: "request-live",
    operation: "start",
  });
  state = reduce(state, {
    type: "dispatch-sent",
    sessionId: "session-stale",
    occurredAt: timestamp(3),
    requestId: "request-live",
  });
  state = reduce(state, {
    type: "waiting-reply",
    sessionId: "session-stale",
    occurredAt: timestamp(4),
    requestId: "request-live",
  });

  const stale = reduce(state, {
    type: "reply-received",
    sessionId: "session-stale",
    occurredAt: timestamp(4),
    requestId: "request-old",
    reply: createReply("request-old"),
  });
  assert.equal(stale, state);

  const received = reduce(state, {
    type: "reply-received",
    sessionId: "session-stale",
    occurredAt: timestamp(5),
    requestId: "request-live",
    reply: createReply("request-live"),
  });
  assert.equal(received.activeSession?.reply?.messageId, "message-001");

  const duplicate = reduce(received, {
    type: "reply-received",
    sessionId: "session-stale",
    occurredAt: timestamp(6),
    requestId: "request-live",
    reply: createReply("request-live"),
  });
  const differentSecondReply = reduce(received, {
    type: "reply-received",
    sessionId: "session-stale",
    occurredAt: timestamp(7),
    requestId: "request-live",
    reply: {
      ...createReply("request-live"),
      text: "Farklı ikinci cevap.",
      messageId: "message-002",
      responseHash: createPatternRoomCaseReviewHash("Farklı ikinci cevap."),
    },
  });
  assert.equal(duplicate, received);
  assert.equal(differentSecondReply, received);

  const cancelled = reduce(state, {
    type: "cancelled",
    sessionId: "session-stale",
    occurredAt: timestamp(5),
    requestId: "request-live",
    reason: "Kullanıcı iptal etti.",
  });
  const late = reduce(cancelled, {
    type: "reply-received",
    sessionId: "session-stale",
    occurredAt: timestamp(6),
    requestId: "request-live",
    reply: createReply("request-live"),
  });
  assert.equal(cancelled.activeSession?.status, "cancelled");
  assert.equal(late, cancelled);
});

void test("pattern-room reducer rejects out-of-order lifecycle events", () => {
  let state = createPatternRoomCaseReviewRuntimeState();
  state = reduce(state, {
    type: "preview-created",
    sessionId: "session-order",
    occurredAt: timestamp(1),
    role: "AI1",
    reviewLabel: "Güçlü Yorum Testi",
    packetHash: "packet-hash",
  });
  state = reduce(state, {
    type: "dispatch-started",
    sessionId: "session-order",
    occurredAt: timestamp(2),
    requestId: "request-order",
    operation: "start",
  });

  const waitingBeforeSent = reduce(state, {
    type: "waiting-reply",
    sessionId: "session-order",
    occurredAt: timestamp(3),
    requestId: "request-order",
  });
  const replyBeforeWaiting = reduce(state, {
    type: "reply-received",
    sessionId: "session-order",
    occurredAt: timestamp(3),
    requestId: "request-order",
    reply: createReply("request-order"),
  });
  assert.equal(waitingBeforeSent, state);
  assert.equal(replyBeforeWaiting, state);

  const sent = reduce(state, {
    type: "dispatch-sent",
    sessionId: "session-order",
    occurredAt: timestamp(3),
    requestId: "request-order",
  });
  const waiting = reduce(sent, {
    type: "waiting-reply",
    sessionId: "session-order",
    occurredAt: timestamp(4),
    requestId: "request-order",
  });
  const backwardsSent = reduce(waiting, {
    type: "dispatch-sent",
    sessionId: "session-order",
    occurredAt: timestamp(5),
    requestId: "request-order",
  });
  const received = reduce(waiting, {
    type: "reply-received",
    sessionId: "session-order",
    occurredAt: timestamp(5),
    requestId: "request-order",
    reply: createReply("request-order"),
  });
  const readyWithoutParsed = reduce(received, {
    type: "review-ready",
    sessionId: "session-order",
    occurredAt: timestamp(6),
    requestId: "request-order",
    result: parsePatternRoomCaseReviewResult(STRUCTURED_REPLY),
  });

  assert.equal(backwardsSent, waiting);
  assert.equal(readyWithoutParsed, received);
});

void test("pattern-room retry uses a new request and preserves attempt history", () => {
  let state = createPatternRoomCaseReviewRuntimeState();
  state = reduce(state, {
    type: "preview-created",
    sessionId: "session-retry",
    occurredAt: timestamp(1),
    role: "US1",
    reviewLabel: "Hakem İncelemesi",
    packetHash: "packet-hash",
  });
  state = reduce(state, {
    type: "dispatch-started",
    sessionId: "session-retry",
    occurredAt: timestamp(2),
    requestId: "request-1",
    operation: "start",
    attempt: 1,
  });
  state = reduce(state, {
    type: "timeout",
    sessionId: "session-retry",
    occurredAt: timestamp(3),
    requestId: "request-1",
    error: { code: "TARGET_TIMEOUT", message: "Timed out." },
  });
  state = reduce(state, {
    type: "dispatch-started",
    sessionId: "session-retry",
    occurredAt: timestamp(4),
    requestId: "request-2",
    operation: "retry",
    attempt: 2,
  });

  assert.equal(state.activeSession?.requestId, "request-2");
  assert.equal(state.activeSession?.attempt, 2);
  assert.equal(state.activeSession?.status, "dispatching");
  assert.equal(state.history.length, 2);
  assert.deepEqual(
    state.history.map((entry) => entry.requestId),
    ["request-1", "request-2"]
  );
});

void test("pattern-room controlled apply is additive and respects all three modes", () => {
  const result = parsePatternRoomCaseReviewResult(STRUCTURED_REPLY);
  const calls = {
    notes: [] as string[],
    evidence: [] as string[],
    candidates: [] as string[],
    questions: [] as string[],
    edges: [] as string[],
  };
  const target = {
    addAuthoredClaim(label: string, content: string): void {
      calls.notes.push(`${label}:${content}`);
    },
    addAuthoredUncertainty(label: string, content: string): void {
      calls.questions.push(`${label}:${content}`);
    },
    addAuthoredEvidence(label: string, excerpt: string, interpretation?: string): void {
      calls.evidence.push(`${label}:${excerpt}:${interpretation ?? ""}`);
    },
    addEvidenceCandidate(
      suggestionId: string,
      text: string,
      reviewSessionId?: string | null
    ): boolean {
      calls.candidates.push(`${suggestionId}:${text}:${reviewSessionId ?? ""}`);
      return true;
    },
    addAuthoredEdge(
      edgeType:
        | "supports"
        | "contradicts"
        | "references"
        | "derived_from"
        | "inspired_by"
        | "questions"
        | "needs_review",
      sourceId: string,
      targetId: string
    ): void {
      calls.edges.push(`${sourceId}:${edgeType}:${targetId}`);
    },
    resolveEntityExists(id: string): boolean {
      return id === "source-001" || id === "node-001";
    },
  };

  const questionsOnly = applyPatternRoomCaseReview(result, target, {
    mode: "open-questions-only",
  });
  assert.equal(questionsOnly.openQuestionsAdded, 1);
  assert.equal(calls.notes.length, 0);
  assert.equal(calls.evidence.length, 0);

  calls.questions.length = 0;
  const evidenceOnly = applyPatternRoomCaseReview(result, target, {
    mode: "evidence-suggestions-only",
    sessionId: "session-candidate",
  });
  assert.equal(evidenceOnly.evidenceAdded, 0);
  assert.equal(evidenceOnly.evidenceCandidatesAdded, 1);
  assert.equal(evidenceOnly.skipped, 0);
  assert.equal(evidenceOnly.warnings.length, 0);
  assert.equal(calls.candidates.length, 1);
  assert.match(calls.candidates[0] ?? "", /session-candidate$/);
  assert.equal(calls.evidence.length, 0);
  assert.equal(calls.notes.length, 0);

  calls.evidence.length = 0;
  calls.candidates.length = 0;
  calls.questions.length = 0;
  const preview = previewPatternRoomCaseReviewApply(result, target, { mode: "all" });
  assert.equal(preview.boardNotesAdded, 3);
  assert.equal(preview.evidenceCandidatesAdded, 1);
  assert.equal(calls.notes.length, 0);
  assert.equal(calls.evidence.length, 0);
  assert.equal(calls.questions.length, 0);
  assert.equal(calls.edges.length, 0);

  const all = applyPatternRoomCaseReview(result, target, { mode: "all" });
  assert.equal(all.boardNotesAdded, 3);
  assert.equal(all.evidenceAdded, 0);
  assert.equal(all.evidenceCandidatesAdded, 1);
  assert.equal(all.openQuestionsAdded, 1);
  assert.equal(all.uncertaintyAdded, 2);
  assert.equal(all.connectionsAdded, 1);
  assert.equal(all.skipped, 1);
  assert.equal(all.warnings.length, 1);
  assert.equal(calls.notes.length, 3);
  assert.equal(calls.candidates.length, 1);
  assert.match(calls.notes[0] ?? "", /^AI Review Observation 1:/);
  assert.equal(calls.edges[0], "source-001:supports:node-001");
  assert.deepEqual(all, preview);
  assert.equal(Object.isFrozen(all), true);
  assert.equal(Object.isFrozen(all.warnings), true);

  calls.evidence.length = 0;
  applyPatternRoomCaseReview(result, target, {
    mode: "evidence-suggestions-only",
    copy: {
      reviewPrefix: "AI İncelemesi",
      evidenceSuggestionLabel: "Kanıt Önerisi",
      openQuestionLabel: "Açık Soru",
      userAppliedSuggestion:
        "Kullanıcı tarafından uygulanmış AI önerisi; bağımsız olarak doğrulanmamıştır.",
      sectionLabels: {
        observation: "Gözlem",
        evidence: "Kanıt",
        analysis: "Analiz",
        counterArgument: "Karşı Argüman",
        missingInformation: "Eksik Bilgi",
        openQuestions: "Açık Sorular",
        confidenceNotes: "Güven Notları",
      },
    },
  });
  assert.equal(calls.evidence.length, 0);
  assert.equal(calls.candidates.length, 2);
});
