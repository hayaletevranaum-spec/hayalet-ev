import type { LabStoreEvent } from "../../rooms/laboratory/domain/lab-types.ts";
import {
  assert,
  createAudioVisualizer,
  createLabStore,
  createTestAudioFocusSettings,
  FakeCanvasElement,
  FakeMediaElement,
  FakeVisualizerAudioContext,
  FakeVisualizerDocument,
  FakeVisualizerWindow,
  flushVisualizerWork,
  getAudioVisualizationArtifact,
  renderWorkspaceAudioFocus,
  test,
} from "./laboratory-runtime-truth.helpers.ts";

void test("runtime audio visualizer draws waveform frames and scales with device pixel ratio", async () => {
  FakeVisualizerAudioContext.constructed = [];
  const media = new FakeMediaElement();
  media.paused = false;
  const canvas = new FakeCanvasElement();
  canvas.clientWidth = 200;
  canvas.clientHeight = 60;
  const documentRef = new FakeVisualizerDocument(media, null, canvas);
  const windowRef = new FakeVisualizerWindow();
  windowRef.devicePixelRatio = 3;
  const controller = createAudioVisualizer(
    media as unknown as HTMLMediaElement,
    canvas as unknown as HTMLCanvasElement,
    {
      documentRef: documentRef as unknown as Document,
      getMode() {
        return "waveform";
      },
      windowRef: windowRef as unknown as Window,
    }
  );

  controller.start();
  await flushVisualizerWork();

  assert.equal(FakeVisualizerAudioContext.constructed.length, 1);
  assert.equal(canvas.width, 600);
  assert.equal(canvas.height, 180);
  assert.deepEqual(canvas.context.transformCalls.at(-1), [3, 0, 0, 3, 0, 0]);
  assert.ok(canvas.context.strokeCalls > 0);
  assert.equal(windowRef.scheduledFrames.size, 1);

  controller.destroy();
});

void test("runtime audio visualizer renders frequency data in spectrum mode", async () => {
  FakeVisualizerAudioContext.constructed = [];
  const media = new FakeMediaElement();
  media.paused = false;
  const canvas = new FakeCanvasElement();
  const documentRef = new FakeVisualizerDocument(media, null, canvas);
  const windowRef = new FakeVisualizerWindow();
  const controller = createAudioVisualizer(
    media as unknown as HTMLMediaElement,
    canvas as unknown as HTMLCanvasElement,
    {
      documentRef: documentRef as unknown as Document,
      getMode() {
        return "spectrum";
      },
      windowRef: windowRef as unknown as Window,
    }
  );

  controller.start();
  await flushVisualizerWork();

  assert.equal(FakeVisualizerAudioContext.constructed.length, 1);
  assert.ok(canvas.context.fillRectCalls > 0);
  assert.equal(windowRef.scheduledFrames.size, 1);

  controller.destroy();
});

