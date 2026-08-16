import { createAudioAnalysisProjectionCatalogRuntime } from "./projection-catalog.js";
import { createAudioAnalysisProjectionResultsRuntime } from "./projection-results.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryAudioAnalysisRuntime = LaboratoryRecord & {
  sourcePresets?: unknown;
};

type LaboratoryProjectRecord = LaboratoryRecord & {
  audioAnalysis?: unknown;
  updatedAt?: unknown;
};

type LaboratoryAudioTargetRecord = LaboratoryRecord & {
  fileName?: unknown;
  label?: unknown;
  metadata?: unknown;
  mimeType?: unknown;
  mode?: unknown;
  outputId?: unknown;
  path?: unknown;
  requestedMode?: unknown;
  signature?: unknown;
};

type LaboratoryAudioCatalogModuleRecord = LaboratoryRecord & {
  id?: unknown;
  phase?: unknown;
  providerIds?: unknown;
  status?: unknown;
  summaryKey?: unknown;
  titleKey?: unknown;
  toolIds?: unknown;
};

type LaboratoryAudioCapabilityEntryRecord = LaboratoryRecord & {
  blockers?: unknown;
  providerIds?: unknown;
  requiredToolIds?: unknown;
  status?: unknown;
  toolIds?: unknown;
  warnings?: unknown;
};

type LaboratoryAudioProviderStateEntryRecord = LaboratoryRecord & {
  blockers?: unknown;
  ready?: unknown;
  warnings?: unknown;
};

type LaboratoryProcessRecord = LaboratoryRecord & {
  artifacts?: unknown;
  completedAt?: unknown;
  error?: unknown;
  findings?: unknown;
  jobId?: unknown;
  modules?: unknown;
  requestId?: unknown;
  runId?: unknown;
  startedAt?: unknown;
  status?: unknown;
  targetSummary?: unknown;
};

type LaboratoryProcessModuleRecord = LaboratoryRecord & {
  completedAt?: unknown;
  id?: unknown;
  startedAt?: unknown;
  warnings?: unknown;
};

type LaboratoryProcessFindingRecord = LaboratoryRecord & {
  confidence?: unknown;
  id?: unknown;
  moduleId?: unknown;
};

type LaboratoryProcessArtifactRecord = LaboratoryRecord & {
  id?: unknown;
  moduleId?: unknown;
};

type LaboratoryReportRecord = LaboratoryRecord & {
  exports?: unknown;
  generatedAt?: unknown;
};

type LaboratoryAudioAnalysisModuleResultRecord = LaboratoryRecord & {
  artifacts?: unknown;
  signals?: unknown;
  status?: unknown;
  warnings?: unknown;
};

type LaboratoryAudioAnalysisRunRecord = LaboratoryRecord;

type LaboratoryAudioProjectionCatalogRuntime = {
  buildAudioAnalysisCapabilityState: (
    runtime: LaboratoryAudioAnalysisRuntime,
    project: LaboratoryProjectRecord,
    target: LaboratoryAudioTargetRecord,
    providerState: Record<string, LaboratoryAudioProviderStateEntryRecord>
  ) => Record<string, LaboratoryAudioCapabilityEntryRecord>;
  buildAudioAnalysisCatalogProjection: (
    runtime: LaboratoryAudioAnalysisRuntime
  ) => LaboratoryRecord;
  buildAudioAnalysisProviderState: (
    runtime: LaboratoryAudioAnalysisRuntime,
    project: LaboratoryProjectRecord
  ) => Record<string, LaboratoryAudioProviderStateEntryRecord>;
  resolveAudioFeatureTarget: (project: LaboratoryProjectRecord) => LaboratoryAudioTargetRecord;
};

type LaboratoryAudioProjectionResultsRuntime = {
  buildAudioAnalysisModuleMetrics: (
    signals: LaboratoryProcessFindingRecord[],
    artifacts: LaboratoryProcessArtifactRecord[]
  ) => LaboratoryRecord[];
  buildAudioAnalysisModuleSummary: (
    resultStatus: string,
    processModule: LaboratoryProcessModuleRecord,
    capabilityEntry: LaboratoryAudioCapabilityEntryRecord
  ) => string;
  getAudioAnalysisConfidenceRank: (confidence: unknown) => number;
  mapAudioAnalysisResultStatus: (
    processRecord: LaboratoryProcessRecord,
    moduleEntry: LaboratoryProcessModuleRecord,
    capabilityEntry: LaboratoryAudioCapabilityEntryRecord
  ) => string;
};

