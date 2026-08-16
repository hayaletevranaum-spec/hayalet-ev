import test from "node:test";
import assert from "node:assert/strict";
import type {
  LabActionSuggestion,
  LabArtifactProjection,
  LabAudioFocusSettings,
  LabExecutionCommitment,
  LabExecutionDispatchCandidate,
  LabExecutionPayloadPreview,
  LabExecutionResult,
  LabSelection,
} from "../../rooms/laboratory/domain/lab-types.ts";
import {
  DEFAULT_AUDIO_FOCUS_SETTINGS,
  normalizeAudioFocusSettings,
} from "../../rooms/laboratory/runtime/lab-audio-focus-normalization.ts";
import { createLabEventBus } from "../../rooms/laboratory/runtime/lab-event-bus.ts";
import {
  createLabExecutionDispatcher,
  createMockExecutionResult,
} from "../../rooms/laboratory/runtime/lab-execution-dispatcher.ts";
import { createLabRunController } from "../../rooms/laboratory/runtime/lab-run-controller.ts";
import { createLabHostBridge } from "../../rooms/laboratory/runtime/lab-host-bridge.ts";
import { createAudioVisualizer } from "../../rooms/laboratory/runtime/lab-audio-visualizer.ts";
import { buildInterpretationItems } from "../../rooms/laboratory/runtime/lab-interpretation-engine.ts";
import {
  buildAdaptiveDecisionSignal,
  buildCounterfactualProjection,
  buildDecisionPosture,
  formatDecisionPostureLabel,
  buildGuidedAlternativeSignal,
  prependDecisionPostureLabel,
} from "../../rooms/laboratory/runtime/lab-adaptive-decision.ts";
import {
  buildExecutionAlternatives,
  buildExecutionAlternativesFromResolved,
} from "../../rooms/laboratory/runtime/lab-execution-alternatives.ts";
import { buildExecutionCandidateFromResolved } from "../../rooms/laboratory/runtime/lab-execution-candidate.ts";
import {
  buildExecutionDescriptor,
  formatExecutionDescriptorAdvisory,
} from "../../rooms/laboratory/runtime/lab-execution-descriptor.ts";
import {
  buildExecutionBridge,
  formatExecutionBridgeAdvisory,
} from "../../rooms/laboratory/runtime/lab-execution-bridge.ts";
import {
  buildDecisionCoherence,
  formatDecisionCoherenceAdvisory,
} from "../../rooms/laboratory/runtime/lab-decision-coherence.ts";
import { reorderDecisionSummary } from "../../rooms/laboratory/runtime/lab-decision-priority.ts";
import {
  __testOnlyResolveLabI18nFromDictionaries,
  resolveLabI18n,
} from "../../rooms/laboratory/runtime/lab-i18n.ts";
import {
  buildExecutionPayloadPreview,
  buildExecutionPayloadPreviewFromResolved,
} from "../../rooms/laboratory/runtime/lab-execution-payload-preview.ts";
import { buildExecutionPlan } from "../../rooms/laboratory/runtime/lab-execution-planner.ts";
import { buildExecutionReadiness } from "../../rooms/laboratory/runtime/lab-execution-readiness.ts";
import {
  buildExecutionReadinessSignal,
  formatExecutionReadinessSignalAdvisory,
} from "../../rooms/laboratory/runtime/lab-execution-readiness-signal.ts";
import {
  buildExecutionReflection,
  buildExecutionReflectionFromResolved,
} from "../../rooms/laboratory/runtime/lab-execution-reflection.ts";
import { buildExecutionSimulation } from "../../rooms/laboratory/runtime/lab-execution-simulator.ts";
import { buildExecutionStagingFromResolved } from "../../rooms/laboratory/runtime/lab-execution-staging.ts";
import {
  __testOnlyBuildExecutionPatternKey,
  __testOnlyResetExecutionPatternRegistry,
  getActionOutputs,
  getActiveExecutionAlternatives,
  getActiveExecutionCandidate,
  getActiveExecutionCommitment,
  getActiveExecutionGoalEvaluation,
  getActiveExecutionResult,
  getActiveExecutionPlan,
  getActiveExecutionPayloadPreview,
  getActiveExecutionReadiness,
  getActiveExecutionReflection,
  getActiveExecutionResultInterpretation,
  getActiveExecutionSimulation,
  getActiveExecutionStaging,
  getActiveExecutionIntent,
  getActiveSelection,
  getActiveInspectionSnapshot,
  getActiveSuggestionPreview,
  getActiveSuggestionPreviewId,
  getEffectiveActiveSelection,
  getAudioVisualizationArtifact,
  getExecutionDispatchCandidate,
  getAssetById,
  getAssets,
  getAssetsByRun,
  getAssetsBySource,
  getAssetsByType,
  getCurrentSourceAsset,
  getDualPreviewVolume,
  getEffectivePreviewAudioFocusSettings,
  getInspectionMode,
  getInterpretationItems,
  getLaboratoryProcessSummary,
  getLaboratoryRightPanelContext,
  getLinkedAudioAssets,
  getParentSourceForAsset,
  getReportFreshness,
  getRoiFocusActive,
  getRunSnapshotSummary,
  getSelectionDuration,
  getSelectionSuggestions,
  getSelectedDualPreviewAudioAsset,
  getWaveformTimelineModel,
  getWorkspaceDiff,
  getExecutionGoalEvaluation,
  isDualPreviewActive,
  isDualPreviewAvailable,
  isSelectionValid,
  buildExecutionResultInterpretation,
  buildSuggestionPreview,
  buildExecutionDispatchId,
} from "../../rooms/laboratory/runtime/lab-selectors.ts";
import { createLabStore } from "../../rooms/laboratory/runtime/lab-store.ts";
import { LAB_USER_ACTION_HUB_SUCCESS_WINDOW_MS } from "../../rooms/laboratory/runtime/lab-user-actions.ts";
import { extractFindings } from "../../rooms/laboratory/services/finding-engine.ts";
import { parseProcessOutput } from "../../rooms/laboratory/services/process-output-parser.ts";
import {
  createLabWaveformTimelineVisualizer,
  renderLabWaveformTimeline,
} from "../../rooms/laboratory/ui/lab-waveform-timeline.ts";
import { bindLabPreviewInspectionInteractions } from "../../rooms/laboratory/ui/lab-preview-inspection-binder.ts";
import {
  __testOnlyLabPreviewInspectionController,
  createLabPreviewInspectionController,
} from "../../rooms/laboratory/ui/lab-preview-inspection-controller.ts";
import { bindLabSelectionRoiInteractions } from "../../rooms/laboratory/ui/lab-selection-roi-binder.ts";
import { bindLabSelectionSuggestionClicks } from "../../rooms/laboratory/ui/lab-selection-suggestion-binder.ts";
import { renderWorkspaceSurface } from "../../rooms/laboratory/ui/workspace-surface.ts";
import { renderWorkspaceAudioFocus } from "../../rooms/laboratory/ui/workspace-audio-focus.ts";

