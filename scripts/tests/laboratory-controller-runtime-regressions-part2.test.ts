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
  FakePlayheadElement,
  FakeTextElement,
  FakeTimelineActionElement,
  FakeTimelineRoot,
  FakeTimelineTrack,
  FakeWindowEventTarget,
  test
} from "./laboratory-runtime-truth.helpers.ts";
import { resolveDrawerMode } from "../../rooms/laboratory/runtime/lab-selectors.ts";
import { createLabAnalysisScopeOverlay } from "../../rooms/laboratory/ui/lab-analysis-scope-overlay.ts";

void test("laboratory run controller sends project import draft fields without mutating committed source", () => {
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
      routeLabel: "Local Copy",
      metadata: {},
    },
  });
  const committedSourceBeforeImport = JSON.parse(JSON.stringify(store.getState().source)) as Record<string, unknown>;

  class TestElement extends FakeActionElement {}
  class TestInputElement {
    checked = false;
    dataset: Record<string, string>;
    type = "text";

    constructor(
      field: string,
      public value: string
    ) {
      this.dataset = {
        labField: field,
      };
    }
  }
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
          sendEvent(eventName: string, payload: Record<string, unknown>) {
            sentEvents.push({ eventName, payload });
          },
        },
        addEventListener() {},
      } as unknown as Window,
    });
    controller.attach();

    const clickListener = documentRef.listeners.get("click");
    const inputListener = documentRef.listeners.get("input");
    assert.ok(clickListener);
    assert.ok(inputListener);

    inputListener({
      target: new TestInputElement("project-import.urlInput", "https://example.com/evidence.png"),
    } as unknown as Event);

    assert.deepEqual(store.getState().source, committedSourceBeforeImport);

    clickListener({ target: new TestElement("project-import-check-url") } as unknown as Event);

    assert.equal(sentEvents.length, 1);
    assert.equal(sentEvents[0]?.eventName, "media-action");
    assert.equal(sentEvents[0].payload["action"], "project-import-check-url");
    store.dispatch({
      type: "host-event-received",
      event: {
        id: "evt-url-check",
        kind: "request-result",
        severity: "success",
        message: "URL check completed",
        detail: null,
        action: "project-import-check-url",
        stage: "completed",
        timestamp: Date.now(),
        source: "host",
        scope: "global",
        moduleId: null,
        rawLine: null,
        result: {
          url: "https://example.com/evidence.png",
          isYoutube: false,
          kind: "image",
        },
      } as never,
    });
    assert.equal(store.getState().ui.projectImport.activeKind, "image");
    assert.equal(store.getState().ui.projectImport.methods.image, "url");

    clickListener({ target: new TestElement("project-import-url-add") } as unknown as Event);

    assert.equal(sentEvents.length, 2);
    assert.equal(sentEvents[1]?.eventName, "media-action");
    assert.equal(sentEvents[1].payload["action"], "source-download-url");
    const mediaPayload = sentEvents[1].payload["payload"] as Record<string, unknown>;
    const fields = mediaPayload["fields"] as Record<string, unknown>;
    assert.equal(fields["kind"], "image");
    assert.equal(fields["mode"], "url");
    assert.equal(fields["urlInput"], "https://example.com/evidence.png");
    assert.equal(Object.prototype.hasOwnProperty.call(fields, "file" + "NameHint"), false);
    assert.deepEqual(store.getState().source, committedSourceBeforeImport);
    assert.equal(store.getState().ui.projectImport.reviewFocus, "running");
    assert.equal(store.getState().ui.projectImport.lastAction, "source-download-url");
    assert.equal(
      store.getState().ui.projectImport.lastRequestId,
      sentEvents[1].payload["requestId"]
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

void test("laboratory run controller routes topbar pills and cancel through v2 contracts", () => {
  const originalElement = globalThis.Element;
  const sentEvents: Array<{ eventName: string; payload: Record<string, unknown> }> = [];
  const cancelStateDuringSend: Array<{ pending: boolean; requestId: string | null }> = [];
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
            if (eventName === "media-action" && payload["action"] === "process-cancel") {
              cancelStateDuringSend.push({
                pending: store.getState().ui.analysisCancelPending,
                requestId: store.getState().ui.analysisCancelRequestId,
              });
            }
            sentEvents.push({ eventName, payload });
          },
        },
        addEventListener() {},
      } as unknown as Window,
    });
    controller.attach();

    const state = store.getState() as ReturnType<typeof store.getState> & {
      run: Record<string, unknown>;
      source: Record<string, unknown>;
      sourceProbeStatus: "idle" | "running" | "completed" | "failed";
    };
    state.source = {
      kind: "video",
      mode: "local",
      status: "ready",
      storedPath: "/tmp/lab-demo.mp4",
    };
    state.sourceProbeStatus = "completed";
    state.run = {
      id: "run-v2-shell-actions",
      state: "completed",
      startedAt: Date.now() - 2000,
      completedAt: Date.now() - 1000,
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
      },
      previewArtifacts: [],
      confidence: "high",
      moduleTrace: [],
      comparisonVariants: [],
      hypothesisSummary: null,
    };
    state.reports.user = {
      summary: "Report ready",
      confidence: "high",
      topFindings: [],
      suspiciousFrames: [],
      hypothesisResult: null,
      elapsedSeconds: 1,
      moduleSummary: [],
    };

    const clickListener = documentRef.listeners.get("click");
    assert.ok(clickListener);

    clickListener({ target: new TestElement("drawer-explore-toggled") } as unknown as Event);
    assert.equal(resolveDrawerMode(store.getState()), "explore");

    clickListener({ target: new TestElement("topbar-pill-results") } as unknown as Event);
    assert.equal(store.getState().ui.workspace.drawerModeOverride, "result");
    assert.equal(resolveDrawerMode(store.getState()), "result");

    clickListener({ target: new TestElement("topbar-pill-source") } as unknown as Event);
    assert.equal(store.getState().ui.workspace.drawerModeOverride, "setup");
    assert.equal(resolveDrawerMode(store.getState()), "setup");

    const runningState = store.getState() as ReturnType<typeof store.getState> & {
      run: Record<string, unknown>;
    };
    runningState.run = {
      ...runningState.run,
      state: "running",
      completedAt: null,
      progress: 42,
    };
    store.dispatch({ type: "selection-tab-toggled", active: true });
    clickListener({ target: new TestElement("topbar-pill-analyze") } as unknown as Event);

    assert.equal(store.getState().ui.workspace.selectionTabActive, false);
    assert.equal(store.getState().ui.workspace.drawerModeOverride, null);
    assert.equal(resolveDrawerMode(store.getState()), "running");

    clickListener({ target: new TestElement("cancel-analysis") } as unknown as Event);

    assert.equal(sentEvents.length, 1);
    const sentCancelRequestId = sentEvents[0]?.payload["requestId"];
    assert.deepEqual(cancelStateDuringSend, [
      {
        pending: true,
        requestId: typeof sentCancelRequestId === "string" ? sentCancelRequestId : null,
      },
    ]);
    assert.equal(store.getState().ui.analysisCancelPending, true);
    assert.equal(store.getState().ui.analysisCancelRequestId, sentCancelRequestId);
    assert.equal(sentEvents[0]?.eventName, "media-action");
    assert.equal(sentEvents[0].payload["action"], "process-cancel");
    assert.equal(
      (sentEvents[0].payload["payload"] as Record<string, unknown>)["featureId"],
      "media-analysis"
    );
    clickListener({ target: new TestElement("cancel-analysis") } as unknown as Event);
    assert.equal(sentEvents.length, 1);
    store.dispatch({
      type: "host-event-received",
      event: {
        id: "evt-run-cancelled",
        kind: "activity",
        severity: "warning",
        message: "Analiz iptal edildi",
        detail: null,
        timestamp: Date.now(),
        source: "host",
        action: "process-run",
        stage: "cancelled",
        scope: "run",
        moduleId: null,
        rawLine: null,
      },
    });
    assert.equal(store.getState().ui.analysisCancelPending, false);
    assert.equal(store.getState().ui.analysisCancelRequestId, null);
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

