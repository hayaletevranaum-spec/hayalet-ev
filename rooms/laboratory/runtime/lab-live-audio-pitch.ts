import type { LabAudioFocusSettings } from "../domain/lab-types.js";
import { getLivePitchShiftRatio } from "../domain/lab-live-audio-settings.js";
export {
  attachLivePitchShiftSemitones,
  getLivePitchShiftSemitones,
} from "../domain/lab-live-audio-settings.js";

const LAB_LIVE_PITCH_PROCESSOR_NAME = "lab-live-pitch-shifter";

const LIVE_PITCH_WORKLET_LOADS = new WeakMap<AudioContext, Promise<boolean>>();

const LIVE_PITCH_WORKLET_SOURCE = `
class LabLivePitchShiftProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "pitchRatio",
        defaultValue: 1,
        minValue: 0.5,
        maxValue: 2,
        automationRate: "k-rate",
      },
    ];
  }

  constructor() {
    super();
    this.bufferLength = 32768;
    this.grainSize = 2048;
    this.minimumDelay = 256;
    this.phase = 0;
    this.writeIndex = 0;
    this.buffers = [];
  }

  ensureChannels(channelCount) {
    while (this.buffers.length < channelCount) {
      this.buffers.push(new Float32Array(this.bufferLength));
    }
  }

  readInterpolated(buffer, delaySamples) {
    let position = this.writeIndex - delaySamples;
    while (position < 0) {
      position += this.bufferLength;
    }
    position %= this.bufferLength;
    const indexA = Math.floor(position);
    const indexB = (indexA + 1) % this.bufferLength;
    const fraction = position - indexA;
    return buffer[indexA] * (1 - fraction) + buffer[indexB] * fraction;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0] || [];
    const output = outputs[0] || [];
    if (output.length === 0) {
      return true;
    }

    this.ensureChannels(output.length);
    const frameLength = output[0] ? output[0].length : 0;
    const ratioValues = parameters.pitchRatio || [];
    const ratio = Math.max(0.5, Math.min(2, ratioValues.length > 0 ? ratioValues[0] : 1));
    const phaseStep = (1 - ratio) / this.grainSize;

    for (let sampleIndex = 0; sampleIndex < frameLength; sampleIndex += 1) {
      for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
        const sourceChannel = input[channelIndex] || input[0];
        const sample = sourceChannel ? sourceChannel[sampleIndex] || 0 : 0;
        this.buffers[channelIndex][this.writeIndex] = sample;
      }

      const phaseA = this.phase;
      const phaseB = (phaseA + 0.5) % 1;
      const delayA = this.minimumDelay + phaseA * this.grainSize;
      const delayB = this.minimumDelay + phaseB * this.grainSize;
      const weightA = 0.5 - 0.5 * Math.cos(2 * Math.PI * phaseA);
      const weightB = 0.5 - 0.5 * Math.cos(2 * Math.PI * phaseB);
      const weightSum = Math.max(0.000001, weightA + weightB);

      for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
        const buffer = this.buffers[channelIndex];
        const shiftedA = this.readInterpolated(buffer, delayA);
        const shiftedB = this.readInterpolated(buffer, delayB);
        output[channelIndex][sampleIndex] =
          (shiftedA * weightA + shiftedB * weightB) / weightSum;
      }

      this.writeIndex = (this.writeIndex + 1) % this.bufferLength;
      this.phase += phaseStep;
      this.phase -= Math.floor(this.phase);
    }

    return true;
  }
}

registerProcessor("${LAB_LIVE_PITCH_PROCESSOR_NAME}", LabLivePitchShiftProcessor);
`;

type PitchWorkletWindow = Window & typeof globalThis;

function getPitchWorkletGlobals(windowRef: Window) {
  const globals = windowRef as PitchWorkletWindow;
  return {
    AudioWorkletNodeCtor:
      typeof globals.AudioWorkletNode === "function" ? globals.AudioWorkletNode : null,
    BlobCtor: typeof globals.Blob === "function" ? globals.Blob : null,
    URLCtor: globals.URL,
  };
}

async function loadPitchWorklet(audioContext: AudioContext, windowRef: Window) {
  const existingLoad = LIVE_PITCH_WORKLET_LOADS.get(audioContext);
  if (existingLoad) {
    return existingLoad;
  }

  const loadPromise = (async function () {
    const globals = getPitchWorkletGlobals(windowRef);
    if (
      audioContext.audioWorklet === undefined ||
      globals.AudioWorkletNodeCtor === null ||
      globals.BlobCtor === null ||
      typeof globals.URLCtor?.createObjectURL !== "function"
    ) {
      return false;
    }

    const blob = new globals.BlobCtor([LIVE_PITCH_WORKLET_SOURCE], {
      type: "text/javascript",
    });
    const moduleUrl = globals.URLCtor.createObjectURL(blob);
    try {
      await audioContext.audioWorklet.addModule(moduleUrl);
      return true;
    } catch {
      return false;
    } finally {
      globals.URLCtor.revokeObjectURL(moduleUrl);
    }
  })();

  LIVE_PITCH_WORKLET_LOADS.set(audioContext, loadPromise);
  return loadPromise;
}

export async function createLivePitchShiftNode(
  audioContext: AudioContext,
  windowRef: Window
): Promise<AudioWorkletNode | null> {
  if ((await loadPitchWorklet(audioContext, windowRef)) !== true) {
    return null;
  }
  const { AudioWorkletNodeCtor } = getPitchWorkletGlobals(windowRef);
  if (AudioWorkletNodeCtor === null) {
    return null;
  }
  try {
    return new AudioWorkletNodeCtor(audioContext, LAB_LIVE_PITCH_PROCESSOR_NAME, {
      channelCount: 2,
      channelCountMode: "max",
      channelInterpretation: "speakers",
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
  } catch {
    return null;
  }
}

export function applyLivePitchShift(
  node: AudioWorkletNode | null,
  audioFocus: LabAudioFocusSettings,
  currentTime: number
) {
  if (node === null) {
    return false;
  }
  const pitchRatio = node.parameters.get("pitchRatio");
  if (!pitchRatio) {
    return false;
  }
  pitchRatio.setTargetAtTime(getLivePitchShiftRatio(audioFocus), currentTime, 0.01);
  return true;
}
