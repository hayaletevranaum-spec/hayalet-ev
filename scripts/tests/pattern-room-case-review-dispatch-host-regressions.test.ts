import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { RoomCommandRegistry } from "../../src/js/modules/rooms/room-command-registry.ts";
import {
  flattenRoomCommandSpecs,
  validateRoomManifest,
  type InstalledRoomRecord,
  type RoomManifest,
} from "../../src/types/rooms.ts";
import createPatternRoomHostRuntime from "../../rooms/pattern-room/host/runtime.ts";
import { createPatternRoomCaseReviewDispatchDraft } from "../../rooms/pattern-room/shared/adapters/pattern-room-case-review-dispatch-adapter.ts";
import { reducePatternRoomCaseReviewRuntimeState } from "../../rooms/pattern-room/shared/state/pattern-room-case-review-state.ts";
import { createPatternRoomCaseReviewMessage } from "../../rooms/pattern-room/shared/adapters/pattern-room-case-review-message-adapter.ts";
import type { PatternRoomCasePacket } from "../../rooms/pattern-room/shared/types/pattern-room-case-packet.ts";
import {
  PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND,
  PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND,
  PATTERN_ROOM_CASE_REVIEW_DISPATCH_FAILED_EVENT,
  PATTERN_ROOM_CASE_REVIEW_DISPATCHED_EVENT,
  PATTERN_ROOM_CASE_REVIEW_TIMEOUT_MS,
  type PatternRoomCaseReviewDispatchDraft,
} from "../../rooms/pattern-room/shared/types/pattern-room-case-review-dispatch.ts";
import type { PatternRoomCaseReviewResult } from "../../rooms/pattern-room/shared/types/pattern-room-case-review-result.ts";
import {
  PATTERN_ROOM_CASE_REVIEW_EVENT,
  type PatternRoomCaseReviewEventPayload,
  type PatternRoomCaseReviewRuntimeState,
} from "../../rooms/pattern-room/shared/types/pattern-room-case-review-session.ts";
import { PATTERN_ROOM_SNAPSHOT_VERSION } from "../../rooms/pattern-room/shared/types/pattern-room-snapshot.ts";
import type { PatternRoomStorageAdapter } from "../../rooms/pattern-room/shared/types/pattern-room-storage.ts";

type PatternRoomNotification = {
  payload: Record<string, unknown>;
  type: string;
};

const PATTERN_ROOM_RECORD: InstalledRoomRecord = {
  id: "pattern-room",
  name: "Pattern Room",
  version: "2.0.0",
  installedDir: "/workspace/rooms/.build/pattern-room/runtime",
  sourceDir: "/workspace/rooms/pattern-room",
  manifestPath: "/workspace/rooms/.build/pattern-room/runtime/manifest.json",
  runtimeEntryPath: "/workspace/rooms/.build/pattern-room/runtime/ui/index.html",
  hostEntryPath: "/workspace/rooms/.build/pattern-room/runtime/host/index.js",
  defaultFeatureId: "pattern-workbench",
  features: [{ id: "pattern-workbench", name: "Pattern Workbench" }],
  commandSpecs: [],
  installedAt: "2026-05-21T00:00:00.000Z",
  updatedAt: "2026-05-21T00:00:00.000Z",
};

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

const CASE_REVIEW_REPLY = [
  "[Observation]",
  "- Yerel kayıtta zaman çizelgesi belirsiz.",
  "[Evidence]",
  "- evidence-001 yeniden okunmalı.",
  "[Analysis]",
  "- Mevcut yorum ek bağlam gerektiriyor.",
  "[Counter Argument]",
  "- Alternatif bir açıklama mümkün.",
  "[Missing Information]",
  "- Kaynağın tam tarihi eksik.",
  "[Open Questions]",
  "- Kayıt hangi tarihte yazıldı?",
  "[Confidence Notes]",
  "- Güven düzeyi orta.",
].join("\n");

function createDispatchDraft(
  roleSlot: "AI0" | "AI1" | "AI2" | "US1" = "AI2"
): PatternRoomCaseReviewDispatchDraft {
  const reviewMessage = createPatternRoomCaseReviewMessage({
    casePacket: createCasePacketFixture(),
    roleSlot,
    taskPrompt: "Karşı argümanları ve açık soruları çıkar.",
  });
  return createPatternRoomCaseReviewDispatchDraft({
    reviewMessage,
    options: { page: "ui/index.html" },
  });
}

function createDispatchRequest(
  draft: PatternRoomCaseReviewDispatchDraft = createDispatchDraft(),
  overrides: Partial<{
    attempt: number;
    operation: "start" | "retry" | "resend";
    parentSessionId: string | null;
    requestId: string;
    sessionId: string;
  }> = {}
): Record<string, unknown> {
  return {
    attempt: 1,
    draft,
    operation: "start",
    parentSessionId: null,
    requestId: "request-001",
    sessionId: "session-001",
    ...overrides,
  };
}

