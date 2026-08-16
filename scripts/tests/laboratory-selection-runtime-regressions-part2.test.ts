import {
  __testOnlyLabPreviewInspectionController,
  assert,
  bindLabPreviewInspectionInteractions,
  bindLabSelectionRoiInteractions,
  bindLabSelectionSuggestionClicks,

  createLabEventBus,
  createLabPreviewInspectionController,
  createLabRunController,
  createLabStore,

  FakeClickEvent,
  FakeControllerDocument,
  FakeDomElement,
  FakeInspectionModeTarget,
  FakeInspectionModeTrigger,
  FakeKeyboardEvent,
  FakeOutsideTarget,
  FakePanelOnlyTarget,
  FakeRoiClearTarget,
  FakeRoiDrawTarget,
  FakeRoiStage,
  FakeSelectionSuggestionTarget,
  FakeSelectionSuggestionTrigger,
  FakeWindowEventTarget,
  getActiveExecutionIntent,
  getActiveInspectionSnapshot,
  getActiveSelection,
  getActiveSuggestionPreview,
  getActiveSuggestionPreviewId,
  getInspectionMode,
  getRoiFocusActive,
  getSelectionSuggestions,
  getWaveformTimelineModel,

  test,
} from "./laboratory-runtime-truth.helpers.ts";
import { getReadyAnalysisPreparationGroups } from "../../rooms/laboratory/runtime/lab-selectors.ts";


void test("image sources keep visual inspection ready for analysis setup", () => {
  const store = createLabStore();
  store.dispatch({
    type: "hydrate",
    payload: {
      featureId: "media-analysis",
      projectIndex: {
        activeProjectId: "project-image-analysis",
        projects: [],
      },
      workbench: {},
      source: {
        status: "ready",
        kind: "image",
        mode: "local",
        previewUrl: "file:///tmp/source.png",
        routeLabel: "Local Copy",
        storedPath: "/tmp/source.png",
        metadata: {
          width: 1534,
          height: 1024,
        },
      },
      sourceProbeStatus: "completed",
      workspace: {},
      reports: {
        user: null,
        ai: null,
        emptyReason: null,
      },
      activityFeed: [],
      lastRun: null,
    },
  });

  const readyCapabilityIds = getReadyAnalysisPreparationGroups(store.getState()).map(function (group) {
    return group.capabilityId;
  });

  assert.ok(readyCapabilityIds.includes("visual-forensics"));
});

void test("selection suggestion binder emits a passive selection suggestion event", () => {
  const documentRef = new FakeControllerDocument();
  const eventBus = createLabEventBus();
  const store = createLabStore();
  eventBus.subscribe(store.dispatch);
  bindLabSelectionSuggestionClicks({
    canPreviewSuggestion(suggestionId) {
      return getSelectionSuggestions(store.getState()).some(function (suggestion) {
        return suggestion.id === suggestionId;
      });
    },
    documentRef: documentRef,
    emit: eventBus.emit,
    getActivePreviewSuggestionId() {
      return getActiveSuggestionPreviewId(store.getState());
    },
  });

  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1200,
    endMs: 2600,
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });

  const clickListener = documentRef.listeners.get("click");
  assert.ok(clickListener);

  const clickEvent = new FakeClickEvent(
    new FakeSelectionSuggestionTarget(
      new FakeSelectionSuggestionTrigger("audio-inspect")
    ) as unknown as EventTarget
  );
  clickListener?.(clickEvent as unknown as Event);

  assert.equal(clickEvent.defaultPrevented, true);
  assert.equal(getInspectionMode(store.getState()), "audio");
  assert.equal(store.getState().ui.activeSuggestionPreviewId, "audio-inspect");
  assert.equal(getActiveSuggestionPreview(store.getState())?.title, "Ses analizi yapilacak");
  assert.equal(store.getState().run, null);
  assert.equal(
    eventBus.getHistory().some(function (event) {
      return (
        event.type === "workspace-selection-suggestion-clicked" &&
        event.suggestionId === "audio-inspect"
      );
    }),
    true
  );
  assert.equal(
    eventBus.getHistory().some(function (event) {
      return (
        event.type === "workspace-selection-suggestion-preview-set" &&
        event.suggestionId === "audio-inspect"
      );
    }),
    true
  );
});

void test("selection suggestion binder previews expanded timeline suggestions shown in the panel", () => {
  const documentRef = new FakeControllerDocument();
  const eventBus = createLabEventBus();
  const store = createLabStore();
  eventBus.subscribe(store.dispatch);
  bindLabSelectionSuggestionClicks({
    canPreviewSuggestion(suggestionId) {
      const visibleSuggestions = getWaveformTimelineModel(store.getState()).selectionSuggestions;
      return visibleSuggestions.some(function (suggestion) {
        return suggestion.id === suggestionId;
      });
    },
    documentRef: documentRef,
    emit: eventBus.emit,
    getActivePreviewSuggestionId() {
      return getActiveSuggestionPreviewId(store.getState());
    },
  });

  store.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "video",
      mode: "local",
      storedPath: "/tmp/source.mp4",
    },
  });
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1200,
    endMs: 2600,
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });

  const clickListener = documentRef.listeners.get("click");
  assert.ok(clickListener);

  const clickEvent = new FakeClickEvent(
    new FakeSelectionSuggestionTarget(
      new FakeSelectionSuggestionTrigger("clean-audio")
    ) as unknown as EventTarget
  );
  clickListener?.(clickEvent as unknown as Event);

  assert.equal(clickEvent.defaultPrevented, true);
  assert.equal(store.getState().ui.activeSuggestionPreviewId, null);
  assert.equal(getActiveSuggestionPreview(store.getState()), null);
});

