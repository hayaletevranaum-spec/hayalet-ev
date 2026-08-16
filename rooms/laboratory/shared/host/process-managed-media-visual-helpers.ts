import { readBooleanSetting, readNumberSetting, readStringSetting } from "./settings-readers.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryManagedMediaProcessRecord = LaboratoryRecord & {
  analysisSettings?: unknown;
  analysisScope?: unknown;
};

type LaboratoryProcessFindingRecord = LaboratoryRecord & {
  detail?: unknown;
  moduleId?: unknown;
  title?: unknown;
};

type ManagedMediaFindingOptions = {
  artifactIds?: string[];
  confidence?: string;
  detail: string;
  evidenceCount?: number;
  level?: string;
  settingsUsed?: LaboratoryRecord;
  title: string;
};

type ManagedMediaVisualSignalSummary = {
  backgroundMotionEnergy?: number | null;
  compressionRiskLevel?: string | null;
  duplicateFrameCount?: number;
  forensicArtifactFamily?: string | null;
  forensicConfidence?: string | null;
  freezeAttribution?: string | null;
  metadataProvenanceStatus?: string | null;
  opticalFlowClass?: string | null;
  referenceQualityStatus?: string | null;
  subjectMotionEnergy?: number | null;
};

type ManagedMediaVisualHelpersDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  createProcessFinding: (
    moduleId: string,
    kind: string,
    level: string,
    confidence: string,
    title: string,
    detail: string,
    evidenceCount: number,
    artifactIds: string[]
  ) => LaboratoryProcessFindingRecord;
  normalizeProcessFinding: (rawValue: unknown) => LaboratoryProcessFindingRecord;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createManagedMediaVisualHelpers(deps: ManagedMediaVisualHelpersDeps) {
  const { asNonEmptyString, createProcessFinding, normalizeProcessFinding, toRecord } = deps;

  function toProcessFindingRecord(value: unknown): LaboratoryProcessFindingRecord {
    return toRecord(value);
  }

  function toReferenceRecord(value: unknown): LaboratoryRecord {
    return toRecord(value);
  }

  function getScopeReference(processRecord: LaboratoryManagedMediaProcessRecord): LaboratoryRecord {
    const scope = toRecord(processRecord.analysisScope);
    const comparison = toReferenceRecord(scope["comparison"]);
    return {
      ...(Object.keys(toReferenceRecord(scope["timeRange"])).length > 0
        ? { timeRange: toReferenceRecord(scope["timeRange"]) }
        : {}),
      ...(Object.keys(toReferenceRecord(scope["frameRange"])).length > 0
        ? { frameRange: toReferenceRecord(scope["frameRange"]) }
        : {}),
      ...(Object.keys(toReferenceRecord(scope["region"])).length > 0
        ? { region: toReferenceRecord(scope["region"]) }
        : {}),
      ...(Object.keys(comparison).length > 0 ? { comparison } : {}),
    };
  }

  function getScopeHypothesis(processRecord: LaboratoryManagedMediaProcessRecord): string | null {
    return asNonEmptyString(toRecord(processRecord.analysisScope)["hypothesis"]);
  }

  function createMediaFinding(
    processRecord: LaboratoryManagedMediaProcessRecord,
    moduleId: string,
    sourceModule: string,
    options: ManagedMediaFindingOptions
  ) {
    return toProcessFindingRecord(
      normalizeProcessFinding({
        ...createProcessFinding(
          moduleId,
          "derived",
          options.level || "low",
          options.confidence || "low",
          options.title,
          options.detail,
          typeof options.evidenceCount === "number" ? options.evidenceCount : 1,
          Array.isArray(options.artifactIds) ? options.artifactIds : []
        ),
        code: `${sourceModule}-signal`,
        severity: options.level || "low",
        sourceModule,
        reference: getScopeReference(processRecord),
        hypothesis: getScopeHypothesis(processRecord),
        ...(options.settingsUsed === undefined ? {} : { settingsUsed: options.settingsUsed }),
      })
    );
  }

  function buildVisualFindingDetail(
    moduleId: string,
    freezeCount: number,
    blackCount: number,
    sourceKind: string,
    signalSummary: ManagedMediaVisualSignalSummary = {}
  ): { detail: string; level: string; title: string } {
    const duplicateFrameCount =
      typeof signalSummary.duplicateFrameCount === "number" &&
      Number.isFinite(signalSummary.duplicateFrameCount)
        ? signalSummary.duplicateFrameCount
        : 0;
    const compressionRiskLevel = signalSummary.compressionRiskLevel || "low";
    const forensicArtifactFamily = signalSummary.forensicArtifactFamily || null;
    const forensicConfidence = signalSummary.forensicConfidence || "low";
    const freezeAttribution = signalSummary.freezeAttribution || null;
    const metadataProvenanceStatus = signalSummary.metadataProvenanceStatus || "unavailable";
    const opticalFlowClass = signalSummary.opticalFlowClass || null;
    const referenceQualityStatus = signalSummary.referenceQualityStatus || "unavailable";
    const subjectMotionEnergy =
      typeof signalSummary.subjectMotionEnergy === "number" &&
      Number.isFinite(signalSummary.subjectMotionEnergy)
        ? signalSummary.subjectMotionEnergy
        : null;
    const backgroundMotionEnergy =
      typeof signalSummary.backgroundMotionEnergy === "number" &&
      Number.isFinite(signalSummary.backgroundMotionEnergy)
        ? signalSummary.backgroundMotionEnergy
        : null;
    const flowDetail =
      opticalFlowClass === null
        ? "motion split pending"
        : `motion split ${opticalFlowClass}${
            subjectMotionEnergy === null || backgroundMotionEnergy === null
              ? ""
              : `, subject ${subjectMotionEnergy.toFixed(4)} vs background ${backgroundMotionEnergy.toFixed(4)}`
          }`;
    if (moduleId === "frame-consistency") {
      return freezeCount > 0
        ? {
            title: "Frame consistency anomaly detected",
            detail: `The active ${sourceKind} target contains ${freezeCount} freeze interval(s) inside the sampled window; attribution ${freezeAttribution || "pending"}; ${flowDetail}.`,
            level: freezeCount > 2 ? "medium" : "low",
          }
        : duplicateFrameCount > 0
          ? {
              title: "Duplicate frame cadence detected",
              detail: `The active ${sourceKind} target repeats ${duplicateFrameCount} decoded frame(s) below the freeze-duration threshold.`,
              level: duplicateFrameCount > 12 ? "medium" : "low",
            }
          : {
              title: "Frame consistency sweep completed",
              detail:
                "The managed run captured a frame consistency baseline for the selected scope.",
              level: "low",
            };
    }
    if (moduleId === "motion-anomaly") {
      if (opticalFlowClass === "localized_subject_motion") {
        return {
          title: "Localized motion track detected",
          detail: `Motion analysis separated subject/ROI movement from a quieter background sample; compression risk ${compressionRiskLevel}.`,
          level: "medium",
        };
      }
      if (opticalFlowClass === "background_or_camera_motion") {
        return {
          title: "Background motion track detected",
          detail: `Motion analysis found stronger background/camera movement than subject/ROI movement; compression risk ${compressionRiskLevel}.`,
          level: "medium",
        };
      }
      return freezeCount + blackCount > 0
        ? {
            title: "Motion anomaly cluster detected",
            detail: `Motion analysis observed ${freezeCount + blackCount} structural transition(s) across the sampled window; compression risk ${compressionRiskLevel}; ${flowDetail}.`,
            level: freezeCount + blackCount > 2 ? "medium" : "low",
          }
        : {
            title: "Motion anomaly sweep completed",
            detail: "No coarse motion spikes surfaced beyond the sampled baseline.",
            level: "low",
          };
    }
    if (moduleId === "perceptual-duplicate-frame") {
      return duplicateFrameCount > 0
        ? {
            title: "Near-duplicate frame pattern detected",
            detail: `Frame hashing found ${duplicateFrameCount} repeated decoded frame(s); perceptual hash and SSIM checks are optional follow-up for close-copy separation.`,
            level: duplicateFrameCount > 12 ? "medium" : "low",
          }
        : {
            title: "Near-duplicate frame sweep completed",
            detail:
              "Exact decoded-frame hashing did not surface a repeated-frame cluster in the sampled window.",
            level: "low",
          };
    }
    if (moduleId === "optical-flow-tracking") {
      return opticalFlowClass === null
        ? {
            title: "Optical-flow tracking not measured",
            detail:
              "Subject/background motion split could not be measured by the available proxy runtime.",
            level: "low",
          }
        : {
            title: "Optical-flow tracking summary",
            detail: `Subject/background motion split reported ${opticalFlowClass}; camera-compensated RAFT flow remains a gated optional follow-up.`,
            level:
              opticalFlowClass === "localized_subject_motion" ||
              opticalFlowClass === "background_or_camera_motion"
                ? "medium"
                : "low",
          };
    }
    if (moduleId === "compression-signature-mapping") {
      return forensicArtifactFamily !== null &&
        forensicArtifactFamily !== "baseline_no_dominant_artifact_signature"
        ? {
            title: "Compression signature mapped",
            detail: `Compression/cadence probes mapped ${forensicArtifactFamily} with ${forensicConfidence} confidence; raw compression risk ${compressionRiskLevel}.`,
            level:
              forensicConfidence === "high" || compressionRiskLevel === "high" ? "medium" : "low",
          }
        : {
            title: "Compression signature baseline",
            detail: `Compression/cadence probes did not cross a dominant artifact-family threshold; raw compression risk ${compressionRiskLevel}.`,
            level: "low",
          };
    }
    if (moduleId === "metadata-provenance-audit") {
      return {
        title: "Metadata provenance audit",
        detail:
          metadataProvenanceStatus === "measured"
            ? "ExifTool, MediaInfo, and ffprobe metadata provenance checks were normalized for report review."
            : "Metadata provenance audit is marked not measured until ExifTool/MediaInfo host commands are available.",
        level: "low",
      };
    }
    if (moduleId === "reference-quality-check") {
      return {
        title: "Reference quality check",
        detail:
          referenceQualityStatus === "measured"
            ? "Reference/pre-upload quality deltas were normalized for SSIM/VMAF review."
            : "Reference quality is marked not measured because a reference/pre-upload source or VMAF-capable runtime is missing.",
        level: "low",
      };
    }
    if (moduleId === "temporal-noise-pattern") {
      return blackCount > 0
        ? {
            title: "Temporal noise pattern detected",
            detail: `Black interval analysis found ${blackCount} transition(s) that may deserve a deeper visual replay.`,
            level: "low",
          }
        : {
            title: "Temporal noise baseline captured",
            detail: "Temporal noise pattern checks completed for the sampled window.",
            level: "low",
          };
    }

    const label =
      moduleId === "lighting-consistency"
        ? "Lighting consistency sweep completed"
        : moduleId === "background-consistency"
          ? "Background consistency sweep completed"
          : moduleId === "occlusion-inconsistency"
            ? "Occlusion inconsistency sweep completed"
            : moduleId === "object-insert-remove-anomaly"
              ? "Insert/remove anomaly sweep completed"
              : "Visual sweep completed";
    return {
      title: label,
      detail: `The managed run generated a ${sourceKind}-level visual baseline for ${moduleId}.`,
      level: "low",
    };
  }

  function getAnalysisModuleSettings(
    processRecord: LaboratoryManagedMediaProcessRecord,
    moduleId: string
  ): LaboratoryRecord {
    const settings = toRecord(processRecord.analysisSettings);
    return toRecord(toRecord(settings["modules"])[moduleId]);
  }

  function readFiniteRecordNumber(record: LaboratoryRecord, key: string): number | null {
    const value = Number(record[key]);
    return Number.isFinite(value) ? value : null;
  }

  function getScopeCropRegion(
    processRecord: LaboratoryManagedMediaProcessRecord,
    side?: "primary" | "reference"
  ): LaboratoryRecord {
    const scope = toRecord(processRecord.analysisScope);
    if (side === "primary" || side === "reference") {
      const comparisonRegion = toReferenceRecord(
        toReferenceRecord(toReferenceRecord(scope["comparison"])["rois"])[side]
      );
      if (Object.keys(comparisonRegion).length > 0) {
        return comparisonRegion;
      }
    }
    return toReferenceRecord(scope["region"]);
  }

  function getScopeCropFilter(
    processRecord: LaboratoryManagedMediaProcessRecord,
    side?: "primary" | "reference"
  ): string | null {
    const region = getScopeCropRegion(processRecord, side);
    const x = readFiniteRecordNumber(region, "x");
    const y = readFiniteRecordNumber(region, "y");
    const width = readFiniteRecordNumber(region, "width");
    const height = readFiniteRecordNumber(region, "height");
    if (
      x === null ||
      y === null ||
      width === null ||
      height === null ||
      width <= 0 ||
      height <= 0
    ) {
      return null;
    }
    return `crop=${String(Math.round(width))}:${String(Math.round(height))}:${String(
      Math.max(0, Math.round(x))
    )}:${String(Math.max(0, Math.round(y)))}`;
  }

  function applyRoiScopeFilter(
    processRecord: LaboratoryManagedMediaProcessRecord,
    settings: LaboratoryRecord,
    filterGraph: string,
    side?: "primary" | "reference"
  ) {
    if (readBooleanSetting(settings, "roiOnly", false) !== true) {
      return filterGraph;
    }
    const scopeCropFilter = getScopeCropFilter(processRecord, side);
    return scopeCropFilter === null ? filterGraph : `${scopeCropFilter},${filterGraph}`;
  }

  function getRangeWeightedSetting(
    settings: LaboratoryRecord,
    minKey: string,
    maxKey: string,
    fallbackMin: number,
    fallbackMax: number,
    weight: number
  ) {
    const rawMin = readNumberSetting(settings, minKey, fallbackMin);
    const rawMax = readNumberSetting(settings, maxKey, fallbackMax);
    const low = Math.min(rawMin, rawMax);
    const high = Math.max(rawMin, rawMax);
    const normalizedWeight = Math.max(0, Math.min(1, weight));
    return low + (high - low) * normalizedWeight;
  }

  function getSamplingWindowSeconds(settings: LaboratoryRecord) {
    const density = readStringSetting(settings, "samplingDensity", "balanced");
    return density === "dense" ? 90 : density === "sparse" ? 30 : 60;
  }

  function getSamplingTileCount(settings: LaboratoryRecord) {
    const density = readStringSetting(settings, "samplingDensity", "balanced");
    const densityTiles = density === "dense" ? 8 : density === "sparse" ? 3 : 5;
    const frameStep = Math.max(1, Math.round(readNumberSetting(settings, "frameStep", 24)));
    const stepTiles = Math.max(3, Math.min(12, Math.round(120 / frameStep)));
    return Math.max(3, Math.min(12, Math.round((densityTiles + stepTiles) / 2)));
  }

  function getSensitivityAdjustedLevel(
    level: string,
    settings: LaboratoryRecord,
    evidenceCount: number
  ) {
    const sensitivity = readStringSetting(settings, "sensitivity", "medium");
    if (sensitivity === "high" && evidenceCount > 0 && level === "low") {
      return "medium";
    }
    if (sensitivity === "low" && evidenceCount < 3 && level === "medium") {
      return "low";
    }
    return level;
  }

  function fixedFilterNumber(value: number): string {
    return Number(value.toFixed(3)).toString();
  }

  function getChannelIsolationFilter(channelMode: string): string {
    if (channelMode === "green") {
      return "colorchannelmixer=rr=0:rg=0:rb=0:gr=0:gg=1:gb=0:br=0:bg=0:bb=0";
    }
    if (channelMode === "blue") {
      return "colorchannelmixer=rr=0:rg=0:rb=0:gr=0:gg=0:gb=0:br=0:bg=0:bb=1";
    }
    return "colorchannelmixer=rr=1:rg=0:rb=0:gr=0:gg=0:gb=0:br=0:bg=0:bb=0";
  }

  function getRevealFilterConfig(
    moduleId: string,
    settings: LaboratoryRecord
  ): {
    filterGraph: string;
    label: string;
  } {
    const revealStrength = Math.max(
      0.25,
      Math.min(2, readNumberSetting(settings, "revealStrength", 1))
    );
    if (moduleId === "color-channel-isolation") {
      const channelMode = readStringSetting(settings, "channelMode", "red");
      return {
        filterGraph: `${getChannelIsolationFilter(channelMode)},eq=contrast=${fixedFilterNumber(
          1 + revealStrength * 0.12
        )}`,
        label: `${channelMode.charAt(0).toUpperCase()}${channelMode.slice(1)} Channel Isolation`,
      };
    }
    if (moduleId === "gamma-scan") {
      const rangeWeight = Math.max(0, Math.min(1, (revealStrength - 0.25) / 1.75));
      const gamma = getRangeWeightedSetting(
        settings,
        "gammaMin",
        "gammaMax",
        0.7,
        1.7,
        rangeWeight
      );
      return {
        filterGraph: `eq=gamma=${fixedFilterNumber(gamma)}:contrast=${fixedFilterNumber(
          1.04 + revealStrength * 0.08
        )}:brightness=${fixedFilterNumber(0.02 + revealStrength * 0.01)}`,
        label: "Gamma Scan",
      };
    }
    if (moduleId === "contrast-scan") {
      const rangeWeight = Math.max(0, Math.min(1, (revealStrength - 0.25) / 1.75));
      const contrast = getRangeWeightedSetting(
        settings,
        "contrastMin",
        "contrastMax",
        1.1,
        1.6,
        rangeWeight
      );
      return {
        filterGraph: `eq=contrast=${fixedFilterNumber(contrast)}:brightness=${fixedFilterNumber(
          0.015 + revealStrength * 0.008
        )}:saturation=${fixedFilterNumber(1 + revealStrength * 0.05)}`,
        label: "Contrast Scan",
      };
    }
    if (moduleId === "edge-enhancement") {
      const edgeStrength = Math.max(
        0.25,
        Math.min(2, readNumberSetting(settings, "edgeStrength", 1))
      );
      return {
        filterGraph: `unsharp=7:7:${fixedFilterNumber(1.8 * edgeStrength)}:7:7:0.0`,
        label: "Edge Enhancement",
      };
    }
    if (moduleId === "histogram-equalization") {
      const histogramStrength = Math.max(
        0.05,
        Math.min(1, readNumberSetting(settings, "histogramStrength", 0.35))
      );
      return {
        filterGraph: `histeq=strength=${fixedFilterNumber(histogramStrength)}:intensity=${fixedFilterNumber(
          Math.min(0.75, histogramStrength * 0.7)
        )}`,
        label: "Histogram Equalization",
      };
    }
    if (moduleId === "hidden-detail-reveal") {
      return {
        filterGraph: `eq=brightness=${fixedFilterNumber(0.04 + revealStrength * 0.016)}:contrast=${fixedFilterNumber(
          1.1 + revealStrength * 0.38
        )}:gamma=${fixedFilterNumber(1.05 + revealStrength * 0.32)},unsharp=5:5:${fixedFilterNumber(
          1.1 + revealStrength * 0.24
        )}:5:5:0.0`,
        label: "Hidden Detail Reveal",
      };
    }
    const channelMode = readStringSetting(settings, "channelMode", "rgb");
    const channelPrefix = channelMode === "rgb" ? "" : `${getChannelIsolationFilter(channelMode)},`;
    return {
      filterGraph: `${channelPrefix}eq=brightness=${fixedFilterNumber(0.04 + revealStrength * 0.01)}:contrast=${fixedFilterNumber(
        1.05 + revealStrength * 0.15
      )}:gamma=${fixedFilterNumber(1.05 + revealStrength * 0.15)}`,
      label: "Visual Signal Amplification",
    };
  }

  return {
    applyRoiScopeFilter,
    buildVisualFindingDetail,
    createMediaFinding,
    getAnalysisModuleSettings,
    getRevealFilterConfig,
    getSamplingTileCount,
    getSamplingWindowSeconds,
    getScopeCropFilter,
    getScopeReference,
    getSensitivityAdjustedLevel,
  };
}