function createMockStorageAdapter(): PatternRoomStorageAdapter {
  return {
    async delete(_snapshotId: string): Promise<void> {
      await Promise.resolve(undefined);
    },
    async list(): Promise<[]> {
      return await Promise.resolve([]);
    },
    async load(_topicId: string): Promise<null> {
      return await Promise.resolve(null);
    },
    async save(): Promise<void> {
      await Promise.resolve(undefined);
    },
  };
}

function activateHost(
  options: {
    dispatchBridge?: (payload: Record<string, unknown>) => Promise<unknown>;
    now?: () => string;
    parseCaseReviewResult?: (rawReply: string) => PatternRoomCaseReviewResult;
    registerWithRegistry?: boolean;
  } = {}
): {
  activation: ReturnType<ReturnType<typeof createPatternRoomHostRuntime>["activate"]>;
  dispatchCalls: Record<string, unknown>[];
  notifications: PatternRoomNotification[];
  state: Map<string, unknown>;
} {
  const dispatchCalls: Record<string, unknown>[] = [];
  const notifications: PatternRoomNotification[] = [];
  const state = new Map<string, unknown>();
  const activation = createPatternRoomHostRuntime({
    storageAdapter: createMockStorageAdapter(),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.parseCaseReviewResult === undefined
      ? {}
      : { parseCaseReviewResult: options.parseCaseReviewResult }),
  }).activate({
    async dispatchBridge(payload) {
      dispatchCalls.push(payload);
      const clientRequestId = String(payload["clientRequestId"] ?? "");
      return await (options.dispatchBridge?.(payload) ??
        Promise.resolve({
          clientRequestId,
          reqId: clientRequestId,
          reply: {
            clientRequestId,
            messageId: `message-${clientRequestId}`,
            text: CASE_REVIEW_REPLY,
          },
          success: true,
        }));
    },
    getState(key) {
      return state.get(key);
    },
    setState(key, value) {
      state.set(key, value);
    },
    notifyRoom(type, payload = {}) {
      notifications.push({ payload, type });
    },
    registerCommand(commandName, handler, commandOptions = {}) {
      if (options.registerWithRegistry === true) {
        RoomCommandRegistry.registerHandler(
          PATTERN_ROOM_RECORD.id,
          commandName,
          handler,
          commandOptions
        );
      }
    },
  });

  return { activation, dispatchCalls, notifications, state };
}

const PATTERN_ROOM_CASE_REVIEW_STATE_KEY = "pattern-room:case-review-runtime";

function readReviewEventPayloads(
  notifications: readonly PatternRoomNotification[]
): PatternRoomCaseReviewEventPayload[] {
  return notifications
    .filter((notification) => notification.type === PATTERN_ROOM_CASE_REVIEW_EVENT)
    .map((notification) => notification.payload as unknown as PatternRoomCaseReviewEventPayload);
}

function readReviewState(state: ReadonlyMap<string, unknown>): PatternRoomCaseReviewRuntimeState {
  const runtimeState = state.get(PATTERN_ROOM_CASE_REVIEW_STATE_KEY);
  assert.ok(runtimeState);
  return runtimeState as PatternRoomCaseReviewRuntimeState;
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    reject: rejectPromise,
    resolve: resolvePromise,
  };
}

function createSuccessfulBridgeResult(
  requestId: string,
  options: { messageId?: string; text?: string } = {}
): Record<string, unknown> {
  return {
    clientRequestId: requestId,
    reqId: requestId,
    reply: {
      clientRequestId: requestId,
      messageId: options.messageId ?? `message-${requestId}`,
      text: options.text ?? CASE_REVIEW_REPLY,
    },
    success: true,
  };
}

function readPatternRoomManifest(): RoomManifest {
  const manifest = JSON.parse(
    readFileSync(resolve("rooms/pattern-room/manifest.json"), "utf8")
  ) as RoomManifest;
  const result = validateRoomManifest(manifest);

  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.ok(result.manifest);

  return result.manifest;
}

void test("pattern-room case review dispatch command contract literals stay stable", () => {
  assert.equal(PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND, "pattern:case-review-dispatch");
  assert.equal(PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND, "pattern:case-review-control");
  assert.equal(PATTERN_ROOM_CASE_REVIEW_EVENT, "pattern:case-review-event");
  assert.equal(PATTERN_ROOM_CASE_REVIEW_TIMEOUT_MS, 120_000);
  assert.equal(PATTERN_ROOM_CASE_REVIEW_DISPATCHED_EVENT, "pattern:case-review-dispatched");
  assert.equal(
    PATTERN_ROOM_CASE_REVIEW_DISPATCH_FAILED_EVENT,
    "pattern:case-review-dispatch-failed"
  );
});

