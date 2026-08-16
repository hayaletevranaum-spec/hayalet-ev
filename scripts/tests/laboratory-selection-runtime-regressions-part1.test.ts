import {
  __testOnlyLabPreviewInspectionController,
  assert,
  bindLabSelectionRoiInteractions,
  buildInterpretationItems,
  createDualPreviewSnapshot,
  createLabEventBus,
  createLabStore,
  createTestAudioFocusSettings,
  DEFAULT_AUDIO_FOCUS_SETTINGS,
  FakeControllerDocument,
  FakeRoiDrawTarget,
  FakeRoiStage,
  getSelectionSuggestions,
  getWaveformTimelineModel,
  renderLabWaveformTimeline,
  renderWorkspaceSurface,
  test,
} from "./laboratory-runtime-truth.helpers.ts";

import type { LabSelection } from "./laboratory-runtime-truth.helpers.ts";

void test("interpretation engine explains audio focus and selection rules with deterministic guidance", () => {
  const context = {
    activeSelection: {
      id: "selection-short",
      startMs: 120,
      endMs: 420,
      type: "clip",
      createdAt: 1,
    },
    audioFocus: createTestAudioFocusSettings({
      gain: 1.8,
      playbackRate: 0.4,
      filterType: "lowpass",
      filterFrequency: 900,
      eqBands: DEFAULT_AUDIO_FOCUS_SETTINGS.eqBands.map(function (band, index) {
        return index === 4 ? { ...band, gain: 9 } : { ...band };
      }),
    }),
    inspectionMode: "audio",
    sourceKind: "audio",
  } as const;

  const items = buildInterpretationItems(context);
  const repeatedItems = buildInterpretationItems(context);

  assert.deepEqual(
    items.map(function (item) {
      return item.id;
    }),
    [
      "audio-high-gain",
      "audio-slow-playback",
      "audio-lowpass-suppressed-highs",
      "audio-extreme-eq-boost",
      "selection-short-context",
    ]
  );

  assert.deepEqual(items, repeatedItems);
  assert.deepEqual(
    items.map(function (item) {
      return {
        id: item.id,
        recommendation: item.recommendation,
        severity: item.severity,
      };
    }),
    [
      {
        id: "audio-high-gain",
        recommendation: "Reduce gain or apply EQ balancing",
        severity: "high",
      },
      {
        id: "audio-slow-playback",
        recommendation: "Use slow playback to inspect transient details",
        severity: "medium",
      },
      {
        id: "audio-lowpass-suppressed-highs",
        recommendation: "Try increasing cutoff to restore clarity",
        severity: "low",
      },
      {
        id: "audio-extreme-eq-boost",
        recommendation: "Reduce boost to avoid distortion",
        severity: "high",
      },
      {
        id: "selection-short-context",
        recommendation: "Expand selection for better context",
        severity: "medium",
      },
    ]
  );
});

void test("waveform timeline keeps interpretation guidance out of the player controls", () => {
  const store = createLabStore();
  store.dispatch({
    type: "snapshot-received",
    payload: createDualPreviewSnapshot(0),
  });
  store.dispatch({
    type: "workspace-audio-updated",
    patch: {
      gain: 1.8,
      playbackRate: 0.4,
      preservePitch: false,
    },
  });

  const model = getWaveformTimelineModel(store.getState());
  const markup = renderLabWaveformTimeline(model);

  assert.ok((model.interpretationItems?.length || 0) >= 2);
  assert.doesNotMatch(markup, /data-lab-interpretation-panel="true"/);
  assert.doesNotMatch(markup, /High gain may introduce clipping or noise amplification/);
  assert.doesNotMatch(markup, /Slow playback can reveal temporal anomalies/);
  assert.match(markup, /labx-timeline__player-row/);
  assert.match(markup, /labx-timeline__selection-row/);
  assert.match(markup, /workspace\.audioFocus\.playbackRate/);
  assert.match(markup, /data-lab-action="timeline-play-selection"[^>]*disabled/);
  assert.match(markup, /data-lab-action="timeline-set-selection-boundary"/);
});