void test("runtime audio visualizer applies preview audio focus through a stable processing graph", async () => {
  FakeVisualizerAudioContext.constructed = [];
  const media = new FakeMediaElement();
  media.paused = false;
  const canvas = new FakeCanvasElement();
  const documentRef = new FakeVisualizerDocument(media, null, canvas);
  const windowRef = new FakeVisualizerWindow();
  const audioFocus = createTestAudioFocusSettings({
    gain: 2.4,
    filterType: "highpass",
    filterFrequency: 1280,
    filterQ: 7.5,
    playbackRate: 0.65,
    preservePitch: false,
    visualizationMode: "waveform",
    eqBands: [
      { frequency: 60, gain: -6, Q: 1.4, type: "lowshelf" },
      { frequency: 250, gain: -3.5, Q: 0.8, type: "peaking" },
      { frequency: 1000, gain: 2.5, Q: 1.2, type: "peaking" },
      { frequency: 4000, gain: 4.5, Q: 1.6, type: "peaking" },
      { frequency: 12000, gain: 3, Q: 0.9, type: "highshelf" },
    ],
  });
  const controller = createAudioVisualizer(
    media as unknown as HTMLMediaElement,
    canvas as unknown as HTMLCanvasElement,
    {
      documentRef: documentRef as unknown as Document,
      getAudioFocus() {
        return audioFocus;
      },
      getMode() {
        return "waveform";
      },
      windowRef: windowRef as unknown as Window,
    }
  );

  controller.start();
  await flushVisualizerWork();

  const audioContext = FakeVisualizerAudioContext.constructed[0];
  const gainNode = audioContext?.gainNodes[0];
  const primaryFilter = audioContext?.biquadFilters[0];
  const eqNodes = audioContext?.biquadFilters.slice(1) ?? [];

  assert.equal(FakeVisualizerAudioContext.constructed.length, 1);
  assert.equal(audioContext?.sourceNodes.length, 1);
  assert.equal(audioContext?.gainNodes.length, 1);
  assert.equal(audioContext?.biquadFilters.length, 6);
  assert.equal(audioContext?.sourceNodes[0]?.connectedTargets[0], gainNode);
  assert.equal(gainNode?.connectedTargets[0], primaryFilter);
  assert.equal(primaryFilter?.connectedTargets[0], eqNodes[0]);
  assert.equal(eqNodes.at(-1)?.connectedTargets[0], audioContext?.analyser);
  assert.equal(audioContext?.analyser.connectedTargets[0], audioContext?.destination);
  assert.equal(media.playbackRate, 0.65);
  assert.equal(media.preservesPitch, false);
  assert.equal(media.mozPreservesPitch, false);
  assert.equal(media.webkitPreservesPitch, false);
  assert.deepEqual(gainNode?.gain.setTargetCalls.at(-1), [2.4, 0, 0.01]);
  assert.equal(primaryFilter?.type, "highpass");
  assert.deepEqual(primaryFilter?.frequency.setTargetCalls.at(-1), [1280, 0, 0.01]);
  assert.deepEqual(primaryFilter?.Q.setTargetCalls.at(-1), [7.5, 0, 0.01]);
  assert.equal(eqNodes[0]?.type, "lowshelf");
  assert.deepEqual(eqNodes[0]?.gain.setTargetCalls.at(-1), [-6, 0, 0.01]);
  assert.equal(eqNodes[4]?.type, "highshelf");
  assert.deepEqual(eqNodes[4]?.gain.setTargetCalls.at(-1), [3, 0, 0.01]);

  controller.destroy();
});