void test("pattern-room case review commands register as internal room-ui only", () => {
  RoomCommandRegistry.reset();

  try {
    RoomCommandRegistry.syncInstalledRooms([PATTERN_ROOM_RECORD]);
    activateHost({ registerWithRegistry: true });
    const commandNames = [
      PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND,
      PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND,
    ] as const;

    for (const commandName of commandNames) {
      const metadata = RoomCommandRegistry.getMetadata(commandName, PATTERN_ROOM_RECORD.id);
      assert.equal(metadata?.scope, "room-ui");
      assert.equal(metadata.exposure, "internal");
      assert.equal(RoomCommandRegistry.listPublicCommands().includes(commandName), false);
      assert.equal(
        RoomCommandRegistry.getCatalog().some((entry) => entry.name === commandName),
        false
      );
      for (const provider of ["ai0", "ai1-ai2", "us1"] as const) {
        assert.equal(
          RoomCommandRegistry.getCatalog(provider).some((entry) => entry.name === commandName),
          false
        );
      }
    }
  } finally {
    RoomCommandRegistry.reset();
  }
});

void test("pattern-room case review commands stay out of manifest command specs", () => {
  const manifest = readPatternRoomManifest();
  const commandNames = new Set<string>([
    PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND,
    PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND,
  ]);

  assert.equal(
    flattenRoomCommandSpecs(manifest).some((spec) => commandNames.has(spec.name)),
    false
  );
});

void test("pattern-room case review dispatch rejects non room-ui providers and wrong rooms", async () => {
  RoomCommandRegistry.reset();
  const draft = createDispatchDraft();
  const { dispatchCalls } = activateHost({ registerWithRegistry: true });

  try {
    const providerResults = await Promise.all(
      (["ai0", "ai1", "ai2", "us1", "system", "provider"] as const).map(async (provider) => {
        const result = (await RoomCommandRegistry.run(PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND, {
          provider,
          roomId: PATTERN_ROOM_RECORD.id,
          roomPayload: { draft },
        })) as { success?: boolean };
        return { result, provider };
      })
    );
    for (const { result, provider } of providerResults) {
      assert.equal(result.success, false, `provider ${provider} should be rejected`);
    }

    const wrongRoomResult = (await RoomCommandRegistry.run(
      PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND,
      {
        provider: "room-ui",
        roomId: "forge-room",
        roomPayload: { draft },
      }
    )) as { success?: boolean };

    assert.equal(wrongRoomResult.success, false);
    assert.deepEqual(dispatchCalls, []);
  } finally {
    RoomCommandRegistry.reset();
  }
});

void test("pattern-room host completes the canonical sendWait lifecycle and stores immutable runtime state", async () => {
  RoomCommandRegistry.reset();
  const draft = createDispatchDraft();
  const request = createDispatchRequest(draft);
  const { dispatchCalls, notifications, state } = activateHost({ registerWithRegistry: true });

  try {
    const result = await RoomCommandRegistry.run(PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND, {
      provider: "room-ui",
      roomId: PATTERN_ROOM_RECORD.id,
      roomPayload: request,
    });

    assert.equal((result as { success?: boolean }).success, true);
    assert.equal(dispatchCalls.length, 1);
    assert.deepEqual(dispatchCalls[0], {
      ...draft.payload,
      action: "message.sendWait",
      clientRequestId: "request-001",
      replyToSlot: "room-ui",
      reqId: "request-001",
      wait: true,
    });
    assert.equal(dispatchCalls[0]?.["timeoutMs"], PATTERN_ROOM_CASE_REVIEW_TIMEOUT_MS);
    assert.deepEqual((dispatchCalls[0]?.["payload"] as Record<string, unknown>)["protocol"], {
      room: "pattern-room",
      scenario: "case-review",
      protocolKey: "pattern-room-case-review",
    });

    const eventPayloads = readReviewEventPayloads(notifications);
    assert.deepEqual(
      eventPayloads.map(({ event }) => event.type),
      [
        "preview-created",
        "dispatch-started",
        "dispatch-sent",
        "waiting-reply",
        "reply-received",
        "parsed",
        "review-ready",
      ]
    );
    assert.deepEqual(
      eventPayloads.map(({ state: eventState }) => eventState.revision),
      [1, 2, 3, 4, 5, 6, 7]
    );

    const runtimeState = readReviewState(state);
    assert.equal(runtimeState.activeSession?.status, "ready");
    assert.equal(runtimeState.activeSession?.requestId, "request-001");
    assert.equal(runtimeState.activeSession?.packetHash, draft.packetHash);
    assert.equal(runtimeState.activeSession?.reply?.messageId, "message-request-001");
    assert.equal(runtimeState.activeSession?.result?.sections.openQuestions.items.length, 1);
    assert.equal(runtimeState.history.length, 1);
    assert.equal(runtimeState.history[0]?.state, "ready");
    assert.equal(Object.isFrozen(runtimeState), true);
    assert.equal(Object.isFrozen(runtimeState.activeSession), true);
    assert.equal(Object.isFrozen(runtimeState.history), true);

    const legacyDispatch = notifications.find(
      (notification) => notification.type === PATTERN_ROOM_CASE_REVIEW_DISPATCHED_EVENT
    );
    assert.deepEqual(legacyDispatch?.payload, {
      requestId: "request-001",
      roleSlot: "AI2",
      sessionId: "session-001",
      success: true,
      targetSlot: "ai2",
      warnings: [],
    });
  } finally {
    RoomCommandRegistry.reset();
  }
});