void test("selection suggestion binder gates soft execution intent actions by the exact active preview id", () => {
  class FakeClosestTarget extends FakeDomElement {
    constructor(private readonly selectors: Record<string, object | null>) {
      super();
    }

    override closest(selector?: string): any {
      return (this.selectors[selector ?? ""] ?? null);
    }
  }

  class FakeExecutionIntentTrigger {
    constructor(
      private readonly attrName: string,
      private readonly suggestionId: string | null
    ) {}

    getAttribute(name: string) {
      return name === this.attrName ? this.suggestionId : null;
    }
  }

  const documentRef = new FakeControllerDocument();
  const eventBus = createLabEventBus();
  const store = createLabStore();
  eventBus.subscribe(store.dispatch);
  bindLabSelectionSuggestionClicks({
    canPreviewSuggestion(suggestionId) {
      return getSelectionSuggestions(store.getState()).some(function (suggestion) {
        return suggestion.id === suggestionId;
      });
    },
    documentRef: documentRef,
    emit: eventBus.emit,
    getActivePreviewSuggestionId() {
      return getActiveSuggestionPreviewId(store.getState());
    },
  });

  store.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "audio",
      mode: "local",
      storedPath: "/tmp/source.wav",
    },
  });
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1200,
    endMs: 2600,
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "audio-inspect",
  });

  const clickListener = documentRef.listeners.get("click");
  assert.ok(clickListener);

  clickListener?.({
    target: new FakeClosestTarget({
      "[data-lab-execution-intent-accept]": new FakeExecutionIntentTrigger(
        "data-lab-execution-intent-accept",
        "extract-clip"
      ),
    }) as unknown as EventTarget,
    preventDefault() {
      throw new Error("mismatched preview ids should not be consumed");
    },
  } as unknown as Event);
  assert.equal(getActiveExecutionIntent(store.getState()), null);

  const acceptEvent = new FakeClickEvent(
    new FakeClosestTarget({
      "[data-lab-execution-intent-accept]": new FakeExecutionIntentTrigger(
        "data-lab-execution-intent-accept",
        "audio-inspect"
      ),
    }) as unknown as EventTarget
  );
  clickListener?.(acceptEvent as unknown as Event);
  assert.equal(acceptEvent.defaultPrevented, true);
  assert.equal(getActiveExecutionIntent(store.getState())?.id, "audio-inspect");

  const queueEvent = new FakeClickEvent(
    new FakeClosestTarget({
      "[data-lab-execution-intent-queue]": new FakeExecutionIntentTrigger(
        "data-lab-execution-intent-queue",
        "audio-inspect"
      ),
    }) as unknown as EventTarget
  );
  clickListener?.(queueEvent as unknown as Event);
  assert.equal(queueEvent.defaultPrevented, true);
  assert.equal(store.getState().ui.activeSuggestionPreviewId, null);

  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "audio-inspect",
  });

  const dismissEvent = new FakeClickEvent(
    new FakeClosestTarget({
      "[data-lab-execution-intent-dismiss]": new FakeExecutionIntentTrigger(
        "data-lab-execution-intent-dismiss",
        "audio-inspect"
      ),
    }) as unknown as EventTarget
  );
  clickListener?.(dismissEvent as unknown as Event);
  assert.equal(dismissEvent.defaultPrevented, true);
  assert.equal(getActiveExecutionIntent(store.getState()), null);
  assert.equal(store.getState().ui.activeSuggestionPreviewId, null);

  const clearEvent = new FakeClickEvent(
    new FakeClosestTarget({
      "[data-lab-execution-intent-clear]": {},
    }) as unknown as EventTarget
  );
  clickListener?.(clearEvent as unknown as Event);
  assert.equal(clearEvent.defaultPrevented, true);

  assert.equal(
    eventBus.getHistory().some(function (event) {
      return (
        event.type === "workspace-selection-suggestion-accepted" &&
        event.suggestionId === "audio-inspect"
      );
    }),
    true
  );
  assert.equal(
    eventBus.getHistory().some(function (event) {
      return (
        event.type === "workspace-selection-suggestion-dismissed" &&
        event.suggestionId === "audio-inspect"
      );
    }),
    true
  );
  assert.equal(
    eventBus.getHistory().some(function (event) {
      return (
        event.type === "workspace-selection-suggestion-queued" &&
        event.suggestionId === "audio-inspect"
      );
    }),
    true
  );
  assert.equal(
    eventBus.getHistory().some(function (event) {
      return event.type === "workspace-execution-intent-cleared";
    }),
    true
  );
});

