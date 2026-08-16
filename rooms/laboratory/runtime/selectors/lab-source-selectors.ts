import { asLabRecord, asNonEmptyString } from "../../domain/lab-types.js";
import type {
  LabArtifactProjection,
  LabAsset,
  LabAssetType,
  LabModuleState,
  LabPreviewArtifactProjection,
  LabRecord,
  LabReportSet,
  LabRun,
  LabRunSnapshotSummary,
  LabStoreState,
} from "../../domain/lab-types.js";
import {
  getCurrentFeatureId,
  getProjectEdit,
  getProjectProfile,
  getProjectSource,
} from "./lab-project-selectors.js";

export function getCurrentRun(state: LabStoreState): LabRun | null {
  return state.run;
}

export function getRunSnapshotSummary(state: LabStoreState): LabRunSnapshotSummary | null {
  const run = getCurrentRun(state);
  if (!run || !run.analysisScope) {
    return null;
  }
  const scope = run.analysisScope;
  return {
    focus: typeof scope.focus === "string" ? scope.focus : null,
    timelineStartMs:
      scope.timeRange && typeof scope.timeRange.startMs === "number"
        ? scope.timeRange.startMs
        : null,
    timelineEndMs:
      scope.timeRange && typeof scope.timeRange.endMs === "number" ? scope.timeRange.endMs : null,
    hypothesis: typeof scope.hypothesis === "string" ? scope.hypothesis : null,
  };
}

export function getCurrentReports(state: LabStoreState): LabReportSet {
  return state.reports;
}

export function getAssets(state: LabStoreState): LabAsset[] {
  return state.assets.slice();
}

export function getAssetById(state: LabStoreState, assetId: string): LabAsset | null {
  return (
    state.assets.find(function (asset) {
      return asset.id === assetId;
    }) || null
  );
}

export function getCurrentSourceAsset(state: LabStoreState): LabAsset | null {
  const source = getProjectSource(state);
  const storedPath = asNonEmptyString(source["storedPath"]);
  const sourceUrl = asNonEmptyString(source["sourceUrl"]);
  const storedFileName = asNonEmptyString(source["storedFileName"]);

  return (
    getAssets(state).find(function (asset) {
      if (asset.type !== "source") {
        return false;
      }
      if (storedPath !== null && asset.localPath === storedPath) {
        return true;
      }
      if (sourceUrl !== null && asset.url === sourceUrl) {
        return true;
      }
      if (storedFileName === null) {
        return false;
      }
      return (
        asset.name === storedFileName &&
        asNonEmptyString(asLabRecord(asset.metadata)["storedFileName"]) === storedFileName
      );
    }) || null
  );
}

export function getAssetsByType(state: LabStoreState, type: LabAssetType): LabAsset[] {
  return state.assets.filter(function (asset) {
    return asset.type === type;
  });
}

export function getAssetsBySource(state: LabStoreState, sourceId: string): LabAsset[] {
  return state.assets.filter(function (asset) {
    return asset.sourceId === sourceId;
  });
}

export function getAssetsByRun(state: LabStoreState, runId: string): LabAsset[] {
  return state.assets.filter(function (asset) {
    return asset.runId === runId;
  });
}

export function getLinkedAudioAssets(state: LabStoreState, sourceId: string): LabAsset[] {
  return getAssets(state)
    .filter(function (asset) {
      return asset.type === "audio" && asset.derivedFromSourceId === sourceId;
    })
    .sort(function (left, right) {
      if (left.createdAt !== right.createdAt) {
        return right.createdAt - left.createdAt;
      }
      if (left.name !== right.name) {
        return left.name.localeCompare(right.name);
      }
      return left.id.localeCompare(right.id);
    });
}