export {
  __testOnlyBuildExecutionPatternKey,
  __testOnlyLabPreviewInspectionController,
  __testOnlyResetExecutionPatternRegistry,
  assert,
  bindLabPreviewInspectionInteractions,
  bindLabSelectionRoiInteractions,
  bindLabSelectionSuggestionClicks,
  buildAdaptiveDecisionSignal,
  buildCounterfactualProjection,
  buildDecisionPosture,
  formatDecisionPostureLabel,
  buildGuidedAlternativeSignal,
  prependDecisionPostureLabel,
  reorderDecisionSummary,
  resolveLabI18n,
  __testOnlyResolveLabI18nFromDictionaries,
  buildDecisionCoherence,
  buildExecutionAlternatives,
  buildExecutionAlternativesFromResolved,
  buildExecutionCandidateFromResolved,
  buildExecutionBridge,
  buildExecutionDescriptor,
  buildExecutionDispatchId,
  buildExecutionPayloadPreview,
  buildExecutionPayloadPreviewFromResolved,
  buildExecutionPlan,
  buildExecutionReadiness,
  buildExecutionReadinessSignal,
  buildExecutionReflection,
  buildExecutionReflectionFromResolved,
  buildExecutionResultInterpretation,
  buildExecutionSimulation,
  buildExecutionStagingFromResolved,
  formatExecutionBridgeAdvisory,
  formatDecisionCoherenceAdvisory,
  formatExecutionDescriptorAdvisory,
  formatExecutionReadinessSignalAdvisory,
  buildInterpretationItems,
  buildSuggestionPreview,
  createAudioVisualizer,
  createLabExecutionDispatcher,
  createLabEventBus,
  createLabHostBridge,
  createMockExecutionResult,
  createLabPreviewInspectionController,
  createLabRunController,
  createLabStore,
  createLabWaveformTimelineVisualizer,
  DEFAULT_AUDIO_FOCUS_SETTINGS,
  extractFindings,
  getActionOutputs,
  getActiveExecutionAlternatives,
  getActiveExecutionCandidate,
  getActiveExecutionCommitment,
  getActiveExecutionGoalEvaluation,
  getActiveExecutionIntent,
  getActiveExecutionResult,
  getActiveExecutionPayloadPreview,
  getActiveExecutionPlan,
  getActiveExecutionReadiness,
  getActiveExecutionReflection,
  getActiveExecutionResultInterpretation,
  getActiveExecutionSimulation,
  getActiveExecutionStaging,
  getActiveInspectionSnapshot,
  getActiveSelection,
  getActiveSuggestionPreview,
  getActiveSuggestionPreviewId,
  getAssetById,
  getAssets,
  getAssetsByRun,
  getAssetsBySource,
  getAssetsByType,
  getAudioVisualizationArtifact,
  getExecutionDispatchCandidate,
  getEffectiveActiveSelection,
  getCurrentSourceAsset,
  getDualPreviewVolume,
  getEffectivePreviewAudioFocusSettings,
  getInspectionMode,
  getInterpretationItems,
  getLaboratoryProcessSummary,
  getLaboratoryRightPanelContext,
  getLinkedAudioAssets,
  getParentSourceForAsset,
  getReportFreshness,
  getRoiFocusActive,
  getRunSnapshotSummary,
  getSelectedDualPreviewAudioAsset,
  getSelectionDuration,
  getSelectionSuggestions,
  getWaveformTimelineModel,
  getWorkspaceDiff,
  getExecutionGoalEvaluation,
  isDualPreviewActive,
  isDualPreviewAvailable,
  isSelectionValid,
  LAB_USER_ACTION_HUB_SUCCESS_WINDOW_MS,
  normalizeAudioFocusSettings,
  parseProcessOutput,
  renderLabWaveformTimeline,
  renderWorkspaceAudioFocus,
  renderWorkspaceSurface,
  test,
};