void test("selection roi binder enforces minimum drag size and emits passive roi + inspection events", () => {
  const documentRef = new FakeControllerDocument();
  const eventBus = createLabEventBus();
  const store = createLabStore();
  eventBus.subscribe(store.dispatch);
  bindLabSelectionRoiInteractions({
    documentRef: documentRef,
    emit: eventBus.emit,
    getActiveSelection() {
      return store.getState().ui.workspace.activeSelection;
    },
    getSourceKind() {
      return "video";
    },
  });

  store.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "video",
      mode: "local",
      storedPath: "/tmp/source.mp4",
    },
  });
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1000,
    endMs: 3000,
  });

  const mouseDownListener = documentRef.listeners.get("mousedown");
  const mouseMoveListener = documentRef.listeners.get("mousemove");
  const mouseUpListener = documentRef.listeners.get("mouseup");
  const clickListener = documentRef.listeners.get("click");
  assert.ok(mouseDownListener);
  assert.ok(mouseMoveListener);
  assert.ok(mouseUpListener);
  assert.ok(clickListener);

  const stage = new FakeRoiStage(
    {
      "data-lab-selection-roi-controls-reserve": "0",
    },
    {
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      bottom: 100,
    }
  );

  mouseDownListener?.({
    button: 0,
    clientX: 10,
    clientY: 10,
    preventDefault() {},
    target: new FakeRoiDrawTarget(stage) as unknown as EventTarget,
  } as unknown as Event);
  mouseMoveListener?.({
    clientX: 14,
    clientY: 15,
    preventDefault() {},
  } as unknown as Event);

  assert.equal(store.getState().ui.workspace.activeSelection?.roi, undefined);

  mouseMoveListener?.({
    clientX: 70,
    clientY: 60,
    preventDefault() {},
  } as unknown as Event);
  mouseUpListener?.({} as unknown as Event);

  assert.deepEqual(store.getState().ui.workspace.activeSelection?.roi, {
    x: 0.05,
    y: 0.1,
    width: 0.3,
    height: 0.5,
  });

  clickListener?.(
    new FakeClickEvent(
      new FakeInspectionModeTarget(
        new FakeInspectionModeTrigger("motion")
      ) as unknown as EventTarget
    ) as unknown as Event
  );
  assert.equal(getInspectionMode(store.getState()), "motion");

  clickListener?.(
    new FakeClickEvent(new FakeRoiClearTarget() as unknown as EventTarget) as unknown as Event
  );
  assert.equal(store.getState().ui.workspace.activeSelection?.roi, undefined);
});

void test("selection roi binder tags comparison side roi updates from the active image pane", () => {
  const documentRef = new FakeControllerDocument();
  const eventBus = createLabEventBus();
  const store = createLabStore();
  eventBus.subscribe(store.dispatch);
  bindLabSelectionRoiInteractions({
    documentRef: documentRef,
    emit: eventBus.emit,
    getActiveSelection() {
      return store.getState().ui.workspace.activeSelection;
    },
    getComparisonRoi(side) {
      return store.getState().ui.workspace.comparisonRois[side];
    },
    getSourceKind() {
      return "image";
    },
  });
  store.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "image",
      mode: "local",
      storedPath: "/tmp/comparison-primary.png",
    },
  });

  const mouseDownListener = documentRef.listeners.get("mousedown");
  const mouseMoveListener = documentRef.listeners.get("mousemove");
  const mouseUpListener = documentRef.listeners.get("mouseup");
  assert.ok(mouseDownListener);
  assert.ok(mouseMoveListener);
  assert.ok(mouseUpListener);

  const primaryStage = new FakeRoiStage(
    {
      "data-lab-comparison-roi-side": "primary",
      "data-lab-selection-roi-controls-reserve": "0",
    },
    {
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      bottom: 100,
    }
  );
  mouseDownListener?.({
    button: 0,
    clientX: 20,
    clientY: 10,
    preventDefault() {},
    target: new FakeRoiDrawTarget(primaryStage) as unknown as EventTarget,
  } as unknown as Event);
  mouseMoveListener?.({
    clientX: 100,
    clientY: 60,
    preventDefault() {},
  } as unknown as Event);
  mouseUpListener?.({} as unknown as Event);

  assert.equal(store.getState().ui.workspace.comparisonRois.activeSide, "primary");
  assert.deepEqual(store.getState().ui.workspace.comparisonRois.primary, {
    x: 0.1,
    y: 0.1,
    width: 0.4,
    height: 0.5,
  });

  const referenceStage = new FakeRoiStage(
    {
      "data-lab-comparison-roi-side": "reference",
      "data-lab-selection-roi-controls-reserve": "0",
    },
    {
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      bottom: 100,
    }
  );
  mouseDownListener?.({
    button: 0,
    clientX: 30,
    clientY: 20,
    preventDefault() {},
    target: new FakeRoiDrawTarget(referenceStage) as unknown as EventTarget,
  } as unknown as Event);
  mouseUpListener?.({} as unknown as Event);

  assert.equal(store.getState().ui.workspace.comparisonRois.activeSide, "reference");
  assert.equal(store.getState().ui.workspace.activeSelection, null);

  mouseDownListener?.({
    button: 0,
    clientX: 30,
    clientY: 20,
    preventDefault() {},
    target: new FakeRoiDrawTarget(referenceStage) as unknown as EventTarget,
  } as unknown as Event);
  mouseMoveListener?.({
    clientX: 120,
    clientY: 70,
    preventDefault() {},
  } as unknown as Event);
  mouseUpListener?.({} as unknown as Event);

  assert.equal(store.getState().ui.workspace.comparisonRois.activeSide, "reference");
  assert.deepEqual(store.getState().ui.workspace.comparisonRois.reference, {
    x: 0.15,
    y: 0.2,
    width: 0.45,
    height: 0.5,
  });
  assert.deepEqual(store.getState().ui.workspace.activeSelection?.roi, {
    x: 0.15,
    y: 0.2,
    width: 0.45,
    height: 0.5,
  });
});

