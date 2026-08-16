import {
  freezeAnalysisScope,
  normalizeAnalysisReference,
  normalizeAnalysisScope,
  serializeAnalysisScope,
} from "../types/analysis-scope.js";

interface ProcessReportRecord extends Record<string, unknown> {
  moduleId?: unknown;
  id?: unknown;
  label?: unknown;
  labelKey?: unknown;
  title?: unknown;
  status?: unknown;
  percent?: unknown;
  summary?: unknown;
  warnings?: unknown;
  artifactIds?: unknown;
  findingIds?: unknown;
  startedAt?: unknown;
  completedAt?: unknown;
  jobId?: unknown;
  requestId?: unknown;
  runId?: unknown;
  targetSummary?: unknown;
  modules?: unknown;
  findings?: unknown;
  artifacts?: unknown;
  events?: unknown;
  rawLog?: unknown;
  error?: unknown;
  emptyReason?: unknown;
  records?: unknown;
  lastError?: unknown;
  lastActionAt?: unknown;
  sourceRunId?: unknown;
  generatedAt?: unknown;
  summaryCards?: unknown;
  caveats?: unknown;
  exports?: unknown;
  value?: unknown;
  format?: unknown;
  path?: unknown;
  fileName?: unknown;
  createdAt?: unknown;
  process?: unknown;
  report?: unknown;
  analysisScope?: unknown;
  liveFindings?: unknown;
  previewArtifacts?: unknown;
  confidence?: unknown;
  moduleTrace?: unknown;
  comparisonVariants?: unknown;
  hypothesisSummary?: unknown;
  code?: unknown;
  severity?: unknown;
  sourceModule?: unknown;
  reference?: unknown;
  hypothesis?: unknown;
  statusLabel?: unknown;
  variantId?: unknown;
  active?: unknown;
  metadata?: unknown;
  windowKey?: unknown;
  streamId?: unknown;
  emittedAt?: unknown;
  detail?: unknown;
  message?: unknown;
  eventId?: unknown;
  stage?: unknown;
  kind?: unknown;
}

interface ProcessArtifactRecord extends Record<string, unknown> {
  path?: unknown;
  moduleId?: unknown;
}

