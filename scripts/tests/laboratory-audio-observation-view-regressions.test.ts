import assert from "node:assert/strict";
import test from "node:test";
import type { LabAudioFocusSettings } from "../../rooms/laboratory/domain/lab-types.ts";
import { getLabAudioObservationLayout } from "../../rooms/laboratory/domain/lab-audio-observation.ts";
import {
  createAudioFocusSignature,
  DEFAULT_AUDIO_FOCUS_SETTINGS,
  normalizeAudioFocusSettings,
} from "../../rooms/laboratory/runtime/lab-audio-focus-normalization.ts";
import { renderLabWaveformTimeline } from "../../rooms/laboratory/ui/lab-waveform-timeline.ts";
import type { LabWaveformTimelineModel } from "../../rooms/laboratory/ui/lab-waveform-timeline-types.ts";

function createTimelineModel(audioFocus: LabAudioFocusSettings): LabWaveformTimelineModel {
  return {
    activeSelection: null,
    audioFocus,
    bookmarks: [],
    durationMs: 60_000,
    endMs: null,
    sourceKind: "video",
    startMs: null,
    visualizationMode: "waveform",
    waveformCropEndRatio: 1,
    waveformCropStartRatio: 0,
    waveformSourceLabel: "Source audio",
    waveformSyncLabel: "Synchronized",
    waveformWindowDurationMs: 60_000,
    waveformWindowStartMs: 0,
  };
}

function createAudioFocusWithObservationLayout(layout: "balanced" | "expanded") {
  return normalizeAudioFocusSettings({
    ...DEFAULT_AUDIO_FOCUS_SETTINGS,
    observationLayout: layout,
  } as unknown as Partial<LabAudioFocusSettings>);
}

test("laboratory audio observation layout defaults to balanced", function () {
  const audioFocus = normalizeAudioFocusSettings(DEFAULT_AUDIO_FOCUS_SETTINGS);
  const markup = renderLabWaveformTimeline(createTimelineModel(audioFocus));

  assert.equal(getLabAudioObservationLayout(audioFocus), "balanced");
  assert.match(markup, /data-audio-observation-layout="balanced"/);
  assert.match(markup, /data-lab-field="workspace\.audioFocus\.observationLayout"/);
  assert.match(markup, /data-lab-options="balanced\|expanded"/);
  assert.match(markup, /data-lab-audio-observation-toggle="true"/);
  assert.match(markup, /aria-pressed="false"/);
});

test("laboratory expanded audio observation layout renders an active reversible toggle", function () {
  const audioFocus = createAudioFocusWithObservationLayout("expanded");
  const markup = renderLabWaveformTimeline(createTimelineModel(audioFocus));

  assert.equal(getLabAudioObservationLayout(audioFocus), "expanded");
  assert.match(markup, /data-audio-observation-layout="expanded"/);
  assert.match(markup, /data-lab-delta="-1"/);
  assert.match(markup, /aria-pressed="true"/);
});

test("audio observation layout remains view-only for audio processing signatures", function () {
  const balanced = createAudioFocusWithObservationLayout("balanced");
  const expanded = createAudioFocusWithObservationLayout("expanded");

  assert.equal(createAudioFocusSignature(balanced), createAudioFocusSignature(expanded));
});

test("audio observation toggle is not injected for non temporal image sources", function () {
  const audioFocus = createAudioFocusWithObservationLayout("expanded");
  const model = createTimelineModel(audioFocus);
  model.sourceKind = "image";
  const markup = renderLabWaveformTimeline(model);

  assert.doesNotMatch(markup, /data-audio-observation-layout=/);
  assert.doesNotMatch(markup, /data-lab-audio-observation-toggle="true"/);
});