void test("selection roi redraw binder ignores the existing roi so double-click focus wins precedence", () => {
  class FakeExistingSelectionRoiTarget extends FakeDomElement {
    override closest(selector?: string): any {
      if (selector === "[data-lab-selection-roi-ignore='true']") {
        return {} as object;
      }
      if (selector === "[data-lab-selection-roi='true']") {
        return {} as object;
      }
      return null;
    }
  }

  const documentRef = new FakeControllerDocument();
  const eventBus = createLabEventBus();
  const store = createLabStore();
  eventBus.subscribe(store.dispatch);
  const calls: string[] = [];

  bindLabSelectionRoiInteractions({
    documentRef: documentRef,
    emit: eventBus.emit,
    getActiveSelection() {
      return store.getState().ui.workspace.activeSelection;
    },
    getSourceKind() {
      return "video";
    },
  });
  bindLabPreviewInspectionInteractions({
    controller: {
      captureSnapshot() {
        return false;
      },
      clearFocus() {
        return false;
      },
      clearSnapshot() {
        return false;
      },
      stepFrame() {
        return false;
      },
      toggleFocus() {
        calls.push("toggle-focus");
        return true;
      },
    },
    documentRef: documentRef,
  });

  store.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "video",
      mode: "local",
      storedPath: "/tmp/source.mp4",
    },
  });
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1_000,
    endMs: 3_000,
  });
  store.dispatch({
    type: "selection-roi-updated",
    roi: {
      x: 0.1,
      y: 0.1,
      width: 0.25,
      height: 0.3,
    },
  });

  const initialRoi = store.getState().ui.workspace.activeSelection?.roi;
  const mouseDownListener = documentRef.listeners.get("mousedown");
  const mouseMoveListener = documentRef.listeners.get("mousemove");
  const dblClickListener = documentRef.listeners.get("dblclick");
  assert.ok(mouseDownListener);
  assert.ok(mouseMoveListener);
  assert.ok(dblClickListener);

  mouseDownListener?.({
    button: 0,
    clientX: 24,
    clientY: 24,
    preventDefault() {},
    target: new FakeExistingSelectionRoiTarget() as unknown as EventTarget,
  } as unknown as Event);
  mouseMoveListener?.({
    clientX: 80,
    clientY: 64,
    preventDefault() {},
  } as unknown as Event);
  dblClickListener?.({
    target: new FakeExistingSelectionRoiTarget() as unknown as EventTarget,
    preventDefault() {},
    stopImmediatePropagation() {},
  } as unknown as Event);

  assert.deepEqual(store.getState().ui.workspace.activeSelection?.roi, initialRoi);
  assert.deepEqual(calls, ["toggle-focus"]);
});

