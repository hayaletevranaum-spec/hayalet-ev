type UnknownFn = (...args: unknown[]) => unknown;

export function createLaboratoryProcessDelegatesRuntime(deps: Record<string, unknown>) {
  const { processCoordinationRuntime } = deps as {
    processCoordinationRuntime: Record<string, unknown>;
  };

  function buildAudioAnalysisReportProjection(
    runtime: Record<string, unknown>,
    project: Record<string, unknown>
  ) {
    return (processCoordinationRuntime["buildAudioAnalysisReportProjection"] as UnknownFn)(
      runtime,
      project
    );
  }

  function composeAudioAnalysisReport(
    runtime: Record<string, unknown>,
    project: Record<string, unknown>
  ) {
    return (processCoordinationRuntime["composeAudioAnalysisReport"] as UnknownFn)(
      runtime,
      project
    );
  }

  function getProcessArtifactByKind(processRecord: Record<string, unknown>, kind: string) {
    return (processCoordinationRuntime["getProcessArtifactByKind"] as UnknownFn)(
      processRecord,
      kind
    );
  }

  function formatReportCardLabel(card: Record<string, unknown>) {
    return (processCoordinationRuntime["formatReportCardLabel"] as UnknownFn)(card);
  }

  function composeFeatureReport(
    runtime: Record<string, unknown>,
    project: Record<string, unknown>,
    featureId: string
  ) {
    return (processCoordinationRuntime["composeFeatureReport"] as UnknownFn)(
      runtime,
      project,
      featureId
    );
  }

  function buildReportMarkdown(
    runtime: Record<string, unknown>,
    project: Record<string, unknown>,
    featureId: string,
    reportRecord: Record<string, unknown>
  ) {
    return (processCoordinationRuntime["buildReportMarkdown"] as UnknownFn)(
      runtime,
      project,
      featureId,
      reportRecord
    );
  }

  async function runFeatureProcess(
    api: Record<string, unknown>,
    runtime: Record<string, unknown>,
    requestId: string,
    featureId: string,
    workbenchSource?: unknown
  ) {
    return (processCoordinationRuntime["runFeatureProcess"] as UnknownFn)(
      api,
      runtime,
      requestId,
      featureId,
      workbenchSource
    );
  }

  async function runManagedProcess(
    runtime: Record<string, unknown>,
    project: Record<string, unknown>,
    requestId: string,
    jobId: string,
    featureId: string
  ) {
    return (processCoordinationRuntime["runManagedProcess"] as UnknownFn)(
      runtime,
      project,
      requestId,
      jobId,
      featureId
    );
  }

  async function cancelFeatureProcess(
    api: Record<string, unknown>,
    runtime: Record<string, unknown>,
    requestId: string,
    featureId: string,
    workbenchSource?: unknown
  ) {
    return (processCoordinationRuntime["cancelFeatureProcess"] as UnknownFn)(
      api,
      runtime,
      requestId,
      featureId,
      workbenchSource
    );
  }

  async function exportFeatureReport(
    api: Record<string, unknown>,
    runtime: Record<string, unknown>,
    requestId: string,
    featureId: string,
    options?: Record<string, unknown>
  ) {
    return (processCoordinationRuntime["exportFeatureReport"] as UnknownFn)(
      api,
      runtime,
      requestId,
      featureId,
      options
    );
  }

  return {
    buildAudioAnalysisReportProjection,
    buildReportMarkdown,
    cancelFeatureProcess,
    composeAudioAnalysisReport,
    composeFeatureReport,
    exportFeatureReport,
    formatReportCardLabel,
    getProcessArtifactByKind,
    runManagedProcess,
    runFeatureProcess,
  };
}
