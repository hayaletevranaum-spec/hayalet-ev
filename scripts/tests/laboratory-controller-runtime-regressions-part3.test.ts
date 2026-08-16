import {
  assert,
  createLabEventBus,
  createLabRunController,
  createLabStore,
  FakeActionElement,
  FakeControllerDocument,
  FakeDualPreviewDocument,
  FakeMediaElement,
  FakeMouseEvent,
  FakeTimelineActionElement,
  FakeTimelineRoot,
  FakeTimelineTrack,
  FakeWindowEventTarget,
  getActiveInspectionSnapshot,
  getActiveSelection,
  getInspectionMode,
  getRoiFocusActive,
  getSelectionDuration,
  importLabRootModuleWithDomStub,
  isSelectionValid,
  test
} from "./laboratory-runtime-truth.helpers.ts";

void test("laboratory run controller drags the timeline selection body from the pointer-down offset", () => {
  const originalElement = globalThis.Element;
  const originalMouseEvent = globalThis.MouseEvent;
  const preview = new FakeMediaElement();
  preview.duration = 10;
  const documentRef = new FakeDualPreviewDocument(
    new Map<string, unknown>([['video[data-lab-preserve-media="workspace-preview"]', preview]]),
    [preview]
  );
  const windowRef = new FakeWindowEventTarget();
  const eventBus = createLabEventBus();
  const store = createLabStore();
  const track = new FakeTimelineTrack(100, 1000);
  const timeline = new FakeTimelineRoot(track, 10000);

  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: FakeTimelineActionElement,
  });
  Object.defineProperty(globalThis, "MouseEvent", {
    configurable: true,
    value: FakeMouseEvent,
  });

  try {
    eventBus.subscribe(function (event) {
      store.dispatch(event);
    });

    const controller = createLabRunController({
      documentRef: documentRef as unknown as Document,
      eventBus,
      store,
      windowRef: windowRef as unknown as Window,
    });

    controller.attach();
    store.dispatch({
      type: "workspace-timeline-updated",
      startMs: 1000,
      endMs: 3000,
    });

    const mouseDownListener = documentRef.listeners.get("mousedown");
    const mouseMoveListener = windowRef.listeners.get("mousemove");
    const mouseUpListener = windowRef.listeners.get("mouseup");
    assert.ok(mouseDownListener);
    assert.ok(mouseMoveListener);
    assert.ok(mouseUpListener);

    const actionTarget = new FakeTimelineActionElement("timeline-drag-body", timeline);

    mouseDownListener(
      new FakeMouseEvent(actionTarget as unknown as EventTarget, 250) as unknown as Event
    );
    mouseMoveListener(
      new FakeMouseEvent(actionTarget as unknown as EventTarget, 650) as unknown as Event
    );

    assert.equal(store.getState().ui.workspace.timelineStartMs, 5000);
    assert.equal(store.getState().ui.workspace.timelineEndMs, 7000);

    mouseUpListener({} as unknown as Event);
    assert.equal(preview.currentTime, 5);
  } finally {
    if (typeof originalElement === "undefined") {
      delete (globalThis as Record<string, unknown>)["Element"];
    } else {
      Object.defineProperty(globalThis, "Element", {
        configurable: true,
        value: originalElement,
      });
    }
    if (typeof originalMouseEvent === "undefined") {
      delete (globalThis as Record<string, unknown>)["MouseEvent"];
    } else {
      Object.defineProperty(globalThis, "MouseEvent", {
        configurable: true,
        value: originalMouseEvent,
      });
    }
  }
});

