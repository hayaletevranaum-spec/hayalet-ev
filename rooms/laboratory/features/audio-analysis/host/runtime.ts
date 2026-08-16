import { createLaboratoryAudioProcessDelegatesRuntime } from "../../../shared/host/audio-process-delegates.js";
import { createAudioAnalysisProjectionRuntime } from "./module-projection.js";
import { createAudioAnalysisProcessRuntime } from "./process-runners.js";
import { createAudioAnalysisStateRuntime } from "./state.js";

type LaboratoryRecord = Record<string, unknown>;
type LaboratoryRuntimeRecord = LaboratoryRecord;
type LaboratoryProjectRecord = LaboratoryRecord;
type AudioAnalysisProcessRuntimeDeps = Parameters<typeof createAudioAnalysisProcessRuntime>[0];
type LaboratoryAudioProcessDelegatesRuntimeDeps = Parameters<
  typeof createLaboratoryAudioProcessDelegatesRuntime
>[0];

type LaboratoryAudioCatalogEntryRecord = LaboratoryRecord & {
  requiredToolIds?: unknown;
  toolIds?: unknown;
};

type AudioAnalysisHostRuntimeDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  asNumber: (value: unknown) => number | null;
  audioAnalysisSchemaVersion: number;
  audioFeatureId: string;
  buildDerivedTargetSignature: (output: LaboratoryRecord) => string | null;
  buildEmotionHeuristicFromProsody: (prosodySummary: LaboratoryRecord) => LaboratoryRecord;
  buildProcessSpeechAvailability: (
    runtime: LaboratoryRuntimeRecord,
    project: LaboratoryProjectRecord
  ) => LaboratoryRecord;
  buildProfileModelSummary: (
    runtime: LaboratoryRuntimeRecord,
    project: LaboratoryProjectRecord
  ) => LaboratoryRecord[];
  buildSourceTargetSignature: (project: LaboratoryProjectRecord) => string | null;
  clone: (value: unknown) => unknown;
  createProcessArtifact: (
    moduleId: string,
    artifactKind: string,
    filePath: string,
    label: string,
    metadata: LaboratoryRecord
  ) => LaboratoryRecord;
  createProcessFinding: (
    moduleId: string,
    findingKind: string,
    confidence: string,
    level: string,
    title: string,
    detail: string,
    evidenceCount: number,
    artifactIds: string[]
  ) => LaboratoryRecord;
  ensureRuntimeDirectory: (path: string, requestId: string | null) => Promise<unknown>;
  findEditOutputById: (project: LaboratoryProjectRecord, outputId: string | null) => unknown | null;
  getAudioAnalysisModulesForRuntime: (
    runtime: LaboratoryRuntimeRecord
  ) => LaboratoryAudioCatalogEntryRecord[];
  getFeatureProcessRecord: (project: LaboratoryProjectRecord, featureId: string) => unknown;
  getFeatureReportRecord: (project: LaboratoryProjectRecord, featureId: string) => unknown;
  getPreferredFeatureSourceKind: (featureId: string, sourcePresets: unknown) => string;
  listDirectory: (path: string) => Promise<unknown[]>;
  maybeRunTranscriptProfileSample: (
    runtime: LaboratoryRuntimeRecord,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryRecord,
    artifactBase: string,
    transcriptSampleSeconds: number
  ) => Promise<unknown>;
  normalizeEditOutput: (value: unknown) => LaboratoryRecord;
  normalizeProcessArtifact: (value: unknown) => LaboratoryRecord;
  normalizeProcessFinding: (value: unknown) => LaboratoryRecord;
  normalizeProcessModule: (value: unknown) => LaboratoryRecord;
  normalizeReportExport: (value: unknown) => LaboratoryRecord;
  normalizeSourceMetadata: (value: unknown) => LaboratoryRecord | null;
  normalizeStringArray: (value: unknown) => string[];
  parseAspectralStatsText: (...args: unknown[]) => unknown;
  readJsonFile: (path: string) => Promise<unknown>;
  readTextFile: (path: string) => Promise<string>;
  resolveOpenSmileProsodyRuntime: (runtime: LaboratoryRuntimeRecord) => unknown | null;
  runAudioStructureProbe: (
    runtime: LaboratoryRuntimeRecord,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryRecord
  ) => Promise<unknown>;
  runOpenSmileProsodyExtraction: (
    runtime: LaboratoryRuntimeRecord,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryRecord,
    artifactBase: string,
    outputDir: string,
    profileId: string
  ) => Promise<unknown>;
  runProfileTool: (...args: unknown[]) => Promise<unknown>;
  sanitizeFileSegment: (value: string, fallback: string) => string;
  toRecord: (value: unknown) => LaboratoryRecord;
  writeJsonFile: (path: string, content: LaboratoryRecord) => Promise<unknown>;
  writeTextFile: (path: string, content: string) => Promise<unknown>;
};

