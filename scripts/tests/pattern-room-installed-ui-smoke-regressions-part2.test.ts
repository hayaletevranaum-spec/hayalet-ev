import { startPatternRoomInstalledUi } from "./pattern-room-installed-ui-smoke.helpers.ts";
import type { FakeElement } from "./forge-room-ui-smoke.helpers.ts";
import {
  assert,
  createMinimalForgeUiEnvironment,
  createRoomInstalledCopy,
  fireEvent,
  pathToFileURL,
  readTreeText,
  resolve,
  test,
} from "./forge-room-ui-smoke.helpers.ts";
import { PATTERN_ROOM_DOMAIN_TEST_FIXTURE } from "../../rooms/pattern-room/shared/data/testing/pattern-room-domain.fixture.ts";
import {
  PATTERN_ROOM_LOADED_EVENT,
  PATTERN_ROOM_SAVE_COMMAND,
  PATTERN_ROOM_SAVE_FAILED_EVENT,
} from "../../rooms/pattern-room/shared/types/pattern-room-persistence.ts";
import type { PatternRoomSessionSnapshot } from "../../rooms/pattern-room/shared/types/pattern-room-snapshot.ts";
import type { PatternRoomUiRuntime } from "../../rooms/pattern-room/ui/pattern-room-ui-runtime.ts";

type PatternRoomUiRuntimeModule = {
  createPatternRoomUiRuntime: () => PatternRoomUiRuntime;
};
type PatternFocusedViewId = "board" | "desk" | "archive" | "tenth-man" | "report";
type PatternRoomFakeApp = FakeElement;