void test("interpretation engine maps fast playback and wide selection guidance deterministically", () => {
  const items = buildInterpretationItems({
    activeSelection: {
      id: "selection-wide",
      startMs: 0,
      endMs: 14_000,
      type: "clip",
      createdAt: 2,
    },
    audioFocus: createTestAudioFocusSettings({
      playbackRate: 1.8,
    }),
    inspectionMode: "audio",
    sourceKind: "audio",
  });

  assert.deepEqual(
    items.map(function (item) {
      return {
        id: item.id,
        recommendation: item.recommendation,
        severity: item.severity,
      };
    }),
    [
      {
        id: "audio-fast-playback",
        recommendation: "Use fast playback to detect repetition patterns",
        severity: "medium",
      },
      {
        id: "selection-wide-context",
        recommendation: "Narrow selection for focused analysis",
        severity: "low",
      },
    ]
  );
});

void test("interpretation engine reacts to semantic roi size and fast motion playback", () => {
  const items = buildInterpretationItems({
    activeSelection: {
      id: "selection-roi",
      startMs: 1000,
      endMs: 4000,
      type: "inspect",
      roi: {
        x: 0.1,
        y: 0.1,
        width: 0.1,
        height: 0.1,
      },
      createdAt: 3,
    },
    audioFocus: createTestAudioFocusSettings({
      playbackRate: 1.8,
    }),
    inspectionMode: "motion",
    sourceKind: "video",
  });

  assert.deepEqual(
    items.map(function (item) {
      return item.id;
    }),
    ["audio-fast-playback", "selection-roi-limited-context", "selection-roi-motion-ambiguity"]
  );

  const wideItems = buildInterpretationItems({
    activeSelection: {
      id: "selection-roi-wide",
      startMs: 0,
      endMs: 4000,
      type: "inspect",
      roi: {
        x: 0.05,
        y: 0.05,
        width: 0.85,
        height: 0.75,
      },
      createdAt: 4,
    },
    audioFocus: createTestAudioFocusSettings(),
    inspectionMode: "visual",
    sourceKind: "image",
  });

  assert.deepEqual(
    wideItems.map(function (item) {
      return item.id;
    }),
    ["selection-roi-wide-focus"]
  );
});

void test("interpretation engine flags extreme roi aspect ratios deterministically", () => {
  const items = buildInterpretationItems({
    activeSelection: {
      id: "selection-roi-aspect",
      startMs: 0,
      endMs: 4_000,
      type: "inspect",
      roi: {
        x: 0.1,
        y: 0.2,
        width: 0.72,
        height: 0.16,
      },
      createdAt: 5,
    },
    audioFocus: createTestAudioFocusSettings(),
    inspectionMode: "visual",
    sourceKind: "image",
  });

  assert.deepEqual(
    items.map(function (item) {
      return item.id;
    }),
    ["selection-roi-extreme-aspect"]
  );
});

