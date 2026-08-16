import { PATTERN_ROOM_DOMAIN_TEST_FIXTURE } from "../../rooms/pattern-room/shared/data/testing/pattern-room-domain.fixture.ts";
import type { FakeElement } from "./forge-room-ui-smoke.helpers.ts";
import {
  assert,
  createMinimalForgeUiEnvironment,
  createRoomInstalledCopy,
  fireEvent,
  pathToFileURL,
  readFileSync,
  readTreeText,
  resolve,
  test,
} from "./forge-room-ui-smoke.helpers.ts";
import { parsePatternRoomCaseReviewResult } from "../../rooms/pattern-room/shared/adapters/pattern-room-case-review-parser.ts";
import {
  createPatternRoomCaseReviewRuntimeState,
  reducePatternRoomCaseReviewRuntimeState,
} from "../../rooms/pattern-room/shared/state/pattern-room-case-review-state.ts";
import {
  PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND,
  PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND,
  type PatternRoomCaseReviewControlCommandPayload,
  type PatternRoomCaseReviewDispatchCommandPayload,
} from "../../rooms/pattern-room/shared/types/pattern-room-case-review-dispatch.ts";
import {
  PATTERN_ROOM_CASE_REVIEW_EVENT,
  type PatternRoomCaseReviewEvent,
  type PatternRoomCaseReviewEventPayload,
  type PatternRoomCaseReviewRuntimeState,
} from "../../rooms/pattern-room/shared/types/pattern-room-case-review-session.ts";
import {
  PATTERN_ROOM_LOADED_EVENT,
  PATTERN_ROOM_SAVE_COMMAND,
} from "../../rooms/pattern-room/shared/types/pattern-room-persistence.ts";
import type { PatternRoomSessionSnapshot } from "../../rooms/pattern-room/shared/types/pattern-room-snapshot.ts";
import type { PatternRoomUiRuntime } from "../../rooms/pattern-room/ui/pattern-room-ui-runtime.ts";

type PatternRoomUiRuntimeModule = {
  createPatternRoomUiRuntime: (options?: {
    readonly domain?: typeof PATTERN_ROOM_DOMAIN_TEST_FIXTURE;
  }) => PatternRoomUiRuntime;
};
type PatternRoomEnvironment = ReturnType<typeof createMinimalForgeUiEnvironment>;
type PatternRoomCaseReviewTerminalEvent = PatternRoomCaseReviewEvent & {
  readonly type: "reply-invalid" | "timeout" | "cancelled";
};

const REVIEW_REPLY = [
  "# Observation",
  "- The navigation record has a stable timestamp.",
  "# Evidence",
  "- Recheck the original navigation log image.",
  "# Analysis",
  "- The current explanation depends on one source chain.",
  "- [connection] source=node-horizon-claim; type=needs_review; target=node-shadow-analysis; note=Verify the relationship.",
  "# Counter Argument",
  "- A calibration issue could explain the difference.",
  "# Missing Information",
  "- The original calibration sheet is missing.",
  "# Open Questions",
  "- Which instrument produced the timestamp?",
  "# Confidence Notes",
  "- Confidence is moderate until the source is checked.",
].join("\n");

const REVIEW_RESULT = parsePatternRoomCaseReviewResult(REVIEW_REPLY);

function setWindowConfirm(handler: (message: string) => boolean): void {
  (globalThis as unknown as { window: { confirm: (message: string) => boolean } }).window.confirm =
    handler;
}

function openTenthMan(app: FakeElement): void {
  const hotspot = app.querySelector("[data-pattern-hotspot='tenth-man']");
  assert.ok(hotspot);
  fireEvent(hotspot, "click");
  assert.ok(app.querySelector("[data-pattern-view='tenth-man']"));
}

function assertSnapshotStateUnchanged(
  before: PatternRoomSessionSnapshot,
  after: PatternRoomSessionSnapshot
): void {
  assert.equal(after.activeView, before.activeView);
  assert.equal(after.schemaVersion, before.schemaVersion);
  assert.deepEqual(after.guards, before.guards);
  assert.deepEqual(after.overlay, before.overlay);
}

