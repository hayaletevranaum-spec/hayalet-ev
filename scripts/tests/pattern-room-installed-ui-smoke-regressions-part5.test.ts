import { startPatternRoomInstalledUi } from "./pattern-room-installed-ui-smoke.helpers.ts";
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
import { PATTERN_ROOM_DOMAIN_TEST_FIXTURE } from "../../rooms/pattern-room/shared/data/testing/pattern-room-domain.fixture.ts";
import { restoreFromSnapshot } from "../../rooms/pattern-room/shared/state/pattern-room-snapshot.ts";
import {
  PATTERN_ROOM_LOADED_EVENT,
  PATTERN_ROOM_SAVE_COMMAND,
} from "../../rooms/pattern-room/shared/types/pattern-room-persistence.ts";
import {
  PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND,
  PATTERN_ROOM_CASE_REVIEW_DISPATCH_FAILED_EVENT,
  PATTERN_ROOM_CASE_REVIEW_DISPATCHED_EVENT,
  type PatternRoomCaseReviewDispatchDraft,
} from "../../rooms/pattern-room/shared/types/pattern-room-case-review-dispatch.ts";
import {
  PATTERN_ROOM_SNAPSHOT_VERSION,
  type PatternRoomSessionSnapshot,
} from "../../rooms/pattern-room/shared/types/pattern-room-snapshot.ts";
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

