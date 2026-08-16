import test from "node:test";
import assert from "node:assert/strict";

import { createLabEventBus } from "../../rooms/laboratory/runtime/lab-event-bus.ts";
import { createLabRunController } from "../../rooms/laboratory/runtime/lab-run-controller.ts";
import { createLabStore } from "../../rooms/laboratory/runtime/lab-store.ts";
import { createAudioAnalysisLocalProcessRunners } from "../../rooms/laboratory/features/audio-analysis/host/process-local-runners.ts";
import { createLaboratoryManagedAudioRunnerRuntime } from "../../rooms/laboratory/shared/host/process-managed-audio-runner.ts";
import { createLaboratoryManagedMediaRunnerRuntime } from "../../rooms/laboratory/shared/host/process-managed-media-runner.ts";
import { createLaboratoryProcessTargetingRuntime } from "../../rooms/laboratory/shared/host/process-targeting.ts";

class FakeSettingsDocument {
  private listenerSets = new Map<string, Set<(event: Event) => void>>();
  listeners = new Map<string, (event: Event) => void>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const handler =
      typeof listener === "function"
        ? (listener)
        : (event: Event) => { listener.handleEvent(event); };
    const listeners = this.listenerSets.get(type) ?? new Set<(event: Event) => void>();
    listeners.add(handler);
    this.listenerSets.set(type, listeners);
    this.listeners.set(type, (event: Event) => {
      Array.from(this.listenerSets.get(type) ?? []).forEach(function (candidate) {
        candidate(event);
      });
    });
  }

  querySelector(): null {
    return null;
  }
}

class FakeActionElement {
  dataset: Record<string, string>;

  constructor(action: string, value?: string) {
    this.dataset = {
      labAction: action,
      ...(value === undefined ? {} : { labValue: value }),
    };
  }

  closest(selector: string): FakeActionElement | null {
    return selector === "[data-lab-action]" ? this : null;
  }

  getAttribute(name: string): string | null {
    if (name === "data-lab-action") {
      return this.dataset["labAction"] ?? null;
    }
    if (name === "data-lab-value") {
      return this.dataset["labValue"] ?? null;
    }
    return null;
  }
}

class FakeInputElement {
  checked: boolean;
  dataset: Record<string, string>;

  constructor(
    field: string,
    public value: string,
    public type = "text",
    checked = false
  ) {
    this.checked = checked;
    this.dataset = {
      labField: field,
    };
  }
}

class FakeSelectElement {
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

class FakeTextAreaElement {}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function updateProcessModule(
  processRecord: Record<string, unknown>,
  moduleId: string,
  patch: Record<string, unknown>
) {
  const modules = Array.isArray(processRecord["modules"])
    ? (processRecord["modules"] as Array<Record<string, unknown>>)
    : [];
  processRecord["modules"] = modules.map(function (entry) {
    return entry["id"] === moduleId ? { ...entry, ...patch } : entry;
  });
  return processRecord;
}

void test("laboratory settings controls persist and join operation execution payloads", () => {
  const originalElement: (typeof globalThis)["Element"] | undefined = globalThis.Element;
  const originalInputElement = globalThis.HTMLInputElement;
  const originalSelectElement = globalThis.HTMLSelectElement;
  const originalTextAreaElement = globalThis.HTMLTextAreaElement;
  const sentEvents: Array<{ eventName: string; payload: Record<string, unknown> }> = [];
  const documentRef = new FakeSettingsDocument();
  const eventBus = createLabEventBus();
  const store = createLabStore();

  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: FakeActionElement,
  });
  Object.defineProperty(globalThis, "HTMLInputElement", {
    configurable: true,
    value: FakeInputElement,
  });
  Object.defineProperty(globalThis, "HTMLSelectElement", {
    configurable: true,
    value: FakeSelectElement,
  });
  Object.defineProperty(globalThis, "HTMLTextAreaElement", {
    configurable: true,
    value: FakeTextAreaElement,
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
      type: "workspace-timeline-updated",
      startMs: 1000,
      endMs: 5000,
    });