function emitHostContext(environment: PatternRoomEnvironment, locale: "en" | "tr"): void {
  const translations = JSON.parse(
    readFileSync(resolve(`rooms/pattern-room/i18n/${locale}.json`), "utf8")
  ) as Record<string, unknown>;
  environment.emitHostMessage({
    type: "host-context",
    locale,
    translations,
  });
  environment.emitHostMessage({
    type: PATTERN_ROOM_LOADED_EVENT,
    payload: { snapshot: null },
  });
}

function emitReviewState(
  environment: PatternRoomEnvironment,
  event: PatternRoomCaseReviewEvent,
  state: PatternRoomCaseReviewRuntimeState
): void {
  const payload: PatternRoomCaseReviewEventPayload = { event, state };
  environment.emitHostMessage({
    type: PATTERN_ROOM_CASE_REVIEW_EVENT,
    payload: payload as unknown as Record<string, unknown>,
  });
}

function publishReviewEvent(
  environment: PatternRoomEnvironment,
  state: PatternRoomCaseReviewRuntimeState,
  event: PatternRoomCaseReviewEvent
): PatternRoomCaseReviewRuntimeState {
  const nextState = reducePatternRoomCaseReviewRuntimeState(state, event);
  emitReviewState(environment, event, nextState);
  return nextState;
}

function readLatestDispatch(
  environment: PatternRoomEnvironment
): PatternRoomCaseReviewDispatchCommandPayload {
  const dispatch = [...environment.sentEvents]
    .reverse()
    .find((entry) => entry.command === PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND);
  assert.ok(dispatch);
  return dispatch.payload as PatternRoomCaseReviewDispatchCommandPayload;
}

function prepareAndSend(
  environment: PatternRoomEnvironment
): PatternRoomCaseReviewDispatchCommandPayload {
  const prepare = environment.app.querySelector(
    "[data-pattern-case-review-preview-prepare='true']"
  );
  assert.ok(prepare);
  fireEvent(prepare, "click");
  const send = environment.app.querySelector("[data-pattern-case-review-dispatch-send='true']");
  assert.ok(send);
  assert.equal(send.disabled, false);
  fireEvent(send, "click");
  return readLatestDispatch(environment);
}

function driveReviewReady(
  environment: PatternRoomEnvironment,
  command: PatternRoomCaseReviewDispatchCommandPayload
): PatternRoomCaseReviewRuntimeState {
  const occurredAt = "2026-08-03T10:00:00.000Z";
  let state = createPatternRoomCaseReviewRuntimeState();
  state = publishReviewEvent(environment, state, {
    type: "preview-created",
    sessionId: command.sessionId,
    occurredAt,
    role: command.draft.roleSlot,
    reviewLabel: "Installed UI Review",
    packetHash: command.draft.packetHash,
    metadata: { dispatchDraft: command.draft },
  });
  state = publishReviewEvent(environment, state, {
    type: "dispatch-started",
    sessionId: command.sessionId,
    occurredAt,
    requestId: command.requestId,
    operation: command.operation,
    ...(command.parentSessionId === undefined ? {} : { parentSessionId: command.parentSessionId }),
    ...(command.attempt === undefined ? {} : { attempt: command.attempt }),
  });
  state = publishReviewEvent(environment, state, {
    type: "dispatch-sent",
    sessionId: command.sessionId,
    occurredAt,
    requestId: command.requestId,
  });
  state = publishReviewEvent(environment, state, {
    type: "waiting-reply",
    sessionId: command.sessionId,
    occurredAt,
    requestId: command.requestId,
  });
  state = publishReviewEvent(environment, state, {
    type: "reply-received",
    sessionId: command.sessionId,
    occurredAt,
    requestId: command.requestId,
    reply: {
      text: REVIEW_REPLY,
      responseHash: "response-ui-smoke",
      messageId: "message-ui-smoke",
      clientRequestId: command.requestId,
      brokerMessageId: "broker-ui-smoke",
      receivedAt: occurredAt,
    },
  });
  state = publishReviewEvent(environment, state, {
    type: "parsed",
    sessionId: command.sessionId,
    occurredAt,
    requestId: command.requestId,
    result: REVIEW_RESULT,
  });
  return publishReviewEvent(environment, state, {
    type: "review-ready",
    sessionId: command.sessionId,
    occurredAt,
    requestId: command.requestId,
    result: REVIEW_RESULT,
  });
}