function submitUserTextSource(
  app: PatternRoomFakeApp,
  titleText: string,
  sourceText: string
): void {
  const form = app.querySelector("[data-pattern-user-text-source-form='true']");
  const titleInput = app.querySelector("[data-pattern-user-text-source-title='true']");
  const textInput = app.querySelector("[data-pattern-user-text-source-text='true']");
  assert.ok(form);
  assert.ok(titleInput);
  assert.ok(textInput);
  titleInput.value = titleText;
  textInput.value = sourceText;
  submitForm(form);
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

function submitBoardLocalEvidence(
  app: PatternRoomFakeApp,
  labelText: string,
  excerptText: string,
  interpretationText: string
): void {
  const evidenceForm = app.querySelector("[data-pattern-author-evidence-form='true']");
  const labelInput = app.querySelector("[data-pattern-author-evidence-label='true']");
  const excerptInput = app.querySelector("[data-pattern-author-evidence-excerpt='true']");
  const interpretationInput = app.querySelector(
    "[data-pattern-author-evidence-interpretation='true']"
  );
  assert.ok(evidenceForm);
  assert.ok(labelInput);
  assert.ok(excerptInput);
  assert.ok(interpretationInput);

  installFormReset(evidenceForm);
  labelInput.value = labelText;
  excerptInput.value = excerptText;
  interpretationInput.value = interpretationText;
  submitForm(evidenceForm);
}

function submitBoardLocalEdge(
  app: PatternRoomFakeApp,
  sourceId: string,
  edgeType: string,
  targetId: string,
  noteText: string
): void {
  const edgeForm = app.querySelector("[data-pattern-author-edge-form='true']");
  const sourceSelect = app.querySelector("[data-pattern-author-edge-source='true']");
  const edgeTypeSelect = app.querySelector("[data-pattern-author-edge-type='true']");
  const targetSelect = app.querySelector("[data-pattern-author-edge-target='true']");
  const noteInput = app.querySelector("[data-pattern-author-edge-note='true']");
  assert.ok(edgeForm);
  assert.ok(sourceSelect);
  assert.ok(edgeTypeSelect);
  assert.ok(targetSelect);
  assert.ok(noteInput);

  installFormReset(edgeForm);
  sourceSelect.value = sourceId;
  edgeTypeSelect.value = edgeType;
  targetSelect.value = targetId;
  noteInput.value = noteText;
  submitForm(edgeForm);
}

function clickBoardPin(app: PatternRoomFakeApp, pinId: string): void {
  const pin = app.querySelector(`[data-pattern-board-pin='${pinId}']`);
  assert.ok(pin);
  fireEvent(pin, "click");
}

function setWindowConfirm(handler: (message: string) => boolean): void {
  (globalThis as unknown as { window: { confirm: (message: string) => boolean } }).window.confirm =
    handler;
}

function readLatestSavePayload(
  environment: ReturnType<typeof createMinimalForgeUiEnvironment>
): Record<string, unknown> {
  const event = environment.sentEvents[environment.sentEvents.length - 1];
  assert.ok(event);
  assert.equal(event.command, PATTERN_ROOM_SAVE_COMMAND);
  return event.payload;
}

function assertPatternCaseReviewPreviewAvoidsVerdictLanguage(previewText: string): void {
  assert.doesNotMatch(previewText, /kanıtlandı|doğrulandı|nihai sonuç/i);
  assert.doesNotMatch(previewText, /kesin hüküm(?:dür|dir| olarak|:)/i);
  assert.match(previewText, /Kesin hüküm üretme\./);
}

function assertSnapshotLocalStateUnchanged(
  before: PatternRoomSessionSnapshot,
  after: PatternRoomSessionSnapshot
): void {
  assert.equal(after.activeView, before.activeView);
  assert.equal(after.schemaVersion, before.schemaVersion);
  assert.deepEqual(after.guards, before.guards);
  assert.deepEqual(after.overlay, before.overlay);
}

void test("pattern-room installed UI phase 12G-A removes confirmed local sources and cascades source-linked report links", async () => {
  const beforeDomain = JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");
  const confirmMessages: string[] = [];

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    environment.emitHostMessage({
      payload: { snapshot: null },
      type: PATTERN_ROOM_LOADED_EVENT,
    });
    openFocusedView(environment.app, "archive");
    submitUserTextSource(
      environment.app,
      "Kaynak Bağlantı Testi",
      "Silindiğinde bağlı yerel bağlantısı da kalkacak kaynak."
    );
    environment.runPendingTimers(2000);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "board");
    const edgeForm = environment.app.querySelector("[data-pattern-author-edge-form='true']");
    const sourceSelect = environment.app.querySelector("[data-pattern-author-edge-source='true']");
    const edgeTypeSelect = environment.app.querySelector("[data-pattern-author-edge-type='true']");
    const targetSelect = environment.app.querySelector("[data-pattern-author-edge-target='true']");
    const noteInput = environment.app.querySelector("[data-pattern-author-edge-note='true']");
    assert.ok(edgeForm);
    assert.ok(sourceSelect);
    assert.ok(edgeTypeSelect);
    assert.ok(targetSelect);
    assert.ok(noteInput);
    installFormReset(edgeForm);
    sourceSelect.value = "local-source-001";
    edgeTypeSelect.value = "references";
    targetSelect.value = "node-navigation-source";
    noteInput.value = "Source-linked deletion smoke.";
    submitForm(edgeForm);
    environment.runPendingTimers(2000);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "report");
    assertTextIncludes(readTreeText(environment.app), [
      "Yerel Bağlantılar",
      "Kaynak Bağlantı Testi",
      "referans veriyor",
      "Seyir defteri kaynagi",
    ]);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "archive");
    const inspectLocalSource = environment.app.querySelector(
      "[data-pattern-inspect-source='local-source-001']"
    );
    assert.ok(inspectLocalSource);
    fireEvent(inspectLocalSource, "click");
    assertTextIncludes(readTreeText(environment.app), [
      "Kaynak Detayı",
      "Kaynak Bağlantı Testi",
      "Silindiğinde bağlı yerel bağlantısı da kalkacak kaynak.",
    ]);

    const removeLocalSource = environment.app.querySelector(
      "[data-pattern-remove-local-source='local-source-001']"
    );
    assert.ok(removeLocalSource);
    setWindowConfirm((message) => {
      confirmMessages.push(message);
      return true;
    });
    fireEvent(removeLocalSource, "click");

    assert.deepEqual(confirmMessages, ["Bu yerel kaynak odadan kaldırılacak. Devam edilsin mi?"]);
    assert.equal(
      environment.app.querySelector("[data-pattern-archive-source='local-source-001']"),
      null
    );
    assert.ok(
      environment.app.querySelector("[data-pattern-archive-source-detail-placeholder='true']")
    );
    assertTextIncludes(readTreeText(environment.app), ["Kaynak Detayı", "Bir kaynak seç"]);
    assert.equal(environment.pendingTimerCount(), 1);
    environment.runPendingTimers(2000);
    assert.deepEqual(environment.sentCommands, [
      PATTERN_ROOM_SAVE_COMMAND,
      PATTERN_ROOM_SAVE_COMMAND,
      PATTERN_ROOM_SAVE_COMMAND,
    ]);

    const savedSnapshot = readLatestSavePayload(environment)[
      "snapshot"
    ] as PatternRoomSessionSnapshot;
    assert.equal(savedSnapshot.overlay.localAuthoredSources.length, 0);
    assert.equal(savedSnapshot.overlay.localAuthoredEdges.length, 0);
    assert.deepEqual(savedSnapshot.overlay.pinnedSourceIds, []);
    assert.deepEqual(savedSnapshot.overlay.sourcePinnedLayerById, {});
    const restored = restoreFromSnapshot(savedSnapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
    assert.ok(restored);
    assert.deepEqual(restored.overlay.localAuthoredSources, []);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "report");
    assertTextIncludes(readTreeText(environment.app), ["Henüz yerel bağlantı yok."]);
    assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI phase 12G-C removes selected local board nodes and evidence only", async () => {
  const beforeDomain = JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");
  const confirmMessages: string[] = [];
  const removeConfirm =
    "Bu yerel pano öğesi odadan kaldırılacak. Bağlı yerel bağlantılar da temizlenir. Devam edilsin mi?";

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    environment.emitHostMessage({
      payload: { snapshot: null },
      type: PATTERN_ROOM_LOADED_EVENT,
    });
    openFocusedView(environment.app, "board");

    clickBoardPin(environment.app, "node-navigation-source");
    assert.equal(environment.app.querySelector("[data-pattern-remove-board-item]"), null);

    submitBoardLocalNode(
      environment.app,
      "Faz 12G-C iddia",
      "Board detail kaldırma testi için local iddia."
    );
    clickBoardPin(environment.app, "local-node-001");
    const cancelRemoveNode = environment.app.querySelector(
      "[data-pattern-remove-board-item='local-node-001']"
    );
    assert.ok(cancelRemoveNode);
    assert.equal(cancelRemoveNode.dataset["patternRemoveBoardItemKind"], "node");
    assertTextIncludes(readTreeText(environment.app), ["Öğeyi kaldır"]);
    const addNodeDebate = environment.app.querySelector(
      "[data-pattern-add-node-debate='local-node-001']"
    );
    assert.ok(addNodeDebate);
    fireEvent(addNodeDebate, "click");

    setWindowConfirm((message) => {
      confirmMessages.push(message);
      return false;
    });
    fireEvent(cancelRemoveNode, "click");
    assert.ok(environment.app.querySelector("[data-pattern-board-pin='local-node-001']"));
    assertTextIncludes(readTreeText(environment.app), ["Faz 12G-C iddia"]);

    clickBoardPin(environment.app, "node-navigation-source");
    assert.equal(environment.app.querySelector("[data-pattern-remove-board-item]"), null);

    submitBoardLocalEvidence(
      environment.app,
      "Faz 12G-C kanıt",
      "Board detail kaldırma testi için local kanıt.",
      "Silme sonrası rapordan düşmeli."
    );
    clickBoardPin(environment.app, "local-evidence-001");
    const removeEvidence = environment.app.querySelector(
      "[data-pattern-remove-board-item='local-evidence-001']"
    );
    assert.ok(removeEvidence);
    assert.equal(removeEvidence.dataset["patternRemoveBoardItemKind"], "evidence");
    const addEvidenceDebate = environment.app.querySelector(
      "[data-pattern-add-evidence-debate='local-evidence-001']"
    );
    assert.ok(addEvidenceDebate);
    fireEvent(addEvidenceDebate, "click");

    submitBoardLocalEdge(
      environment.app,
      "local-node-001",
      "derived_from",
      "local-evidence-001",
      "Board item deletion linked edge smoke."
    );
    environment.runPendingTimers(2000);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "report");
    assertTextIncludes(readTreeText(environment.app), [
      "Kanıt Notları",
      "Faz 12G-C kanıt",
      "Yerel Bağlantılar",
      "Faz 12G-C iddia",
      "türetildi",
      "Faz 12G-C kanıt",
    ]);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "tenth-man");
    assertTextIncludes(readTreeText(environment.app), ["Faz 12G-C iddia", "Faz 12G-C kanıt"]);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "board");
    clickBoardPin(environment.app, "local-evidence-001");
    const acceptRemoveEvidence = environment.app.querySelector(
      "[data-pattern-remove-board-item='local-evidence-001']"
    );
    assert.ok(acceptRemoveEvidence);
    setWindowConfirm((message) => {
      confirmMessages.push(message);
      return true;
    });
    fireEvent(acceptRemoveEvidence, "click");

    assert.equal(
      environment.app.querySelector("[data-pattern-board-pin='local-evidence-001']"),
      null
    );
    assert.ok(environment.app.querySelector("[data-pattern-board-pin='local-node-001']"));
    assert.ok(environment.app.querySelector("[data-pattern-board-pin='node-navigation-source']"));
    environment.runPendingTimers(2000);

    const evidenceRemovedSnapshot = readLatestSavePayload(environment)[
      "snapshot"
    ] as PatternRoomSessionSnapshot;
    assert.equal(evidenceRemovedSnapshot.schemaVersion, PATTERN_ROOM_SNAPSHOT_VERSION);
    assert.equal(evidenceRemovedSnapshot.overlay.localAuthoredNodes.length, 1);
    assert.deepEqual(evidenceRemovedSnapshot.overlay.localAuthoredEvidence, []);
    assert.deepEqual(evidenceRemovedSnapshot.overlay.localAuthoredEdges, []);
    assert.equal(
      evidenceRemovedSnapshot.overlay.debateReferenceIds.includes("local-evidence-001"),
      false
    );
    assert.equal(
      evidenceRemovedSnapshot.overlay.debateReferenceIds.includes("local-node-001"),
      true
    );
    const evidenceRemovedRestored = restoreFromSnapshot(
      evidenceRemovedSnapshot,
      PATTERN_ROOM_DOMAIN_TEST_FIXTURE
    );
    assert.ok(evidenceRemovedRestored);
    assert.deepEqual(evidenceRemovedRestored.overlay.localAuthoredEvidence, []);
    assert.deepEqual(evidenceRemovedRestored.overlay.localAuthoredEdges, []);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "report");
    const evidenceRemovedReportText = readTreeText(environment.app);
    assertTextIncludes(evidenceRemovedReportText, ["Henüz yerel bağlantı yok."]);
    assert.doesNotMatch(evidenceRemovedReportText, /Faz 12G-C kanıt/);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "tenth-man");
    const evidenceRemovedDebateText = readTreeText(environment.app);
    assertTextIncludes(evidenceRemovedDebateText, ["Faz 12G-C iddia"]);
    assert.doesNotMatch(evidenceRemovedDebateText, /Faz 12G-C kanıt/);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "board");
    clickBoardPin(environment.app, "local-node-001");
    const acceptRemoveNode = environment.app.querySelector(
      "[data-pattern-remove-board-item='local-node-001']"
    );
    assert.ok(acceptRemoveNode);
    fireEvent(acceptRemoveNode, "click");

    assert.equal(environment.app.querySelector("[data-pattern-board-pin='local-node-001']"), null);
    assert.ok(environment.app.querySelector("[data-pattern-board-pin='node-navigation-source']"));
    environment.runPendingTimers(2000);

    const nodeRemovedSnapshot = readLatestSavePayload(environment)[
      "snapshot"
    ] as PatternRoomSessionSnapshot;
    assert.equal(nodeRemovedSnapshot.schemaVersion, PATTERN_ROOM_SNAPSHOT_VERSION);
    assert.deepEqual(nodeRemovedSnapshot.overlay.localAuthoredNodes, []);
    assert.deepEqual(nodeRemovedSnapshot.overlay.localAuthoredEvidence, []);
    assert.deepEqual(nodeRemovedSnapshot.overlay.localAuthoredEdges, []);
    assert.equal(nodeRemovedSnapshot.overlay.debateReferenceIds.includes("local-node-001"), false);
    const nodeRemovedRestored = restoreFromSnapshot(
      nodeRemovedSnapshot,
      PATTERN_ROOM_DOMAIN_TEST_FIXTURE
    );
    assert.ok(nodeRemovedRestored);
    assert.deepEqual(nodeRemovedRestored.overlay.localAuthoredNodes, []);
    assert.deepEqual(nodeRemovedRestored.overlay.localAuthoredEvidence, []);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "tenth-man");
    const nodeRemovedDebateText = readTreeText(environment.app);
    assert.doesNotMatch(nodeRemovedDebateText, /Faz 12G-C iddia/);
    assert.doesNotMatch(nodeRemovedDebateText, /Faz 12G-C kanıt/);

    assert.deepEqual(confirmMessages, [removeConfirm, removeConfirm, removeConfirm]);
    assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI phase 12G-B resets the local session without touching domain data", async () => {
  const beforeDomain = JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");
  const confirmMessages: string[] = [];

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    environment.emitHostMessage({
      payload: { snapshot: null },
      type: PATTERN_ROOM_LOADED_EVENT,
    });
    openFocusedView(environment.app, "archive");
    assertTextIncludes(readTreeText(environment.app), [
      "Yerel Oturum",
      "Yerel Oturumu Sıfırla",
      "Hazır konu verileri korunur.",
    ]);
    assert.equal(environment.app.querySelector("[data-pattern-remove-import-batch]"), null);

    const importButton = environment.app.querySelector(
      "[data-pattern-import-sample-source-package='true']"
    );
    assert.ok(importButton);
    fireEvent(importButton, "click");
    environment.runPendingTimers(2000);

    assert.ok(environment.app.querySelector("[data-pattern-archive-source='local-source-001']"));
    assert.ok(
      environment.app.querySelector("[data-pattern-archive-source='source-shadow-comparison']")
    );
    const addLocalSourceToDebate = environment.app.querySelector(
      "[data-pattern-add-source-debate='local-source-001']"
    );
    assert.ok(addLocalSourceToDebate);
    fireEvent(addLocalSourceToDebate, "click");

    returnToOverview(environment.app);
    openFocusedView(environment.app, "tenth-man");
    assertTextIncludes(readTreeText(environment.app), ["Saha Defteri Alıntısı"]);
    const prepare = environment.app.querySelector("[data-pattern-prepare-debate='true']");
    assert.ok(prepare);
    fireEvent(prepare, "click");
    const assign = environment.app.querySelector("[data-pattern-assign-debate-roles='true']");
    assert.ok(assign);
    fireEvent(assign, "click");
    const start = environment.app.querySelector("[data-pattern-start-debate='true']");
    assert.ok(start);
    fireEvent(start, "click");
    assertTextIncludes(readTreeText(environment.app), ["AI0 araştırmacı açılışı"]);
    environment.runPendingTimers(2000);
    assert.deepEqual(environment.sentCommands, [
      PATTERN_ROOM_SAVE_COMMAND,
      PATTERN_ROOM_SAVE_COMMAND,
    ]);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "board");
    assertTextIncludes(readTreeText(environment.app), ["Gölge yönü notu", "Tekrarlayan gölge izi"]);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "report");
    assertTextIncludes(readTreeText(environment.app), [
      "Sonraki Araştırma Notları",
      "Kaynak Atölyesi tarafından örnek bir saha notu paketi hazırlandı.",
      "Kanıt Notları",
      "Gölge yönü notu",
      "Yerel Bağlantılar",
      "Tekrarlayan gölge izi",
    ]);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "archive");
    const resetButton = environment.app.querySelector("[data-pattern-reset-local-session='true']");
    assert.ok(resetButton);
    setWindowConfirm((message) => {
      confirmMessages.push(message);
      return false;
    });
    fireEvent(resetButton, "click");

    assert.deepEqual(confirmMessages, [
      "Tüm yerel kaynaklar, notlar ve geçici tartışma izleri temizlenecek. Hazır konu verileri korunur. Devam edilsin mi?",
    ]);
    assert.ok(environment.app.querySelector("[data-pattern-archive-source='local-source-001']"));
    assert.equal(environment.pendingTimerCount(), 1);
    assert.deepEqual(environment.sentCommands, [
      PATTERN_ROOM_SAVE_COMMAND,
      PATTERN_ROOM_SAVE_COMMAND,
    ]);

    setWindowConfirm((message) => {
      confirmMessages.push(message);
      return true;
    });
    fireEvent(resetButton, "click");

    assert.equal(
      environment.app.querySelector("[data-pattern-archive-source='local-source-001']"),
      null
    );
    assert.ok(
      environment.app.querySelector("[data-pattern-archive-source='source-shadow-comparison']")
    );
    assert.equal(environment.pendingTimerCount(), 1);

    environment.runPendingTimers(2000);
    assert.deepEqual(environment.sentCommands, [
      PATTERN_ROOM_SAVE_COMMAND,
      PATTERN_ROOM_SAVE_COMMAND,
      PATTERN_ROOM_SAVE_COMMAND,
    ]);
    const savedSnapshot = readLatestSavePayload(environment)[
      "snapshot"
    ] as PatternRoomSessionSnapshot;
    assert.equal(savedSnapshot.schemaVersion, PATTERN_ROOM_SNAPSHOT_VERSION);
    assert.deepEqual(savedSnapshot.overlay.localAuthoredSources, []);
    assert.deepEqual(savedSnapshot.overlay.localAuthoredNodes, []);
    assert.deepEqual(savedSnapshot.overlay.localAuthoredEvidence, []);
    assert.deepEqual(savedSnapshot.overlay.localAuthoredEdges, []);
    assert.deepEqual(savedSnapshot.overlay.localNotes, []);
    assert.deepEqual(savedSnapshot.overlay.pinnedSourceIds, []);
    assert.deepEqual(savedSnapshot.overlay.sourcePinnedLayerById, {});
    assert.deepEqual(savedSnapshot.overlay.debateReferenceIds, []);
    assert.deepEqual(savedSnapshot.overlay.debateLocalTurns, []);
    assert.equal(savedSnapshot.overlay.debateLocalVerdict, null);
    assert.equal(savedSnapshot.overlay.debatePhase, "idle");
    assert.equal(savedSnapshot.guards.debateReportReflected, false);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "board");
    const boardText = readTreeText(environment.app);
    assert.doesNotMatch(boardText, /Gölge yönü notu/);
    assert.doesNotMatch(boardText, /Tekrarlayan gölge izi/);
    assertTextIncludes(boardText, ["Seyir defteri kaynagi"]);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "report");
    const reportText = readTreeText(environment.app);
    assertTextIncludes(reportText, ["Henüz yerel kanıt notu yok.", "Henüz yerel bağlantı yok."]);
    assert.doesNotMatch(
      reportText,
      /Kaynak Atölyesi tarafından örnek bir saha notu paketi hazırlandı./
    );

    returnToOverview(environment.app);
    openFocusedView(environment.app, "tenth-man");
    const tenthManText = readTreeText(environment.app);
    assertTextIncludes(tenthManText, [
      "Referans eklemek için Pano veya Arşiv üzerinden 10. Adam’a Ekle akışını kullan.",
      "0 / 8",
    ]);
    assert.doesNotMatch(tenthManText, /Saha Defteri Alıntısı/);
    assert.doesNotMatch(tenthManText, /AI0 araştırmacı açılışı/);

    assert.deepEqual(confirmMessages, [
      "Tüm yerel kaynaklar, notlar ve geçici tartışma izleri temizlenecek. Hazır konu verileri korunur. Devam edilsin mi?",
      "Tüm yerel kaynaklar, notlar ve geçici tartışma izleri temizlenecek. Hazır konu verileri korunur. Devam edilsin mi?",
    ]);
    assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI prepares a local AI2 case review dry-run preview", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    openFocusedView(environment.app, "tenth-man");
    assertTextIncludes(readTreeText(environment.app), [
      "AI2 Vaka İnceleme Önizlemesi",
      "Bu aşamada hiçbir mesaj gönderilmez.",
      "Önizleme Hazırla",
    ]);

    const preparePreview = environment.app.querySelector(
      "[data-pattern-case-review-preview-prepare='true']"
    );
    assert.ok(preparePreview);
    fireEvent(preparePreview, "click");

    const previewTextElement = environment.app.querySelector(
      "[data-pattern-case-review-preview-text='true']"
    );
    assert.ok(previewTextElement);
    const fullText = readTreeText(environment.app);
    const previewText = previewTextElement.textContent;

    assertTextIncludes(fullText, [
      "Hedef: AI2 / ai2",
      "Protokol: pattern-room-case-review",
      "Bu paket kullanıcı tarafından eklenen",
    ]);
    assert.match(previewText, /\[Case Packet\]/);
    assert.match(previewText, /"caution":/);
    assert.match(previewText, /"sources":/);
    assertPatternCaseReviewPreviewAvoidsVerdictLanguage(previewText);

    assert.deepEqual(environment.sentCommands, []);
    assert.deepEqual(environment.sentEvents, []);
    assert.equal(
      (environment.sentCommands as string[]).includes("pattern:case-review-dispatch"),
      false
    );

    const previewSource = readFileSync(
      resolve("rooms/pattern-room/ui/pattern-case-review-preview.ts"),
      "utf8"
    );
    const panelSource = readFileSync(
      resolve("rooms/pattern-room/ui/panels/pattern-tenth-man-panel.ts"),
      "utf8"
    );
    [previewSource, panelSource].forEach((source) => {
      assert.doesNotMatch(source, /PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND/);
      assert.doesNotMatch(source, /pattern:case-review-dispatch/);
      assert.doesNotMatch(source, /roomAPI\.sendCommand/);
      assert.doesNotMatch(source, /dispatchBridge/);
      assert.doesNotMatch(source, /message\.sendWait/);
    });
    assert.equal(PATTERN_ROOM_SNAPSHOT_VERSION, 1);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI dispatches the AI2 case review only after preview and confirm", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");
  const confirmMessages: string[] = [];
  const confirmMessage = "AI2 rolü için vaka incelemesi gönderilecek. Devam edilsin mi?";
  const beforeDomain = JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  let confirmResult = false;

  try {
    const runtimeModule = (await import(
      `${pathToFileURL(resolve(installedCopy.rootDir, "ui/pattern-room-ui-runtime.js")).href}?case-review-send=${Date.now()}`
    )) as PatternRoomUiRuntimeModule;
    const runtime = runtimeModule.createPatternRoomUiRuntime();
    runtime.start();

    setWindowConfirm((message) => {
      confirmMessages.push(message);
      return confirmResult;
    });

    openFocusedView(environment.app, "tenth-man");
    const disabledSend = environment.app.querySelector(
      "[data-pattern-case-review-dispatch-send='true']"
    );
    assert.ok(disabledSend);
    assert.equal(disabledSend.disabled, true);
    fireEvent(disabledSend, "click");
    assert.deepEqual(confirmMessages, []);
    assert.deepEqual(environment.sentCommands, []);

    const preparePreview = environment.app.querySelector(
      "[data-pattern-case-review-preview-prepare='true']"
    );
    assert.ok(preparePreview);
    fireEvent(preparePreview, "click");

    const enabledSend = environment.app.querySelector(
      "[data-pattern-case-review-dispatch-send='true']"
    );
    assert.ok(enabledSend);
    assert.equal(enabledSend.disabled, false);
    assertTextIncludes(readTreeText(environment.app), [
      "Hedef: AI2 / ai2",
      "Protokol: pattern-room-case-review",
    ]);

    const snapshotBeforeSend = runtime.createSnapshot();
    fireEvent(enabledSend, "click");
    assert.deepEqual(confirmMessages, [confirmMessage]);
    assert.deepEqual(environment.sentCommands, []);

    confirmResult = true;
    fireEvent(enabledSend, "click");
    assert.deepEqual(confirmMessages, [confirmMessage, confirmMessage]);
    assert.deepEqual(environment.sentCommands, [PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND]);
    assertTextIncludes(readTreeText(environment.app), ["İnceleme Çalışıyor"]);

    const dispatchEvent = environment.sentEvents[0];
    assert.ok(dispatchEvent);
    assert.equal(dispatchEvent.command, PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND);
    assert.equal(environment.sentEvents.length, 1);
    const draft = dispatchEvent.payload["draft"] as PatternRoomCaseReviewDispatchDraft | undefined;
    assert.ok(draft);
    assert.equal(draft.roleSlot, "AI2");
    assert.equal(draft.targetSlot, "ai2");
    assert.equal(draft.payload.toSlot, "ai2");
    assert.equal(draft.payload.payload.protocol.protocolKey, "pattern-room-case-review");
    assert.match(draft.payload.payload.text, /\[Case Packet\]/);
    assert.match(draft.payload.payload.text, /"caution":/);
    assert.equal("context" in draft.payload.payload.protocol, false);

    assertSnapshotLocalStateUnchanged(snapshotBeforeSend, runtime.createSnapshot());

    environment.emitHostMessage({
      payload: {
        roleSlot: "AI2",
        success: true,
        targetSlot: "ai2",
        warnings: [],
      },
      type: PATTERN_ROOM_CASE_REVIEW_DISPATCHED_EVENT,
    });
    assertTextIncludes(readTreeText(environment.app), ["AI2 rolüne gönderildi."]);
    assertSnapshotLocalStateUnchanged(snapshotBeforeSend, runtime.createSnapshot());

    environment.emitHostMessage({
      payload: {
        error: "dispatch failed in smoke",
        success: false,
      },
      type: PATTERN_ROOM_CASE_REVIEW_DISPATCH_FAILED_EVENT,
    });
    assertTextIncludes(readTreeText(environment.app), ["Gönderim başarısız."]);
    assertSnapshotLocalStateUnchanged(snapshotBeforeSend, runtime.createSnapshot());

    environment.runPendingTimers(2000);
    assert.deepEqual(environment.sentCommands, [PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND]);
    assert.equal((environment.sentCommands as string[]).includes(PATTERN_ROOM_SAVE_COMMAND), false);
    assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
    runtime.dispose();
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI runs phase 5B local tenth-man debate flow", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    openFocusedView(environment.app, "tenth-man");
    const disabledPrepare = environment.app.querySelector("[data-pattern-prepare-debate='true']");
    assert.ok(disabledPrepare);
    assert.equal(disabledPrepare.disabled, true);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "archive");
    const addArchiveSourceToDebate = environment.app.querySelector(
      "[data-pattern-add-source-debate='source-shadow-comparison']"
    );
    assert.ok(addArchiveSourceToDebate);
    fireEvent(addArchiveSourceToDebate, "click");

    returnToOverview(environment.app);
    openFocusedView(environment.app, "tenth-man");
    assertTextIncludes(readTreeText(environment.app), [
      "Golge karsilastirma gorseli",
      "Yerel Simülasyon",
      "0 / 8",
    ]);

    const prepare = environment.app.querySelector("[data-pattern-prepare-debate='true']");
    assert.ok(prepare);
    assert.equal(prepare.disabled, false);
    fireEvent(prepare, "click");
    assertTextIncludes(readTreeText(environment.app), ["Hazırlık", "Rolleri Ata", "1 / 8"]);

    const assign = environment.app.querySelector("[data-pattern-assign-debate-roles='true']");
    assert.ok(assign);
    fireEvent(assign, "click");
    assertTextIncludes(readTreeText(environment.app), ["Rol atama", "dummy bağlı", "2 / 8"]);

    const start = environment.app.querySelector("[data-pattern-start-debate='true']");
    assert.ok(start);
    fireEvent(start, "click");
    assertTextIncludes(readTreeText(environment.app), ["AI0 araştırmacı açılışı"]);

    for (let index = 0; index < 4; index += 1) {
      const advance = environment.app.querySelector("[data-pattern-advance-debate='true']");
      assert.ok(advance);
      fireEvent(advance, "click");
    }

    assertTextIncludes(readTreeText(environment.app), ["US1 hakem değerlendirmesi"]);

    const complete = environment.app.querySelector("[data-pattern-complete-debate='true']");
    assert.ok(complete);
    fireEvent(complete, "click");
    assertTextIncludes(readTreeText(environment.app), [
      "Local 10. Adam oturumu tamamlandı",
      "8 / 8",
    ]);

    const reflect = environment.app.querySelector("[data-pattern-reflect-debate='true']");
    assert.ok(reflect);
    fireEvent(reflect, "click");

    returnToOverview(environment.app);
    openFocusedView(environment.app, "report");
    assertTextIncludes(readTreeText(environment.app), [
      "10. Adam İzleri",
      "Yerel tartışma özeti",
      "Sonraki Araştırma Notları",
      "10. Adam local oturum özeti",
    ]);

    assert.deepEqual(environment.sentCommands, []);
    assert.deepEqual(environment.sentEvents, []);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});
