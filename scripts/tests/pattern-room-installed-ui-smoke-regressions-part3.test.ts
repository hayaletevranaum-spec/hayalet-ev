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
import { adaptDomainToViewModels } from "../../rooms/pattern-room/shared/adapters/pattern-room-view-adapters.ts";
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
import { createArchivePanel } from "../../rooms/pattern-room/ui/panels/pattern-archive-panel.ts";
import type { PatternPanelActions } from "../../rooms/pattern-room/shared/types/pattern-room.ts";

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

function searchArchiveSource(app: PatternRoomFakeApp, sourceId: string, query: string): void {
  const searchInput = app.querySelector(`[data-pattern-archive-source-search-input='${sourceId}']`);
  assert.ok(searchInput);
  searchInput.value = query;
  fireEvent(searchInput, "input");
}

function readLatestSavePayload(
  environment: ReturnType<typeof createMinimalForgeUiEnvironment>
): Record<string, unknown> {
  const event = environment.sentEvents[environment.sentEvents.length - 1];
  assert.ok(event);
  assert.equal(event.command, PATTERN_ROOM_SAVE_COMMAND);
  return event.payload;
}

void test("pattern-room installed UI phase 8B board connection form reaches report only", async () => {
  const beforeDomain = JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    openFocusedView(environment.app, "board");

    const initialPinCount = environment.app.querySelectorAll("[data-pattern-board-pin]").length;
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
    sourceSelect.value = "node-navigation-source";
    edgeTypeSelect.value = "supports";
    targetSelect.value = "node-navigation-source";
    submitForm(edgeForm);
    assert.equal(
      environment.app.querySelectorAll("[data-pattern-board-pin]").length,
      initialPinCount
    );

    sourceSelect.value = "node-navigation-source";
    edgeTypeSelect.value = "supports";
    targetSelect.value = "source-shadow-comparison";
    noteInput.value = "DOM smoke connection note.";
    submitForm(edgeForm);
    assert.equal(
      environment.app.querySelectorAll("[data-pattern-board-pin]").length,
      initialPinCount
    );

    returnToOverview(environment.app);
    openFocusedView(environment.app, "report");
    assertTextIncludes(readTreeText(environment.app), [
      "Yerel Bağlantılar",
      "Seyir defteri kaynagi",
      "destekliyor",
      "Golge karsilastirma gorseli",
    ]);

    assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
    assert.deepEqual(environment.sentCommands, []);
    assert.deepEqual(environment.sentEvents, []);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI phase 7C archive source authoring form submits local sources", async () => {
  const beforeDomain = JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    openFocusedView(environment.app, "archive");

    const sourceForm = environment.app.querySelector("[data-pattern-author-source-form='true']");
    const labelInput = environment.app.querySelector("[data-pattern-author-source-label='true']");
    const originInput = environment.app.querySelector("[data-pattern-author-source-origin='true']");
    const noteInput = environment.app.querySelector("[data-pattern-author-source-note='true']");
    assert.ok(sourceForm);
    assert.ok(labelInput);
    assert.ok(originInput);
    assert.ok(noteInput);

    installFormReset(sourceForm);
    labelInput.value = "Faz 7C kaynak";
    originInput.value = "DOM smoke defteri";
    noteInput.value = "Archive formundan eklenen local kaynak.";
    submitForm(sourceForm);

    assertTextIncludes(readTreeText(environment.app), [
      "Faz 7C kaynak",
      "Yerel Kaynak",
      "Archive formundan eklenen local kaynak.",
    ]);

    assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
    assert.deepEqual(environment.sentCommands, []);
    assert.deepEqual(environment.sentEvents, []);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI phase 12D imports pasted user text through the source producer", async () => {
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
    submitUserTextSource(
      environment.app,
      "Faz 12D kullanıcı metni",
      "Kullanıcının yapıştırdığı metin kaynak producer hattından gelir."
    );

    assert.ok(environment.app.querySelector("[data-pattern-archive-source='local-source-001']"));
    assertTextIncludes(readTreeText(environment.app), [
      "Kaynak Atölyesi",
      "Bu ilk sürüm metni kaynak olarak ekler; alıntı ve örüntü çıkarımı daha sonra eklenecek.",
      "Metin kaynak olarak odaya eklendi: 1 kaynak, 0 kanıt, 0 düğüm.",
      "Faz 12D kullanıcı metni",
      "Yerel Kaynak",
      "Kullanıcının yapıştırdığı metin kaynak producer hattından gelir.",
    ]);
    assert.equal(environment.pendingTimerCount(), 1);

    const inspectUserTextSource = environment.app.querySelector(
      "[data-pattern-inspect-source='local-source-001']"
    );
    assert.ok(inspectUserTextSource);
    fireEvent(inspectUserTextSource, "click");
    assert.equal(
      environment.app.querySelector("[data-pattern-archive-source-segments='local-source-001']"),
      null
    );
    assert.ok(
      environment.app.querySelector("[data-pattern-archive-source-search='local-source-001']")
    );
    searchArchiveSource(environment.app, "local-source-001", "PRODUCER HATTINDAN");
    assertTextIncludes(readTreeText(environment.app), ["Tam metinde eşleşme bulundu."]);
    assert.equal(environment.pendingTimerCount(), 1);
    searchArchiveSource(environment.app, "local-source-001", "bulunmayan-kisa-kaynak-sorgusu");
    assertTextIncludes(readTreeText(environment.app), ["Eşleşme bulunamadı."]);
    assert.equal(environment.pendingTimerCount(), 1);

    environment.runPendingTimers(2000);
    assert.deepEqual(environment.sentCommands, [PATTERN_ROOM_SAVE_COMMAND]);
    const savedSnapshot = readLatestSavePayload(environment)[
      "snapshot"
    ] as PatternRoomSessionSnapshot;
    assert.equal(savedSnapshot.overlay.localAuthoredSources.length, 1);
    assert.equal(savedSnapshot.overlay.localAuthoredSources[0]?.label, "Faz 12D kullanıcı metni");
    assert.equal(savedSnapshot.overlay.localAuthoredSources[0].origin, "Kullanıcı metni");
    assert.equal(
      savedSnapshot.overlay.localAuthoredSources[0].note,
      "Kullanıcının yapıştırdığı metin kaynak producer hattından gelir."
    );
    assert.deepEqual(savedSnapshot.overlay.localAuthoredEvidence, []);
    assert.deepEqual(savedSnapshot.overlay.localAuthoredNodes, []);
    assert.deepEqual(savedSnapshot.overlay.pinnedSourceIds, []);
    assert.deepEqual(savedSnapshot.overlay.sourcePinnedLayerById, {});

    submitUserTextSource(
      environment.app,
      "Faz 12D kullanıcı metni",
      "Kullanıcının yapıştırdığı metin kaynak producer hattından gelir."
    );
    assertTextIncludes(readTreeText(environment.app), ["Bu metin zaten odada kayıtlı görünüyor."]);
    assert.equal(
      environment.app.querySelectorAll("[data-pattern-archive-source='local-source-001']").length,
      1
    );
    assert.equal(environment.pendingTimerCount(), 0);
    assert.deepEqual(environment.sentCommands, [PATTERN_ROOM_SAVE_COMMAND]);

    assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI phase 12D derives a source title from untitled user text", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    openFocusedView(environment.app, "archive");
    submitUserTextSource(
      environment.app,
      "",
      "Başlıksız metnin ilk satırı başlık olur.\nİkinci satır kaynak notunda kalır."
    );

    assertTextIncludes(readTreeText(environment.app), [
      "Başlıksız metnin ilk satırı başlık olur.",
      "Metin kaynak olarak odaya eklendi: 1 kaynak, 0 kanıt, 0 düğüm.",
    ]);
    assert.ok(environment.app.querySelector("[data-pattern-archive-source='local-source-001']"));
    assert.deepEqual(environment.sentCommands, []);
    assert.deepEqual(environment.sentEvents, []);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI phase 12D rejects blank pasted user text", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    environment.emitHostMessage({
      payload: { snapshot: null },
      type: PATTERN_ROOM_LOADED_EVENT,
    });
    openFocusedView(environment.app, "archive");
    submitUserTextSource(environment.app, "Boş kaynak", " \n\t ");

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

