import {
  assert,
  createLabEventBus,
  createLabRunController,
  createLabStore,
  FakeActionElement,
  FakeControllerDocument,
  installTimerMock,
  LAB_USER_ACTION_HUB_SUCCESS_WINDOW_MS,
  test
} from "./laboratory-runtime-truth.helpers.ts";
import { closeLabAssetMenusForClick } from "../../rooms/laboratory/runtime/controller/lab-asset-context-menu-controller.ts";

void test("laboratory run controller dismisses successful user actions from the topbar after the success window", () => {
  const timerMock = installTimerMock();

  try {
    const eventBus = createLabEventBus();
    const store = createLabStore();
    eventBus.subscribe(function (event) {
      store.dispatch(event);
    });
    createLabRunController({
      documentRef: {} as Document,
      eventBus,
      store,
      windowRef: {} as Window,
    });

    eventBus.emit({
      type: "user-action-added",
      actionEvent: {
        id: "user-action-success",
        type: "export-clip",
        label: "Klip çıkarılıyor",
        status: "running",
        startedAt: Date.now() - 1000,
        dismissedFromHubAt: null,
        projectId: "project-1",
        requestId: "req-export-1",
        sourceAction: "export-timeline-clip",
      },
    });

    assert.equal(timerMock.scheduled.length, 0);

    eventBus.emit({
      type: "user-action-updated",
      id: "user-action-success",
      patch: {
        status: "success",
        finishedAt: Date.now(),
        message: "Klip hazır",
      },
    });

    assert.equal(timerMock.scheduled.length, 1);
    assert.equal(timerMock.scheduled[0]?.delay, LAB_USER_ACTION_HUB_SUCCESS_WINDOW_MS);
    assert.equal(store.getState().userActions[0]?.dismissedFromHubAt, null);

    timerMock.scheduled[0].fn();

    assert.equal(typeof store.getState().userActions[0]?.dismissedFromHubAt, "number");
  } finally {
    timerMock.restore();
  }
});

void test("laboratory run controller waits for linked assets before dismissing success chips", () => {
  const timerMock = installTimerMock();

  try {
    const eventBus = createLabEventBus();
    const store = createLabStore();
    eventBus.subscribe(function (event) {
      store.dispatch(event);
    });
    createLabRunController({
      documentRef: {} as Document,
      eventBus,
      store,
      windowRef: {} as Window,
    });

    eventBus.emit({
      type: "user-action-added",
      actionEvent: {
        id: "user-action-success-pending-output",
        type: "grab-frame",
        label: "Frame alınıyor",
        status: "success",
        startedAt: Date.now() - 3000,
        finishedAt: Date.now() - 1000,
        message: "Frame alındı",
        requestId: "req-frame-success",
        resultAssetIds: ["asset-frame-result"],
        sourceAction: "export-frame-grab",
      },
    });

    assert.equal(timerMock.scheduled.length, 0);

    eventBus.emit({
      type: "asset-added",
      asset: {
        id: "asset-frame-result",
        type: "frame",
        name: "frame_01.png",
        localPath: "/tmp/frame_01.png",
        createdAt: Date.now(),
      },
    });

    assert.equal(timerMock.scheduled.length, 1);
    assert.equal(timerMock.scheduled[0]?.delay, LAB_USER_ACTION_HUB_SUCCESS_WINDOW_MS);
  } finally {
    timerMock.restore();
  }
});

void test("laboratory report overlay export buttons send host export actions without webview electron api", () => {
  const originalElement = globalThis.Element;
  const sentEvents: Array<{ eventName: string; payload: Record<string, unknown> }> = [];
  const documentRef = new FakeControllerDocument();
  const eventBus = createLabEventBus();
  const store = createLabStore();

  class TestElement extends FakeActionElement {}

  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: TestElement,
  });

  try {
    eventBus.subscribe(function (event) {
      store.dispatch(event);
    });

    const controller = createLabRunController({
      documentRef: documentRef as unknown as Document,
      eventBus,
      store,
      windowRef: {
        roomAPI: {
          sendEvent(eventName: string, payload: Record<string, unknown>) {
            sentEvents.push({ eventName, payload });
          },
        },
        addEventListener() {},
      } as unknown as Window,
    });
    controller.attach();

    const clickListener = documentRef.listeners.get("click");
    assert.ok(clickListener);

    clickListener({ target: new TestElement("report-export-json") } as unknown as Event);
    store.dispatch({ type: "report-view-changed", view: "ai" });
    clickListener({ target: new TestElement("report-export-pdf") } as unknown as Event);

    const mediaActions = sentEvents.filter(function (entry) {
      return entry.eventName === "media-action";
    });
    assert.equal(mediaActions.length, 2);
    assert.deepEqual(
      mediaActions.map(function (entry) {
        return entry.payload["action"];
      }),
      ["report-export", "report-export"]
    );
    assert.deepEqual(
      mediaActions.map(function (entry) {
        const payload = entry.payload["payload"] as Record<string, unknown>;
        return {
          featureId: payload["featureId"],
          format: payload["format"],
          hasTargetDirectory: Object.prototype.hasOwnProperty.call(payload, "targetDirectory"),
          reportView: payload["reportView"],
        };
      }),
      [
        {
          featureId: "media-analysis",
          format: "json",
          hasTargetDirectory: false,
          reportView: "user",
        },
        {
          featureId: "media-analysis",
          format: "pdf",
          hasTargetDirectory: false,
          reportView: "ai",
        },
      ]
    );
  } finally {
    if (typeof originalElement === "undefined") {
      delete (globalThis as Record<string, unknown>)["Element"];
    } else {
      Object.defineProperty(globalThis, "Element", {
        configurable: true,
        value: originalElement,
      });
    }
  }
});