void test("pattern-room case review rejects malformed typed requests before bridge dispatch", async () => {
  const draft = createDispatchDraft();
  const validRequest = createDispatchRequest(draft);
  const malformedRequests: unknown[] = [
    null,
    { draft },
    { ...validRequest, requestId: " " },
    { ...validRequest, sessionId: "" },
    { ...validRequest, attempt: 0 },
    { ...validRequest, operation: "unknown" },
    { ...validRequest, operation: "resend", parentSessionId: null },
    { ...validRequest, operation: "resend", parentSessionId: "session-001" },
    { ...validRequest, draft: { ...draft, packetHash: " " } },
    { ...validRequest, draft: { ...draft, targetSlot: "ai0" } },
    {
      ...validRequest,
      draft: { ...draft, payload: { ...draft.payload, action: "message.send" } },
    },
    {
      ...validRequest,
      draft: { ...draft, payload: { ...draft.payload, timeoutMs: 0 } },
    },
    {
      ...validRequest,
      draft: {
        ...draft,
        payload: {
          ...draft.payload,
          payload: {
            ...draft.payload.payload,
            protocol: { ...draft.payload.payload.protocol, context: { casePacket: "nope" } },
          },
        },
      },
    },
    {
      ...validRequest,
      draft: {
        ...draft,
        payload: {
          ...draft.payload,
          payload: { ...draft.payload.payload, text: " " },
        },
      },
    },
  ];
  const { activation, dispatchCalls, notifications, state } = activateHost();

  const results = await Promise.all(
    malformedRequests.map(async (request) => {
      return await activation.commands[PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND](request);
    })
  );

  assert.equal(
    results.every((result) => result.success === false),
    true
  );
  assert.deepEqual(dispatchCalls, []);
  assert.equal(readReviewState(state).revision, 0);
  assert.equal(
    notifications.every(
      (notification) => notification.type === PATTERN_ROOM_CASE_REVIEW_DISPATCH_FAILED_EVENT
    ),
    true
  );
});

void test("pattern-room maps resolved SlotBridge TARGET_TIMEOUT to timed-out state", async () => {
  const { activation, notifications, state } = activateHost({
    async dispatchBridge(payload) {
      const requestId = String(payload["clientRequestId"]);
      return await Promise.resolve({
        clientRequestId: requestId,
        code: "TARGET_TIMEOUT",
        message: "Timed out while waiting for reply",
        reqId: requestId,
        success: false,
      });
    },
  });

  const result =
    await activation.commands[PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND](createDispatchRequest());

  assert.equal(result.success, false);
  assert.equal(result.success === false ? result.code : null, "TARGET_TIMEOUT");
  assert.deepEqual(
    readReviewEventPayloads(notifications).map(({ event }) => event.type),
    ["preview-created", "dispatch-started", "dispatch-sent", "waiting-reply", "timeout"]
  );
  assert.equal(readReviewState(state).activeSession?.status, "timed-out");
  assert.equal(readReviewState(state).activeSession?.error?.code, "TARGET_TIMEOUT");
});

void test("pattern-room reports bridge rejection and accepts a new retry request", async () => {
  let firstAttempt = true;
  const { activation, dispatchCalls, notifications, state } = activateHost({
    async dispatchBridge(payload) {
      if (firstAttempt) {
        firstAttempt = false;
        throw new Error("dispatch temporary failure");
      }
      return await Promise.resolve(
        createSuccessfulBridgeResult(String(payload["clientRequestId"]))
      );
    },
  });
  const dispatch = activation.commands[PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND];

  const failedResult = await dispatch(createDispatchRequest());
  assert.equal(failedResult.success, false);
  assert.equal(failedResult.success === false ? failedResult.code : null, "DISPATCH_REJECTED");
  assert.equal(readReviewEventPayloads(notifications).at(-1)?.event.type, "dispatch-failed");

  const invalidRetry = await dispatch(
    createDispatchRequest(createDispatchDraft("AI1"), {
      attempt: 2,
      operation: "retry",
      requestId: "request-invalid",
      sessionId: "session-001",
    })
  );
  assert.equal(invalidRetry.success, false);
  assert.equal(invalidRetry.success === false ? invalidRetry.code : null, "RETRY_CONTEXT_INVALID");
  assert.equal(dispatchCalls.length, 1);

  const retryResult = await dispatch(
    createDispatchRequest(createDispatchDraft(), {
      attempt: 2,
      operation: "retry",
      requestId: "request-002",
      sessionId: "session-001",
    })
  );
  assert.equal(retryResult.success, true);
  assert.deepEqual(
    dispatchCalls.map((payload) => payload["clientRequestId"]),
    ["request-001", "request-002"]
  );
  assert.equal(readReviewState(state).activeSession?.status, "ready");
  assert.equal(readReviewState(state).activeSession?.operation, "retry");
});

