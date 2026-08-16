import { createAudioAnalysisMusicRhythmModelRunner } from "./process-model-music-rhythm.js";
import { createAudioAnalysisSoundEventsModelRunner } from "./process-model-sound-events.js";
import { createAudioAnalysisSourceSeparationModelRunner } from "./process-model-source-separation.js";
import { createAudioAnalysisSpeakerDiarizationModelRunner } from "./process-model-speaker-diarization.js";

type AudioAnalysisModelProcessRunnerDeps = Parameters<
  typeof createAudioAnalysisMusicRhythmModelRunner
>[0] &
  Parameters<typeof createAudioAnalysisSoundEventsModelRunner>[0] &
  Parameters<typeof createAudioAnalysisSourceSeparationModelRunner>[0] &
  Parameters<typeof createAudioAnalysisSpeakerDiarizationModelRunner>[0];

type AudioAnalysisModelProcessRunners = {
  runMusicRhythmAudioAnalyzer: ReturnType<typeof createAudioAnalysisMusicRhythmModelRunner>;
  runSoundEventsAudioAnalyzer: ReturnType<typeof createAudioAnalysisSoundEventsModelRunner>;
  runSourceSeparationAudioAnalyzer: ReturnType<
    typeof createAudioAnalysisSourceSeparationModelRunner
  >;
  runSpeakerDiarizationAudioAnalyzer: ReturnType<
    typeof createAudioAnalysisSpeakerDiarizationModelRunner
  >;
};

export function createAudioAnalysisModelProcessRunners(
  deps: AudioAnalysisModelProcessRunnerDeps
): AudioAnalysisModelProcessRunners {
  const runMusicRhythmAudioAnalyzer = createAudioAnalysisMusicRhythmModelRunner(deps);
  const runSoundEventsAudioAnalyzer = createAudioAnalysisSoundEventsModelRunner(deps);
  const runSourceSeparationAudioAnalyzer = createAudioAnalysisSourceSeparationModelRunner(deps);
  const runSpeakerDiarizationAudioAnalyzer = createAudioAnalysisSpeakerDiarizationModelRunner(deps);

  return {
    runMusicRhythmAudioAnalyzer: runMusicRhythmAudioAnalyzer,
    runSoundEventsAudioAnalyzer: runSoundEventsAudioAnalyzer,
    runSourceSeparationAudioAnalyzer: runSourceSeparationAudioAnalyzer,
    runSpeakerDiarizationAudioAnalyzer: runSpeakerDiarizationAudioAnalyzer,
  };
}
