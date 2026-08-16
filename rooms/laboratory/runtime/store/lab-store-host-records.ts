import {
  asLabRecord,
  asNonEmptyString,
  asNumber,
  asStringArray,
  clampPercent,
  createLabEventId,
  normalizeFindingKind,
  toTimestamp,
} from "../../domain/lab-types.js";
import type {
  LabAiReport,
  LabArtifactProjection,
  LabComparisonVariant,
  LabEventFeedItem,
  LabEventSeverity,
  LabFindingProjection,
  LabLiveFindingProjection,
  LabModuleState,
  LabModuleTraceEntry,
  LabPreviewArtifactProjection,
  LabRun,
  LabUserReport,
} from "../../domain/lab-types.js";
import {
  normalizeAnalysisReference,
  normalizeAnalysisScope,
} from "../../shared/types/analysis-scope.js";

export function toEventFeedItem(
  value: unknown,
  fallbackScope: LabEventFeedItem["scope"]
): LabEventFeedItem | null {
  const record = asLabRecord(value);
  const message = asNonEmptyString(record["message"]);
  if (message === null) {
    return null;
  }

  const source = asNonEmptyString(record["source"]);
  const severity = asNonEmptyString(record["severity"]);
  const resultAssetIds = asStringArray(record["resultAssetIds"]);
  return {
    id: asNonEmptyString(record["id"]) || createLabEventId("event"),
    kind: asNonEmptyString(record["kind"]) || "activity",
    severity:
      severity === "success" || severity === "warning" || severity === "error" ? severity : "info",
    message,
    detail: asNonEmptyString(record["detail"]),
    percent: clampPercent(record["percent"]),
    bytesReceived: asNumber(record["bytesReceived"]),
    bytesTotal: asNumber(record["bytesTotal"]),
    timestamp: toTimestamp(record["timestamp"]),
    source: source === "ui" || source === "system" ? source : "host",
    action: asNonEmptyString(record["action"]),
    stage: asNonEmptyString(record["stage"]),
    scope:
      asNonEmptyString(record["scope"]) === "run"
        ? "run"
        : asNonEmptyString(record["scope"]) === "global"
          ? "global"
          : fallbackScope,
    moduleId: asNonEmptyString(record["moduleId"]),
    rawLine: asNonEmptyString(record["rawLine"]),
    analysisScope: normalizeAnalysisScope(record["analysisScope"]),
    finding: asLabRecord(record["finding"]),
    artifact: asLabRecord(record["artifact"]),
    moduleTrace: asLabRecord(record["moduleTrace"]),
    comparisonVariant: asLabRecord(record["comparisonVariant"]),
    batchedCount: asNumber(record["batchedCount"]),
    requestId: asNonEmptyString(record["requestId"]),
    jobId: asNonEmptyString(record["jobId"]),
    projectId: asNonEmptyString(record["projectId"]),
    result: asLabRecord(record["result"]),
    throttleWindow: asNonEmptyString(record["throttleWindow"]),
    ...(resultAssetIds.length > 0 ? { resultAssetIds: Array.from(new Set(resultAssetIds)) } : {}),
  };
}

export function normalizeUserActionResultAssetIds(value: unknown): string[] | undefined {
  const resultAssetIds = asStringArray(value);
  return resultAssetIds.length > 0 ? Array.from(new Set(resultAssetIds)) : undefined;
}

function toArtifactProjection(value: unknown): LabArtifactProjection | null {
  const record = asLabRecord(value);
  const id = asNonEmptyString(record["id"]);
  if (id === null) {
    return null;
  }

  return {
    id,
    moduleId: asNonEmptyString(record["moduleId"]),
    kind: asNonEmptyString(record["kind"]) || "artifact",
    label: asNonEmptyString(record["label"]),
    path: asNonEmptyString(record["path"]),
    fileName: asNonEmptyString(record["fileName"]),
    previewUrl: asNonEmptyString(record["previewUrl"]) || asNonEmptyString(record["fileUrl"]),
    createdAt: asNonEmptyString(record["createdAt"]),
    status: asNonEmptyString(record["status"]) || "ready",
    variantId: asNonEmptyString(record["variantId"]),
    active: record["active"] !== false,
    reference: normalizeAnalysisReference(record["reference"] ?? record),
    metadata: asLabRecord(record["metadata"]),
  };
}