void test("selection suggestions and waveform model deepen when semantic roi inspection is active", () => {
  const store = createLabStore();
  store.dispatch({
    type: "snapshot-received",
    payload: {
      ready: true,
      featureId: "media-analysis",
      activeProjectId: "project-micro-zoom",
      projects: [{ id: "project-micro-zoom", name: "lab-demo.mp4", hasSource: true }],
      activeProject: {
        id: "project-micro-zoom",
        name: "lab-demo.mp4",
        createdAt: "2026-04-23T19:00:00.000Z",
        source: {
          status: "ready",
          kind: "video",
          mode: "local",
          previewUrl: "file:///tmp/lab-demo.mp4",
          storedFileName: "lab-demo.mp4",
          storedPath: "/tmp/lab-demo.mp4",
          routeLabel: "Local Copy",
          metadata: {
            durationSeconds: 20,
            sizeBytes: 2048,
          },
          drafts: {},
        },
        edit: {},
        profile: {
          preflight: {},
        },
        process: {
          records: {},
        },
        report: {
          records: {},
        },
        assets: [
          {
            id: "source-active",
            type: "source",
            name: "lab-demo.mp4",
            localPath: "/tmp/lab-demo.mp4",
            createdAt: 100,
            sourceId: "source-active",
          },
        ],
      },
      workbench: {},
      sourceProbeStatus: "completed",
      profileModels: [],
      reports: {
        user: null,
        ai: null,
        emptyReason: "Rapor henüz üretilmedi.",
      },
      activityFeed: [],
    },
  });
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 8_000,
    endMs: 16_000,
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "visual",
  });
  store.dispatch({
    type: "selection-roi-updated",
    roi: {
      x: 0.14,
      y: 0.18,
      width: 0.22,
      height: 0.24,
    },
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "motion",
  });

  const suggestions = getSelectionSuggestions(store.getState());
  const toolHintLabels = suggestions
    .map(function (suggestion) {
      return suggestion.toolHint ?? null;
    })
    .filter((entry): entry is string => entry !== null);
  const model = getWaveformTimelineModel(store.getState());
  const markup = renderLabWaveformTimeline(model);

  assert.deepEqual(toolHintLabels, [
    "Inspect motion",
    "Enhance clarity",
    "Focus region",
    "Stabilize segment",
  ]);
  assert.equal(model.waveformInspectionLens?.enabled, true);
  assert.ok(
    (model.waveformInspectionLens?.cropEndRatio ?? 0) >
      (model.waveformInspectionLens?.cropStartRatio ?? 0)
  );
  assert.match(markup, /Inspection tools/);
  assert.match(markup, /Focus region/);
  assert.equal(model.selectionMicroZoomOpen, false);
  assert.match(markup, /data-lab-action="timeline-toggle-micro-zoom"/);
  assert.match(markup, /aria-pressed="false"/);
  assert.doesNotMatch(markup, /lab-audio-viz-inspection/);

  store.dispatch({
    type: "workspace-selection-micro-zoom-toggled",
  });

  const openModel = getWaveformTimelineModel(store.getState());
  const openMarkup = renderLabWaveformTimeline(openModel);
  assert.equal(openModel.selectionMicroZoomOpen, true);
  assert.match(openMarkup, /aria-pressed="true"/);
  assert.match(openMarkup, /lab-audio-viz-inspection/);
});

void test("lab root preserves protected details state while syncing source drawer details", async () => {
  class FakeElement {
    attributes = new Map<string, string>();
    childNodes: unknown[] = [];

    constructor(attributes: Record<string, string> = {}) {
      Object.entries(attributes).forEach(([key, value]) => {
        this.attributes.set(key, value);
      });
    }

    getAttributeNames() {
      return Array.from(this.attributes.keys());
    }

    hasAttribute(name: string) {
      return this.attributes.has(name);
    }

    getAttribute(name: string) {
      return this.attributes.get(name) ?? null;
    }

    setAttribute(name: string, value: string) {
      this.attributes.set(name, value);
    }

    removeAttribute(name: string) {
      this.attributes.delete(name);
    }
  }

  class FakeDetailsElement extends FakeElement {
    open = false;

    constructor(attributes: Record<string, string> = {}) {
      super(attributes);
      this.open = Object.prototype.hasOwnProperty.call(attributes, "open");
    }

    override setAttribute(name: string, value: string) {
      super.setAttribute(name, value);
      if (name === "open") {
        this.open = true;
      }
    }

    override removeAttribute(name: string) {
      super.removeAttribute(name);
      if (name === "open") {
        this.open = false;
      }
    }
  }

  const descriptors = {
    document: Object.getOwnPropertyDescriptor(globalThis, "document"),
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
    HTMLElement: Object.getOwnPropertyDescriptor(globalThis, "HTMLElement"),
    HTMLDetailsElement: Object.getOwnPropertyDescriptor(globalThis, "HTMLDetailsElement"),
  };

  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: FakeElement,
  });
  Object.defineProperty(globalThis, "HTMLDetailsElement", {
    configurable: true,
    value: FakeDetailsElement,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      getElementById() {
        return null;
      },
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });

  try {
    const labRootModule = (await import("../../rooms/laboratory/ui/lab-root.ts")) as {
      __testOnlyLabRootDomSync: {
        syncElement: (currentElement: Element, nextElement: Element) => void;
      };
    };

    const embeddedCurrent = new FakeDetailsElement({
      class: "lab-interpretation-panel lab-interpretation-panel--embedded",
      "data-lab-interpretation-panel": "true",
    });
    const embeddedNext = new FakeDetailsElement({
      class: "lab-interpretation-panel lab-interpretation-panel--embedded",
      "data-lab-interpretation-panel": "true",
      open: "",
    });
    embeddedCurrent.open = false;
    embeddedNext.open = true;

    labRootModule.__testOnlyLabRootDomSync.syncElement(
      embeddedCurrent as unknown as Element,
      embeddedNext as unknown as Element
    );

    const standaloneCurrent = new FakeDetailsElement({
      class: "lab-interpretation-panel lab-interpretation-panel--standalone",
      "data-lab-interpretation-panel": "true",
      open: "",
    });
    const standaloneNext = new FakeDetailsElement({
      class: "lab-interpretation-panel lab-interpretation-panel--standalone",
      "data-lab-interpretation-panel": "true",
    });
    standaloneCurrent.open = true;
    standaloneNext.open = false;

    labRootModule.__testOnlyLabRootDomSync.syncElement(
      standaloneCurrent as unknown as Element,
      standaloneNext as unknown as Element
    );

    const openSourceDrawer = new FakeDetailsElement({
      class: "labx-sp-group",
      "data-group-type": "source",
      open: "",
    });
    const closedSourceDrawer = new FakeDetailsElement({
      class: "labx-sp-group",
      "data-group-type": "source",
    });

    labRootModule.__testOnlyLabRootDomSync.syncElement(
      openSourceDrawer as unknown as Element,
      closedSourceDrawer as unknown as Element
    );

    const closedFrameDrawer = new FakeDetailsElement({
      class: "labx-sp-group",
      "data-group-type": "frame",
    });
    const openFrameDrawer = new FakeDetailsElement({
      class: "labx-sp-group",
      "data-group-type": "frame",
      open: "",
    });

    labRootModule.__testOnlyLabRootDomSync.syncElement(
      closedFrameDrawer as unknown as Element,
      openFrameDrawer as unknown as Element
    );

    assert.equal(embeddedCurrent.open, false);
    assert.equal(standaloneCurrent.open, true);
    assert.equal(openSourceDrawer.open, false);
    assert.equal(closedFrameDrawer.open, true);
  } finally {
    Object.entries(descriptors).forEach(([key, descriptor]) => {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, key);
      }
    });
  }
});