void test("laboratory run controller honors the analysis preflight auto-run toggle", () => {
  const originalElement = globalThis.Element;

  class TestElement extends FakeActionElement {}

  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: TestElement,
  });

  function runWithPreflightToggle(preflightAutoRunEnabled: boolean) {
    const sentActions: string[] = [];
    const preflightPayloads: Array<Record<string, unknown>> = [];
    const processRunPayloadRequestIds: Array<string | null> = [];
    const processRunRequestIdsDuringSend: Array<string | null> = [];
    const processRunStatesDuringSend: Array<string | null> = [];
    const prompts: string[] = [];
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
            if (eventName === "media-action" && typeof payload["action"] === "string") {
              sentActions.push(payload["action"]);
              const actionPayload =
                typeof payload["payload"] === "object" &&
                payload["payload"] !== null &&
                Array.isArray(payload["payload"]) === false
                  ? (payload["payload"] as Record<string, unknown>)
                  : {};
              if (payload["action"] === "profile-run-preflight") {
                preflightPayloads.push(actionPayload);
              }
              if (payload["action"] === "process-run") {
                processRunPayloadRequestIds.push(
                  typeof payload["requestId"] === "string" ? payload["requestId"] : null
                );
                processRunRequestIdsDuringSend.push(store.getState().run?.requestId ?? null);
                processRunStatesDuringSend.push(store.getState().run?.state ?? null);
              }
            }
          },
        },
        addEventListener() {},
        prompt(message: string) {
          prompts.push(message);
          return "1";
        },
      } as unknown as Window,
    });
    controller.attach();

    store.dispatch({
      type: "hydrate",
      payload: {
        featureId: "media-analysis",
        source: {
          kind: "video",
          mode: "local",
          previewUrl: "preview://video",
          storedPath: "/tmp/lab-demo.mp4",
        },
        sourceProbeStatus: "completed",
        toolState: {
          tools: {
            ffmpeg: { installed: true },
          },
        },
        selectedCapabilities: ["visual-forensics"],
        workspace: {
          preflightAutoRunEnabled,
        },
        reports: {
          user: null,
          ai: null,
          emptyReason: null,
        },
        activityFeed: [],
        lastRun: null,
      },
    });

    const clickListener = documentRef.listeners.get("click");
    assert.ok(clickListener);
    clickListener({ target: new TestElement("run-deep-analysis") } as unknown as Event);

    return {
      preflightPayloads,
      processRunPayloadRequestIds,
      processRunRequestIdsDuringSend,
      processRunStatesDuringSend,
      prompts,
      sentActions,
    };
  }

  try {
    const enabledRun = runWithPreflightToggle(true);
    const enabledPreflightIndex = enabledRun.sentActions.indexOf("profile-run-preflight");
    const enabledRunIndex = enabledRun.sentActions.indexOf("process-run");

    assert.equal(enabledRun.prompts.length, 0);
    assert.notEqual(enabledPreflightIndex, -1);
    assert.notEqual(enabledRunIndex, -1);
    assert.ok(enabledPreflightIndex < enabledRunIndex);
    assert.deepEqual(enabledRun.processRunStatesDuringSend, ["running"]);
    assert.deepEqual(
      enabledRun.processRunRequestIdsDuringSend,
      enabledRun.processRunPayloadRequestIds
    );

    const disabledRun = runWithPreflightToggle(false);

    assert.equal(disabledRun.prompts.length, 0);
    assert.equal(disabledRun.sentActions.includes("profile-run-preflight"), false);
    assert.ok(disabledRun.sentActions.includes("process-run"));
    assert.deepEqual(disabledRun.processRunStatesDuringSend, ["running"]);
    assert.deepEqual(
      disabledRun.processRunRequestIdsDuringSend,
      disabledRun.processRunPayloadRequestIds
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

void test("laboratory run controller treats missing area selection as full-media analysis scope", () => {
  const originalElement = globalThis.Element;
  const sentActions: string[] = [];
  const prompts: string[] = [];
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
            if (eventName === "media-action" && typeof payload["action"] === "string") {
              sentActions.push(payload["action"]);
            }
          },
        },
        addEventListener() {},
        prompt(message: string) {
          prompts.push(message);
          return "1";
        },
      } as unknown as Window,
    });
    controller.attach();

    store.dispatch({
      type: "hydrate",
      payload: {
        featureId: "media-analysis",
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
          kind: "video",
          mode: "local",
          previewUrl: "preview://video",
          storedPath: "/tmp/lab-demo.mp4",
        },
        sourceProbeStatus: "completed",
        toolState: {
          tools: {
            ffmpeg: { installed: true },
          },
        },
        selectedCapabilities: ["visual-forensics"],
        workspace: {
          preflightAutoRunEnabled: false,
        },
        reports: {
          user: null,
          ai: null,
          emptyReason: null,
        },
        activityFeed: [],
        lastRun: null,
      },
    });

    const clickListener = documentRef.listeners.get("click");
    assert.ok(clickListener);
    clickListener({ target: new TestElement("run-deep-analysis") } as unknown as Event);

    const analysisScope = store.getState().run?.analysisScope;

    assert.equal(prompts.length, 0);
    assert.ok(sentActions.includes("process-run"));
    assert.equal(analysisScope?.timeRange, undefined);
    assert.equal(analysisScope?.region, undefined);
    assert.equal(analysisScope?.focus, undefined);
    assert.notEqual(analysisScope?.lifecycle?.processId, "stale-process");
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

