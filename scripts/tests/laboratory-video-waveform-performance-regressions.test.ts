import type { LabWaveformTimelineModel } from "../../rooms/laboratory/ui/lab-waveform-timeline-types.ts";
import {
  assert,
  createLabWaveformTimelineVisualizer,
  FakeCanvasElement,
  FakeMediaElement,
  FakeVisualizerAudioContext,
  FakeVisualizerDocument,
  FakeVisualizerWindow,
  flushVisualizerWork,
  test,
} from "./laboratory-runtime-truth.helpers.ts";

function createVideoTimelineModel(): LabWaveformTimelineModel {
  return {
    bookmarks: [],
    durationMs: 5000,
    endMs: null,
    sourceKind: "video",
    startMs: null,
    visualizationArtifact: null,
    visualizationMode: "waveform",
    waveformCropEndRatio: 1,
    waveformCropStartRatio: 0,
    waveformSourceLabel: "video.mp4",
    waveformSyncLabel: "Video waveform uses generated artifacts or the live analyser.",
    waveformWindowDurationMs: 5000,
    waveformWindowStartMs: 0,
  };
}

void test("video waveform visualization never fetches the raw video container for fallback decoding", async () => {
  FakeVisualizerAudioContext.constructed = [];
  const videoPreview = new FakeMediaElement();
  videoPreview.currentSrc = "file:///tmp/large-video.mp4";
  videoPreview.src = videoPreview.currentSrc;
  const canvas = new FakeCanvasElement();
  const documentRef = new FakeVisualizerDocument(videoPreview, null, canvas);
  const windowRef = new FakeVisualizerWindow();
  const visualizer = createLabWaveformTimelineVisualizer({
    documentRef: documentRef as unknown as Document,
    getTimelineModel: createVideoTimelineModel,
    windowRef: windowRef as unknown as Window,
  });

  visualizer.sync();
  await flushVisualizerWork();

  assert.deepEqual(windowRef.fetchCalls, []);
  assert.equal(FakeVisualizerAudioContext.constructed.length, 1);
  assert.equal(FakeVisualizerAudioContext.constructed[0]?.closeCalls, 1);

  await videoPreview.play();
  await flushVisualizerWork();

  assert.deepEqual(windowRef.fetchCalls, []);
  assert.equal(FakeVisualizerAudioContext.constructed.length, 2);
  assert.equal(windowRef.scheduledFrames.size, 1);

  visualizer.dispose();
});

void test("workspace waveform visualizer coalesces repeated external sync calls in one task", () => {
  FakeVisualizerAudioContext.constructed = [];
  const videoPreview = new FakeMediaElement();
  videoPreview.currentSrc = "file:///tmp/bootstrap-video.mp4";
  videoPreview.src = videoPreview.currentSrc;
  const canvas = new FakeCanvasElement();
  const documentRef = new FakeVisualizerDocument(videoPreview, null, canvas);
  const windowRef = new FakeVisualizerWindow();
  const visualizer = createLabWaveformTimelineVisualizer({
    documentRef: documentRef as unknown as Document,
    getTimelineModel: createVideoTimelineModel,
    windowRef: windowRef as unknown as Window,
  });

  visualizer.sync();
  const clearRectCallsAfterFirstSync = canvas.context.clearRectCalls;
  const audioContextCountAfterFirstSync = FakeVisualizerAudioContext.constructed.length;

  for (let index = 0; index < 40; index += 1) {
    visualizer.sync();
  }

  assert.equal(canvas.context.clearRectCalls, clearRectCallsAfterFirstSync);
  assert.equal(FakeVisualizerAudioContext.constructed.length, audioContextCountAfterFirstSync);

  visualizer.dispose();
});