void test("runtime audio visualizer clamps preview audio focus values and skips unchanged param reapply", async () => {
  FakeVisualizerAudioContext.constructed = [];
  const media = new FakeMediaElement();
  media.paused = false;
  const canvas = new FakeCanvasElement();
  const documentRef = new FakeVisualizerDocument(media, null, canvas);
  const windowRef = new FakeVisualizerWindow();
  let audioFocus = createTestAudioFocusSettings({
    gain: 9,
    filterType: "bandpass",
    filterFrequency: 40_000,
    filterQ: 0.01,
    playbackRate: 5,
    preservePitch: false,
    visualizationMode: "waveform",
    eqBands: [
      { frequency: 5, gain: -30, Q: 99, type: "lowshelf" },
      { frequency: 250, gain: 15, Q: 0.01, type: "peaking" },
      { frequency: 1000, gain: 0, Q: 1, type: "peaking" },
      { frequency: 4000, gain: -18, Q: 25, type: "peaking" },
      { frequency: 50_000, gain: 22, Q: 0.02, type: "highshelf" },
    ],
  });
  const controller = createAudioVisualizer(
    media as unknown as HTMLMediaElement,
    canvas as unknown as HTMLCanvasElement,
    {
      documentRef: documentRef as unknown as Document,
      getAudioFocus() {
        return audioFocus;
      },
      getMode() {
        return "waveform";
      },
      windowRef: windowRef as unknown as Window,
    }
  );

  controller.start();
  await flushVisualizerWork();

  const audioContext = FakeVisualizerAudioContext.constructed[0];
  const gainNode = audioContext?.gainNodes[0];
  const primaryFilter = audioContext?.biquadFilters[0];
  const eqNodes = audioContext?.biquadFilters.slice(1) ?? [];
  const initialGainCalls = gainNode?.gain.setTargetCalls.length ?? 0;
  const initialFilterCalls = primaryFilter?.frequency.setTargetCalls.length ?? 0;
  const initialPlaybackSetCalls = media.playbackRateSetCalls;
  const initialPitchSetCalls = media.pitchSetCalls;

  assert.equal(media.playbackRate, 2);
  assert.equal(media.preservesPitch, false);
  assert.deepEqual(gainNode?.gain.setTargetCalls.at(-1), [3, 0, 0.01]);
  assert.deepEqual(primaryFilter?.frequency.setTargetCalls.at(-1), [20000, 0, 0.01]);
  assert.deepEqual(primaryFilter?.Q.setTargetCalls.at(-1), [0.1, 0, 0.01]);
  assert.deepEqual(eqNodes[0]?.frequency.setTargetCalls.at(-1), [20, 0, 0.01]);
  assert.deepEqual(eqNodes[0]?.gain.setTargetCalls.at(-1), [-12, 0, 0.01]);
  assert.deepEqual(eqNodes[4]?.frequency.setTargetCalls.at(-1), [20000, 0, 0.01]);
  assert.deepEqual(eqNodes[4]?.gain.setTargetCalls.at(-1), [12, 0, 0.01]);

  controller.start();
  await flushVisualizerWork();
  assert.equal(gainNode?.gain.setTargetCalls.length ?? 0, initialGainCalls);
  assert.equal(primaryFilter?.frequency.setTargetCalls.length ?? 0, initialFilterCalls);
  assert.equal(media.playbackRateSetCalls, initialPlaybackSetCalls);
  assert.equal(media.pitchSetCalls, initialPitchSetCalls);

  audioFocus = {
    ...audioFocus,
    playbackRate: 0.5,
    preservePitch: true,
  };
  controller.start();
  await flushVisualizerWork();

  const playbackOnlySetCalls = media.playbackRateSetCalls;
  const pitchOnlySetCalls = media.pitchSetCalls;
  assert.equal(media.playbackRate, 0.5);
  assert.equal(media.preservesPitch, true);
  assert.equal(gainNode?.gain.setTargetCalls.length ?? 0, initialGainCalls);
  assert.equal(primaryFilter?.frequency.setTargetCalls.length ?? 0, initialFilterCalls);
  assert.equal(media.playbackRateSetCalls, initialPlaybackSetCalls + 1);
  assert.equal(pitchOnlySetCalls > initialPitchSetCalls, true);

  audioFocus = {
    ...audioFocus,
    gain: 0.4,
    filterFrequency: 880,
    filterQ: 4.5,
    eqBands: audioFocus.eqBands.map(function (band, index) {
      return index === 1 ? { ...band, gain: -4 } : band;
    }),
  };
  controller.start();
  await flushVisualizerWork();

  assert.equal(FakeVisualizerAudioContext.constructed.length, 1);
  assert.equal(audioContext?.sourceNodes.length, 1);
  assert.deepEqual(gainNode?.gain.setTargetCalls.at(-1), [0.4, 0, 0.01]);
  assert.deepEqual(primaryFilter?.frequency.setTargetCalls.at(-1), [880, 0, 0.01]);
  assert.deepEqual(primaryFilter?.Q.setTargetCalls.at(-1), [4.5, 0, 0.01]);
  assert.deepEqual(eqNodes[1]?.gain.setTargetCalls.at(-1), [-4, 0, 0.01]);
  assert.equal(gainNode?.gain.setTargetCalls.length ?? 0, initialGainCalls + 1);
  assert.equal(media.playbackRateSetCalls, playbackOnlySetCalls);
  assert.equal(media.pitchSetCalls, pitchOnlySetCalls);

  controller.destroy();
});