void test("pattern-room maps partial and blank replies to reply-invalid", async () => {
  const partialHost = activateHost({
    async dispatchBridge(payload) {
      const requestId = String(payload["clientRequestId"]);
      return await Promise.resolve({
        clientRequestId: requestId,
        code: "PARTIAL_REPLY_STALLED",
        message: "Partial reply stopped progressing",
        reqId: requestId,
        success: false,
      });
    },
  });
  const partialResult =
    await partialHost.activation.commands[PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND](
      createDispatchRequest()
    );
  assert.equal(partialResult.success, false);
  assert.equal(
    readReviewEventPayloads(partialHost.notifications).at(-1)?.event.type,
    "reply-invalid"
  );

  const blankHost = activateHost({
    async dispatchBridge(payload) {
      const requestId = String(payload["clientRequestId"]);
      return await Promise.resolve(createSuccessfulBridgeResult(requestId, { text: "   " }));
    },
  });
  const blankResult =
    await blankHost.activation.commands[PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND](
      createDispatchRequest()
    );
  assert.equal(blankResult.success, false);
  assert.equal(blankResult.success === false ? blankResult.code : null, "REPLY_INVALID");
  assert.equal(readReviewState(blankHost.state).activeSession?.status, "failed");
  assert.equal(readReviewState(blankHost.state).activeSession?.reply, null);
});

void test("pattern-room captures the reply before reporting parser failures", async () => {
  const { activation, notifications, state } = activateHost({
    parseCaseReviewResult() {
      throw new Error("parser exploded");
    },
  });

  const result =
    await activation.commands[PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND](createDispatchRequest());

  assert.equal(result.success, false);
  assert.equal(result.success === false ? result.code : null, "REPLY_PARSE_FAILED");
  assert.deepEqual(
    readReviewEventPayloads(notifications).map(({ event }) => event.type),
    [
      "preview-created",
      "dispatch-started",
      "dispatch-sent",
      "waiting-reply",
      "reply-received",
      "parse-failed",
    ]
  );
  const runtimeState = readReviewState(state);
  assert.equal(runtimeState.activeSession?.reply?.text, CASE_REVIEW_REPLY);
  assert.equal(runtimeState.activeSession?.result, null);
  assert.equal(runtimeState.activeSession?.error?.code, "REPLY_PARSE_FAILED");
});

void test("pattern-room returns the same promise for duplicate requests without duplicate commits", async () => {
  const deferred = createDeferred<unknown>();
  const { activation, dispatchCalls, notifications } = activateHost({
    async dispatchBridge() {
      return await deferred.promise;
    },
  });
  const request = createDispatchRequest();
  const handler = activation.commands[PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND];

  const firstPromise = handler(request);
  const duplicatePromise = handler({ ...request });
  assert.equal(firstPromise, duplicatePromise);
  assert.equal(dispatchCalls.length, 1);
  assert.deepEqual(
    readReviewEventPayloads(notifications).map(({ event }) => event.type),
    ["preview-created", "dispatch-started", "dispatch-sent", "waiting-reply"]
  );

  deferred.resolve(createSuccessfulBridgeResult("request-001"));
  const [firstResult, duplicateResult] = await Promise.all([firstPromise, duplicatePromise]);
  assert.equal(firstResult, duplicateResult);
  assert.deepEqual(
    readReviewEventPayloads(notifications).map(({ event }) => event.type),
    [
      "preview-created",
      "dispatch-started",
      "dispatch-sent",
      "waiting-reply",
      "reply-received",
      "parsed",
      "review-ready",
    ]
  );
});