function buildTerminalState(
  command: PatternRoomCaseReviewDispatchCommandPayload,
  terminalEvent: PatternRoomCaseReviewTerminalEvent
): PatternRoomCaseReviewRuntimeState {
  const occurredAt = terminalEvent.occurredAt;
  let state = createPatternRoomCaseReviewRuntimeState();
  const setupEvents: PatternRoomCaseReviewEvent[] = [
    {
      type: "preview-created",
      sessionId: command.sessionId,
      occurredAt,
      role: command.draft.roleSlot,
      reviewLabel: "Installed UI Review",
      packetHash: command.draft.packetHash,
      metadata: { dispatchDraft: command.draft },
    },
    {
      type: "dispatch-started",
      sessionId: command.sessionId,
      occurredAt,
      requestId: command.requestId,
      operation: "start",
      attempt: 1,
    },
    {
      type: "dispatch-sent",
      sessionId: command.sessionId,
      occurredAt,
      requestId: command.requestId,
    },
    {
      type: "waiting-reply",
      sessionId: command.sessionId,
      occurredAt,
      requestId: command.requestId,
    },
  ];
  setupEvents.forEach((event) => {
    state = reducePatternRoomCaseReviewRuntimeState(state, event);
  });
  return reducePatternRoomCaseReviewRuntimeState(state, terminalEvent);
}