    const clickListener = documentRef.listeners.get("click");
    const changeListener = documentRef.listeners.get("change");
    const inputListener = documentRef.listeners.get("input");
    assert.ok(clickListener);
    assert.ok(changeListener);
    assert.ok(inputListener);

    changeListener({
      target: new FakeSelectElement("operationSettings.clip-export.format", "webm"),
    } as unknown as Event);
    changeListener({
      target: new FakeInputElement(
        "operationSettings.clip-export.includeAudio",
        "",
        "checkbox",
        false
      ),
    } as unknown as Event);
    inputListener({
      target: new FakeInputElement(
        "analysisSettings.modules.sound-events.threshold",
        "0.32",
        "number"
      ),
    } as unknown as Event);

    const workbenchAfterInput = asRecord(store.getState().workbench);
    const soundEventsSettings = asRecord(
      asRecord(asRecord(workbenchAfterInput["analysisSettings"])["modules"])["sound-events"]
    );
    assert.equal(soundEventsSettings["threshold"], 0.32);

    clickListener({ target: new FakeActionElement("timeline-export-clip") } as unknown as Event);
    const clipAction = sentEvents.find(function (entry) {
      return entry.payload["action"] === "export-timeline-clip";
    });
    assert.ok(clipAction);
    const clipPayload = asRecord(clipAction.payload["payload"]);
    const operationSettings = asRecord(clipPayload["operationSettings"]);
    assert.equal(operationSettings["format"], "webm");
    assert.equal(operationSettings["includeAudio"], false);
    assert.equal(clipPayload["startMs"], 1000);
    assert.equal(clipPayload["endMs"], 5000);

    clickListener({
      target: new FakeActionElement("operation-cancel", "clip-export"),
    } as unknown as Event);
    const cancelAction = sentEvents.find(function (entry) {
      return entry.payload["action"] === "job-cancel";
    });
    assert.ok(cancelAction);
    const cancelPayload = asRecord(cancelAction.payload["payload"]);
    assert.equal(cancelPayload["actionId"], "export-timeline-clip");
    assert.equal(cancelPayload["sourceRequestId"], clipAction.payload["requestId"]);

    changeListener({
      target: new FakeSelectElement("operationSettings.roi-crop.format", "webp"),
    } as unknown as Event);
    inputListener({
      target: new FakeInputElement("operationSettings.roi-crop.padding", "12", "number"),
    } as unknown as Event);
    store.dispatch({
      type: "workspace-roi-added",
      region: {
        active: true,
        height: 80,
        id: "roi-overlay-1",
        label: "ROI 1",
        width: 120,
        x: 16,
        y: 24,
      },
    });
    clickListener({
      target: new FakeActionElement("workspace-roi-export", "roi-overlay-1"),
    } as unknown as Event);
    const roiAction = sentEvents.find(function (entry) {
      return entry.payload["action"] === "export-roi-image";
    });
    assert.ok(roiAction);
    const roiPayload = asRecord(roiAction.payload["payload"]);
    const roiOperationSettings = asRecord(roiPayload["operationSettings"]);
    assert.equal(roiOperationSettings["format"], "webp");
    assert.equal(roiOperationSettings["padding"], 12);
    assert.equal(roiPayload["x"], 16);
    assert.equal(roiPayload["width"], 120);

    clickListener({
      target: new FakeActionElement("operation-settings-reset", "clip-export"),
    } as unknown as Event);
    clickListener({
      target: new FakeActionElement("analysis-settings-reset", "sound-events"),
    } as unknown as Event);
    const resetWorkbench = asRecord(store.getState().workbench);
    const resetClipSettings = asRecord(
      asRecord(resetWorkbench["operationSettings"])["clip-export"]
    );
    const resetSoundEventSettings = asRecord(
      asRecord(asRecord(resetWorkbench["analysisSettings"])["modules"])["sound-events"]
    );
    assert.equal(resetClipSettings["format"], "mp4");
    assert.equal(resetSoundEventSettings["threshold"], 0.15);