export type {
  LabActionSuggestion,
  LabArtifactProjection,
  LabAudioFocusSettings,
  LabExecutionCommitment,
  LabExecutionDispatchCandidate,
  LabExecutionPayloadPreview,
  LabExecutionResult,
  LabSelection,
};

export type TimeoutFn = typeof globalThis.setTimeout;
export type ClearTimeoutFn = typeof globalThis.clearTimeout;

export function installTimerMock(): {
  scheduled: Array<{ fn: () => void; delay: number }>;
  restore: () => void;
} {
  const originalSetTimeout: TimeoutFn = globalThis.setTimeout;
  const originalClearTimeout: ClearTimeoutFn = globalThis.clearTimeout;
  const scheduled: Array<{ fn: () => void; delay: number }> = [];

  globalThis.setTimeout = ((fn: (...args: unknown[]) => void, delay?: number) => {
    scheduled.push({ fn: () => { fn(); }, delay: delay ?? 0 });
    return scheduled.length as unknown as ReturnType<typeof setTimeout>;
  }) as TimeoutFn;

  globalThis.clearTimeout = (() => {});

  return {
    scheduled,
    restore() {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    },
  };
}

export function createTestAudioFocusSettings(
  overrides: Partial<LabAudioFocusSettings> = {}
): LabAudioFocusSettings {
  const defaultEqBands = DEFAULT_AUDIO_FOCUS_SETTINGS.eqBands.map(function (band) {
    return { ...band };
  });
  return normalizeAudioFocusSettings(
    {
      ...DEFAULT_AUDIO_FOCUS_SETTINGS,
      ...overrides,
      eqBands: overrides.eqBands ?? defaultEqBands,
    },
    DEFAULT_AUDIO_FOCUS_SETTINGS
  );
}

export class FakeActionElement {
  dataset: Record<string, string>;

  constructor(action: string, value?: string) {
    this.dataset = {
      labAction: action,
      ...(value === undefined ? {} : { labValue: value }),
    };
  }