void test("pattern-room bounds completed request idempotency without evicting active promises", async () => {
  const pendingReply = createDeferred<unknown>();
  const { activation, dispatchCalls } = activateHost({
    async dispatchBridge(payload) {
      const requestId = String(payload["clientRequestId"]);
      if (requestId === "pending-request") {
        return await pendingReply.promise;
      }
      return await Promise.resolve({
        clientRequestId: requestId,
        code: "TEST_DISPATCH_FAILURE",
        error: "Expected cache-boundary failure.",
        success: false,
      });
    },
  });
  const handler = activation.commands[PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND];
  const pendingRequest = createDispatchRequest(createDispatchDraft("AI2"), {
    requestId: "pending-request",
    sessionId: "pending-session",
  });
  const pendingPromise = handler(pendingRequest);
  const completedDraft = createDispatchDraft("AI0");
  const completedRequests = Array.from({ length: 257 }, (_, index) =>
    createDispatchRequest(completedDraft, {
      requestId: `completed-request-${index}`,
      sessionId: `completed-session-${index}`,
    })
  );
  let newestPromise: ReturnType<typeof handler> | null = null;

  for (const request of completedRequests) {
    newestPromise = handler(request);
    assert.equal((await newestPromise).success, false);
  }

  const dispatchCountAfterFill = dispatchCalls.length;
  assert.equal(dispatchCountAfterFill, 258);
  assert.equal(handler(pendingRequest), pendingPromise);
  assert.equal(handler(completedRequests[256]), newestPromise);
  assert.equal(dispatchCalls.length, dispatchCountAfterFill);

  assert.equal((await handler(completedRequests[0])).success, false);
  assert.equal(dispatchCalls.length, dispatchCountAfterFill + 1);

  pendingReply.resolve(createSuccessfulBridgeResult("pending-request"));
  assert.deepEqual(await pendingPromise, { ignored: true, success: true });
});

void test("pattern-room serializes active requests per target slot", async () => {
  const deferred = createDeferred<unknown>();
  const { activation, dispatchCalls } = activateHost({
    async dispatchBridge() {
      return await deferred.promise;
    },
  });
  const handler = activation.commands[PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND];
  const firstPromise = handler(createDispatchRequest());
  const busyResult = await handler(
    createDispatchRequest(createDispatchDraft("AI2"), {
      requestId: "request-002",
      sessionId: "session-002",
    })
  );

  assert.equal(busyResult.success, false);
  assert.equal(busyResult.success === false ? busyResult.code : null, "TARGET_BUSY");
  assert.equal(dispatchCalls.length, 1);

  deferred.resolve(createSuccessfulBridgeResult("request-001"));
  assert.equal((await firstPromise).success, true);
});

void test("pattern-room supersedes a different active target and ignores its late reply", async () => {
  const firstDeferred = createDeferred<unknown>();
  const { activation, notifications, state } = activateHost({
    async dispatchBridge(payload) {
      const requestId = String(payload["clientRequestId"]);
      if (requestId === "request-001") {
        return await firstDeferred.promise;
      }
      return await Promise.resolve(createSuccessfulBridgeResult(requestId));
    },
  });
  const dispatch = activation.commands[PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND];

  const oldPromise = dispatch(createDispatchRequest(createDispatchDraft("AI2")));
  const newResult = await dispatch(
    createDispatchRequest(createDispatchDraft("AI0"), {
      requestId: "request-002",
      sessionId: "session-002",
    })
  );
  assert.equal(newResult.success, true);
  assert.deepEqual(
    readReviewEventPayloads(notifications).map(({ event }) => event.type),
    [
      "preview-created",
      "dispatch-started",
      "dispatch-sent",
      "waiting-reply",
      "cancelled",
      "preview-created",
      "dispatch-started",
      "dispatch-sent",
      "waiting-reply",
      "reply-received",
      "parsed",
      "review-ready",
    ]
  );

  const eventCountBeforeLateReply = readReviewEventPayloads(notifications).length;
  firstDeferred.resolve(createSuccessfulBridgeResult("request-001"));
  assert.deepEqual(await oldPromise, { ignored: true, success: true });
  assert.equal(readReviewEventPayloads(notifications).length, eventCountBeforeLateReply);
  assert.deepEqual(
    readReviewState(state).history.map((entry) => [entry.sessionId, entry.state]),
    [
      ["session-001", "cancelled"],
      ["session-002", "ready"],
    ]
  );
});

void test("pattern-room cancellation releases the target for retry and ignores the late old reply", async () => {
  const firstDeferred = createDeferred<unknown>();
  const { activation, dispatchCalls, notifications, state } = activateHost({
    async dispatchBridge(payload) {
      const requestId = String(payload["clientRequestId"]);
      if (requestId === "request-001") {
        return await firstDeferred.promise;
      }
      return await Promise.resolve(createSuccessfulBridgeResult(requestId));
    },
  });
  const dispatch = activation.commands[PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND];
  const control = activation.commands[PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND];

  const firstPromise = dispatch(createDispatchRequest());
  const cancelResult = await control({
    action: "cancel",
    requestId: "request-001",
    sessionId: "session-001",
  });
  assert.equal(cancelResult.success, true);

  const retryResult = await dispatch(
    createDispatchRequest(createDispatchDraft(), {
      attempt: 2,
      operation: "retry",
      requestId: "request-002",
      sessionId: "session-001",
    })
  );
  assert.equal(retryResult.success, true);

  const eventCountBeforeLateReply = readReviewEventPayloads(notifications).length;
  firstDeferred.resolve(createSuccessfulBridgeResult("request-001", { messageId: "late-old" }));
  const oldResult = await firstPromise;
  assert.deepEqual(oldResult, { ignored: true, success: true });
  assert.equal(readReviewEventPayloads(notifications).length, eventCountBeforeLateReply);

  assert.deepEqual(
    dispatchCalls.map((payload) => payload["clientRequestId"]),
    ["request-001", "request-002"]
  );
  const runtimeState = readReviewState(state);
  assert.equal(runtimeState.activeSession?.sessionId, "session-001");
  assert.equal(runtimeState.activeSession?.requestId, "request-002");
  assert.equal(runtimeState.activeSession?.operation, "retry");
  assert.equal(runtimeState.activeSession?.attempt, 2);
  assert.equal(runtimeState.activeSession?.status, "ready");
  assert.deepEqual(
    runtimeState.history.map((entry) => [entry.requestId, entry.state]),
    [
      ["request-001", "cancelled"],
      ["request-002", "ready"],
    ]
  );
});