    store.dispatch({ type: "run-started", action: "process-run" });
    changeListener({
      target: new FakeSelectElement("operationSettings.clip-export.format", "webm"),
    } as unknown as Event);
    inputListener({
      target: new FakeInputElement(
        "analysisSettings.modules.sound-events.threshold",
        "0.48",
        "number"
      ),
    } as unknown as Event);
    const lockedWorkbench = asRecord(store.getState().workbench);
    const lockedClipSettings = asRecord(
      asRecord(lockedWorkbench["operationSettings"])["clip-export"]
    );
    const lockedSoundEventSettings = asRecord(
      asRecord(asRecord(lockedWorkbench["analysisSettings"])["modules"])["sound-events"]
    );
    assert.equal(lockedClipSettings["format"], "mp4");
    assert.equal(lockedSoundEventSettings["threshold"], 0.15);
    assert.match(
      String(store.getState().activityFeed[0]?.message ?? ""),
      /aktif analiz sırasında kilitli/
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
    Object.defineProperty(globalThis, "HTMLInputElement", {
      configurable: true,
      value: originalInputElement,
    });
    Object.defineProperty(globalThis, "HTMLSelectElement", {
      configurable: true,
      value: originalSelectElement,
    });
    Object.defineProperty(globalThis, "HTMLTextAreaElement", {
      configurable: true,
      value: originalTextAreaElement,
    });
  }
});

void test("laboratory visual settings alter managed process filters and ROI scope", async () => {
  const framePreviewCalls: Array<Record<string, unknown>> = [];
  const transformCalls: Array<Record<string, unknown>> = [];
  const runtime = createLaboratoryManagedMediaRunnerRuntime({
    asNonEmptyString(value: unknown) {
      return typeof value === "string" && value.trim() !== "" ? value : null;
    },
    buildProcessSpeechAvailability() {
      return {};
    },
    clampProfileTranscriptSampleSeconds() {
      return 45;
    },
    createProcessFinding(
      moduleId,
      kind,
      level,
      confidence,
      title,
      detail,
      evidenceCount,
      artifactIds
    ) {
      return { moduleId, kind, level, confidence, title, detail, evidenceCount, artifactIds };
    },
    async generateProcessFramePreviewArtifact(
      _runtime,
      _project,
      _requestId,
      _jobId,
      _target,
      _artifactBase,
      _outputDir,
      moduleId,
      _sampleWindowSeconds,
      _tileCount,
      _label,
      filterGraph
    ) {
      framePreviewCalls.push({ moduleId, filterGraph });
      return {
        id: "motion-preview",
        label: "Motion Preview",
        moduleId,
        path: "/tmp/motion-preview.png",
      };
    },
    async generateProcessImageComparisonArtifact() {
      return null;
    },
    async generateProcessMetadataArtifact() {
      return null;
    },
    async generateProcessSpectrogram() {
      return null;
    },
    async generateProcessVisualTransformArtifact(
      _runtime,
      _project,
      _requestId,
      _jobId,
      _target,
      _artifactBase,
      _outputDir,
      moduleId,
      filterGraph,
      label,
      metadata
    ) {
      transformCalls.push({ filterGraph, label, metadata, moduleId });
      return {
        id: `${String(asRecord(metadata)["sourceModule"])}-artifact`,
        label,
        moduleId,
        path: "/tmp/visual-transform.png",
      };
    },
    async maybeRunTranscriptProfileSample() {
      return null;
    },
    normalizeProcessArtifact(value) {
      return asRecord(value);
    },
    normalizeProcessFinding(value) {
      return asRecord(value);
    },
    partitionVisualAnalysisModuleIds() {
      return {
        reveal: ["gamma-scan", "edge-enhancement"],
        structure: ["lighting-consistency"],
      };
    },
    resolveEnabledVisualAnalysisModuleIds() {
      return ["lighting-consistency", "gamma-scan", "edge-enhancement"];
    },
    async runAudioStructureProbe() {
      return {};
    },
    async runVideoStructureProbe() {
      return {};
    },
    toRecord: asRecord,
    updateProcessModule,
  });

  const processRecord: Record<string, unknown> = {
    analysisScope: {
      region: {
        height: 80,
        width: 100,
        x: 10,
        y: 20,
      },
    },
    analysisSettings: {
      modules: {
        "edge-enhancement": {
          edgeStrength: 1.4,
          roiOnly: true,
        },
        "gamma-scan": {
          gammaMax: 2.5,
          gammaMin: 0.5,
          revealStrength: 2,
        },
        "lighting-consistency": {
          roiOnly: true,
          samplingDensity: "balanced",
          sensitivity: "medium",
        },
      },
    },
    modules: [
      { id: "motion", status: "queued" },
      { id: "visual-signal", status: "queued" },
    ],
  };

  await runtime.runMediaManagedProcess(
    {},
    { source: { kind: "video" } },
    "req-visual-settings",
    "job-visual-settings",
    { path: "/tmp/source.mp4" },
    "artifact",
    "/tmp",
    processRecord
  );

  assert.equal(framePreviewCalls[0]?.["filterGraph"], "crop=100:80:10:20");
  const gammaCall = transformCalls.find(function (entry) {
    return asRecord(entry["metadata"])["sourceModule"] === "gamma-scan";
  });
  const edgeCall = transformCalls.find(function (entry) {
    return asRecord(entry["metadata"])["sourceModule"] === "edge-enhancement";
  });
  assert.match((gammaCall?.["filterGraph"] as string | undefined) ?? "", /eq=gamma=2.5/);
  assert.match((edgeCall?.["filterGraph"] as string | undefined) ?? "", /^crop=100:80:10:20,/);
});