void test("preview inspection binder routes focus, stepping, capture, and escape without touching form fields", () => {
  class FakeClosestTarget extends FakeDomElement {
    constructor(private readonly selectors: Record<string, object | null>) {
      super();
    }

    override closest(selector?: string): any {
      return (this.selectors[selector ?? ""] ?? null);
    }
  }

  const documentRef = new FakeControllerDocument();
  const calls: string[] = [];
  bindLabPreviewInspectionInteractions({
    controller: {
      captureSnapshot() {
        calls.push("capture");
        return true;
      },
      clearFocus() {
        calls.push("clear-focus");
        return true;
      },
      clearSnapshot() {
        calls.push("clear-snapshot");
        return true;
      },
      stepFrame(direction) {
        calls.push(direction < 0 ? "step-backward" : "step-forward");
        return true;
      },
      toggleFocus() {
        calls.push("toggle-focus");
        return true;
      },
    },
    documentRef: documentRef,
  });

  const clickListener = documentRef.listeners.get("click");
  const dblClickListener = documentRef.listeners.get("dblclick");
  const keydownListener = documentRef.listeners.get("keydown");
  assert.ok(clickListener);
  assert.ok(dblClickListener);
  assert.ok(keydownListener);

  clickListener?.({
    target: new FakeClosestTarget({
      "[data-lab-selection-roi-focus-toggle]": {},
    }) as unknown as EventTarget,
    preventDefault() {},
    stopImmediatePropagation() {},
  } as unknown as Event);
  clickListener?.({
    target: new FakeClosestTarget({
      "[data-lab-selection-roi-capture]": {},
    }) as unknown as EventTarget,
    preventDefault() {},
    stopImmediatePropagation() {},
  } as unknown as Event);
  clickListener?.({
    target: new FakeClosestTarget({
      "[data-lab-preview-inspection-stage='true']": {},
    }) as unknown as EventTarget,
    preventDefault() {},
    stopImmediatePropagation() {},
  } as unknown as Event);
  dblClickListener?.({
    target: new FakeClosestTarget({
      "[data-lab-selection-roi='true']": {},
    }) as unknown as EventTarget,
    preventDefault() {},
    stopImmediatePropagation() {},
  } as unknown as Event);
  keydownListener?.({
    key: "ArrowRight",
    target: new FakeOutsideTarget() as unknown as EventTarget,
    preventDefault() {},
    stopImmediatePropagation() {},
  } as unknown as Event);
  keydownListener?.({
    key: "Escape",
    target: new FakeOutsideTarget() as unknown as EventTarget,
    preventDefault() {},
    stopImmediatePropagation() {},
  } as unknown as Event);
  keydownListener?.({
    key: "ArrowLeft",
    target: new FakeClosestTarget({
      "input, textarea, select, [contenteditable='true']": {},
    }) as unknown as EventTarget,
    preventDefault() {
      throw new Error("editable targets should be ignored");
    },
    stopImmediatePropagation() {
      throw new Error("editable targets should be ignored");
    },
  } as unknown as Event);

  assert.deepEqual(calls, [
    "toggle-focus",
    "capture",
    "toggle-focus",
    "step-forward",
    "clear-focus",
  ]);
});

void test("preview inspection controller focuses roi, captures a snapshot, and clears stale state on topology loss", async () => {
  const eventBus = createLabEventBus();
  const store = createLabStore();
  eventBus.subscribe(store.dispatch);

  store.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "video",
      mode: "local",
      storedPath: "/tmp/source.mp4",
    },
  });
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1_000,
    endMs: 3_000,
  });
  store.dispatch({
    type: "selection-roi-updated",
    roi: {
      x: 0.2,
      y: 0.15,
      width: 0.3,
      height: 0.35,
    },
  });

  const capturedDrawCalls: unknown[][] = [];
  const fakeCanvas = {
    height: 0,
    width: 0,
    getContext() {
      return {
        drawImage(...args: unknown[]) {
          capturedDrawCalls.push(args);
        },
      };
    },
    toDataURL() {
      return "data:image/png;base64,roi";
    },
  };

  const contentStyle = {
    transform: "",
    transformOrigin: "",
  };
  const content = {
    getAttribute() {
      return null;
    },
    getBoundingClientRect() {
      return {
        height: 200,
        left: 0,
        top: 0,
        width: 400,
      };
    },
    querySelector() {
      return null;
    },
    setAttribute() {},
    style: contentStyle,
  };
  const video = {
    currentSrc: "file:///tmp/source.mp4",
    currentTime: 1,
    duration: 8,
    getAttribute(name: string) {
      return name === "src" ? this.currentSrc : null;
    },
    pauseCalls: 0,
    pause() {
      this.pauseCalls += 1;
      this.paused = true;
    },
    paused: false,
    videoHeight: 400,
    videoWidth: 800,
  };

  let stageAvailable = true;
  const stageAttributes = new Map<string, string>([
    ["data-lab-preview-inspection-topology", "single-video"],
  ]);
  const stage = {
    getAttribute(name: string) {
      return stageAttributes.get(name) ?? null;
    },
    getBoundingClientRect() {
      return {
        height: 200,
        left: 0,
        top: 0,
        width: 400,
      };
    },
    querySelector(selector: string) {
      if (selector === "[data-lab-preview-inspection-content='true']") {
        return content as unknown as Element;
      }
      if (selector === "video[data-lab-preserve-media], img[data-lab-preserve-media]") {
        return video as unknown as Element;
      }
      return null;
    },
    setAttribute(name: string, value: string) {
      stageAttributes.set(name, value);
    },
    style: undefined,
  };

  const controller = createLabPreviewInspectionController({
    documentRef: {
      createElement() {
        return fakeCanvas as unknown as HTMLElement;
      },
      querySelector(selector: string) {
        if (selector === "[data-lab-preview-inspection-stage='true']" && stageAvailable) {
          return stage as unknown as Element;
        }
        return null;
      },
    } as unknown as Document,
    emit: eventBus.emit,
    getActiveSelection() {
      return getActiveSelection(store.getState());
    },
    getActiveSnapshot() {
      return getActiveInspectionSnapshot(store.getState());
    },
    getRoiFocusActive() {
      return getRoiFocusActive(store.getState());
    },
    windowRef: {
      URL,
    } as unknown as Window,
  });

  assert.equal(controller.setFocusActive(true), true);
  controller.sync();
  assert.equal(getRoiFocusActive(store.getState()), true);
  assert.match(contentStyle.transform, /scale/);
  assert.equal(
    __testOnlyLabPreviewInspectionController.computeFocusTransform(
      {
        width: 400,
        height: 200,
      },
      store.getState().ui.workspace.activeSelection!["roi"]!
    )?.scale,
    2.857142857142857
  );

  assert.equal(controller.stepFrame(1), true);
  assert.equal(video.pauseCalls, 1);
  assert.ok(video.currentTime > 1);

  assert.equal(await controller.captureSnapshot(), true);
  assert.equal(getActiveInspectionSnapshot(store.getState())?.width, 240);
  assert.equal(getActiveInspectionSnapshot(store.getState())?.height, 140);
  assert.deepEqual(capturedDrawCalls[0]?.slice(1, 5), [160, 60, 240, 140]);

  stageAvailable = false;
  controller.sync();

  assert.equal(getRoiFocusActive(store.getState()), false);
  assert.equal(getActiveInspectionSnapshot(store.getState()), null);
});