type AudioAnalysisProjectionDeps = {
  asNumber: (value: unknown) => number | null;
  asNonEmptyString: (value: unknown) => string | null;
  audioAnalysisSchemaVersion: number;
  audioFeatureId: string;
  buildDerivedTargetSignature: (output: LaboratoryRecord) => string | null;
  buildProcessSpeechAvailability: (
    runtime: LaboratoryAudioAnalysisRuntime,
    project: LaboratoryProjectRecord
  ) => LaboratoryRecord;
  buildProfileModelSummary: (
    runtime: LaboratoryAudioAnalysisRuntime,
    project: LaboratoryProjectRecord
  ) => LaboratoryRecord[];
  buildSourceTargetSignature: (project: LaboratoryProjectRecord) => string | null;
  findEditOutputById: (project: LaboratoryProjectRecord, outputId: string | null) => unknown | null;
  getAudioAnalysisModulesForRuntime: (
    runtime: LaboratoryAudioAnalysisRuntime
  ) => LaboratoryAudioCatalogModuleRecord[];
  getFeatureProcessRecord: (project: LaboratoryProjectRecord, featureId: string) => unknown;
  getFeatureReportRecord: (project: LaboratoryProjectRecord, featureId: string) => unknown;
  getPreferredFeatureSourceKind: (featureId: string, sourcePresets: unknown) => string;
  normalizeAudioAnalysisCapabilityEntry: (
    rawValue: unknown,
    moduleId: string,
    catalogEntry: LaboratoryAudioCatalogModuleRecord
  ) => LaboratoryAudioCapabilityEntryRecord;
  normalizeAudioAnalysisMetric: (rawValue: unknown) => LaboratoryRecord;
  normalizeAudioAnalysisModuleResult: (
    rawValue: unknown,
    moduleId: string,
    catalogEntry: LaboratoryAudioCatalogModuleRecord
  ) => LaboratoryAudioAnalysisModuleResultRecord;
  normalizeAudioAnalysisProviderStateEntry: (
    rawValue: unknown,
    providerId: string,
    descriptor: unknown
  ) => LaboratoryAudioProviderStateEntryRecord;
  normalizeAudioAnalysisRunRecord: (
    rawValue: unknown,
    moduleId: string
  ) => LaboratoryAudioAnalysisRunRecord;
  normalizeAudioAnalysisState: (
    rawValue: unknown,
    runtime: LaboratoryAudioAnalysisRuntime
  ) => LaboratoryRecord;
  normalizeEditOutput: (value: unknown) => LaboratoryRecord;
  normalizeProcessArtifact: (value: unknown) => LaboratoryProcessArtifactRecord;
  normalizeProcessFinding: (value: unknown) => LaboratoryProcessFindingRecord;
  normalizeProcessModule: (value: unknown) => LaboratoryProcessModuleRecord;
  normalizeReportExport: (value: unknown) => LaboratoryRecord;
  normalizeSourceMetadata: (value: unknown) => LaboratoryRecord | null;
  normalizeStringArray: (value: unknown) => string[];
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createAudioAnalysisProjectionRuntime(deps: AudioAnalysisProjectionDeps) {
  const {
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
  } = deps;

  function toCatalogModuleRecord(value: unknown): LaboratoryAudioCatalogModuleRecord {
    return toRecord(value);
  }

  function toCapabilityEntryRecord(value: unknown): LaboratoryAudioCapabilityEntryRecord {
    return toRecord(value);
  }

  function toProcessRecord(value: unknown): LaboratoryProcessRecord {
    return toRecord(value);
  }

  function toProcessModuleRecord(value: unknown): LaboratoryProcessModuleRecord {
    return toRecord(value);
  }

  function toProcessFindingRecord(value: unknown): LaboratoryProcessFindingRecord {
    return toRecord(value);
  }

  function toProcessArtifactRecord(value: unknown): LaboratoryProcessArtifactRecord {
    return toRecord(value);
  }

  function toReportRecord(value: unknown): LaboratoryReportRecord {
    return toRecord(value);
  }

  function toAudioTargetRecord(value: unknown): LaboratoryAudioTargetRecord {
    return toRecord(value);
  }

  function getCatalogModules(
    runtime: LaboratoryAudioAnalysisRuntime
  ): LaboratoryAudioCatalogModuleRecord[] {
    return getAudioAnalysisModulesForRuntime(runtime).map(toCatalogModuleRecord);
  }

  const audioAnalysisProjectionCatalogRuntime = createAudioAnalysisProjectionCatalogRuntime({
    asNonEmptyString,
    buildDerivedTargetSignature,
    buildProcessSpeechAvailability,
    buildProfileModelSummary,
    buildSourceTargetSignature,
    findEditOutputById,
    getAudioAnalysisModulesForRuntime,
    normalizeAudioAnalysisCapabilityEntry,
    normalizeAudioAnalysisProviderStateEntry,
    normalizeEditOutput,
    normalizeSourceMetadata,
    normalizeStringArray,
    toRecord,
  }) as LaboratoryAudioProjectionCatalogRuntime;
  const {
    buildAudioAnalysisCapabilityState,
    buildAudioAnalysisCatalogProjection,
    buildAudioAnalysisProviderState,
    resolveAudioFeatureTarget,
  } = audioAnalysisProjectionCatalogRuntime;
  const audioAnalysisProjectionResultsRuntime = createAudioAnalysisProjectionResultsRuntime({
    asNonEmptyString,
    normalizeAudioAnalysisMetric,
    normalizeStringArray,
    toRecord,
  }) as LaboratoryAudioProjectionResultsRuntime;
  const {
    buildAudioAnalysisModuleMetrics,
    buildAudioAnalysisModuleSummary,
    getAudioAnalysisConfidenceRank,
    mapAudioAnalysisResultStatus,
  } = audioAnalysisProjectionResultsRuntime;

  function buildAudioAnalysisModules(
    runtime: LaboratoryAudioAnalysisRuntime,
    project: LaboratoryProjectRecord,
    target: LaboratoryAudioTargetRecord
  ) {
    const catalogModules = getCatalogModules(runtime);
    const providerState = buildAudioAnalysisProviderState(runtime, project);
    const capabilityState = buildAudioAnalysisCapabilityState(
      runtime,
      project,
      target,
      providerState
    );

    return catalogModules.map(function (entry) {
      const moduleId = asNonEmptyString(entry.id) || "audio-module";
      const capabilityEntry = normalizeAudioAnalysisCapabilityEntry(
        toCapabilityEntryRecord(capabilityState[moduleId]),
        moduleId,
        entry
      );
      const moduleToggles = toRecord(toRecord(project["workbench"])["moduleToggles"]);
      const moduleDisabled = Object.prototype.hasOwnProperty.call(moduleToggles, moduleId)
        ? moduleToggles[moduleId] === false
        : false;
      const status =
        asNonEmptyString(capabilityEntry.status) || asNonEmptyString(entry.status) || "planned";
      const blockers = normalizeStringArray(capabilityEntry.blockers);
      const warnings = normalizeStringArray(capabilityEntry.warnings);

      if (moduleDisabled) {
        return normalizeProcessModule({
          id: moduleId,
          labelKey: asNonEmptyString(entry.titleKey),
          status: "skipped",
          summary: "Disabled from the active workbench scope.",
          title: moduleId,
        });
      }
      if (status === "planned") {
        return normalizeProcessModule({
          id: moduleId,
          labelKey: asNonEmptyString(entry.titleKey),
          status: "planned",
          summary: "Reserved for the later rollout.",
          title: moduleId,
        });
      }
      if (status === "gated") {
        return normalizeProcessModule({
          id: moduleId,
          labelKey: asNonEmptyString(entry.titleKey),
          status: "gated",
          summary: warnings[0] || "This module remains capability-gated on the current runtime.",
          title: moduleId,
        });
      }
      if (status === "blocked") {
        return normalizeProcessModule({
          id: moduleId,
          labelKey: asNonEmptyString(entry.titleKey),
          status: "blocked",
          summary: blockers[0] || "Resolve the module blockers before starting the run.",
          title: moduleId,
        });
      }
      return normalizeProcessModule({
        id: moduleId,
        labelKey: asNonEmptyString(entry.titleKey),
        status: status === "ready" ? "queued" : status,
        summary:
          status === "ready"
            ? "Queued for the managed audio analysis run."
            : warnings[0] ||
              blockers[0] ||
              "Audio analysis module state is waiting on provider readiness.",
        title: moduleId,
      });
    });
  }

  function syncProjectAudioAnalysisProjection(
    runtime: LaboratoryAudioAnalysisRuntime,
    project: LaboratoryProjectRecord
  ) {
    const normalizedState = normalizeAudioAnalysisState(project.audioAnalysis, runtime);
    const target = toAudioTargetRecord(resolveAudioFeatureTarget(project));
    const providerState = buildAudioAnalysisProviderState(runtime, project);
    const capabilityState = buildAudioAnalysisCapabilityState(
      runtime,
      project,
      target,
      providerState
    );
    const processRecord = toProcessRecord(getFeatureProcessRecord(project, audioFeatureId));
    const reportRecord = toReportRecord(getFeatureReportRecord(project, audioFeatureId));
    const nextResults: Record<string, LaboratoryAudioAnalysisModuleResultRecord> = {};
    const nextRuns: Record<string, LaboratoryAudioAnalysisRunRecord> = {};
    const processModules = Array.isArray(processRecord.modules)
      ? processRecord.modules.map(toProcessModuleRecord)
      : [];
    const processFindings = Array.isArray(processRecord.findings)
      ? processRecord.findings.map(normalizeProcessFinding).map(toProcessFindingRecord)
      : [];
    const processArtifacts = Array.isArray(processRecord.artifacts)
      ? processRecord.artifacts.map(normalizeProcessArtifact).map(toProcessArtifactRecord)
      : [];

    getCatalogModules(runtime).forEach(function (entry) {
      const moduleId = asNonEmptyString(entry.id) || `audio-module-${Date.now()}`;
      const existingResult = normalizeAudioAnalysisModuleResult(
        toRecord(toRecord(normalizedState["results"])[moduleId]),
        moduleId,
        entry
      );
      const capabilityEntry = normalizeAudioAnalysisCapabilityEntry(
        toCapabilityEntryRecord(capabilityState[moduleId]),
        moduleId,
        entry
      );
      const processModule =
        processModules.find(function (candidate) {
          return asNonEmptyString(candidate.id) === moduleId;
        }) || normalizeProcessModule({});
      const signals = processFindings.filter(function (candidate) {
        return asNonEmptyString(candidate.moduleId) === moduleId;
      });
      const artifacts = processArtifacts.filter(function (candidate) {
        return asNonEmptyString(candidate.moduleId) === moduleId;
      });
      const resultStatus = mapAudioAnalysisResultStatus(
        processRecord,
        toProcessModuleRecord(processModule),
        capabilityEntry
      );
      const confidence =
        [...signals].sort(function (left, right) {
          return (
            getAudioAnalysisConfidenceRank(right.confidence) -
            getAudioAnalysisConfidenceRank(left.confidence)
          );
        })[0]?.confidence || null;

      const nextResult = normalizeAudioAnalysisModuleResult(
        {
          ...existingResult,
          artifacts: artifacts,
          blockers:
            resultStatus === "planned" || resultStatus === "gated" || resultStatus === "blocked"
              ? normalizeStringArray(capabilityEntry.blockers)
              : [],
          confidence: confidence,
          metrics: buildAudioAnalysisModuleMetrics(signals, artifacts),
          moduleId: moduleId,
          phase: asNonEmptyString(entry["phase"]) || asNonEmptyString(existingResult["phase"]),
          providerIds:
            normalizeStringArray(entry.providerIds).length > 0
              ? normalizeStringArray(entry.providerIds)
              : normalizeStringArray(capabilityEntry.providerIds),
          requiredToolIds: normalizeStringArray(capabilityEntry.requiredToolIds),
          runMeta: {
            jobId: asNonEmptyString(processRecord.jobId),
            requestId: asNonEmptyString(processRecord.requestId),
            runId: asNonEmptyString(processRecord.runId),
          },
          signals: signals,
          sourceSignature: asNonEmptyString(target.signature),
          status: resultStatus,
          summary: buildAudioAnalysisModuleSummary(
            resultStatus,
            toProcessModuleRecord(processModule),
            capabilityEntry
          ),
          summaryKey:
            asNonEmptyString(entry["summaryKey"]) || asNonEmptyString(existingResult["summaryKey"]),
          timing: {
            completedAt: asNonEmptyString(toProcessModuleRecord(processModule).completedAt),
            sampleWindowSeconds: asNumber(
              toRecord(processRecord.targetSummary)["sampleWindowSeconds"]
            ),
            startedAt: asNonEmptyString(toProcessModuleRecord(processModule).startedAt),
          },
          titleKey:
            asNonEmptyString(entry["titleKey"]) || asNonEmptyString(existingResult["titleKey"]),
          toolIds:
            normalizeStringArray(entry.toolIds).length > 0
              ? normalizeStringArray(entry.toolIds)
              : normalizeStringArray(capabilityEntry.toolIds),
          warnings: Array.from(
            new Set(
              normalizeStringArray(capabilityEntry.warnings).concat(
                normalizeStringArray(toProcessModuleRecord(processModule).warnings),
                resultStatus === "stale" ? ["Target changed; rerun this audio module."] : []
              )
            )
          ),
        },
        moduleId,
        entry
      );
      nextResults[moduleId] = nextResult;

      const resultArtifacts = Array.isArray(nextResult.artifacts)
        ? nextResult.artifacts.map(toProcessArtifactRecord)
        : [];
      const resultSignals = Array.isArray(nextResult.signals)
        ? nextResult.signals.map(toProcessFindingRecord)
        : [];
      nextRuns[moduleId] = normalizeAudioAnalysisRunRecord(
        {
          artifactIds: resultArtifacts
            .map(function (artifact) {
              return asNonEmptyString(artifact.id);
            })
            .filter((artifactId): artifactId is string => artifactId !== null),
          completedAt:
            asNonEmptyString(toProcessModuleRecord(processModule).completedAt) ||
            asNonEmptyString(processRecord.completedAt),
          error:
            asNonEmptyString(nextResult.status) === "failed"
              ? asNonEmptyString(processRecord.error)
              : null,
          findingIds: resultSignals
            .map(function (signal) {
              return asNonEmptyString(signal.id);
            })
            .filter((signalId): signalId is string => signalId !== null),
          jobId: asNonEmptyString(processRecord.jobId),
          moduleId: moduleId,
          requestId: asNonEmptyString(processRecord.requestId),
          runId: asNonEmptyString(processRecord.runId),
          startedAt:
            asNonEmptyString(toProcessModuleRecord(processModule).startedAt) ||
            asNonEmptyString(processRecord.startedAt),
          status: asNonEmptyString(nextResult.status),
          warnings: normalizeStringArray(nextResult.warnings),
        },
        moduleId
      );
    });

    project.audioAnalysis = normalizeAudioAnalysisState(
      {
        ...normalizedState,
        analysisCatalog: buildAudioAnalysisCatalogProjection(runtime),
        capabilityState: capabilityState,
        export: {
          items: Array.isArray(reportRecord.exports)
            ? reportRecord.exports.map(normalizeReportExport)
            : [],
          lastGeneratedAt: asNonEmptyString(reportRecord.generatedAt),
        },
        providerState: providerState,
        results: nextResults,
        runs: nextRuns,
        schemaVersion: audioAnalysisSchemaVersion,
        source: {
          extractedAudioPath:
            asNonEmptyString(toRecord(target.metadata)["extractedBy"]) !== null
              ? asNonEmptyString(target.path)
              : null,
          mode: asNonEmptyString(target.mode),
          outputId: asNonEmptyString(target.outputId),
          preferredSourceKind: getPreferredFeatureSourceKind(audioFeatureId, runtime.sourcePresets),
          requestedMode: asNonEmptyString(target.requestedMode),
          targetFileName: asNonEmptyString(target.fileName),
          targetLabel: asNonEmptyString(target.label),
          targetMimeType: asNonEmptyString(target.mimeType),
          targetPath: asNonEmptyString(target.path),
          targetSignature: asNonEmptyString(target.signature),
          updatedAt: asNonEmptyString(project.updatedAt),
        },
      },
      runtime
    );

    return project.audioAnalysis;
  }

  return {
    buildAudioAnalysisCapabilityState,
    buildAudioAnalysisCatalogProjection,
    buildAudioAnalysisModuleMetrics,
    buildAudioAnalysisModuleSummary,
    buildAudioAnalysisModules,
    buildAudioAnalysisProviderState,
    getAudioAnalysisConfidenceRank,
    mapAudioAnalysisResultStatus,
    resolveAudioFeatureTarget,
    syncProjectAudioAnalysisProjection,
  };
}
