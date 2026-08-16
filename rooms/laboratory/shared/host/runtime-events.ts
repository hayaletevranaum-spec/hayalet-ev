import { resetLaboratoryWorkbenchForSourceActivation } from "./runtime-primitives.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryRuntimeEventsApi = {
  notifyRoom: (type: string, payload: LaboratoryRecord) => void;
};

type LaboratoryRuntimeEventsDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  defaultFeatureId: string;
  getFeatureIdFromContext: (context: unknown) => string;
  loadContext: (api: LaboratoryRuntimeEventsApi) => unknown;
  roomSnapshotRuntime: {
    buildMediaSnapshot: (runtime: unknown, featureId: string, workbenchSource?: unknown) => unknown;
  };
};

type LaboratoryThrottleEntry = {
  lastEmittedAt: number;
  suppressedCount: number;
};

function getEventSeverity(stage: string | null) {
  if (stage === "failed") {
    return "error";
  }
  if (stage === "cancelled") {
    return "warning";
  }
  if (stage === "completed") {
    return "success";
  }
  return "info";
}

function isCustomProcessEventKind(kind: string | null) {
  return (
    kind === "analysis-scope-updated" ||
    kind === "live-finding" ||
    kind === "preview-artifact" ||
    kind === "module-progress" ||
    kind === "module-warning" ||
    kind === "module-artifact" ||
    kind === "interactive-adjustment-applied"
  );
}

function isTerminalProcessStage(stage: string | null) {
  return stage === "completed" || stage === "failed" || stage === "cancelled";
}

