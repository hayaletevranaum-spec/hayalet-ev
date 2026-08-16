import { createLaboratoryWorkbenchState } from "./runtime-primitives.js";
import { findLabAssetById } from "./lab-assets.js";
import {
  getLabPathExtension,
  getLabSourceKindForExtension,
  inferLabAssetSourceKind,
} from "../lab-asset-kind.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryProjectRecord = LaboratoryRecord & {
  edit?: unknown;
  name?: unknown;
  profile?: unknown;
  source?: unknown;
  workbench?: unknown;
};

type LaboratoryProjectProfileRecord = LaboratoryRecord & {
  readiness?: unknown;
};

type LaboratoryProjectSourceRecord = LaboratoryRecord & {
  kind?: unknown;
};

type LaboratoryProjectEditRecord = LaboratoryRecord & {
  handoffMode?: unknown;
};

type LaboratoryProfileReadinessRecord = LaboratoryRecord & {
  enabledLaneIds?: unknown;
};

type LaboratoryProcessTargetRecord = LaboratoryRecord & {
  path?: unknown;
};

type LaboratoryProcessModuleRecord = LaboratoryRecord & {
  id?: unknown;
  status?: unknown;
};

type LaboratoryProfileModelSummaryEntry = LaboratoryRecord & {
  ready?: unknown;
  selected?: unknown;
};

type LaboratoryProcessSpeechAvailability = {
  model: LaboratoryProfileModelSummaryEntry | null;
  ready: boolean;
};