void test("laboratory store treats reused local assets as ready sources during snapshot sync", () => {
  const store = createLabStore();

  store.dispatch({
    type: "snapshot-received",
    payload: {
      ready: true,
      featureId: "media-analysis",
      activeProjectId: "project-asset-reuse",
      projects: [{ id: "project-asset-reuse", name: "asset-reuse.png", hasSource: true }],
      activeProject: {
        id: "project-asset-reuse",
        name: "asset-reuse.png",
        createdAt: "2026-04-25T11:55:00.000Z",
        source: {
          status: "ready",
          kind: "image",
          mode: "local",
          previewUrl: "file:///tmp/asset-reuse.png",
          storedFileName: "asset-reuse.png",
          storedPath: "/tmp/project/sources/asset-reuse.png",
          routeLabel: "Asset reuse",
          metadata: {
            width: 1920,
            height: 1080,
            durationSeconds: 0,
          },
          drafts: {},
        },
        edit: {},
        profile: {
          preflight: {},
        },
        process: {
          records: {},
        },
        report: {
          records: {},
        },
        assets: [],
      },
      workbench: {},
      profileModels: [],
      toolState: {},
      activityFeed: [],
    },
  });

  const state = store.getState();
  assert.equal(state.sourceProbeStatus, "completed");
  assert.equal(state.ui.workspace.sourceIntakeCollapsed, true);
});

void test("waveform timeline hides selection affordances for invalid numeric ranges", () => {
  const baseModel = {
    bookmarks: [],
    dualPreviewActive: false,
    durationMs: 6000,
    waveformSourceLabel: "Source audio",
    waveformSyncLabel: "Preview and waveform share the same master axis.",
    waveformWindowDurationMs: 6000,
    waveformWindowStartMs: 0,
  };

  const zeroWidthMarkup = renderLabWaveformTimeline({
    ...baseModel,
    endMs: 2400,
    startMs: 2400,
  });
  const invertedMarkup = renderLabWaveformTimeline({
    ...baseModel,
    endMs: 1800,
    startMs: 2400,
  });

  assert.match(zeroWidthMarkup, /data-lab-action="timeline-set-selection-boundary"/);
  assert.match(zeroWidthMarkup, /data-lab-action="timeline-clear"[^>]*disabled/);
  assert.doesNotMatch(zeroWidthMarkup, /labx-timeline__selection lab-selection-overlay/);
  assert.match(zeroWidthMarkup, /End must be greater than start/);
  assert.match(invertedMarkup, /data-lab-action="timeline-set-selection-boundary"/);
  assert.match(invertedMarkup, /data-lab-action="timeline-clear"[^>]*disabled/);
  assert.doesNotMatch(invertedMarkup, /labx-timeline__selection lab-selection-overlay/);
});