  closest(selector: string): FakeActionElement | null {
    if (selector === "[data-lab-action]") {
      return this;
    }
    return null;
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

export class FakeControllerDocument {
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

  removeEventListener(type: string, listener?: EventListenerOrEventListenerObject): void {
    if (!listener) {
      this.listenerSets.delete(type);
      this.listeners.delete(type);
      return;
    }
    const listeners = this.listenerSets.get(type);
    if (!listeners) {
      return;
    }
    const handler =
      typeof listener === "function"
        ? (listener)
        : (event: Event) => { listener.handleEvent(event); };
    listeners.delete(handler);
    if (listeners.size === 0) {
      this.listenerSets.delete(type);
      this.listeners.delete(type);
      return;
    }
    this.listeners.set(type, (event: Event) => {
      Array.from(this.listenerSets.get(type) ?? []).forEach(function (candidate) {
        candidate(event);
      });
    });
  }
}

export class FakeDomElement {
  closest(_selector?: string): unknown {
    return null;
  }
}

export class FakeSelectionPanelTrigger extends FakeDomElement {
  suggestionId: string | null = null;

  getAttribute(): string | null {
    return null;
  }
}

export class FakeSelectionSuggestionTrigger {
  constructor(private readonly suggestionId: string | null) {}

  getAttribute(name: string) {
    return name === "data-lab-selection-suggestion" ? this.suggestionId : null;
  }
}

export class FakeSelectionSuggestionTarget extends FakeDomElement {
  constructor(private readonly trigger: FakeSelectionSuggestionTrigger | null) {
    super();
  }

  override closest(selector?: string): unknown {
    if (selector === "[data-lab-selection-suggestion]") {
      return this.trigger;
    }
    if (selector === "[data-lab-selection-panel]") {
      return new FakeSelectionPanelTrigger();
    }
    return null;
  }
}

export class FakePanelOnlyTarget extends FakeDomElement {
  override closest(selector?: string): unknown {
    return selector === "[data-lab-selection-panel]" ? new FakeSelectionPanelTrigger() : null;
  }
}

export class FakeOutsideTarget extends FakeDomElement {
  override closest(): null {
    return null;
  }
}

export class FakeRoiStage {
  constructor(
    private readonly attrs: Record<string, string>,
    private readonly rect: {
      bottom: number;
      height: number;
      left: number;
      top: number;
      width: number;
    }
  ) {}

  closest(selector: string) {
    return selector === "[data-lab-selection-roi-stage='true']" ? this : null;
  }

  getAttribute(name: string) {
    return this.attrs[name] ?? null;
  }

  getBoundingClientRect() {
    return this.rect;
  }
}

export class FakeRoiIgnoreElement {
  closest(selector: string) {
    return selector === "[data-lab-selection-roi-ignore='true']"
      ? (this as unknown as FakeRoiStage)
      : null;
  }
}

export class FakeRoiDrawTarget extends FakeDomElement {
  constructor(private readonly stage: FakeRoiStage) {
    super();
  }

  override closest(selector?: string): unknown {
    if (selector === "[data-lab-selection-roi-stage='true']") {
      return this.stage;
    }
    return null;
  }
}

export class FakeRoiClearTrigger {
  getAttribute() {
    return null;
  }
}

export class FakeRoiClearTarget extends FakeDomElement {
  override closest(selector?: string): unknown {
    return selector === "[data-lab-selection-roi-clear]"
      ? (new FakeRoiClearTrigger())
      : null;
  }
}

export class FakeInspectionModeTrigger {
  constructor(private readonly mode: string | null) {}

  getAttribute(name: string) {
    return name === "data-lab-selection-inspection-mode" ? this.mode : null;
  }
}

export class FakeInspectionModeTarget extends FakeDomElement {
  constructor(private readonly trigger: FakeInspectionModeTrigger | null) {
    super();
  }

  override closest(selector?: string): unknown {
    if (selector === "[data-lab-selection-inspection-mode]") {
      return this.trigger;
    }
    return null;
  }
}

export class FakeClickEvent {
  defaultPrevented = false;

  constructor(public target: EventTarget | null = null) {}

  preventDefault() {
    this.defaultPrevented = true;
  }
}

export class FakeKeyboardEvent extends FakeClickEvent {
  constructor(public key: string) {
    super(null);
  }
}

export class FakeMediaElement {
  currentTime = 0;
  currentSrc = "";
  duration = 0;
  private _mozPreservesPitch = true;
  private _playbackRate = 1;
  private _preservesPitch = true;
  readyState = 1;
  muted = false;
  paused = true;
  volume = 1;
  playCalls = 0;
  playbackRateSetCalls = 0;
  pauseCalls = 0;
  pitchSetCalls = 0;
  failPlay = false;
  src = "";
  private _webkitPreservesPitch = true;
  private listeners = new Map<string, Set<(event: Event) => void>>();

  get playbackRate() {
    return this._playbackRate;
  }

  set playbackRate(value: number) {
    this._playbackRate = value;
    this.playbackRateSetCalls += 1;
  }

  get preservesPitch() {
    return this._preservesPitch;
  }

  set preservesPitch(value: boolean) {
    this._preservesPitch = value;
    this.pitchSetCalls += 1;
  }

  get mozPreservesPitch() {
    return this._mozPreservesPitch;
  }

  set mozPreservesPitch(value: boolean) {
    this._mozPreservesPitch = value;
    this.pitchSetCalls += 1;
  }

  get webkitPreservesPitch() {
    return this._webkitPreservesPitch;
  }

  set webkitPreservesPitch(value: boolean) {
    this._webkitPreservesPitch = value;
    this.pitchSetCalls += 1;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const handler =
      typeof listener === "function"
        ? (listener)
        : (event: Event) => { listener.handleEvent(event); };
    const existing = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    existing.add(handler);
    this.listeners.set(type, existing);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const existing = this.listeners.get(type);
    if (!existing) {
      return;
    }
    const handler =
      typeof listener === "function"
        ? (listener)
        : (event: Event) => { listener.handleEvent(event); };
    existing.delete(handler);
  }

  async play() {
    this.paused = false;
    this.playCalls += 1;
    if (this.failPlay) {
      this.paused = true;
      return await Promise.reject(new Error("Autoplay blocked"));
    }
    this.dispatch("play");
    await Promise.resolve();
    return undefined;
  }

  pause() {
    this.paused = true;
    this.pauseCalls += 1;
    this.dispatch("pause");
  }

  dispatch(type: string) {
    const handlers = Array.from(this.listeners.get(type) ?? []);
    handlers.forEach(function (handler) {
      handler({ type } as unknown as Event);
    });
  }

  listenerCount(type: string) {
    return (this.listeners.get(type) ?? new Set()).size;
  }
}

export class FakeRangeElement {
  constructor(
    public value: string,
    public max = "0"
  ) {}
}

export class FakeTextElement {
  constructor(public textContent: string | null = null) {}
}

export class FakePlayheadElement {
  style: Record<string, string> = {};
  attributes = new Map<string, string>();

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
}

export class FakeWindowEventTarget {
  listeners = new Map<string, (event: Event) => void>();
  roomAPI = {
    sendEvent() {},
  };

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.set(
      type,
      typeof listener === "function"
        ? (listener)
        : (event: Event) => { listener.handleEvent(event); }
    );
  }

  removeEventListener(type: string): void {
    this.listeners.delete(type);
  }
}

export class FakeTimelineTrack {
  constructor(
    private readonly left: number,
    private readonly width: number
  ) {}