void test("pattern-room resend creates a new session and request history entry", async () => {
  const { activation, dispatchCalls, notifications, state } = activateHost();
  const dispatch = activation.commands[PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND];

  assert.equal((await dispatch(createDispatchRequest())).success, true);
  assert.equal(
    (
      await dispatch(
        createDispatchRequest(createDispatchDraft(), {
          attempt: 1,
          operation: "resend",
          parentSessionId: "session-001",
          requestId: "request-002",
          sessionId: "session-002",
        })
      )
    ).success,
    true
  );

  assert.deepEqual(
    dispatchCalls.map((payload) => [payload["clientRequestId"], payload["reqId"]]),
    [
      ["request-001", "request-001"],
      ["request-002", "request-002"],
    ]
  );
  assert.equal(
    readReviewEventPayloads(notifications).filter(({ event }) => event.type === "preview-created")
      .length,
    2
  );
  const runtimeState = readReviewState(state);
  assert.equal(runtimeState.activeSession?.sessionId, "session-002");
  assert.equal(runtimeState.activeSession?.parentSessionId, "session-001");
  assert.equal(runtimeState.activeSession?.operation, "resend");
  assert.equal(runtimeState.history.length, 2);
});

void test("pattern-room apply control records typed summary without overwriting the review result", async () => {
  const { activation, notifications, state } = activateHost();
  const dispatchResult =
    await activation.commands[PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND](createDispatchRequest());
  assert.equal(dispatchResult.success, true);
  const resultBeforeApply = readReviewState(state).activeSession?.result;

  const summary = {
    mode: "all" as const,
    boardNotesAdded: 3,
    evidenceAdded: 1,
    openQuestionsAdded: 1,
    uncertaintyAdded: 1,
    connectionsAdded: 0,
    skipped: 0,
    warnings: [] as string[],
  };
  const applyResult = await activation.commands[PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND]({
    action: "apply",
    mode: "all",
    requestId: "request-001",
    sessionId: "session-001",
    summary,
  });

  assert.equal(applyResult.success, true);
  assert.equal(readReviewEventPayloads(notifications).at(-1)?.event.type, "review-applied");
  const runtimeState = readReviewState(state);
  assert.equal(runtimeState.activeSession?.status, "applied");
  assert.equal(runtimeState.activeSession?.result, resultBeforeApply);
  assert.deepEqual(runtimeState.activeSession?.applySummary, summary);
  assert.equal(runtimeState.history[0]?.state, "applied");
});

void test("pattern-room runs the same production pipeline for all four review roles", async () => {
  const { activation, dispatchCalls, state } = activateHost();
  const dispatch = activation.commands[PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND];
  const roles = ["AI0", "AI1", "AI2", "US1"] as const;

  for (const [index, role] of roles.entries()) {
    const result = await dispatch(
      createDispatchRequest(createDispatchDraft(role), {
        requestId: `request-${index + 1}`,
        sessionId: `session-${index + 1}`,
      })
    );
    assert.equal(result.success, true);
  }

  assert.deepEqual(
    dispatchCalls.map((payload) => payload["toSlot"]),
    ["ai0", "ai1", "ai2", "us1"]
  );
  assert.deepEqual(
    readReviewState(state).history.map((entry) => entry.role),
    roles
  );
});

void test("pattern-room dispose prevents late reply notifications and state commits", async () => {
  const deferred = createDeferred<unknown>();
  const { activation, notifications, state } = activateHost({
    async dispatchBridge() {
      return await deferred.promise;
    },
  });
  const dispatchPromise =
    activation.commands[PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND](createDispatchRequest());
  const eventCountBeforeDispose = readReviewEventPayloads(notifications).length;
  const revisionBeforeDispose = readReviewState(state).revision;

  await activation.dispose();
  deferred.resolve(createSuccessfulBridgeResult("request-001"));
  assert.deepEqual(await dispatchPromise, { ignored: true, success: true });
  assert.equal(readReviewEventPayloads(notifications).length, eventCountBeforeDispose);
  assert.equal(readReviewState(state).revision, revisionBeforeDispose);
});