void test("laboratory run controller threads frozen run context into tracked export actions", () => {
  const originalElement = globalThis.Element;
  const sentEvents: Array<{ eventName: string; payload: Record<string, unknown> }> = [];
  const documentRef = new FakeControllerDocument();
  const eventBus = createLabEventBus();
  const store = createLabStore();

  class TestElement extends FakeActionElement {}

  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: TestElement,
  });

  try {
    eventBus.subscribe(function (event) {
      store.dispatch(event);
    });

    const controller = createLabRunController({
      documentRef: documentRef as unknown as Document,
      eventBus,
      store,
      windowRef: {
        roomAPI: {
          sendEvent(eventName: string, payload: Record<string, unknown>) {
            sentEvents.push({ eventName, payload });
          },
        },
        addEventListener() {},
      } as unknown as Window,
    });
    controller.attach();

    const state = store.getState() as ReturnType<typeof store.getState> & {
      run: Record<string, unknown>;
    };
    state.run = {
      id: "run-controller-intents",
      state: "running",
      startedAt: Date.now() - 1000,
      modules: {},
      moduleOrder: [],
      events: [],
      rawLog: [],
      artifacts: [],
      findings: [],
      liveFindings: [],
      warnings: [],
      error: null,
      targetLabel: null,
      progress: 10,
      emptyReason: null,
      analysisScope: {
        focus: "visual",
      },
      previewArtifacts: [],
      confidence: null,
      moduleTrace: [],
      comparisonVariants: [],
      hypothesisSummary: null,
    };
    state.ui.workspace.roiRegions = [
      {
        id: "face",
        label: "Face",
        active: true,
        x: 8,
        y: 12,
        width: 120,
        height: 80,
      },
    ];
    state.ui.workspace.timelineStartMs = 1200;
    state.ui.workspace.timelineEndMs = 2400;

    const clickListener = documentRef.listeners.get("click");
    assert.ok(clickListener);

    clickListener({ target: new TestElement("workspace-roi-export", "face") } as unknown as Event);
    clickListener({ target: new TestElement("timeline-export-clip") } as unknown as Event);
    clickListener({ target: new TestElement("timeline-grab-frame") } as unknown as Event);
    clickListener({ target: new TestElement("timeline-extract-audio") } as unknown as Event);

    const mediaActions = sentEvents.filter(function (entry) {
      return entry.eventName === "media-action";
    });
    assert.equal(mediaActions.length, 3);
    assert.deepEqual(
      mediaActions.map(function (entry) {
        return entry.payload["action"] as string;
      }),
      ["export-roi-image", "export-frame-grab", "export-audio-track"]
    );
    assert.ok(mediaActions.every((entry) => typeof entry.payload["payload"] === "object"));
  } finally {
    if (typeof originalElement === "undefined") {
      delete (globalThis as Record<string, unknown>)["Element"];
    } else {
      Object.defineProperty(globalThis, "Element", {
        configurable: true,
        value: originalElement,
      });
    }
  }
});