function toFindingProjection(value: unknown): LabFindingProjection | null {
  const record = asLabRecord(value);
  const id = asNonEmptyString(record["id"]);
  if (id === null) {
    return null;
  }
  const severity: LabEventSeverity =
    asNonEmptyString(record["severity"]) === "success" ||
    asNonEmptyString(record["severity"]) === "warning" ||
    asNonEmptyString(record["severity"]) === "error"
      ? (asNonEmptyString(record["severity"]) as LabEventSeverity)
      : "info";

  return {
    id,
    moduleId: asNonEmptyString(record["moduleId"]),
    code: asNonEmptyString(record["code"]),
    title: asNonEmptyString(record["title"]) || "Bulgu",
    detail: asNonEmptyString(record["detail"]) || "",
    level: asNonEmptyString(record["level"]) || "low",
    severity,
    confidence: asNonEmptyString(record["confidence"]) || "low",
    kind: normalizeFindingKind(record["kind"]),
    evidenceCount: Math.max(0, Math.round(asNumber(record["evidenceCount"]) || 0)),
    artifactIds: asStringArray(record["artifactIds"]),
    sourceModule: asNonEmptyString(record["sourceModule"]) || asNonEmptyString(record["moduleId"]),
    reference: normalizeAnalysisReference(record["reference"] ?? record),
    hypothesis: asNonEmptyString(record["hypothesis"]),
    metadata: asLabRecord(record["metadata"]),
  };
}

export function toPreviewArtifactProjection(value: unknown): LabPreviewArtifactProjection | null {
  const baseArtifact = toArtifactProjection(value);
  if (!baseArtifact) {
    return null;
  }

  return {
    ...baseArtifact,
    status: baseArtifact.status || "ready",
    variantId: baseArtifact.variantId || null,
    active: baseArtifact.active !== false,
    reference: baseArtifact.reference || null,
    metadata: baseArtifact.metadata || {},
  };
}

export function toLiveFindingProjection(value: unknown): LabLiveFindingProjection | null {
  const baseFinding = toFindingProjection(value);
  if (!baseFinding) {
    return null;
  }

  return {
    ...baseFinding,
    emittedAt: toTimestamp(asLabRecord(value)["emittedAt"]),
    windowKey: asNonEmptyString(asLabRecord(value)["windowKey"]),
    streamId: asNonEmptyString(asLabRecord(value)["streamId"]),
  };
}

export function toModuleTraceEntry(value: unknown): LabModuleTraceEntry | null {
  const record = asLabRecord(value);
  const id = asNonEmptyString(record["id"]);
  if (id === null) {
    return null;
  }

  return {
    id,
    moduleId: asNonEmptyString(record["moduleId"]),
    stage: asNonEmptyString(record["stage"]) || "process",
    status: asNonEmptyString(record["status"]) || "idle",
    timestamp: asNonEmptyString(record["timestamp"]) || new Date().toISOString(),
    message: asNonEmptyString(record["message"]),
    detail: asNonEmptyString(record["detail"]),
    eventId: asNonEmptyString(record["eventId"]),
  };
}

export function toComparisonVariant(value: unknown): LabComparisonVariant | null {
  const record = asLabRecord(value);
  const id = asNonEmptyString(record["id"]);
  if (id === null) {
    return null;
  }

  const artifactIds = asStringArray(record["artifactIds"]);
  const artifactId = asNonEmptyString(record["artifactId"]);

  return {
    id,
    kind: asNonEmptyString(record["kind"]) || "variant",
    label: asNonEmptyString(record["label"]) || "Variant",
    status: asNonEmptyString(record["status"]) || "ready",
    summary: asNonEmptyString(record["summary"]),
    artifactIds: artifactIds.length > 0 ? artifactIds : artifactId ? [artifactId] : [],
    artifactId,
    artifactPath: asNonEmptyString(record["artifactPath"]),
    sourceModule: asNonEmptyString(record["sourceModule"]),
    active: record["active"] !== false,
  };
}

function toModuleState(value: unknown): LabModuleState | null {
  const record = asLabRecord(value);
  const id = asNonEmptyString(record["id"]);
  if (id === null) {
    return null;
  }

  return {
    id,
    status: (asNonEmptyString(record["status"]) || "idle") as LabModuleState["status"],
    startedAt: asNonEmptyString(record["startedAt"]),
    endedAt: asNonEmptyString(record["completedAt"]),
    progress: clampPercent(record["percent"]),
    progressMode:
      clampPercent(record["percent"]) !== null ||
      asNonEmptyString(record["progressMode"]) === "measured"
        ? "measured"
        : "none",
    message: asNonEmptyString(record["message"]),
    title: asNonEmptyString(record["title"]) || asNonEmptyString(record["label"]),
    summary: asNonEmptyString(record["summary"]),
    findingIds: asStringArray(record["findingIds"]),
    artifactIds: asStringArray(record["artifactIds"]),
    metadata: asLabRecord(record["metadata"]),
  };
}