void test("pattern-room installed UI localizes all four review roles and keeps preview/dispatch transient", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");
  const confirmations: string[] = [];

  try {
    const runtimeModule = (await import(
      `${pathToFileURL(resolve(installedCopy.rootDir, "ui/pattern-room-ui-runtime.js")).href}?review-roles=${Date.now()}`
    )) as PatternRoomUiRuntimeModule;
    const runtime = runtimeModule.createPatternRoomUiRuntime({
      domain: PATTERN_ROOM_DOMAIN_TEST_FIXTURE,
    });
    runtime.start();
    emitHostContext(environment, "en");
    openTenthMan(environment.app);
    setWindowConfirm((message) => {
      confirmations.push(message);
      return true;
    });

    const snapshotBefore = runtime.createSnapshot();
    const targets = { AI0: "ai0", AI1: "ai1", AI2: "ai2", US1: "us1" } as const;
    const initialRole = environment.app.querySelector("[data-pattern-case-review-role='true']");
    assert.ok(initialRole);
    assert.deepEqual(
      initialRole.children.map((option) => option.value),
      ["AI0", "AI1", "AI2", "US1"]
    );

    for (const [role, target] of Object.entries(targets)) {
      const roleSelect = environment.app.querySelector("[data-pattern-case-review-role='true']");
      assert.ok(roleSelect);
      roleSelect.value = role;
      fireEvent(roleSelect, "change");
      const prepare = environment.app.querySelector(
        "[data-pattern-case-review-preview-prepare='true']"
      );
      assert.ok(prepare);
      fireEvent(prepare, "click");
      assert.match(readTreeText(environment.app), new RegExp(`Target: ${role} / ${target}`));
    }

    assert.deepEqual(environment.sentCommands, []);
    assertSnapshotStateUnchanged(snapshotBefore, runtime.createSnapshot());

    const send = environment.app.querySelector("[data-pattern-case-review-dispatch-send='true']");
    assert.ok(send);
    fireEvent(send, "click");
    const command = readLatestDispatch(environment);
    assert.equal(command.operation, "start");
    assert.equal(command.attempt, 1);
    assert.equal(command.draft.roleSlot, "US1");
    assert.equal(command.draft.targetSlot, "us1");
    assert.ok(command.sessionId.startsWith("pattern-review-session-"));
    assert.ok(command.requestId.startsWith("pattern-review-request-"));
    assert.notEqual(command.draft.packetHash, "");
    assert.deepEqual(confirmations, ["Send the case review for the US1 role?"]);
    assertSnapshotStateUnchanged(snapshotBefore, runtime.createSnapshot());
    environment.runPendingTimers(2000);
    assert.ok((environment.sentCommands as string[]).includes(PATTERN_ROOM_SAVE_COMMAND));
    runtime.dispose();
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI mirrors lifecycle, controls, structured result, and hash history without autosave", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    const runtimeModule = (await import(
      `${pathToFileURL(resolve(installedCopy.rootDir, "ui/pattern-room-ui-runtime.js")).href}?review-lifecycle=${Date.now()}`
    )) as PatternRoomUiRuntimeModule;
    const runtime = runtimeModule.createPatternRoomUiRuntime({
      domain: PATTERN_ROOM_DOMAIN_TEST_FIXTURE,
    });
    runtime.start();
    emitHostContext(environment, "en");
    openTenthMan(environment.app);
    setWindowConfirm(() => true);
    const snapshotBefore = runtime.createSnapshot();
    const command = prepareAndSend(environment);

    let state = createPatternRoomCaseReviewRuntimeState();
    state = publishReviewEvent(environment, state, {
      type: "preview-created",
      sessionId: command.sessionId,
      occurredAt: "2026-08-03T10:00:00.000Z",
      role: command.draft.roleSlot,
      reviewLabel: "Installed UI Review",
      packetHash: command.draft.packetHash,
    });
    state = publishReviewEvent(environment, state, {
      type: "dispatch-started",
      sessionId: command.sessionId,
      occurredAt: "2026-08-03T10:00:01.000Z",
      requestId: command.requestId,
      operation: "start",
      attempt: 1,
    });
    assert.match(readTreeText(environment.app), /Review Running/);
    const cancel = environment.app.querySelector("[data-pattern-case-review-cancel='true']");
    assert.ok(cancel);
    fireEvent(cancel, "click");
    const cancelCommand = environment.sentEvents.at(-1);
    assert.equal(cancelCommand?.command, PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND);
    assert.equal(
      (cancelCommand?.payload as PatternRoomCaseReviewControlCommandPayload).action,
      "cancel"
    );

    state = publishReviewEvent(environment, state, {
      type: "dispatch-sent",
      sessionId: command.sessionId,
      occurredAt: "2026-08-03T10:00:02.000Z",
      requestId: command.requestId,
    });
    publishReviewEvent(environment, state, {
      type: "waiting-reply",
      sessionId: command.sessionId,
      occurredAt: "2026-08-03T10:00:03.000Z",
      requestId: command.requestId,
    });
    assert.match(readTreeText(environment.app), /Waiting AI/);

    driveReviewReady(environment, command);
    const readyText = readTreeText(environment.app);
    assert.match(readyText, /Review Ready/);
    assert.match(readyText, /The navigation record has a stable timestamp/);
    assert.match(readyText, /Suggested Connections/);
    assert.equal(environment.app.querySelectorAll("[data-pattern-case-review-section]").length, 7);
    assert.ok(
      environment.app.querySelector(
        `[data-pattern-case-review-history-item='${command.sessionId}']`
      )
    );
    assert.ok(environment.app.querySelector("[data-pattern-case-review-resend='true']"));
    const resend = environment.app.querySelector("[data-pattern-case-review-resend='true']");
    assert.ok(resend);
    fireEvent(resend, "click");
    const resendCommand = readLatestDispatch(environment);
    assert.equal(resendCommand.operation, "resend");
    assert.equal(resendCommand.parentSessionId, command.sessionId);
    assert.notEqual(resendCommand.sessionId, command.sessionId);

    const errorEvent: PatternRoomCaseReviewTerminalEvent = {
      type: "reply-invalid",
      sessionId: command.sessionId,
      occurredAt: "2026-08-03T10:01:00.000Z",
      requestId: command.requestId,
      error: { code: "invalid-reply", message: "Malformed reply." },
    };
    emitReviewState(environment, errorEvent, buildTerminalState(command, errorEvent));
    assert.match(readTreeText(environment.app), /Reply Error/);
    const retry = environment.app.querySelector("[data-pattern-case-review-retry='true']");
    assert.ok(retry);
    fireEvent(retry, "click");
    const retryCommand = readLatestDispatch(environment);
    assert.equal(retryCommand.operation, "retry");
    assert.equal(retryCommand.sessionId, command.sessionId);
    assert.equal(retryCommand.attempt, 2);

    const cancelledEvent: PatternRoomCaseReviewTerminalEvent = {
      type: "cancelled",
      sessionId: command.sessionId,
      occurredAt: "2026-08-03T10:02:00.000Z",
      requestId: command.requestId,
      reason: "Cancelled in smoke.",
    };
    emitReviewState(environment, cancelledEvent, buildTerminalState(command, cancelledEvent));
    assert.match(readTreeText(environment.app), /Cancelled/);

    const timeoutEvent: PatternRoomCaseReviewTerminalEvent = {
      type: "timeout",
      sessionId: command.sessionId,
      occurredAt: "2026-08-03T10:03:00.000Z",
      requestId: command.requestId,
      error: { code: "timeout", message: "Timed out in smoke." },
    };
    emitReviewState(environment, timeoutEvent, buildTerminalState(command, timeoutEvent));
    assert.match(readTreeText(environment.app), /Reply Timed Out/);
    assertSnapshotStateUnchanged(snapshotBefore, runtime.createSnapshot());
    environment.runPendingTimers(2000);
    assert.ok((environment.sentCommands as string[]).includes(PATTERN_ROOM_SAVE_COMMAND));
    runtime.dispose();
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI restores runtime review history and retry/resend drafts after reload", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");
  let activeRuntime: PatternRoomUiRuntime | null = null;

  try {
    const runtimeModule = (await import(
      `${pathToFileURL(resolve(installedCopy.rootDir, "ui/pattern-room-ui-runtime.js")).href}?review-reload=${Date.now()}`
    )) as PatternRoomUiRuntimeModule;
    activeRuntime = runtimeModule.createPatternRoomUiRuntime({
      domain: PATTERN_ROOM_DOMAIN_TEST_FIXTURE,
    });
    activeRuntime.start();
    emitHostContext(environment, "en");
    openTenthMan(environment.app);
    setWindowConfirm(() => true);
    const command = prepareAndSend(environment);
    const readyState = driveReviewReady(environment, command);
    activeRuntime.dispose();

    activeRuntime = runtimeModule.createPatternRoomUiRuntime({
      domain: PATTERN_ROOM_DOMAIN_TEST_FIXTURE,
    });
    activeRuntime.start();
    emitHostContext(environment, "en");
    openTenthMan(environment.app);
    const readySession = readyState.activeSession;
    assert.ok(readySession?.result);
    emitReviewState(
      environment,
      {
        type: "review-ready",
        sessionId: readySession.sessionId,
        occurredAt: readySession.completedAt ?? readySession.startedAt,
        requestId: command.requestId,
        result: readySession.result,
      },
      readyState
    );

    assert.match(readTreeText(environment.app), /Review Ready/);
    assert.ok(
      environment.app.querySelector(
        `[data-pattern-case-review-history-item='${command.sessionId}']`
      )
    );
    const resend = environment.app.querySelector("[data-pattern-case-review-resend='true']");
    assert.ok(resend);
    fireEvent(resend, "click");
    const resendCommand = readLatestDispatch(environment);
    assert.equal(resendCommand.operation, "resend");
    assert.equal(resendCommand.draft.packetHash, command.draft.packetHash);

    const timeoutEvent: PatternRoomCaseReviewTerminalEvent = {
      type: "timeout",
      sessionId: command.sessionId,
      occurredAt: "2026-08-03T11:00:00.000Z",
      requestId: command.requestId,
      error: { code: "TARGET_TIMEOUT", message: "Reload retry smoke timeout." },
    };
    const timedOutState = buildTerminalState(command, timeoutEvent);
    emitReviewState(environment, timeoutEvent, timedOutState);
    const retry = environment.app.querySelector("[data-pattern-case-review-retry='true']");
    assert.ok(retry);
    fireEvent(retry, "click");
    const retryCommand = readLatestDispatch(environment);
    assert.equal(retryCommand.operation, "retry");
    assert.equal(retryCommand.sessionId, command.sessionId);
    assert.equal(retryCommand.draft.packetHash, command.draft.packetHash);

    environment.runPendingTimers(2000);
    assert.ok((environment.sentCommands as string[]).includes(PATTERN_ROOM_SAVE_COMMAND));
    activeRuntime.dispose();
    activeRuntime = null;
  } finally {
    activeRuntime?.dispose();
    environment.restore();
    await installedCopy.cleanup();
  }
});