void test("laboratory run controller sends comparison ROI payloads with image comparison actions", () => {
  const originalElement = globalThis.Element;
  const sentEvents: Array<{ eventName: string; payload: Record<string, unknown> }> = [];
  const documentRef = new FakeControllerDocument();
  const eventBus = createLabEventBus();
  const store = createLabStore();

  class TestElement extends FakeActionElement {}

  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: TestElement,
  });

  try {
    eventBus.subscribe(function (event) {
      store.dispatch(event);
    });

    const controller = createLabRunController({
      documentRef: documentRef as unknown as Document,
      eventBus,
      store,
      windowRef: {
        roomAPI: {
          sendEvent(eventName: string, payload: Record<string, unknown>) {
            sentEvents.push({ eventName, payload });
          },
        },
        addEventListener() {},
      } as unknown as Window,
    });
    controller.attach();

    store.dispatch({
      type: "source-config-patched",
      patch: {
        kind: "image",
        mode: "local",
        storedPath: "/tmp/primary.png",
      },
    });
    store.dispatch({ type: "workspace-asset-selected", assetId: "asset-primary" });
    store.dispatch({ type: "workspace-comparison-reference-set", assetId: "asset-reference" });
    store.dispatch({
      type: "workspace-comparison-updated",
      patch: {
        comparisonFindingNote: "Reference glow shifted",
        comparisonSplitPercent: 42,
        comparisonViewMode: "roi-detail",
      },
    });
    store.dispatch({
      type: "selection-roi-updated",
      comparisonSide: "primary",
      roi: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    });
    store.dispatch({
      type: "selection-roi-updated",
      comparisonSide: "reference",
      roi: { x: 0.2, y: 0.1, width: 0.25, height: 0.35 },
    });

    const clickListener = documentRef.listeners.get("click");
    assert.ok(clickListener);
    clickListener({ target: new TestElement("workspace-comparison-moment-capture") } as unknown as Event);

    assert.equal(sentEvents.length, 1);
    assert.equal(sentEvents[0]?.eventName, "media-action");
    assert.equal(sentEvents[0].payload["action"], "capture-comparison-moment");
    const payload = sentEvents[0].payload["payload"] as Record<string, unknown>;
    assert.equal(payload["workspaceTargetAssetId"], "asset-primary");
    assert.equal(payload["comparisonReferenceAssetId"], "asset-reference");
    assert.equal(payload["comparisonRoiActiveSide"], "reference");
    assert.equal(payload["comparisonViewMode"], "roi-detail");
    assert.equal(payload["comparisonSplitPercent"], 42);
    assert.equal(payload["findingNote"], "Reference glow shifted");
    assert.deepEqual(payload["normalizedRoi"], { x: 0.2, y: 0.1, width: 0.25, height: 0.35 });
    assert.deepEqual(payload["primaryNormalizedRoi"], { x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
    assert.deepEqual(payload["referenceNormalizedRoi"], {
      x: 0.2,
      y: 0.1,
      width: 0.25,
      height: 0.35,
    });
    assert.deepEqual(payload["comparisonRois"], {
      activeSide: "reference",
      primary: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      reference: { x: 0.2, y: 0.1, width: 0.25, height: 0.35 },
    });

    clickListener({ target: new TestElement("workspace-selection-roi-export") } as unknown as Event);

    assert.equal(sentEvents.length, 3);
    assert.equal(sentEvents[1]?.eventName, "media-action");
    assert.equal(sentEvents[1].payload["action"], "export-roi-image");
    const primaryRoiPayload = sentEvents[1].payload["payload"] as Record<string, unknown>;
    assert.equal(primaryRoiPayload["workspaceTargetAssetId"], "asset-primary");
    assert.equal(primaryRoiPayload["comparisonReferenceAssetId"], "asset-reference");
    assert.equal(primaryRoiPayload["comparisonRoiActiveSide"], "reference");
    assert.equal(primaryRoiPayload["workspaceResultTargetSide"], "primary");
    assert.equal(primaryRoiPayload["allowParallelWorkspaceOperation"], true);
    assert.deepEqual(primaryRoiPayload["normalizedRoi"], {
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
    });
    assert.equal(sentEvents[2]?.eventName, "media-action");
    assert.equal(sentEvents[2].payload["action"], "export-roi-image");
    const referenceRoiPayload = sentEvents[2].payload["payload"] as Record<string, unknown>;
    assert.equal(referenceRoiPayload["workspaceTargetAssetId"], "asset-reference");
    assert.equal(referenceRoiPayload["comparisonReferenceAssetId"], "asset-reference");
    assert.equal(referenceRoiPayload["comparisonRoiActiveSide"], "reference");
    assert.equal(referenceRoiPayload["workspaceResultTargetSide"], "reference");
    assert.equal(referenceRoiPayload["allowParallelWorkspaceOperation"], true);
    assert.deepEqual(referenceRoiPayload["normalizedRoi"], {
      x: 0.2,
      y: 0.1,
      width: 0.25,
      height: 0.35,
    });

    const primaryRequestId = sentEvents[1].payload["requestId"] as string;
    const referenceRequestId = sentEvents[2].payload["requestId"] as string;
    eventBus.emit({
      type: "host-event-received",
      event: {
        id: "evt-primary-roi-crop",
        kind: "job",
        severity: "success",
        message: "Primary ROI crop completed",
        detail: null,
        action: "export-roi-image",
        stage: "completed",
        timestamp: Date.now(),
        source: "host",
        scope: "global",
        moduleId: null,
        rawLine: null,
        requestId: primaryRequestId,
        resultAssetIds: ["asset-primary-crop"],
      } as never,
    });
    assert.equal(store.getState().ui.activeWorkspaceAssetId, "asset-primary");
    eventBus.emit({
      type: "asset-added",
      asset: {
        id: "asset-primary-crop",
        type: "image",
        name: "primary-crop.png",
        localPath: "/tmp/primary-crop.png",
        createdAt: 200,
      },
    });
    assert.equal(store.getState().ui.activeWorkspaceAssetId, "asset-primary-crop");
    assert.equal(store.getState().ui.workspace.comparisonReferenceAssetId, "asset-reference");

    eventBus.emit({
      type: "asset-added",
      asset: {
        id: "asset-reference-crop",
        type: "image",
        name: "reference-crop.png",
        localPath: "/tmp/reference-crop.png",
        createdAt: 201,
      },
    });
    eventBus.emit({
      type: "host-event-received",
      event: {
        id: "evt-reference-roi-crop",
        kind: "job",
        severity: "success",
        message: "Reference ROI crop completed",
        detail: null,
        action: "export-roi-image",
        stage: "completed",
        timestamp: Date.now(),
        source: "host",
        scope: "global",
        moduleId: null,
        rawLine: null,
        requestId: referenceRequestId,
        resultAssetIds: ["asset-reference-crop"],
      } as never,
    });
    assert.equal(store.getState().ui.activeWorkspaceAssetId, "asset-primary-crop");
    assert.equal(store.getState().ui.workspace.comparisonReferenceAssetId, "asset-reference-crop");
    assert.equal(store.getState().ui.workspace.comparisonRois.primary, null);
    assert.equal(store.getState().ui.workspace.comparisonRois.reference, null);
  } finally {
    if (typeof originalElement === "undefined") {
      delete (globalThis as Record<string, unknown>)["Element"];
    } else {
      Object.defineProperty(globalThis, "Element", {
        configurable: true,
        value: originalElement,
      });
    }
  }
});