void test("laboratory run controller carries active image comparison pair into analysis scope", () => {
  const originalElement = globalThis.Element;
  const sentActions: string[] = [];
  const processRunPayloads: Array<Record<string, unknown>> = [];
  class TestElement extends FakeActionElement {}
  const documentRef = new FakeControllerDocument();
  const eventBus = createLabEventBus();
  const store = createLabStore();

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
            if (eventName === "media-action" && typeof payload["action"] === "string") {
              sentActions.push(payload["action"]);
              if (payload["action"] === "process-run") {
                processRunPayloads.push(
                  typeof payload["payload"] === "object" &&
                    payload["payload"] !== null &&
                    Array.isArray(payload["payload"]) === false
                    ? (payload["payload"] as Record<string, unknown>)
                    : {}
                );
              }
            }
          },
        },
        addEventListener() {},
      } as unknown as Window,
    });
    controller.attach();

    store.dispatch({
      type: "hydrate",
      payload: {
        featureId: "media-analysis",
        source: {
          kind: "image",
          mode: "local",
          previewUrl: "preview://primary",
          storedFileName: "primary.png",
          storedPath: "/tmp/primary.png",
        },
        sourceProbeStatus: "completed",
        toolState: {
          tools: {
            ffmpeg: { installed: true },
          },
        },
        workspace: {
          comparisonSplitPercent: 38,
          comparisonViewMode: "difference",
          preflightAutoRunEnabled: false,
        },
        selectedCapabilities: ["visual-forensics"],
        reports: {
          user: null,
          ai: null,
          emptyReason: null,
        },
        activityFeed: [],
        lastRun: null,
      },
    });
    eventBus.emit({
      type: "asset-added",
      asset: {
        id: "asset-primary",
        type: "image",
        name: "A primary.png",
        localPath: "/tmp/primary.png",
        createdAt: 1,
        metadata: { height: 500, sourceKind: "image", width: 1000 },
      },
    });
    eventBus.emit({
      type: "asset-added",
      asset: {
        id: "asset-reference",
        type: "image",
        name: "B reference.png",
        localPath: "/tmp/reference.png",
        createdAt: 2,
        metadata: { height: 600, sourceKind: "image", width: 800 },
      },
    });
    store.dispatch({ type: "workspace-asset-selected", assetId: "asset-primary" });
    store.dispatch({ type: "workspace-comparison-reference-set", assetId: "asset-reference" });
    store.dispatch({ type: "capability-set", capabilities: ["visual-forensics"] });
    store.dispatch({ type: "analysis-preflight-auto-run-toggled", force: false } as unknown as Parameters<typeof store.dispatch>[0]);
    store.dispatch({
      type: "workspace-comparison-updated",
      patch: {
        comparisonSplitPercent: 38,
        comparisonViewMode: "difference",
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
    clickListener({ target: new TestElement("run-deep-analysis") } as unknown as Event);
    if (!sentActions.includes("process-run")) {
      clickListener({ target: new TestElement("analysis-scope-choice", "selected") } as unknown as Event);
    }

    const comparison = store.getState().run?.analysisScope?.comparison;
    assert.ok(sentActions.includes("process-run"));
    assert.equal(comparison?.primary.assetId, "asset-primary");
    assert.equal(comparison.primary.localPath, "/tmp/primary.png");
    assert.equal(comparison.reference.assetId, "asset-reference");
    assert.equal(comparison.reference.localPath, "/tmp/reference.png");
    assert.equal(comparison.activeSide, "reference");
    assert.equal(comparison.viewMode, "difference");
    assert.equal(comparison.splitPercent, 38);
    assert.equal(processRunPayloads.at(-1)?.["workspaceTargetAssetId"], "asset-primary");
    assert.equal(processRunPayloads.at(-1)?.["comparisonReferenceAssetId"], "asset-reference");
    assert.deepEqual(
      (processRunPayloads.at(-1)?.["analysisScope"] as { comparison?: unknown } | undefined)
        ?.comparison,
      comparison
    );
    assert.deepEqual(comparison.rois?.primary, { x: 100, y: 100, width: 300, height: 200 });
    assert.deepEqual(comparison.rois.reference, {
      x: 160,
      y: 60,
      width: 200,
      height: 210,
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

void test("laboratory run controller opens an in-room scope overlay for selected ranges", () => {
  const originalElement = globalThis.Element;
  const sentActions: string[] = [];
  const prompts: string[] = [];
  class FakeScopeOverlayElement {
    className = "";
    dataset: Record<string, string> = {};
    innerHTML = "";
    removed = false;
    attributes: Record<string, string> = {};
    focused = false;

    setAttribute(name: string, value: string) {
      this.attributes[name] = value;
    }

    querySelector(selector: string) {
      return selector.includes("analysis-scope-choice")
        ? { focus: () => (this.focused = true) }
        : null;
    }

    remove() {
      this.removed = true;
    }
  }

  const documentRef = new FakeControllerDocument() as FakeControllerDocument & {
    body: {
      appended: FakeScopeOverlayElement[];
      appendChild: (child: FakeScopeOverlayElement) => void;
    };
    createElement: (tagName: string) => FakeScopeOverlayElement;
  };
  const eventBus = createLabEventBus();
  const store = createLabStore();

  class TestElement extends FakeActionElement {}

  documentRef.body = {
    appended: [],
    appendChild(child: FakeScopeOverlayElement) {
      this.appended.push(child);
    },
  };
  documentRef.createElement = function () {
    return new FakeScopeOverlayElement();
  };

  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: TestElement,
  });

  try {
    eventBus.subscribe(function (event) {
      store.dispatch(event);
    });

    const controller = createLabRunController({
      analysisScopeOverlay: createLabAnalysisScopeOverlay({
        documentRef: documentRef as unknown as Document,
      }),
      documentRef: documentRef as unknown as Document,
      eventBus,
      store,
      windowRef: {
        roomAPI: {
          sendEvent(eventName: string, payload: Record<string, unknown>) {
            if (eventName === "media-action" && typeof payload["action"] === "string") {
              sentActions.push(payload["action"]);
            }
          },
        },
        addEventListener() {},
        prompt(message: string) {
          prompts.push(message);
          return "1";
        },
      } as unknown as Window,
    });
    controller.attach();

    store.dispatch({
      type: "hydrate",
      payload: {
        featureId: "media-analysis",
        source: {
          kind: "video",
          mode: "local",
          previewUrl: "preview://video",
          storedPath: "/tmp/lab-demo.mp4",
        },
        sourceProbeStatus: "completed",
        toolState: {
          tools: {
            ffmpeg: { installed: true },
          },
        },
        workspace: {
          preflightAutoRunEnabled: false,
          timelineStartMs: 1200,
          timelineEndMs: 2600,
        },
        selectedCapabilities: ["visual-forensics"],
        reports: {
          user: null,
          ai: null,
          emptyReason: null,
        },
        activityFeed: [],
        lastRun: null,
      },
    });

    const clickListener = documentRef.listeners.get("click");
    assert.ok(clickListener);
    clickListener({ target: new TestElement("run-deep-analysis") } as unknown as Event);

    const overlay = documentRef.body.appended[0];
    assert.ok(overlay);
    assert.equal(prompts.length, 0);
    assert.equal(sentActions.includes("process-run"), false);
    assert.equal(overlay.attributes["data-open"], "true");
    assert.match(overlay.innerHTML, /data-lab-action="analysis-scope-choice"/);

    clickListener({ target: new TestElement("analysis-scope-choice", "selected") } as unknown as Event);

    const analysisScope = store.getState().run?.analysisScope;
    assert.equal(overlay.removed, true);
    assert.ok(sentActions.includes("process-run"));
    assert.deepEqual(analysisScope?.timeRange, {
      startMs: 1200,
      endMs: 2600,
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

void test("laboratory run controller syncs the unified timeline playhead to the active preview media", async () => {
  const preview = new FakeMediaElement();
  preview.duration = 5;
  preview.currentTime = 1.25;
  const playhead = new FakePlayheadElement();
  const playheadLabel = new FakeTextElement(null);
  const timelineRoot = { dataset: { duration: "5000" } };
  const documentRef = new FakeDualPreviewDocument(
    new Map<string, unknown>([
      ['video[data-lab-preserve-media="workspace-preview"]', preview],
      ['[data-lab-role="timeline-playhead"]', playhead],
      ['[data-lab-role="timeline-playhead-label"]', playheadLabel],
      [".labx-timeline", timelineRoot],
    ]),
    [preview]
  );
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
        sendEvent() {},
      },
      addEventListener() {},
    } as unknown as Window,
  });

  controller.attach();
  await Promise.resolve();

  assert.equal(playhead.style["left"], "25%");
  assert.equal(playhead.attributes.get("data-active"), "true");
  assert.equal(playheadLabel.textContent, "00:01.250");

  preview.currentTime = 2.5;
  preview.dispatch("timeupdate");

  assert.equal(playhead.style["left"], "50%");
  assert.equal(playheadLabel.textContent, "00:02.500");
});

void test("laboratory run controller updates focus layer from user workspace interactions", async () => {
  const originalElement = Object.getOwnPropertyDescriptor(globalThis, "Element");
  const preview = new FakeMediaElement();
  const documentRef = new FakeDualPreviewDocument(
    new Map<string, unknown>([['video[data-lab-preserve-media="workspace-preview"]', preview]]),
    [preview]
  );
  const eventBus = createLabEventBus();
  const store = createLabStore();

  class FakeFocusTarget {
    dataset: Record<string, string>;

    constructor(
      options: {
        action?: string;
        surface?: "inspector" | "preview" | "timeline";
        value?: string;
      } = {}
    ) {
      this.dataset = {
        ...(options.action === undefined ? {} : { labAction: options.action }),
        ...(options.value === undefined ? {} : { labValue: options.value }),
      };
      this.surface = options.surface ?? null;
    }

    private readonly surface: "inspector" | "preview" | "timeline" | null;

    closest(selector: string): FakeFocusTarget | null {
      if (selector === "[data-lab-action]" && this.dataset["labAction"] !== undefined) {
        return this;
      }
      if (selector === ".labx-workspace-preview" && this.surface === "preview") {
        return this;
      }
      if (selector === ".labx-timeline" && this.surface === "timeline") {
        return this;
      }
      if (selector === "[data-lab-workspace-inspector='true']" && this.surface === "inspector") {
        return this;
      }
      return null;
    }
  }

  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: FakeFocusTarget,
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
    await Promise.resolve();

    const clickListener = documentRef.listeners.get("click");
    const pointerDownListener = documentRef.listeners.get("pointerdown");
    assert.ok(clickListener);
    assert.ok(pointerDownListener);

    clickListener({
      target: new FakeFocusTarget({ action: "timeline-shift-playhead", surface: "timeline" }),
    } as unknown as Event);
    assert.equal(store.getState().ui.labFocusLayer, "timeline");

    pointerDownListener({
      target: new FakeFocusTarget({ surface: "preview" }),
    } as unknown as Event);
    assert.equal(store.getState().ui.labFocusLayer, "preview");

    clickListener({
      target: new FakeFocusTarget({
        action: "workspace-controls-drawer-toggle",
        surface: "inspector",
      }),
    } as unknown as Event);
    assert.equal(store.getState().ui.labFocusLayer, "inspector");

    await preview.play();
    preview.dispatch("timeupdate");
    assert.equal(store.getState().ui.labFocusLayer, "inspector");
  } finally {
    if (originalElement) {
      Object.defineProperty(globalThis, "Element", originalElement);
    } else {
      Reflect.deleteProperty(globalThis, "Element");
    }
  }
});

void test("laboratory run controller shifts normal playback from timeline step controls", async () => {
  const originalElement = Object.getOwnPropertyDescriptor(globalThis, "Element");
  const preview = new FakeMediaElement();
  preview.duration = 12;
  preview.currentTime = 4.321;
  preview.paused = false;
  const playhead = new FakePlayheadElement();
  const playheadLabel = new FakeTextElement(null);
  const currentTimeLabel = new FakeTextElement(null);
  const totalDurationLabel = new FakeTextElement(null);
  const playToggleLabel = new FakeTextElement(null);
  const timelineRoot = { dataset: { duration: "12000" } };
  const documentRef = new FakeDualPreviewDocument(
    new Map<string, unknown>([
      ['video[data-lab-preserve-media="workspace-preview"]', preview],
      ['[data-lab-role="timeline-playhead"]', playhead],
      ['[data-lab-role="timeline-playhead-label"]', playheadLabel],
      ['[data-lab-role="timeline-current-time-label"]', currentTimeLabel],
      ['[data-lab-role="timeline-total-duration-label"]', totalDurationLabel],
      ['[data-lab-role="timeline-play-toggle-label"]', playToggleLabel],
      [".labx-timeline", timelineRoot],
    ]),
    [preview]
  );
  const eventBus = createLabEventBus();
  const store = createLabStore();

  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: FakeActionElement,
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
    await Promise.resolve();

    assert.equal(currentTimeLabel.textContent, "00:04.321");
    assert.equal(totalDurationLabel.textContent, "00:12.000");
    assert.equal(playToggleLabel.textContent, "❚❚");

    const clickListener = documentRef.listeners.get("click");
    assert.ok(clickListener);
    clickListener({
      target: new FakeActionElement("timeline-shift-playhead", "+1000"),
    } as unknown as Event);

    assert.equal(preview.currentTime, 5.321);
    assert.equal(preview.pauseCalls, 0);
    assert.equal(currentTimeLabel.textContent, "00:05.321");

    clickListener({
      target: new FakeActionElement("timeline-shift-playhead", "-frame"),
    } as unknown as Event);

    assert.equal(preview.currentTime, 5.288);
    assert.equal(preview.pauseCalls, 1);
    assert.equal(preview.paused, true);
    assert.equal(currentTimeLabel.textContent, "00:05.288");
    assert.equal(playToggleLabel.textContent, "▶");
  } finally {
    if (originalElement === undefined) {
      delete (globalThis as Record<string, unknown>)["Element"];
    } else {
      Object.defineProperty(globalThis, "Element", originalElement);
    }
  }
});

void test("laboratory run controller keeps click-to-seek and drag-to-select separated by the rail threshold", () => {
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

    const mouseDownListener = documentRef.listeners.get("mousedown");
    const mouseMoveListener = windowRef.listeners.get("mousemove");
    const mouseUpListener = windowRef.listeners.get("mouseup");
    assert.ok(mouseDownListener);
    assert.ok(mouseMoveListener);
    assert.ok(mouseUpListener);

    const railTarget = new FakeTimelineActionElement("timeline-interact", timeline);

    mouseDownListener(
      new FakeMouseEvent(railTarget as unknown as EventTarget, 350) as unknown as Event
    );
    mouseMoveListener(
      new FakeMouseEvent(railTarget as unknown as EventTarget, 352) as unknown as Event
    );
    mouseUpListener({} as unknown as Event);

    assert.equal(preview.currentTime, 2.5);
    assert.equal(store.getState().ui.workspace.timelineStartMs, null);
    assert.equal(store.getState().ui.workspace.timelineEndMs, null);

    mouseDownListener(
      new FakeMouseEvent(railTarget as unknown as EventTarget, 350) as unknown as Event
    );
    mouseMoveListener(
      new FakeMouseEvent(railTarget as unknown as EventTarget, 550) as unknown as Event
    );
    assert.equal(preview.currentTime, 2.5);
    mouseUpListener({} as unknown as Event);

    assert.equal(preview.currentTime, 4.5);
    assert.equal(store.getState().ui.workspace.timelineStartMs, 2500);
    assert.equal(store.getState().ui.workspace.timelineEndMs, 4500);
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

void test("laboratory run controller keeps timeline drag selection stable after timeline rerender", () => {
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

  class RelayoutTimelineTrack extends FakeTimelineTrack {
    private collapsed = false;

    collapse() {
      this.collapsed = true;
    }

    override getBoundingClientRect() {
      return {
        left: 100,
        width: this.collapsed ? 0 : 1000,
      };
    }
  }

  const track = new RelayoutTimelineTrack(100, 1000);
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

    const mouseDownListener = documentRef.listeners.get("mousedown");
    const mouseMoveListener = windowRef.listeners.get("mousemove");
    const mouseUpListener = windowRef.listeners.get("mouseup");
    assert.ok(mouseDownListener);
    assert.ok(mouseMoveListener);
    assert.ok(mouseUpListener);

    const railTarget = new FakeTimelineActionElement("timeline-interact", timeline);

    mouseDownListener(
      new FakeMouseEvent(railTarget as unknown as EventTarget, 350) as unknown as Event
    );
    track.collapse();
    mouseMoveListener(
      new FakeMouseEvent(railTarget as unknown as EventTarget, 550) as unknown as Event
    );
    mouseUpListener({} as unknown as Event);

    assert.equal(preview.currentTime, 4.5);
    assert.equal(store.getState().ui.workspace.timelineStartMs, 2500);
    assert.equal(store.getState().ui.workspace.timelineEndMs, 4500);
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

void test("laboratory run controller drags timeline start and end handles independently", () => {
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

    mouseDownListener(
      new FakeMouseEvent(
        new FakeTimelineActionElement("timeline-drag-start", timeline) as unknown as EventTarget,
        200
      ) as unknown as Event
    );
    mouseMoveListener({ clientX: 150 } as MouseEvent);
    mouseUpListener({} as unknown as Event);

    assert.equal(store.getState().ui.workspace.timelineStartMs, 500);
    assert.equal(store.getState().ui.workspace.timelineEndMs, 3000);
    assert.equal(preview.currentTime, 0.5);

    mouseDownListener(
      new FakeMouseEvent(
        new FakeTimelineActionElement("timeline-drag-end", timeline) as unknown as EventTarget,
        400
      ) as unknown as Event
    );
    mouseMoveListener({ clientX: 650 } as MouseEvent);
    mouseUpListener({} as unknown as Event);

    assert.equal(store.getState().ui.workspace.timelineStartMs, 500);
    assert.equal(store.getState().ui.workspace.timelineEndMs, 5500);
    assert.equal(preview.currentTime, 5.5);
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