  getBoundingClientRect() {
    return {
      left: this.left,
      width: this.width,
    };
  }
}

export class FakeTimelineRoot {
  dataset: Record<string, string>;

  constructor(
    private readonly track: FakeTimelineTrack,
    durationMs: number
  ) {
    this.dataset = {
      duration: String(durationMs),
    };
  }

  querySelector(selector: string) {
    return selector === ".labx-timeline__track" ? this.track : null;
  }
}

export class FakeTimelineActionElement {
  dataset: Record<string, string>;

  constructor(
    action: string,
    private readonly timeline: FakeTimelineRoot,
    value?: string
  ) {
    this.dataset = {
      labAction: action,
      ...(value === undefined ? {} : { labValue: value }),
    };
  }

  closest(selector: string) {
    if (selector === ".labx-timeline") {
      return this.timeline;
    }
    if (selector === "[data-lab-action]") {
      return this;
    }
    return selector.includes(this.dataset["labAction"] as string) ? this : null;
  }
}

export class FakeMouseEvent {
  constructor(
    public target: EventTarget | null,
    public clientX: number,
    public shiftKey = false
  ) {}

  preventDefault() {}

  stopPropagation() {}
}

export class FakeHtmlInputElement {
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

export class FakeHtmlSelectElement {
  constructor(public value = "") {}
}

export class FakeHtmlTextAreaElement {
  constructor(public value = "") {}
}

export class FakeDualPreviewDocument extends FakeControllerDocument {
  constructor(
    private readonly queryMap: Map<string, unknown>,
    private readonly mediaElements: unknown[] = []
  ) {
    super();
  }