function getActionLabel(action: string | null) {
  switch (action) {
    case null:
      return "İşlem";
    case "source-download-url":
      return "URL kaynağı indiriliyor";
    case "source-download-youtube":
      return "YouTube kaynağı hazırlanıyor";
    case "source-pick-local":
      return "Yerel kaynak içeri alınıyor";
    case "project-import-check-url":
      return "URL kontrol ediliyor";
    case "edit-preview":
      return "Önizleme hazırlanıyor";
    case "profile-run-preflight":
      return "Ön kontrol çalışıyor";
    case "process-run":
    case "audio-process-run":
      return "Analiz çalışıyor";
    case "process-cancel":
    case "audio-process-cancel":
      return "Analiz iptal ediliyor";
    case "report-export":
    case "audio-report-export":
      return "Rapor dışa aktarılıyor";
    case "tool-install":
      return "Araç kurulumu çalışıyor";
    case "tool-update":
      return "Araç güncellemesi çalışıyor";
    case "tool-check-updates":
      return "Araç güncellemesi kontrol ediliyor";
    case "tool-check-all-updates":
      return "Araç güncellemeleri kontrol ediliyor";
    case "tool-update-selected":
      return "Seçili araç güncellemeleri çalışıyor";
    default:
      return action || "İşlem";
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(function (entry) {
      return typeof entry === "string" && entry.trim() !== "" ? entry.trim() : null;
    })
    .filter((entry): entry is string => entry !== null);
}

export function createLaboratoryRuntimeEvents(deps: LaboratoryRuntimeEventsDeps) {
  const {
    asNonEmptyString,
    defaultFeatureId,
    getFeatureIdFromContext,
    loadContext,
    roomSnapshotRuntime,
  } = deps;
  const throttleState = new Map<string, LaboratoryThrottleEntry>();
  const throttleWindowMs = 500;

  function toRecord(value: unknown): LaboratoryRecord {
    return value !== null && typeof value === "object" && Array.isArray(value) === false
      ? (value as LaboratoryRecord)
      : {};
  }

  function buildMediaSnapshot(runtime: unknown, featureId: string, workbenchSource: unknown = {}) {
    return roomSnapshotRuntime.buildMediaSnapshot(runtime, featureId, workbenchSource);
  }

  function buildSourceSnapshot(runtime: unknown) {
    return roomSnapshotRuntime.buildMediaSnapshot(runtime, defaultFeatureId);
  }

  function isSourceActivationAction(action: unknown) {
    const actionId = asNonEmptyString(action);
    return (
      actionId === "source-download-url" ||
      actionId === "source-download-youtube" ||
      actionId === "source-pick-local" ||
      actionId === "source-set-kind" ||
      actionId === "source-set-mode"
    );
  }

  function notifyRoom(
    api: LaboratoryRuntimeEventsApi,
    type: string,
    payload: LaboratoryRecord | null | undefined
  ) {
    api.notifyRoom(type, payload ?? {});
  }

  function buildThrottleKey(api: LaboratoryRuntimeEventsApi, payload: LaboratoryRecord) {
    const throttleWindow = asNonEmptyString(payload["throttleWindow"]);
    const kind = asNonEmptyString(payload["kind"]);
    if (throttleWindow === null || kind === null || isCustomProcessEventKind(kind) !== true) {
      return null;
    }
    const featureId = getFeatureIdFromContext(loadContext(api));
    const moduleId = asNonEmptyString(payload["moduleId"]) || "global";
    return `${featureId}:${kind}:${moduleId}:${throttleWindow}`;
  }

  function applyThrottleMetadata(
    api: LaboratoryRuntimeEventsApi,
    payload: LaboratoryRecord
  ): LaboratoryRecord | null {
    const throttleKey = buildThrottleKey(api, payload);
    if (throttleKey === null) {
      return payload;
    }
    const nextTimestamp =
      typeof payload["timestamp"] === "number" ? payload["timestamp"] : Date.now();
    const currentEntry = throttleState.get(throttleKey) || {
      lastEmittedAt: 0,
      suppressedCount: 0,
    };
    const terminalStage = isTerminalProcessStage(asNonEmptyString(payload["stage"]));
    if (
      terminalStage !== true &&
      currentEntry.lastEmittedAt > 0 &&
      nextTimestamp - currentEntry.lastEmittedAt < throttleWindowMs
    ) {
      throttleState.set(throttleKey, {
        lastEmittedAt: currentEntry.lastEmittedAt,
        suppressedCount: currentEntry.suppressedCount + 1,
      });
      return null;
    }
    const batchedCount = currentEntry.suppressedCount + 1;
    throttleState.set(throttleKey, {
      lastEmittedAt: nextTimestamp,
      suppressedCount: 0,
    });
    if (batchedCount <= 1) {
      return payload;
    }
    const detail = asNonEmptyString(payload["detail"]);
    return {
      ...payload,
      batchedCount,
      detail:
        detail !== null
          ? `${detail} (${batchedCount} updates batched)`
          : `${batchedCount} updates batched.`,
    };
  }

  function emitEvent(api: LaboratoryRuntimeEventsApi, payload: LaboratoryRecord) {
    const throttledPayload = applyThrottleMetadata(api, payload);
    if (throttledPayload === null) {
      return;
    }
    const resultAssetIds = Array.from(new Set(toStringArray(throttledPayload["resultAssetIds"])));
    const result = toRecord(throttledPayload["result"]);
    notifyRoom(api, "lab-event", {
      ...throttledPayload,
      id:
        typeof throttledPayload["id"] === "string"
          ? throttledPayload["id"]
          : `lab-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: typeof throttledPayload["kind"] === "string" ? throttledPayload["kind"] : "activity",
      severity:
        typeof throttledPayload["severity"] === "string"
          ? throttledPayload["severity"]
          : getEventSeverity(asNonEmptyString(throttledPayload["stage"])),
      message:
        typeof throttledPayload["message"] === "string"
          ? throttledPayload["message"]
          : getActionLabel(asNonEmptyString(throttledPayload["action"])),
      detail: typeof throttledPayload["detail"] === "string" ? throttledPayload["detail"] : null,
      bytesReceived:
        typeof throttledPayload["bytesReceived"] === "number"
          ? throttledPayload["bytesReceived"]
          : null,
      bytesTotal:
        typeof throttledPayload["bytesTotal"] === "number" ? throttledPayload["bytesTotal"] : null,
      percent: typeof throttledPayload["percent"] === "number" ? throttledPayload["percent"] : null,
      timestamp:
        typeof throttledPayload["timestamp"] === "number"
          ? throttledPayload["timestamp"]
          : Date.now(),
      source: typeof throttledPayload["source"] === "string" ? throttledPayload["source"] : "host",
      action: asNonEmptyString(throttledPayload["action"]),
      stage: asNonEmptyString(throttledPayload["stage"]),
      scope:
        throttledPayload["scope"] === "run" ||
        String(asNonEmptyString(throttledPayload["action"]) || "").includes("process")
          ? "run"
          : "global",
      moduleId: asNonEmptyString(throttledPayload["moduleId"]),
      rawLine: typeof throttledPayload["rawLine"] === "string" ? throttledPayload["rawLine"] : null,
      ...(Object.keys(result).length > 0 ? { result } : {}),
      ...(resultAssetIds.length > 0 ? { resultAssetIds } : {}),
    });
  }

  function buildJobEventPayload(payload: LaboratoryRecord) {
    const action = asNonEmptyString(payload["action"]);
    const stage = asNonEmptyString(payload["stage"]);
    const detail = asNonEmptyString(payload["message"]);
    const kind = asNonEmptyString(payload["kind"]);
    const requestId = asNonEmptyString(payload["requestId"]);
    const jobId = asNonEmptyString(payload["jobId"]);
    const projectId = asNonEmptyString(payload["projectId"]);
    const bytesReceived =
      typeof payload["bytesReceived"] === "number" ? payload["bytesReceived"] : null;
    const bytesTotal = typeof payload["bytesTotal"] === "number" ? payload["bytesTotal"] : null;
    const percent = typeof payload["percent"] === "number" ? payload["percent"] : null;
    const phaseLabel = asNonEmptyString(payload["phaseLabel"]);
    const phasePercent =
      typeof payload["phasePercent"] === "number" ? payload["phasePercent"] : null;
    const phaseIndex = typeof payload["phaseIndex"] === "number" ? payload["phaseIndex"] : null;
    const phaseCount = typeof payload["phaseCount"] === "number" ? payload["phaseCount"] : null;
    const resultAssetIds = Array.from(new Set(toStringArray(payload["resultAssetIds"])));
    if (isCustomProcessEventKind(kind)) {
      return {
        ...payload,
        kind,
        severity:
          typeof payload["severity"] === "string" ? payload["severity"] : getEventSeverity(stage),
        message:
          typeof payload["message"] === "string" ? payload["message"] : getActionLabel(action),
        detail: asNonEmptyString(payload["detail"]) || detail,
        action,
        stage,
        moduleId: asNonEmptyString(payload["moduleId"]),
        requestId,
        jobId,
        projectId,
        bytesReceived,
        bytesTotal,
        percent,
        phaseLabel,
        phasePercent,
        phaseIndex,
        phaseCount,
        ...(resultAssetIds.length > 0 ? { resultAssetIds } : {}),
        scope: String(action || "").includes("process") ? "run" : "global",
      };
    }
    const baseLabel = getActionLabel(action);
    return {
      kind: payload["kind"],
      severity: getEventSeverity(stage),
      message:
        stage === "queued"
          ? `${baseLabel} kuyruğa alındı`
          : stage === "completed"
            ? `${baseLabel} tamamlandı`
            : stage === "failed"
              ? `${baseLabel} hata verdi`
              : stage === "cancelled"
                ? `${baseLabel} iptal edildi`
                : `${baseLabel} başladı`,
      detail,
      action,
      stage,
      moduleId: asNonEmptyString(payload["moduleId"]),
      requestId,
      jobId,
      projectId,
      bytesReceived,
      bytesTotal,
      percent,
      phaseLabel,
      phasePercent,
      phaseIndex,
      phaseCount,
      ...(resultAssetIds.length > 0 ? { resultAssetIds } : {}),
      scope: String(action || "").includes("process") ? "run" : "global",
    };
  }

  function buildActionResultEventPayload(payload: LaboratoryRecord) {
    const action = asNonEmptyString(payload["action"]);
    const success = payload["success"] === true;
    const cancelled = payload["cancelled"] === true;
    const resultAssetIds = Array.from(new Set(toStringArray(payload["resultAssetIds"])));
    const result = toRecord(payload["result"]);
    return {
      kind: "request-result",
      severity: cancelled ? "warning" : success ? "success" : "error",
      message: cancelled
        ? `${getActionLabel(action)} iptal edildi`
        : success
          ? `${getActionLabel(action)} tamamlandı`
          : `${getActionLabel(action)} hata verdi`,
      detail: asNonEmptyString(payload["error"]) || asNonEmptyString(payload["message"]),
      action,
      stage: cancelled ? "cancelled" : success ? "completed" : "failed",
      requestId: asNonEmptyString(payload["requestId"]),
      jobId: asNonEmptyString(payload["jobId"]),
      projectId: asNonEmptyString(payload["projectId"]),
      ...(Object.keys(result).length > 0 ? { result } : {}),
      ...(resultAssetIds.length > 0 ? { resultAssetIds } : {}),
      scope: String(action || "").includes("process") ? "run" : "global",
    };
  }

  function isSourceCompatibleAction(action: unknown) {
    const actionId = asNonEmptyString(action);
    if (actionId === null) {
      return true;
    }
    return (
      actionId === "refresh" ||
      actionId === "tools-refresh" ||
      actionId.startsWith("source-") ||
      actionId.startsWith("project-") ||
      actionId.startsWith("tool-")
    );
  }

  function pushMediaState(
    api: LaboratoryRuntimeEventsApi,
    runtime: unknown,
    requestId: string | null | undefined,
    action: unknown
  ) {
    const context = loadContext(api);
    const contextRecord = toRecord(context);
    const featureId = getFeatureIdFromContext(context);
    const workbenchSource =
      isSourceActivationAction(action) === true
        ? resetLaboratoryWorkbenchForSourceActivation(contextRecord["workbench"])
        : contextRecord["workbench"];
    const payload = {
      requestId: requestId ?? null,
      action: asNonEmptyString(action),
      snapshot: buildMediaSnapshot(runtime, featureId, workbenchSource),
    };

    notifyRoom(api, "media-state", payload);
    if (isSourceCompatibleAction(action)) {
      notifyRoom(api, "source-state", payload);
    }
  }

  function pushSourceState(
    api: LaboratoryRuntimeEventsApi,
    runtime: unknown,
    requestId: string | null | undefined,
    action: unknown
  ) {
    pushMediaState(api, runtime, requestId, action);
  }

  function pushActionResult(api: LaboratoryRuntimeEventsApi, payload: LaboratoryRecord) {
    emitEvent(api, buildActionResultEventPayload(payload));
  }

  function pushJobState(api: LaboratoryRuntimeEventsApi, payload: LaboratoryRecord) {
    if (payload["suppressCanonicalEvent"] !== true) {
      emitEvent(api, buildJobEventPayload(payload));
    }
  }

  return {
    buildMediaSnapshot,
    buildSourceSnapshot,
    emitEvent,
    isSourceCompatibleAction,
    notifyRoom,
    pushActionResult,
    pushJobState,
    pushMediaState,
    pushSourceState,
  };
}