void test("laboratory managed media runner emits A/B image comparison analysis layers", async () => {
  const transformCalls: Array<Record<string, unknown>> = [];
  const comparisonCalls: Array<Record<string, unknown>> = [];
  const runtime = createLaboratoryManagedMediaRunnerRuntime({
    asNonEmptyString(value) {
      return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
    },
    buildProcessSpeechAvailability() {
      return {};
    },
    clampProfileTranscriptSampleSeconds() {
      return 30;
    },
    createProcessFinding(
      moduleId,
      kind,
      level,
      confidence,
      title,
      detail,
      evidenceCount,
      artifactIds
    ) {
      return { moduleId, kind, level, confidence, title, detail, evidenceCount, artifactIds };
    },
    async generateProcessFramePreviewArtifact() {
      return null;
    },
    async generateProcessImageComparisonArtifact(
      _runtime,
      _project,
      _requestId,
      _jobId,
      primaryTarget,
      referenceTarget,
      _artifactBase,
      _outputDir,
      comparisonKind,
      label,
      metadata
    ) {
      comparisonCalls.push({
        comparisonKind,
        label,
        metadata,
        primaryPath: asRecord(primaryTarget)["path"],
        referencePath: asRecord(referenceTarget)["path"],
      });
      return {
        id: `comparison-${comparisonKind}`,
        kind: `comparison-${comparisonKind}`,
        label,
        moduleId: "image-comparison",
        path: `/tmp/comparison-${comparisonKind}.png`,
      };
    },
    async generateProcessMetadataArtifact() {
      return null;
    },
    async generateProcessSpectrogram() {
      return null;
    },
    async generateProcessVisualTransformArtifact(
      _runtime,
      _project,
      _requestId,
      _jobId,
      target,
      _artifactBase,
      _outputDir,
      moduleId,
      filterGraph,
      label,
      metadata
    ) {
      transformCalls.push({
        filterGraph,
        label,
        metadata,
        moduleId,
        targetPath: asRecord(target)["path"],
      });
      return {
        id: `${String(asRecord(metadata)["sourceSide"])}-${String(
          asRecord(metadata)["sourceModule"]
        )}-artifact`,
        label,
        moduleId,
        path: `/tmp/${String(asRecord(metadata)["sourceSide"])}.png`,
      };
    },
    async maybeRunTranscriptProfileSample() {
      return null;
    },
    normalizeProcessArtifact(value) {
      return asRecord(value);
    },
    normalizeProcessFinding(value) {
      return asRecord(value);
    },
    partitionVisualAnalysisModuleIds() {
      return {
        reveal: ["gamma-scan"],
        structure: [],
      };
    },
    resolveEnabledVisualAnalysisModuleIds() {
      return ["gamma-scan"];
    },
    async runAudioStructureProbe() {
      return {};
    },
    async runVideoStructureProbe() {
      return {};
    },
    toRecord: asRecord,
    updateProcessModule,
  });

  const processRecord: Record<string, unknown> = {
    analysisScope: {
      comparison: {
        activeSide: "reference",
        primary: {
          assetId: "asset-a",
          label: "A image",
          localPath: "/tmp/a.png",
          sourceKind: "image",
        },
        reference: {
          assetId: "asset-b",
          label: "B image",
          localPath: "/tmp/b.png",
          sourceKind: "image",
        },
        rois: {
          activeSide: "reference",
          primary: { x: 10, y: 20, width: 100, height: 80 },
          reference: { x: 5, y: 6, width: 70, height: 60 },
        },
        viewMode: "difference",
      },
    },
    analysisSettings: {
      modules: {
        "gamma-scan": {
          gammaMax: 2,
          gammaMin: 0.5,
          revealStrength: 1,
          roiOnly: true,
        },
      },
    },
    modules: [
      { id: "visual-signal", status: "queued" },
      { id: "image-comparison", status: "queued" },
    ],
  };

  const result = await runtime.runMediaManagedProcess(
    {},
    { source: { kind: "video" } },
    "req-ab",
    "job-ab",
    { path: "/tmp/fallback-a.png", label: "Fallback A" },
    "artifact",
    "/tmp",
    processRecord
  );

  assert.equal(transformCalls.length, 2);
  assert.equal(transformCalls[0]?.["targetPath"], "/tmp/a.png");
  assert.equal(transformCalls[1]?.["targetPath"], "/tmp/b.png");
  assert.match((transformCalls[0]["filterGraph"] as string | undefined) ?? "", /^crop=100:80:10:20,/);
  assert.match((transformCalls[1]["filterGraph"] as string | undefined) ?? "", /^crop=70:60:5:6,/);
  assert.deepEqual(
    comparisonCalls.map(function (entry) {
      return entry["comparisonKind"];
    }),
    ["side-by-side", "difference"]
  );
  assert.equal(comparisonCalls[0]?.["primaryPath"], "/tmp/a.png");
  assert.equal(comparisonCalls[0]["referencePath"], "/tmp/b.png");
  assert.ok(
    result.artifacts.some(function (artifact) {
      return artifact.moduleId === "image-comparison";
    })
  );
  assert.ok(
    result.findings.some(function (finding) {
      return finding.moduleId === "image-comparison";
    })
  );
});

