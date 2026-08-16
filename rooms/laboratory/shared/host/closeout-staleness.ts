type LaboratoryFeatureProcessRecord = Record<string, unknown> & {
  completedAt?: string | null;
  runId?: string | null;
  warnings?: string[] | null;
};

type LaboratoryFeatureReportRecord = Record<string, unknown> & {
  generatedAt?: string | null;
  warnings?: string[] | null;
};

type LaboratoryCloseoutProjectState = Record<string, unknown> & {
  process: {
    lastActionAt: string | null;
    lastError: string | null;
  };
  report: {
    lastActionAt: string | null;
    lastError: string | null;
  };
};

type LaboratoryCloseoutStalenessRuntimeDeps = {
  featureIds: string[];
  getFeatureProcessRecord: (
    project: LaboratoryCloseoutProjectState,
    featureId: string
  ) => LaboratoryFeatureProcessRecord;
  setFeatureProcessRecord: (
    project: LaboratoryCloseoutProjectState,
    featureId: string,
    record: LaboratoryFeatureProcessRecord
  ) => void;
  getFeatureReportRecord: (
    project: LaboratoryCloseoutProjectState,
    featureId: string
  ) => LaboratoryFeatureReportRecord;
  setFeatureReportRecord: (
    project: LaboratoryCloseoutProjectState,
    featureId: string,
    record: LaboratoryFeatureReportRecord
  ) => void;
};

function appendWarning(
  existingWarnings: string[] | null | undefined,
  reason: string | null
): string[] {
  return Array.from(new Set([...(existingWarnings ?? []), ...(reason === null ? [] : [reason])]));
}

export function createLaboratoryCloseoutStalenessRuntime(
  deps: LaboratoryCloseoutStalenessRuntimeDeps
) {
  const {
    featureIds,
    getFeatureProcessRecord,
    setFeatureProcessRecord,
    getFeatureReportRecord,
    setFeatureReportRecord,
  } = deps;

  function markFeatureProcessStale(
    project: LaboratoryCloseoutProjectState,
    featureId: string,
    reason: string | null
  ): void {
    const existing = getFeatureProcessRecord(project, featureId);
    setFeatureProcessRecord(project, featureId, {
      ...existing,
      status: existing.completedAt ? "stale" : "idle",
      jobId: null,
      requestId: null,
      runId: existing.runId ?? null,
      percent: 0,
      warnings: appendWarning(existing.warnings, reason),
      error: null,
    });
    project.process.lastError = null;
    project.process.lastActionAt = new Date().toISOString();
  }

  function markFeatureReportStale(
    project: LaboratoryCloseoutProjectState,
    featureId: string,
    reason: string | null
  ): void {
    const existing = getFeatureReportRecord(project, featureId);
    setFeatureReportRecord(project, featureId, {
      ...existing,
      status: existing.generatedAt ? "stale" : "idle",
      warnings: appendWarning(existing.warnings, reason),
      error: null,
    });
    project.report.lastError = null;
    project.report.lastActionAt = new Date().toISOString();
  }

  function markCloseoutAsStale(
    project: LaboratoryCloseoutProjectState,
    reason: string | null,
    targetFeatureIds?: string[] | null
  ): void {
    const resolvedFeatureIds =
      Array.isArray(targetFeatureIds) && targetFeatureIds.length > 0
        ? targetFeatureIds
        : featureIds;
    resolvedFeatureIds.forEach(function (featureId) {
      markFeatureProcessStale(project, featureId, reason);
      markFeatureReportStale(project, featureId, reason);
    });
  }

  return {
    markCloseoutAsStale,
    markFeatureProcessStale,
    markFeatureReportStale,
  };
}