export function createLaboratoryProcessReportStateRuntime(deps: Record<string, unknown>) {
  const asNonEmptyString = deps["asNonEmptyString"] as (value: unknown) => string | null;
  const asNumber = deps["asNumber"] as (value: unknown) => number;
  const featureIds = Array.isArray(deps["featureIds"]) ? (deps["featureIds"] as string[]) : [];
  const normalizeProfileArtifact = deps["normalizeProfileArtifact"] as (
    rawValue: unknown
  ) => ProcessArtifactRecord;
  const normalizeProfileSignal = deps["normalizeProfileSignal"] as (
    rawValue: unknown
  ) => ProcessReportRecord;
  const toRecord = deps["toRecord"] as (value: unknown) => ProcessReportRecord;

  function createEmptyFeatureProcessRecord(featureId: string) {
    return {
      featureId: featureId,
      status: "idle" as string,
      jobId: null as string | null,
      requestId: null as string | null,
      runId: null as string | null,
      startedAt: null as string | null,
      completedAt: null as string | null,
      percent: 0,
      targetSummary: null as Record<string, unknown> | null,
      modules: [] as unknown[],
      findings: [] as unknown[],
      artifacts: [] as unknown[],
      events: [] as unknown[],
      rawLog: [] as unknown[],
      warnings: [] as string[],
      error: null as string | null,
      emptyReason: null as string | null,
      analysisScope: null as Record<string, unknown> | null,
      liveFindings: [] as unknown[],
      previewArtifacts: [] as unknown[],
      confidence: null as string | null,
      moduleTrace: [] as unknown[],
      comparisonVariants: [] as unknown[],
      hypothesisSummary: null as string | null,
    };
  }

  function createEmptyProcessState() {
    const records: Record<string, unknown> = {};
    featureIds.forEach(function (featureId: string) {
      records[featureId] = createEmptyFeatureProcessRecord(featureId);
    });
    return {
      records: records,
      lastError: null as string | null,
      lastActionAt: null as string | null,
    };
  }

  function normalizeProcessArtifact(rawValue: unknown) {
    const artifact = normalizeProfileArtifact(rawValue);
    const source = toRecord(rawValue);
    return {
      ...artifact,
      moduleId: asNonEmptyString(toRecord(rawValue).moduleId),
      label: asNonEmptyString(source.label),
      status: asNonEmptyString(source.status) || "ready",
      variantId: asNonEmptyString(source.variantId),
      active: source.active !== false,
      reference: normalizeAnalysisReference(source.reference ?? rawValue),
      metadata: toRecord(source.metadata),
    };
  }

  function normalizeProcessFinding(rawValue: unknown) {
    const source = toRecord(rawValue);
    const finding = normalizeProfileSignal(rawValue);
    const severity = asNonEmptyString(source.severity);
    return {
      ...finding,
      moduleId: asNonEmptyString(toRecord(rawValue).moduleId),
      code: asNonEmptyString(source.code),
      severity:
        severity === "success" || severity === "warning" || severity === "error"
          ? severity
          : "info",
      sourceModule: asNonEmptyString(source.sourceModule) || asNonEmptyString(source.moduleId),
      reference: normalizeAnalysisReference(source.reference ?? rawValue),
      hypothesis: asNonEmptyString(source.hypothesis),
      metadata: toRecord(source.metadata),
    };
  }

  function normalizeLiveFinding(rawValue: unknown) {
    const source = toRecord(rawValue);
    const timestamp = asNumber(source.emittedAt);
    return {
      ...normalizeProcessFinding(rawValue),
      emittedAt: typeof timestamp === "number" ? Math.max(0, Math.round(timestamp)) : Date.now(),
      windowKey: asNonEmptyString(source.windowKey),
      streamId: asNonEmptyString(source.streamId),
    };
  }

  function normalizeModuleTraceEntry(rawValue: unknown) {
    const source = toRecord(rawValue);
    return {
      id: asNonEmptyString(source.id) || `module-trace-${Date.now()}`,
      moduleId: asNonEmptyString(source.moduleId),
      stage: asNonEmptyString(source.stage) || "process",
      status: asNonEmptyString(source.status) || "idle",
      timestamp: asNonEmptyString(source["timestamp"]) || new Date().toISOString(),
      message: asNonEmptyString(source.message),
      detail: asNonEmptyString(source.detail),
      eventId: asNonEmptyString(source.eventId),
    };
  }

  function normalizeComparisonVariant(rawValue: unknown) {
    const source = toRecord(rawValue);
    const artifactId = asNonEmptyString(source["artifactId"]);
    const artifactIds = Array.isArray(source.artifactIds)
      ? (source.artifactIds as unknown[]).map(asNonEmptyString).filter(Boolean)
      : artifactId
        ? [artifactId]
        : [];
    return {
      id: asNonEmptyString(source.id) || `comparison-variant-${Date.now()}`,
      kind: asNonEmptyString(source.kind) || "variant",
      label: asNonEmptyString(source.label) || "Variant",
      status: asNonEmptyString(source.status) || "ready",
      summary: asNonEmptyString(source.summary),
      artifactIds,
      artifactId,
      artifactPath: asNonEmptyString(source["artifactPath"]),
      sourceModule: asNonEmptyString(source.sourceModule),
      active: source.active !== false,
    };
  }

  function normalizeFrozenScope(
    rawValue: unknown,
    runId: string | null,
    status: string,
    startedAt: string | null
  ) {
    const normalizedScope = normalizeAnalysisScope(rawValue);
    if (normalizedScope === null) {
      return null;
    }
    if (runId !== null && status !== "idle") {
      return freezeAnalysisScope(normalizedScope, runId, startedAt || new Date().toISOString());
    }
    return serializeAnalysisScope(normalizedScope);
  }

  function normalizeProcessModule(rawValue: unknown) {
    const source = toRecord(rawValue);
    return {
      id: asNonEmptyString(source.id) || `process-module-${Date.now()}`,
      labelKey: asNonEmptyString(source.labelKey),
      title: asNonEmptyString(source.title),
      status: asNonEmptyString(source.status) || "idle",
      percent:
        typeof asNumber(source.percent) === "number"
          ? Math.max(0, Math.min(100, Math.round(asNumber(source.percent) || 0)))
          : null,
      progressMode:
        typeof asNumber(source.percent) === "number" ||
        asNonEmptyString(source["progressMode"]) === "measured"
          ? "measured"
          : "none",
      summary: asNonEmptyString(source.summary) || "",
      message: asNonEmptyString(source["message"]),
      warnings: Array.isArray(source.warnings)
        ? source.warnings.map(function (entry: unknown) {
            return String(entry);
          })
        : [],
      artifactIds: Array.isArray(source.artifactIds)
        ? (source.artifactIds as unknown[]).map(asNonEmptyString).filter(Boolean)
        : [],
      findingIds: Array.isArray(source.findingIds)
        ? (source.findingIds as unknown[]).map(asNonEmptyString).filter(Boolean)
        : [],
      metadata: toRecord(source.metadata),
      startedAt: asNonEmptyString(source.startedAt),
      completedAt: asNonEmptyString(source.completedAt),
    };
  }

  function normalizeFeatureProcessRecord(rawValue: unknown, featureId: string) {
    const source = toRecord(rawValue);
    const status = asNonEmptyString(source.status) || "idle";
    const runId = asNonEmptyString(source.runId);
    const startedAt = asNonEmptyString(source.startedAt);
    return {
      ...createEmptyFeatureProcessRecord(featureId),
      ...source,
      featureId: featureId,
      status: status,
      jobId: asNonEmptyString(source.jobId),
      requestId: asNonEmptyString(source.requestId),
      runId,
      startedAt,
      completedAt: asNonEmptyString(source.completedAt),
      percent: Math.max(0, Math.min(100, Math.round(asNumber(source.percent) || 0))),
      targetSummary:
        Object.keys(toRecord(source.targetSummary)).length > 0
          ? toRecord(source.targetSummary)
          : null,
      modules: Array.isArray(source.modules) ? source.modules.map(normalizeProcessModule) : [],
      findings: Array.isArray(source.findings) ? source.findings.map(normalizeProcessFinding) : [],
      artifacts: Array.isArray(source.artifacts)
        ? source.artifacts.map(normalizeProcessArtifact).filter(function (
            entry: ProcessArtifactRecord
          ) {
            return entry.path !== null;
          })
        : [],
      events: Array.isArray(source.events)
        ? source.events.map(function (entry: unknown) {
            return toRecord(entry);
          })
        : [],
      rawLog: Array.isArray(source.rawLog)
        ? source.rawLog.map(function (entry: unknown) {
            return toRecord(entry);
          })
        : [],
      warnings: Array.isArray(source.warnings)
        ? source.warnings.map(function (entry: unknown) {
            return String(entry);
          })
        : [],
      error: asNonEmptyString(source.error),
      emptyReason: asNonEmptyString(source.emptyReason),
      analysisScope: normalizeFrozenScope(source.analysisScope, runId, status, startedAt),
      liveFindings: Array.isArray(source.liveFindings)
        ? source.liveFindings.map(normalizeLiveFinding)
        : [],
      previewArtifacts: Array.isArray(source.previewArtifacts)
        ? source.previewArtifacts.map(normalizeProcessArtifact)
        : [],
      confidence: asNonEmptyString(source.confidence),
      moduleTrace: Array.isArray(source.moduleTrace)
        ? source.moduleTrace.map(normalizeModuleTraceEntry)
        : [],
      comparisonVariants: Array.isArray(source.comparisonVariants)
        ? source.comparisonVariants.map(normalizeComparisonVariant)
        : [],
      hypothesisSummary:
        asNonEmptyString(source.hypothesisSummary) ||
        asNonEmptyString(toRecord(normalizeAnalysisScope(source.analysisScope)).hypothesis),
    };
  }

  function normalizeProcessState(rawValue: unknown) {
    const source = toRecord(rawValue);
    const records: Record<string, unknown> = {};

    featureIds.forEach(function (featureId: string) {
      records[featureId] = normalizeFeatureProcessRecord(
        toRecord(toRecord(source.records)[featureId]),
        featureId
      );
    });

    return {
      records: records,
      lastError: asNonEmptyString(source.lastError),
      lastActionAt: asNonEmptyString(source.lastActionAt),
    };
  }

  function createEmptyFeatureReportRecord(featureId: string) {
    return {
      featureId: featureId,
      status: "idle" as string,
      sourceRunId: null as string | null,
      generatedAt: null as string | null,
      summaryCards: [] as unknown[],
      findings: [] as unknown[],
      caveats: [] as string[],
      warnings: [] as string[],
      exports: [] as unknown[],
      error: null as string | null,
      emptyReason: "Rapor henüz üretilmedi." as string | null,
      analysisScope: null as Record<string, unknown> | null,
      liveFindings: [] as unknown[],
      previewArtifacts: [] as unknown[],
      confidence: null as string | null,
      moduleTrace: [] as unknown[],
      comparisonVariants: [] as unknown[],
      hypothesisSummary: null as string | null,
    };
  }

  function createEmptyReportState() {
    const records: Record<string, unknown> = {};
    featureIds.forEach(function (featureId: string) {
      records[featureId] = createEmptyFeatureReportRecord(featureId);
    });
    return {
      records: records,
      lastError: null as string | null,
      lastActionAt: null as string | null,
    };
  }

  function normalizeReportSummaryCard(rawValue: unknown) {
    const source = toRecord(rawValue);
    return {
      id: asNonEmptyString(source.id) || `report-card-${Date.now()}`,
      label: asNonEmptyString(source.label),
      labelKey: asNonEmptyString(source.labelKey),
      value: asNonEmptyString(source.value) || "--",
    };
  }

  function normalizeReportExport(rawValue: unknown) {
    const source = toRecord(rawValue);
    return {
      id: asNonEmptyString(source.id) || `report-export-${Date.now()}`,
      format: asNonEmptyString(source.format) || "md",
      path: asNonEmptyString(source.path),
      fileName: asNonEmptyString(source.fileName),
      createdAt: asNonEmptyString(source.createdAt) || new Date().toISOString(),
      status: asNonEmptyString(source.status) || "ready",
      error: asNonEmptyString(source.error),
    };
  }

  function normalizeFeatureReportRecord(rawValue: unknown, featureId: string) {
    const source = toRecord(rawValue);
    return {
      ...createEmptyFeatureReportRecord(featureId),
      ...source,
      featureId: featureId,
      status: asNonEmptyString(source.status) || "idle",
      sourceRunId: asNonEmptyString(source.sourceRunId),
      generatedAt: asNonEmptyString(source.generatedAt),
      summaryCards: Array.isArray(source.summaryCards)
        ? source.summaryCards.map(normalizeReportSummaryCard)
        : [],
      findings: Array.isArray(source.findings) ? source.findings.map(normalizeProcessFinding) : [],
      caveats: Array.isArray(source.caveats)
        ? source.caveats.map(function (entry: unknown) {
            return String(entry);
          })
        : [],
      warnings: Array.isArray(source.warnings)
        ? source.warnings.map(function (entry: unknown) {
            return String(entry);
          })
        : [],
      exports: Array.isArray(source.exports) ? source.exports.map(normalizeReportExport) : [],
      error: asNonEmptyString(source.error),
      emptyReason: asNonEmptyString(source.emptyReason),
      analysisScope: serializeAnalysisScope(source.analysisScope),
      liveFindings: Array.isArray(source.liveFindings)
        ? source.liveFindings.map(normalizeLiveFinding)
        : [],
      previewArtifacts: Array.isArray(source.previewArtifacts)
        ? source.previewArtifacts.map(normalizeProcessArtifact)
        : [],
      confidence: asNonEmptyString(source.confidence),
      moduleTrace: Array.isArray(source.moduleTrace)
        ? source.moduleTrace.map(normalizeModuleTraceEntry)
        : [],
      comparisonVariants: Array.isArray(source.comparisonVariants)
        ? source.comparisonVariants.map(normalizeComparisonVariant)
        : [],
      hypothesisSummary:
        asNonEmptyString(source.hypothesisSummary) ||
        asNonEmptyString(toRecord(normalizeAnalysisScope(source.analysisScope)).hypothesis),
    };
  }

  function normalizeReportState(rawValue: unknown) {
    const source = toRecord(rawValue);
    const records: Record<string, unknown> = {};

    featureIds.forEach(function (featureId: string) {
      records[featureId] = normalizeFeatureReportRecord(
        toRecord(toRecord(source.records)[featureId]),
        featureId
      );
    });

    return {
      records: records,
      lastError: asNonEmptyString(source.lastError),
      lastActionAt: asNonEmptyString(source.lastActionAt),
    };
  }

  function getFeatureProcessRecord(project: ProcessReportRecord, featureId: string) {
    return normalizeFeatureProcessRecord(
      toRecord(toRecord(toRecord(project).process).records)[featureId],
      featureId
    );
  }

  function setFeatureProcessRecord(
    project: ProcessReportRecord,
    featureId: string,
    record: unknown
  ) {
    const nextProcess = normalizeProcessState(project.process);
    nextProcess.records[featureId] = normalizeFeatureProcessRecord(record, featureId);
    project.process = nextProcess;
    return nextProcess.records[featureId];
  }

  function getFeatureReportRecord(project: ProcessReportRecord, featureId: string) {
    return normalizeFeatureReportRecord(
      toRecord(toRecord(toRecord(project).report).records)[featureId],
      featureId
    );
  }

  function setFeatureReportRecord(
    project: ProcessReportRecord,
    featureId: string,
    record: unknown
  ) {
    const nextReport = normalizeReportState(project.report);
    nextReport.records[featureId] = normalizeFeatureReportRecord(record, featureId);
    project.report = nextReport;
    return nextReport.records[featureId];
  }

  return {
    createEmptyFeatureProcessRecord,
    createEmptyProcessState,
    normalizeProcessArtifact,
    normalizeProcessFinding,
    normalizeProcessModule,
    normalizeFeatureProcessRecord,
    normalizeProcessState,
    createEmptyFeatureReportRecord,
    createEmptyReportState,
    normalizeReportSummaryCard,
    normalizeReportExport,
    normalizeFeatureReportRecord,
    normalizeReportState,
    getFeatureProcessRecord,
    setFeatureProcessRecord,
    getFeatureReportRecord,
    setFeatureReportRecord,
  };
}