const APPLY_CASES = [
  {
    mode: "all",
    selector: "[data-pattern-case-review-apply-all='true']",
    notes: 0,
    evidence: 0,
    candidates: 1,
    nodes: 6,
    edges: 1,
    autosaves: 1,
  },
  {
    mode: "open-questions-only",
    selector: "[data-pattern-case-review-apply-open-questions='true']",
    notes: 0,
    evidence: 0,
    candidates: 0,
    nodes: 1,
    edges: 0,
    autosaves: 1,
  },
  {
    mode: "evidence-suggestions-only",
    selector: "[data-pattern-case-review-apply-evidence-suggestions='true']",
    notes: 0,
    evidence: 0,
    candidates: 1,
    nodes: 0,
    edges: 0,
    autosaves: 1,
  },
] as const;

for (const applyCase of APPLY_CASES) {
  void test(`pattern-room installed UI applies ${applyCase.mode} only after click and autosaves only local mutations`, async () => {
    const environment = createMinimalForgeUiEnvironment();
    const installedCopy = await createRoomInstalledCopy("pattern-room");

    try {
      const runtimeModule = (await import(
        `${pathToFileURL(resolve(installedCopy.rootDir, "ui/pattern-room-ui-runtime.js")).href}?review-apply-${applyCase.mode}-${Date.now()}`
      )) as PatternRoomUiRuntimeModule;
      const runtime = runtimeModule.createPatternRoomUiRuntime({
        domain: PATTERN_ROOM_DOMAIN_TEST_FIXTURE,
      });
      runtime.start();
      emitHostContext(environment, "en");
      openTenthMan(environment.app);
      setWindowConfirm(() => true);
      const command = prepareAndSend(environment);
      const snapshotBeforeReply = runtime.createSnapshot();
      const readyState = driveReviewReady(environment, command);

      assertSnapshotStateUnchanged(snapshotBeforeReply, runtime.createSnapshot());
      assert.equal(
        (environment.sentCommands as string[]).includes(PATTERN_ROOM_SAVE_COMMAND),
        false
      );
      assert.ok(environment.app.querySelector("[data-pattern-case-review-apply-all='true']"));
      assert.ok(
        environment.app.querySelector("[data-pattern-case-review-apply-open-questions='true']")
      );
      assert.ok(
        environment.app.querySelector(
          "[data-pattern-case-review-apply-evidence-suggestions='true']"
        )
      );

      const applyButton = environment.app.querySelector(applyCase.selector);
      assert.ok(applyButton);
      fireEvent(applyButton, "click");

      const snapshotAfterApply = runtime.createSnapshot();
      assert.equal(
        snapshotAfterApply.overlay.localNotes.length -
          snapshotBeforeReply.overlay.localNotes.length,
        applyCase.notes
      );
      assert.equal(
        snapshotAfterApply.overlay.localAuthoredEvidence.length -
          snapshotBeforeReply.overlay.localAuthoredEvidence.length,
        applyCase.evidence
      );
      assert.equal(
        (snapshotAfterApply.overlay.localEvidenceCandidates ?? []).length -
          (snapshotBeforeReply.overlay.localEvidenceCandidates ?? []).length,
        applyCase.candidates
      );
      assert.equal(
        snapshotAfterApply.overlay.localAuthoredNodes.length -
          snapshotBeforeReply.overlay.localAuthoredNodes.length,
        applyCase.nodes
      );
      assert.equal(
        snapshotAfterApply.overlay.localAuthoredEdges.length -
          snapshotBeforeReply.overlay.localAuthoredEdges.length,
        applyCase.edges
      );

      const control = environment.sentEvents.at(-1);
      assert.equal(control?.command, PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND);
      const controlPayload = control?.payload as PatternRoomCaseReviewControlCommandPayload;
      assert.equal(controlPayload.action, "apply");
      if (controlPayload.action === "apply") {
        assert.equal(controlPayload.mode, applyCase.mode);
        assert.equal(controlPayload.summary?.mode, applyCase.mode);
        assert.equal(controlPayload.summary?.evidenceCandidatesAdded ?? 0, applyCase.candidates);
      }
      [
        "[data-pattern-case-review-apply-all='true']",
        "[data-pattern-case-review-apply-open-questions='true']",
        "[data-pattern-case-review-apply-evidence-suggestions='true']",
      ].forEach((selector) => {
        const button = environment.app.querySelector(selector);
        assert.ok(button);
        assert.equal(button.disabled, true);
      });

      assert.equal(
        (environment.sentCommands as string[]).includes(PATTERN_ROOM_SAVE_COMMAND),
        false
      );
      environment.runPendingTimers(1999);
      assert.equal(
        (environment.sentCommands as string[]).includes(PATTERN_ROOM_SAVE_COMMAND),
        false
      );
      environment.runPendingTimers(2000);
      assert.equal(
        environment.sentCommands.filter((commandName) => commandName === PATTERN_ROOM_SAVE_COMMAND)
          .length,
        applyCase.autosaves
      );

      const applyEvent: Extract<PatternRoomCaseReviewEvent, { type: "review-applied" }> = {
        type: "review-applied",
        sessionId: command.sessionId,
        occurredAt: "2026-08-03T10:05:00.000Z",
        requestId: command.requestId,
        mode: applyCase.mode,
        ...(controlPayload.action === "apply" && controlPayload.summary !== undefined
          ? { summary: controlPayload.summary }
          : {}),
      };
      emitReviewState(
        environment,
        applyEvent,
        reducePatternRoomCaseReviewRuntimeState(readyState, applyEvent)
      );
      assert.match(readTreeText(environment.app), /Review Applied/);
      runtime.dispose();
    } finally {
      environment.restore();
      await installedCopy.cleanup();
    }
  });
}

