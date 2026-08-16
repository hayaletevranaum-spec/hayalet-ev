import {
  getProjectFeatureProcessDir as getProjectFeatureProcessDirFromPaths,
  getProjectFeatureReportDir as getProjectFeatureReportDirFromPaths,
  getProjectProcessDir as getProjectProcessDirFromPaths,
  getProjectReportDir as getProjectReportDirFromPaths,
} from "./project-paths.js";
import { normalizeAnalysisScope, serializeAnalysisScope } from "../types/analysis-scope.js";
import {
  normalizeLabAnalysisSettingsMap,
  normalizeLabOperationSettingsMap,
} from "../../domain/lab-types.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryRuntimeRecord = LaboratoryRecord & {
  paths: {
    projectsDir: string;
  };
};

type LaboratoryProjectRecord = LaboratoryRecord & {
  slug: string;
};

export const LABORATORY_ROOM_ID = "laboratory";
export const LABORATORY_MEDIA_FEATURE_ID = "media-analysis";
export const LABORATORY_AUDIO_FEATURE_ID = "audio-analysis";
export const LABORATORY_WORKBENCH_EXPERIENCE_ID = "analysis-workbench";
export const LABORATORY_WORKBENCH_MODE = "guided";
export const LABORATORY_WORKBENCH_SCHEMA_VERSION = 1;
export const LABORATORY_FEATURE_IDS = [LABORATORY_MEDIA_FEATURE_ID, LABORATORY_AUDIO_FEATURE_ID];
export const LABORATORY_MEDIA_STAGES = ["source", "edit", "profile", "process", "report"];
export const LABORATORY_FEATURE_NAMESPACES = {
  [LABORATORY_MEDIA_FEATURE_ID]: "mediaAnalysis",
  [LABORATORY_AUDIO_FEATURE_ID]: "audioAnalysis",
};

export function isLaboratoryFeatureId(value: unknown): value is string {
  return typeof value === "string" && LABORATORY_FEATURE_IDS.includes(value);
}

export function normalizeLaboratoryFeatureId(
  value: unknown,
  fallback: string = LABORATORY_MEDIA_FEATURE_ID
): string {
  return isLaboratoryFeatureId(value) ? value : fallback;
}

export function normalizeLaboratoryFeatureIdList(
  value: unknown,
  fallback: string[] = LABORATORY_FEATURE_IDS
): string[] {
  const nextValues = Array.isArray(value)
    ? value.filter((entry): entry is string => isLaboratoryFeatureId(entry))
    : [];
  const uniqueValues = Array.from(new Set(nextValues));
  return uniqueValues.length > 0 ? uniqueValues : fallback.slice();
}

export function createLaboratoryWorkbenchState(overrides: unknown = {}) {
  const source = toLaboratoryRecord(overrides);
  const activeModuleId = normalizeLaboratoryFeatureId(
    source["activeModuleId"] ?? source["featureId"],
    LABORATORY_MEDIA_FEATURE_ID
  );
  const primaryFeatureId = normalizeLaboratoryFeatureId(
    source["primaryFeatureId"],
    LABORATORY_MEDIA_FEATURE_ID
  );
  const availableModuleIds = normalizeLaboratoryFeatureIdList(
    source["availableModuleIds"] ?? source["availableFeatureIds"],
    LABORATORY_FEATURE_IDS
  );
  const selectedModuleIds = normalizeLaboratoryFeatureIdList(
    source["selectedModuleIds"] ?? source["selectedFeatureIds"],
    [activeModuleId]
  ).filter(function (featureId) {
    return availableModuleIds.includes(featureId);
  });
  const analysisScope = serializeAnalysisScope(normalizeAnalysisScope(source["analysisScope"]));

  return {
    schemaVersion: LABORATORY_WORKBENCH_SCHEMA_VERSION,
    experienceId: readNonEmptyString(source["experienceId"]) || LABORATORY_WORKBENCH_EXPERIENCE_ID,
    mode: LABORATORY_WORKBENCH_MODE,
    primaryFeatureId,
    activeModuleId: availableModuleIds.includes(activeModuleId) ? activeModuleId : primaryFeatureId,
    availableModuleIds,
    selectedModuleIds:
      selectedModuleIds.length > 0
        ? selectedModuleIds
        : [availableModuleIds.includes(activeModuleId) ? activeModuleId : primaryFeatureId],
    analysisScope,
    operationSettings: normalizeLabOperationSettingsMap(source["operationSettings"]),
    analysisSettings: normalizeLabAnalysisSettingsMap(source["analysisSettings"]),
    moduleToggles: toLaboratoryRecord(source["moduleToggles"]),
    workspaceTargetAssetId: readNonEmptyString(source["workspaceTargetAssetId"]),
    comparisonReferenceAssetId: readNonEmptyString(source["comparisonReferenceAssetId"]),
    activePreviewArtifactId: readNonEmptyString(source["activePreviewArtifactId"]),
    activeLiveFindingsStreamId: readNonEmptyString(source["activeLiveFindingsStreamId"]),
    controlsCollapsed: source["controlsCollapsed"] !== false,
    sourceActivationResetAt: readNonEmptyString(source["sourceActivationResetAt"]),
  };
}

export function resetLaboratoryWorkbenchForSourceActivation(workbenchSource: unknown = {}) {
  const source = toLaboratoryRecord(workbenchSource);
  const sourceActivationResetAt = new Date().toISOString();
  return {
    ...source,
    ...createLaboratoryWorkbenchState({
      ...source,
      activeLiveFindingsStreamId: null,
      activePreviewArtifactId: null,
      analysisScope: null,
      analysisSettings: {},
      controlsCollapsed: true,
      moduleToggles: {},
      operationSettings: {},
      sourceActivationResetAt,
    }),
    sourceActivationResetAt,
  };
}

export function getLaboratoryProjectProcessDir(
  runtime: LaboratoryRuntimeRecord,
  project: LaboratoryProjectRecord
) {
  return getProjectProcessDirFromPaths(runtime, project);
}

export function getLaboratoryProjectReportDir(
  runtime: LaboratoryRuntimeRecord,
  project: LaboratoryProjectRecord
) {
  return getProjectReportDirFromPaths(runtime, project);
}

export function getLaboratoryFeatureProcessDir(
  runtime: LaboratoryRuntimeRecord,
  project: LaboratoryProjectRecord,
  featureId: string
) {
  return getProjectFeatureProcessDirFromPaths(runtime, project, featureId);
}

export function getLaboratoryFeatureReportDir(
  runtime: LaboratoryRuntimeRecord,
  project: LaboratoryProjectRecord,
  featureId: string
) {
  return getProjectFeatureReportDirFromPaths(runtime, project, featureId);
}

export function toLaboratoryRecord(value: unknown): LaboratoryRecord {
  if (value !== null && typeof value === "object" && Array.isArray(value) === false) {
    return value as LaboratoryRecord;
  }
  return {};
}

export function cloneLaboratoryValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function normalizeLaboratoryLocale(value: unknown): "tr" | "en" {
  return typeof value === "string" && value.toLowerCase().startsWith("tr") ? "tr" : "en";
}