export function toRunFromProcessRecord(processRecord: Record<string, unknown>): LabRun | null {
  const runId = asNonEmptyString(processRecord["runId"]);
  if (runId === null) {
    return null;
  }

  const modules = Array.isArray(processRecord["modules"])
    ? (processRecord["modules"] as unknown[])
    : [];
  const moduleMap: Record<string, LabModuleState> = {};
  const moduleOrder: string[] = [];

  modules.forEach(function (entry) {
    const nextModule = toModuleState(entry);
    if (!nextModule) {
      return;
    }
    moduleMap[nextModule.id] = nextModule;
    moduleOrder.push(nextModule.id);
  });

  const findings = (Array.isArray(processRecord["findings"]) ? processRecord["findings"] : [])
    .map(toFindingProjection)
    .filter((entry): entry is LabFindingProjection => entry !== null);
  const artifacts = (Array.isArray(processRecord["artifacts"]) ? processRecord["artifacts"] : [])
    .map(toArtifactProjection)
    .filter((entry): entry is LabArtifactProjection => entry !== null);
  const liveFindings = (
    Array.isArray(processRecord["liveFindings"]) ? processRecord["liveFindings"] : []
  )
    .map(toLiveFindingProjection)
    .filter((entry): entry is LabLiveFindingProjection => entry !== null);
  const previewArtifacts = (
    Array.isArray(processRecord["previewArtifacts"]) ? processRecord["previewArtifacts"] : []
  )
    .map(toPreviewArtifactProjection)
    .filter((entry): entry is LabPreviewArtifactProjection => entry !== null);
  const moduleTrace = (
    Array.isArray(processRecord["moduleTrace"]) ? processRecord["moduleTrace"] : []
  )
    .map(toModuleTraceEntry)
    .filter((entry): entry is LabModuleTraceEntry => entry !== null);
  const comparisonVariants = (
    Array.isArray(processRecord["comparisonVariants"]) ? processRecord["comparisonVariants"] : []
  )
    .map(toComparisonVariant)
    .filter((entry): entry is LabComparisonVariant => entry !== null);
  const endedAt = asNonEmptyString(processRecord["completedAt"]);
  const events = (Array.isArray(processRecord["events"]) ? processRecord["events"] : [])
    .map(function (entry) {
      return toEventFeedItem(entry, "run");
    })
    .filter((entry): entry is LabEventFeedItem => entry !== null && entry.kind !== "raw-log");
  const rawLog = (Array.isArray(processRecord["rawLog"]) ? processRecord["rawLog"] : [])
    .map(function (entry) {
      return toEventFeedItem(entry, "run");
    })
    .filter((entry): entry is LabEventFeedItem => entry !== null);

  return {
    id: runId,
    state: (asNonEmptyString(processRecord["status"]) || "idle") as LabRun["state"],
    startedAt: toTimestamp(processRecord["startedAt"]),
    ...(endedAt ? { endedAt: toTimestamp(endedAt) } : {}),
    requestId: asNonEmptyString(processRecord["requestId"]),
    jobId: asNonEmptyString(processRecord["jobId"]),
    projectId: asNonEmptyString(processRecord["projectId"]),
    modules: moduleMap,
    moduleOrder,
    events,
    rawLog,
    artifacts,
    findings,
    warnings: asStringArray(processRecord["warnings"]),
    error: asNonEmptyString(processRecord["error"]),
    targetLabel: asNonEmptyString(asLabRecord(processRecord["targetSummary"])["label"]),
    progress: clampPercent(processRecord["percent"]),
    analysisScope: normalizeAnalysisScope(processRecord["analysisScope"]),
    liveFindings,
    previewArtifacts,
    confidence: asNonEmptyString(processRecord["confidence"]),
    moduleTrace,
    comparisonVariants,
    hypothesisSummary:
      asNonEmptyString(processRecord["hypothesisSummary"]) ||
      asNonEmptyString(
        asLabRecord(normalizeAnalysisScope(processRecord["analysisScope"]))["hypothesis"]
      ),
    emptyReason:
      asNonEmptyString(processRecord["emptyReason"]) ||
      (findings.length === 0 &&
      artifacts.length === 0 &&
      asNonEmptyString(processRecord["status"]) === "ready"
        ? "Çalışma tamamlandı ancak raporlanabilir bulgu veya artefakt oluşmadı."
        : null),
  };
}

export function toReportsFromRecord(reportRecord: Record<string, unknown>) {
  const userRecord = asLabRecord(reportRecord["userReport"]);
  const aiRecord = asLabRecord(reportRecord["aiReport"]);

  return {
    user:
      asNonEmptyString(userRecord["summary"]) !== null
        ? (userRecord as unknown as LabUserReport)
        : null,
    ai: aiRecord["manifest"] !== undefined ? (aiRecord as unknown as LabAiReport) : null,
    emptyReason:
      asNonEmptyString(reportRecord["emptyReason"]) ||
      (asNonEmptyString(reportRecord["status"]) === "ready"
        ? "Rapor hazır ancak okunabilir içerik üretilemedi."
        : "Rapor henüz üretilmedi."),
  };
}