void test("runtime audio visualizer bypasses the primary filter stage when filter type is none", async () => {
  FakeVisualizerAudioContext.constructed = [];
  const media = new FakeMediaElement();
  media.paused = false;
  const canvas = new FakeCanvasElement();
  const documentRef = new FakeVisualizerDocument(media, null, canvas);
  const windowRef = new FakeVisualizerWindow();
  let audioFocus = createTestAudioFocusSettings({
    gain: 1.1,
    filterType: "none",
    filterFrequency: 1000,
    filterQ: 1,
    visualizationMode: "waveform",
    eqBands: [
      { frequency: 60, gain: 0, Q: 1, type: "lowshelf" },
      { frequency: 250, gain: 0, Q: 1, type: "peaking" },
      { frequency: 1000, gain: 0, Q: 1, type: "peaking" },
      { frequency: 4000, gain: 0, Q: 1, type: "peaking" },
      { frequency: 12000, gain: 0, Q: 1, type: "highshelf" },
    ],
  });
  const controller = createAudioVisualizer(
    media as unknown as HTMLMediaElement,
    canvas as unknown as HTMLCanvasElement,
    {
      documentRef: documentRef as unknown as Document,
      getAudioFocus() {
        return audioFocus;
      },
      getMode() {
        return "waveform";
      },
      windowRef: windowRef as unknown as Window,
    }
  );

  controller.start();
  await flushVisualizerWork();

  const audioContext = FakeVisualizerAudioContext.constructed[0];
  const gainNode = audioContext?.gainNodes[0];
  const primaryFilter = audioContext?.biquadFilters[0];
  const firstEqNode = audioContext?.biquadFilters[1];

  assert.equal(gainNode?.connectedTargets.at(-1), firstEqNode);

  audioFocus = {
    ...audioFocus,
    filterType: "lowpass",
    filterFrequency: 850,
  };
  controller.start();
  await flushVisualizerWork();

  assert.equal(gainNode?.connectedTargets.at(-1), primaryFilter);
  assert.equal(primaryFilter?.type, "lowpass");
  assert.equal(primaryFilter?.connectedTargets.at(-1), firstEqNode);

  audioFocus = {
    ...audioFocus,
    filterType: "highpass",
  };
  controller.start();
  await flushVisualizerWork();

  assert.equal(primaryFilter?.type, "highpass");
  assert.equal(gainNode?.connectedTargets.at(-1), primaryFilter);

  audioFocus = {
    ...audioFocus,
    filterType: "none",
  };
  controller.start();
  await flushVisualizerWork();

  assert.equal(gainNode?.connectedTargets.at(-1), firstEqNode);

  controller.destroy();
});

void test("runtime audio visualizer preserves custom preview audio focus across pause play and seek", async () => {
  FakeVisualizerAudioContext.constructed = [];
  const media = new FakeMediaElement();
  media.paused = false;
  const canvas = new FakeCanvasElement();
  const documentRef = new FakeVisualizerDocument(media, null, canvas);
  const windowRef = new FakeVisualizerWindow();
  const audioFocus = createTestAudioFocusSettings({
    gain: 1.9,
    filterType: "bandpass" as const,
    filterFrequency: 1450,
    filterQ: 6.2,
    playbackRate: 0.8,
    preservePitch: false,
    visualizationMode: "waveform" as const,
    eqBands: [
      { frequency: 60, gain: -2, Q: 1.1, type: "lowshelf" as const },
      { frequency: 250, gain: 1.5, Q: 0.9, type: "peaking" as const },
      { frequency: 1000, gain: 3.5, Q: 1.4, type: "peaking" as const },
      { frequency: 4000, gain: -1, Q: 1.3, type: "peaking" as const },
      { frequency: 12000, gain: 2.5, Q: 0.8, type: "highshelf" as const },
    ],
  });
  const controller = createAudioVisualizer(
    media as unknown as HTMLMediaElement,
    canvas as unknown as HTMLCanvasElement,
    {
      documentRef: documentRef as unknown as Document,
      getAudioFocus() {
        return audioFocus;
      },
      getMode() {
        return "waveform";
      },
      windowRef: windowRef as unknown as Window,
    }
  );

  controller.start();
  await flushVisualizerWork();

  const audioContext = FakeVisualizerAudioContext.constructed[0];
  const gainNode = audioContext?.gainNodes[0];
  const primaryFilter = audioContext?.biquadFilters[0];
  const eqNodes = audioContext?.biquadFilters.slice(1) ?? [];
  const initialGainCalls = gainNode?.gain.setTargetCalls.length ?? 0;
  const initialFilterCalls = primaryFilter?.frequency.setTargetCalls.length ?? 0;
  const initialEqCalls = eqNodes[2]?.gain.setTargetCalls.length ?? 0;

  assert.deepEqual(gainNode?.gain.setTargetCalls.at(-1), [1.9, 0, 0.01]);
  assert.equal(media.playbackRate, 0.8);
  assert.equal(media.preservesPitch, false);
  assert.deepEqual(primaryFilter?.frequency.setTargetCalls.at(-1), [1450, 0, 0.01]);
  assert.deepEqual(primaryFilter?.Q.setTargetCalls.at(-1), [6.2, 0, 0.01]);
  assert.deepEqual(eqNodes[2]?.gain.setTargetCalls.at(-1), [3.5, 0, 0.01]);

  media.pause();
  await flushVisualizerWork();

  assert.equal(windowRef.scheduledFrames.size, 0);
  assert.equal(gainNode?.gain.value, 1.9);
  assert.equal(media.playbackRate, 0.8);
  assert.equal(media.preservesPitch, false);
  assert.equal(primaryFilter?.type, "bandpass");
  assert.equal(primaryFilter?.frequency.value, 1450);
  assert.equal(primaryFilter?.Q.value, 6.2);
  assert.equal(eqNodes[2]?.gain.value, 3.5);

  await media.play();
  await flushVisualizerWork();

  assert.equal(windowRef.scheduledFrames.size, 1);
  assert.equal(gainNode?.gain.value, 1.9);
  assert.equal(media.playbackRate, 0.8);
  assert.equal(media.preservesPitch, false);
  assert.equal(primaryFilter?.type, "bandpass");
  assert.equal(primaryFilter?.frequency.value, 1450);
  assert.equal(primaryFilter?.Q.value, 6.2);
  assert.equal(eqNodes[2]?.gain.value, 3.5);
  assert.equal(gainNode?.gain.setTargetCalls.length ?? 0, initialGainCalls);
  assert.equal(primaryFilter?.frequency.setTargetCalls.length ?? 0, initialFilterCalls);
  assert.equal(eqNodes[2]?.gain.setTargetCalls.length ?? 0, initialEqCalls);

  media.dispatch("seeking");
  await flushVisualizerWork();

  assert.equal(windowRef.scheduledFrames.size, 1);
  assert.equal(gainNode?.gain.value, 1.9);
  assert.equal(media.playbackRate, 0.8);
  assert.equal(media.preservesPitch, false);
  assert.equal(primaryFilter?.type, "bandpass");
  assert.equal(primaryFilter?.frequency.value, 1450);
  assert.equal(primaryFilter?.Q.value, 6.2);
  assert.equal(eqNodes[2]?.gain.value, 3.5);
  assert.equal(gainNode?.gain.setTargetCalls.length ?? 0, initialGainCalls);
  assert.equal(primaryFilter?.frequency.setTargetCalls.length ?? 0, initialFilterCalls);
  assert.equal(eqNodes[2]?.gain.setTargetCalls.length ?? 0, initialEqCalls);

  controller.destroy();
});