type LaboratoryProcessTargetingRuntimeDeps = {
  audioFeatureId: string;
  asNonEmptyString: (value: unknown) => string | null;
  buildProfileModelSummary: (
    runtime: LaboratoryRecord,
    project: LaboratoryProjectRecord
  ) => unknown[];
  getVisualAnalysisCapabilityState: (
    runtime: LaboratoryRecord,
    sourceKind: string | null
  ) => LaboratoryRecord;
  getVisualAnalysisModulesForRuntime: (
    runtime: LaboratoryRecord,
    sourceKind?: string | null
  ) => LaboratoryRecord[];
  getVisualAnalysisProviderState: (runtime: LaboratoryRecord) => LaboratoryRecord;
  normalizeProcessModule: (rawValue: unknown) => LaboratoryProcessModuleRecord;
  partitionVisualAnalysisModuleIds: (
    runtime: LaboratoryRecord,
    moduleIds: string[]
  ) => LaboratoryRecord;
  resolveAudioFeatureTarget: (project: LaboratoryProjectRecord) => LaboratoryProcessTargetRecord;
  resolveEnabledVisualAnalysisModuleIds: (
    runtime: LaboratoryRecord,
    project: LaboratoryProjectRecord,
    sourceKind: string | null,
    workbenchSource?: unknown
  ) => string[];
  resolveProfileTarget: (project: LaboratoryProjectRecord) => LaboratoryProcessTargetRecord;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createLaboratoryProcessTargetingRuntime(
  deps: LaboratoryProcessTargetingRuntimeDeps
) {
  const {
    audioFeatureId,
    asNonEmptyString,
    buildProfileModelSummary,
    getVisualAnalysisCapabilityState,
    getVisualAnalysisModulesForRuntime,
    getVisualAnalysisProviderState,
    normalizeProcessModule,
    partitionVisualAnalysisModuleIds,
    resolveAudioFeatureTarget,
    resolveEnabledVisualAnalysisModuleIds,
    resolveProfileTarget,
    toRecord,
  } = deps;

  function toProfileRecord(value: unknown): LaboratoryProjectProfileRecord {
    return toRecord(value);
  }

  function toSourceRecord(value: unknown): LaboratoryProjectSourceRecord {
    return toRecord(value);
  }

  function toEditRecord(value: unknown): LaboratoryProjectEditRecord {
    return toRecord(value);
  }

  function toReadinessRecord(value: unknown): LaboratoryProfileReadinessRecord {
    return toRecord(value);
  }

  function toProcessTargetRecord(value: unknown): LaboratoryProcessTargetRecord {
    return toRecord(value);
  }

  function toWorkbenchRecord(value: unknown): LaboratoryRecord {
    return toRecord(value);
  }

  function toModelSummaryEntry(value: unknown): LaboratoryProfileModelSummaryEntry {
    return toRecord(value);
  }

  function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map(function (entry) {
        return asNonEmptyString(entry);
      })
      .filter((entry): entry is string => entry !== null);
  }

  function normalizeSourceKind(value: unknown): "video" | "audio" | "image" | null {
    const sourceKind = asNonEmptyString(value);
    return sourceKind === "video" || sourceKind === "audio" || sourceKind === "image"
      ? sourceKind
      : null;
  }

  function getPathLeaf(path: string | null) {
    if (path === null) {
      return null;
    }
    return path.split(/[\\/]/).pop() || path;
  }

  function getTargetPath(target: LaboratoryRecord): string | null {
    return (
      asNonEmptyString(target["localPath"]) ||
      asNonEmptyString(target["path"]) ||
      asNonEmptyString(target["url"]) ||
      asNonEmptyString(target["fileName"]) ||
      asNonEmptyString(target["name"])
    );
  }

  function getRecordTargetSourceKind(target: LaboratoryRecord): "video" | "audio" | "image" | null {
    const metadata = toRecord(target["metadata"]);
    const metadataKind =
      normalizeSourceKind(metadata["kind"]) || normalizeSourceKind(metadata["sourceKind"]);
    if (metadataKind !== null) {
      return metadataKind;
    }
    const directKind = normalizeSourceKind(target["sourceKind"]);
    if (directKind !== null) {
      return directKind;
    }
    const type = asNonEmptyString(target["type"]);
    if (type === "audio") {
      return "audio";
    }
    if (type === "frame" || type === "image") {
      return "image";
    }
    return getLabSourceKindForExtension(getLabPathExtension(getTargetPath(target)));
  }

  function getProjectSourceKind(project: LaboratoryProjectRecord): "video" | "audio" | "image" {
    return normalizeSourceKind(toSourceRecord(project.source).kind) || "video";
  }

  function getEffectiveSourceKind(
    project: LaboratoryProjectRecord,
    target: LaboratoryProcessTargetRecord
  ): "video" | "audio" | "image" {
    return (
      getRecordTargetSourceKind(toProcessTargetRecord(target)) || getProjectSourceKind(project)
    );
  }

  function buildWorkspaceAssetProcessTarget(
    project: LaboratoryProjectRecord,
    assetId: unknown,
    fallbackTarget: LaboratoryProcessTargetRecord
  ): LaboratoryProcessTargetRecord | null {
    const asset = findLabAssetById(project, assetId);
    if (asset === null) {
      return null;
    }
    const localPath = asNonEmptyString(asset.localPath);
    if (localPath === null) {
      return null;
    }
    const sourceKind = inferLabAssetSourceKind(asset);
    const metadata = toRecord(asset.metadata);
    return {
      ...fallbackTarget,
      fileName: getPathLeaf(localPath) || asset.name,
      label: asset.name,
      metadata: {
        ...toRecord(fallbackTarget["metadata"]),
        ...metadata,
        workspaceTargetAssetId: asset.id,
      },
      mimeType:
        asNonEmptyString(metadata["mimeType"]) || asNonEmptyString(fallbackTarget["mimeType"]),
      mode: "workspace-asset",
      outputId: asset.id,
      path: localPath,
      requestedMode:
        asNonEmptyString(fallbackTarget["requestedMode"]) ||
        asNonEmptyString(fallbackTarget["mode"]) ||
        "workspace-asset",
      signature: `asset:${asset.id}:${localPath}`,
      sourceKind: sourceKind || getRecordTargetSourceKind(metadata),
    };
  }

  function resolveProcessWorkbench(
    project: LaboratoryProjectRecord,
    featureId: string | null,
    workbenchSource: unknown = {}
  ) {
    const requestedFeatureId = asNonEmptyString(featureId);
    const baseWorkbench = createLaboratoryWorkbenchState({
      ...toWorkbenchRecord(project.workbench),
      ...toWorkbenchRecord(workbenchSource),
      ...(requestedFeatureId ? { activeModuleId: requestedFeatureId } : {}),
    });
    const selectedModuleIds = toStringArray(baseWorkbench.selectedModuleIds);
    if (requestedFeatureId === null || selectedModuleIds.includes(requestedFeatureId)) {
      return baseWorkbench;
    }

    return createLaboratoryWorkbenchState({
      ...baseWorkbench,
      activeModuleId: requestedFeatureId,
      selectedModuleIds: [requestedFeatureId, ...selectedModuleIds],
    });
  }

  function resolveProcessRunFeatureIds(
    project: LaboratoryProjectRecord,
    featureId: string | null,
    workbenchSource: unknown = {}
  ) {
    const workbench = resolveProcessWorkbench(project, featureId, workbenchSource);
    const requestedFeatureId =
      asNonEmptyString(featureId) || asNonEmptyString(workbench.activeModuleId);
    const selectedModuleIds = toStringArray(workbench.selectedModuleIds);

    if (requestedFeatureId === null) {
      return selectedModuleIds;
    }

    if (selectedModuleIds.includes(requestedFeatureId) === false) {
      return [requestedFeatureId];
    }

    return [
      requestedFeatureId,
      ...selectedModuleIds.filter(function (entry) {
        return entry !== requestedFeatureId;
      }),
    ];
  }

  function resolveProcessTarget(project: LaboratoryProjectRecord, featureId: string | null) {
    if (featureId === audioFeatureId) {
      return resolveAudioFeatureTarget(project);
    }

    const fallbackTarget = resolveProfileTarget(project);
    const workbench = toWorkbenchRecord(project.workbench);
    return (
      buildWorkspaceAssetProcessTarget(
        project,
        workbench["workspaceTargetAssetId"],
        fallbackTarget
      ) || fallbackTarget
    );
  }

  function createQueuedProcessModule(
    id: string,
    labelKey: string,
    title: string,
    summary: string | null
  ) {
    return normalizeProcessModule({
      id,
      labelKey,
      title,
      status: "queued",
      percent: 0,
      summary: summary || "",
      warnings: [],
      artifactIds: [],
      findingIds: [],
    });
  }

  function buildMediaProcessModules(
    runtime: LaboratoryRecord,
    project: LaboratoryProjectRecord,
    target: LaboratoryProcessTargetRecord
  ) {
    const readiness = toReadinessRecord(toProfileRecord(project.profile).readiness);
    const enabledLaneIds = toStringArray(readiness.enabledLaneIds);
    const sourceKind = getEffectiveSourceKind(project, target);
    const edit = toEditRecord(project.edit);
    const targetRecord = toProcessTargetRecord(target);
    const visualCatalogModules = getVisualAnalysisModulesForRuntime(runtime, sourceKind);
    const visualCapabilityState = toRecord(getVisualAnalysisCapabilityState(runtime, sourceKind));
    const enabledVisualModuleIds = resolveEnabledVisualAnalysisModuleIds(
      runtime,
      project,
      sourceKind
    );
    const visualPartitions = toRecord(
      partitionVisualAnalysisModuleIds(runtime, enabledVisualModuleIds)
    );
    const structureModuleIds = toStringArray(visualPartitions["structure"]);
    const revealModuleIds = toStringArray(visualPartitions["reveal"]);
    const analysisScope = toRecord(toWorkbenchRecord(project.workbench)["analysisScope"]);
    const comparisonScope = toRecord(analysisScope["comparison"]);
    const comparisonPrimary = toRecord(comparisonScope["primary"]);
    const comparisonReference = toRecord(comparisonScope["reference"]);
    const hasImageComparisonPair =
      getRecordTargetSourceKind(comparisonPrimary) === "image" &&
      getRecordTargetSourceKind(comparisonReference) === "image";
    const visualProviderState = toRecord(getVisualAnalysisProviderState(runtime));
    const visualProvidersReady =
      Object.keys(visualProviderState).length === 0
        ? false
        : Object.values(visualProviderState).some(function (entry) {
            return toRecord(entry)["ready"] === true;
          });
    const modules: LaboratoryProcessModuleRecord[] = [];

    modules.push(
      createQueuedProcessModule(
        "intake",
        "mediaAnalysis.process.steps.intake",
        "Source Intake",
        targetRecord.path
          ? "Target asset is pinned and ready for the managed run."
          : "Prepare a source before starting."
      )
    );
    modules.push(
      createQueuedProcessModule(
        "cleanup",
        "mediaAnalysis.process.steps.cleanup",
        "Frame Cleanup",
        asNonEmptyString(edit.handoffMode) === "derived"
          ? "Using the selected derived output as the active analysis handoff."
          : "Using the original source as the active analysis handoff."
      )
    );
    modules.push(
      normalizeProcessModule({
        ...createQueuedProcessModule(
          "motion",
          "mediaAnalysis.process.steps.motion",
          "Motion Analysis",
          ""
        ),
        status:
          (sourceKind === "video" || sourceKind === "image") &&
          visualProvidersReady &&
          structureModuleIds.length > 0 &&
          (enabledLaneIds.includes("visual-tamper") ||
            enabledLaneIds.includes("synthetic-suspicion"))
            ? "queued"
            : "skipped",
        summary:
          structureModuleIds.length > 0
            ? `${structureModuleIds.length} structural visual module(s) will inspect the pinned target.`
            : sourceKind === "video" || sourceKind === "image"
              ? "Structural visual modules are unavailable until the required FFmpeg provider is ready."
              : "Motion analysis is not active for this target.",
        metadata: {
          logicalLayer: "visual-analysis",
          transportLayer: "media-analysis",
          catalogCount: Array.isArray(visualCatalogModules) ? visualCatalogModules.length : 0,
          moduleIds: structureModuleIds,
          capabilityState: visualCapabilityState,
        },
      })
    );
    if (hasImageComparisonPair) {
      modules.push(
        normalizeProcessModule({
          ...createQueuedProcessModule(
            "image-comparison",
            "mediaAnalysis.process.steps.imageComparison",
            "Image Comparison",
            ""
          ),
          status: visualProvidersReady ? "queued" : "skipped",
          summary: visualProvidersReady
            ? "The selected A/B image pair will generate side-by-side and difference-map evidence."
            : "Image comparison is unavailable until the required FFmpeg provider is ready.",
          metadata: {
            logicalLayer: "visual-comparison",
            transportLayer: "media-analysis",
            capabilityState: visualCapabilityState,
          },
        })
      );
    }
    modules.push(
      normalizeProcessModule({
        ...createQueuedProcessModule(
          "visual-signal",
          "mediaAnalysis.process.steps.visualSignal",
          "Visual Signal Amplification",
          ""
        ),
        status:
          (sourceKind === "video" || sourceKind === "image") &&
          visualProvidersReady &&
          revealModuleIds.length > 0 &&
          (enabledLaneIds.includes("visual-tamper") ||
            enabledLaneIds.includes("synthetic-suspicion"))
            ? "queued"
            : "skipped",
        summary:
          revealModuleIds.length > 0
            ? `${revealModuleIds.length} reveal module(s) will generate preview variants for the pinned target.`
            : sourceKind === "video" || sourceKind === "image"
              ? "Reveal modules are unavailable until the required FFmpeg provider is ready."
              : "Visual signal amplification is not active for this target.",
        metadata: {
          logicalLayer: "visual-analysis",
          transportLayer: "media-analysis",
          catalogCount: Array.isArray(visualCatalogModules) ? visualCatalogModules.length : 0,
          moduleIds: revealModuleIds,
          capabilityState: visualCapabilityState,
        },
      })
    );
    modules.push(
      normalizeProcessModule({
        ...createQueuedProcessModule(
          "audio",
          "mediaAnalysis.process.steps.audio",
          "Audio Sweep",
          ""
        ),
        status:
          (sourceKind === "video" || sourceKind === "audio") &&
          (enabledLaneIds.includes("audio-tamper") || enabledLaneIds.includes("speech-overlay"))
            ? "queued"
            : "skipped",
        summary:
          sourceKind === "video" || sourceKind === "audio"
            ? "Audio continuity, loudness, and optional transcript checks will run."
            : "Audio sweep is not applicable to this target.",
      })
    );
    modules.push(
      createQueuedProcessModule(
        "report",
        "mediaAnalysis.process.steps.report",
        "Report Synthesis",
        "The managed run will persist a report-ready summary for the final stage."
      )
    );

    return modules;
  }

  function buildProcessSpeechAvailability(
    runtime: LaboratoryRecord,
    project: LaboratoryProjectRecord
  ): LaboratoryProcessSpeechAvailability {
    const summaries = buildProfileModelSummary(runtime, project).map(toModelSummaryEntry);
    const selected =
      summaries.find(function (entry) {
        return entry.selected === true;
      }) || null;
    const readyModel =
      selected && selected.ready === true
        ? selected
        : summaries.find(function (entry) {
            return entry.ready === true;
          }) || null;
    return {
      ready: readyModel !== null,
      model: readyModel,
    };
  }

  return {
    buildMediaProcessModules,
    buildProcessSpeechAvailability,
    resolveProcessRunFeatureIds,
    resolveProcessWorkbench,
    resolveProcessTarget,
  };
}