void test("laboratory run controller applies timeline finetune and clear actions from the unified timeline", () => {
  const originalElement = globalThis.Element;
  const documentRef = new FakeControllerDocument();
  const eventBus = createLabEventBus();
  const store = createLabStore();
  const timeline = new FakeTimelineRoot(new FakeTimelineTrack(100, 1000), 10000);

  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: FakeTimelineActionElement,
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
    store.dispatch({
      type: "workspace-timeline-updated",
      startMs: 1000,
      endMs: 3000,
    });
    store.dispatch({
      type: "selection-inspection-mode-updated",
      mode: "audio",
    });

    const clickListener = documentRef.listeners.get("click");
    assert.ok(clickListener);

    clickListener(
      new FakeMouseEvent(
        new FakeTimelineActionElement(
          "timeline-finetune",
          timeline,
          "start:+100"
        ) as unknown as EventTarget,
        0
      ) as unknown as Event
    );
    clickListener(
      new FakeMouseEvent(
        new FakeTimelineActionElement(
          "timeline-finetune",
          timeline,
          "end:-500"
        ) as unknown as EventTarget,
        0
      ) as unknown as Event
    );

    assert.equal(store.getState().ui.workspace.timelineStartMs, 1100);
    assert.equal(store.getState().ui.workspace.timelineEndMs, 2500);
    assert.equal(getInspectionMode(store.getState()), "audio");

    clickListener(
      new FakeMouseEvent(
        new FakeTimelineActionElement("timeline-clear", timeline) as unknown as EventTarget,
        0
      ) as unknown as Event
    );

    assert.equal(store.getState().ui.workspace.timelineStartMs, null);
    assert.equal(store.getState().ui.workspace.timelineEndMs, null);
    assert.equal(getInspectionMode(store.getState()), "audio");
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

void test("laboratory store promotes timeline ranges into stable selection entities", () => {
  const store = createLabStore();

  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1000,
    endMs: 3000,
  });

  const firstSelection = store.getState().ui.workspace.activeSelection;
  assert.ok(firstSelection);
  assert.equal(firstSelection.type, "clip");
  assert.equal(firstSelection.startMs, 1000);
  assert.equal(firstSelection.endMs, 3000);
  assert.ok(typeof firstSelection.id === "string" && firstSelection.id.length > 0);
  assert.equal(getActiveSelection(store.getState())?.id, firstSelection.id);
  assert.equal(isSelectionValid(store.getState()), true);
  assert.equal(getSelectionDuration(store.getState()), 2000);
  assert.equal(getInspectionMode(store.getState()), "none");

  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });

  assert.equal(getInspectionMode(store.getState()), "audio");

  store.dispatch({
    type: "selection-roi-updated",
    roi: {
      x: 0.1,
      y: 0.15,
      width: 0.3,
      height: 0.35,
    },
  });

  assert.deepEqual(store.getState().ui.workspace.activeSelection?.roi, {
    x: 0.1,
    y: 0.15,
    width: 0.3,
    height: 0.35,
  });
  store.dispatch({
    type: "selection-roi-focus-set",
    active: true,
  });
  store.dispatch({
    type: "selection-roi-snapshot-set",
    snapshot: {
      id: "selection-snapshot",
      objectUrl: "blob:selection-snapshot",
      width: 200,
      height: 120,
      sourceKind: "video",
      roi: {
        x: 0.1,
        y: 0.15,
        width: 0.3,
        height: 0.35,
      },
      createdAt: 3,
      timeMs: 1_400,
    },
  });

  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1200,
    endMs: 3400,
  });

  const evolvedSelection = store.getState().ui.workspace.activeSelection;
  assert.ok(evolvedSelection);
  assert.equal(evolvedSelection.id, firstSelection.id);
  assert.equal(evolvedSelection.createdAt, firstSelection.createdAt);
  assert.equal(evolvedSelection.startMs, 1200);
  assert.equal(evolvedSelection.endMs, 3400);
  assert.equal(evolvedSelection.roi, undefined);
  assert.equal(getRoiFocusActive(store.getState()), false);
  assert.equal(getActiveInspectionSnapshot(store.getState()), null);

  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1200,
    endMs: 1100,
  });

  assert.equal(store.getState().ui.workspace.activeSelection, null);
  assert.equal(isSelectionValid(store.getState()), false);
  assert.equal(getSelectionDuration(store.getState()), 0);
  assert.equal(getInspectionMode(store.getState()), "audio");
});

void test("laboratory store keeps inspection mode without requiring an active selection", () => {
  const store = createLabStore();

  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "visual",
  });

  assert.equal(store.getState().ui.workspace.activeSelection, null);
  assert.equal(getInspectionMode(store.getState()), "visual");
});