void test("preview inspection controller ignores snapshot capture when roi is below the minimum size guard", async () => {
  const eventBus = createLabEventBus();
  const store = createLabStore();
  eventBus.subscribe(store.dispatch);

  store.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "video",
      mode: "local",
      storedPath: "/tmp/source.mp4",
    },
  });
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1_000,
    endMs: 3_000,
  });
  store.dispatch({
    type: "selection-roi-updated",
    roi: {
      x: 0.1,
      y: 0.1,
      width: 0.05,
      height: 0.05,
    },
  });

  let createElementCalls = 0;
  const stage = {
    getAttribute(name: string) {
      return name === "data-lab-preview-inspection-topology" ? "single-video" : null;
    },
    getBoundingClientRect() {
      return {
        height: 100,
        left: 0,
        top: 0,
        width: 100,
      };
    },
    querySelector(selector: string) {
      if (selector === "[data-lab-preview-inspection-content='true']") {
        return {
          getAttribute() {
            return null;
          },
          getBoundingClientRect() {
            return {
              height: 100,
              left: 0,
              top: 0,
              width: 100,
            };
          },
          querySelector() {
            return null;
          },
          setAttribute() {},
          style: {
            transform: "",
            transformOrigin: "",
          },
        } as unknown as Element;
      }
      if (selector === "video[data-lab-preserve-media], img[data-lab-preserve-media]") {
        return {
          currentSrc: "file:///tmp/source.mp4",
          currentTime: 1,
          duration: 8,
          getAttribute(sourceName: string) {
            return sourceName === "src" ? (this as any).currentSrc : null;
          },
          pause() {},
          paused: true,
          videoHeight: 400,
          videoWidth: 800,
        } as unknown as Element;
      }
      return null;
    },
    setAttribute() {},
    style: undefined,
  };

  const controller = createLabPreviewInspectionController({
    documentRef: {
      createElement() {
        createElementCalls += 1;
        throw new Error("snapshot capture should stop before canvas allocation");
      },
      querySelector(selector: string) {
        if (selector === "[data-lab-preview-inspection-stage='true']") {
          return stage as unknown as Element;
        }
        return null;
      },
    },
    emit: eventBus.emit,
    getActiveSelection() {
      return getActiveSelection(store.getState());
    },
    getActiveSnapshot() {
      return getActiveInspectionSnapshot(store.getState());
    },
    getRoiFocusActive() {
      return getRoiFocusActive(store.getState());
    },
    windowRef: {
      URL: {
        createObjectURL() {
          return "blob:ignored";
        },
        revokeObjectURL() {},
      },
    } as unknown as Window,
  });

  assert.equal(await controller.captureSnapshot(), false);
  assert.equal(createElementCalls, 0);
  assert.equal(getActiveInspectionSnapshot(store.getState()), null);
});