export function getParentSourceForAsset(state: LabStoreState, assetId: string): LabAsset | null {
  const asset = getAssetById(state, assetId);
  if (asset === null) {
    return null;
  }

  if (asset.derivedFromAssetId) {
    const parentAsset = getAssetById(state, asset.derivedFromAssetId);
    if (parentAsset !== null) {
      return parentAsset;
    }
  }

  if (asset.derivedFromSourceId) {
    const parentSource = getAssetById(state, asset.derivedFromSourceId);
    if (parentSource !== null) {
      return parentSource;
    }
    return (
      getAssets(state).find(function (candidate) {
        return candidate.type === "source" && candidate.sourceId === asset.derivedFromSourceId;
      }) || null
    );
  }

  return null;
}

export function getWorkbench(state: LabStoreState): LabRecord {
  return state.workbench;
}

export function getSourceProbeStatus(state: LabStoreState) {
  return state.sourceProbeStatus;
}

export function getSourceStatus(state: LabStoreState): string {
  return asNonEmptyString(getProjectSource(state)["status"]) || "idle";
}

export function getSourceMode(state: LabStoreState): string {
  return asNonEmptyString(getProjectSource(state)["mode"]) || "local";
}

export function getSourceKind(state: LabStoreState): string {
  return asNonEmptyString(getProjectSource(state)["kind"]) || "video";
}

export function getSourceMetadata(state: LabStoreState): LabRecord {
  return asLabRecord(getProjectSource(state)["metadata"]);
}

export function getEditPreview(state: LabStoreState): LabRecord {
  return asLabRecord(getProjectEdit(state)["preview"]);
}

export function getEditOutputs(state: LabStoreState): LabRecord[] {
  const outputs = getProjectEdit(state)["outputs"];
  return Array.isArray(outputs) ? outputs.map(asLabRecord) : [];
}

export function getActiveEditOutput(state: LabStoreState): LabRecord | null {
  const activeOutputId = asNonEmptyString(getProjectEdit(state)["activeOutputId"]);
  if (activeOutputId === null) {
    return null;
  }

  return (
    getEditOutputs(state).find(function (entry) {
      return asNonEmptyString(entry["id"]) === activeOutputId;
    }) || null
  );
}

export function getReportExports(state: LabStoreState): LabRecord[] {
  return state.reportExports;
}

export function getProfileModelCatalog(state: LabStoreState): LabRecord[] {
  return state.profileModels;
}

export function getSelectedProfileModel(state: LabStoreState): LabRecord | null {
  const profile = getProjectProfile(state);
  const modelId = asNonEmptyString(profile["modelId"]);
  if (modelId === null) {
    return null;
  }

  return (
    getProfileModelCatalog(state).find(function (entry) {
      return asNonEmptyString(entry["id"]) === modelId;
    }) || null
  );
}

export function getToolState(state: LabStoreState): LabRecord {
  return state.toolState;
}

export function getFeatureCompatibility(state: LabStoreState) {
  const featureId = getCurrentFeatureId(state);
  const sourceReady = state.source !== null && state.sourceProbeStatus === "completed";
  const availableModules = Array.isArray(state.workbench["availableModuleIds"])
    ? (state.workbench["availableModuleIds"] as unknown[]).filter(
        (entry): entry is string => typeof entry === "string"
      )
    : Array.isArray(state.workbench["selectedModuleIds"])
      ? (state.workbench["selectedModuleIds"] as unknown[]).filter(
          (entry): entry is string => typeof entry === "string"
        )
      : [featureId];
  const sourceKind = getSourceKind(state);
  return {
    featureId,
    mediaReady: sourceReady && availableModules.includes("media-analysis"),
    audioReady:
      sourceReady &&
      availableModules.includes("audio-analysis") &&
      (sourceKind === "audio" || sourceKind === "video"),
  };
}

export function getPreviewArtifacts(state: LabStoreState) {
  const run = getCurrentRun(state);
  return Array.isArray(run?.previewArtifacts) ? run.previewArtifacts.slice() : [];
}

export function getActivePreviewArtifact(
  state: LabStoreState
): LabPreviewArtifactProjection | null {
  const previewArtifacts = getPreviewArtifacts(state);
  if (previewArtifacts.length === 0) {
    return null;
  }

  const activePreviewId =
    asNonEmptyString(state.ui.activePreviewArtifactId) ||
    asNonEmptyString(asLabRecord(state.workbench)["activePreviewArtifactId"]);
  return (
    previewArtifacts.find(function (entry) {
      return entry.id === activePreviewId;
    }) ||
    previewArtifacts.find(function (entry) {
      return entry.active === true;
    }) ||
    previewArtifacts[0] ||
    null
  );
}