  querySelector(selector: string) {
    return this.queryMap.get(selector) ?? null;
  }

  querySelectorAll(selector: string) {
    if (selector === ".labx-preview-media") {
      return this.mediaElements as HTMLMediaElement[];
    }
    return [] as HTMLMediaElement[];
  }
}

export class FakeCanvasContext {
  clearRectCalls = 0;
  drawImageCalls = 0;
  fillRectCalls = 0;
  fillStyle = "";
  fillStyleHistory: string[] = [];
  lastDrawImageArgs: unknown[] | null = null;
  lineWidth = 0;
  lastDrawnImageSrc: string | null = null;
  shadowBlur = 0;
  shadowColor = "";
  strokeCalls = 0;
  strokeStyle = "";
  strokeStyleHistory: string[] = [];
  transformCalls: Array<[number, number, number, number, number, number]> = [];

  beginPath() {}

  clearRect() {
    this.clearRectCalls += 1;
  }

  drawImage(...args: unknown[]) {
    const image = args[0] as { src?: string } | undefined;
    this.drawImageCalls += 1;
    this.lastDrawImageArgs = args;
    this.lastDrawnImageSrc = typeof image?.src === "string" ? image.src : null;
  }

  fillRect() {
    this.fillRectCalls += 1;
    this.fillStyleHistory.push(this.fillStyle);
  }

  lineTo() {}

  moveTo() {}

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.transformCalls.push([a, b, c, d, e, f]);
  }

  stroke() {
    this.strokeCalls += 1;
    this.strokeStyleHistory.push(this.strokeStyle);
  }
}

export class FakeCanvasElement {
  dataset: Record<string, string> = {};
  width = 320;
  height = 80;
  clientWidth = 320;
  clientHeight = 80;
  readonly context = new FakeCanvasContext();

  getContext(type: string) {
    return type === "2d" ? (this.context as unknown as CanvasRenderingContext2D) : null;
  }
}

export class FakeVisualizerSourceNode {
  connectedTargets: unknown[] = [];
  disconnectCalls = 0;

  connect(target: unknown) {
    this.connectedTargets.push(target);
  }

  disconnect() {
    this.disconnectCalls += 1;
  }
}

export class FakeVisualizerAudioParam {
  setTargetCalls: Array<[number, number, number]> = [];

  constructor(public value: number) {}

  setTargetAtTime(value: number, startTime: number, timeConstant: number) {
    this.value = value;
    this.setTargetCalls.push([value, startTime, timeConstant]);
  }
}

export class FakeVisualizerGainNode {
  connectedTargets: unknown[] = [];
  disconnectCalls = 0;
  gain = new FakeVisualizerAudioParam(1);

  connect(target: unknown) {
    this.connectedTargets.push(target);
  }

  disconnect() {
    this.disconnectCalls += 1;
  }
}

export class FakeVisualizerBiquadFilterNode {
  connectedTargets: unknown[] = [];
  disconnectCalls = 0;
  frequency = new FakeVisualizerAudioParam(350);
  gain = new FakeVisualizerAudioParam(0);
  Q = new FakeVisualizerAudioParam(1);
  type: BiquadFilterType = "lowpass";

  connect(target: unknown) {
    this.connectedTargets.push(target);
  }

  disconnect() {
    this.disconnectCalls += 1;
  }
}

export class FakeVisualizerAnalyserNode {
  connectedTargets: unknown[] = [];
  disconnectCalls = 0;
  fftSize = 2048;
  smoothingTimeConstant = 0;

  connect(target: unknown) {
    this.connectedTargets.push(target);
  }

  disconnect() {
    this.disconnectCalls += 1;
  }

  getByteTimeDomainData(buffer: Uint8Array) {
    for (let index = 0; index < buffer.length; index += 1) {
      buffer[index] = 128 + Math.round(Math.sin(index / 6) * 28);
    }
  }