function assertTextIncludes(text: string, expectedValues: string[]): void {
  expectedValues.forEach((expectedValue) => {
    assert.match(text, new RegExp(expectedValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
}

function openFocusedView(app: PatternRoomFakeApp, viewId: PatternFocusedViewId): void {
  const hotspot = app.querySelector(`[data-pattern-hotspot='${viewId}']`);
  assert.ok(hotspot);
  fireEvent(hotspot, "click");
  assert.ok(app.querySelector(`[data-pattern-view='${viewId}']`));
}

function returnToOverview(app: PatternRoomFakeApp): void {
  const backButton = app.querySelector("[data-pattern-back='true']");
  assert.ok(backButton);
  fireEvent(backButton, "click");
  assert.ok(app.querySelector("[data-pattern-view='overview']"));
}

function installFormReset(form: FakeElement): void {
  (form as FakeElement & { reset: () => void }).reset = () => {};
}

function submitForm(form: {
  eventListeners: Map<string, Array<(event?: Record<string, unknown>) => void>>;
  reset?: () => void;
}): void {
  let defaultPrevented = false;
  const handlers = form.eventListeners.get("submit") ?? [];

  handlers.forEach((handler) => {
    handler({
      preventDefault() {
        defaultPrevented = true;
      },
    });
  });

  assert.equal(defaultPrevented, true);
}

function submitBoardLocalNode(
  app: PatternRoomFakeApp,
  labelText: string,
  contentText: string,
  nodeTypeValue: "claim" | "inspiration" | "uncertainty" = "claim"
): void {
  const nodeForm = app.querySelector("[data-pattern-author-node-form='true']");
  const nodeType = app.querySelector("[data-pattern-author-node-type='true']");
  const labelInput = app.querySelector("[data-pattern-author-node-label='true']");
  const contentInput = app.querySelector("[data-pattern-author-node-content='true']");
  assert.ok(nodeForm);
  assert.ok(nodeType);
  assert.ok(labelInput);
  assert.ok(contentInput);

  installFormReset(nodeForm);
  nodeType.value = nodeTypeValue;
  labelInput.value = labelText;
  contentInput.value = contentText;
  submitForm(nodeForm);
}

function readLatestSavePayload(
  environment: ReturnType<typeof createMinimalForgeUiEnvironment>
): Record<string, unknown> {
  const event = environment.sentEvents[environment.sentEvents.length - 1];
  assert.ok(event);
  assert.equal(event.command, PATTERN_ROOM_SAVE_COMMAND);
  return event.payload;
}

function assertSavePayloadIncludesLocalNode(
  payload: Record<string, unknown>,
  labelText: string
): PatternRoomSessionSnapshot {
  const snapshot = payload["snapshot"] as PatternRoomSessionSnapshot;
  assert.equal(snapshot.roomId, "pattern-room");
  assert.equal(
    snapshot.overlay.localAuthoredNodes.some((node) => node.label === labelText),
    true
  );
  return snapshot;
}

void test("pattern-room installed UI coalesces fast autosave mutations into one save", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    environment.emitHostMessage({
      payload: { snapshot: null },
      type: PATTERN_ROOM_LOADED_EVENT,
    });
    openFocusedView(environment.app, "board");

    for (let index = 0; index < 5; index += 1) {
      submitBoardLocalNode(
        environment.app,
        `Fast autosave node ${index + 1}`,
        `Fast autosave content ${index + 1}`
      );
    }

    assert.equal(environment.pendingTimerCount(), 1);
    environment.runPendingTimers(2000);

    assert.deepEqual(environment.sentCommands, [PATTERN_ROOM_SAVE_COMMAND]);
    const payload = readLatestSavePayload(environment);
    const savedSnapshot = assertSavePayloadIncludesLocalNode(payload, "Fast autosave node 5");
    assert.equal(savedSnapshot.overlay.localAuthoredNodes.length, 5);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI flushes a pending autosave before unload", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    environment.emitHostMessage({
      payload: { snapshot: null },
      type: PATTERN_ROOM_LOADED_EVENT,
    });
    openFocusedView(environment.app, "board");
    submitBoardLocalNode(
      environment.app,
      "Flush before unload node",
      "Flush before unload content"
    );

    assert.equal(environment.pendingTimerCount(), 1);
    environment.emitWindowEvent("beforeunload");

    assert.equal(environment.pendingTimerCount(), 0);
    assert.deepEqual(environment.sentCommands, [PATTERN_ROOM_SAVE_COMMAND]);
    const payload = readLatestSavePayload(environment);
    assert.equal(payload["flush"], true);
    assertSavePayloadIncludesLocalNode(payload, "Flush before unload node");

    environment.runPendingTimers(2000);
    assert.deepEqual(environment.sentCommands, [PATTERN_ROOM_SAVE_COMMAND]);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI dispose flushes pending autosave and disconnects listeners", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");
  const originalWarn = console.warn;
  const warnings: string[] = [];

  try {
    const runtimeModule = (await import(
      `${pathToFileURL(resolve(installedCopy.rootDir, "ui/pattern-room-ui-runtime.js")).href}?autosave-dispose=${Date.now()}`
    )) as PatternRoomUiRuntimeModule;
    const runtime = runtimeModule.createPatternRoomUiRuntime();

    runtime.start();
    assert.equal(environment.hasHostMessageHandler(), true);
    assert.equal(environment.windowListenerCount("beforeunload"), 1);

    environment.emitHostMessage({
      payload: { snapshot: null },
      type: PATTERN_ROOM_LOADED_EVENT,
    });
    openFocusedView(environment.app, "board");
    submitBoardLocalNode(environment.app, "Dispose flush node", "Dispose flush content");

    assert.equal(environment.pendingTimerCount(), 1);
    runtime.dispose();

    assert.equal(environment.pendingTimerCount(), 0);
    assert.equal(environment.hasHostMessageHandler(), false);
    assert.equal(environment.windowListenerCount("beforeunload"), 0);
    assert.deepEqual(environment.sentCommands, [PATTERN_ROOM_SAVE_COMMAND]);
    const payload = readLatestSavePayload(environment);
    assert.equal(payload["flush"], true);
    assertSavePayloadIncludesLocalNode(payload, "Dispose flush node");

    console.warn = (...args: unknown[]): void => {
      warnings.push(args.map(String).join(" "));
    };
    environment.emitHostMessage({
      payload: {
        error: "Pattern Room disposed listener should not receive this.",
        success: false,
      },
      type: PATTERN_ROOM_SAVE_FAILED_EVENT,
    });
    environment.emitWindowEvent("beforeunload");

    assert.deepEqual(warnings, []);
    assert.deepEqual(environment.sentCommands, [PATTERN_ROOM_SAVE_COMMAND]);
  } finally {
    console.warn = originalWarn;
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI handles save-failed host events without status UI", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");
  const originalWarn = console.warn;
  const warnings: string[] = [];

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    console.warn = (...args: unknown[]): void => {
      warnings.push(args.map(String).join(" "));
    };

    environment.emitHostMessage({
      payload: { snapshot: null },
      type: PATTERN_ROOM_LOADED_EVENT,
    });
    environment.emitHostMessage({
      payload: {
        error: "Pattern Room test save failed.",
        success: false,
      },
      type: PATTERN_ROOM_SAVE_FAILED_EVENT,
    });

    assert.ok(environment.app.querySelector("[data-pattern-view='overview']"));
    assert.deepEqual(warnings, ["Pattern Room test save failed."]);
    assert.doesNotMatch(readTreeText(environment.app), /save failed/i);
    assert.deepEqual(environment.sentCommands, []);
    assert.deepEqual(environment.sentEvents, []);
  } finally {
    console.warn = originalWarn;
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI supports phase 4B local interactions without host commands", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    const identityForm = environment.app.querySelector("[data-pattern-case-identity-form='true']");
    const identityName = environment.app.querySelector("[data-pattern-case-identity-name='true']");
    const identityQuestion = environment.app.querySelector(
      "[data-pattern-case-identity-question='true']"
    );
    assert.ok(identityForm);
    assert.ok(identityName);
    assert.ok(identityQuestion);
    identityName.value = "Kuzey Koridoru Sensör Olayı";
    identityQuestion.value = "Elektrik kesintisi sırasında koridorda fiziksel hareket oldu mu?";
    submitForm(identityForm);
    assertTextIncludes(readTreeText(environment.app), [
      "Kuzey Koridoru Sensör Olayı",
      "Elektrik kesintisi sırasında koridorda fiziksel hareket oldu mu?",
      "Vaka kimliği güncellendi.",
    ]);

    openFocusedView(environment.app, "board");
    const boardNode = environment.app.querySelector(
      "[data-pattern-board-pin='node-navigation-source']"
    );
    assert.ok(boardNode);
    fireEvent(boardNode, "click");
    const investigationInspector = environment.app.querySelector(
      "[data-pattern-workspace-inspector='true']"
    );
    assert.ok(investigationInspector);
    assert.equal(investigationInspector.dataset["patternWorkspaceInspectorView"], "board");
    assert.ok(
      investigationInspector.querySelector("[data-pattern-investigation-inspector-mode='board']")
    );
    assertTextIncludes(readTreeText(investigationInspector), [
      "Tuval detayı",
      "Seyir defteri kaynagi",
      "Uzun rota gozlemlerini temsil eden arka plan kaynak karti.",
    ]);

    const sendToDesk = environment.app.querySelector(
      "[data-pattern-send-to-desk='node-navigation-source']"
    );
    assert.ok(sendToDesk);
    fireEvent(sendToDesk, "click");
    const deskFeedback = environment.app.querySelector("[data-pattern-workspace-feedback='true']");
    assert.ok(deskFeedback);
    assert.equal(deskFeedback.dataset["patternWorkspaceFeedbackTone"], "success");
    assertTextIncludes(readTreeText(deskFeedback), ["Öğe çalışma masasına gönderildi."]);

    const addBoardNodeToDebate = environment.app.querySelector(
      "[data-pattern-add-node-debate='node-navigation-source']"
    );
    assert.ok(addBoardNodeToDebate);
    fireEvent(addBoardNodeToDebate, "click");
    const reviewFeedback = environment.app.querySelector(
      "[data-pattern-workspace-feedback='true']"
    );
    assert.ok(reviewFeedback);
    assert.equal(reviewFeedback.dataset["patternWorkspaceFeedbackTone"], "success");
    assertTextIncludes(readTreeText(reviewFeedback), ["Öğe 10. Adam referanslarına eklendi."]);
    const dismissFeedback = reviewFeedback.querySelector(
      "[data-pattern-workspace-feedback-dismiss='true']"
    );
    assert.ok(dismissFeedback);
    fireEvent(dismissFeedback, "click");
    assert.equal(environment.app.querySelector("[data-pattern-workspace-feedback='true']"), null);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "desk");
    assertTextIncludes(readTreeText(environment.app), [
      "Seyir defteri kaynagi",
      "Yerel masaya gönderildi",
    ]);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "archive");
    const inspectSource = environment.app.querySelector(
      "[data-pattern-inspect-source='source-shadow-comparison']"
    );
    assert.ok(inspectSource);
    fireEvent(inspectSource, "click");
    assertTextIncludes(readTreeText(environment.app), [
      "Kaynak Detayı",
      "Golge karsilastirma gorseli",
      "Tür: Görsel kaynak",
      "Köken: Yerel temsilî görsel inceleme",
      "Durum: mocked",
      "Doğrulanmamış; kaynak origin: Yerel temsilî görsel inceleme.",
    ]);

    const pinSource = environment.app.querySelector(
      "[data-pattern-pin-source='source-shadow-comparison']"
    );
    assert.ok(pinSource);
    fireEvent(pinSource, "click");

    const addArchiveSourceToDebate = environment.app.querySelector(
      "[data-pattern-add-source-debate='source-shadow-comparison']"
    );
    assert.ok(addArchiveSourceToDebate);
    fireEvent(addArchiveSourceToDebate, "click");

    returnToOverview(environment.app);
    openFocusedView(environment.app, "board");
    assertTextIncludes(readTreeText(environment.app), ["Golge karsilastirma gorseli"]);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "tenth-man");
    assertTextIncludes(readTreeText(environment.app), [
      "10. Adam referans listesi",
      "Seyir defteri kaynagi",
      "Golge karsilastirma gorseli",
    ]);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "report");
    assert.equal(environment.app.querySelector("[data-pattern-local-note-form='true']"), null);
    assertTextIncludes(readTreeText(environment.app), [
      "Kaynak Özeti",
      "Pano Notları",
      "10. Adam İzleri",
      "Henüz yerel kanıt notu yok.",
      "Henüz yerel pano notu yok.",
    ]);

    assert.deepEqual(environment.sentCommands, []);
    assert.deepEqual(environment.sentEvents, []);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI phase 7C board node authoring form submits claims and guards blanks", async () => {
  const beforeDomain = JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    openFocusedView(environment.app, "board");

    const initialPinCount = environment.app.querySelectorAll("[data-pattern-board-pin]").length;
    const nodeForm = environment.app.querySelector("[data-pattern-author-node-form='true']");
    const nodeType = environment.app.querySelector("[data-pattern-author-node-type='true']");
    const labelInput = environment.app.querySelector("[data-pattern-author-node-label='true']");
    const contentInput = environment.app.querySelector("[data-pattern-author-node-content='true']");
    assert.ok(nodeForm);
    assert.ok(nodeType);
    assert.ok(labelInput);
    assert.ok(contentInput);

    installFormReset(nodeForm);
    labelInput.value = " ";
    contentInput.value = "";
    submitForm(nodeForm);

    assert.equal(
      environment.app.querySelectorAll("[data-pattern-board-pin]").length,
      initialPinCount
    );
    assert.doesNotMatch(readTreeText(environment.app), /Faz 7C iddia/);

    const submittedNodeForm = environment.app.querySelector(
      "[data-pattern-author-node-form='true']"
    );
    const submittedNodeType = environment.app.querySelector(
      "[data-pattern-author-node-type='true']"
    );
    const submittedLabelInput = environment.app.querySelector(
      "[data-pattern-author-node-label='true']"
    );
    const submittedContentInput = environment.app.querySelector(
      "[data-pattern-author-node-content='true']"
    );
    assert.ok(submittedNodeForm);
    assert.ok(submittedNodeType);
    assert.ok(submittedLabelInput);
    assert.ok(submittedContentInput);

    installFormReset(submittedNodeForm);
    submittedNodeType.value = "claim";
    submittedLabelInput.value = "Faz 7C iddia";
    submittedContentInput.value = "DOM submit ile eklenen local iddia.";
    submitForm(submittedNodeForm);

    assert.ok(environment.app.querySelector("[data-pattern-board-pin='local-node-001']"));
    assertTextIncludes(readTreeText(environment.app), ["Faz 7C iddia"]);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "desk");
    assertTextIncludes(readTreeText(environment.app), [
      "Faz 7C iddia",
      "DOM submit ile eklenen local iddia.",
    ]);

    assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
    assert.deepEqual(environment.sentCommands, []);
    assert.deepEqual(environment.sentEvents, []);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI phase 7C board evidence form reaches board and report", async () => {
  const beforeDomain = JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    openFocusedView(environment.app, "board");

    const evidenceForm = environment.app.querySelector(
      "[data-pattern-author-evidence-form='true']"
    );
    const labelInput = environment.app.querySelector("[data-pattern-author-evidence-label='true']");
    const excerptInput = environment.app.querySelector(
      "[data-pattern-author-evidence-excerpt='true']"
    );
    const interpretationInput = environment.app.querySelector(
      "[data-pattern-author-evidence-interpretation='true']"
    );
    assert.ok(evidenceForm);
    assert.ok(labelInput);
    assert.ok(excerptInput);
    assert.ok(interpretationInput);

    installFormReset(evidenceForm);
    labelInput.value = "Faz 7C kanıt";
    excerptInput.value = "DOM submit ile eklenen local alıntı.";
    interpretationInput.value = "Evidence layer guard yorumu.";
    submitForm(evidenceForm);

    assert.ok(environment.app.querySelector("[data-pattern-board-pin='local-evidence-001']"));
    assertTextIncludes(readTreeText(environment.app), ["Faz 7C kanıt"]);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "report");
    assertTextIncludes(readTreeText(environment.app), [
      "Kanıt Notları",
      "Faz 7C kanıt",
      "DOM submit ile eklenen local alıntı.",
    ]);

    assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
    assert.deepEqual(environment.sentCommands, []);
    assert.deepEqual(environment.sentEvents, []);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});