void test("pattern-room host re-publishes surviving review state and immutable draft metadata on ready", async () => {
  const draft = createDispatchDraft();
  const { activation, dispatchCalls, notifications, state } = activateHost();
  const dispatch = activation.commands[PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND];

  assert.equal((await dispatch(createDispatchRequest(draft))).success, true);
  const stateBeforeReady = readReviewState(state);
  const activeSession = stateBeforeReady.activeSession;
  assert.ok(activeSession);
  const storedDraft = activeSession.metadata["dispatchDraft"] as PatternRoomCaseReviewDispatchDraft;
  assert.ok(storedDraft);
  assert.notStrictEqual(storedDraft, draft);
  assert.notStrictEqual(storedDraft.payload, draft.payload);
  assert.notStrictEqual(storedDraft.payload.payload, draft.payload.payload);
  assert.deepEqual(storedDraft, draft);
  assert.equal(Object.isFrozen(storedDraft), true);
  assert.equal(Object.isFrozen(storedDraft.payload), true);
  assert.equal(Object.isFrozen(storedDraft.payload.payload), true);
  assert.equal(Object.isFrozen(storedDraft.payload.payload.protocol), true);
  assert.equal(Object.isFrozen(storedDraft.warnings), true);

  const originalStoredText = storedDraft.payload.payload.text;
  const mutableDraft = draft as unknown as {
    payload: { payload: { text: string } };
    warnings: string[];
  };
  mutableDraft.payload.payload.text = "tampered after dispatch";
  mutableDraft.warnings.push("tampered warning");
  assert.equal(storedDraft.payload.payload.text, originalStoredText);
  assert.deepEqual(storedDraft.warnings, []);

  notifications.splice(0);
  const revisionBeforeReady = stateBeforeReady.revision;
  await activation.onRoomReady();

  assert.equal(dispatchCalls.length, 1);
  assert.deepEqual(
    notifications.map((notification) => notification.type),
    ["pattern:loaded", PATTERN_ROOM_CASE_REVIEW_EVENT]
  );
  const [syncPayload] = readReviewEventPayloads(notifications);
  assert.ok(syncPayload);
  assert.equal(syncPayload.event.type, "review-ready");
  assert.equal(syncPayload.event.sessionId, activeSession.sessionId);
  assert.strictEqual(syncPayload.state, stateBeforeReady);
  assert.strictEqual(syncPayload.state.history, stateBeforeReady.history);
  assert.equal(syncPayload.state.history.length, 1);
  assert.equal(syncPayload.state.revision, revisionBeforeReady);
  assert.strictEqual(
    reducePatternRoomCaseReviewRuntimeState(syncPayload.state, syncPayload.event),
    syncPayload.state
  );
  assert.strictEqual(readReviewState(state), stateBeforeReady);
});

void test("pattern-room host lifecycle does not dispatch during ready/load restore", async () => {
  const { activation, dispatchCalls, notifications } = activateHost();

  await activation.onRoomReady();

  assert.deepEqual(dispatchCalls, []);
  assert.deepEqual(
    notifications.map((notification) => notification.type),
    ["pattern:loaded"]
  );
});

void test("pattern-room case review host stays renderer-safe and preserves architecture boundaries", async () => {
  const hostSource = await readFile(resolve("rooms/pattern-room/host/runtime.ts"), "utf8");
  const uiRuntimeSource = await readFile(
    resolve("rooms/pattern-room/ui/pattern-room-ui-runtime.ts"),
    "utf8"
  );
  const tenthManPanelSource = await readFile(
    resolve("rooms/pattern-room/ui/panels/pattern-tenth-man-panel.ts"),
    "utf8"
  );

  assert.doesNotMatch(hostSource, /from\s+["']node:(?:fs|path)["']/);
  assert.doesNotMatch(hostSource, /pattern-room-json-store/);
  assert.doesNotMatch(hostSource, /from\s+["'][^"']*(?:provider|relay|ipc)[^"']*["']/i);
  assert.match(hostSource, /clientRequestId/);
  assert.match(hostSource, /replyToSlot/);
  assert.match(hostSource, /PATTERN_ROOM_CASE_REVIEW_DISPATCH_ACTION/);
  assert.equal(PATTERN_ROOM_SNAPSHOT_VERSION, 1);

  assert.match(uiRuntimeSource, /PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND/);
  assert.doesNotMatch(uiRuntimeSource, /dispatchBridge|message\.sendWait|sendWait/);
  assert.doesNotMatch(tenthManPanelSource, /dispatchBridge|message\.sendWait|sendWait/);
});
