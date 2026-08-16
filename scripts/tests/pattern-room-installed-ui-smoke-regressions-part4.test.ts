import { startPatternRoomInstalledUi } from "./pattern-room-installed-ui-smoke.helpers.ts";
import type { FakeElement } from "./forge-room-ui-smoke.helpers.ts";
import {
  assert,
  createMinimalForgeUiEnvironment,
  createRoomInstalledCopy,
  fireEvent,
  readTreeText,
  test,
} from "./forge-room-ui-smoke.helpers.ts";
import { PATTERN_ROOM_DOMAIN_TEST_FIXTURE } from "../../rooms/pattern-room/shared/data/testing/pattern-room-domain.fixture.ts";
import { restoreFromSnapshot } from "../../rooms/pattern-room/shared/state/pattern-room-snapshot.ts";
import {
  PATTERN_ROOM_LOADED_EVENT,
  PATTERN_ROOM_SAVE_COMMAND,
} from "../../rooms/pattern-room/shared/types/pattern-room-persistence.ts";
import {
  PATTERN_ROOM_SNAPSHOT_VERSION,
  type PatternRoomSessionSnapshot,
} from "../../rooms/pattern-room/shared/types/pattern-room-snapshot.ts";

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

function submitLongTextSource(
  app: PatternRoomFakeApp,
  input: {
    title: string;
    origin: string;
    text: string;
    sourceKind?:
      | "book"
      | "article"
      | "newspaper"
      | "religious_text"
      | "archive_text"
      | "personal_note";
    chapter?: string;
    page?: string;
  }
): void {
  const form = app.querySelector("[data-pattern-long-text-source-form='true']");
  const titleInput = app.querySelector("[data-pattern-long-text-source-title='true']");
  const originInput = app.querySelector("[data-pattern-long-text-source-origin='true']");
  const kindSelect = app.querySelector("[data-pattern-long-text-source-kind='true']");
  const chapterInput = app.querySelector("[data-pattern-long-text-source-chapter='true']");
  const pageInput = app.querySelector("[data-pattern-long-text-source-page='true']");
  const textInput = app.querySelector("[data-pattern-long-text-source-text='true']");
  assert.ok(form);
  assert.ok(titleInput);
  assert.ok(originInput);
  assert.ok(kindSelect);
  assert.ok(chapterInput);
  assert.ok(pageInput);
  assert.ok(textInput);

  titleInput.value = input.title;
  originInput.value = input.origin;
  kindSelect.value = input.sourceKind ?? "book";
  chapterInput.value = input.chapter ?? "";
  pageInput.value = input.page ?? "";
  textInput.value = input.text;
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

function submitArchiveSourceEvidence(
  app: PatternRoomFakeApp,
  sourceId: string,
  labelText: string,
  excerptText: string,
  interpretationText: string
): void {
  const evidenceForm = app.querySelector(`[data-pattern-archive-evidence-form='${sourceId}']`);
  const labelInput = app.querySelector(`[data-pattern-archive-evidence-label='${sourceId}']`);
  const excerptInput = app.querySelector(`[data-pattern-archive-evidence-excerpt='${sourceId}']`);
  const interpretationInput = app.querySelector(
    `[data-pattern-archive-evidence-interpretation='${sourceId}']`
  );
  assert.ok(evidenceForm);
  assert.ok(labelInput);
  assert.ok(excerptInput);
  assert.ok(interpretationInput);

  labelInput.value = labelText;
  excerptInput.value = excerptText;
  interpretationInput.value = interpretationText;
  submitForm(evidenceForm);
}

function searchArchiveSource(app: PatternRoomFakeApp, sourceId: string, query: string): void {
  const searchInput = app.querySelector(`[data-pattern-archive-source-search-input='${sourceId}']`);
  assert.ok(searchInput);
  searchInput.value = query;
  fireEvent(searchInput, "input");
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

void test("pattern-room installed UI phase 13F captures manual evidence from source detail", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");
  const confirmMessages: string[] = [];
  const longText =
    "Faz 13F kaynak metni kullanıcı tarafından incelenir ve kart üzerinde kısa önizleme olarak kalır. " +
    "Kanıt pasajı otomatik çıkarılmaz; kullanıcı pasajı manuel olarak forma yazar. " +
    "Bu uzun kaynak metninin saklı kuyruk bölümü sadece detay alanında görünmelidir. SOURCE_DETAIL_SECRET_TAIL";
  const expectedExcerpt = `${longText.replace(/\s+/g, " ").trim().slice(0, 240).trimEnd()}…`;

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    environment.emitHostMessage({
      payload: { snapshot: null },
      type: PATTERN_ROOM_LOADED_EVENT,
    });
    openFocusedView(environment.app, "archive");
    assert.equal(environment.app.querySelector("[data-pattern-archive-evidence-capture]"), null);

    submitLongTextSource(environment.app, {
      title: "Faz 13F uzun kaynak",
      origin: "Manuel kanıt arşivi",
      sourceKind: "archive_text",
      text: longText,
    });
    environment.runPendingTimers(2000);

    const sourceOnlySnapshot = readLatestSavePayload(environment)[
      "snapshot"
    ] as PatternRoomSessionSnapshot;
    assert.equal(sourceOnlySnapshot.schemaVersion, PATTERN_ROOM_SNAPSHOT_VERSION);
    assert.equal(sourceOnlySnapshot.overlay.localAuthoredSources.length, 1);
    assert.deepEqual(sourceOnlySnapshot.overlay.localAuthoredEvidence, []);
    assert.deepEqual(sourceOnlySnapshot.overlay.localAuthoredNodes, []);
    assert.deepEqual(sourceOnlySnapshot.overlay.localAuthoredEdges, []);
    assert.deepEqual(sourceOnlySnapshot.overlay.pinnedSourceIds, []);

    const inspectLongTextSource = environment.app.querySelector(
      "[data-pattern-inspect-source='local-source-001']"
    );
    assert.ok(inspectLongTextSource);
    fireEvent(inspectLongTextSource, "click");

    assert.ok(
      environment.app.querySelector("[data-pattern-archive-evidence-form='local-source-001']")
    );
    assertTextIncludes(readTreeText(environment.app), [
      "Bu kaynaktan kanıt notu oluştur",
      "Bu işlem otomatik analiz yapmaz; seçtiğin pasajı yerel kanıt notu olarak panoya ekler.",
    ]);

    submitArchiveSourceEvidence(environment.app, "local-source-001", "", "Manuel pasaj", "");
    assertTextIncludes(readTreeText(environment.app), ["Kanıt başlığı boş olamaz."]);
    assert.equal(environment.pendingTimerCount(), 0);

    submitArchiveSourceEvidence(environment.app, "local-source-001", "Kaynak pasajı", "", "");
    assertTextIncludes(readTreeText(environment.app), ["Alıntı boş olamaz."]);
    assert.equal(environment.pendingTimerCount(), 0);

    submitArchiveSourceEvidence(
      environment.app,
      "local-source-001",
      "Kaynak pasajı",
      "Kullanıcı tarafından seçilen manuel kanıt pasajı.",
      "Pasajın bağlamı manuel olarak yazıldı."
    );
    assertTextIncludes(readTreeText(environment.app), ["Kanıt notu panoya eklendi."]);
    assert.equal(environment.pendingTimerCount(), 1);

    const preview = environment.app.querySelector(
      "[data-pattern-archive-source-preview='local-source-001']"
    );
    const detailText = environment.app.querySelector(
      "[data-pattern-archive-source-full-text='local-source-001']"
    );
    assert.ok(preview);
    assert.ok(detailText);
    assert.equal(preview.textContent, expectedExcerpt);
    assert.doesNotMatch(preview.textContent, /SOURCE_DETAIL_SECRET_TAIL/);
    assert.equal(detailText.textContent, longText);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "board");
    assert.ok(environment.app.querySelector("[data-pattern-board-pin='local-evidence-001']"));
    assert.equal(
      environment.app.querySelector("[data-pattern-board-pin='local-source-001']"),
      null
    );
    clickBoardPin(environment.app, "local-evidence-001");
    assertTextIncludes(readTreeText(environment.app), [
      "Kaynak pasajı",
      "Kullanıcı tarafından seçilen manuel kanıt pasajı.",
      "Pasajın bağlamı manuel olarak yazıldı.",
      "Faz 13F uzun kaynak",
    ]);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "report");
    const reportText = readTreeText(environment.app);
    assertTextIncludes(reportText, [
      "Kanıt Notları",
      "Kaynak pasajı",
      "Kullanıcı tarafından seçilen manuel kanıt pasajı.",
      "Kaynak: Faz 13F uzun kaynak",
      "Yorum: Pasajın bağlamı manuel olarak yazıldı.",
      "Henüz yerel bağlantı yok.",
    ]);

    environment.runPendingTimers(2000);
    const captureSnapshot = readLatestSavePayload(environment)[
      "snapshot"
    ] as PatternRoomSessionSnapshot;
    assert.equal(captureSnapshot.schemaVersion, PATTERN_ROOM_SNAPSHOT_VERSION);
    assert.equal(captureSnapshot.overlay.localAuthoredEvidence.length, 1);
    assert.equal(captureSnapshot.overlay.localAuthoredEvidence[0]?.sourceId, "local-source-001");
    assert.equal(
      captureSnapshot.overlay.localAuthoredEvidence[0].sourceLabel,
      "Faz 13F uzun kaynak"
    );
    assert.deepEqual(captureSnapshot.overlay.localAuthoredNodes, []);
    assert.deepEqual(captureSnapshot.overlay.localAuthoredEdges, []);
    assert.deepEqual(captureSnapshot.overlay.pinnedSourceIds, []);
    const restored = restoreFromSnapshot(captureSnapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
    assert.ok(restored);
    assert.equal(restored.overlay.localAuthoredEvidence[0]?.sourceId, "local-source-001");
    assert.equal(restored.overlay.localAuthoredEvidence[0].sourceLabel, "Faz 13F uzun kaynak");

    returnToOverview(environment.app);
    openFocusedView(environment.app, "archive");
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
    assert.equal(environment.app.querySelector("[data-pattern-archive-evidence-capture]"), null);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "board");
    assert.equal(
      environment.app.querySelector("[data-pattern-board-pin='local-evidence-001']"),
      null
    );

    environment.runPendingTimers(2000);
    const removedSnapshot = readLatestSavePayload(environment)[
      "snapshot"
    ] as PatternRoomSessionSnapshot;
    assert.deepEqual(removedSnapshot.overlay.localAuthoredSources, []);
    assert.deepEqual(removedSnapshot.overlay.localAuthoredEvidence, []);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI phase 14B-2 prepares manual evidence from a selected source segment", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");
  const longText =
    "Segment bir kanıt pasajı kullanıcı tarafından ayrıca seçilir ve otomatik kanıt üretmez. " +
    "Bu pasaj formu sadece hazırlama butonuyla doldurmalıdır.\n\n" +
    "Segment iki ikinci pasaj olarak kaynak detayında kalır ve tek başına pano kanıtı oluşturmaz.";
  const firstSegmentText = longText.split("\n\n")[0] ?? "";
  const firstSegmentLabel = firstSegmentText.replace(/\s+/g, " ").trim().slice(0, 80);

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    environment.emitHostMessage({
      payload: { snapshot: null },
      type: PATTERN_ROOM_LOADED_EVENT,
    });
    openFocusedView(environment.app, "archive");
    submitLongTextSource(environment.app, {
      title: "Faz 14B-2 segment kaynağı",
      origin: "Segment kanıt arşivi",
      sourceKind: "archive_text",
      text: longText,
    });
    environment.runPendingTimers(2000);

    const sourceOnlySnapshot = readLatestSavePayload(environment)[
      "snapshot"
    ] as PatternRoomSessionSnapshot;
    assert.equal(sourceOnlySnapshot.schemaVersion, PATTERN_ROOM_SNAPSHOT_VERSION);
    assert.deepEqual(sourceOnlySnapshot.overlay.localAuthoredEvidence, []);
    assert.deepEqual(sourceOnlySnapshot.overlay.localAuthoredNodes, []);
    assert.deepEqual(sourceOnlySnapshot.overlay.localAuthoredEdges, []);

    const inspectLongTextSource = environment.app.querySelector(
      "[data-pattern-inspect-source='local-source-001']"
    );
    assert.ok(inspectLongTextSource);
    fireEvent(inspectLongTextSource, "click");

    const firstSegmentButton = environment.app.querySelector(
      "[data-pattern-archive-source-segment='segment-001']"
    );
    const prepareEvidenceButton = environment.app.querySelector(
      "[data-pattern-archive-prepare-segment-evidence='local-source-001']"
    );
    const evidenceForm = environment.app.querySelector(
      "[data-pattern-archive-evidence-form='local-source-001']"
    );
    const labelInput = environment.app.querySelector(
      "[data-pattern-archive-evidence-label='local-source-001']"
    );
    const excerptInput = environment.app.querySelector(
      "[data-pattern-archive-evidence-excerpt='local-source-001']"
    );
    const interpretationInput = environment.app.querySelector(
      "[data-pattern-archive-evidence-interpretation='local-source-001']"
    );
    assert.ok(firstSegmentButton);
    assert.ok(prepareEvidenceButton);
    assert.ok(evidenceForm);
    assert.ok(labelInput);
    assert.ok(excerptInput);
    assert.ok(interpretationInput);
    assert.equal(prepareEvidenceButton.disabled, true);
    assert.ok(
      environment.app.querySelector("[data-pattern-archive-source-search='local-source-001']")
    );

    fireEvent(firstSegmentButton, "click");
    assert.equal(firstSegmentButton.dataset["patternArchiveSourceSegmentSelected"], "true");
    assert.equal(labelInput.value, "");
    assert.equal(excerptInput.value, "");
    assert.equal(interpretationInput.value, "");
    assert.equal(prepareEvidenceButton.disabled, false);
    assert.equal(environment.pendingTimerCount(), 0);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "board");
    assert.equal(
      environment.app.querySelector("[data-pattern-board-pin='local-evidence-001']"),
      null
    );
    assert.equal(
      environment.app.querySelector("[data-pattern-board-pin='local-source-001']"),
      null
    );

    returnToOverview(environment.app);
    openFocusedView(environment.app, "archive");
    const inspectPreparedSource = environment.app.querySelector(
      "[data-pattern-inspect-source='local-source-001']"
    );
    assert.ok(inspectPreparedSource);
    fireEvent(inspectPreparedSource, "click");
    const firstSegmentButtonAfterBoardCheck = environment.app.querySelector(
      "[data-pattern-archive-source-segment='segment-001']"
    );
    const prepareEvidenceButtonAfterBoardCheck = environment.app.querySelector(
      "[data-pattern-archive-prepare-segment-evidence='local-source-001']"
    );
    const evidenceFormAfterBoardCheck = environment.app.querySelector(
      "[data-pattern-archive-evidence-form='local-source-001']"
    );
    const labelInputAfterBoardCheck = environment.app.querySelector(
      "[data-pattern-archive-evidence-label='local-source-001']"
    );
    const excerptInputAfterBoardCheck = environment.app.querySelector(
      "[data-pattern-archive-evidence-excerpt='local-source-001']"
    );
    const interpretationInputAfterBoardCheck = environment.app.querySelector(
      "[data-pattern-archive-evidence-interpretation='local-source-001']"
    );
    assert.ok(firstSegmentButtonAfterBoardCheck);
    assert.ok(prepareEvidenceButtonAfterBoardCheck);
    assert.ok(evidenceFormAfterBoardCheck);
    assert.ok(labelInputAfterBoardCheck);
    assert.ok(excerptInputAfterBoardCheck);
    assert.ok(interpretationInputAfterBoardCheck);

    fireEvent(firstSegmentButtonAfterBoardCheck, "click");
    fireEvent(prepareEvidenceButtonAfterBoardCheck, "click");
    assert.equal(labelInputAfterBoardCheck.value, firstSegmentLabel);
    assert.equal(excerptInputAfterBoardCheck.value, firstSegmentText);
    assert.equal(interpretationInputAfterBoardCheck.value, "");
    assert.equal(environment.pendingTimerCount(), 1);

    labelInputAfterBoardCheck.value = "Düzenlenmiş segment kanıtı";
    excerptInputAfterBoardCheck.value = "Kısaltılmış segment pasajı.";
    interpretationInputAfterBoardCheck.value = "Kullanıcı yorumu sonradan yazıldı.";
    submitForm(evidenceFormAfterBoardCheck);
    assertTextIncludes(readTreeText(environment.app), ["Kanıt notu panoya eklendi."]);
    assert.equal(environment.pendingTimerCount(), 1);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "board");
    assert.ok(environment.app.querySelector("[data-pattern-board-pin='local-evidence-001']"));
    assert.equal(
      environment.app.querySelector("[data-pattern-board-pin='local-source-001']"),
      null
    );
    clickBoardPin(environment.app, "local-evidence-001");
    assertTextIncludes(readTreeText(environment.app), [
      "Düzenlenmiş segment kanıtı",
      "Kısaltılmış segment pasajı.",
      "Kullanıcı yorumu sonradan yazıldı.",
      "Faz 14B-2 segment kaynağı",
    ]);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "report");
    assertTextIncludes(readTreeText(environment.app), [
      "Kanıt Notları",
      "Düzenlenmiş segment kanıtı",
      "Kısaltılmış segment pasajı.",
      "Kaynak: Faz 14B-2 segment kaynağı",
      "Yorum: Kullanıcı yorumu sonradan yazıldı.",
    ]);

    environment.runPendingTimers(2000);
    assert.deepEqual(environment.sentCommands, [
      PATTERN_ROOM_SAVE_COMMAND,
      PATTERN_ROOM_SAVE_COMMAND,
    ]);
    const evidenceSnapshot = readLatestSavePayload(environment)[
      "snapshot"
    ] as PatternRoomSessionSnapshot;
    assert.equal(evidenceSnapshot.schemaVersion, PATTERN_ROOM_SNAPSHOT_VERSION);
    assert.equal(evidenceSnapshot.overlay.localAuthoredEvidence.length, 1);
    assert.equal(
      evidenceSnapshot.overlay.localAuthoredEvidence[0]?.label,
      "Düzenlenmiş segment kanıtı"
    );
    assert.equal(
      evidenceSnapshot.overlay.localAuthoredEvidence[0].excerpt,
      "Kısaltılmış segment pasajı."
    );
    assert.equal(
      evidenceSnapshot.overlay.localAuthoredEvidence[0].interpretation,
      "Kullanıcı yorumu sonradan yazıldı."
    );
    assert.equal(evidenceSnapshot.overlay.localAuthoredEvidence[0].sourceId, "local-source-001");
    assert.equal(
      evidenceSnapshot.overlay.localAuthoredEvidence[0].sourceLabel,
      "Faz 14B-2 segment kaynağı"
    );
    assert.deepEqual(evidenceSnapshot.overlay.localAuthoredNodes, []);
    assert.deepEqual(evidenceSnapshot.overlay.localAuthoredEdges, []);
    assert.deepEqual(evidenceSnapshot.overlay.pinnedSourceIds, []);
    const restored = restoreFromSnapshot(evidenceSnapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
    assert.ok(restored);
    assert.equal(restored.overlay.localAuthoredEvidence[0]?.sourceId, "local-source-001");
    assert.equal(
      restored.overlay.localAuthoredEvidence[0].sourceLabel,
      "Faz 14B-2 segment kaynağı"
    );
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI phase 14B-3 searches source detail locally", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");
  const firstSegmentText =
    "İlk segment alfayol pasajı arama sonucundan seçilir ve otomatik kanıt üretmez.";
  const secondSegmentText =
    "İkinci segment betaiz pasajı ayrı kalır ve ilk sorgu sonucuna karışmamalıdır.";
  const longText = `${firstSegmentText}\n\n${secondSegmentText}`;
  const firstSegmentLabel = firstSegmentText.replace(/\s+/g, " ").trim().slice(0, 80);
  const noMatchQuery = "UI_ONLY_QUERY_14B3";

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    environment.emitHostMessage({
      payload: { snapshot: null },
      type: PATTERN_ROOM_LOADED_EVENT,
    });
    openFocusedView(environment.app, "archive");
    submitLongTextSource(environment.app, {
      title: "Faz 14B-3 aranabilir kaynak",
      origin: "Arama arşivi",
      sourceKind: "archive_text",
      text: longText,
    });
    environment.runPendingTimers(2000);

    const sourceOnlySnapshot = readLatestSavePayload(environment)[
      "snapshot"
    ] as PatternRoomSessionSnapshot;
    assert.equal(sourceOnlySnapshot.schemaVersion, PATTERN_ROOM_SNAPSHOT_VERSION);
    assert.deepEqual(sourceOnlySnapshot.overlay.localAuthoredEvidence, []);
    assert.deepEqual(sourceOnlySnapshot.overlay.localAuthoredNodes, []);
    assert.deepEqual(sourceOnlySnapshot.overlay.localAuthoredEdges, []);
    assert.deepEqual(sourceOnlySnapshot.overlay.pinnedSourceIds, []);

    const inspectLongTextSource = environment.app.querySelector(
      "[data-pattern-inspect-source='local-source-001']"
    );
    assert.ok(inspectLongTextSource);
    fireEvent(inspectLongTextSource, "click");

    const searchInput = environment.app.querySelector(
      "[data-pattern-archive-source-search-input='local-source-001']"
    );
    const searchResults = environment.app.querySelector(
      "[data-pattern-archive-source-search-results='local-source-001']"
    );
    const firstSegmentButton = environment.app.querySelector(
      "[data-pattern-archive-source-segment='segment-001']"
    );
    const secondSegmentButton = environment.app.querySelector(
      "[data-pattern-archive-source-segment='segment-002']"
    );
    assert.ok(searchInput);
    assert.ok(searchResults);
    assert.ok(firstSegmentButton);
    assert.ok(secondSegmentButton);
    assert.equal(searchResults.children.length, 0);
    assert.equal(environment.pendingTimerCount(), 0);

    searchArchiveSource(environment.app, "local-source-001", noMatchQuery);
    assertTextIncludes(readTreeText(environment.app), ["Eşleşme bulunamadı."]);
    assert.equal(environment.pendingTimerCount(), 0);
    environment.runPendingTimers(2000);
    assert.deepEqual(environment.sentCommands, [PATTERN_ROOM_SAVE_COMMAND]);
    assert.equal(JSON.stringify(readLatestSavePayload(environment)).includes(noMatchQuery), false);

    searchArchiveSource(environment.app, "local-source-001", "ALFAYOL");
    const firstSearchResult = environment.app.querySelector(
      "[data-pattern-archive-source-search-result='segment-001']"
    );
    const secondSearchResult = environment.app.querySelector(
      "[data-pattern-archive-source-search-result='segment-002']"
    );
    assert.ok(firstSearchResult);
    assert.equal(secondSearchResult, null);
    assert.equal(firstSearchResult.dataset["patternArchiveSourceSearchMatchCount"], "2");
    assertTextIncludes(readTreeText(environment.app), [
      "Kaynak içinde ara",
      "1 segmentte eşleşme.",
      firstSegmentLabel,
    ]);

    fireEvent(firstSearchResult, "click");
    const selectedSegmentDetail = environment.app.querySelector(
      "[data-pattern-archive-source-segment-detail='local-source-001']"
    );
    const selectedSegmentText = environment.app.querySelector(
      "[data-pattern-archive-source-segment-text='local-source-001']"
    );
    const labelInput = environment.app.querySelector(
      "[data-pattern-archive-evidence-label='local-source-001']"
    );
    const excerptInput = environment.app.querySelector(
      "[data-pattern-archive-evidence-excerpt='local-source-001']"
    );
    assert.ok(selectedSegmentDetail);
    assert.ok(selectedSegmentText);
    assert.ok(labelInput);
    assert.ok(excerptInput);
    assert.equal(selectedSegmentDetail.dataset["patternArchiveSelectedSegment"], "segment-001");
    assert.equal(selectedSegmentText.textContent, firstSegmentText);
    assert.equal(labelInput.value, "");
    assert.equal(excerptInput.value, "");
    assert.equal(environment.pendingTimerCount(), 0);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "board");
    assert.equal(
      environment.app.querySelector("[data-pattern-board-pin='local-evidence-001']"),
      null
    );
    assert.equal(
      environment.app.querySelector("[data-pattern-board-pin='local-source-001']"),
      null
    );

    returnToOverview(environment.app);
    openFocusedView(environment.app, "archive");
    searchArchiveSource(environment.app, "local-source-001", "ALFAYOL");
    const preparedSearchResult = environment.app.querySelector(
      "[data-pattern-archive-source-search-result='segment-001']"
    );
    const prepareEvidenceButton = environment.app.querySelector(
      "[data-pattern-archive-prepare-segment-evidence='local-source-001']"
    );
    const labelInputAfterSearch = environment.app.querySelector(
      "[data-pattern-archive-evidence-label='local-source-001']"
    );
    const excerptInputAfterSearch = environment.app.querySelector(
      "[data-pattern-archive-evidence-excerpt='local-source-001']"
    );
    const interpretationInputAfterSearch = environment.app.querySelector(
      "[data-pattern-archive-evidence-interpretation='local-source-001']"
    );
    const evidenceFormAfterSearch = environment.app.querySelector(
      "[data-pattern-archive-evidence-form='local-source-001']"
    );
    assert.ok(preparedSearchResult);
    assert.ok(prepareEvidenceButton);
    assert.ok(labelInputAfterSearch);
    assert.ok(excerptInputAfterSearch);
    assert.ok(interpretationInputAfterSearch);
    assert.ok(evidenceFormAfterSearch);
    fireEvent(preparedSearchResult, "click");
    fireEvent(prepareEvidenceButton, "click");
    assert.equal(labelInputAfterSearch.value, firstSegmentLabel);
    assert.equal(excerptInputAfterSearch.value, firstSegmentText);
    assert.equal(interpretationInputAfterSearch.value, "");

    labelInputAfterSearch.value = "Arama sonrası kanıt";
    excerptInputAfterSearch.value = "Arama sonucundan kısaltılmış pasaj.";
    interpretationInputAfterSearch.value = "Yorum kullanıcı tarafından yazıldı.";
    submitForm(evidenceFormAfterSearch);
    assertTextIncludes(readTreeText(environment.app), ["Kanıt notu panoya eklendi."]);
    assert.equal(environment.pendingTimerCount(), 1);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "board");
    assert.ok(environment.app.querySelector("[data-pattern-board-pin='local-evidence-001']"));
    assert.equal(
      environment.app.querySelector("[data-pattern-board-pin='local-source-001']"),
      null
    );
    clickBoardPin(environment.app, "local-evidence-001");
    assertTextIncludes(readTreeText(environment.app), [
      "Arama sonrası kanıt",
      "Arama sonucundan kısaltılmış pasaj.",
      "Yorum kullanıcı tarafından yazıldı.",
      "Faz 14B-3 aranabilir kaynak",
    ]);

    environment.runPendingTimers(2000);
    assert.deepEqual(environment.sentCommands, [
      PATTERN_ROOM_SAVE_COMMAND,
      PATTERN_ROOM_SAVE_COMMAND,
    ]);
    const evidenceSnapshot = readLatestSavePayload(environment)[
      "snapshot"
    ] as PatternRoomSessionSnapshot;
    assert.equal(evidenceSnapshot.schemaVersion, PATTERN_ROOM_SNAPSHOT_VERSION);
    assert.equal(evidenceSnapshot.overlay.localAuthoredEvidence.length, 1);
    assert.equal(evidenceSnapshot.overlay.localAuthoredEvidence[0]?.label, "Arama sonrası kanıt");
    assert.equal(
      evidenceSnapshot.overlay.localAuthoredEvidence[0].excerpt,
      "Arama sonucundan kısaltılmış pasaj."
    );
    assert.equal(evidenceSnapshot.overlay.localAuthoredEvidence[0].sourceId, "local-source-001");
    assert.equal(
      evidenceSnapshot.overlay.localAuthoredEvidence[0].sourceLabel,
      "Faz 14B-3 aranabilir kaynak"
    );
    assert.deepEqual(evidenceSnapshot.overlay.localAuthoredNodes, []);
    assert.deepEqual(evidenceSnapshot.overlay.localAuthoredEdges, []);
    assert.deepEqual(evidenceSnapshot.overlay.pinnedSourceIds, []);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI phase 15A renders a read-only deterministic report draft", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");
  const longText =
    "Faz 15A ilk segmenti kaynak detayı ve rapor taslağı için saklanır.\n\n" +
    "Faz 15A ikinci segmenti kaynak metadata sayımı için saklanır.";

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    environment.emitHostMessage({
      payload: { snapshot: null },
      type: PATTERN_ROOM_LOADED_EVENT,
    });

    openFocusedView(environment.app, "report");
    assert.equal(environment.app.querySelector("[data-pattern-local-note-form='true']"), null);
    assertTextIncludes(readTreeText(environment.app), [
      "Kaynak Özeti",
      "Henüz yerel kanıt notu yok.",
      "Henüz yerel bağlantı yok.",
      "Henüz 10. Adam tartışması rapora yansıtılmadı.",
    ]);
    assert.deepEqual(environment.sentCommands, []);
    assert.equal(environment.pendingTimerCount(), 1);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "archive");
    submitLongTextSource(environment.app, {
      title: "Faz 15A uzun kaynak",
      origin: "Faz 15A arşivi",
      sourceKind: "archive_text",
      text: longText,
    });
    environment.runPendingTimers(2000);

    const inspectLongTextSource = environment.app.querySelector(
      "[data-pattern-inspect-source='local-source-001']"
    );
    assert.ok(inspectLongTextSource);
    fireEvent(inspectLongTextSource, "click");
    submitArchiveSourceEvidence(
      environment.app,
      "local-source-001",
      "Faz 15A kanıt",
      "Faz 15A kaynak detayından seçilen pasaj.",
      "Faz 15A kullanıcı yorumu."
    );
    environment.runPendingTimers(2000);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "board");
    submitBoardLocalNode(environment.app, "Faz 15A iddia", "Faz 15A pano notu.");
    submitBoardLocalEdge(
      environment.app,
      "local-node-001",
      "supports",
      "local-evidence-001",
      "Faz 15A bağlantı notu."
    );
    clickBoardPin(environment.app, "local-node-001");
    const addNodeToDebate = environment.app.querySelector(
      "[data-pattern-add-node-debate='local-node-001']"
    );
    assert.ok(addNodeToDebate);
    fireEvent(addNodeToDebate, "click");

    returnToOverview(environment.app);
    openFocusedView(environment.app, "tenth-man");
    const prepareDebate = environment.app.querySelector("[data-pattern-prepare-debate='true']");
    assert.ok(prepareDebate);
    fireEvent(prepareDebate, "click");
    const assignRoles = environment.app.querySelector("[data-pattern-assign-debate-roles='true']");
    assert.ok(assignRoles);
    fireEvent(assignRoles, "click");
    const startDebate = environment.app.querySelector("[data-pattern-start-debate='true']");
    assert.ok(startDebate);
    fireEvent(startDebate, "click");
    for (let index = 0; index < 4; index += 1) {
      const advanceDebate = environment.app.querySelector("[data-pattern-advance-debate='true']");
      assert.ok(advanceDebate);
      fireEvent(advanceDebate, "click");
    }
    const completeDebate = environment.app.querySelector("[data-pattern-complete-debate='true']");
    assert.ok(completeDebate);
    fireEvent(completeDebate, "click");
    environment.runPendingTimers(2000);

    const snapshotBeforeReport = readLatestSavePayload(environment)[
      "snapshot"
    ] as PatternRoomSessionSnapshot;
    const payloadBeforeReport = JSON.stringify(readLatestSavePayload(environment));
    const commandsBeforeReport = [...environment.sentCommands];
    const eventCountBeforeReport = environment.sentEvents.length;
    assert.equal(snapshotBeforeReport.schemaVersion, PATTERN_ROOM_SNAPSHOT_VERSION);
    assert.equal(
      commandsBeforeReport.every((command) => command === PATTERN_ROOM_SAVE_COMMAND),
      true
    );

    returnToOverview(environment.app);
    openFocusedView(environment.app, "report");
    const reportText = readTreeText(environment.app);
    assertTextIncludes(reportText, [
      "Kaynak Özeti",
      "Faz 15A uzun kaynak",
      "Segment: 2",
      "Kanıt Notları",
      "Faz 15A kanıt",
      "Kaynak: Faz 15A uzun kaynak",
      "Yorum: Faz 15A kullanıcı yorumu.",
      "Pano Notları",
      "Faz 15A iddia",
      "Tür: İddia",
      "Yerel Bağlantılar",
      "destekliyor",
      "10. Adam İzleri",
      "Yerel tartışma özeti",
      "Dış üretim çağrısı yapılmadı.",
      "Sonraki Araştırma Notları",
      "Henüz sonraki araştırma notu yok.",
    ]);
    assert.doesNotMatch(
      reportText,
      /kanıtlandı|doğrulandı|kesin sonuç|nihai rapor|AI sonucu|provider|relay/i
    );
    assert.deepEqual(environment.sentCommands, commandsBeforeReport);
    assert.equal(JSON.stringify(readLatestSavePayload(environment)), payloadBeforeReport);
    assert.equal(environment.sentEvents.length, eventCountBeforeReport);
    assert.equal(environment.pendingTimerCount(), 1);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI phase 13C rejects blank long text fields", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    environment.emitHostMessage({
      payload: { snapshot: null },
      type: PATTERN_ROOM_LOADED_EVENT,
    });
    openFocusedView(environment.app, "archive");

    submitLongTextSource(environment.app, {
      title: " ",
      origin: "Arşiv kökeni",
      text: "Geçerli uzun metin.",
    });
    assertTextIncludes(readTreeText(environment.app), ["Başlık boş olamaz."]);
    assert.equal(
      environment.app.querySelector("[data-pattern-archive-source='local-source-001']"),
      null
    );

    submitLongTextSource(environment.app, {
      title: "Boş köken testi",
      origin: " ",
      text: "Geçerli uzun metin.",
    });
    assertTextIncludes(readTreeText(environment.app), ["Kaynak bilgisi boş olamaz."]);
    assert.equal(
      environment.app.querySelector("[data-pattern-archive-source='local-source-001']"),
      null
    );

    submitLongTextSource(environment.app, {
      title: "Boş metin testi",
      origin: "Arşiv kökeni",
      text: " \n\t ",
    });
    assertTextIncludes(readTreeText(environment.app), ["Metin boş olamaz."]);
    assert.equal(
      environment.app.querySelector("[data-pattern-archive-source='local-source-001']"),
      null
    );
    assert.equal(environment.pendingTimerCount(), 1);
    assert.deepEqual(environment.sentCommands, []);
    assert.deepEqual(environment.sentEvents, []);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI phase 12G-A cancels local source removal safely", async () => {
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
      "Kendi Metin Testi",
      "Kaldırma iptali için kullanıcı metni."
    );
    environment.runPendingTimers(2000);

    const removeLocalSource = environment.app.querySelector(
      "[data-pattern-remove-local-source='local-source-001']"
    );
    assert.ok(removeLocalSource);
    assert.equal(
      environment.app.querySelector(
        "[data-pattern-remove-local-source='source-shadow-comparison']"
      ),
      null
    );
    assertTextIncludes(readTreeText(environment.app), ["Kendi Metin Testi", "Kaynağı kaldır"]);

    setWindowConfirm((message) => {
      confirmMessages.push(message);
      return false;
    });
    fireEvent(removeLocalSource, "click");

    assert.deepEqual(confirmMessages, ["Bu yerel kaynak odadan kaldırılacak. Devam edilsin mi?"]);
    assert.ok(environment.app.querySelector("[data-pattern-archive-source='local-source-001']"));
    assert.equal(environment.pendingTimerCount(), 0);
    assert.deepEqual(environment.sentCommands, [PATTERN_ROOM_SAVE_COMMAND]);
    assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI phase 11D imports a mock SourcePackage from the archive demo", async () => {
  const beforeDomain = JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    environment.emitHostMessage({
      payload: { snapshot: null },
      type: PATTERN_ROOM_LOADED_EVENT,
    });
    openFocusedView(environment.app, "archive");

    const importButton = environment.app.querySelector(
      "[data-pattern-import-sample-source-package='true']"
    );
    assert.ok(importButton);
    fireEvent(importButton, "click");

    assert.ok(environment.app.querySelector("[data-pattern-archive-source='local-source-001']"));
    assert.ok(
      environment.app.querySelector("[data-pattern-remove-local-source='local-source-001']")
    );
    assertTextIncludes(readTreeText(environment.app), [
      "Kaynak Atölyesi",
      "Örnek Kaynak Paketini İçe Aktar",
      "Bu ilk sürüm metni kaynak olarak ekler; alıntı ve örüntü çıkarımı daha sonra eklenecek.",
      "Kaynak paketi odaya eklendi: 1 kaynak, 1 kanıt, 1 düğüm.",
      "Saha Defteri Alıntısı",
      "Yerel Kaynak",
    ]);
    assert.equal(environment.pendingTimerCount(), 1);

    environment.runPendingTimers(2000);
    assert.deepEqual(environment.sentCommands, [PATTERN_ROOM_SAVE_COMMAND]);
    const savedSnapshot = readLatestSavePayload(environment)[
      "snapshot"
    ] as PatternRoomSessionSnapshot;
    assert.equal(savedSnapshot.overlay.localAuthoredSources.length, 1);
    assert.equal(savedSnapshot.overlay.localAuthoredEvidence.length, 1);
    assert.equal(savedSnapshot.overlay.localAuthoredNodes.length, 1);
    assert.equal(savedSnapshot.overlay.localAuthoredEdges.length, 1);
    assert.equal(savedSnapshot.overlay.localNotes.length, 1);

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
      "türetildi",
    ]);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "archive");
    const duplicateImportButton = environment.app.querySelector(
      "[data-pattern-import-sample-source-package='true']"
    );
    assert.ok(duplicateImportButton);
    fireEvent(duplicateImportButton, "click");

    assertTextIncludes(readTreeText(environment.app), [
      "Bu kaynak paketi zaten odada kayıtlı görünüyor.",
    ]);
    assert.equal(
      environment.app.querySelectorAll("[data-pattern-archive-source='local-source-001']").length,
      1
    );

    assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});