void test("laboratory store can synthesize and clear an image inspection selection from semantic roi updates", () => {
  const store = createLabStore();

  store.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "image",
      mode: "local",
      storedPath: "/tmp/source.png",
    },
  });

  store.dispatch({
    type: "selection-roi-updated",
    roi: {
      x: 0.2,
      y: 0.1,
      width: 0.4,
      height: 0.5,
    },
  });

  assert.deepEqual(store.getState().ui.workspace.activeSelection, {
    id: store.getState().ui.workspace.activeSelection?.id,
    startMs: 0,
    endMs: 1,
    type: "inspect",
    roi: {
      x: 0.2,
      y: 0.1,
      width: 0.4,
      height: 0.5,
    },
    createdAt: store.getState().ui.workspace.activeSelection?.createdAt,
  });

  store.dispatch({
    type: "selection-roi-cleared",
  });

  assert.equal(store.getState().ui.workspace.activeSelection, null);
});

void test("laboratory inspection micro state stays UI-scoped and resets on hydrate", async () => {
  const store = createLabStore();
  const labRootModule = await importLabRootModuleWithDomStub<{
    __testOnlyLabRootPersistence: {
      readPersistableState: (state: ReturnType<typeof store.getState>) => Record<string, unknown>;
    };
  }>();

  store.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "image",
      mode: "local",
      storedPath: "/tmp/source.png",
    },
  });
  store.dispatch({
    type: "selection-roi-updated",
    roi: {
      x: 0.2,
      y: 0.2,
      width: 0.24,
      height: 0.26,
    },
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "motion",
  });
  store.dispatch({
    type: "selection-roi-focus-set",
    active: true,
  });
  store.dispatch({
    type: "selection-roi-snapshot-set",
    snapshot: {
      id: "snapshot-1",
      objectUrl: "blob:roi-snapshot-1",
      width: 240,
      height: 180,
      sourceKind: "image",
      roi: {
        x: 0.2,
        y: 0.2,
        width: 0.24,
        height: 0.26,
      },
      createdAt: 1,
      timeMs: null,
    },
  });

  assert.equal(getInspectionMode(store.getState()), "motion");
  assert.equal(getRoiFocusActive(store.getState()), true);
  assert.equal(getActiveInspectionSnapshot(store.getState())?.id, "snapshot-1");

  const persistedState = labRootModule.__testOnlyLabRootPersistence.readPersistableState(
    store.getState()
  );

  assert.equal("inspectionMode" in persistedState, false);
  assert.equal("roiFocusActive" in persistedState, false);
  assert.equal("activeInspectionSnapshot" in persistedState, false);
  assert.equal(
    "inspectionMode" in ((persistedState["workspace"] ?? {}) as Record<string, unknown>),
    false
  );
  assert.equal(
    "roiFocusActive" in ((persistedState["workspace"] ?? {}) as Record<string, unknown>),
    false
  );
  assert.equal(
    "activeInspectionSnapshot" in ((persistedState["workspace"] ?? {}) as Record<string, unknown>),
    false
  );

  store.dispatch({
    type: "hydrate",
    payload: {
      featureId: "media-analysis",
      projectIndex: {
        activeProjectId: null,
        projects: [],
      },
      workbench: {},
      sourceProbeStatus: "idle",
      reports: {
        user: null,
        ai: null,
        emptyReason: "Rapor henüz üretilmedi.",
      },
      activityFeed: [],
      workspace: {},
    },
  });

  assert.equal(getInspectionMode(store.getState()), "none");
  assert.equal(getRoiFocusActive(store.getState()), false);
  assert.equal(getActiveInspectionSnapshot(store.getState()), null);
});

void test("laboratory source changes clear semantic roi and reset inspection mode", () => {
  const store = createLabStore();

  store.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "video",
      mode: "local",
      storedPath: "/tmp/source-a.mp4",
    },
  });
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1000,
    endMs: 3000,
  });
  store.dispatch({
    type: "selection-roi-updated",
    roi: {
      x: 0.2,
      y: 0.2,
      width: 0.25,
      height: 0.25,
    },
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "visual",
  });
  store.dispatch({
    type: "selection-roi-focus-set",
    active: true,
  });
  store.dispatch({
    type: "selection-roi-snapshot-set",
    snapshot: {
      id: "snapshot-reset",
      objectUrl: "blob:roi-reset",
      width: 120,
      height: 120,
      sourceKind: "video",
      roi: {
        x: 0.2,
        y: 0.2,
        width: 0.25,
        height: 0.25,
      },
      createdAt: 2,
      timeMs: 1400,
    },
  });

  store.dispatch({
    type: "source-config-patched",
    patch: {
      storedPath: "/tmp/source-b.mp4",
    },
  });

  assert.equal(store.getState().ui.workspace.activeSelection, null);
  assert.equal(getInspectionMode(store.getState()), "none");
  assert.equal(getRoiFocusActive(store.getState()), false);
  assert.equal(getActiveInspectionSnapshot(store.getState()), null);
});