void test("waveform timeline renders selector-driven suggested actions alongside live actions", () => {
  const selection: LabSelection = {
    id: "selection-clip",
    startMs: 12300,
    endMs: 18900,
    type: "clip",
    createdAt: 1700000000000,
  };
  const markup = renderLabWaveformTimeline({
    activeSelection: selection,
    bookmarks: [],
    dualPreviewActive: false,
    durationMs: 60000,
    endMs: selection.endMs,
    ...{} as any,
    activeSuggestionPreview: {
      suggestionId: "audio-inspect",
      title: "Ses analizi yapilacak",
      steps: [
        "6.6s secim hazirlanacak",
        "Ses track izole edilecek",
        "Frekans ve yogunluk taramasi hazirlanacak",
      ],
      expectedOutputs: ["Ses analizi raporu", "Olasi anomali noktalari"],
      estimatedCost: "low",
    },
    selectionSuggestions: [
      {
        id: "audio-inspect",
        label: "Ses detaylarini incele",
        actionType: "inspect-audio",
        confidence: 0.9,
      },
      {
        id: "extract-clip",
        label: "Bu bolumu kes",
        actionType: "extract-clip",
        confidence: 0.6,
      },
    ],
    startMs: selection.startMs,
    waveformSourceLabel: "Source audio",
    waveformSyncLabel: "Preview and waveform share the same master axis.",
    waveformWindowDurationMs: 60000,
    waveformWindowStartMs: 0,
  });

  assert.match(markup, /class="lab-selection-panel"/);
  assert.match(markup, /Selection/);
  assert.match(markup, /00:12\.300/);
  assert.match(markup, /00:18\.900/);
  assert.match(markup, /Type: Clip/);
  assert.match(markup, /Region inactive/);
  assert.match(markup, /Inspection mode/);
  assert.match(markup, /data-lab-selection-inspection-mode="none"/);
  assert.match(markup, /This selection will guide future analysis/);
  assert.match(markup, /aria-pressed="true"/);
  assert.match(markup, /Suggested actions/);
  assert.match(markup, /Ses detaylarini incele/);
  assert.match(markup, /data-lab-selection-suggestion="audio-inspect"/);
  assert.doesNotMatch(markup, /Bu bolumu kes/);
  assert.doesNotMatch(markup, /data-lab-selection-suggestion="extract-clip"/);
  assert.match(markup, /data-suggestion-priority="primary"/);
  assert.match(markup, /Preview/);
  assert.match(markup, /Ses analizi yapilacak/);
  assert.match(markup, /Steps/);
  assert.match(markup, /Outputs/);
  assert.match(markup, /Estimated cost: Low/);
  assert.match(markup, /data-lab-selection-preview="true"/);
  assert.doesNotMatch(markup, /Analyze this/);
  assert.doesNotMatch(markup, /Focus region/);
  assert.doesNotMatch(markup, /data-lab-action="[^"]*">Ses detaylarini incele/);
  assert.doesNotMatch(markup, /data-lab-action="[^"]*">Bu bolumu kes/);
  assert.doesNotMatch(markup, /timeline-export-clip/);
  assert.doesNotMatch(markup, /timeline-grab-frame/);
});