void test("laboratory process targeting uses selected image assets for single and comparison analysis", () => {
  const runtime = createLaboratoryProcessTargetingRuntime({
    audioFeatureId: "audio-analysis",
    asNonEmptyString(value) {
      return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
    },
    buildProfileModelSummary() {
      return [];
    },
    getVisualAnalysisCapabilityState() {
      return {};
    },
    getVisualAnalysisModulesForRuntime() {
      return [];
    },
    getVisualAnalysisProviderState() {
      return {
        ffmpeg: {
          ready: true,
        },
      };
    },
    normalizeProcessModule(value) {
      return asRecord(value);
    },
    partitionVisualAnalysisModuleIds() {
      return {
        reveal: [],
        structure: [],
      };
    },
    resolveAudioFeatureTarget() {
      return {};
    },
    resolveEnabledVisualAnalysisModuleIds() {
      return [];
    },
    resolveProfileTarget() {
      return {
        label: "Video source",
        path: "/tmp/source.mp4",
        sourceKind: "video",
      };
    },
    toRecord: asRecord,
  });

  const project: Record<string, unknown> = {
    source: {
      kind: "video",
    },
    workbench: {
      workspaceTargetAssetId: "asset-frame",
      analysisScope: {
        comparison: {
          primary: {
            assetId: "asset-frame",
            localPath: "/tmp/frame-a.png",
            sourceKind: "image",
          },
          reference: {
            assetId: "asset-reference",
            localPath: "/tmp/frame-b.png",
            sourceKind: "image",
          },
        },
      },
    },
    assets: [
      {
        id: "asset-frame",
        type: "image",
        name: "frame-a.png",
        localPath: "/tmp/frame-a.png",
        createdAt: 1,
        metadata: {
          kind: "image",
        },
      },
      {
        id: "asset-reference",
        type: "image",
        name: "frame-b.png",
        localPath: "/tmp/frame-b.png",
        createdAt: 2,
        metadata: {
          kind: "image",
        },
      },
    ],
  };

  const target = runtime.resolveProcessTarget(project, "media-analysis");
  assert.equal(target["path"], "/tmp/frame-a.png");
  assert.equal(target["sourceKind"], "image");

  const modules = runtime.buildMediaProcessModules({}, project, target);
  assert.equal(
    modules.some(function (entry) {
      return entry["id"] === "image-comparison" && entry["status"] === "queued";
    }),
    true
  );
});

