export interface CapturedMicrophoneWav {
  audioBase64: string;
  durationMs: number;
  sourceSampleRate: number;
  targetSampleRate: number;
  frameCount: number;
}

export interface MicrophoneCaptureSession {
  stop: () => Promise<CapturedMicrophoneWav>;
  abort: () => Promise<void>;
}

const TARGET_SAMPLE_RATE = 16_000;
type WebkitAudioContextWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function toMono(input: AudioBuffer): Float32Array {
  const channelCount = Math.max(1, input.numberOfChannels);
  const mixed = new Float32Array(input.length);

  for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
    const channel = input.getChannelData(channelIndex);
    for (let frameIndex = 0; frameIndex < channel.length; frameIndex += 1) {
      const sample = channel[frameIndex] ?? 0;
      const existing = mixed[frameIndex] ?? 0;
      mixed[frameIndex] = existing + sample / channelCount;
    }
  }

  return mixed;
}

function concatChunks(chunks: Float32Array[], totalFrames: number): Float32Array {
  const merged = new Float32Array(totalFrames);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

function resampleLinear(
  samples: Float32Array,
  sourceRate: number,
  targetRate: number
): Float32Array {
  if (samples.length === 0 || sourceRate === targetRate) {
    return samples;
  }

  const ratio = sourceRate / targetRate;
  const targetLength = Math.max(1, Math.round(samples.length / ratio));
  const output = new Float32Array(targetLength);

  for (let index = 0; index < targetLength; index += 1) {
    const sourceIndex = index * ratio;
    const leftIndex = Math.floor(sourceIndex);
    const rightIndex = Math.min(samples.length - 1, leftIndex + 1);
    const mix = sourceIndex - leftIndex;
    const left = samples[leftIndex] ?? 0;
    const right = samples[rightIndex] ?? left;
    output[index] = left + (right - left) * mix;
  }

  return output;
}

function encodeWavPcm16(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (const sample of samples) {
    const clipped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Uint8Array(buffer);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function shutdownCaptureResources(
  stream: MediaStream,
  sourceNode: MediaStreamAudioSourceNode,
  processorNode: ScriptProcessorNode,
  muteNode: GainNode,
  audioContext: AudioContext
): Promise<void> {
  processorNode.onaudioprocess = null;

  try {
    sourceNode.disconnect();
  } catch {
    // NOTE: Stop paths can race when the user double-clicks the dictation button.
  }

  try {
    processorNode.disconnect();
  } catch {
    // NOTE: Stop paths can race when the user double-clicks the dictation button.
  }

  try {
    muteNode.disconnect();
  } catch {
    // NOTE: Stop paths can race when the user double-clicks the dictation button.
  }

  stream.getTracks().forEach((track) => {
    track.stop();
  });

  try {
    await audioContext.close();
  } catch {
    // NOTE: Close failures should not mask the primary dictation error path.
  }
}

export async function startMicrophoneCapture(): Promise<MicrophoneCaptureSession> {
  if (
    typeof navigator.mediaDevices === "undefined" ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    throw new Error("Microphone capture is not available in this renderer.");
  }

  const captureWindow = window as WebkitAudioContextWindow;
  const audioContextCtor =
    typeof captureWindow.AudioContext === "function"
      ? captureWindow.AudioContext
      : typeof captureWindow.webkitAudioContext === "function"
        ? captureWindow.webkitAudioContext
        : null;
  if (audioContextCtor === null) {
    throw new Error("AudioContext is not available in this renderer.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
    },
  });

  const audioContext = new audioContextCtor();
  const sourceNode = audioContext.createMediaStreamSource(stream);
  // AI: We keep capture in raw PCM here so the first dictation pass avoids codec/ffmpeg variance.
  const processorNode = audioContext.createScriptProcessor(4096, 1, 1);
  const muteNode = audioContext.createGain();
  muteNode.gain.value = 0;

  const chunks: Float32Array[] = [];
  let totalFrames = 0;
  let settled = false;
  const startedAt = performance.now();

  processorNode.onaudioprocess = (event): void => {
    const monoChunk = toMono(event.inputBuffer);
    if (monoChunk.length === 0) {
      return;
    }
    chunks.push(monoChunk);
    totalFrames += monoChunk.length;
  };

  sourceNode.connect(processorNode);
  processorNode.connect(muteNode);
  muteNode.connect(audioContext.destination);
  await audioContext.resume();

  const finalize = async (capture: boolean): Promise<CapturedMicrophoneWav | null> => {
    if (settled) {
      return null;
    }

    settled = true;
    await shutdownCaptureResources(stream, sourceNode, processorNode, muteNode, audioContext);

    if (!capture) {
      return null;
    }

    if (totalFrames === 0) {
      throw new Error("No microphone audio was captured.");
    }

    const merged = concatChunks(chunks, totalFrames);
    const resampled = resampleLinear(merged, audioContext.sampleRate, TARGET_SAMPLE_RATE);
    const wavBytes = encodeWavPcm16(resampled, TARGET_SAMPLE_RATE);

    return {
      audioBase64: bytesToBase64(wavBytes),
      durationMs: Math.max(1, Math.round(performance.now() - startedAt)),
      sourceSampleRate: Math.round(audioContext.sampleRate),
      targetSampleRate: TARGET_SAMPLE_RATE,
      frameCount: resampled.length,
    };
  };

  return {
    stop: async (): Promise<CapturedMicrophoneWav> => {
      const result = await finalize(true);
      if (result == null) {
        throw new Error("Microphone capture session is already closed.");
      }
      return result;
    },
    abort: async (): Promise<void> => {
      await finalize(false);
    },
  };
}