void test("laboratory run controller replaces workspace media from enhanced frame outputs", () => {
  const originalElement = globalThis.Element;

  class TestElement extends FakeActionElement {}

  function createScenario() {
    const sentEvents: Array<{ eventName: string; payload: Record<string, unknown> }> = [];
    const documentRef = new FakeControllerDocument();
    const eventBus = createLabEventBus();
    const store = createLabStore();
    eventBus.subscribe(function (event) {
      store.dispatch(event);
    });
    const controller = createLabRunController({
      documentRef: documentRef as unknown as Document,
      eventBus,
      store,
      windowRef: {
        roomAPI: {
          sendEvent(eventName: string, payload: Record<string, unknown>) {
            sentEvents.push({ eventName, payload });
          },
        },
        addEventListener() {},
      } as unknown as Window,
    });
    controller.attach();
    const clickListener = documentRef.listeners.get("click");
    assert.ok(clickListener);
    return {
      click(action: string) {
        clickListener({ target: new TestElement(action) } as unknown as Event);
      },
      eventBus,
      sentEvents,
      store,
    };
  }

  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: TestElement,
  });

  try {
    const single = createScenario();
    single.store.dispatch({
      type: "source-config-patched",
      patch: {
        kind: "image",
        mode: "local",
        storedPath: "/tmp/single.png",
      },
    });
    single.store.dispatch({ type: "workspace-asset-selected", assetId: "asset-single" });

    single.click("workspace-enhanced-frame-export");

    assert.equal(single.sentEvents.length, 1);
    assert.equal(single.sentEvents[0]?.payload["action"], "export-enhanced-frame");
    const singlePayload = single.sentEvents[0].payload["payload"] as Record<string, unknown>;
    assert.equal(singlePayload["workspaceTargetAssetId"], "asset-single");
    assert.equal(singlePayload["workspaceResultMode"], "replace-workspace-media");
    assert.equal(singlePayload["workspaceResultTargetSide"], "single");

    const singleRequestId = single.sentEvents[0].payload["requestId"] as string;
    single.eventBus.emit({
      type: "host-event-received",
      event: {
        id: "evt-single-enhanced-frame",
        kind: "job",
        severity: "success",
        message: "Enhanced frame completed",
        detail: null,
        action: "export-enhanced-frame",
        stage: "completed",
        timestamp: Date.now(),
        source: "host",
        scope: "global",
        moduleId: null,
        rawLine: null,
        requestId: singleRequestId,
        resultAssetIds: ["asset-single-enhanced"],
      } as never,
    });
    single.eventBus.emit({
      type: "asset-added",
      asset: {
        id: "asset-single-enhanced",
        type: "image",
        name: "single-enhanced.png",
        localPath: "/tmp/single-enhanced.png",
        createdAt: 300,
      },
    });
    assert.equal(single.store.getState().ui.activeWorkspaceAssetId, "asset-single-enhanced");
    assert.equal(single.store.getState().ui.workspace.comparisonReferenceAssetId, null);

    const comparison = createScenario();
    comparison.store.dispatch({
      type: "source-config-patched",
      patch: {
        kind: "image",
        mode: "local",
        storedPath: "/tmp/primary.png",
      },
    });
    comparison.store.dispatch({ type: "workspace-asset-selected", assetId: "asset-primary" });
    comparison.store.dispatch({
      type: "workspace-comparison-reference-set",
      assetId: "asset-reference",
    });
    comparison.store.dispatch({
      type: "selection-roi-updated",
      comparisonSide: "primary",
      roi: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    });

    comparison.click("workspace-enhanced-frame-export");

    assert.equal(comparison.sentEvents.length, 2);
    const primaryPayload = comparison.sentEvents[0]?.payload["payload"] as Record<string, unknown>;
    const referencePayload = comparison.sentEvents[1]?.payload["payload"] as Record<
      string,
      unknown
    >;
    assert.equal(primaryPayload["workspaceTargetAssetId"], "asset-primary");
    assert.equal(primaryPayload["workspaceResultMode"], "replace-workspace-media");
    assert.equal(primaryPayload["workspaceResultTargetSide"], "primary");
    assert.equal(primaryPayload["allowParallelWorkspaceOperation"], true);
    assert.deepEqual(primaryPayload["normalizedRoi"], { x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
    assert.equal(referencePayload["workspaceTargetAssetId"], "asset-reference");
    assert.equal(referencePayload["workspaceResultMode"], "replace-workspace-media");
    assert.equal(referencePayload["workspaceResultTargetSide"], "reference");
    assert.equal(referencePayload["allowParallelWorkspaceOperation"], true);
    assert.equal(referencePayload["normalizedRoi"], null);

    const primaryRequestId = comparison.sentEvents[0]?.payload["requestId"] as string;
    const referenceRequestId = comparison.sentEvents[1]?.payload["requestId"] as string;
    comparison.eventBus.emit({
      type: "host-event-received",
      event: {
        id: "evt-primary-enhanced-frame",
        kind: "job",
        severity: "success",
        message: "Primary enhanced frame completed",
        detail: null,
        action: "export-enhanced-frame",
        stage: "completed",
        timestamp: Date.now(),
        source: "host",
        scope: "global",
        moduleId: null,
        rawLine: null,
        requestId: primaryRequestId,
        resultAssetIds: ["asset-primary-enhanced"],
      } as never,
    });
    comparison.eventBus.emit({
      type: "asset-added",
      asset: {
        id: "asset-primary-enhanced",
        type: "image",
        name: "primary-enhanced.png",
        localPath: "/tmp/primary-enhanced.png",
        createdAt: 301,
      },
    });
    comparison.eventBus.emit({
      type: "asset-added",
      asset: {
        id: "asset-reference-enhanced",
        type: "image",
        name: "reference-enhanced.png",
        localPath: "/tmp/reference-enhanced.png",
        createdAt: 302,
      },
    });
    comparison.eventBus.emit({
      type: "host-event-received",
      event: {
        id: "evt-reference-enhanced-frame",
        kind: "job",
        severity: "success",
        message: "Reference enhanced frame completed",
        detail: null,
        action: "export-enhanced-frame",
        stage: "completed",
        timestamp: Date.now(),
        source: "host",
        scope: "global",
        moduleId: null,
        rawLine: null,
        requestId: referenceRequestId,
        resultAssetIds: ["asset-reference-enhanced"],
      } as never,
    });
    assert.equal(comparison.store.getState().ui.activeWorkspaceAssetId, "asset-primary-enhanced");
    assert.equal(
      comparison.store.getState().ui.workspace.comparisonReferenceAssetId,
      "asset-reference-enhanced"
    );
  } finally {
    if (typeof originalElement === "undefined") {
      delete (globalThis as Record<string, unknown>)["Element"];
    } else {
      Object.defineProperty(globalThis, "Element", {
        configurable: true,
        value: originalElement,
      });
    }
  }
});

