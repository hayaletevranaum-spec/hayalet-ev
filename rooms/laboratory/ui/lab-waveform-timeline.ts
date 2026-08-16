import { escapeHtml } from "../domain/lab-types.js";
import { getLabAudioObservationLayout } from "../domain/lab-audio-observation.js";
import type {
  LabWaveformTimelineModel,
  LabWaveformTimelineVisualizerDeps,
} from "./lab-waveform-timeline-types.js";
import { createLabWaveformTimelineVisualizer as createBaseLabWaveformTimelineVisualizer } from "./lab-waveform-timeline-visualizer.js";
import {
  renderLabWaveformSelectionPanel,
  renderLabWaveformTimeline as renderBaseLabWaveformTimeline,
} from "./lab-waveform-timeline-render.js";

export type {
  LabWaveformTimelineModel,
  LabWaveformTimelineVisualizerDeps,
} from "./lab-waveform-timeline-types.js";
export { renderLabWaveformSelectionPanel };

function renderAudioObservationToggle(model: LabWaveformTimelineModel) {
  const layout = getLabAudioObservationLayout(model.audioFocus);
  const expanded = layout === "expanded";
  const locale = (model.copy?.locale ?? "en").toLowerCase();
  const turkish = locale.startsWith("tr");
  const labelFallback = turkish ? "Gözlem" : "Observe";
  const titleFallback = expanded
    ? turkish
      ? "Standart oynatıcı görünümüne dön."
      : "Return to the standard player layout."
    : turkish
      ? "Ses görselleştirmesini büyüt, video önizlemesini daralt."
      : "Expand audio observation and reduce the video preview.";
  const titleKey = expanded
    ? "mediaAnalysis.timeline.audioObservationStandardTitle"
    : "mediaAnalysis.timeline.audioObservationExpandedTitle";
  const label =
    model.copy?.t("mediaAnalysis.timeline.audioObservationMode", labelFallback) ?? labelFallback;
  const title = model.copy?.t(titleKey, titleFallback) ?? titleFallback;
  const disabled = model.lockState?.timeline === true ? ' disabled aria-disabled="true"' : "";
  return `
    <button
      class="labx-timeline__export-btn labx-timeline__observation-toggle"
      type="button"
      data-lab-action="workspace-setting-adjust"
      data-lab-field="workspace.audioFocus.observationLayout"
      data-lab-options="balanced|expanded"
      data-lab-delta="${expanded ? "-1" : "1"}"
      data-lab-reset-value="balanced"
      data-lab-audio-observation-toggle="true"
      aria-pressed="${expanded ? "true" : "false"}"
      title="${escapeHtml(title)}"${disabled}
    >${escapeHtml(label)}</button>
  `;
}

export function renderLabWaveformTimeline(model: LabWaveformTimelineModel) {
  const baseMarkup = renderBaseLabWaveformTimeline(model);
  if (model.sourceKind !== "audio" && model.sourceKind !== "video") {
    return baseMarkup;
  }
  const layout = getLabAudioObservationLayout(model.audioFocus);
  return baseMarkup
    .replace(
      'data-waveform-mode="source-audio"',
      `data-waveform-mode="source-audio" data-audio-observation-layout="${layout}"`
    )
    .replace(
      '<div class="labx-timeline__actions">',
      `<div class="labx-timeline__actions">${renderAudioObservationToggle(model)}`
    );
}

function createDecodeSafeWindowRef(
  deps: LabWaveformTimelineVisualizerDeps
): LabWaveformTimelineVisualizerDeps["windowRef"] {
  const sourceWindow = deps.windowRef;
  const sourceFetch =
    typeof sourceWindow.fetch === "function" ? sourceWindow.fetch.bind(sourceWindow) : null;
  const globalFetch =
    typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null;
  const guardedFetch: typeof fetch = function (...args) {
    if (deps.getTimelineModel?.().sourceKind === "video") {
      return Promise.reject(new TypeError("Raw video waveform fallback decoding is disabled."));
    }
    if (sourceFetch !== null) {
      return sourceFetch(...args);
    }
    if (globalFetch !== null) {
      return globalFetch(...args);
    }
    return Promise.reject(new TypeError("Fetch is unavailable for waveform fallback decoding."));
  };

  return new Proxy(sourceWindow, {
    get(target, property) {
      if (property === "fetch") {
        return guardedFetch;
      }
      const value = Reflect.get(target, property, target) as unknown;
      if (
        typeof value === "function" &&
        property !== "AudioContext" &&
        property !== "webkitAudioContext" &&
        property !== "Image"
      ) {
        return (value as (...args: unknown[]) => unknown).bind(target);
      }
      return value;
    },
  });
}

export function createLabWaveformTimelineVisualizer(deps: LabWaveformTimelineVisualizerDeps) {
  const visualizer = createBaseLabWaveformTimelineVisualizer({
    ...deps,
    windowRef: createDecodeSafeWindowRef(deps),
  });
  let externalSyncBlocked = false;

  function sync() {
    if (externalSyncBlocked) {
      return;
    }
    externalSyncBlocked = true;
    queueMicrotask(function () {
      externalSyncBlocked = false;
    });
    visualizer.sync();
  }

  return {
    ...visualizer,
    sync,
  };
}