void test("pattern-room installed UI phase 13C imports long text as a source only", async () => {
  const beforeDomain = JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");
  const longText =
    "Birinci bölüm uzun arşiv metninin ilk parçasıdır. Bu parça yalnızca kaynak gövdesinde tutulur. Kart görünümü bu metnin tamamını basmamalı; çünkü kaynak kartı arşivde kompakt kalmalı, çalışma yüzeyini uzatmamalı ve yalnızca kısa bir önizleme göstermelidir.\n\n" +
    "İkinci bölüm segment sayısını görünür kılar. Bu aşamada alıntı veya örüntü çıkarımı yapılmaz. TAM_METIN_GIZLI_KUYRUK";
  const segmentTexts = longText.split("\n\n");
  const firstSegmentText = segmentTexts[0] ?? "";
  const secondSegmentText = segmentTexts[1] ?? "";
  const expectedExcerpt = `${longText.replace(/\s+/g, " ").trim().slice(0, 240).trimEnd()}…`;

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    environment.emitHostMessage({
      payload: { snapshot: null },
      type: PATTERN_ROOM_LOADED_EVENT,
    });
    openFocusedView(environment.app, "archive");

    assert.ok(environment.app.querySelector("[data-pattern-long-text-source-form='true']"));
    assertTextIncludes(readTreeText(environment.app), [
      "Uzun Metin / Kitap / Arşiv Ekle",
      "Bu aşamada metin yalnızca kaynak olarak eklenir; alıntı ve örüntü çıkarımı daha sonra yapılır.",
    ]);

    submitLongTextSource(environment.app, {
      title: "Faz 13C uzun metin",
      origin: "Makale arşivi",
      sourceKind: "article",
      chapter: "Bölüm I",
      page: "s. 12-13",
      text: longText,
    });

    assert.ok(environment.app.querySelector("[data-pattern-archive-source='local-source-001']"));
    assertTextIncludes(readTreeText(environment.app), [
      "Uzun metin kaynak olarak eklendi: 2 segment.",
      "Faz 13C uzun metin",
      "Yerel Kaynak",
      expectedExcerpt,
    ]);
    const archiveText = readTreeText(environment.app);
    assert.equal(archiveText.includes(longText), false);
    assert.doesNotMatch(archiveText, /TAM_METIN_GIZLI_KUYRUK/);
    assertTextIncludes(archiveText, ["Kaynak Detayı", "Bir kaynak seç"]);
    assert.equal(environment.pendingTimerCount(), 1);

    const preview = environment.app.querySelector(
      "[data-pattern-archive-source-preview='local-source-001']"
    );
    const inspectLongTextSource = environment.app.querySelector(
      "[data-pattern-inspect-source='local-source-001']"
    );
    assert.ok(preview);
    assert.ok(inspectLongTextSource);
    assert.equal(preview.textContent, expectedExcerpt);
    assert.doesNotMatch(preview.textContent, /TAM_METIN_GIZLI_KUYRUK/);
    fireEvent(inspectLongTextSource, "click");

    const detailText = environment.app.querySelector(
      "[data-pattern-archive-source-full-text='local-source-001']"
    );
    assert.ok(detailText);
    assert.equal(detailText.textContent, longText);
    assertTextIncludes(readTreeText(environment.app), [
      "Kaynak Detayı",
      "Faz 13C uzun metin",
      "Tür: Yerel Kaynak",
      "Köken: Makale arşivi",
      "Durum: local",
      "Segmentler",
      "Birinci bölüm uzun arşiv metninin ilk parçasıdır.",
      "İkinci bölüm segment sayısını görünür kılar.",
      "TAM_METIN_GIZLI_KUYRUK",
    ]);
    const firstSegmentButton = environment.app.querySelector(
      "[data-pattern-archive-source-segment='segment-001']"
    );
    const secondSegmentButton = environment.app.querySelector(
      "[data-pattern-archive-source-segment='segment-002']"
    );
    const selectedSegmentText = environment.app.querySelector(
      "[data-pattern-archive-source-segment-text='local-source-001']"
    );
    const selectedSegmentDetail = environment.app.querySelector(
      "[data-pattern-archive-source-segment-detail='local-source-001']"
    );
    assert.ok(firstSegmentButton);
    assert.ok(secondSegmentButton);
    assert.ok(selectedSegmentText);
    assert.ok(selectedSegmentDetail);
    fireEvent(firstSegmentButton, "click");
    assert.equal(firstSegmentButton.dataset["patternArchiveSourceSegmentSelected"], "true");
    assert.equal(secondSegmentButton.dataset["patternArchiveSourceSegmentSelected"], "false");
    assert.equal(selectedSegmentDetail.dataset["patternArchiveSelectedSegment"], "segment-001");
    assert.equal(selectedSegmentText.textContent, firstSegmentText);
    assert.equal(environment.pendingTimerCount(), 1);
    fireEvent(secondSegmentButton, "click");
    assert.equal(firstSegmentButton.dataset["patternArchiveSourceSegmentSelected"], "false");
    assert.equal(secondSegmentButton.dataset["patternArchiveSourceSegmentSelected"], "true");
    assert.equal(selectedSegmentDetail.dataset["patternArchiveSelectedSegment"], "segment-002");
    assert.equal(selectedSegmentText.textContent, secondSegmentText);
    assert.equal(environment.pendingTimerCount(), 1);
    const selectedCard = environment.app.querySelector(
      "[data-pattern-archive-source='local-source-001']"
    );
    assert.ok(selectedCard);
    assert.equal(selectedCard.dataset["patternArchiveSourceSelected"], "true");
    assert.equal(environment.pendingTimerCount(), 1);

    environment.runPendingTimers(2000);
    assert.deepEqual(environment.sentCommands, [PATTERN_ROOM_SAVE_COMMAND]);
    const savedSnapshot = readLatestSavePayload(environment)[
      "snapshot"
    ] as PatternRoomSessionSnapshot;
    assert.equal(savedSnapshot.schemaVersion, PATTERN_ROOM_SNAPSHOT_VERSION);
    assert.equal(savedSnapshot.overlay.localAuthoredSources.length, 1);
    assert.equal(savedSnapshot.overlay.localAuthoredSources[0]?.label, "Faz 13C uzun metin");
    assert.equal(savedSnapshot.overlay.localAuthoredSources[0].origin, "Makale arşivi");
    assert.equal(savedSnapshot.overlay.localAuthoredSources[0].note, longText);
    assert.deepEqual(
      savedSnapshot.overlay.localAuthoredSources[0].segments?.map((segment) => {
        return segment.id;
      }),
      ["segment-001", "segment-002"]
    );
    assert.deepEqual(savedSnapshot.overlay.localAuthoredEvidence, []);
    assert.deepEqual(savedSnapshot.overlay.localAuthoredNodes, []);
    assert.deepEqual(savedSnapshot.overlay.localAuthoredEdges, []);
    assert.deepEqual(savedSnapshot.overlay.pinnedSourceIds, []);
    assert.deepEqual(savedSnapshot.overlay.sourcePinnedLayerById, {});
    const restored = restoreFromSnapshot(savedSnapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
    assert.ok(restored);
    assert.equal(restored.overlay.localAuthoredSources[0]?.label, "Faz 13C uzun metin");

    returnToOverview(environment.app);
    openFocusedView(environment.app, "board");
    assert.equal(
      environment.app.querySelector("[data-pattern-board-pin='local-source-001']"),
      null
    );

    returnToOverview(environment.app);
    openFocusedView(environment.app, "report");
    const reportText = readTreeText(environment.app);
    assertTextIncludes(reportText, [
      "Kaynak Özeti",
      "Faz 13C uzun metin",
      "Segment: 2",
      "Henüz yerel kanıt notu yok.",
      "Henüz yerel bağlantı yok.",
    ]);
    assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room archive source card renders compact preview metadata when provided", () => {
  const environment = createMinimalForgeUiEnvironment();

  try {
    const data = adaptDomainToViewModels(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
    data.sources = [
      {
        id: "local-source-meta",
        label: "Deneme",
        sourceTypeLabel: "Yerel Kaynak",
        origin: "Test",
        status: "local",
        note: "Tam içerik state tarafında korunur; kart yalnızca kısa önizlemeyi gösterir.",
        notePreview: "Tam içerik state tarafında korunur…",
        metadataLine: "Segment: 1 · Karakter: 640",
        isLocal: true,
      },
    ];

    const panel = createArchivePanel(data, {} as PatternPanelActions, () => {});
    environment.app.append(panel as unknown as PatternRoomFakeApp);

    assert.ok(
      environment.app.querySelector("[data-pattern-archive-source-preview='local-source-meta']")
    );
    assert.ok(
      environment.app.querySelector("[data-pattern-archive-source-meta='local-source-meta']")
    );
    assertTextIncludes(readTreeText(environment.app), [
      "Deneme",
      "Yerel Kaynak",
      "Test",
      "Tam içerik state tarafında korunur…",
      "Segment: 1 · Karakter: 640",
    ]);
  } finally {
    environment.restore();
  }
});

void test("pattern-room graph connection selection edits local edge details", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);
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
    sourceSelect.value = "node-navigation-source";
    edgeTypeSelect.value = "supports";
    targetSelect.value = "source-shadow-comparison";
    noteInput.value = "İlk ilişki notu.";
    submitForm(edgeForm);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "desk");
    const connectionButton = environment.app.querySelector(
      "[data-pattern-connection-edge='local-edge-001']"
    );
    assert.ok(connectionButton);
    fireEvent(connectionButton, "click");
    assert.equal(connectionButton.getAttribute("aria-pressed"), "true");
    assertTextIncludes(readTreeText(environment.app), [
      "Bağlantı detayı",
      "Seyir defteri kaynagi",
      "destekliyor",
      "Golge karsilastirma gorseli",
    ]);

    const editForm = environment.app.querySelector(
      "[data-pattern-edit-edge-form='local-edge-001']"
    );
    const editType = environment.app.querySelector(
      "[data-pattern-edit-edge-type='local-edge-001']"
    );
    const editNote = environment.app.querySelector(
      "[data-pattern-edit-edge-note='local-edge-001']"
    );
    assert.ok(editForm);
    assert.ok(editType);
    assert.ok(editNote);
    editType.value = "contradicts";
    editNote.value = "Güncellenmiş ilişki notu.";
    submitForm(editForm);

    assertTextIncludes(readTreeText(environment.app), [
      "Yerel bağlantı güncellendi.",
      "çelişiyor",
    ]);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "report");
    assertTextIncludes(readTreeText(environment.app), [
      "Yerel Bağlantılar",
      "çelişiyor",
      "Not: Güncellenmiş ilişki notu.",
    ]);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});