void test("laboratory run controller restores comparison finding focus from inspector actions", () => {
  const originalElement = globalThis.Element;
  const documentRef = new FakeControllerDocument();
  const eventBus = createLabEventBus();
  const store = createLabStore();

  class TestElement extends FakeActionElement {}

  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: TestElement,
  });

  try {
    eventBus.subscribe(function (event) {
      store.dispatch(event);
    });

    const controller = createLabRunController({
      documentRef: documentRef as unknown as Document,
      eventBus,
      store,
      windowRef: {
        addEventListener() {},
      } as unknown as Window,
    });
    controller.attach();

    store.dispatch({
      type: "source-config-patched",
      patch: {
        kind: "image",
        mode: "local",
        storedPath: "/tmp/source.png",
      },
    });
    store.dispatch({
      type: "asset-added",
      asset: {
        id: "asset-primary",
        type: "image",
        name: "primary.png",
        localPath: "/tmp/primary.png",
        createdAt: 10,
        metadata: { kind: "image" },
      },
    });
    store.dispatch({
      type: "asset-added",
      asset: {
        id: "asset-reference",
        type: "image",
        name: "reference.png",
        localPath: "/tmp/reference.png",
        createdAt: 11,
        metadata: { kind: "image" },
      },
    });
    store.dispatch({
      type: "asset-added",
      asset: {
        id: "asset-manifest",
        type: "artifact",
        name: "comparison-finding.json",
        localPath: "/tmp/comparison-finding.json",
        createdAt: 12,
        metadata: {
          artifactKind: "comparison-finding-manifest",
          captureContext: {
            comparisonRois: {
              activeSide: "reference",
              primary: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
              reference: { x: 0.2, y: 0.1, width: 0.25, height: 0.35 },
            },
            comparisonViewMode: "roi-detail",
            primaryAssetId: "asset-primary",
            referenceAssetId: "asset-reference",
            splitPercent: 44,
          },
          findingId: "finding-restore",
          primaryAssetId: "asset-primary",
          referenceAssetId: "asset-reference",
        },
      },
    });

    const clickListener = documentRef.listeners.get("click");
    assert.ok(clickListener);
    clickListener({
      target: new TestElement("workspace-comparison-finding-focus", "finding-restore"),
    } as unknown as Event);

    const workspace = store.getState().ui.workspace;
    assert.equal(store.getState().ui.activeWorkspaceAssetId, "asset-primary");
    assert.equal(workspace.comparisonReferenceAssetId, "asset-reference");
    assert.equal(workspace.comparisonViewMode, "roi-detail");
    assert.equal(workspace.comparisonSplitPercent, 44);
    assert.equal(workspace.activeIconRailSlot, "image-comparison");
    assert.equal(workspace.controlsDrawerTab, "audio");
    assert.equal(workspace.comparisonRois.activeSide, "reference");
    assert.deepEqual(workspace.comparisonRois.primary, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
    assert.deepEqual(workspace.comparisonRois.reference, {
      x: 0.2,
      y: 0.1,
      width: 0.25,
      height: 0.35,
    });
    assert.deepEqual(workspace.activeSelection?.roi, {
      x: 0.2,
      y: 0.1,
      width: 0.25,
      height: 0.35,
    });
  } finally {
    if (typeof originalElement === "undefined") {
      delete (globalThis as Record<string, unknown>)["Element"];
    } else {
      Object.defineProperty(globalThis, "Element", {
        configurable: true,
        value: originalElement,
      });
    }
  }
});

void test("laboratory run controller toggles selection micro zoom from the timeline action", () => {
  const originalElement = globalThis.Element;
  const documentRef = new FakeControllerDocument();
  const eventBus = createLabEventBus();
  const store = createLabStore();

  class TestElement extends FakeActionElement {}

  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: TestElement,
  });

  try {
    eventBus.subscribe(function (event) {
      store.dispatch(event);
    });

    const controller = createLabRunController({
      documentRef: documentRef as unknown as Document,
      eventBus,
      store,
      windowRef: {
        addEventListener() {},
      } as unknown as Window,
    });
    controller.attach();

    store.dispatch({
      type: "workspace-timeline-updated",
      startMs: 1200,
      endMs: 3600,
    });

    const clickListener = documentRef.listeners.get("click");
    assert.ok(clickListener);

    clickListener({ target: new TestElement("timeline-toggle-micro-zoom") } as unknown as Event);
    assert.equal(store.getState().ui.workspace.selectionMicroZoomOpen, true);

    clickListener({ target: new TestElement("timeline-toggle-micro-zoom") } as unknown as Event);
    assert.equal(store.getState().ui.workspace.selectionMicroZoomOpen, false);

    store.dispatch({ type: "workspace-timeline-updated", startMs: null, endMs: null });
    clickListener({ target: new TestElement("timeline-toggle-micro-zoom") } as unknown as Event);
    assert.equal(store.getState().ui.workspace.selectionMicroZoomOpen, false);
  } finally {
    if (typeof originalElement === "undefined") {
      delete (globalThis as Record<string, unknown>)["Element"];
    } else {
      Object.defineProperty(globalThis, "Element", {
        configurable: true,
        value: originalElement,
      });
    }
  }
});

void test("laboratory asset menus close on menu actions and outside clicks", () => {
  const originalElement = (globalThis as Record<string, unknown>)["Element"];

  class TestElement {
    constructor(
      private readonly menu: HTMLDetailsElement | null,
      private readonly action = false
    ) {}

    closest(selector: string) {
      if (selector === "details.labx-sp-asset__menu") {
        return this.menu;
      }
      if (selector === "[data-lab-action]" && this.action) {
        return this;
      }
      return null;
    }
  }

  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: TestElement,
  });

  try {
    const sourceMenu = { open: true } as HTMLDetailsElement;
    const projectMenu = { open: true } as HTMLDetailsElement;
    const documentRef = {
      querySelectorAll(selector: string) {
        assert.equal(selector, "details.labx-sp-asset__menu");
        return [sourceMenu, projectMenu];
      },
    } as unknown as Document;

    closeLabAssetMenusForClick(
      { target: new TestElement(sourceMenu, true) } as unknown as Event,
      documentRef
    );
    assert.equal(sourceMenu.open, false);
    assert.equal(projectMenu.open, false);

    sourceMenu.open = true;
    projectMenu.open = true;
    closeLabAssetMenusForClick(
      { target: new TestElement(sourceMenu, false) } as unknown as Event,
      documentRef
    );
    assert.equal(sourceMenu.open, true);
    assert.equal(projectMenu.open, false);

    sourceMenu.open = true;
    projectMenu.open = true;
    closeLabAssetMenusForClick(
      { target: new TestElement(null, false) } as unknown as Event,
      documentRef
    );
    assert.equal(sourceMenu.open, false);
    assert.equal(projectMenu.open, false);
  } finally {
    if (originalElement === undefined) {
      delete (globalThis as Record<string, unknown>)["Element"];
    } else {
      Object.defineProperty(globalThis, "Element", {
        configurable: true,
        value: originalElement,
      });
    }
  }
});