void test("selection suggestion preview dismissal stays stable with stacked document listeners", () => {
  const originalElement = globalThis.Element;
  const documentRef = new FakeControllerDocument();
  const eventBus = createLabEventBus();
  const store = createLabStore();
  const controller = createLabRunController({
    documentRef: documentRef as unknown as Document,
    eventBus,
    store,
    windowRef: new FakeWindowEventTarget() as unknown as Window,
  });

  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: FakeDomElement,
  });
  try {
    eventBus.subscribe(store.dispatch);
    bindLabSelectionSuggestionClicks({
      canPreviewSuggestion(suggestionId) {
        return getSelectionSuggestions(store.getState()).some(function (suggestion) {
          return suggestion.id === suggestionId;
        });
      },
      documentRef: documentRef,
      emit: eventBus.emit,
      getActivePreviewSuggestionId() {
        return getActiveSuggestionPreviewId(store.getState());
      },
    });
    controller.attach();

    store.dispatch({
      type: "source-config-patched",
      patch: {
        kind: "audio",
        mode: "local",
        storedPath: "/tmp/source.wav",
      },
    });
    store.dispatch({
      type: "workspace-timeline-updated",
      startMs: 1200,
      endMs: 2600,
    });
    store.dispatch({
      type: "selection-inspection-mode-updated",
      mode: "audio",
    });

    const clickListener = documentRef.listeners.get("click");
    const keydownListener = documentRef.listeners.get("keydown");
    assert.ok(clickListener);
    assert.ok(keydownListener);

    clickListener?.(
      new FakeClickEvent(
        new FakeSelectionSuggestionTarget(
          new FakeSelectionSuggestionTrigger("audio-inspect")
        ) as unknown as EventTarget
      ) as unknown as Event
    );
    assert.equal(store.getState().ui.activeSuggestionPreviewId, "audio-inspect");

    clickListener?.(
      new FakeClickEvent(new FakePanelOnlyTarget() as unknown as EventTarget) as unknown as Event
    );
    assert.equal(store.getState().ui.activeSuggestionPreviewId, "audio-inspect");

    clickListener?.(
      new FakeClickEvent(new FakeOutsideTarget() as unknown as EventTarget) as unknown as Event
    );
    assert.equal(store.getState().ui.activeSuggestionPreviewId, null);

    clickListener?.(
      new FakeClickEvent(
        new FakeSelectionSuggestionTarget(
          new FakeSelectionSuggestionTrigger("audio-inspect")
        ) as unknown as EventTarget
      ) as unknown as Event
    );
    assert.equal(store.getState().ui.activeSuggestionPreviewId, "audio-inspect");

    const escapeEvent = new FakeKeyboardEvent("Escape");
    keydownListener?.(escapeEvent as unknown as Event);
    assert.equal(escapeEvent.defaultPrevented, true);
    assert.equal(store.getState().ui.activeSuggestionPreviewId, null);
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

void test("selection suggestion accept checks the mapped analysis without auto-running it", () => {
  class FakeExecutionIntentAcceptTrigger {
    constructor(private readonly suggestionId: string | null) {}

    getAttribute(name: string) {
      return name === "data-lab-execution-intent-accept" ? this.suggestionId : null;
    }
  }

  class FakeExecutionIntentAcceptTarget extends FakeDomElement {
    constructor(private readonly trigger: FakeExecutionIntentAcceptTrigger | null) {
      super();
    }

    override closest(selector?: string): any {
      return selector === "[data-lab-execution-intent-accept]" ? this.trigger : null;
    }
  }

  const documentRef = new FakeControllerDocument();
  const eventBus = createLabEventBus();
  const store = createLabStore();
  const sentActions: string[] = [];
  const prompts: string[] = [];

  eventBus.subscribe(store.dispatch);
  bindLabSelectionSuggestionClicks({
    canPreviewSuggestion(suggestionId) {
      return getSelectionSuggestions(store.getState()).some(function (suggestion) {
        return suggestion.id === suggestionId;
      });
    },
    documentRef: documentRef,
    emit: eventBus.emit,
    getActivePreviewSuggestionId() {
      return getActiveSuggestionPreviewId(store.getState());
    },
  });
  createLabRunController({
    documentRef: documentRef as unknown as Document,
    eventBus,
    store,
    windowRef: {
      roomAPI: {
        sendEvent(_eventName: string, payload: Record<string, unknown>) {
          if (typeof payload["action"] === "string") {
            sentActions.push(payload["action"]);
          }
        },
      },
      addEventListener() {},
      prompt(message: string) {
        prompts.push(message);
        return "tamamı";
      },
    } as unknown as Window,
  });

  store.dispatch({
    type: "hydrate",
    payload: {
      featureId: "media-analysis",
      projectIndex: {
        activeProjectId: "project-audio-source",
        projects: [],
      },
      workbench: {
        analysisScope: {
          focus: "visual",
          lifecycle: {
            frozenAt: "2026-05-09T00:00:00.000Z",
            mutable: false,
            processId: "stale-process",
          },
          region: {
            height: 90,
            width: 120,
            x: 10,
            y: 20,
          },
          timeRange: {
            endMs: 9999,
            startMs: 8888,
          },
        },
      },
      source: {
        status: "ready",
        kind: "audio",
        mode: "local",
        routeLabel: "Local Copy",
        storedPath: "/tmp/source.wav",
        metadata: { durationSeconds: 4 },
      },
      sourceProbeStatus: "completed",
      toolState: {
        tools: {
          ffmpeg: { installed: true },
          pyaudioanalysis: { installed: true },
        },
      },
      workspace: {},
      reports: {
        user: null,
        ai: null,
        emptyReason: null,
      },
      activityFeed: [],
      lastRun: null,
    },
  });
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1200,
    endMs: 2600,
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });

  const clickListener = documentRef.listeners.get("click");
  assert.ok(clickListener);
  clickListener?.(
    new FakeClickEvent(
      new FakeSelectionSuggestionTarget(
        new FakeSelectionSuggestionTrigger("audio-inspect")
      ) as unknown as EventTarget
    ) as unknown as Event
  );

  const acceptEvent = new FakeClickEvent(
    new FakeExecutionIntentAcceptTarget(
      new FakeExecutionIntentAcceptTrigger("audio-inspect")
    ) as unknown as EventTarget
  );
  clickListener?.(acceptEvent as unknown as Event);

  const state = store.getState();
  assert.equal(acceptEvent.defaultPrevented, true);
  assert.deepEqual(state.selectedCapabilities, ["audio-signal"]);
  assert.equal(state.ui.workspace.selectionTabActive, false);
  assert.equal(sentActions.includes("audio-process-run"), false);
  assert.equal(sentActions.includes("profile-run-preflight"), false);
  assert.equal(prompts.length, 0);
  assert.equal(state.run, null);
});