void test("runtime audio visualizer keeps realtime rendering alive after seek while playing", async () => {
  FakeVisualizerAudioContext.constructed = [];
  const media = new FakeMediaElement();
  media.paused = false;
  const canvas = new FakeCanvasElement();
  const documentRef = new FakeVisualizerDocument(media, null, canvas);
  const windowRef = new FakeVisualizerWindow();
  const controller = createAudioVisualizer(
    media as unknown as HTMLMediaElement,
    canvas as unknown as HTMLCanvasElement,
    {
      documentRef: documentRef as unknown as Document,
      getMode() {
        return "waveform";
      },
      windowRef: windowRef as unknown as Window,
    }
  );

  controller.start();
  await flushVisualizerWork();

  const initialStrokeCalls = canvas.context.strokeCalls;
  assert.equal(windowRef.scheduledFrames.size, 1);

  media.dispatch("seeking");
  await flushVisualizerWork();
  assert.ok(canvas.context.strokeCalls > initialStrokeCalls);
  assert.equal(windowRef.scheduledFrames.size, 1);

  windowRef.flushFrame();
  await flushVisualizerWork();
  assert.equal(windowRef.scheduledFrames.size, 1);

  media.pause();
  await flushVisualizerWork();
  assert.equal(windowRef.scheduledFrames.size, 0);

  controller.destroy();
});

void test("runtime audio visualizer throttles paused seek refreshes to snapshot-only rendering", async () => {
  FakeVisualizerAudioContext.constructed = [];
  const media = new FakeMediaElement();
  media.paused = true;
  const canvas = new FakeCanvasElement();
  const documentRef = new FakeVisualizerDocument(media, null, canvas);
  const windowRef = new FakeVisualizerWindow();
  const controller = createAudioVisualizer(
    media as unknown as HTMLMediaElement,
    canvas as unknown as HTMLCanvasElement,
    {
      documentRef: documentRef as unknown as Document,
      getMode() {
        return "waveform";
      },
      windowRef: windowRef as unknown as Window,
    }
  );

  controller.start();
  await flushVisualizerWork();

  const initialStrokeCalls = canvas.context.strokeCalls;
  assert.equal(windowRef.scheduledFrames.size, 0);

  media.currentTime = 12.3;
  media.dispatch("seeking");
  await flushVisualizerWork();
  assert.ok(canvas.context.strokeCalls > initialStrokeCalls);
  assert.equal(windowRef.scheduledFrames.size, 0);

  controller.destroy();
});