type AudioAnalysisHostRuntime = {
  audioAnalysisProcessRuntime: ReturnType<typeof createAudioAnalysisProcessRuntime>;
  audioAnalysisProjectionRuntime: ReturnType<typeof createAudioAnalysisProjectionRuntime>;
  audioAnalysisStateRuntime: ReturnType<typeof createAudioAnalysisStateRuntime>;
  laboratoryAudioProcessDelegatesRuntime: ReturnType<
    typeof createLaboratoryAudioProcessDelegatesRuntime
  >;
};

export function createLaboratoryAudioAnalysisHostRuntime(
  deps: AudioAnalysisHostRuntimeDeps
): AudioAnalysisHostRuntime {
  const {
    asNonEmptyString,
    asNumber,
    audioAnalysisSchemaVersion,
    audioFeatureId,
    buildDerivedTargetSignature,
    buildProcessSpeechAvailability,
    buildProfileModelSummary,
    buildSourceTargetSignature,
    findEditOutputById,
    getAudioAnalysisModulesForRuntime,
    getFeatureProcessRecord,
    getFeatureReportRecord,
    getPreferredFeatureSourceKind,
    normalizeEditOutput,
    normalizeProcessArtifact,
    normalizeProcessFinding,
    normalizeProcessModule,
    normalizeReportExport,
    normalizeSourceMetadata,
    normalizeStringArray,
    parseAspectralStatsText,
    toRecord,
  } = deps;

  function toCatalogEntryRecord(value: unknown): LaboratoryAudioCatalogEntryRecord {
    return toRecord(value);
  }

  function getAudioAnalysisRequiredToolIds(
    catalogEntry: LaboratoryAudioCatalogEntryRecord
  ): string[] {
    const source = toCatalogEntryRecord(catalogEntry);
    const requiredToolIds = normalizeStringArray(source.requiredToolIds);
    return requiredToolIds.length > 0 ? requiredToolIds : normalizeStringArray(source.toolIds);
  }

  const audioAnalysisStateRuntime = createAudioAnalysisStateRuntime({
    asNonEmptyString,
    asNumber,
    audioAnalysisSchemaVersion,
    getAudioAnalysisModulesForRuntime,
    getAudioAnalysisRequiredToolIds,
    normalizeProcessArtifact,
    normalizeProcessFinding,
    normalizeReportExport,
    normalizeStringArray,
    toRecord,
  });
  const {
    normalizeAudioAnalysisCapabilityEntry,
    normalizeAudioAnalysisMetric,
    normalizeAudioAnalysisModuleResult,
    normalizeAudioAnalysisProviderStateEntry,
    normalizeAudioAnalysisRunRecord,
    normalizeAudioAnalysisState,
  } = audioAnalysisStateRuntime;

  const audioAnalysisProjectionRuntime = createAudioAnalysisProjectionRuntime({
    asNumber,
    asNonEmptyString,
    audioAnalysisSchemaVersion,
    audioFeatureId,
    buildDerivedTargetSignature,
    buildProcessSpeechAvailability,
    buildProfileModelSummary,
    buildSourceTargetSignature,
    findEditOutputById,
    getFeatureProcessRecord,
    getFeatureReportRecord,
    getAudioAnalysisModulesForRuntime,
    getPreferredFeatureSourceKind,
    normalizeAudioAnalysisCapabilityEntry,
    normalizeAudioAnalysisMetric,
    normalizeAudioAnalysisModuleResult,
    normalizeAudioAnalysisProviderStateEntry,
    normalizeAudioAnalysisRunRecord,
    normalizeAudioAnalysisState,
    normalizeEditOutput,
    normalizeProcessArtifact,
    normalizeProcessFinding,
    normalizeProcessModule,
    normalizeReportExport,
    normalizeSourceMetadata,
    normalizeStringArray,
    toRecord,
  });

  const audioAnalysisProcessRuntime = createAudioAnalysisProcessRuntime({
    ...deps,
    parseAspectralStatsText:
      parseAspectralStatsText as AudioAnalysisProcessRuntimeDeps["parseAspectralStatsText"],
  } as unknown as AudioAnalysisProcessRuntimeDeps);

  const laboratoryAudioProcessDelegatesRuntime = createLaboratoryAudioProcessDelegatesRuntime({
    audioAnalysisProcessRuntime:
      audioAnalysisProcessRuntime as LaboratoryAudioProcessDelegatesRuntimeDeps["audioAnalysisProcessRuntime"],
  });

  return {
    audioAnalysisProcessRuntime,
    audioAnalysisProjectionRuntime,
    audioAnalysisStateRuntime,
    laboratoryAudioProcessDelegatesRuntime,
  };
}