void test("laboratory run controller focuses the source preview through explicit source-preview actions", () => {
  const originalElement = globalThis.Element;
  const previewCalls: string[] = [];
  const previewElement = {
    scrollIntoView() {
      previewCalls.push("scroll");
    },
    focus() {
      previewCalls.push("focus");
    },
  };
  const documentRef = {
    listeners: new Map<string, (event: Event) => void>(),
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      this.listeners.set(
        type,
        typeof listener === "function"
          ? (listener)
          : (event: Event) => { listener.handleEvent(event); }
      );
    },
    querySelector(selector: string) {
      return selector === "#lab-workspace-preview" ? previewElement : null;
    },
  };
  const eventBus = createLabEventBus();
  const store = createLabStore();

  class TestElement extends FakeActionElement {}

  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: TestElement,
  });

  try {
    eventBus.subscribe(function (event) {
      store.dispatch(event);
    });

    const controller = createLabRunController({
      documentRef: documentRef as unknown as Document,
      eventBus,
      store,
      windowRef: {
        roomAPI: {
          sendEvent() {},
        },
        addEventListener() {},
      } as unknown as Window,
    });
    controller.attach();

    const clickListener = documentRef.listeners.get("click");
    assert.ok(clickListener);

    clickListener({ target: new TestElement("focus-source-preview", "source-active") } as unknown as Event);

    assert.deepEqual(previewCalls, ["scroll", "focus"]);
  } finally {
    if (typeof originalElement === "undefined") {
      delete (globalThis as Record<string, unknown>)["Element"];
    } else {
      Object.defineProperty(globalThis, "Element", {
        configurable: true,
        value: originalElement,
      });
    }
  }
});

void test("laboratory run controller wires v2 shell action buttons into workspace state", () => {
  const originalElement = globalThis.Element;
  const originalInput = globalThis.HTMLInputElement;
  const originalSelect = globalThis.HTMLSelectElement;
  const originalTextarea = globalThis.HTMLTextAreaElement;
  const documentRef = new FakeControllerDocument();
  const eventBus = createLabEventBus();
  const store = createLabStore();

  class TestElement extends FakeActionElement {}
  class TestInputElement {}
  class TestSelectElement {}
  class TestTextareaElement {}

  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: TestElement,
  });
  Object.defineProperty(globalThis, "HTMLInputElement", {
    configurable: true,
    value: TestInputElement,
  });
  Object.defineProperty(globalThis, "HTMLSelectElement", {
    configurable: true,
    value: TestSelectElement,
  });
  Object.defineProperty(globalThis, "HTMLTextAreaElement", {
    configurable: true,
    value: TestTextareaElement,
  });

  try {
    eventBus.subscribe(function (event) {
      store.dispatch(event);
    });

    const controller = createLabRunController({
      documentRef: documentRef as unknown as Document,
      eventBus,
      store,
      windowRef: {
        roomAPI: {
          sendEvent() {},
        },
        addEventListener() {},
      } as unknown as Window,
    });
    controller.attach();

    const clickListener = documentRef.listeners.get("click");
    const keyListener = documentRef.listeners.get("keydown");
    assert.ok(clickListener);
    assert.ok(keyListener);

    clickListener({ target: new TestElement("drawer-collapsed-toggled") } as unknown as Event);
    assert.equal(store.getState().ui.workspace.drawerCollapsed, true);

    let prevented = false;
    keyListener({
      ctrlKey: true,
      key: "b",
      target: new TestElement("not-a-text-control"),
      preventDefault() {
        prevented = true;
      },
    } as unknown as Event);
    assert.equal(prevented, true);
    assert.equal(store.getState().ui.workspace.drawerCollapsed, false);

    clickListener({
      target: new TestElement("analysis-prep-group-toggle", "visual-structure"),
    } as unknown as Event);
    assert.deepEqual(store.getState().selectedCapabilities, ["visual-structure"]);
    assert.equal(
      (store.getState().workbench["moduleToggles"] as Record<string, unknown>)["frame-consistency"],
      true
    );

    clickListener({
      target: new TestElement("module-toggle", "audio-signal::signal-health"),
    } as unknown as Event);
    assert.equal(
      (store.getState().workbench["moduleToggles"] as Record<string, unknown>)["signal-health"],
      true
    );
    assert.ok(store.getState().selectedCapabilities.includes("audio-signal"));

    clickListener({ target: new TestElement("workspace-process-view-toggled") } as unknown as Event);
    assert.equal(store.getState().ui.workspace.processViewActive, true);
  } finally {
    if (typeof originalElement === "undefined") {
      delete (globalThis as Record<string, unknown>)["Element"];
    } else {
      Object.defineProperty(globalThis, "Element", {
        configurable: true,
        value: originalElement,
      });
    }
    if (typeof originalInput === "undefined") {
      delete (globalThis as Record<string, unknown>)["HTMLInputElement"];
    } else {
      Object.defineProperty(globalThis, "HTMLInputElement", {
        configurable: true,
        value: originalInput,
      });
    }
    if (typeof originalSelect === "undefined") {
      delete (globalThis as Record<string, unknown>)["HTMLSelectElement"];
    } else {
      Object.defineProperty(globalThis, "HTMLSelectElement", {
        configurable: true,
        value: originalSelect,
      });
    }
    if (typeof originalTextarea === "undefined") {
      delete (globalThis as Record<string, unknown>)["HTMLTextAreaElement"];
    } else {
      Object.defineProperty(globalThis, "HTMLTextAreaElement", {
        configurable: true,
        value: originalTextarea,
      });
    }
  }
});

