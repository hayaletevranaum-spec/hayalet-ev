type LaboratoryRecord = Record<string, unknown>;

type LaboratoryProjectRecord = LaboratoryRecord & {
  audioAnalysis?: unknown;
  name?: unknown;
};

type LaboratoryFeatureProcessRecord = LaboratoryRecord & {
  emptyReason?: unknown;
  error?: unknown;
  runId?: unknown;
  status?: unknown;
  targetSummary?: unknown;
  warnings?: unknown;
};

type LaboratoryFeatureReportRecord = LaboratoryRecord & {
  exports?: unknown;
};

type LaboratoryProcessFindingRecord = LaboratoryRecord & {
  level?: unknown;
};

type LaboratoryAudioAnalysisCatalogRecord = LaboratoryRecord & {
  orderedIds?: unknown;
};

type LaboratoryAudioAnalysisSourceRecord = LaboratoryRecord & {
  targetLabel?: unknown;
};

type LaboratoryAudioAnalysisStateRecord = LaboratoryRecord & {
  analysisCatalog?: unknown;
  results?: unknown;
  source?: unknown;
};

type LaboratoryAudioModuleDescriptor = LaboratoryRecord & {
  id?: unknown;
};

type LaboratoryAudioModuleResultRecord = LaboratoryRecord & {
  artifacts?: unknown;
  signals?: unknown;
  status?: unknown;
  warnings?: unknown;
};

type LaboratoryAudioReportProjection = {
  audioAnalysis: LaboratoryAudioAnalysisStateRecord;
  orderedResults: LaboratoryAudioModuleResultRecord[];
};

type LaboratoryAudioReportRuntimeDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  audioFeatureId: string;
  clone: <T>(value: T) => T;
  createEmptyFeatureReportRecord: (featureId: string) => LaboratoryRecord;
  getAudioAnalysisModulesForRuntime: (runtime: LaboratoryRecord) => unknown[];
  getFeatureProcessRecord: (
    project: LaboratoryProjectRecord,
    featureId: string
  ) => LaboratoryFeatureProcessRecord;
  getFeatureReportRecord: (
    project: LaboratoryProjectRecord,
    featureId: string
  ) => LaboratoryFeatureReportRecord;
  getFindingSeverityRank: (level: unknown) => number;
  normalizeAudioAnalysisModuleResult: (
    rawValue: LaboratoryRecord,
    moduleId: string,
    moduleDescriptor: LaboratoryAudioModuleDescriptor
  ) => LaboratoryAudioModuleResultRecord;
  normalizeAudioAnalysisState: (
    rawValue: unknown,
    runtime: LaboratoryRecord
  ) => LaboratoryAudioAnalysisStateRecord;
  normalizeFeatureReportRecord: (
    rawValue: unknown,
    featureId: string
  ) => LaboratoryFeatureReportRecord;
  normalizeProcessFinding: (rawValue: unknown) => LaboratoryProcessFindingRecord;
  normalizeStringArray: (value: unknown) => string[];
  syncProjectAudioAnalysisProjection: (
    runtime: LaboratoryRecord,
    project: LaboratoryProjectRecord
  ) => void;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createLaboratoryAudioReportRuntime(deps: LaboratoryAudioReportRuntimeDeps) {
  const {
    asNonEmptyString,
    audioFeatureId,
    clone,
    createEmptyFeatureReportRecord,
    getAudioAnalysisModulesForRuntime,
    getFeatureProcessRecord,
    getFeatureReportRecord,
    getFindingSeverityRank,
    normalizeAudioAnalysisModuleResult,
    normalizeAudioAnalysisState,
    normalizeFeatureReportRecord,
    normalizeProcessFinding,
    normalizeStringArray,
    syncProjectAudioAnalysisProjection,
    toRecord,
  } = deps;

  function toProjectRecord(value: unknown): LaboratoryProjectRecord {
    return toRecord(value);
  }

  function toFeatureProcessRecord(value: unknown): LaboratoryFeatureProcessRecord {
    return toRecord(value);
  }

  function toFeatureReportRecord(value: unknown): LaboratoryFeatureReportRecord {
    return toRecord(value);
  }

  function toAnalysisStateRecord(value: unknown): LaboratoryAudioAnalysisStateRecord {
    return toRecord(value);
  }

  function toAnalysisCatalogRecord(value: unknown): LaboratoryAudioAnalysisCatalogRecord {
    return toRecord(value);
  }

  function toAnalysisSourceRecord(value: unknown): LaboratoryAudioAnalysisSourceRecord {
    return toRecord(value);
  }

  function toModuleDescriptor(value: unknown): LaboratoryAudioModuleDescriptor {
    return toRecord(value);
  }

  function toModuleResultRecord(value: unknown): LaboratoryAudioModuleResultRecord {
    return toRecord(value);
  }

  function toProcessFindingRecord(value: unknown): LaboratoryProcessFindingRecord {
    return toRecord(value);
  }

  function toUnknownArray(value: unknown): unknown[] {
    return Array.isArray(value)
      ? value.map(function (entry): unknown {
          return entry;
        })
      : [];
  }

  function getAudioReportEmptyReason(
    processRecord: LaboratoryFeatureProcessRecord,
    processStatus: string
  ) {
    const explicitReason = asNonEmptyString(processRecord.emptyReason);
    if (explicitReason !== null) {
      return explicitReason;
    }
    if (processStatus === "running" || processStatus === "queued") {
      return "Ses analizi hala suruyor; rapor tamamlaninca dolacak.";
    }
    if (processStatus === "failed") {
      return (
        asNonEmptyString(processRecord.error) ||
        "Ses analizi hata ile tamamlandigi icin rapor bos kaldi."
      );
    }
    if (processStatus === "cancelled") {
      return "Ses analizi iptal edildigi icin rapor bos kaldi.";
    }
    return "Once ses analizi tamamlanmali.";
  }

  function buildAudioAnalysisReportProjection(
    runtime: LaboratoryRecord,
    project: LaboratoryProjectRecord
  ): LaboratoryAudioReportProjection {
    const projectedProject = clone(project);
    syncProjectAudioAnalysisProjection(runtime, projectedProject);

    const audioAnalysis = toAnalysisStateRecord(
      normalizeAudioAnalysisState(projectedProject.audioAnalysis, runtime)
    );
    const catalogMap = getAudioAnalysisModulesForRuntime(runtime).reduce<
      Record<string, LaboratoryAudioModuleDescriptor>
    >(function (accumulator, entry) {
      const descriptor = toModuleDescriptor(entry);
      const moduleId = asNonEmptyString(descriptor.id);
      if (moduleId !== null) {
        accumulator[moduleId] = descriptor;
      }
      return accumulator;
    }, {});
    const orderedIds = normalizeStringArray(
      toAnalysisCatalogRecord(audioAnalysis.analysisCatalog).orderedIds
    );
    const resultMap = toRecord(audioAnalysis.results);
    const extraIds = Object.keys(resultMap).filter(function (moduleId) {
      return !orderedIds.includes(moduleId);
    });
    const orderedResults = orderedIds.concat(extraIds).map(function (moduleId) {
      return normalizeAudioAnalysisModuleResult(
        toRecord(resultMap[moduleId]),
        moduleId,
        catalogMap[moduleId] || {}
      );
    });

    return {
      audioAnalysis,
      orderedResults,
    };
  }

  function composeAudioAnalysisReport(runtime: LaboratoryRecord, project: LaboratoryProjectRecord) {
    const processRecord = toFeatureProcessRecord(getFeatureProcessRecord(project, audioFeatureId));
    const processStatus = asNonEmptyString(processRecord.status) || "idle";
    if (processStatus !== "ready" && processStatus !== "stale") {
      return normalizeFeatureReportRecord(
        {
          ...createEmptyFeatureReportRecord(audioFeatureId),
          status: processStatus === "running" ? "staged" : "idle",
          warnings: normalizeStringArray(processRecord.warnings),
          emptyReason: getAudioReportEmptyReason(processRecord, processStatus),
        },
        audioFeatureId
      );
    }

    const projection = buildAudioAnalysisReportProjection(runtime, project);
    const orderedResults = projection.orderedResults.map(toModuleResultRecord);
    const findings = orderedResults
      .flatMap(function (entry) {
        return toUnknownArray(entry.signals);
      })
      .map(normalizeProcessFinding)
      .map(toProcessFindingRecord)
      .sort(function (left, right) {
        return getFindingSeverityRank(right.level) - getFindingSeverityRank(left.level);
      });
    const artifactCount = orderedResults.reduce(function (sum, entry) {
      return sum + (Array.isArray(entry.artifacts) ? entry.artifacts.length : 0);
    }, 0);
    const completedCount = orderedResults.filter(function (entry) {
      return ["complete", "stale"].includes(asNonEmptyString(entry.status) || "idle");
    }).length;
    const gatedCount = orderedResults.filter(function (entry) {
      return asNonEmptyString(entry.status) === "gated";
    }).length;
    const plannedCount = orderedResults.filter(function (entry) {
      return asNonEmptyString(entry.status) === "planned";
    }).length;
    const blockedCount = orderedResults.filter(function (entry) {
      return asNonEmptyString(entry.status) === "blocked";
    }).length;
    const warnings = Array.from(
      new Set(
        normalizeStringArray(processRecord.warnings).concat(
          orderedResults.flatMap(function (entry) {
            return normalizeStringArray(entry.warnings);
          })
        )
      )
    );
    const caveats: string[] = [];
    if (plannedCount > 0) {
      caveats.push(`${String(plannedCount)} audio module(s) remain planned for the v2 rollout.`);
    }
    if (gatedCount > 0) {
      caveats.push(
        `${String(gatedCount)} audio module(s) remain capability-gated on the current runtime.`
      );
    }
    if (blockedCount > 0) {
      caveats.push(
        "Blocked audio modules keep their slot visible until the target and providers are ready."
      );
    }

    const targetSummary = toRecord(processRecord.targetSummary);
    const audioSource = toAnalysisSourceRecord(projection.audioAnalysis.source);
    const projectRecord = toProjectRecord(project);
    const reportRecord = toFeatureReportRecord(getFeatureReportRecord(project, audioFeatureId));

    return normalizeFeatureReportRecord(
      {
        featureId: audioFeatureId,
        status: "ready",
        sourceRunId: processRecord.runId,
        generatedAt: new Date().toISOString(),
        summaryCards: [
          {
            id: "audio-target",
            label: "Target",
            value:
              asNonEmptyString(audioSource.targetLabel) ||
              asNonEmptyString(targetSummary["label"]) ||
              asNonEmptyString(projectRecord.name) ||
              "Project",
          },
          {
            id: "audio-visible-modules",
            label: "Visible modules",
            value: String(orderedResults.length),
          },
          {
            id: "audio-completed-modules",
            label: "Completed modules",
            value: String(completedCount),
          },
          {
            id: "audio-findings",
            label: "Findings",
            value: String(findings.length),
          },
          {
            id: "audio-artifacts",
            label: "Artifacts",
            value: String(artifactCount),
          },
        ],
        findings,
        caveats,
        warnings,
        exports: reportRecord.exports,
        error: null,
        emptyReason:
          findings.length === 0 && artifactCount === 0
            ? getAudioReportEmptyReason(processRecord, processStatus)
            : null,
      },
      audioFeatureId
    );
  }

  return {
    buildAudioAnalysisReportProjection,
    composeAudioAnalysisReport,
  };
}
