import { createAudioAnalysisParserRuntime } from "./analysis-parsers.js";
import { createAudioAnalysisProbeRuntime } from "./analysis-probes.js";

type AudioAnalysisUtilityRuntimeDeps = Omit<
  Parameters<typeof createAudioAnalysisProbeRuntime>[0],
  | "buildProsodySummaryFromCsv"
  | "parseBlackDetectLog"
  | "parseFreezeDetectLog"
  | "parseSilenceDetectLog"
  | "parseVolumeDetectLog"
>;

type AudioAnalysisParserRuntime = ReturnType<typeof createAudioAnalysisParserRuntime>;
type AudioAnalysisProbeRuntime = ReturnType<typeof createAudioAnalysisProbeRuntime>;

type AudioAnalysisUtilityRuntime = {
  buildEmotionHeuristicFromProsody: AudioAnalysisParserRuntime["buildEmotionHeuristicFromProsody"];
  buildProsodySummaryFromCsv: AudioAnalysisParserRuntime["buildProsodySummaryFromCsv"];
  parseAspectralStatsText: AudioAnalysisParserRuntime["parseAspectralStatsText"];
  resolveOpenSmileProsodyRuntime: AudioAnalysisProbeRuntime["resolveOpenSmileProsodyRuntime"];
  runAudioStructureProbe: AudioAnalysisProbeRuntime["runAudioStructureProbe"];
  runOpenSmileProsodyExtraction: AudioAnalysisProbeRuntime["runOpenSmileProsodyExtraction"];
  runVideoStructureProbe: AudioAnalysisProbeRuntime["runVideoStructureProbe"];
};

export function createAudioAnalysisUtilityRuntime(
  deps: AudioAnalysisUtilityRuntimeDeps
): AudioAnalysisUtilityRuntime {
  const audioAnalysisParserRuntime = createAudioAnalysisParserRuntime();
  const audioAnalysisProbeRuntime = createAudioAnalysisProbeRuntime({
    ...deps,
    buildProsodySummaryFromCsv: audioAnalysisParserRuntime.buildProsodySummaryFromCsv,
    parseBlackDetectLog: audioAnalysisParserRuntime.parseBlackDetectLog,
    parseFreezeDetectLog: audioAnalysisParserRuntime.parseFreezeDetectLog,
    parseSilenceDetectLog: audioAnalysisParserRuntime.parseSilenceDetectLog,
    parseVolumeDetectLog: audioAnalysisParserRuntime.parseVolumeDetectLog,
  });

  return {
    buildEmotionHeuristicFromProsody: audioAnalysisParserRuntime.buildEmotionHeuristicFromProsody,
    buildProsodySummaryFromCsv: audioAnalysisParserRuntime.buildProsodySummaryFromCsv,
    parseAspectralStatsText: audioAnalysisParserRuntime.parseAspectralStatsText,
    resolveOpenSmileProsodyRuntime: audioAnalysisProbeRuntime.resolveOpenSmileProsodyRuntime,
    runAudioStructureProbe: audioAnalysisProbeRuntime.runAudioStructureProbe,
    runOpenSmileProsodyExtraction: audioAnalysisProbeRuntime.runOpenSmileProsodyExtraction,
    runVideoStructureProbe: audioAnalysisProbeRuntime.runVideoStructureProbe,
  };
}