void test("laboratory run controller applies fine adjustment controls for audio and visual panels", () => {
  const originalElement = globalThis.Element;
  const documentRef = new FakeControllerDocument();
  const eventBus = createLabEventBus();
  const store = createLabStore();

  class TestElement extends FakeActionElement {
    constructor(dataset: Record<string, string>) {
      super(dataset["labAction"] ?? "workspace-setting-adjust");
      this.dataset = dataset;
    }
  }

  function settingButton(field: string, attrs: Record<string, string>) {
    return new TestElement({
      labAction: "workspace-setting-adjust",
      labField: field,
      ...attrs,
    });
  }

  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: TestElement,
  });

  try {
    eventBus.subscribe(function (event) {
      store.dispatch(event);
    });

    const controller = createLabRunController({
      documentRef: documentRef as unknown as Document,
      eventBus,
      store,
      windowRef: {
        addEventListener() {},
      } as unknown as Window,
    });
    controller.attach();

    const clickListener = documentRef.listeners.get("click");
    assert.ok(clickListener);

    clickListener({
      target: settingButton("workspace.interactive.brightness", {
        labDelta: "1",
        labMin: "0",
        labMax: "200",
        labStep: "1",
        labResetValue: "100",
      }),
    } as unknown as Event);
    assert.equal(store.getState().ui.workspace.interactiveSettings.brightness, 101);

    store.dispatch({
      type: "workspace-comparison-reference-set",
      assetId: "asset-reference",
    });
    clickListener({
      target: settingButton("workspace.interactive.brightness", {
        labDelta: "1",
        labMin: "0",
        labMax: "200",
        labStep: "1",
        labResetValue: "100",
      }),
    } as unknown as Event);
    assert.equal(store.getState().ui.workspace.interactiveSettings.brightness, 101);
    assert.equal(
      store.getState().ui.workspace.comparisonInteractiveSettings.primary.brightness,
      101
    );
    assert.equal(
      store.getState().ui.workspace.comparisonInteractiveSettings.reference.brightness,
      102
    );

    store.dispatch({ type: "workspace-comparison-side-activated", side: "primary" });
    clickListener({
      target: settingButton("workspace.interactive.brightness", {
        labMin: "0",
        labMax: "200",
        labReset: "true",
        labStep: "1",
        labResetValue: "100",
      }),
    } as unknown as Event);
    assert.equal(
      store.getState().ui.workspace.comparisonInteractiveSettings.primary.brightness,
      100
    );
    assert.equal(
      store.getState().ui.workspace.comparisonInteractiveSettings.reference.brightness,
      102
    );

    clickListener({
      target: settingButton("workspace.audioFocus.gain", {
        labDelta: "-0.1",
        labMin: "0",
        labMax: "3",
        labStep: "0.1",
        labResetValue: "1",
      }),
    } as unknown as Event);
    assert.equal(store.getState().ui.workspace.audioFocus.gain, 0.9);

    clickListener({
      target: settingButton("workspace.audioFocus.filterType", {
        labDelta: "1",
        labOptions: "none|lowpass|highpass|bandpass",
        labResetValue: "none",
      }),
    } as unknown as Event);
    assert.equal(store.getState().ui.workspace.audioFocus.filterType, "lowpass");

    clickListener({
      target: settingButton("workspace.audioFocus.filterType", {
        labReset: "true",
        labOptions: "none|lowpass|highpass|bandpass",
        labResetValue: "none",
      }),
    } as unknown as Event);
    assert.equal(store.getState().ui.workspace.audioFocus.filterType, "none");

    store.dispatch({
      type: "workspace-audio-updated",
      patch: {
        eqBands: store.getState().ui.workspace.audioFocus.eqBands.map(function (band, index) {
          return index === 1 ? { ...band, gain: 4 } : band;
        }),
      },
    });
    clickListener({
      target: settingButton("workspace.audioFocus.eqBands.1.gain", {
        labReset: "true",
        labMin: "-12",
        labMax: "12",
        labStep: "0.5",
        labResetValue: "0",
      }),
    } as unknown as Event);
    assert.equal(store.getState().ui.workspace.audioFocus.eqBands[1]?.gain, 0);

    clickListener({
      target: new TestElement({ labAction: "workspace-reset-audio-focus" }),
    } as unknown as Event);
    assert.equal(store.getState().ui.workspace.audioFocus.gain, 1);
    assert.equal(store.getState().ui.workspace.audioFocus.playbackRate, 1);
  } finally {
    if (typeof originalElement === "undefined") {
      delete (globalThis as Record<string, unknown>)["Element"];
    } else {
      Object.defineProperty(globalThis, "Element", {
        configurable: true,
        value: originalElement,
      });
    }
  }
});