void test("waveform timeline does not render suggested actions from fallback-only selection markup", () => {
  const markup = renderLabWaveformTimeline({
    bookmarks: [],
    dualPreviewActive: false,
    durationMs: 60000,
    endMs: 18900,
    ...{} as any,
    activeSuggestionPreview: {
      suggestionId: "audio-inspect",
      title: "Ses analizi yapilacak",
      steps: ["Secilen zaman araligi hazirlanacak"],
      expectedOutputs: ["Ses analizi raporu"],
      estimatedCost: "low",
    },
    selectionSuggestions: [
      {
        id: "audio-inspect",
        label: "Ses detaylarini incele",
        actionType: "inspect-audio",
        confidence: 0.9,
      },
    ],
    startMs: 12300,
    waveformSourceLabel: "Source audio",
    waveformSyncLabel: "Preview and waveform share the same master axis.",
    waveformWindowDurationMs: 60000,
    waveformWindowStartMs: 0,
  });

  assert.match(markup, /class="lab-selection-panel"/);
  assert.doesNotMatch(markup, /Suggested actions/);
  assert.doesNotMatch(markup, /data-lab-selection-suggestion=/);
  assert.doesNotMatch(markup, /data-lab-selection-preview=/);
  assert.doesNotMatch(markup, /Ses analizi yapilacak/);
});

void test("workspace surface renders semantic roi overlay and focus mask inside the visual preview stage", () => {
  const store = createLabStore();
  store.dispatch({
    type: "snapshot-received",
    payload: createDualPreviewSnapshot(0),
  });
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1000,
    endMs: 3000,
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

  const surface = renderWorkspaceSurface(store.getState());

  assert.match(surface.main, /data-lab-selection-roi-stage="true"/);
  assert.match(surface.main, /data-lab-selection-roi-overlay="true"/);
  assert.match(surface.main, /data-lab-selection-roi="true"/);
  assert.match(surface.main, /labx-selection-roi-mask/);
});

void test("selection roi binder stores a full-video ROI without an explicit timeline range", () => {
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
      metadata: {
        durationMs: 4200,
      },
      mode: "local",
      storedPath: "/tmp/source.mp4",
    },
  });

  const mouseDownListener = documentRef.listeners.get("mousedown");
  const mouseMoveListener = documentRef.listeners.get("mousemove");
  const mouseUpListener = documentRef.listeners.get("mouseup");
  assert.ok(mouseDownListener);
  assert.ok(mouseMoveListener);
  assert.ok(mouseUpListener);

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
    clientX: 20,
    clientY: 10,
    preventDefault() {},
    target: new FakeRoiDrawTarget(stage) as unknown as EventTarget,
  } as unknown as Event);
  mouseMoveListener?.({
    clientX: 100,
    clientY: 60,
    preventDefault() {},
  } as unknown as Event);
  mouseUpListener?.({} as unknown as Event);

  const selection = store.getState().ui.workspace.activeSelection;
  assert.equal(selection?.id, "selection-default:full-video");
  assert.equal(selection?.startMs, 0);
  assert.equal(selection?.endMs, 4200);
  assert.deepEqual(selection?.roi, {
    x: 0.1,
    y: 0.1,
    width: 0.4,
    height: 0.5,
  });
  assert.equal(store.getState().ui.workspace.timelineStartMs, null);
  assert.equal(store.getState().ui.workspace.timelineEndMs, null);
  assert.equal(getWaveformTimelineModel(store.getState()).startMs, null);
  assert.equal(getWaveformTimelineModel(store.getState()).endMs, null);

  store.dispatch({
    type: "selection-roi-cleared",
  });
  assert.equal(store.getState().ui.workspace.activeSelection, null);

  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 500,
    endMs: 1500,
  });
  assert.notEqual(store.getState().ui.workspace.activeSelection?.id, "selection-default:full-video");
});

void test("workspace surface keeps image roi controls out of the visual preview stage", () => {
  const store = createLabStore();
  store.dispatch({
    type: "hydrate",
    payload: {
      featureId: "media-analysis",
      projectIndex: {
        activeProjectId: "project-image-roi",
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
  store.dispatch({
    type: "selection-roi-updated",
    roi: {
      x: 0.32,
      y: 0.35,
      width: 0.18,
      height: 0.28,
    },
  });

  const surface = renderWorkspaceSurface(store.getState());

  assert.match(surface.main, /data-lab-selection-roi-overlay="true"/);
  assert.match(surface.main, /data-lab-selection-roi="true"/);
  assert.doesNotMatch(surface.main, /labx-roi-selection-toolbar/);
  assert.doesNotMatch(surface.main, /data-lab-selection-inspection-mode=/);
  assert.match(surface.side, /data-lab-selection-inspection-mode=/);
});