void test("runtime audio visualizer pauses on visibility changes and tears down listeners on destroy", async () => {
  FakeVisualizerAudioContext.constructed = [];
  const media = new FakeMediaElement();
  media.paused = false;
  const canvas = new FakeCanvasElement();
  const documentRef = new FakeVisualizerDocument(media, null, canvas);
  const windowRef = new FakeVisualizerWindow();
  const controller = createAudioVisualizer(
    media as unknown as HTMLMediaElement,
    canvas as unknown as HTMLCanvasElement,
    {
      documentRef: documentRef as unknown as Document,
      getMode() {
        return "waveform";
      },
      windowRef: windowRef as unknown as Window,
    }
  );

  controller.start();
  await flushVisualizerWork();
  assert.equal(windowRef.scheduledFrames.size, 1);
  assert.equal(media.listenerCount("play"), 1);

  documentRef.hidden = true;
  documentRef.dispatch("visibilitychange");
  await flushVisualizerWork();
  assert.equal(windowRef.scheduledFrames.size, 0);

  documentRef.hidden = false;
  documentRef.dispatch("visibilitychange");
  await flushVisualizerWork();
  assert.equal(windowRef.scheduledFrames.size, 1);

  controller.destroy();
  assert.equal(windowRef.scheduledFrames.size, 0);
  assert.equal(media.listenerCount("play"), 0);

  media.dispatch("play");
  await flushVisualizerWork();
  assert.equal(windowRef.scheduledFrames.size, 0);
});

void test("laboratory workspace audio focus defaults to waveform visualization", () => {
  const store = createLabStore();
  assert.equal(store.getState().ui.workspace.audioFocus.visualizationMode, "waveform");
});

void test("laboratory hydration upgrades deprecated audio visualization none mode to waveform", () => {
  const store = createLabStore();
  store.dispatch({
    type: "hydrate-complete",
    payload: {
      workspace: {
        audioFocus: {
          ...store.getState().ui.workspace.audioFocus,
          visualizationMode: "none",
        },
      },
    },
  } as unknown as LabStoreEvent);

  assert.equal(store.getState().ui.workspace.audioFocus.visualizationMode, "waveform");
});

void test("laboratory audio focus updates preserve an existing spectrogram preference", () => {
  const store = createLabStore();
  store.dispatch({
    type: "workspace-audio-updated",
    patch: {
      visualizationMode: "spectrum",
    },
  });
  store.dispatch({
    type: "workspace-audio-updated",
    patch: {
      filterType: "highpass",
    },
  });

  assert.equal(store.getState().ui.workspace.audioFocus.visualizationMode, "spectrum");
});

void test("audio visualization selector prefers renderable current-run artifacts by mode", () => {
  const store = createLabStore();
  const state = store.getState();
  state.run = {
    id: "run-audio-visualization",
    state: "completed",
    startedAt: Date.now() - 1000,
    endedAt: Date.now(),
    modules: {},
    moduleOrder: [],
    events: [],
    rawLog: [],
    artifacts: [
      {
        id: "artifact-waveform-final",
        kind: "waveform",
        previewUrl: "file:///tmp/final-waveform.png",
        path: "/tmp/final-waveform.png",
        fileName: null,
        createdAt: new Date(Date.now() - 4000).toISOString(),
        active: false,
      },
      {
        id: "artifact-spectrogram-file-url",
        kind: "spectrogram",
        previewUrl: "file:///tmp/file-url-spectrogram.png",
        path: "/tmp/file-url-spectrogram.png",
        fileName: null,
        createdAt: new Date(Date.now() - 500).toISOString(),
        active: true,
      },
      {
        id: "artifact-spectrogram-raw-path-only",
        kind: "spectrogram",
        previewUrl: null,
        path: "/tmp/raw-path-only-spectrogram.png",
        fileName: null,
        createdAt: new Date(Date.now() - 50).toISOString(),
        active: true,
      },
    ],
    findings: [],
    liveFindings: [],
    warnings: [],
    error: null,
    targetLabel: null,
    progress: null,
    emptyReason: null,
    analysisScope: null,
    previewArtifacts: [
      {
        id: "artifact-waveform-preview",
        kind: "waveform",
        previewUrl: "file:///tmp/preview-waveform.png",
        path: "/tmp/preview-waveform.png",
        fileName: null,
        createdAt: new Date(Date.now() - 100).toISOString(),
        active: true,
        status: "ready",
        variantId: null,
        reference: null,
        metadata: {},
      },
      {
        id: "artifact-spectrogram-preview",
        kind: "spectrogram",
        previewUrl: "file:///tmp/preview-spectrogram.png",
        path: "/tmp/preview-spectrogram.png",
        fileName: null,
        createdAt: new Date(Date.now() - 200).toISOString(),
        active: true,
        status: "ready",
        variantId: null,
        reference: null,
        metadata: {},
      },
    ],
    confidence: null,
    moduleTrace: [],
    comparisonVariants: [],
    hypothesisSummary: null,
  };

  state.ui.workspace.audioFocus.visualizationMode = "waveform";
  assert.equal(getAudioVisualizationArtifact(store.getState())?.id, "artifact-waveform-final");

  state.ui.workspace.audioFocus.visualizationMode = "spectrum";
  assert.equal(
    getAudioVisualizationArtifact(store.getState())?.id,
    "artifact-spectrogram-file-url"
  );

  state.ui.workspace.audioFocus.visualizationMode = "none";
  assert.equal(getAudioVisualizationArtifact(store.getState())?.id, "artifact-waveform-final");
});