void test("pattern-room installed UI does not mutate or autosave when apply control is rejected", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    const runtimeModule = (await import(
      `${pathToFileURL(resolve(installedCopy.rootDir, "ui/pattern-room-ui-runtime.js")).href}?review-apply-rejected=${Date.now()}`
    )) as PatternRoomUiRuntimeModule;
    const runtime = runtimeModule.createPatternRoomUiRuntime({
      domain: PATTERN_ROOM_DOMAIN_TEST_FIXTURE,
    });
    runtime.start();
    emitHostContext(environment, "en");
    openTenthMan(environment.app);
    setWindowConfirm(() => true);
    const command = prepareAndSend(environment);
    driveReviewReady(environment, command);
    const snapshotBeforeApply = runtime.createSnapshot();

    const fakeWindow = globalThis.window as unknown as {
      roomAPI: {
        sendCommand: (commandName: string, payload?: Record<string, unknown>) => boolean;
      };
    };
    const originalSendCommand = fakeWindow.roomAPI.sendCommand;
    fakeWindow.roomAPI.sendCommand = (
      commandName: string,
      payload: Record<string, unknown> = {}
    ): boolean => {
      if (commandName === PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND) {
        return false;
      }
      return originalSendCommand(commandName, payload);
    };

    const applyButton = environment.app.querySelector(
      "[data-pattern-case-review-apply-all='true']"
    );
    assert.ok(applyButton);
    fireEvent(applyButton, "click");

    assertSnapshotStateUnchanged(snapshotBeforeApply, runtime.createSnapshot());
    const currentApplyButton = environment.app.querySelector(
      "[data-pattern-case-review-apply-all='true']"
    );
    assert.ok(currentApplyButton);
    assert.equal(currentApplyButton.disabled, false);
    assert.match(readTreeText(environment.app), /review action could not be sent/i);
    environment.runPendingTimers(2000);
    assert.ok((environment.sentCommands as string[]).includes(PATTERN_ROOM_SAVE_COMMAND));
    runtime.dispose();
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI promotes a retained evidence candidate only after source and excerpt selection", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    const runtimeModule = (await import(
      `${pathToFileURL(resolve(installedCopy.rootDir, "ui/pattern-room-ui-runtime.js")).href}?candidate-promotion-${Date.now()}`
    )) as PatternRoomUiRuntimeModule;
    const runtime = runtimeModule.createPatternRoomUiRuntime({
      domain: PATTERN_ROOM_DOMAIN_TEST_FIXTURE,
    });
    runtime.start();
    emitHostContext(environment, "en");
    openTenthMan(environment.app);
    setWindowConfirm(() => true);
    const command = prepareAndSend(environment);
    const snapshotBeforeReply = runtime.createSnapshot();
    driveReviewReady(environment, command);

    const retain = environment.app.querySelector(
      "[data-pattern-case-review-apply-evidence-suggestions='true']"
    );
    assert.ok(retain);
    fireEvent(retain, "click");

    const candidateId = "local-evidence-candidate-001";
    const candidate = environment.app.querySelector(
      `[data-pattern-evidence-candidate='${candidateId}']`
    );
    assert.ok(candidate);
    assert.equal(runtime.createSnapshot().overlay.localEvidenceCandidates?.length, 1);
    assert.equal(
      runtime.createSnapshot().overlay.localAuthoredEvidence.length,
      snapshotBeforeReply.overlay.localAuthoredEvidence.length
    );

    const source = environment.app.querySelector(
      `[data-pattern-evidence-candidate-source='${candidateId}']`
    );
    const excerpt = environment.app.querySelector(
      `[data-pattern-evidence-candidate-excerpt='${candidateId}']`
    );
    const promote = environment.app.querySelector(
      `[data-pattern-evidence-candidate-promote='${candidateId}']`
    );
    assert.ok(source);
    assert.ok(excerpt);
    assert.ok(promote);
    assert.equal(promote.disabled, true);

    source.value = "source-navigation-log";
    fireEvent(source, "change");
    excerpt.value = "Selected navigation log passage.";
    fireEvent(excerpt, "input");
    assert.equal(promote.disabled, false);
    fireEvent(promote, "click");

    const snapshotAfterPromotion = runtime.createSnapshot();
    assert.equal(snapshotAfterPromotion.overlay.localEvidenceCandidates?.length, 0);
    assert.equal(
      snapshotAfterPromotion.overlay.localAuthoredEvidence.length -
        snapshotBeforeReply.overlay.localAuthoredEvidence.length,
      1
    );
    assert.equal(
      snapshotAfterPromotion.overlay.localAuthoredEvidence.at(-1)?.sourceId,
      "source-navigation-log"
    );
    assert.equal(
      snapshotAfterPromotion.overlay.localAuthoredEvidence.at(-1)?.excerpt,
      "Selected navigation log passage."
    );
    assert.equal(
      snapshotAfterPromotion.overlay.localAuthoredEvidence.at(-1)?.interpretation,
      "Recheck the original navigation log image."
    );
    assert.ok(
      environment.app.querySelector("[data-pattern-evidence-candidate-feedback='success']")
    );
    runtime.dispose();
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});
