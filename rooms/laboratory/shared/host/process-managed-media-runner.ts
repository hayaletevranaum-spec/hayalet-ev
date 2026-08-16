import { readBooleanSetting, readStringSetting } from "./settings-readers.js";
import { createManagedMediaVisualHelpers } from "./process-managed-media-visual-helpers.js";
import { getLabPathExtension, getLabSourceKindForExtension } from "../lab-asset-kind.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryManagedMediaRuntime = LaboratoryRecord & {
  profileCapabilities?: unknown;
};

type LaboratoryManagedMediaProjectRecord = LaboratoryRecord & {
  edit?: unknown;
  profile?: unknown;
  source?: unknown;
  workbench?: unknown;
};

type LaboratoryManagedMediaTargetRecord = LaboratoryRecord & {
  metadata?: unknown;
  path?: unknown;
};

type LaboratoryManagedMediaProcessRecord = LaboratoryRecord & {
  analysisSettings?: unknown;
  analysisScope?: unknown;
  modules?: unknown;
};

type LaboratoryProcessModuleRecord = LaboratoryRecord & {
  metadata?: unknown;
  id?: unknown;
  status?: unknown;
};

type LaboratoryProcessArtifactRecord = LaboratoryRecord & {
  id?: unknown;
  label?: unknown;
  moduleId?: unknown;
  path?: unknown;
};

type LaboratoryProcessFindingRecord = LaboratoryRecord & {
  detail?: unknown;
  metadata?: unknown;
  moduleId?: unknown;
  title?: unknown;
};

type LaboratorySpeechAvailabilityRecord = LaboratoryRecord & {
  ready?: unknown;
};

type LaboratoryProbeBucketRecord = LaboratoryRecord & {
  averageDurationSeconds?: unknown;
  count?: unknown;
  maxDurationSeconds?: unknown;
  segments?: unknown;
  totalDurationSeconds?: unknown;
};

type LaboratoryVideoProbeRecord = LaboratoryRecord & {
  black?: unknown;
  compressionSignature?: unknown;
  compressionSignatureMapping?: unknown;
  duplicateFrame?: unknown;
  frameCadence?: unknown;
  freeze?: unknown;
  forensicSignature?: unknown;
  freezeAttribution?: unknown;
  gopStructure?: unknown;
  metadataProvenance?: unknown;
  nearDuplicateFrame?: unknown;
  opticalFlow?: unknown;
  opticalFlowTracking?: unknown;
  referenceQuality?: unknown;
};

type LaboratoryAudioProbeRecord = LaboratoryRecord & {
  silence?: unknown;
  volume?: unknown;
};

type LaboratoryTranscriptResultRecord = LaboratoryRecord & {
  artifact?: unknown;
  text?: unknown;
};

type LaboratoryManagedMediaRunnerResult = {
  findings: LaboratoryProcessFindingRecord[];
  artifacts: LaboratoryProcessArtifactRecord[];
  warnings: string[];
};

type LaboratoryManagedMediaUpdateEmitter = ((payload: LaboratoryRecord) => void) | null;

type LaboratoryManagedMediaRunnerDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  buildProcessSpeechAvailability: (
    runtime: LaboratoryManagedMediaRuntime,
    project: LaboratoryManagedMediaProjectRecord
  ) => LaboratorySpeechAvailabilityRecord;
  clampProfileTranscriptSampleSeconds: (...args: unknown[]) => number;
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
  generateProcessFramePreviewArtifact: (
    runtime: LaboratoryManagedMediaRuntime,
    project: LaboratoryManagedMediaProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryManagedMediaTargetRecord,
    artifactBase: string,
    outputDir: string,
    moduleId: string,
    sampleWindowSeconds: number,
    tileCount: unknown,
    label?: string,
    filterGraph?: string | null
  ) => Promise<unknown>;
  generateProcessImageComparisonArtifact: (
    runtime: LaboratoryManagedMediaRuntime,
    project: LaboratoryManagedMediaProjectRecord,
    requestId: string,
    jobId: string,
    primaryTarget: LaboratoryManagedMediaTargetRecord,
    referenceTarget: LaboratoryManagedMediaTargetRecord,
    artifactBase: string,
    outputDir: string,
    comparisonKind: "side-by-side" | "difference",
    label: string,
    metadata?: LaboratoryRecord
  ) => Promise<unknown>;
  generateProcessMetadataArtifact: (
    runtime: LaboratoryManagedMediaRuntime,
    project: LaboratoryManagedMediaProjectRecord,
    target: LaboratoryManagedMediaTargetRecord,
    artifactBase: string,
    outputDir: string,
    moduleId: string
  ) => Promise<unknown>;
  generateProcessSpectrogram: (
    runtime: LaboratoryManagedMediaRuntime,
    project: LaboratoryManagedMediaProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryManagedMediaTargetRecord,
    artifactBase: string,
    outputDir: string,
    moduleId: string
  ) => Promise<unknown>;
  generateProcessVisualTransformArtifact: (
    runtime: LaboratoryManagedMediaRuntime,
    project: LaboratoryManagedMediaProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryManagedMediaTargetRecord,
    artifactBase: string,
    outputDir: string,
    moduleId: string,
    filterGraph: string,
    label: string,
    metadata?: LaboratoryRecord
  ) => Promise<unknown>;
  maybeRunTranscriptProfileSample: (
    runtime: LaboratoryManagedMediaRuntime,
    project: LaboratoryManagedMediaProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryManagedMediaTargetRecord,
    artifactBase: string,
    transcriptSampleSeconds: number
  ) => Promise<unknown>;
  normalizeProcessArtifact: (rawValue: unknown) => LaboratoryProcessArtifactRecord;
  normalizeProcessFinding: (rawValue: unknown) => LaboratoryProcessFindingRecord;
  partitionVisualAnalysisModuleIds: (
    runtime: LaboratoryManagedMediaRuntime,
    moduleIds: string[]
  ) => LaboratoryRecord;
  resolveEnabledVisualAnalysisModuleIds: (
    runtime: LaboratoryManagedMediaRuntime,
    project: LaboratoryManagedMediaProjectRecord,
    sourceKind: string | null
  ) => string[];
  runAudioStructureProbe: (
    runtime: LaboratoryManagedMediaRuntime,
    project: LaboratoryManagedMediaProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryManagedMediaTargetRecord,
    options?: LaboratoryRecord
  ) => Promise<unknown>;
  runVideoStructureProbe: (
    runtime: LaboratoryManagedMediaRuntime,
    project: LaboratoryManagedMediaProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryManagedMediaTargetRecord,
    options?: LaboratoryRecord
  ) => Promise<unknown>;
  toRecord: (value: unknown) => LaboratoryRecord;
  updateProcessModule: (
    processRecord: LaboratoryManagedMediaProcessRecord,
    moduleId: string,
    patch: LaboratoryRecord
  ) => LaboratoryManagedMediaProcessRecord;
};