void test("selection suggestion binder ignores invalid preview ids while keeping passive click history", () => {
  const documentRef = new FakeControllerDocument();
  const eventBus = createLabEventBus();
  const store = createLabStore();

  eventBus.subscribe(store.dispatch);
  bindLabSelectionSuggestionClicks({
    canPreviewSuggestion(suggestionId) {
      return getSelectionSuggestions(store.getState()).some(function (suggestion) {
        return suggestion.id === suggestionId;
      });
    },
    documentRef: documentRef,
    emit: eventBus.emit,
    getActivePreviewSuggestionId() {
      return getActiveSuggestionPreviewId(store.getState());
    },
  });

  store.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "audio",
      mode: "local",
      storedPath: "/tmp/source.wav",
    },
  });
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1200,
    endMs: 2600,
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });

  const clickListener = documentRef.listeners.get("click");
  assert.ok(clickListener);

  const clickEvent = new FakeClickEvent(
    new FakeSelectionSuggestionTarget(
      new FakeSelectionSuggestionTrigger("stale-suggestion-id")
    ) as unknown as EventTarget
  );
  clickListener?.(clickEvent as unknown as Event);

  assert.equal(clickEvent.defaultPrevented, true);
  assert.equal(store.getState().ui.activeSuggestionPreviewId, null);
  assert.equal(getActiveSuggestionPreview(store.getState()), null);
  assert.equal(
    eventBus.getHistory().some(function (event) {
      return (
        event.type === "workspace-selection-suggestion-clicked" &&
        event.suggestionId === "stale-suggestion-id"
      );
    }),
    true
  );
  assert.equal(
    eventBus.getHistory().some(function (event) {
      return event.type === "workspace-selection-suggestion-preview-set";
    }),
    false
  );
});

void test("laboratory store rejects invalid selection preview-set events", () => {
  const store = createLabStore();

  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "audio-inspect",
  });
  assert.equal(store.getState().ui.activeSuggestionPreviewId, null);

  store.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "audio",
      mode: "local",
      storedPath: "/tmp/source.wav",
    },
  });
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1200,
    endMs: 2600,
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });

  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "enhance-visual",
  });
  assert.equal(store.getState().ui.activeSuggestionPreviewId, null);

  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "audio-inspect",
  });
  assert.equal(store.getState().ui.activeSuggestionPreviewId, "audio-inspect");
});

void test("selection suggestion clicks stay fenced from analysis selection and run execution", () => {
  const documentRef = new FakeControllerDocument();
  const eventBus = createLabEventBus();
  const store = createLabStore();
  const baseWorkspace = store.getState().ui.workspace;

  eventBus.subscribe(store.dispatch);
  bindLabSelectionSuggestionClicks({
    canPreviewSuggestion(suggestionId) {
      return getSelectionSuggestions(store.getState()).some(function (suggestion) {
        return suggestion.id === suggestionId;
      });
    },
    documentRef: documentRef,
    emit: eventBus.emit,
    getActivePreviewSuggestionId() {
      return getActiveSuggestionPreviewId(store.getState());
    },
  });

  store.dispatch({
    type: "hydrate",
    payload: {
      featureId: "media-analysis",
      projectIndex: {
        activeProjectId: "project-1",
        projects: [],
      },
      workbench: {},
      source: {
        kind: "audio",
        mode: "local",
        storedPath: "/tmp/source.wav",
      },
      sourceProbeStatus: "completed",
      workspace: {
        ...baseWorkspace,
        timelineStartMs: 2400,
        timelineEndMs: 5600,
      },
      reports: {
        user: null,
        ai: null,
        emptyReason: null,
      },
      activityFeed: [],
      lastRun: {
        id: "run-1",
        state: "completed",
        startedAt: Date.now() - 5000,
        endedAt: Date.now() - 1000,
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
        progress: 100,
        emptyReason: null,
        analysisScope: {
          focus: "visual",
          timeRange: {
            startMs: 2400,
            endMs: 5600,
          },
          hypothesis: "frozen clue",
        },
        previewArtifacts: [],
        confidence: "medium",
        moduleTrace: [],
        comparisonVariants: [],
        hypothesisSummary: "frozen clue",
      },
    },
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });

  const clickListener = documentRef.listeners.get("click");
  assert.ok(clickListener);

  const clickEvent = new FakeClickEvent(
    new FakeSelectionSuggestionTarget(
      new FakeSelectionSuggestionTrigger("audio-inspect")
    ) as unknown as EventTarget
  );
  clickListener?.(clickEvent as unknown as Event);

  const state = store.getState();
  assert.equal(clickEvent.defaultPrevented, true);
  assert.equal(getInspectionMode(state), "audio");
  assert.equal(state.ui.activeSuggestionPreviewId, "audio-inspect");
  assert.deepEqual(state.selectedCapabilities, []);
  assert.equal(state.run?.state, "completed");
});