function getAudioVisualizationArtifactTimestamp(
  artifact: LabArtifactProjection | LabPreviewArtifactProjection
) {
  if (typeof artifact.createdAt !== "string" || artifact.createdAt.trim() === "") {
    return Number.NEGATIVE_INFINITY;
  }
  const parsedTimestamp = Date.parse(artifact.createdAt);
  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : Number.NEGATIVE_INFINITY;
}

function getLoadableVisualizationArtifactUrl(
  artifact: LabArtifactProjection | LabPreviewArtifactProjection
) {
  if (typeof artifact.previewUrl === "string" && artifact.previewUrl.trim() !== "") {
    return artifact.previewUrl;
  }
  const fileUrl = (artifact as { fileUrl?: unknown }).fileUrl;
  return typeof fileUrl === "string" && fileUrl.trim() !== "" ? fileUrl : null;
}

function hasLoadableVisualizationArtifactUrl(
  artifact: LabArtifactProjection | LabPreviewArtifactProjection
) {
  return getLoadableVisualizationArtifactUrl(artifact) !== null;
}

function pickPreferredAudioVisualizationArtifact(
  artifacts: Array<LabArtifactProjection | LabPreviewArtifactProjection>,
  kind: "waveform" | "spectrogram"
) {
  return (
    artifacts
      .map(function (artifact, index) {
        return {
          artifact,
          index,
        };
      })
      .filter(function (entry) {
        return entry.artifact.kind === kind && hasLoadableVisualizationArtifactUrl(entry.artifact);
      })
      .sort(function (left, right) {
        const timestampDelta =
          getAudioVisualizationArtifactTimestamp(right.artifact) -
          getAudioVisualizationArtifactTimestamp(left.artifact);
        if (timestampDelta !== 0) {
          return timestampDelta;
        }
        if (left.artifact.active !== right.artifact.active) {
          return left.artifact.active === true ? -1 : 1;
        }
        return left.index - right.index;
      })[0]?.artifact || null
  );
}

export function getAudioVisualizationArtifact(
  state: LabStoreState
): LabArtifactProjection | LabPreviewArtifactProjection | null {
  const mode =
    state.ui.workspace.audioFocus.visualizationMode === "spectrum" ? "spectrum" : "waveform";

  const run = getCurrentRun(state);
  if (!run) {
    return null;
  }

  const finalArtifacts = Array.isArray(run.artifacts) ? run.artifacts : [];
  const previewArtifacts = Array.isArray(run.previewArtifacts) ? run.previewArtifacts : [];
  const preferredKinds: Array<"waveform" | "spectrogram"> =
    mode === "spectrum" ? ["spectrogram", "waveform"] : ["waveform", "spectrogram"];

  for (const kind of preferredKinds) {
    const finalArtifact = pickPreferredAudioVisualizationArtifact(finalArtifacts, kind);
    if (finalArtifact) {
      return finalArtifact;
    }
    const previewArtifact = pickPreferredAudioVisualizationArtifact(previewArtifacts, kind);
    if (previewArtifact) {
      return previewArtifact;
    }
  }

  return null;
}

export function getComparisonVariants(state: LabStoreState) {
  const run = getCurrentRun(state);
  return Array.isArray(run?.comparisonVariants) ? run.comparisonVariants.slice() : [];
}

export function getActiveModule(state: LabStoreState): LabModuleState | null {
  const run = getCurrentRun(state);
  if (!run || !Array.isArray(run.moduleOrder)) {
    return null;
  }
  const activeModuleId =
    run.moduleOrder.find(function (moduleId) {
      return run.modules[moduleId]?.status === "running";
    }) || null;
  return activeModuleId ? run.modules[activeModuleId] || null : null;
}
