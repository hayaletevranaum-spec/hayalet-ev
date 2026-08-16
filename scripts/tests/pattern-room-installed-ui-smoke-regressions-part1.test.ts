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
import { createLocalState } from "../../rooms/pattern-room/shared/state/pattern-room-local-state.ts";
import { createSnapshot } from "../../rooms/pattern-room/shared/state/pattern-room-snapshot.ts";
import type { PatternRoomSessionSnapshot } from "../../rooms/pattern-room/shared/types/pattern-room-snapshot.ts";
import {
  PATTERN_ROOM_LOADED_EVENT,
  PATTERN_ROOM_SAVE_COMMAND,
} from "../../rooms/pattern-room/shared/types/pattern-room-persistence.ts";

const PATTERN_FOCUSED_VIEWS = ["board", "desk", "archive", "tenth-man", "report"] as const;
type PatternFocusedViewId = (typeof PATTERN_FOCUSED_VIEWS)[number];
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

function createHostLoadedSnapshot(
  activeView: PatternFocusedViewId | "overview",
  noteText: string
): PatternRoomSessionSnapshot {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.addLocalNote(noteText);
  return createSnapshot(localState, activeView);
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

void test("pattern-room installed UI renders overview hotspots and returns from focused views", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    assert.equal(environment.readyPayload()?.["roomId"], "pattern-room");
    assert.equal(environment.readyPayload()?.["featureId"], "pattern-workbench");
    assert.ok(environment.app.querySelector("[data-pattern-view='overview']"));
    assert.match(readTreeText(environment.app), /Dünya’nın Şekli/);
    assert.match(readTreeText(environment.app), /İz Sürme Odası/);
    assert.match(readTreeText(environment.app), /Pattern Room/);
    assertTextIncludes(readTreeText(environment.app), [
      "4 kaynak",
      "2 kanıt",
      "3 pano notu",
      "3 bağlantı",
      "0 inceleme",
    ]);
    assert.doesNotMatch(readTreeText(environment.app), /4 iz/);

    const hotspots = environment.app.querySelectorAll("[data-pattern-hotspot]");
    assert.equal(hotspots.length, PATTERN_FOCUSED_VIEWS.length);

    for (const viewId of PATTERN_FOCUSED_VIEWS) {
      const hotspot = environment.app.querySelector(`[data-pattern-hotspot='${viewId}']`);
      assert.ok(hotspot);
      fireEvent(hotspot, "click");
      assert.ok(environment.app.querySelector(`[data-pattern-view='${viewId}']`));
      const focusedText = readTreeText(environment.app);

      if (viewId === "board") {
        assertTextIncludes(focusedText, [
          "Kanıt",
          "Analiz",
          "Yorum",
          "Belirsizlik",
          "Bağlantılar Rapor panelinde Yerel Bağlantılar bölümünde listelenir.",
        ]);
      }

      if (viewId === "archive") {
        assertTextIncludes(focusedText, [
          "Kitap / Metin",
          "Görsel kaynak",
          "Kişisel not",
          "Belirsiz kaynak",
        ]);
      }

      if (viewId === "tenth-man") {
        assertTextIncludes(focusedText, [
          "AI0 — Araştırmacı",
          "AI1 — Savunucu",
          "AI2 — 10. Adam / Karşıt",
          "US1 — Hakem / Uzak kullanıcı",
          "Yerel Simülasyon",
          "0 / 8",
        ]);
      }

      if (viewId === "report") {
        assertTextIncludes(focusedText, [
          "Kaynak Özeti",
          "Kanıt Notları",
          "Pano Notları",
          "Yerel Bağlantılar",
          "10. Adam İzleri",
          "Sonraki Araştırma Notları",
        ]);
      }

      const backButton = environment.app.querySelector("[data-pattern-back='true']");
      assert.ok(backButton);
      fireEvent(backButton, "click");
      assert.ok(environment.app.querySelector("[data-pattern-view='overview']"));
    }

    assert.deepEqual(environment.sentCommands, []);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI keeps workspace navigation persistent and preserves archive search", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    const shell = environment.app.querySelector("[data-pattern-workspace-shell='true']");
    const outlet = environment.app.querySelector("[data-pattern-workspace-outlet='true']");
    const navigationItems = environment.app.querySelectorAll("[data-pattern-workspace-nav]");
    assert.ok(shell);
    assert.ok(outlet);
    assert.equal(navigationItems.length, 6);
    assert.equal(
      environment.app.querySelector("[data-pattern-workspace-nav='overview']")?.dataset[
        "patternWorkspaceNavActive"
      ],
      "true"
    );

    const archiveNavigation = environment.app.querySelector(
      "[data-pattern-workspace-nav='archive']"
    );
    assert.ok(archiveNavigation);
    fireEvent(archiveNavigation, "click");
    assert.equal(environment.app.querySelector("[data-pattern-workspace-shell='true']"), shell);
    assert.equal(environment.app.querySelector("[data-pattern-workspace-outlet='true']"), outlet);
    assert.ok(environment.app.querySelector("[data-pattern-view='archive']"));

    const archiveSearch = environment.app.querySelector("[data-pattern-archive-search='true']");
    assert.ok(archiveSearch);
    archiveSearch.value = "harita";
    fireEvent(archiveSearch, "input");

    const reportNavigation = environment.app.querySelector("[data-pattern-workspace-nav='report']");
    assert.ok(reportNavigation);
    fireEvent(reportNavigation, "click");
    assert.ok(environment.app.querySelector("[data-pattern-view='report']"));

    fireEvent(archiveNavigation, "click");
    assert.ok(environment.app.querySelector("[data-pattern-view='archive']"));
    assert.equal(
      environment.app.querySelector("[data-pattern-archive-search='true']")?.value,
      "harita"
    );
    assert.equal(environment.app.querySelectorAll("[data-pattern-view]").length, 1);
    assert.equal(archiveNavigation.dataset["patternWorkspaceNavActive"], "true");
    assert.deepEqual(environment.sentCommands, []);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI persists canvas mode and contextual selections", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);
    environment.emitHostMessage({
      payload: { snapshot: null },
      type: PATTERN_ROOM_LOADED_EVENT,
    });

    openFocusedView(environment.app, "board");
    const boardItem = environment.app.querySelector(
      "[data-pattern-board-pin='node-shadow-analysis']"
    );
    assert.ok(boardItem);
    fireEvent(boardItem, "click");

    const graphMode = environment.app.querySelector("[data-pattern-investigation-mode='graph']");
    assert.ok(graphMode);
    fireEvent(graphMode, "click");
    const connection = environment.app.querySelector(
      "[data-pattern-connection-edge='edge-navigation-supports-horizon']"
    );
    assert.ok(connection);
    fireEvent(connection, "click");

    assert.equal(environment.pendingTimerCount(), 1);
    environment.runPendingTimers(2000);
    const savedSnapshot = readLatestSavePayload(environment)[
      "snapshot"
    ] as PatternRoomSessionSnapshot;
    assert.deepEqual(savedSnapshot.presentation, {
      canvasMode: "graph",
      selectedBoardItemId: "node-shadow-analysis",
      selectedConnectionId: "edge-navigation-supports-horizon",
    });
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI restores canvas mode and contextual selections", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const snapshot = createSnapshot(localState, "desk", {
    canvasMode: "graph",
    selectedBoardItemId: "node-shadow-analysis",
    selectedConnectionId: "edge-navigation-supports-horizon",
  });

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);
    environment.emitHostMessage({
      payload: { snapshot },
      type: PATTERN_ROOM_LOADED_EVENT,
    });

    assert.ok(environment.app.querySelector("[data-pattern-view='desk']"));
    const inspector = environment.app.querySelector("[data-pattern-workspace-inspector='true']");
    assert.ok(inspector);
    assertTextIncludes(readTreeText(inspector), [
      "Bağlantı detayı",
      "Seyir defteri kaynagi",
      "Ufuk iddiasi",
      "Regression fixture support relation only.",
    ]);

    const boardMode = environment.app.querySelector("[data-pattern-investigation-mode='board']");
    assert.ok(boardMode);
    fireEvent(boardMode, "click");
    assertTextIncludes(readTreeText(inspector), ["Tuval detayı", "Golge acisi analizi"]);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI restores a loaded host snapshot", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");
  const snapshot = createHostLoadedSnapshot("report", "Restored host snapshot note");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    environment.emitHostMessage({
      payload: { snapshot },
      type: PATTERN_ROOM_LOADED_EVENT,
    });

    assert.ok(environment.app.querySelector("[data-pattern-view='report']"));
    assertTextIncludes(readTreeText(environment.app), [
      "Sonraki Araştırma Notları",
      "Restored host snapshot note",
    ]);
    environment.runPendingTimers(2000);
    assert.deepEqual(environment.sentCommands, []);
    assert.deepEqual(environment.sentEvents, []);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI keeps the default state for a null loaded snapshot", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    environment.emitHostMessage({
      payload: { snapshot: null },
      type: PATTERN_ROOM_LOADED_EVENT,
    });

    assert.ok(environment.app.querySelector("[data-pattern-view='overview']"));
    assert.match(readTreeText(environment.app), /Pattern Room/);
    assert.doesNotMatch(readTreeText(environment.app), /Restored host snapshot note/);
    environment.runPendingTimers(2000);
    assert.deepEqual(environment.sentCommands, []);
    assert.deepEqual(environment.sentEvents, []);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI rejects an invalid loaded snapshot without breaking state", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    environment.emitHostMessage({
      payload: {
        snapshot: {
          activeView: "report",
          roomId: "pattern-room",
          schemaVersion: -1,
          topicId: PATTERN_ROOM_DOMAIN_TEST_FIXTURE.topic.id,
        },
      },
      type: PATTERN_ROOM_LOADED_EVENT,
    });

    assert.ok(environment.app.querySelector("[data-pattern-view='overview']"));
    assert.match(readTreeText(environment.app), /Pattern Room/);
    assert.doesNotMatch(readTreeText(environment.app), /Restored host snapshot note/);
    assert.deepEqual(environment.sentCommands, []);
    assert.deepEqual(environment.sentEvents, []);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI does not autosave local mutations before host load completes", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    openFocusedView(environment.app, "board");
    submitBoardLocalNode(environment.app, "Mutation before loaded event", "Pano mutation");
    environment.runPendingTimers(2000);

    assert.equal(environment.pendingTimerCount(), 0);
    assert.deepEqual(environment.sentCommands, []);
    assert.deepEqual(environment.sentEvents, []);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI debounces autosave after a null host load", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    environment.emitHostMessage({
      payload: { snapshot: null },
      type: PATTERN_ROOM_LOADED_EVENT,
    });
    openFocusedView(environment.app, "board");
    submitBoardLocalNode(environment.app, "Autosaved after null load", "Pano autosave");

    assert.equal(environment.pendingTimerCount(), 1);
    environment.runPendingTimers(1999);
    assert.deepEqual(environment.sentCommands, []);

    environment.runPendingTimers(2000);
    assert.deepEqual(environment.sentCommands, [PATTERN_ROOM_SAVE_COMMAND]);
    const payload = readLatestSavePayload(environment);
    assert.equal(payload["flush"], undefined);
    assertSavePayloadIncludesLocalNode(payload, "Autosaved after null load");
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI autosaves only user mutations after restoring a snapshot", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");
  const snapshot = createHostLoadedSnapshot("report", "Restored snapshot suppresses autosave");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    environment.emitHostMessage({
      payload: { snapshot },
      type: PATTERN_ROOM_LOADED_EVENT,
    });
    environment.runPendingTimers(2000);
    assert.deepEqual(environment.sentCommands, []);

    returnToOverview(environment.app);
    openFocusedView(environment.app, "board");
    submitBoardLocalNode(
      environment.app,
      "Mutation after restored snapshot",
      "Pano restored mutation"
    );
    environment.runPendingTimers(2000);

    assert.deepEqual(environment.sentCommands, [PATTERN_ROOM_SAVE_COMMAND]);
    const payload = readLatestSavePayload(environment);
    const savedSnapshot = assertSavePayloadIncludesLocalNode(
      payload,
      "Mutation after restored snapshot"
    );
    assert.equal(savedSnapshot.activeView, "board");
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI exposes a persistent three-region workspace shell", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    const shell = environment.app.querySelector("[data-pattern-workspace-shell='true']");
    const spine = environment.app.querySelector("[data-pattern-workspace-spine='true']");
    const canvas = environment.app.querySelector("[data-pattern-workspace-canvas='true']");
    const outlet = environment.app.querySelector("[data-pattern-workspace-outlet='true']");
    const inspector = environment.app.querySelector("[data-pattern-workspace-inspector='true']");
    assert.ok(shell);
    assert.ok(spine);
    assert.ok(canvas);
    assert.ok(outlet);
    assert.ok(inspector);
    assert.equal(inspector.dataset["patternWorkspaceInspectorView"], "overview");
    assert.match(readTreeText(inspector), /Vaka Merkezi|Case Hub/);

    const archiveNavigation = environment.app.querySelector(
      "[data-pattern-workspace-nav='archive']"
    );
    assert.ok(archiveNavigation);
    fireEvent(archiveNavigation, "click");
    assert.equal(environment.app.querySelector("[data-pattern-workspace-spine='true']"), spine);
    assert.equal(environment.app.querySelector("[data-pattern-workspace-canvas='true']"), canvas);
    assert.equal(
      environment.app.querySelector("[data-pattern-workspace-inspector='true']"),
      inspector
    );
    assert.equal(inspector.dataset["patternWorkspaceInspectorView"], "archive");
    assert.match(readTreeText(inspector), /Arşiv|Archive/);
    assert.ok(environment.app.querySelector("[data-pattern-view='archive']"));

    const reportNavigation = environment.app.querySelector("[data-pattern-workspace-nav='report']");
    assert.ok(reportNavigation);
    fireEvent(reportNavigation, "click");
    assert.equal(inspector.dataset["patternWorkspaceInspectorView"], "report");
    assert.match(readTreeText(inspector), /Rapor|Report/);
    assert.ok(environment.app.querySelector("[data-pattern-view='report']"));
    assert.deepEqual(environment.sentCommands, []);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI switches board and graph inside one investigation canvas", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    const boardNavigation = environment.app.querySelector("[data-pattern-workspace-nav='board']");
    assert.ok(boardNavigation);
    fireEvent(boardNavigation, "click");

    const canvas = environment.app.querySelector("[data-pattern-investigation-canvas='true']");
    const boardMode = environment.app.querySelector("[data-pattern-investigation-mode='board']");
    const graphMode = environment.app.querySelector("[data-pattern-investigation-mode='graph']");
    assert.ok(canvas);
    assert.ok(boardMode);
    assert.ok(graphMode);
    assert.equal(canvas.dataset["patternInvestigationActiveMode"], "board");
    assert.ok(environment.app.querySelector("[data-pattern-view='board']"));
    assert.ok(environment.app.querySelector("[data-pattern-board-pin]"));

    fireEvent(graphMode, "click");
    assert.equal(canvas.dataset["patternInvestigationActiveMode"], "graph");
    assert.ok(environment.app.querySelector("[data-pattern-view='desk']"));
    assert.ok(environment.app.querySelector("[data-pattern-connection-map='true']"));
    assert.equal(boardNavigation.dataset["patternWorkspaceNavActive"], "true");

    fireEvent(boardMode, "click");
    assert.equal(canvas.dataset["patternInvestigationActiveMode"], "board");
    assert.ok(environment.app.querySelector("[data-pattern-view='board']"));
    assert.ok(environment.app.querySelector("[data-pattern-board-pin]"));
    assert.equal(environment.app.querySelectorAll("[data-pattern-view]").length, 1);
    assert.deepEqual(environment.sentCommands, []);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});