void test("laboratory source panel delete action removes a confirmed asset", () => {
  const originalElement = globalThis.Element;
  const sentEvents: Array<{ eventName: string; payload: Record<string, unknown> }> = [];
  const confirmMessages: string[] = [];
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
    store.dispatch({
      type: "asset-added",
      asset: {
        id: "asset-source-1",
        type: "source",
        name: "source.mp4",
        localPath: "/tmp/source.mp4",
        createdAt: 100,
      },
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
        confirm(message: string) {
          confirmMessages.push(message);
          return true;
        },
        addEventListener() {},
      } as unknown as Window,
    });
    controller.attach();

    const clickListener = documentRef.listeners.get("click");
    assert.ok(clickListener);

    clickListener({
      target: new TestElement("asset-remove", "asset-source-1"),
    } as unknown as Event);

    assert.equal(confirmMessages.length, 1);
    assert.match(confirmMessages[0] ?? "", /source\.mp4/);
    assert.deepEqual(
      sentEvents.map(function (event) {
        return {
          action: event.payload["action"],
          assetId: (event.payload["payload"] as Record<string, unknown>)["assetId"],
          eventName: event.eventName,
        };
      }),
      [{ eventName: "media-action", action: "asset-remove", assetId: "asset-source-1" }]
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

void test("laboratory asset delete actions stop when confirmation is rejected", () => {
  const originalElement = globalThis.Element;
  const sentEvents: Array<{ eventName: string; payload: Record<string, unknown> }> = [];
  const confirmMessages: string[] = [];
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
    store.dispatch({
      type: "asset-added",
      asset: {
        id: "asset-cancel-delete",
        type: "report",
        name: "keep-report.md",
        localPath: "/tmp/keep-report.md",
        createdAt: 300,
      },
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
        confirm(message: string) {
          confirmMessages.push(message);
          return false;
        },
        addEventListener() {},
      } as unknown as Window,
    });
    controller.attach();

    const clickListener = documentRef.listeners.get("click");
    assert.ok(clickListener);

    clickListener({
      target: new TestElement("asset-remove", "asset-cancel-delete"),
    } as unknown as Event);

    assert.deepEqual(sentEvents, []);
    assert.equal(confirmMessages.length, 1);
    assert.match(confirmMessages[0] ?? "", /keep-report\.md/);
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

void test("laboratory source panel media click opens workspace content without host source activation", () => {
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
    store.dispatch({
      type: "asset-added",
      asset: {
        id: "asset-source-1",
        type: "source",
        name: "source.mp4",
        localPath: "/tmp/source.mp4",
        createdAt: 100,
      },
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

    clickListener({
      target: new TestElement("workspace-asset-select", "asset-source-1"),
    } as unknown as Event);

    assert.equal(sentEvents.length, 0);
    assert.equal(store.getState().ui.activeWorkspaceAssetId, "asset-source-1");
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

void test("laboratory report overlay action opens the report overlay", () => {
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
        roomAPI: {
          sendEvent() {},
        },
        addEventListener() {},
      } as unknown as Window,
    });
    controller.attach();

    const clickListener = documentRef.listeners.get("click");
    assert.ok(clickListener);

    clickListener({
      target: new TestElement("open-report-overlay", "ai"),
    } as unknown as Event);

    assert.equal(store.getState().ui.workspace.reportOverlayOpen, true);
    assert.equal(store.getState().ui.reportView, "ai");
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

void test("laboratory document overlay action opens the shared overlay shell", () => {
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
        roomAPI: {
          sendEvent() {},
        },
        addEventListener() {},
      } as unknown as Window,
    });
    controller.attach();

    const clickListener = documentRef.listeners.get("click");
    assert.ok(clickListener);

    clickListener({
      target: new TestElement("open-document-overlay", "artifact-json-1"),
    } as unknown as Event);

    assert.equal(store.getState().ui.workspace.reportOverlayOpen, true);
    assert.equal(store.getState().ui.activeDocumentOverlayAssetId, "artifact-json-1");
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