  getByteFrequencyData(buffer: Uint8Array) {
    for (let index = 0; index < buffer.length; index += 1) {
      buffer[index] = Math.max(16, Math.min(255, Math.round((index / buffer.length) * 255)));
    }
  }
}

export class FakeVisualizerAudioContext {
  static constructed: FakeVisualizerAudioContext[] = [];

  currentTime = 0;
  state: AudioContextState = "suspended";
  readonly analyser = new FakeVisualizerAnalyserNode();
  readonly destination = { kind: "destination" };
  readonly biquadFilters: FakeVisualizerBiquadFilterNode[] = [];
  readonly gainNodes: FakeVisualizerGainNode[] = [];
  readonly sourceNodes: FakeVisualizerSourceNode[] = [];
  closeCalls = 0;
  resumeCalls = 0;

  constructor() {
    FakeVisualizerAudioContext.constructed.push(this);
  }

  createAnalyser() {
    return this.analyser as unknown as AnalyserNode;
  }

  createBiquadFilter() {
    const filterNode = new FakeVisualizerBiquadFilterNode();
    this.biquadFilters.push(filterNode);
    return filterNode as unknown as BiquadFilterNode;
  }

  createGain() {
    const gainNode = new FakeVisualizerGainNode();
    this.gainNodes.push(gainNode);
    return gainNode as unknown as GainNode;
  }

  createMediaElementSource() {
    const sourceNode = new FakeVisualizerSourceNode();
    this.sourceNodes.push(sourceNode);
    return sourceNode as unknown as MediaElementAudioSourceNode;
  }

  async decodeAudioData() {
    const sampleCount = 4096;
    const samples = new Float32Array(sampleCount);
    for (let index = 0; index < sampleCount; index += 1) {
      samples[index] = Math.sin(index / 18) * 0.7;
    }
    return await Promise.resolve({
      length: sampleCount,
      numberOfChannels: 1,
      getChannelData() {
        return samples;
      },
    } as unknown as AudioBuffer);
  }

  async close() {
    this.closeCalls += 1;
    this.state = "closed";
    await Promise.resolve();
  }

  async resume() {
    this.resumeCalls += 1;
    this.state = "running";
    await Promise.resolve();
  }
}

export class FakeVisualizerWindow {
  static imageLoadBehavior = new Map<string, "load" | "error" | "defer">();
  static createFakeImageClass(
    deferredImages: Map<
      string,
      Array<{ onerror: null | (() => void); onload: null | (() => void) }>
    >
  ): typeof Image {
    return class FakeImage {
      height = 120;
      naturalHeight = 120;
      naturalWidth = 1200;
      onerror: null | (() => void) = null;
      onload: null | (() => void) = null;
      private _src = "";
      width = 1200;

      get src() {
        return this._src;
      }

      set src(value: string) {
        this._src = value;
        queueMicrotask(() => {
          const behavior = FakeVisualizerWindow.imageLoadBehavior.get(value) ?? "load";
          if (behavior === "defer") {
            const pending = deferredImages.get(value) ?? [];
            pending.push(this);
            deferredImages.set(value, pending);
            return;
          }
          if (behavior === "error") {
            this.onerror?.();
            return;
          }
          this.onload?.();
        });
      }
    } as unknown as typeof Image;
  }

  AudioContext = FakeVisualizerAudioContext as unknown as typeof AudioContext;
  Image: typeof Image;
  devicePixelRatio = 1;
  fetchCalls: string[] = [];
  nextFrameId = 1;
  private readonly deferredImages = new Map<
    string,
    Array<{ onerror: null | (() => void); onload: null | (() => void) }>
  >();
  roomAPI = {
    sendEvent() {},
  };
  scheduledFrames = new Map<number, FrameRequestCallback>();

  constructor() {
    this.Image = FakeVisualizerWindow.createFakeImageClass(this.deferredImages);
  }

  addEventListener() {}

  async fetch(url: string) {
    this.fetchCalls.push(url);
    return await Promise.resolve({
      arrayBuffer: () => new ArrayBuffer(16),
      ok: true,
    } as unknown as Response);
  }

  cancelAnimationFrame(id: number) {
    this.scheduledFrames.delete(id);
  }

  flushFrame(timestamp = 16) {
    const nextFrame = this.scheduledFrames.entries().next();
    if (nextFrame.done === true) {
      return;
    }
    const [frameId, callback] = nextFrame.value;
    this.scheduledFrames.delete(frameId);
    callback(timestamp);
  }