void test("laboratory run controller routes YouTube source selection without import mode or downloads", () => {
  const originalElement = globalThis.Element;
  const originalInput = globalThis.HTMLInputElement;
  const originalSelect = globalThis.HTMLSelectElement;
  const originalTextarea = globalThis.HTMLTextAreaElement;
  const sentEvents: Array<{ eventName: string; payload: Record<string, unknown> }> = [];
  const documentRef = new FakeControllerDocument();
  const eventBus = createLabEventBus();
  const store = createLabStore();
  store.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "video",
      mode: "local",
      status: "ready",
      storedPath: "/tmp/existing-lab-source.mp4",
      storedFileName: "existing-lab-source.mp4",
      sourceUrl: null,
      previewUrl: "file:///tmp/existing-lab-source.mp4",
      routeLabel: "Local Copy",
      metadata: {
        durationSeconds: 42,
      },
    },
  });

  class TestElement extends FakeActionElement {}
  class TestInputElement {
    checked: boolean;
    dataset: Record<string, string>;

    constructor(
      field: string,
      public value: string,
      public type = "url",
      checked = false
    ) {
      this.checked = checked;
      this.dataset = {
        labField: field,
      };
    }
  }
  class TestSelectElement {
    dataset: Record<string, string>;

    constructor(
      field: string,
      public value: string
    ) {
      this.dataset = {
        labField: field,
      };
    }
  }
  class TestTextareaElement {}

  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: TestElement,
  });
  Object.defineProperty(globalThis, "HTMLInputElement", {
    configurable: true,
    value: TestInputElement,
  });
  Object.defineProperty(globalThis, "HTMLSelectElement", {
    configurable: true,
    value: TestSelectElement,
  });
  Object.defineProperty(globalThis, "HTMLTextAreaElement", {
    configurable: true,
    value: TestTextareaElement,
  });

  try {
    eventBus.subscribe(function (event) {
      store.dispatch(event);
    });

    const controller = createLabRunController({
      documentRef: documentRef as unknown as Document,
      eventBus,
      store,
      windowRef: {
        roomAPI: {
          sendEvent(eventName: string, payload: Record<string, unknown>) {
            sentEvents.push({ eventName, payload });
          },
        },
        addEventListener() {},
      } as unknown as Window,
    });
    controller.attach();

    const clickListener = documentRef.listeners.get("click");
    const changeListener = documentRef.listeners.get("change");
    const inputListener = documentRef.listeners.get("input");
    assert.ok(clickListener);
    assert.ok(changeListener);
    assert.ok(inputListener);

    changeListener({
      target: new TestSelectElement("source.mode", "youtube"),
    } as unknown as Event);

    assert.equal(store.getState().ui.labMode, "normal");
    assert.equal(store.getState().source?.["mode"], "youtube");
    assert.equal(store.getState().source?.["storedPath"], null);
    assert.equal(sentEvents.length, 1);
    assert.equal(sentEvents[0]?.eventName, "media-action");
    assert.equal(sentEvents[0].payload["action"], "source-set-mode");
    const sourceAfterModeSelection = JSON.parse(JSON.stringify(store.getState().source)) as Record<string, unknown>;

    inputListener({
      target: new TestInputElement("source.youtubeUrl", "https://youtube.com/watch?v=focus"),
    } as unknown as Event);
    assert.equal(store.getState().ui.sourceDrafts.youtubeUrl, "https://youtube.com/watch?v=focus");
    assert.deepEqual(store.getState().source, sourceAfterModeSelection);

    store.dispatch({
      type: "youtube-import-set-url",
      url: "https://www.youtube.com/watch?v=abc123DEF45",
    });
    store.dispatch({
      type: "youtube-import-parse-success",
      url: "https://www.youtube.com/watch?v=abc123DEF45",
      preview: {
        title: "Sample Video Title",
        duration: 154,
        thumbnail: "https://img.youtube.com/vi/abc123DEF45/hqdefault.jpg",
      },
      formats: [
        {
          formatId: "137",
          label: "Video 1080p",
          kind: "video",
          extension: "mp4",
        },
        {
          formatId: "248",
          label: "Video 1080p webm",
          kind: "video",
          extension: "webm",
        },
        {
          formatId: "140",
          label: "Audio m4a",
          kind: "audio",
          extension: "m4a",
        },
        {
          formatId: "251",
          label: "Audio opus",
          kind: "audio",
          extension: "webm",
        },
      ],
      selectedVideoFormatId: "137",
      selectedAudioFormatId: "140",
    });
    assert.equal(store.getState().ui.youtubeImport.status, "ready");
    assert.equal(store.getState().ui.youtubeImport.selectedVideoFormatId, "137");
    assert.equal(store.getState().ui.youtubeImport.selectedAudioFormatId, "140");

    changeListener({
      target: new TestSelectElement("project-import.youtubeVideoFormat", "248"),
    } as unknown as Event);
    assert.equal(store.getState().ui.youtubeImport.selectedVideoFormatId, "248");

    changeListener({
      target: new TestSelectElement("project-import.youtubeAudioFormat", "251"),
    } as unknown as Event);
    assert.equal(store.getState().ui.youtubeImport.selectedAudioFormatId, "251");

    changeListener({
      target: new TestSelectElement("project-import.youtubeCaptureMode", "audio-only"),
    } as unknown as Event);
    assert.equal(store.getState().ui.projectImport.drafts.video.youtubeCaptureMode, "audio-only");

    assert.equal(sentEvents.length, 1);
    clickListener({ target: new TestElement("youtube-import-clear") } as unknown as Event);
    assert.deepEqual(store.getState().ui.youtubeImport, {
      url: null,
      status: "idle",
      preview: null,
      formats: [],
      selectedVideoFormatId: null,
      selectedAudioFormatId: null,
    });

    assert.equal(
      sentEvents.some(function (entry) {
        return entry.payload["action"] === "source-download-youtube";
      }),
      false
    );
  } finally {
    if (typeof originalElement === "undefined") {
      delete (globalThis as Record<string, unknown>)["Element"];
    } else {
      Object.defineProperty(globalThis, "Element", {
        configurable: true,
        value: originalElement,
      });
    }
    if (typeof originalInput === "undefined") {
      delete (globalThis as Record<string, unknown>)["HTMLInputElement"];
    } else {
      Object.defineProperty(globalThis, "HTMLInputElement", {
        configurable: true,
        value: originalInput,
      });
    }
    if (typeof originalSelect === "undefined") {
      delete (globalThis as Record<string, unknown>)["HTMLSelectElement"];
    } else {
      Object.defineProperty(globalThis, "HTMLSelectElement", {
        configurable: true,
        value: originalSelect,
      });
    }
    if (typeof originalTextarea === "undefined") {
      delete (globalThis as Record<string, unknown>)["HTMLTextAreaElement"];
    } else {
      Object.defineProperty(globalThis, "HTMLTextAreaElement", {
        configurable: true,
        value: originalTextarea,
      });
    }
  }
});