void test("laboratory audio settings drive local analyzers and frozen process snapshots", async () => {
  const filteredAudioCalls: Array<Record<string, unknown>> = [];
  const spectrogramTargets: string[] = [];
  const openSmileTargets: string[] = [];
  const localRunners = createAudioAnalysisLocalProcessRunners({
    buildEmotionHeuristicFromProsody() {
      return {};
    },
    buildProcessSpeechAvailability() {
      return { ready: true };
    },
    clone(value) {
      return structuredClone(value);
    },
    createProcessArtifact(moduleId, artifactKind, path, label, metadata) {
      return {
        artifactKind,
        id: `${moduleId}-${artifactKind}-${filteredAudioCalls.length}`,
        label,
        metadata,
        moduleId,
        path,
      };
    },
    createProcessFinding(
      moduleId,
      kind,
      level,
      confidence,
      title,
      detail,
      evidenceCount,
      artifactIds
    ) {
      return { artifactIds, confidence, detail, evidenceCount, kind, level, moduleId, title };
    },
    async ensureProcessRuntimeDirectories() {},
    async generateFilteredAudioArtifact(
      _runtime,
      _project,
      _requestId,
      _jobId,
      _target,
      artifactBase,
      _outputDir,
      moduleId,
      filterGraph,
      label,
      metadata
    ) {
      const path = `/tmp/${artifactBase}.wav`;
      filteredAudioCalls.push({ filterGraph, label, metadata, moduleId, path });
      return { id: `${moduleId}-${artifactBase}`, label, metadata, moduleId, path };
    },
    async generateProcessSpectrogram(_runtime, _project, _requestId, _jobId, target) {
      spectrogramTargets.push((asRecord(target)["path"] as string | undefined) ?? "");
      return { id: "spectrogram", moduleId: "spectral-artifacts", path: "/tmp/spectrogram.png" };
    },
    async generateProcessSpectrogramFromInputPath() {
      return null;
    },
    async generateProcessWaveform() {
      return { id: "waveform", moduleId: "spectral-artifacts", path: "/tmp/waveform.png" };
    },
    async generateSpectralDescriptorArtifact() {
      return { id: "descriptor", moduleId: "spectral-artifacts", path: "/tmp/descriptor.json" };
    },
    async maybeRunTranscriptProfileSample() {
      return null;
    },
    normalizeProcessArtifact(value) {
      return asRecord(value);
    },
    resolveOpenSmileProsodyRuntime() {
      return {};
    },
    async runAudioStructureProbe() {
      return {
        silence: { count: 0 },
        volume: { meanVolumeDb: -50 },
      };
    },
    async runOpenSmileProsodyExtraction(_runtime, _project, _requestId, _jobId, target) {
      openSmileTargets.push((asRecord(target)["path"] as string | undefined) ?? "");
      return {
        contourPath: "/tmp/prosody.csv",
        prosodySummary: {
          estimatedPauseCount: 2,
          frameCount: 12,
          meanF0Hz: 155,
        },
      };
    },
    toRecord: asRecord,
    async writeJsonFile() {},
  });
  const project = {
    workbench: {
      analysisSettings: {
        modules: {
          prosody: {
            silenceThresholdDb: -42,
            windowSeconds: 5,
          },
          "signal-health": {
            sampleWindowSeconds: 120,
            sensitivity: "high",
            silenceThresholdDb: -45,
          },
          "spectral-artifacts": {
            sampleWindowSeconds: 30,
            sensitivity: "high",
          },
        },
      },
    },
  };

  const signalResult = await localRunners.runSignalHealthAudioAnalyzer(
    {},
    project,
    "req-signal",
    "job-signal",
    { path: "/tmp/source.wav" },
    "artifact",
    "/tmp",
    "signal-health"
  );
  assert.match(String(signalResult.summary), /120s/);
  assert.match((asRecord(signalResult.findings[0])["detail"] as string | undefined) ?? "", /-45 dB/);

  await localRunners.runSpectralArtifactsAudioAnalyzer(
    {},
    project,
    "req-spectral",
    "job-spectral",
    { path: "/tmp/source.wav" },
    "artifact",
    "/tmp",
    "spectral-artifacts"
  );
  assert.equal(filteredAudioCalls[0]?.["filterGraph"], "atrim=0:30,asetpts=N/SR/TB");
  assert.equal(spectrogramTargets[0], "/tmp/artifact-window.wav");

  await localRunners.runProsodyAudioAnalyzer(
    {},
    project,
    "req-prosody",
    "job-prosody",
    { path: "/tmp/source.wav" },
    "artifact",
    "/tmp",
    "prosody"
  );
  assert.match((filteredAudioCalls[1]?.["filterGraph"] as string | undefined) ?? "", /stop_duration=5/);
  assert.match((filteredAudioCalls[1]?.["filterGraph"] as string | undefined) ?? "", /stop_threshold=-42dB/);
  assert.equal(openSmileTargets[0], "/tmp/artifact-prosody-focus.wav");

  let observedFrozenSettings: Record<string, unknown> = {};
  const managedAudio = createLaboratoryManagedAudioRunnerRuntime({
    asNonEmptyString(value: unknown) {
      return typeof value === "string" && value.trim() !== "" ? value : null;
    },
    getAudioAnalysisModuleProcessDir() {
      return "/tmp";
    },
    getAudioAnalysisModuleRunner(_moduleId: string) {
      return async function (_runtime, runnerProject) {
        observedFrozenSettings = asRecord(
          asRecord(asRecord(asRecord(runnerProject["workbench"])["analysisSettings"])["modules"])[
            "sound-events"
          ]
        );
        return { artifacts: [], findings: [], status: "ready", summary: "done", warnings: [] };
      };
    },
    normalizeProcessArtifact(value) {
      return asRecord(value);
    },
    normalizeProcessFinding(value) {
      return asRecord(value);
    },
    sanitizeFileSegment(value) {
      return value;
    },
    toRecord: asRecord,
    updateProcessModule,
  });
  await managedAudio.runAudioManagedProcess(
    {},
    {
      workbench: {
        analysisSettings: {
          modules: {
            "sound-events": {
              threshold: 0.9,
            },
          },
        },
      },
    },
    "req-managed-audio",
    "job-managed-audio",
    { path: "/tmp/source.wav" },
    "artifact",
    {
      analysisSettings: {
        modules: {
          "sound-events": {
            threshold: 0.42,
          },
        },
      },
      modules: [{ id: "sound-events", status: "queued" }],
    }
  );
  assert.equal(observedFrozenSettings["threshold"], 0.42);
});