void test("audio visualization selector keeps stable input order when artifact priority ties", () => {
  const store = createLabStore();
  const state = store.getState();
  const sharedCreatedAt = new Date().toISOString();
  state.run = {
    id: "run-audio-visualization-stable-order",
    state: "completed",
    startedAt: Date.now() - 1000,
    endedAt: Date.now(),
    modules: {},
    moduleOrder: [],
    events: [],
    rawLog: [],
    artifacts: [
      {
        id: "artifact-waveform-second-by-id",
        kind: "waveform",
        previewUrl: "file:///tmp/waveform-second.png",
        path: "/tmp/waveform-second.png",
        fileName: null,
        createdAt: sharedCreatedAt,
        active: false,
      },
      {
        id: "artifact-waveform-first-by-id",
        kind: "waveform",
        previewUrl: "file:///tmp/waveform-first.png",
        path: "/tmp/waveform-first.png",
        fileName: null,
        createdAt: sharedCreatedAt,
        active: false,
      },
    ],
    findings: [],
    liveFindings: [],
    warnings: [],
    error: null,
    targetLabel: null,
    progress: null,
    emptyReason: null,
    analysisScope: null,
    previewArtifacts: [],
    confidence: null,
    moduleTrace: [],
    comparisonVariants: [],
    hypothesisSummary: null,
  };

  state.ui.workspace.audioFocus.visualizationMode = "waveform";
  assert.equal(
    getAudioVisualizationArtifact(store.getState())?.id,
    "artifact-waveform-second-by-id"
  );
});

void test("workspace audio focus leaves transport controls on the unified waveform timeline", () => {
  const markup = renderWorkspaceAudioFocus(
    createTestAudioFocusSettings({
      gain: 1,
      filterType: "none",
      filterFrequency: 1000,
      filterQ: 1,
      visualizationMode: "spectrum",
      eqBands: [
        { frequency: 60, gain: 0, Q: 1, type: "lowshelf" },
        { frequency: 250, gain: 0, Q: 1, type: "peaking" },
        { frequency: 1000, gain: 0, Q: 1, type: "peaking" },
        { frequency: 4000, gain: 0, Q: 1, type: "peaking" },
        { frequency: 12000, gain: 0, Q: 1, type: "highshelf" },
      ],
    }),
    {
      previewTarget: "audio",
      temporalControlsEnabled: true,
    } as Parameters<typeof renderWorkspaceAudioFocus>[1]
  );

  assert.match(markup, /data-lab-action="workspace-reset-audio-focus"/);
  assert.match(markup, /data-lab-action="workspace-setting-adjust"/);
  assert.match(markup, /workspace\.audioFocus\.gain/);
  assert.match(markup, /workspace\.audioFocus\.eqBands\.0\.gain/);
  assert.doesNotMatch(markup, /labx-audio-focus__header|AUDIO FOCUS/);
  assert.doesNotMatch(markup, /workspace\.audioFocus\.playbackRate/);
  assert.doesNotMatch(markup, /workspace\.audioFocus\.preservePitch/);
  assert.doesNotMatch(markup, /ANALYSIS AID/);
  assert.doesNotMatch(markup, /workspace\.audioFocus\.visualizationMode/);
  assert.doesNotMatch(markup, /lab-audio-viz/);
});