export function createLaboratoryManagedMediaRunnerRuntime(deps: LaboratoryManagedMediaRunnerDeps) {
  const {
    asNonEmptyString,
    buildProcessSpeechAvailability,
    clampProfileTranscriptSampleSeconds,
    createProcessFinding,
    generateProcessFramePreviewArtifact,
    generateProcessImageComparisonArtifact,
    generateProcessMetadataArtifact,
    generateProcessSpectrogram,
    generateProcessVisualTransformArtifact,
    maybeRunTranscriptProfileSample,
    normalizeProcessArtifact,
    normalizeProcessFinding,
    partitionVisualAnalysisModuleIds,
    resolveEnabledVisualAnalysisModuleIds,
    runAudioStructureProbe,
    runVideoStructureProbe,
    toRecord,
    updateProcessModule,
  } = deps;

  function toUnknownArray(value: unknown): unknown[] {
    return Array.isArray(value)
      ? value.map(function (entry): unknown {
          return entry;
        })
      : [];
  }

  function toProcessModuleRecord(value: unknown): LaboratoryProcessModuleRecord {
    return toRecord(value);
  }

  function toProcessArtifactRecord(value: unknown): LaboratoryProcessArtifactRecord {
    return toRecord(value);
  }

  function toSpeechAvailabilityRecord(value: unknown): LaboratorySpeechAvailabilityRecord {
    return toRecord(value);
  }

  function toVideoProbeRecord(value: unknown): LaboratoryVideoProbeRecord {
    return toRecord(value);
  }

  function toAudioProbeRecord(value: unknown): LaboratoryAudioProbeRecord {
    return toRecord(value);
  }

  function toProbeBucketRecord(value: unknown): LaboratoryProbeBucketRecord {
    return toRecord(value);
  }

  function toTranscriptResultRecord(value: unknown): LaboratoryTranscriptResultRecord {
    return toRecord(value);
  }

  const {
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
  } = createManagedMediaVisualHelpers({
    asNonEmptyString,
    createProcessFinding,
    normalizeProcessFinding,
    toRecord,
  });

  function getSourceKind(project: LaboratoryManagedMediaProjectRecord): string {
    return asNonEmptyString(toRecord(project.source)["kind"]) || "video";
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

  function getComparisonTargetPath(target: LaboratoryRecord): string | null {
    return asNonEmptyString(target["localPath"]) || asNonEmptyString(target["path"]);
  }

  function getTargetCandidatePath(target: LaboratoryRecord): string | null {
    return (
      getComparisonTargetPath(target) ||
      asNonEmptyString(target["url"]) ||
      asNonEmptyString(target["fileName"]) ||
      asNonEmptyString(target["name"])
    );
  }

  function getProcessTargetSourceKind(
    target: LaboratoryRecord
  ): "video" | "audio" | "image" | null {
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
    return getLabSourceKindForExtension(getLabPathExtension(getTargetCandidatePath(target)));
  }

  function buildComparisonProcessTarget(
    scopeTarget: LaboratoryRecord,
    fallbackTarget: LaboratoryManagedMediaTargetRecord,
    fallbackLabel: string
  ): LaboratoryManagedMediaTargetRecord | null {
    const path = getComparisonTargetPath(scopeTarget) || asNonEmptyString(fallbackTarget.path);
    if (path === null) {
      return null;
    }
    const label =
      asNonEmptyString(scopeTarget["label"]) ||
      asNonEmptyString(scopeTarget["name"]) ||
      asNonEmptyString(scopeTarget["fileName"]) ||
      asNonEmptyString(fallbackTarget["label"]) ||
      fallbackLabel;
    const fileName =
      asNonEmptyString(scopeTarget["fileName"]) ||
      getPathLeaf(path) ||
      asNonEmptyString(fallbackTarget["fileName"]);
    return {
      ...fallbackTarget,
      fileName,
      label,
      metadata: {
        ...toRecord(fallbackTarget.metadata),
        ...toRecord(scopeTarget["metadata"]),
        comparisonTarget: scopeTarget,
      },
      mimeType:
        asNonEmptyString(scopeTarget["mimeType"]) || asNonEmptyString(fallbackTarget["mimeType"]),
      mode: asNonEmptyString(scopeTarget["mode"]) || asNonEmptyString(fallbackTarget["mode"]),
      outputId:
        asNonEmptyString(scopeTarget["assetId"]) || asNonEmptyString(fallbackTarget["outputId"]),
      path,
      requestedMode:
        asNonEmptyString(scopeTarget["requestedMode"]) ||
        asNonEmptyString(fallbackTarget["requestedMode"]),
      signature:
        asNonEmptyString(scopeTarget["signature"]) ||
        asNonEmptyString(fallbackTarget["signature"]) ||
        path,
      sourceKind:
        getProcessTargetSourceKind(scopeTarget) ||
        getProcessTargetSourceKind(fallbackTarget) ||
        "image",
    };
  }

  function resolveImageComparisonPair(
    processRecord: LaboratoryManagedMediaProcessRecord,
    target: LaboratoryManagedMediaTargetRecord
  ) {
    const comparison = toRecord(toRecord(processRecord.analysisScope)["comparison"]);
    const primaryScope = toRecord(comparison["primary"]);
    const referenceScope = toRecord(comparison["reference"]);
    if (
      getProcessTargetSourceKind(primaryScope) !== "image" ||
      getProcessTargetSourceKind(referenceScope) !== "image"
    ) {
      return null;
    }
    const primaryTarget = buildComparisonProcessTarget(primaryScope, target, "A Primary Image");
    const referenceTarget = buildComparisonProcessTarget(referenceScope, {}, "B Reference Image");
    if (primaryTarget === null || referenceTarget === null) {
      return null;
    }
    const primaryId =
      asNonEmptyString(primaryScope["assetId"]) || asNonEmptyString(primaryTarget.path);
    const referenceId =
      asNonEmptyString(referenceScope["assetId"]) || asNonEmptyString(referenceTarget.path);
    return {
      activeSide: asNonEmptyString(comparison["activeSide"]),
      comparison,
      pairId: `${primaryId || "primary"}::${referenceId || "reference"}`,
      primaryTarget,
      referenceTarget,
    };
  }

  function getModuleStatus(
    processRecord: LaboratoryManagedMediaProcessRecord,
    moduleId: string
  ): string | null {
    const modules = toUnknownArray(processRecord.modules).map(toProcessModuleRecord);
    const moduleRecord =
      modules.find(function (entry) {
        return asNonEmptyString(entry.id) === moduleId;
      }) || null;
    return moduleRecord ? asNonEmptyString(moduleRecord.status) : null;
  }

  function getProbeCount(value: unknown): number {
    const bucket = toProbeBucketRecord(value);
    return typeof bucket.count === "number" && Number.isFinite(bucket.count) ? bucket.count : 0;
  }

  function toFiniteNumber(value: unknown): number | null {
    const numericValue = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  function normalizeProbeSegment(value: unknown): LaboratoryRecord | null {
    const segment = toRecord(value);
    const startSeconds = toFiniteNumber(segment["startSeconds"]);
    const endSeconds = toFiniteNumber(segment["endSeconds"]);
    const durationSeconds = toFiniteNumber(segment["durationSeconds"]);
    if (startSeconds === null && endSeconds === null && durationSeconds === null) {
      return null;
    }
    return {
      startSeconds,
      endSeconds,
      durationSeconds: durationSeconds || 0,
    };
  }

  function summarizeProbeBucket(value: unknown): LaboratoryRecord {
    const bucket = toProbeBucketRecord(value);
    const segments = toUnknownArray(bucket.segments)
      .map(normalizeProbeSegment)
      .filter((entry): entry is LaboratoryRecord => entry !== null);
    return {
      averageDurationSeconds: toFiniteNumber(bucket.averageDurationSeconds),
      count: getProbeCount(bucket),
      maxDurationSeconds: toFiniteNumber(bucket.maxDurationSeconds),
      segments: segments.slice(0, 12),
      totalDurationSeconds: toFiniteNumber(bucket.totalDurationSeconds) || 0,
    };
  }

  function formatSeconds(value: unknown): string | null {
    const numericValue = toFiniteNumber(value);
    return numericValue === null ? null : `${numericValue.toFixed(2)}s`;
  }

  function formatProbeSummary(label: string, summary: LaboratoryRecord): string | null {
    const count = toFiniteNumber(summary["count"]) || 0;
    if (count <= 0) {
      return null;
    }
    const total = formatSeconds(summary["totalDurationSeconds"]) || "0.00s";
    const max = formatSeconds(summary["maxDurationSeconds"]);
    return `${label}: ${String(count)} interval(s), ${total} total${max ? `, ${max} max` : ""}.`;
  }

  function formatRatioPercent(value: unknown): string | null {
    const numericValue = toFiniteNumber(value);
    return numericValue === null ? null : `${(numericValue * 100).toFixed(1)}%`;
  }

  function formatVideoForensicProbeSummary(probeSummary: LaboratoryRecord): string | null {
    const duplicateFrame = toRecord(
      probeSummary["nearDuplicateFrame"] || probeSummary["duplicateFrame"]
    );
    const compressionSignature = toRecord(probeSummary["compressionSignature"]);
    const forensicSignature = toRecord(
      probeSummary["compressionSignatureMapping"] || probeSummary["forensicSignature"]
    );
    const freezeAttribution = toRecord(probeSummary["freezeAttribution"]);
    const opticalFlow = toRecord(
      probeSummary["opticalFlowTracking"] || probeSummary["opticalFlow"]
    );
    const duplicateCount = toFiniteNumber(duplicateFrame["exactDuplicateFrameCount"]) || 0;
    const duplicateRatio = formatRatioPercent(duplicateFrame["exactDuplicateFrameRatio"]);
    const riskLevel = asNonEmptyString(compressionSignature["riskLevel"]);
    const artifactFamily = asNonEmptyString(forensicSignature["artifactFamily"]);
    const artifactConfidence = asNonEmptyString(forensicSignature["confidence"]);
    const classification = asNonEmptyString(freezeAttribution["classification"]);
    const flowClass = asNonEmptyString(opticalFlow["movementClass"]);
    const flowRatio = toFiniteNumber(opticalFlow["subjectBackgroundMotionRatio"]);
    const parts = [
      duplicateCount > 0
        ? `duplicate frames: ${String(duplicateCount)}${duplicateRatio ? ` (${duplicateRatio})` : ""}`
        : null,
      riskLevel ? `compression risk: ${riskLevel}` : null,
      artifactFamily && artifactFamily !== "baseline_no_dominant_artifact_signature"
        ? `artifact family: ${artifactFamily}${artifactConfidence ? ` (${artifactConfidence})` : ""}`
        : null,
      classification && classification !== "baseline" ? `attribution: ${classification}` : null,
      flowClass
        ? `motion split: ${flowClass}${flowRatio === null ? "" : ` (${flowRatio.toFixed(2)}x)`}`
        : null,
    ].filter((entry): entry is string => entry !== null);
    return parts.length === 0 ? null : `Forensic attribution ${parts.join("; ")}.`;
  }

  function isMeasuredProbeRecord(record: LaboratoryRecord): boolean {
    return (
      asNonEmptyString(record["status"]) === "measured" &&
      toFiniteNumber(record["sampledFrameCount"]) !== null
    );
  }

  function getFirstProbeWindow(summary: LaboratoryRecord): LaboratoryRecord {
    const firstSegment = toRecord(toUnknownArray(summary["segments"])[0]);
    return {
      startSeconds: toFiniteNumber(firstSegment["startSeconds"]),
      endSeconds: toFiniteNumber(firstSegment["endSeconds"]),
      durationSeconds: toFiniteNumber(firstSegment["durationSeconds"]),
    };
  }

  function getVisualSignalType(visualModuleId: string): string {
    if (visualModuleId === "frame-consistency") {
      return "freeze";
    }
    if (visualModuleId === "temporal-noise-pattern" || visualModuleId === "lighting-consistency") {
      return "luminance-collapse";
    }
    return "motion-discontinuity";
  }

  function buildFindingMetadata(
    signalType: string,
    label: string,
    probeSummary: LaboratoryRecord,
    window: LaboratoryRecord
  ): LaboratoryRecord {
    const duplicateFrame = toRecord(
      probeSummary["nearDuplicateFrame"] || probeSummary["duplicateFrame"]
    );
    const frameCadence = toRecord(probeSummary["frameCadence"]);
    const compressionSignature = toRecord(probeSummary["compressionSignature"]);
    const forensicSignature = toRecord(
      probeSummary["compressionSignatureMapping"] || probeSummary["forensicSignature"]
    );
    const metadataProvenance = toRecord(probeSummary["metadataProvenance"]);
    const opticalFlow = toRecord(
      probeSummary["opticalFlowTracking"] || probeSummary["opticalFlow"]
    );
    const referenceQuality = toRecord(probeSummary["referenceQuality"]);
    const measuredChecklist = [
      "freezedetect intervals",
      "blackdetect intervals",
      isMeasuredProbeRecord(duplicateFrame) ? "duplicate-frame ratio" : null,
      isMeasuredProbeRecord(frameCadence) ? "frame cadence drift" : null,
      isMeasuredProbeRecord(compressionSignature) ? "compression packet signature" : null,
      isMeasuredProbeRecord(forensicSignature) ? "forensic signature mapping" : null,
      isMeasuredProbeRecord(metadataProvenance) ? "metadata provenance cross-check" : null,
      isMeasuredProbeRecord(opticalFlow) ? "optical-flow ROI/background split" : null,
      isMeasuredProbeRecord(referenceQuality) ? "reference quality metric" : null,
    ].filter((entry): entry is string => entry !== null);
    return {
      attribution: toRecord(probeSummary["freezeAttribution"]),
      correlation: {
        label,
        signalType,
        window,
      },
      forensicChecklist: isMeasuredProbeRecord(opticalFlow)
        ? measuredChecklist
        : measuredChecklist.concat(["optical-flow object/background split pending"]),
      probeSummary,
      temporalSegments: toUnknownArray(window["segments"]),
    };
  }

  function withFindingMetadata(
    finding: LaboratoryProcessFindingRecord,
    metadata: LaboratoryRecord
  ): LaboratoryProcessFindingRecord {
    return {
      ...finding,
      metadata: {
        ...toRecord(finding.metadata),
        ...metadata,
      },
    };
  }

  function normalizeNarrativeText(text: string): string {
    return text
      .toLocaleLowerCase("tr-TR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ı/g, "i")
      .replace(/ç/g, "c")
      .replace(/ğ/g, "g")
      .replace(/ö/g, "o")
      .replace(/ş/g, "s")
      .replace(/ü/g, "u");
  }

  function findNarrativeTriggers(text: string): string[] {
    const normalized = normalizeNarrativeText(text);
    const triggers = [
      "kaybol",
      "belir",
      "gorun",
      "dondu",
      "karardi",
      "ses",
      "ciglik",
      "simdi",
      "tam o anda",
      "bagir",
      "nefes",
      "panik",
      "kork",
      "tepki",
      "vanish",
      "disappear",
      "appear",
      "freeze",
      "dark",
      "scream",
      "now",
    ];
    return Array.from(
      new Set(
        triggers.map(normalizeNarrativeText).filter(function (trigger) {
          return normalized.includes(trigger);
        })
      )
    );
  }

  function normalizeOptionalArtifact(value: unknown): LaboratoryProcessArtifactRecord | null {
    if (value === null || value === undefined) {
      return null;
    }
    return toProcessArtifactRecord(normalizeProcessArtifact(value));
  }

  function collectArtifactIdsForModule(
    artifacts: LaboratoryProcessArtifactRecord[],
    moduleId: string
  ): string[] {
    return artifacts
      .filter(function (entry) {
        return asNonEmptyString(entry.moduleId) === moduleId;
      })
      .map(function (entry) {
        return asNonEmptyString(entry.id);
      })
      .filter((artifactId): artifactId is string => artifactId !== null);
  }

  async function runMediaManagedProcess(
    runtime: LaboratoryManagedMediaRuntime,
    project: LaboratoryManagedMediaProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryManagedMediaTargetRecord,
    artifactBase: string,
    outputDir: string,
    processRecord: LaboratoryManagedMediaProcessRecord,
    emitRuntimeUpdate: LaboratoryManagedMediaUpdateEmitter = null
  ): Promise<LaboratoryManagedMediaRunnerResult> {
    const findings: LaboratoryProcessFindingRecord[] = [];
    const artifacts: LaboratoryProcessArtifactRecord[] = [];
    const warnings: string[] = [];
    const comparisonPair = resolveImageComparisonPair(processRecord, target);
    const primaryTarget = comparisonPair?.primaryTarget || target;
    const sourceKind =
      comparisonPair === null
        ? getProcessTargetSourceKind(primaryTarget) || getSourceKind(project)
        : "image";

    if (comparisonPair !== null) {
      processRecord["targetSummary"] = {
        ...toRecord(processRecord["targetSummary"]),
        requestedMode: comparisonPair.primaryTarget["requestedMode"],
        mode: comparisonPair.primaryTarget["mode"],
        outputId: comparisonPair.primaryTarget["outputId"],
        signature: comparisonPair.primaryTarget["signature"],
        label: comparisonPair.primaryTarget["label"],
        fileName: comparisonPair.primaryTarget["fileName"],
        mimeType: comparisonPair.primaryTarget["mimeType"],
        path: comparisonPair.primaryTarget["path"],
      };
      processRecord["comparisonTargetSummary"] = {
        activeSide: comparisonPair.activeSide,
        pairId: comparisonPair.pairId,
        primary: {
          label: comparisonPair.primaryTarget["label"],
          fileName: comparisonPair.primaryTarget["fileName"],
          path: comparisonPair.primaryTarget["path"],
        },
        reference: {
          label: comparisonPair.referenceTarget["label"],
          fileName: comparisonPair.referenceTarget["fileName"],
          path: comparisonPair.referenceTarget["path"],
        },
      };
    }

    const metadataArtifact = normalizeOptionalArtifact(
      await generateProcessMetadataArtifact(
        runtime,
        project,
        primaryTarget,
        artifactBase,
        outputDir,
        "intake"
      )
    );
    if (metadataArtifact !== null) {
      artifacts.push(metadataArtifact);
    }
    const referenceMetadataArtifact =
      comparisonPair === null
        ? null
        : normalizeOptionalArtifact(
            await generateProcessMetadataArtifact(
              runtime,
              project,
              comparisonPair.referenceTarget,
              `${artifactBase}-reference`,
              outputDir,
              "intake"
            )
          );
    if (referenceMetadataArtifact !== null) {
      artifacts.push(referenceMetadataArtifact);
    }

    updateProcessModule(processRecord, "intake", {
      status: "ready",
      completedAt: new Date().toISOString(),
      summary:
        comparisonPair === null
          ? "The active target was pinned and its metadata snapshot was saved."
          : "The A/B image targets were pinned and their metadata snapshots were saved.",
      artifactIds: [metadataArtifact, referenceMetadataArtifact]
        .filter((entry): entry is LaboratoryProcessArtifactRecord => entry !== null)
        .map(function (entry) {
          return String(entry.id || "");
        }),
    });
    if (metadataArtifact) {
      emitRuntimeUpdate?.({
        kind: "preview-artifact",
        moduleId: "intake",
        message: "Intake preview artifact ready",
        detail: asNonEmptyString(metadataArtifact.label),
        artifact: metadataArtifact,
        moduleTrace: {
          id: `intake-preview-${Date.now()}`,
          moduleId: "intake",
          stage: "process",
          status: "preview-ready",
          timestamp: new Date().toISOString(),
          message: "Intake preview artifact ready",
          detail: asNonEmptyString(metadataArtifact.label),
        },
        throttleWindow: "intake-module-batch",
      });
    }

    updateProcessModule(processRecord, "cleanup", {
      status: "ready",
      completedAt: new Date().toISOString(),
      summary:
        asNonEmptyString(toRecord(project.edit)["handoffMode"]) === "derived"
          ? "Derived handoff remained selected during the managed run."
          : "The original source remained selected during the managed run.",
    });

    if (getModuleStatus(processRecord, "motion") === "queued") {
      const enabledVisualModuleIds = resolveEnabledVisualAnalysisModuleIds(
        runtime,
        project,
        sourceKind
      );
      const visualPartitions = toRecord(
        partitionVisualAnalysisModuleIds(runtime, enabledVisualModuleIds)
      );
      const structureModuleIds = toUnknownArray(visualPartitions["structure"])
        .map(asNonEmptyString)
        .filter((entry): entry is string => entry !== null);
      const roiScopedStructureSettings =
        structureModuleIds
          .map(function (visualModuleId) {
            return getAnalysisModuleSettings(processRecord, visualModuleId);
          })
          .find(function (settings) {
            return readBooleanSetting(settings, "roiOnly", false) === true;
          }) || null;
      const previewStructureSettings =
        roiScopedStructureSettings ||
        getAnalysisModuleSettings(processRecord, structureModuleIds[0] || "frame-consistency");
      const previewScopeFilter =
        readBooleanSetting(previewStructureSettings, "roiOnly", false) === true
          ? getScopeCropFilter(processRecord, comparisonPair === null ? undefined : "primary")
          : null;
      const referencePreviewScopeFilter =
        comparisonPair !== null &&
        readBooleanSetting(previewStructureSettings, "roiOnly", false) === true
          ? getScopeCropFilter(processRecord, "reference")
          : null;

      updateProcessModule(processRecord, "motion", {
        status: "running",
        startedAt: new Date().toISOString(),
      });
      emitRuntimeUpdate?.({
        kind: "module-progress",
        moduleId: "motion",
        message: "motion module started",
        moduleTrace: {
          id: `motion-running-${Date.now()}`,
          moduleId: "motion",
          stage: "process",
          status: "running",
          timestamp: new Date().toISOString(),
          message: "motion module started",
          detail: null,
        },
        throttleWindow: "motion-module-batch",
      });

      const framePreview = normalizeOptionalArtifact(
        await generateProcessFramePreviewArtifact(
          runtime,
          project,
          requestId,
          jobId,
          primaryTarget,
          `${artifactBase}-motion`,
          outputDir,
          "motion",
          getSamplingWindowSeconds(previewStructureSettings),
          getSamplingTileCount(previewStructureSettings),
          sourceKind === "image"
            ? comparisonPair === null
              ? "Visual Reference Frame"
              : "A Visual Reference Frame"
            : "Structure Frame Preview",
          previewScopeFilter
        )
      );
      if (framePreview !== null) {
        artifacts.push(framePreview);
      }
      const referenceFramePreview =
        comparisonPair === null
          ? null
          : normalizeOptionalArtifact(
              await generateProcessFramePreviewArtifact(
                runtime,
                project,
                requestId,
                jobId,
                comparisonPair.referenceTarget,
                `${artifactBase}-reference-motion`,
                outputDir,
                "motion",
                getSamplingWindowSeconds(previewStructureSettings),
                getSamplingTileCount(previewStructureSettings),
                "B Visual Reference Frame",
                referencePreviewScopeFilter
              )
            );
      if (referenceFramePreview !== null) {
        artifacts.push(referenceFramePreview);
      }

      const visualForensicsProbeSettings = {
        "compression-signature-mapping": getAnalysisModuleSettings(
          processRecord,
          "compression-signature-mapping"
        ),
        "metadata-provenance-audit": getAnalysisModuleSettings(
          processRecord,
          "metadata-provenance-audit"
        ),
        "optical-flow-tracking": getAnalysisModuleSettings(processRecord, "optical-flow-tracking"),
        "perceptual-duplicate-frame": getAnalysisModuleSettings(
          processRecord,
          "perceptual-duplicate-frame"
        ),
        "reference-quality-check": getAnalysisModuleSettings(
          processRecord,
          "reference-quality-check"
        ),
      };
      const videoProbe =
        sourceKind === "video" || sourceKind === "image"
          ? toVideoProbeRecord(
              await runVideoStructureProbe(runtime, project, requestId, jobId, primaryTarget, {
                analysisScope: processRecord["analysisScope"],
                moduleSettings: visualForensicsProbeSettings,
                referenceTarget: comparisonPair?.referenceTarget,
                sourceKind,
              })
            )
          : toVideoProbeRecord({});
      const freezeCount = getProbeCount(videoProbe.freeze);
      const blackCount = getProbeCount(videoProbe.black);
      const freezeSummary = summarizeProbeBucket(videoProbe.freeze);
      const blackSummary = summarizeProbeBucket(videoProbe.black);
      const duplicateFrameSummary = toRecord(
        videoProbe.nearDuplicateFrame || videoProbe.duplicateFrame
      );
      const frameCadenceSummary = toRecord(videoProbe.frameCadence);
      const compressionSignatureSummary = toRecord(videoProbe.compressionSignature);
      const forensicSignatureSummary = toRecord(
        videoProbe.compressionSignatureMapping || videoProbe.forensicSignature
      );
      const gopStructureSummary = toRecord(videoProbe.gopStructure);
      const metadataProvenanceSummary = toRecord(videoProbe.metadataProvenance);
      const opticalFlowSummary = toRecord(videoProbe.opticalFlowTracking || videoProbe.opticalFlow);
      const referenceQualitySummary = toRecord(videoProbe.referenceQuality);
      const freezeAttributionSummary = toRecord(videoProbe.freezeAttribution);
      const duplicateFrameCount =
        toFiniteNumber(duplicateFrameSummary["exactDuplicateFrameCount"]) || 0;
      const compressionRiskLevel = asNonEmptyString(compressionSignatureSummary["riskLevel"]);
      const opticalFlowClass = asNonEmptyString(opticalFlowSummary["movementClass"]);
      const subjectMotionEnergy = toFiniteNumber(opticalFlowSummary["subjectMotionEnergy"]);
      const backgroundMotionEnergy = toFiniteNumber(opticalFlowSummary["backgroundMotionEnergy"]);
      const freezeAttributionClassification = asNonEmptyString(
        freezeAttributionSummary["classification"]
      );
      const structureProbeSummary = {
        black: blackSummary,
        compressionSignature: compressionSignatureSummary,
        compressionSignatureMapping: forensicSignatureSummary,
        duplicateFrame: duplicateFrameSummary,
        frameCadence: frameCadenceSummary,
        freeze: freezeSummary,
        forensicSignature: forensicSignatureSummary,
        freezeAttribution: freezeAttributionSummary,
        gopStructure: gopStructureSummary,
        metadataProvenance: metadataProvenanceSummary,
        nearDuplicateFrame: duplicateFrameSummary,
        opticalFlow: opticalFlowSummary,
        opticalFlowTracking: opticalFlowSummary,
        referenceQuality: referenceQualitySummary,
      };
      const probeDetail = [
        formatProbeSummary("freeze", freezeSummary),
        formatProbeSummary("black", blackSummary),
        formatVideoForensicProbeSummary(structureProbeSummary),
      ]
        .filter((entry): entry is string => entry !== null)
        .join(" ");
      function getStructureProbeSummary(visualModuleId: string) {
        return visualModuleId === "frame-consistency"
          ? freezeSummary
          : visualModuleId === "temporal-noise-pattern" || visualModuleId === "lighting-consistency"
            ? blackSummary
            : freezeCount > 0
              ? freezeSummary
              : blackSummary;
      }
      function buildStructureFindingMetadata(visualModuleId: string) {
        const primarySummary = getStructureProbeSummary(visualModuleId);
        const primaryCount = toFiniteNumber(primarySummary["count"]) || 0;
        const duplicateFallbackCount =
          visualModuleId === "frame-consistency" ? duplicateFrameCount : 0;
        if (primaryCount <= 0 && duplicateFallbackCount <= 0) {
          return {
            probeSummary: structureProbeSummary,
          };
        }
        const signalSummary = primaryCount > 0 ? primarySummary : duplicateFrameSummary;
        const window = getFirstProbeWindow(signalSummary);
        const segments = toUnknownArray(signalSummary["segments"]);
        return {
          ...buildFindingMetadata(
            getVisualSignalType(visualModuleId),
            visualModuleId,
            structureProbeSummary,
            window
          ),
          temporalSegments: segments,
        };
      }
      const structureArtifactIds =
        framePreview && typeof framePreview.id === "string" ? [framePreview.id] : [];
      const referenceStructureArtifactIds =
        referenceFramePreview && typeof referenceFramePreview.id === "string"
          ? [referenceFramePreview.id]
          : [];
      structureModuleIds.forEach(function (visualModuleId) {
        const moduleSettings = getAnalysisModuleSettings(processRecord, visualModuleId);
        const descriptor = buildVisualFindingDetail(
          visualModuleId,
          freezeCount,
          blackCount,
          sourceKind,
          {
            compressionRiskLevel,
            duplicateFrameCount,
            backgroundMotionEnergy,
            forensicArtifactFamily: asNonEmptyString(forensicSignatureSummary["artifactFamily"]),
            forensicConfidence: asNonEmptyString(forensicSignatureSummary["confidence"]),
            metadataProvenanceStatus: asNonEmptyString(metadataProvenanceSummary["status"]),
            opticalFlowClass,
            referenceQualityStatus: asNonEmptyString(referenceQualitySummary["status"]),
            freezeAttribution: freezeAttributionClassification,
            subjectMotionEnergy,
          }
        );
        findings.push(
          withFindingMetadata(
            createMediaFinding(processRecord, "motion", visualModuleId, {
              artifactIds: structureArtifactIds,
              detail: `${descriptor.detail} ${probeDetail} Sampling used ${readStringSetting(
                moduleSettings,
                "samplingDensity",
                "balanced"
              )} density with a ${String(getSamplingTileCount(moduleSettings))}-tile preview.`,
              evidenceCount:
                descriptor.level === "medium"
                  ? Math.max(
                      1,
                      freezeCount +
                        blackCount +
                        duplicateFrameCount +
                        (isMeasuredProbeRecord(opticalFlowSummary) ? 1 : 0)
                    )
                  : 1,
              level: getSensitivityAdjustedLevel(
                descriptor.level,
                moduleSettings,
                freezeCount +
                  blackCount +
                  duplicateFrameCount +
                  (isMeasuredProbeRecord(opticalFlowSummary) ? 1 : 0)
              ),
              settingsUsed: {
                ...moduleSettings,
                sourceSide: comparisonPair === null ? "single" : "primary",
                roiOnly: readBooleanSetting(moduleSettings, "roiOnly", false),
                sampleWindowSeconds: getSamplingWindowSeconds(moduleSettings),
                tileCount: getSamplingTileCount(moduleSettings),
              },
              title: comparisonPair === null ? descriptor.title : `A: ${descriptor.title}`,
            }),
            buildStructureFindingMetadata(visualModuleId)
          )
        );
      });
      if (comparisonPair !== null) {
        structureModuleIds.forEach(function (visualModuleId) {
          const moduleSettings = getAnalysisModuleSettings(processRecord, visualModuleId);
          const descriptor = buildVisualFindingDetail(
            visualModuleId,
            freezeCount,
            blackCount,
            sourceKind,
            {
              compressionRiskLevel,
              duplicateFrameCount,
              backgroundMotionEnergy,
              forensicArtifactFamily: asNonEmptyString(forensicSignatureSummary["artifactFamily"]),
              forensicConfidence: asNonEmptyString(forensicSignatureSummary["confidence"]),
              metadataProvenanceStatus: asNonEmptyString(metadataProvenanceSummary["status"]),
              opticalFlowClass,
              referenceQualityStatus: asNonEmptyString(referenceQualitySummary["status"]),
              freezeAttribution: freezeAttributionClassification,
              subjectMotionEnergy,
            }
          );
          findings.push(
            withFindingMetadata(
              createMediaFinding(processRecord, "motion", visualModuleId, {
                artifactIds: referenceStructureArtifactIds,
                detail: `B reference image: ${descriptor.detail} ${probeDetail} Sampling used ${readStringSetting(
                  moduleSettings,
                  "samplingDensity",
                  "balanced"
                )} density with a ${String(getSamplingTileCount(moduleSettings))}-tile preview.`,
                evidenceCount:
                  descriptor.level === "medium"
                    ? Math.max(
                        1,
                        freezeCount +
                          blackCount +
                          duplicateFrameCount +
                          (isMeasuredProbeRecord(opticalFlowSummary) ? 1 : 0)
                      )
                    : 1,
                level: getSensitivityAdjustedLevel(
                  descriptor.level,
                  moduleSettings,
                  freezeCount +
                    blackCount +
                    duplicateFrameCount +
                    (isMeasuredProbeRecord(opticalFlowSummary) ? 1 : 0)
                ),
                settingsUsed: {
                  ...moduleSettings,
                  sourceSide: "reference",
                  roiOnly: readBooleanSetting(moduleSettings, "roiOnly", false),
                  sampleWindowSeconds: getSamplingWindowSeconds(moduleSettings),
                  tileCount: getSamplingTileCount(moduleSettings),
                },
                title: `B: ${descriptor.title}`,
              }),
              buildStructureFindingMetadata(visualModuleId)
            )
          );
        });
      }
      const motionFindings = findings.filter(function (entry) {
        return asNonEmptyString(entry.moduleId) === "motion";
      });
      if (framePreview !== null) {
        emitRuntimeUpdate?.({
          kind: "preview-artifact",
          moduleId: "motion",
          message: "motion preview artifact ready",
          detail: asNonEmptyString(framePreview.label),
          artifact: framePreview,
          moduleTrace: {
            id: `motion-preview-${Date.now()}`,
            moduleId: "motion",
            stage: "process",
            status: "preview-ready",
            timestamp: new Date().toISOString(),
            message: "motion preview artifact ready",
            detail: asNonEmptyString(framePreview.label),
          },
          throttleWindow: "motion-module-batch",
        });
      }
      if (motionFindings.length > 0) {
        const primaryMotionFinding = motionFindings[0];
        if (primaryMotionFinding) {
          emitRuntimeUpdate?.({
            kind: "live-finding",
            moduleId: "motion",
            message: "motion findings updated",
            detail:
              motionFindings.length > 1
                ? `${motionFindings.length} visual findings were aggregated for the motion window.`
                : asNonEmptyString(primaryMotionFinding.detail) ||
                  asNonEmptyString(primaryMotionFinding.title) ||
                  "Motion finding emitted.",
            finding: primaryMotionFinding,
            moduleTrace: {
              id: `motion-finding-${Date.now()}`,
              moduleId: "motion",
              stage: "process",
              status: "finding",
              timestamp: new Date().toISOString(),
              message: "motion findings updated",
              detail:
                motionFindings.length > 1
                  ? `${motionFindings.length} visual findings were aggregated for the motion window.`
                  : asNonEmptyString(primaryMotionFinding.detail) ||
                    asNonEmptyString(primaryMotionFinding.title) ||
                    "Motion finding emitted.",
            },
            throttleWindow: "motion-module-batch",
          });
        }
      }

      updateProcessModule(processRecord, "motion", {
        status: "ready",
        completedAt: new Date().toISOString(),
        summary:
          structureModuleIds.length > 0
            ? `${structureModuleIds.length} structural visual module(s) completed on the active target.`
            : "Structural visual checks finished for the active target.",
        artifactIds: collectArtifactIdsForModule(artifacts, "motion"),
      });
      emitRuntimeUpdate?.({
        kind: "module-progress",
        moduleId: "motion",
        message: "motion module completed",
        detail:
          structureModuleIds.length > 0
            ? `${structureModuleIds.length} structural visual module(s) completed on the active target.`
            : "Video structure checks finished for the active target.",
        moduleTrace: {
          id: `motion-completed-${Date.now()}`,
          moduleId: "motion",
          stage: "process",
          status: "ready",
          timestamp: new Date().toISOString(),
          message: "motion module completed",
          detail:
            structureModuleIds.length > 0
              ? `${structureModuleIds.length} structural visual module(s) completed on the active target.`
              : "Video structure checks finished for the active target.",
        },
        throttleWindow: "motion-module-batch",
      });
    }

    if (getModuleStatus(processRecord, "visual-signal") === "queued") {
      const enabledVisualModuleIds = resolveEnabledVisualAnalysisModuleIds(
        runtime,
        project,
        sourceKind
      );
      const visualPartitions = toRecord(
        partitionVisualAnalysisModuleIds(runtime, enabledVisualModuleIds)
      );
      const revealModuleIds = toUnknownArray(visualPartitions["reveal"])
        .map(asNonEmptyString)
        .filter((entry): entry is string => entry !== null);

      updateProcessModule(processRecord, "visual-signal", {
        status: "running",
        startedAt: new Date().toISOString(),
      });
      emitRuntimeUpdate?.({
        kind: "module-progress",
        moduleId: "visual-signal",
        message: "visual-signal module started",
        moduleTrace: {
          id: `visual-signal-running-${Date.now()}`,
          moduleId: "visual-signal",
          stage: "process",
          status: "running",
          timestamp: new Date().toISOString(),
          message: "visual-signal module started",
          detail: null,
        },
        throttleWindow: "visual-signal-module-batch",
      });

      const revealArtifacts: LaboratoryProcessArtifactRecord[] = [];
      const referenceRevealArtifacts: LaboratoryProcessArtifactRecord[] = [];
      await revealModuleIds.reduce<Promise<void>>(async (previous, visualModuleId) => {
        await previous;
        if (!visualModuleId) {
          return;
        }
        const moduleSettings = getAnalysisModuleSettings(processRecord, visualModuleId);
        const filterConfig = getRevealFilterConfig(visualModuleId, moduleSettings);
        const filterGraph = applyRoiScopeFilter(
          processRecord,
          moduleSettings,
          filterConfig.filterGraph,
          comparisonPair === null ? undefined : "primary"
        );
        const transformArtifact = normalizeOptionalArtifact(
          await generateProcessVisualTransformArtifact(
            runtime,
            project,
            requestId,
            jobId,
            primaryTarget,
            `${artifactBase}-${visualModuleId}`,
            outputDir,
            "visual-signal",
            filterGraph,
            comparisonPair === null ? filterConfig.label : `A ${filterConfig.label}`,
            {
              comparisonPairId: comparisonPair?.pairId || null,
              scopeReference: getScopeReference(processRecord),
              sourceSide: comparisonPair === null ? "single" : "primary",
              sourceModule: visualModuleId,
              sourceKind,
              settingsUsed: moduleSettings,
            }
          )
        );
        if (transformArtifact !== null) {
          revealArtifacts.push(transformArtifact);
          artifacts.push(transformArtifact);
        }
      }, Promise.resolve());
      if (comparisonPair !== null) {
        await revealModuleIds.reduce<Promise<void>>(async (previous, visualModuleId) => {
          await previous;
          if (!visualModuleId) {
            return;
          }
          const moduleSettings = getAnalysisModuleSettings(processRecord, visualModuleId);
          const filterConfig = getRevealFilterConfig(visualModuleId, moduleSettings);
          const filterGraph = applyRoiScopeFilter(
            processRecord,
            moduleSettings,
            filterConfig.filterGraph,
            "reference"
          );
          const transformArtifact = normalizeOptionalArtifact(
            await generateProcessVisualTransformArtifact(
              runtime,
              project,
              requestId,
              jobId,
              comparisonPair.referenceTarget,
              `${artifactBase}-reference-${visualModuleId}`,
              outputDir,
              "visual-signal",
              filterGraph,
              `B ${filterConfig.label}`,
              {
                comparisonPairId: comparisonPair.pairId,
                scopeReference: getScopeReference(processRecord),
                sourceSide: "reference",
                sourceModule: visualModuleId,
                sourceKind,
                settingsUsed: moduleSettings,
              }
            )
          );
          if (transformArtifact !== null) {
            referenceRevealArtifacts.push(transformArtifact);
            artifacts.push(transformArtifact);
          }
        }, Promise.resolve());
      }

      const comparisonVariants: LaboratoryRecord[] = [];
      revealModuleIds.forEach(function (visualModuleId, index) {
        const moduleSettings = getAnalysisModuleSettings(processRecord, visualModuleId);
        const filterConfig = getRevealFilterConfig(visualModuleId, moduleSettings);
        const transformArtifact = revealArtifacts[index] || revealArtifacts[0] || null;
        const referenceTransformArtifact =
          referenceRevealArtifacts[index] || referenceRevealArtifacts[0] || null;
        const artifactIds =
          transformArtifact && typeof transformArtifact.id === "string"
            ? [transformArtifact.id]
            : [];
        const comparisonVariant = {
          id: `visual-variant-${visualModuleId}`,
          moduleId: "visual-signal",
          sourceModule: visualModuleId,
          label: filterConfig.label,
          sourceSide: comparisonPair === null ? "single" : "primary",
          settingsUsed: moduleSettings,
          artifactId: transformArtifact ? asNonEmptyString(transformArtifact.id) : null,
          artifactPath: transformArtifact ? asNonEmptyString(transformArtifact.path) : null,
          active: index === 0,
        };
        comparisonVariants.push(comparisonVariant);
        if (comparisonPair !== null) {
          comparisonVariants.push({
            id: `visual-variant-reference-${visualModuleId}`,
            moduleId: "visual-signal",
            sourceModule: visualModuleId,
            label: `B ${filterConfig.label}`,
            sourceSide: "reference",
            settingsUsed: moduleSettings,
            artifactId: referenceTransformArtifact
              ? asNonEmptyString(referenceTransformArtifact.id)
              : null,
            artifactPath: referenceTransformArtifact
              ? asNonEmptyString(referenceTransformArtifact.path)
              : null,
            active: false,
          });
        }
        findings.push(
          createMediaFinding(processRecord, "visual-signal", visualModuleId, {
            artifactIds,
            detail:
              comparisonPair === null
                ? `${filterConfig.label} generated a reveal-oriented preview variant for the selected scope.`
                : `A image: ${filterConfig.label} generated a reveal-oriented preview variant for the selected comparison scope.`,
            settingsUsed: {
              ...moduleSettings,
              sourceSide: comparisonPair === null ? "single" : "primary",
            },
            title:
              comparisonPair === null
                ? `${filterConfig.label} variant generated`
                : `A: ${filterConfig.label} variant generated`,
          })
        );
        if (comparisonPair !== null) {
          const referenceArtifactIds =
            referenceTransformArtifact && typeof referenceTransformArtifact.id === "string"
              ? [referenceTransformArtifact.id]
              : [];
          findings.push(
            createMediaFinding(processRecord, "visual-signal", visualModuleId, {
              artifactIds: referenceArtifactIds,
              detail: `B reference image: ${filterConfig.label} generated a reveal-oriented preview variant for the selected comparison scope.`,
              settingsUsed: {
                ...moduleSettings,
                sourceSide: "reference",
              },
              title: `B: ${filterConfig.label} variant generated`,
            })
          );
        }
      });

      const visualComparisonVariants = comparisonVariants.filter(function (entry) {
        return asNonEmptyString(entry["moduleId"]) === "visual-signal";
      });
      if (visualComparisonVariants.length > 0) {
        emitRuntimeUpdate?.({
          kind: "module-artifact",
          moduleId: "visual-signal",
          message: "visual signal comparison variants ready",
          detail:
            visualComparisonVariants.length > 1
              ? `${visualComparisonVariants.length} reveal variants were batched for the current scope.`
              : asNonEmptyString(visualComparisonVariants[0]?.["label"]) ||
                "Visual comparison variant ready",
          artifact: revealArtifacts[0] || undefined,
          comparisonVariant: visualComparisonVariants[0] || undefined,
          comparisonVariants: visualComparisonVariants,
          throttleWindow: "visual-signal-module-batch",
        });
      }

      if (revealArtifacts[0]) {
        emitRuntimeUpdate?.({
          kind: "preview-artifact",
          moduleId: "visual-signal",
          message: "visual signal preview artifact ready",
          detail: asNonEmptyString(revealArtifacts[0].label),
          artifact: revealArtifacts[0],
          comparisonVariant: {
            id: `visual-variant-${revealModuleIds[0] || "primary"}`,
            moduleId: "visual-signal",
            sourceModule: revealModuleIds[0] || "visual-signal-amplification",
            label: asNonEmptyString(revealArtifacts[0].label) || "Visual Reveal Variant",
            artifactId: asNonEmptyString(revealArtifacts[0].id),
            artifactPath: asNonEmptyString(revealArtifacts[0].path),
            active: true,
          },
          moduleTrace: {
            id: `visual-signal-preview-${Date.now()}`,
            moduleId: "visual-signal",
            stage: "process",
            status: "preview-ready",
            timestamp: new Date().toISOString(),
            message: "visual signal preview artifact ready",
            detail: asNonEmptyString(revealArtifacts[0].label),
          },
          throttleWindow: "visual-signal-module-batch",
        });
      }

      const revealFindings = findings.filter(function (entry) {
        return asNonEmptyString(entry.moduleId) === "visual-signal";
      });
      if (revealFindings.length > 0) {
        const primaryRevealFinding = revealFindings[0];
        if (primaryRevealFinding) {
          emitRuntimeUpdate?.({
            kind: "live-finding",
            moduleId: "visual-signal",
            message: "visual-signal findings updated",
            detail:
              revealFindings.length > 1
                ? `${revealFindings.length} reveal findings were aggregated for the current preview batch.`
                : asNonEmptyString(primaryRevealFinding.detail) ||
                  asNonEmptyString(primaryRevealFinding.title) ||
                  "Visual reveal finding emitted.",
            finding: primaryRevealFinding,
            moduleTrace: {
              id: `visual-signal-finding-${Date.now()}`,
              moduleId: "visual-signal",
              stage: "process",
              status: "finding",
              timestamp: new Date().toISOString(),
              message: "visual-signal findings updated",
              detail:
                revealFindings.length > 1
                  ? `${revealFindings.length} reveal findings were aggregated for the current preview batch.`
                  : asNonEmptyString(primaryRevealFinding.detail) ||
                    asNonEmptyString(primaryRevealFinding.title) ||
                    "Visual reveal finding emitted.",
            },
            throttleWindow: "visual-signal-module-batch",
          });
        }
      }

      updateProcessModule(processRecord, "visual-signal", {
        status: "ready",
        completedAt: new Date().toISOString(),
        summary:
          revealModuleIds.length > 0
            ? `${revealModuleIds.length} visual reveal module(s) generated preview variants.`
            : "Visual signal amplification checks finished for the active target.",
        artifactIds: collectArtifactIdsForModule(artifacts, "visual-signal"),
      });
      emitRuntimeUpdate?.({
        kind: "module-progress",
        moduleId: "visual-signal",
        message: "visual-signal module completed",
        detail:
          revealModuleIds.length > 0
            ? `${revealModuleIds.length} visual reveal module(s) generated preview variants.`
            : "Visual signal amplification checks finished for the active target.",
        moduleTrace: {
          id: `visual-signal-completed-${Date.now()}`,
          moduleId: "visual-signal",
          stage: "process",
          status: "ready",
          timestamp: new Date().toISOString(),
          message: "visual-signal module completed",
          detail:
            revealModuleIds.length > 0
              ? `${revealModuleIds.length} visual reveal module(s) generated preview variants.`
              : "Visual signal amplification checks finished for the active target.",
        },
        throttleWindow: "visual-signal-module-batch",
      });
    }

    if (
      comparisonPair !== null &&
      getModuleStatus(processRecord, "image-comparison") === "queued"
    ) {
      updateProcessModule(processRecord, "image-comparison", {
        status: "running",
        startedAt: new Date().toISOString(),
      });
      const sideBySideArtifact = normalizeOptionalArtifact(
        await generateProcessImageComparisonArtifact(
          runtime,
          project,
          requestId,
          jobId,
          comparisonPair.primaryTarget,
          comparisonPair.referenceTarget,
          `${artifactBase}-ab`,
          outputDir,
          "side-by-side",
          "A/B Side-by-side Comparison",
          {
            comparisonPairId: comparisonPair.pairId,
            scopeReference: getScopeReference(processRecord),
            sourceSide: "comparison",
          }
        )
      );
      const differenceArtifact = normalizeOptionalArtifact(
        await generateProcessImageComparisonArtifact(
          runtime,
          project,
          requestId,
          jobId,
          comparisonPair.primaryTarget,
          comparisonPair.referenceTarget,
          `${artifactBase}-ab`,
          outputDir,
          "difference",
          "A/B Difference Map",
          {
            comparisonPairId: comparisonPair.pairId,
            scopeReference: getScopeReference(processRecord),
            sourceSide: "comparison",
          }
        )
      );
      const imageComparisonArtifacts = [sideBySideArtifact, differenceArtifact].filter(
        (entry): entry is LaboratoryProcessArtifactRecord => entry !== null
      );
      const imageComparisonVariants: LaboratoryRecord[] = [];
      imageComparisonArtifacts.forEach(function (artifact) {
        artifacts.push(artifact);
        imageComparisonVariants.push({
          id: `image-comparison-${asNonEmptyString(artifact["kind"]) || "artifact"}`,
          moduleId: "image-comparison",
          sourceModule: "image-comparison",
          label: asNonEmptyString(artifact.label) || "A/B Comparison",
          sourceSide: "comparison",
          artifactId: asNonEmptyString(artifact.id),
          artifactPath: asNonEmptyString(artifact.path),
          active: false,
        });
      });
      const comparisonArtifactIds = imageComparisonArtifacts
        .map(function (artifact) {
          return asNonEmptyString(artifact.id);
        })
        .filter((entry): entry is string => entry !== null);
      findings.push(
        createMediaFinding(processRecord, "image-comparison", "image-comparison", {
          artifactIds: comparisonArtifactIds,
          confidence: "medium",
          detail:
            "A/B comparison artifacts were generated so the report can distinguish per-image findings from pairwise visual deltas.",
          evidenceCount: Math.max(1, comparisonArtifactIds.length),
          level: "low",
          settingsUsed: {
            sourceSide: "comparison",
            viewMode: asNonEmptyString(comparisonPair.comparison["viewMode"]),
          },
          title: "A/B comparison layer generated",
        })
      );
      updateProcessModule(processRecord, "image-comparison", {
        status: "ready",
        completedAt: new Date().toISOString(),
        summary: "A/B side-by-side and difference-map artifacts were generated.",
        artifactIds: collectArtifactIdsForModule(artifacts, "image-comparison"),
      });
      emitRuntimeUpdate?.({
        kind: "module-artifact",
        moduleId: "image-comparison",
        message: "image comparison artifacts ready",
        detail: "A/B side-by-side and difference-map artifacts were generated.",
        artifact: sideBySideArtifact || differenceArtifact || undefined,
        comparisonVariants: imageComparisonVariants,
        moduleTrace: {
          id: `image-comparison-${Date.now()}`,
          moduleId: "image-comparison",
          stage: "process",
          status: "ready",
          timestamp: new Date().toISOString(),
          message: "image comparison artifacts ready",
          detail: "A/B side-by-side and difference-map artifacts were generated.",
        },
        throttleWindow: "image-comparison-module-batch",
      });
    }

    if (getModuleStatus(processRecord, "audio") === "queued") {
      updateProcessModule(processRecord, "audio", {
        status: "running",
        startedAt: new Date().toISOString(),
      });
      emitRuntimeUpdate?.({
        kind: "module-progress",
        moduleId: "audio",
        message: "audio module started",
        moduleTrace: {
          id: `audio-running-${Date.now()}`,
          moduleId: "audio",
          stage: "process",
          status: "running",
          timestamp: new Date().toISOString(),
          message: "audio module started",
          detail: null,
        },
        throttleWindow: "audio-module-batch",
      });

      const audioProbe = toAudioProbeRecord(
        await runAudioStructureProbe(runtime, project, requestId, jobId, target, {
          analysisScope: processRecord["analysisScope"],
        })
      );
      const spectrogram = normalizeOptionalArtifact(
        await generateProcessSpectrogram(
          runtime,
          project,
          requestId,
          jobId,
          target,
          artifactBase,
          outputDir,
          "audio"
        )
      );
      if (spectrogram !== null) {
        artifacts.push(spectrogram);
      }

      const silenceSummary = summarizeProbeBucket(audioProbe.silence);
      const silenceCount = getProbeCount(audioProbe.silence);
      const silenceDetail = formatProbeSummary("silence", silenceSummary);
      if (silenceCount > 0) {
        findings.push(
          withFindingMetadata(
            createProcessFinding(
              "audio",
              "measured",
              silenceCount > 3 ? "medium" : "low",
              "medium",
              "Silence pockets detected",
              `Silence detection found ${silenceCount} pocket(s) during the managed run.${
                silenceDetail ? ` ${silenceDetail}` : ""
              }`,
              silenceCount,
              spectrogram ? [String(spectrogram.id || "")] : []
            ),
            {
              correlation: {
                label: "audio silence pocket",
                signalType: "audio-discontinuity",
                window: getFirstProbeWindow(silenceSummary),
              },
              probeSummary: {
                silence: silenceSummary,
                volume: toRecord(audioProbe.volume),
              },
              temporalSegments: toUnknownArray(silenceSummary["segments"]),
            }
          )
        );
      }
      if (spectrogram !== null) {
        emitRuntimeUpdate?.({
          kind: "preview-artifact",
          moduleId: "audio",
          message: "audio preview artifact ready",
          detail: asNonEmptyString(spectrogram.label),
          artifact: spectrogram,
          moduleTrace: {
            id: `audio-preview-${Date.now()}`,
            moduleId: "audio",
            stage: "process",
            status: "preview-ready",
            timestamp: new Date().toISOString(),
            message: "audio preview artifact ready",
            detail: asNonEmptyString(spectrogram.label),
          },
          throttleWindow: "audio-module-batch",
        });
      }

      const speech = toSpeechAvailabilityRecord(buildProcessSpeechAvailability(runtime, project));
      if (speech.ready === true) {
        try {
          const transcriptResult = await maybeRunTranscriptProfileSample(
            runtime,
            project,
            requestId,
            jobId,
            target,
            artifactBase,
            clampProfileTranscriptSampleSeconds(
              runtime.profileCapabilities,
              toRecord(project.profile)["transcriptSampleSeconds"]
            )
          );

          if (transcriptResult !== null && transcriptResult !== undefined) {
            const transcriptText = asNonEmptyString(
              toTranscriptResultRecord(transcriptResult).text
            );
            const narrativeTriggers = transcriptText ? findNarrativeTriggers(transcriptText) : [];
            const transcriptArtifact = normalizeOptionalArtifact(
              toTranscriptResultRecord(transcriptResult).artifact
            );
            const normalizedTranscriptArtifact =
              transcriptArtifact === null
                ? null
                : toProcessArtifactRecord(
                    normalizeProcessArtifact({
                      ...transcriptArtifact,
                      metadata: {
                        ...toRecord(transcriptArtifact["metadata"]),
                        narrativeTriggerPhrases: narrativeTriggers,
                        narrativeTemporalBasis: "text-only",
                      },
                      moduleId: "audio",
                    })
                  );
            if (normalizedTranscriptArtifact !== null) {
              artifacts.push(normalizedTranscriptArtifact);
            }
            if (narrativeTriggers.length > 0) {
              findings.push(
                withFindingMetadata(
                  createProcessFinding(
                    "audio",
                    "heuristic",
                    "medium",
                    "low",
                    "Narrative trigger phrase detected",
                    `Transcript sampling surfaced ${String(
                      narrativeTriggers.length
                    )} trigger phrase(s) that should narrow the visual/audio review window.`,
                    narrativeTriggers.length,
                    normalizedTranscriptArtifact === null
                      ? []
                      : [String(normalizedTranscriptArtifact.id || "")]
                  ),
                  {
                    narrativeCues: narrativeTriggers,
                    narrativeTemporalBasis: "text-only",
                  }
                )
              );
            }
          }
        } catch (_error) {
          warnings.push("Transcript sampling stayed unavailable during the managed run.");
        }
      }
      const audioFindings = findings.filter(function (entry) {
        return asNonEmptyString(entry.moduleId) === "audio";
      });
      if (audioFindings.length > 0) {
        const primaryAudioFinding = audioFindings[0];
        if (primaryAudioFinding) {
          emitRuntimeUpdate?.({
            kind: "live-finding",
            moduleId: "audio",
            message: "audio findings updated",
            detail:
              audioFindings.length > 1
                ? `${audioFindings.length} audio findings were aggregated for the current sweep.`
                : asNonEmptyString(primaryAudioFinding.detail) ||
                  asNonEmptyString(primaryAudioFinding.title) ||
                  "Audio finding emitted.",
            finding: primaryAudioFinding,
            moduleTrace: {
              id: `audio-finding-${Date.now()}`,
              moduleId: "audio",
              stage: "process",
              status: "finding",
              timestamp: new Date().toISOString(),
              message: "audio findings updated",
              detail:
                audioFindings.length > 1
                  ? `${audioFindings.length} audio findings were aggregated for the current sweep.`
                  : asNonEmptyString(primaryAudioFinding.detail) ||
                    asNonEmptyString(primaryAudioFinding.title) ||
                    "Audio finding emitted.",
            },
            throttleWindow: "audio-module-batch",
          });
        }
      }
      if (warnings.length > 0) {
        emitRuntimeUpdate?.({
          kind: "module-warning",
          moduleId: "audio",
          message: "audio module warning",
          detail: warnings.join(" | "),
          moduleTrace: {
            id: `audio-warning-${Date.now()}`,
            moduleId: "audio",
            stage: "process",
            status: "warning",
            timestamp: new Date().toISOString(),
            message: "audio module warning",
            detail: warnings.join(" | "),
          },
          throttleWindow: "audio-module-batch",
        });
      }

      updateProcessModule(processRecord, "audio", {
        status: "ready",
        completedAt: new Date().toISOString(),
        summary: "Audio continuity checks finished for the active target.",
        artifactIds: collectArtifactIdsForModule(artifacts, "audio"),
      });
      emitRuntimeUpdate?.({
        kind: "module-progress",
        moduleId: "audio",
        message: "audio module completed",
        detail: "Audio continuity checks finished for the active target.",
        moduleTrace: {
          id: `audio-completed-${Date.now()}`,
          moduleId: "audio",
          stage: "process",
          status: "ready",
          timestamp: new Date().toISOString(),
          message: "audio module completed",
          detail: "Audio continuity checks finished for the active target.",
        },
        throttleWindow: "audio-module-batch",
      });
    }

    updateProcessModule(processRecord, "report", {
      status: "ready",
      completedAt: new Date().toISOString(),
      summary: "A report-ready summary was synthesized from the managed run.",
    });

    return {
      findings,
      artifacts,
      warnings,
    };
  }

  return {
    runMediaManagedProcess,
  };
}