  flushDeferredImage(url: string) {
    const pending = this.deferredImages.get(url) ?? [];
    this.deferredImages.delete(url);
    pending.forEach(function (image) {
      image.onload?.();
    });
  }

  getComputedStyle() {
    return {
      getPropertyValue(name: string) {
        switch (name) {
          case "--labx-accent":
            return "#5cd7df";
          case "--labx-border":
            return "rgba(116, 155, 193, 0.18)";
          case "--labx-text-dim":
            return "#6d8197";
          default:
            return "";
        }
      },
    } as CSSStyleDeclaration;
  }

  requestAnimationFrame(callback: FrameRequestCallback) {
    const frameId = this.nextFrameId;
    this.nextFrameId += 1;
    this.scheduledFrames.set(frameId, callback);
    return frameId;
  }
}

export class FakeVisualizerDocument {
  hidden = false;
  private listeners = new Map<string, Set<(event: Event) => void>>();

  constructor(
    public primaryMediaPreview: FakeMediaElement | null,
    public dualAudioPreview: FakeMediaElement | null,
    public canvas: FakeCanvasElement | null
  ) {}

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const handler =
      typeof listener === "function"
        ? (listener)
        : (event: Event) => { listener.handleEvent(event); };
    const existing = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    existing.add(handler);
    this.listeners.set(type, existing);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const existing = this.listeners.get(type);
    if (!existing) {
      return;
    }
    const handler =
      typeof listener === "function"
        ? (listener)
        : (event: Event) => { listener.handleEvent(event); };
    existing.delete(handler);
  }

  dispatch(type: string) {
    Array.from(this.listeners.get(type) ?? []).forEach(function (handler) {
      handler({ type } as unknown as Event);
    });
  }

  querySelector(selector: string) {
    if (selector === 'audio[data-lab-preserve-media="workspace-preview-dual-audio"]') {
      return this.dualAudioPreview;
    }
    if (
      selector === 'audio[data-lab-preserve-media="workspace-preview"]' ||
      selector === 'video[data-lab-preserve-media="workspace-preview"]'
    ) {
      return this.primaryMediaPreview;
    }
    if (selector === "#lab-audio-viz") {
      return this.canvas;
    }
    return null;
  }
}

export async function flushVisualizerWork(turns = 6) {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
}

export function createDualPreviewSnapshot(startOffsetMs = 0) {
  return {
    ready: true,
    featureId: "media-analysis",
    activeProjectId: "project-dual-preview",
    projects: [{ id: "project-dual-preview", name: "lab-demo.mp4", hasSource: true }],
    activeProject: {
      id: "project-dual-preview",
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
          durationSeconds: 6,
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
          metadata: {
            storedFileName: "lab-demo.mp4",
          },
        },
        {
          id: "asset-audio-linked",
          type: "audio",
          name: "audio.wav",
          localPath: "/tmp/audio.wav",
          createdAt: 200,
          sourceId: "source-active",
          derivedFromAssetId: "source-active",
          derivedFromSourceId: "source-active",
          metadata: {
            durationMs: 6000,
            startOffsetMs,
          },
        },
      ],
    },
    workbench: {
      activeModuleId: "media-analysis",
      availableModuleIds: ["media-analysis"],
      selectedModuleIds: ["media-analysis"],
    },
    sourceProbeStatus: "completed",
    profileModels: [],
    reports: {
      user: null,
      ai: null,
      emptyReason: "Rapor henüz üretilmedi.",
    },
    activityFeed: [],
  };
}

export async function importLabRootModuleWithDomStub<T>(): Promise<T> {
  class MinimalElement {}
  class MinimalDetailsElement extends MinimalElement {
    open = false;
  }

  const descriptors = {
    document: Object.getOwnPropertyDescriptor(globalThis, "document"),
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
    HTMLElement: Object.getOwnPropertyDescriptor(globalThis, "HTMLElement"),
    HTMLDetailsElement: Object.getOwnPropertyDescriptor(globalThis, "HTMLDetailsElement"),
  };

  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: MinimalElement,
  });
  Object.defineProperty(globalThis, "HTMLDetailsElement", {
    configurable: true,
    value: MinimalDetailsElement,
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
    return (await import("../../rooms/laboratory/ui/lab-root.ts")) as T;
  } finally {
    Object.entries(descriptors).forEach(([key, descriptor]) => {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, key);
      }
    });
  }
}
