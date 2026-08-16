type LabRecord = Record<string, unknown>;

type ForensicSignatureCandidate = {
  counterEvidence: string[];
  evidence: string[];
  family: string;
  label: string;
  manualReviewPrompts: string[];
  patternTags: string[];
  score: number;
};

export type ForensicSignatureMappingInput = {
  black?: unknown;
  compressionSignature?: unknown;
  compressionSignatureMapping?: unknown;
  duplicateFrame?: unknown;
  frameCadence?: unknown;
  freeze?: unknown;
  freezeAttribution?: unknown;
  gopStructure?: unknown;
  metadataProvenance?: unknown;
  nearDuplicateFrame?: unknown;
  opticalFlow?: unknown;
  opticalFlowTracking?: unknown;
  referenceQuality?: unknown;
};

function asRecord(value: unknown): LabRecord {
  return value !== null && typeof value === "object" && Array.isArray(value) === false
    ? (value as LabRecord)
    : {};
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map(function (entry) {
          return asNonEmptyString(entry);
        })
        .filter((entry): entry is string => entry !== null)
    : [];
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundMetric(value: number | null, precision = 3): number | null {
  if (value === null || Number.isFinite(value) === false) {
    return null;
  }
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function formatPercent(value: number | null): string {
  return value === null ? "unknown" : `${(value * 100).toFixed(1)}%`;
}

function formatMetric(value: number | null, precision = 3): string {
  return value === null ? "unknown" : value.toFixed(precision);
}

function confidenceFromScore(score: number): "high" | "medium" | "low" {
  if (score >= 0.72) {
    return "high";
  }
  return score >= 0.42 ? "medium" : "low";
}

function riskWeight(riskLevel: string | null): number {
  if (riskLevel === "high") {
    return 0.22;
  }
  return riskLevel === "medium" ? 0.12 : 0;
}

function hasMeasuredRecord(record: LabRecord): boolean {
  return (
    asNonEmptyString(record["status"]) === "measured" &&
    asFiniteNumber(record["sampledFrameCount"]) !== null
  );
}

function preferMeasuredRecord(primary: unknown, fallback: unknown): LabRecord {
  const primaryRecord = asRecord(primary);
  if (hasMeasuredRecord(primaryRecord) || Object.keys(primaryRecord).length > 0) {
    return primaryRecord;
  }
  return asRecord(fallback);
}

function scoreCandidate(candidate: ForensicSignatureCandidate): ForensicSignatureCandidate {
  return {
    ...candidate,
    evidence: Array.from(new Set(candidate.evidence)),
    patternTags: Array.from(new Set(candidate.patternTags)),
    score: roundMetric(clampScore(candidate.score)) || 0,
  };
}

function bucketRatio(value: number | null, highThreshold: number, mediumThreshold: number): string {
  if (value === null) {
    return "unknown";
  }
  if (value >= highThreshold) {
    return "high";
  }
  return value >= mediumThreshold ? "medium" : "low";
}

function bucketBitsPerPixel(value: number | null): string {
  if (value === null) {
    return "unknown";
  }
  if (value < 0.06) {
    return "starved";
  }
  return value < 0.1 ? "thin" : "normal";
}

function createTransportDuplicateCandidate(values: {
  cadenceDriftRatio: number | null;
  duplicateCount: number;
  duplicateRatio: number | null;
  freezeAttributionClass: string | null;
  freezeCount: number;
  longestDuplicateRunFrames: number;
  opticalFlowClass: string | null;
}): ForensicSignatureCandidate {
  const duplicateRatio = values.duplicateRatio || 0;
  const score =
    (values.freezeCount > 0 ? 0.18 : 0) +
    (duplicateRatio >= 0.35 ? 0.42 : duplicateRatio >= 0.12 ? 0.25 : 0) +
    (values.duplicateCount > 0 && duplicateRatio < 0.12 ? 0.12 : 0) +
    (values.longestDuplicateRunFrames >= 3 ? 0.14 : 0) +
    (values.freezeAttributionClass === "transport_duplicate" ? 0.22 : 0) +
    ((values.cadenceDriftRatio || 0) >= 0.18 ? 0.08 : 0);
  return scoreCandidate({
    counterEvidence: [
      values.duplicateCount <= 0 ? "no repeated decoded-frame hashes were measured" : null,
      values.opticalFlowClass === "localized_subject_motion"
        ? "subject/ROI motion continues against the background sample"
        : null,
      values.freezeCount <= 0 ? "freezedetect did not report a freeze interval" : null,
    ].filter((entry): entry is string => entry !== null),
    evidence: [
      values.freezeCount > 0 ? `${String(values.freezeCount)} freeze interval(s)` : null,
      values.duplicateCount > 0
        ? `${String(values.duplicateCount)} repeated decoded frame(s), ratio ${formatPercent(
            values.duplicateRatio
          )}`
        : null,
      values.longestDuplicateRunFrames >= 3
        ? `longest duplicate run ${String(values.longestDuplicateRunFrames)} frame(s)`
        : null,
      values.freezeAttributionClass === "transport_duplicate"
        ? "freeze attribution already favors transport duplicate"
        : null,
    ].filter((entry): entry is string => entry !== null),
    family: "transport_duplicate_stream_stall",
    label: "Transport duplicate or stream stall",
    manualReviewPrompts: [
      "Compare decoded frame hashes against player-level freeze playback.",
      "Replay the window frame-by-frame around the reported freeze interval.",
    ],
    patternTags: ["duplicate-frame", "stream-stall"],
    score,
  });
}

function createLowLightCompressionCandidate(values: {
  blackCount: number;
  blackTotalSeconds: number;
  compressionRiskLevel: string | null;
  compressionRiskScore: number | null;
  duplicateRatio: number | null;
  estimatedBitsPerPixelFrame: number | null;
  lowPacketFrameRatio: number | null;
  opticalFlowClass: string | null;
  riskFactors: string[];
}): ForensicSignatureCandidate {
  const bpp = values.estimatedBitsPerPixelFrame;
  const lowPacketRatio = values.lowPacketFrameRatio || 0;
  const score =
    riskWeight(values.compressionRiskLevel) +
    Math.min(0.22, (values.compressionRiskScore || 0) * 0.22) +
    (bpp !== null && bpp < 0.06 ? 0.24 : bpp !== null && bpp < 0.1 ? 0.14 : 0) +
    (lowPacketRatio > 0.2 ? 0.18 : lowPacketRatio > 0.08 ? 0.08 : 0) +
    (values.blackCount > 0 || values.blackTotalSeconds > 0 ? 0.12 : 0) +
    (values.opticalFlowClass === "low_motion_baseline" ? 0.08 : 0);
  return scoreCandidate({
    counterEvidence: [
      values.duplicateRatio !== null && values.duplicateRatio >= 0.35
        ? "duplicate-frame evidence may explain the freeze before compression"
        : null,
      values.opticalFlowClass === "localized_subject_motion"
        ? "localized subject motion suggests content/ROI behavior also changed"
        : null,
      bpp === null ? "source bitrate, dimensions, or fps were unavailable" : null,
    ].filter((entry): entry is string => entry !== null),
    evidence: [
      `compression risk ${values.compressionRiskLevel || "unknown"}`,
      bpp !== null ? `estimated bits-per-pixel-frame ${formatMetric(bpp, 5)}` : null,
      lowPacketRatio > 0
        ? `low packet-frame ratio ${formatPercent(values.lowPacketFrameRatio)}`
        : null,
      values.blackCount > 0
        ? `${String(values.blackCount)} black/low-light interval(s) measured`
        : null,
      ...values.riskFactors.slice(0, 3),
    ].filter((entry): entry is string => entry !== null),
    family: "low_light_compression_starvation",
    label: "Low-light compression starvation",
    manualReviewPrompts: [
      "Check the same window against a pre-upload or less-compressed source.",
      "Review luminance and macroblock behavior in dark regions.",
    ],
    patternTags: ["compression", "low-light", "low-packet"],
    score,
  });
}

function createFastMotionCompressionCandidate(values: {
  bFrameRatio: number | null;
  cadenceDriftRatio: number | null;
  compressionRiskLevel: string | null;
  opticalFlowClass: string | null;
  packetSpikeRatio: number | null;
  subjectMotionEnergy: number | null;
}): ForensicSignatureCandidate {
  const packetSpikeRatio = values.packetSpikeRatio || 0;
  const cadenceDriftRatio = values.cadenceDriftRatio || 0;
  const motionActive =
    values.opticalFlowClass === "localized_subject_motion" ||
    values.opticalFlowClass === "global_motion_or_camera_shift" ||
    values.opticalFlowClass === "mixed_motion_energy";
  const score =
    riskWeight(values.compressionRiskLevel) +
    (packetSpikeRatio > 0.12 ? 0.22 : packetSpikeRatio > 0.05 ? 0.1 : 0) +
    (motionActive ? 0.18 : 0) +
    ((values.subjectMotionEnergy || 0) >= 0.018 ? 0.08 : 0) +
    ((values.bFrameRatio || 0) > 0.35 ? 0.1 : 0) +
    (cadenceDriftRatio >= 0.18 ? 0.14 : cadenceDriftRatio >= 0.08 ? 0.06 : 0);
  return scoreCandidate({
    counterEvidence: [
      values.opticalFlowClass === "low_motion_baseline"
        ? "motion proxy reports a low-motion baseline"
        : null,
      packetSpikeRatio <= 0 ? "packet-size spikes were not measured" : null,
    ].filter((entry): entry is string => entry !== null),
    evidence: [
      packetSpikeRatio > 0 ? `packet spike ratio ${formatPercent(values.packetSpikeRatio)}` : null,
      motionActive ? `motion class ${values.opticalFlowClass}` : null,
      values.subjectMotionEnergy !== null
        ? `subject motion energy ${formatMetric(values.subjectMotionEnergy, 5)}`
        : null,
      values.bFrameRatio !== null ? `B-frame share ${formatPercent(values.bFrameRatio)}` : null,
      cadenceDriftRatio > 0 ? `cadence drift ${formatPercent(values.cadenceDriftRatio)}` : null,
    ].filter((entry): entry is string => entry !== null),
    family: "fast_motion_encoder_smear",
    label: "Fast-motion encoder smear",
    manualReviewPrompts: [
      "Replay high-motion frames before and after the anomaly.",
      "Compare packet-size spikes against the visible motion burst.",
    ],
    patternTags: ["compression", "fast-motion", "cadence"],
    score,
  });
}

function createThinEdgeRingingCandidate(values: {
  bFrameRatio: number | null;
  compressionRiskLevel: string | null;
  estimatedBitsPerPixelFrame: number | null;
  packetSpikeRatio: number | null;
}): ForensicSignatureCandidate {
  const bpp = values.estimatedBitsPerPixelFrame;
  const packetSpikeRatio = values.packetSpikeRatio || 0;
  const score =
    riskWeight(values.compressionRiskLevel) +
    (bpp !== null && bpp < 0.08 ? 0.2 : bpp !== null && bpp < 0.12 ? 0.1 : 0) +
    ((values.bFrameRatio || 0) > 0.35 ? 0.14 : 0) +
    (packetSpikeRatio > 0.08 ? 0.12 : packetSpikeRatio > 0.03 ? 0.06 : 0);
  return scoreCandidate({
    counterEvidence: [
      "thin-edge density is not directly measured by this probe",
      bpp === null ? "bits-per-pixel-frame was unavailable" : null,
    ].filter((entry): entry is string => entry !== null),
    evidence: [
      bpp !== null ? `estimated bits-per-pixel-frame ${formatMetric(bpp, 5)}` : null,
      values.bFrameRatio !== null ? `B-frame share ${formatPercent(values.bFrameRatio)}` : null,
      packetSpikeRatio > 0 ? `packet spike ratio ${formatPercent(values.packetSpikeRatio)}` : null,
      `compression risk ${values.compressionRiskLevel || "unknown"}`,
    ].filter((entry): entry is string => entry !== null),
    family: "thin_edge_ringing_risk",
    label: "Thin-edge ringing or mosquito-noise risk",
    manualReviewPrompts: [
      "Inspect fine edges, text, hair, wires, and high-contrast outlines.",
      "Do not treat this as measured edge evidence until edge-density sampling exists.",
    ],
    patternTags: ["compression", "thin-edge-risk", "ringing"],
    score,
  });
}

function createMotionMismatchCandidate(values: {
  freezeAttributionClass: string | null;
  freezeCount: number;
  opticalFlowClass: string | null;
  subjectBackgroundMotionRatio: number | null;
}): ForensicSignatureCandidate {
  const ratio = values.subjectBackgroundMotionRatio;
  const localized = values.opticalFlowClass === "localized_subject_motion";
  const background = values.opticalFlowClass === "background_or_camera_motion";
  const score =
    (localized || background ? 0.28 : 0) +
    (values.freezeCount > 0 ? 0.12 : 0) +
    (ratio !== null && (ratio >= 2.5 || ratio <= 0.5) ? 0.14 : 0) +
    (values.freezeAttributionClass === "localized_motion_during_background_freeze" ||
    values.freezeAttributionClass === "background_motion_with_subject_stall"
      ? 0.16
      : 0);
  return scoreCandidate({
    counterEvidence: [
      values.opticalFlowClass === "low_motion_baseline"
        ? "subject and background motion both remain low"
        : null,
      values.opticalFlowClass === "global_motion_or_camera_shift"
        ? "motion appears global rather than spatially separated"
        : null,
    ].filter((entry): entry is string => entry !== null),
    evidence: [
      localized ? "subject/ROI motion separates from background" : null,
      background ? "background/camera motion exceeds subject/ROI motion" : null,
      ratio !== null ? `subject/background motion ratio ${ratio.toFixed(2)}x` : null,
      values.freezeAttributionClass !== null
        ? `freeze attribution ${values.freezeAttributionClass}`
        : null,
    ].filter((entry): entry is string => entry !== null),
    family: "motion_plane_mismatch",
    label: "Motion-plane mismatch",
    manualReviewPrompts: [
      "Replay the ROI and background samples side by side.",
      "Check whether camera movement or subject movement explains the split.",
    ],
    patternTags: ["motion-split", "roi-background"],
    score,
  });
}

function createCadenceGopCandidate(values: {
  cadenceDriftRatio: number | null;
  gopBoundaryOverlapCount: number;
  timestampRegressionCount: number;
}): ForensicSignatureCandidate {
  const cadenceDriftRatio = values.cadenceDriftRatio || 0;
  const score =
    (cadenceDriftRatio >= 0.18 ? 0.26 : cadenceDriftRatio >= 0.08 ? 0.12 : 0) +
    (values.gopBoundaryOverlapCount > 0 ? 0.18 : 0) +
    (values.timestampRegressionCount > 0 ? 0.18 : 0);
  return scoreCandidate({
    counterEvidence: [
      cadenceDriftRatio <= 0 ? "frame cadence drift was not measured" : null,
      values.gopBoundaryOverlapCount <= 0 ? "no freeze boundary aligned near GOP keyframes" : null,
    ].filter((entry): entry is string => entry !== null),
    evidence: [
      cadenceDriftRatio > 0 ? `cadence drift ${formatPercent(values.cadenceDriftRatio)}` : null,
      values.gopBoundaryOverlapCount > 0
        ? `${String(values.gopBoundaryOverlapCount)} GOP boundary overlap(s)`
        : null,
      values.timestampRegressionCount > 0
        ? `${String(values.timestampRegressionCount)} timestamp regression(s)`
        : null,
    ].filter((entry): entry is string => entry !== null),
    family: "cadence_gop_discontinuity",
    label: "Cadence or GOP-boundary discontinuity",
    manualReviewPrompts: [
      "Inspect timestamps and keyframe boundaries around the anomaly.",
      "Check whether remuxing or upload processing introduced the cadence shift.",
    ],
    patternTags: ["cadence", "gop", "timestamp"],
    score,
  });
}

export function buildForensicSignatureMapping(input: ForensicSignatureMappingInput): LabRecord {
  const black = asRecord(input.black);
  const compressionSignature = asRecord(input.compressionSignature);
  const duplicateFrame = preferMeasuredRecord(input.nearDuplicateFrame, input.duplicateFrame);
  const frameCadence = asRecord(input.frameCadence);
  const freeze = asRecord(input.freeze);
  const freezeAttribution = asRecord(input.freezeAttribution);
  const gopStructure = asRecord(input.gopStructure);
  const metadataProvenance = asRecord(input.metadataProvenance);
  const opticalFlow = preferMeasuredRecord(input.opticalFlowTracking, input.opticalFlow);
  const referenceQuality = asRecord(input.referenceQuality);

  const compressionRiskLevel = asNonEmptyString(compressionSignature["riskLevel"]);
  const compressionRiskScore = asFiniteNumber(compressionSignature["riskScore"]);
  const estimatedBitsPerPixelFrame = asFiniteNumber(
    compressionSignature["estimatedBitsPerPixelFrame"]
  );
  const lowPacketFrameRatio = asFiniteNumber(compressionSignature["lowPacketFrameRatio"]);
  const packetSpikeRatio = asFiniteNumber(compressionSignature["packetSpikeRatio"]);
  const pictTypeCounts = asRecord(compressionSignature["pictTypeCounts"]);
  const sampledFrameCount = asFiniteNumber(compressionSignature["sampledFrameCount"]);
  const signatureSampledFrameCount =
    sampledFrameCount ??
    asFiniteNumber(duplicateFrame["sampledFrameCount"]) ??
    asFiniteNumber(opticalFlow["sampledFrameCount"]);
  const bFrameRatio =
    sampledFrameCount === null || sampledFrameCount <= 0
      ? null
      : (asFiniteNumber(pictTypeCounts["B"]) || 0) / sampledFrameCount;
  const riskFactors = asStringArray(compressionSignature["riskFactors"]);
  const duplicateCount = asFiniteNumber(duplicateFrame["exactDuplicateFrameCount"]) || 0;
  const duplicateRatio = asFiniteNumber(duplicateFrame["exactDuplicateFrameRatio"]);
  const longestDuplicateRunFrames =
    asFiniteNumber(duplicateFrame["longestDuplicateRunFrames"]) || 0;
  const cadenceDriftRatio = asFiniteNumber(frameCadence["cadenceDriftRatio"]);
  const timestampRegressionCount = asFiniteNumber(frameCadence["timestampRegressionCount"]) || 0;
  const freezeCount = asFiniteNumber(freeze["count"]) || 0;
  const blackCount = asFiniteNumber(black["count"]) || 0;
  const blackTotalSeconds = asFiniteNumber(black["totalDurationSeconds"]) || 0;
  const opticalFlowClass = asNonEmptyString(opticalFlow["movementClass"]);
  const subjectMotionEnergy = asFiniteNumber(opticalFlow["subjectMotionEnergy"]);
  const subjectBackgroundMotionRatio = asFiniteNumber(opticalFlow["subjectBackgroundMotionRatio"]);
  const freezeAttributionClass = asNonEmptyString(freezeAttribution["classification"]);
  const gopBoundaryOverlapCount = asFiniteNumber(freezeAttribution["gopBoundaryOverlapCount"]) || 0;
  const metadataStatus = asNonEmptyString(metadataProvenance["status"]);
  const referenceQualityStatus = asNonEmptyString(referenceQuality["status"]);
  const crossCheckCounterEvidence = [
    metadataStatus === "unavailable" ? "metadata provenance cross-check was not measured" : null,
    referenceQualityStatus === "unavailable"
      ? "reference quality comparison was not measured"
      : null,
  ].filter((entry): entry is string => entry !== null);

  const candidates = [
    createTransportDuplicateCandidate({
      cadenceDriftRatio,
      duplicateCount,
      duplicateRatio,
      freezeAttributionClass,
      freezeCount,
      longestDuplicateRunFrames,
      opticalFlowClass,
    }),
    createLowLightCompressionCandidate({
      blackCount,
      blackTotalSeconds,
      compressionRiskLevel,
      compressionRiskScore,
      duplicateRatio,
      estimatedBitsPerPixelFrame,
      lowPacketFrameRatio,
      opticalFlowClass,
      riskFactors,
    }),
    createFastMotionCompressionCandidate({
      bFrameRatio,
      cadenceDriftRatio,
      compressionRiskLevel,
      opticalFlowClass,
      packetSpikeRatio,
      subjectMotionEnergy,
    }),
    createThinEdgeRingingCandidate({
      bFrameRatio,
      compressionRiskLevel,
      estimatedBitsPerPixelFrame,
      packetSpikeRatio,
    }),
    createMotionMismatchCandidate({
      freezeAttributionClass,
      freezeCount,
      opticalFlowClass,
      subjectBackgroundMotionRatio,
    }),
    createCadenceGopCandidate({
      cadenceDriftRatio,
      gopBoundaryOverlapCount,
      timestampRegressionCount,
    }),
  ].sort(function (left, right) {
    return right.score - left.score;
  });

  const rankedCandidates = candidates.filter(function (candidate) {
    return candidate.score >= 0.18;
  });
  const primary = rankedCandidates[0] || null;
  const measuredFields = [
    hasMeasuredRecord(compressionSignature) ? "compression packet signature" : null,
    hasMeasuredRecord(duplicateFrame) ? "duplicate-frame ratio" : null,
    hasMeasuredRecord(frameCadence) ? "frame cadence drift" : null,
    hasMeasuredRecord(opticalFlow) ? "optical-flow ROI/background split" : null,
    hasMeasuredRecord(gopStructure) ? "GOP structure" : null,
    hasMeasuredRecord(metadataProvenance) ? "metadata provenance cross-check" : null,
    hasMeasuredRecord(referenceQuality) ? "reference quality metric" : null,
    freezeCount > 0 ? "freezedetect intervals" : null,
    blackCount > 0 ? "blackdetect intervals" : null,
  ].filter((entry): entry is string => entry !== null);
  const signatureKey = [
    `compression:${compressionRiskLevel || "unknown"}`,
    `bpp:${bucketBitsPerPixel(estimatedBitsPerPixelFrame)}`,
    `low-packet:${bucketRatio(lowPacketFrameRatio, 0.2, 0.08)}`,
    `packet-spike:${bucketRatio(packetSpikeRatio, 0.12, 0.05)}`,
    `duplicate:${bucketRatio(duplicateRatio, 0.35, 0.12)}`,
    `cadence:${bucketRatio(cadenceDriftRatio, 0.18, 0.08)}`,
    `motion:${opticalFlowClass || "unknown"}`,
    `freeze:${freezeAttributionClass || "baseline"}`,
    `metadata:${metadataStatus || "unknown"}`,
    `reference:${referenceQualityStatus || "unknown"}`,
  ].join("|");
  const basePayload = {
    caseVectorVersion: 1,
    learningFingerprint: signatureKey,
    measuredFields,
    method: "rule-based-forensic-signature-mapping",
    patternTags: Array.from(
      new Set(
        rankedCandidates.flatMap(function (candidate) {
          return candidate.patternTags;
        })
      )
    ).slice(0, 12),
    sampledFrameCount: signatureSampledFrameCount,
    secondaryFamilies: rankedCandidates.slice(1, 5).map(function (candidate) {
      return {
        confidence: confidenceFromScore(candidate.score),
        family: candidate.family,
        label: candidate.label,
        score: candidate.score,
      };
    }),
    signatureKey,
    status: measuredFields.length > 0 ? "measured" : "unavailable",
  };

  if (primary === null) {
    return {
      ...basePayload,
      artifactFamily: "baseline_no_dominant_artifact_signature",
      artifactLabel: "No dominant artifact signature",
      confidence: "low",
      counterEvidence: Array.from(
        new Set(
          ["no candidate artifact family crossed the reporting threshold"].concat(
            crossCheckCounterEvidence
          )
        )
      ),
      evidence: [],
      manualReviewPrompts: ["Use manual replay if the visual claim depends on a single frame."],
      score: 0,
    };
  }

  return {
    ...basePayload,
    artifactFamily: primary.family,
    artifactLabel: primary.label,
    confidence: confidenceFromScore(primary.score),
    counterEvidence: Array.from(new Set(primary.counterEvidence.concat(crossCheckCounterEvidence))),
    evidence: primary.evidence,
    manualReviewPrompts: primary.manualReviewPrompts,
    score: primary.score,
  };
}