void test("pattern-room installed UI moves investigation details and tools into the persistent inspector", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("pattern-room");

  try {
    await startPatternRoomInstalledUi(installedCopy.rootDir);

    const inspector = environment.app.querySelector("[data-pattern-workspace-inspector='true']");
    const canvas = environment.app.querySelector("[data-pattern-workspace-canvas='true']");
    const boardNavigation = environment.app.querySelector("[data-pattern-workspace-nav='board']");
    assert.ok(inspector);
    assert.ok(canvas);
    assert.ok(boardNavigation);

    fireEvent(boardNavigation, "click");
    const boardPin = environment.app.querySelector(
      "[data-pattern-board-pin='node-navigation-source']"
    );
    assert.ok(boardPin);
    fireEvent(boardPin, "click");

    assert.equal(
      environment.app.querySelector("[data-pattern-workspace-inspector='true']"),
      inspector
    );
    assert.ok(inspector.querySelector("[data-pattern-board-detail='true']"));
    assert.ok(inspector.querySelector("[data-pattern-send-to-desk='node-navigation-source']"));
    assert.ok(inspector.querySelector("[data-pattern-author-node-form='true']"));
    assert.equal(canvas.querySelector("[data-pattern-board-detail='true']"), null);
    assert.equal(canvas.querySelector("[data-pattern-author-node-form='true']"), null);

    const graphMode = environment.app.querySelector("[data-pattern-investigation-mode='graph']");
    assert.ok(graphMode);
    fireEvent(graphMode, "click");

    assert.equal(
      environment.app.querySelector("[data-pattern-workspace-inspector='true']"),
      inspector
    );
    assert.equal(
      inspector.querySelector("[data-pattern-investigation-inspector-mode='graph']")?.dataset[
        "patternInvestigationInspectorMode"
      ],
      "graph"
    );
    assert.ok(inspector.querySelector("[data-pattern-author-edge-form='true']"));
    assert.equal(canvas.querySelector("[data-pattern-author-edge-form='true']"), null);
    assert.deepEqual(environment.sentCommands, []);
  } finally {
    environment.restore();
    await installedCopy.cleanup();
  }
});
