import { asLabRecord, asNonEmptyString, asStringArray } from "../domain/lab-types.js";
import type {
  LabAiReport,
  LabArtifactProjection,
  LabBookmark,
  LabComparisonVariant,
  LabCounterEvidenceLedger,
  LabDecisionSummary,
  LabEvidenceStrengthEntry,
  LabCorrelationCluster,
  LabForensicNote,
  LabFindingProjection,
  LabInteractiveSettings,
  LabModuleTraceEntry,
  LabNarrativeCue,
  LabROIRegion,
  LabRun,
  LabUserReport,
} from "../domain/lab-types.js";
import type { AnalysisScope } from "../shared/types/analysis-scope.js";

type ReportSignalWindow = {
  startSeconds: number | null;
  endSeconds: number | null;
  durationSeconds: number | null;
};

type ReportCorrelationSignal = {
  id: string;
  findingId: string | null;
  label: string;
  signalType: string;
  level: string;
  confidence: string;
  window: ReportSignalWindow;
};

const MAX_SCOPE_NARRATIVE_SIGNAL_SECONDS = 5;

const NARRATIVE_TRIGGER_TERMS = [
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
] as const;

function asFiniteNumber(value: unknown): number | null {
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function getLevelWeight(level: string): number {
  return level === "high" ? 3 : level === "medium" ? 2 : 1;
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

function normalizeSignalWindow(value: unknown): ReportSignalWindow {
  const source = asLabRecord(value);
  const startSeconds = asFiniteNumber(source["startSeconds"]);
  const endSeconds = asFiniteNumber(source["endSeconds"]);
  const durationSeconds = asFiniteNumber(source["durationSeconds"]);
  return {
    startSeconds,
    endSeconds,
    durationSeconds:
      durationSeconds !== null
        ? durationSeconds
        : startSeconds !== null && endSeconds !== null
          ? Math.max(0, endSeconds - startSeconds)
          : null,
  };
}

function getScopeWindow(run: LabRun): ReportSignalWindow {
  const timeRange = asLabRecord(run.analysisScope?.timeRange);
  const startMs = asFiniteNumber(timeRange["startMs"]);
  const endMs = asFiniteNumber(timeRange["endMs"]);
  return {
    startSeconds: startMs === null ? null : startMs / 1000,
    endSeconds: endMs === null ? null : endMs / 1000,
    durationSeconds:
      startMs !== null && endMs !== null ? Math.max(0, (endMs - startMs) / 1000) : null,
  };
}

function getFindingWindow(finding: LabFindingProjection, run: LabRun): ReportSignalWindow {
  const metadata = asLabRecord(finding.metadata);
  const segment = Array.isArray(metadata["temporalSegments"])
    ? metadata["temporalSegments"].map(normalizeSignalWindow).find(function (entry) {
        return entry.startSeconds !== null || entry.endSeconds !== null;
      })
    : null;
  if (segment) {
    return segment;
  }

  const correlationWindow = normalizeSignalWindow(
    asLabRecord(asLabRecord(metadata["correlation"])["window"])
  );
  if (correlationWindow.startSeconds !== null || correlationWindow.endSeconds !== null) {
    return correlationWindow;
  }

  const referenceTimeRange = asLabRecord(asLabRecord(finding.reference)["timeRange"]);
  const startMs = asFiniteNumber(referenceTimeRange["startMs"]);
  const endMs = asFiniteNumber(referenceTimeRange["endMs"]);
  if (startMs !== null || endMs !== null) {
    return {
      startSeconds: startMs === null ? null : startMs / 1000,
      endSeconds: endMs === null ? null : endMs / 1000,
      durationSeconds:
        startMs !== null && endMs !== null ? Math.max(0, (endMs - startMs) / 1000) : null,
    };
  }

  return getScopeWindow(run);
}

function hasFindingTemporalAnchor(finding: LabFindingProjection): boolean {
  const metadata = asLabRecord(finding.metadata);
  const hasSegment = Array.isArray(metadata["temporalSegments"])
    ? metadata["temporalSegments"].map(normalizeSignalWindow).some(function (entry) {
        return entry.startSeconds !== null || entry.endSeconds !== null;
      })
    : false;
  if (hasSegment) {
    return true;
  }

  const correlationWindow = normalizeSignalWindow(
    asLabRecord(asLabRecord(metadata["correlation"])["window"])
  );
  if (correlationWindow.startSeconds !== null || correlationWindow.endSeconds !== null) {
    return true;
  }

  const referenceTimeRange = asLabRecord(asLabRecord(finding.reference)["timeRange"]);
  const startMs = asFiniteNumber(referenceTimeRange["startMs"]);
  const endMs = asFiniteNumber(referenceTimeRange["endMs"]);
  return startMs !== null || endMs !== null;
}

function inferSignalType(finding: LabFindingProjection): string | null {
  const metadata = asLabRecord(finding.metadata);
  const correlation = asLabRecord(metadata["correlation"]);
  const explicitSignalType = asNonEmptyString(correlation["signalType"]);
  if (explicitSignalType !== null) {
    return explicitSignalType;
  }

  const sourceText = normalizeNarrativeText(
    `${finding.sourceModule || ""} ${finding.moduleId || ""} ${finding.code || ""} ${finding.title} ${finding.detail}`
  );
  if (/frame-consistency|freeze|dondu/.test(sourceText)) {
    return "freeze";
  }
  if (/black|dark|karar|lighting|luminance|temporal-noise/.test(sourceText)) {
    return "luminance-collapse";
  }
  if (/audio|silence|volume|spectral|ses|ciglik/.test(sourceText)) {
    return "audio-discontinuity";
  }
  if (/motion|movement|hareket/.test(sourceText)) {
    return "motion-discontinuity";
  }
  if (/narrative|transcript|speech|anlati/.test(sourceText)) {
    return "narrative-trigger";
  }
  return null;
}

function findingHasExplicitCorrelationSignal(finding: LabFindingProjection): boolean {
  return (
    asNonEmptyString(asLabRecord(asLabRecord(finding.metadata)["correlation"])["signalType"]) !==
    null
  );
}

function findingTextLooksNegativeOrBaseline(finding: LabFindingProjection): boolean {
  const normalized = normalizeNarrativeText(`${finding.title} ${finding.detail}`);
  return /\b(no|not|none|without|normal|baseline|expected|clear|yok|degil|bulunmadi|saptanmadi)\b|no anomaly|no freeze|no black|no silence|no trigger|not detected|none detected|tespit edilmedi|anomali yok/.test(
    normalized
  );
}

function shouldIncludeCorrelationSignal(finding: LabFindingProjection): boolean {
  if (
    findingTextLooksNegativeOrBaseline(finding) &&
    !findingHasExplicitCorrelationSignal(finding)
  ) {
    return false;
  }
  if (findingHasExplicitCorrelationSignal(finding)) {
    return true;
  }
  if (finding.level === "high" || finding.level === "medium") {
    return true;
  }
  return /detected|found|anomaly|freeze|black|silence|trigger|kaybol|belir/.test(
    normalizeNarrativeText(`${finding.title} ${finding.detail}`)
  );
}

function getWindowCenter(window: ReportSignalWindow): number | null {
  if (window.startSeconds !== null && window.endSeconds !== null) {
    return (window.startSeconds + window.endSeconds) / 2;
  }
  return window.startSeconds ?? window.endSeconds;
}

function windowsBelongTogether(left: ReportSignalWindow, right: ReportSignalWindow): boolean {
  const leftCenter = getWindowCenter(left);
  const rightCenter = getWindowCenter(right);
  if (leftCenter === null || rightCenter === null) {
    return false;
  }
  const toleranceSeconds = 2.5;
  if (Math.abs(leftCenter - rightCenter) <= toleranceSeconds) {
    return true;
  }
  if (
    left.startSeconds !== null &&
    left.endSeconds !== null &&
    right.startSeconds !== null &&
    right.endSeconds !== null
  ) {
    return (
      left.startSeconds <= right.endSeconds + toleranceSeconds &&
      right.startSeconds <= left.endSeconds + toleranceSeconds
    );
  }
  return false;
}

function formatSeconds(value: number | null): string {
  return value === null ? "scope" : `${value.toFixed(2)}s`;
}

function findNarrativeTerms(text: string): string[] {
  const normalized = normalizeNarrativeText(text);
  const matches = NARRATIVE_TRIGGER_TERMS.map(normalizeNarrativeText).filter(function (term) {
    return normalized.includes(term);
  });
  return Array.from(new Set(matches));
}

function buildNarrativeCues(
  run: LabRun,
  artifacts: LabArtifactProjection[],
  findings: LabFindingProjection[]
): LabNarrativeCue[] {
  const cues: LabNarrativeCue[] = [];
  const seen = new Set<string>();
  const scopeWindow = getScopeWindow(run);
  const hasNarrowScope =
    scopeWindow.durationSeconds !== null &&
    scopeWindow.durationSeconds > 0 &&
    scopeWindow.durationSeconds <= MAX_SCOPE_NARRATIVE_SIGNAL_SECONDS;

  function addCue(
    phrase: string,
    source: string,
    detail: string,
    options: {
      confidence?: string;
      endSeconds?: number | null;
      startSeconds?: number | null;
      temporalBasis?: LabNarrativeCue["temporalBasis"];
    } = {}
  ) {
    const key = `${source}:${phrase}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    cues.push({
      id: `narrative-${cues.length + 1}`,
      phrase,
      source,
      detail,
      confidence: options.confidence || "low",
      endSeconds: options.endSeconds ?? null,
      startSeconds: options.startSeconds ?? null,
      temporalBasis: options.temporalBasis || "text-only",
    });
  }

  const hypothesis = run.hypothesisSummary || run.analysisScope?.hypothesis || "";
  findNarrativeTerms(hypothesis).forEach(function (phrase) {
    addCue(
      phrase,
      "analysis-hypothesis",
      hasNarrowScope
        ? "Frozen analysis hypothesis contains a narrative trigger term inside a narrow review scope."
        : "Frozen analysis hypothesis contains a scope-level narrative trigger term.",
      {
        confidence: hasNarrowScope ? "medium" : "low",
        endSeconds: hasNarrowScope ? scopeWindow.endSeconds : null,
        startSeconds: hasNarrowScope ? scopeWindow.startSeconds : null,
        temporalBasis: hasNarrowScope ? "narrow-scope" : "scope",
      }
    );
  });

  artifacts.forEach(function (artifact) {
    const metadata = asLabRecord(artifact.metadata);
    asStringArray(metadata["narrativeTriggerPhrases"]).forEach(function (phrase) {
      const normalizedPhrase = normalizeNarrativeText(phrase);
      if (normalizedPhrase === "") {
        return;
      }
      const triggerTerms = findNarrativeTerms(phrase);
      (triggerTerms.length > 0 ? triggerTerms : [normalizedPhrase]).forEach(function (term) {
        addCue(
          term,
          artifact.fileName || artifact.kind || artifact.id,
          "Transcript sampling surfaced this trigger phrase without word-level timing.",
          {
            confidence: "low",
            temporalBasis: "text-only",
          }
        );
      });
    });
    if (Array.isArray(metadata["narrativeTriggerWindows"])) {
      metadata["narrativeTriggerWindows"].map(asLabRecord).forEach(function (windowRecord) {
        const phrase = asNonEmptyString(windowRecord["phrase"]);
        const window = normalizeSignalWindow(windowRecord);
        if (phrase === null || (window.startSeconds === null && window.endSeconds === null)) {
          return;
        }
        addCue(
          normalizeNarrativeText(phrase),
          artifact.fileName || artifact.kind || artifact.id,
          "Transcript sampling surfaced this trigger phrase with a timestamped window.",
          {
            confidence: "medium",
            endSeconds: window.endSeconds,
            startSeconds: window.startSeconds,
            temporalBasis: "timestamp",
          }
        );
      });
    }
  });

  findings.forEach(function (finding) {
    const metadata = asLabRecord(finding.metadata);
    asStringArray(metadata["narrativeCues"]).forEach(function (phrase) {
      const normalizedPhrase = normalizeNarrativeText(phrase);
      if (normalizedPhrase === "") {
        return;
      }
      const triggerTerms = findNarrativeTerms(phrase);
      (triggerTerms.length > 0 ? triggerTerms : [normalizedPhrase]).forEach(function (term) {
        addCue(
          term,
          finding.title,
          "Transcript sampling surfaced this trigger phrase without a persisted transcript artifact.",
          {
            confidence: "low",
            temporalBasis: "text-only",
          }
        );
      });
    });
  });

  return cues.slice(0, 8);
}

function getNarrativeCueSignalWindow(cue: LabNarrativeCue): ReportSignalWindow | null {
  const startSeconds = asFiniteNumber(cue.startSeconds);
  const endSeconds = asFiniteNumber(cue.endSeconds);
  if (startSeconds === null && endSeconds === null) {
    return null;
  }
  return {
    startSeconds,
    endSeconds,
    durationSeconds:
      startSeconds !== null && endSeconds !== null ? Math.max(0, endSeconds - startSeconds) : null,
  };
}

function buildCorrelationSignals(
  run: LabRun,
  findings: LabFindingProjection[],
  narrativeCues: LabNarrativeCue[]
): ReportCorrelationSignal[] {
  const findingSignals = findings
    .filter(shouldIncludeCorrelationSignal)
    .map(function (finding): ReportCorrelationSignal | null {
      const signalType = inferSignalType(finding);
      if (signalType === null) {
        return null;
      }
      if (signalType === "narrative-trigger" && !hasFindingTemporalAnchor(finding)) {
        return null;
      }
      const correlation = asLabRecord(asLabRecord(finding.metadata)["correlation"]);
      return {
        id: `signal-${finding.id}`,
        findingId: finding.id,
        label: asNonEmptyString(correlation["label"]) || finding.title,
        signalType,
        level: finding.level,
        confidence: finding.confidence,
        window: getFindingWindow(finding, run),
      };
    })
    .filter((entry): entry is ReportCorrelationSignal => entry !== null);

  const narrativeSignals = narrativeCues
    .map(function (cue): ReportCorrelationSignal | null {
      const window = getNarrativeCueSignalWindow(cue);
      if (window === null) {
        return null;
      }
      return {
        id: `signal-${cue.id}`,
        findingId: null,
        label: cue.phrase,
        signalType: "narrative-trigger",
        level: cue.confidence === "medium" ? "medium" : "low",
        confidence: cue.confidence || "low",
        window,
      };
    })
    .filter((entry): entry is ReportCorrelationSignal => entry !== null);

  const seen = new Set<string>();
  return findingSignals.concat(narrativeSignals).filter(function (signal) {
    const key = [
      signal.signalType,
      signal.window.startSeconds === null ? "scope" : signal.window.startSeconds.toFixed(2),
      signal.window.endSeconds === null ? "scope" : signal.window.endSeconds.toFixed(2),
    ].join(":");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildCorrelationClusters(signals: ReportCorrelationSignal[]): LabCorrelationCluster[] {
  const clusters: ReportCorrelationSignal[][] = [];
  signals
    .slice()
    .sort(function (left, right) {
      return (
        (getWindowCenter(left.window) ?? Number.MAX_SAFE_INTEGER) -
        (getWindowCenter(right.window) ?? Number.MAX_SAFE_INTEGER)
      );
    })
    .forEach(function (signal) {
      const matchedCluster = clusters.find(function (cluster) {
        return cluster.some(function (entry) {
          return windowsBelongTogether(entry.window, signal.window);
        });
      });
      if (matchedCluster) {
        matchedCluster.push(signal);
      } else {
        clusters.push([signal]);
      }
    });

  const nullWindowSignals = signals.filter(function (signal) {
    return getWindowCenter(signal.window) === null;
  });
  if (nullWindowSignals.length > 1) {
    clusters.push(nullWindowSignals);
  }

  return clusters
    .map(function (cluster, index): LabCorrelationCluster | null {
      const signalTypes = Array.from(new Set(cluster.map((signal) => signal.signalType)));
      if (signalTypes.length < 2) {
        return null;
      }
      const score =
        cluster.reduce<number>(function (total, signal) {
          return total + getLevelWeight(signal.level);
        }, 0) +
        Math.max(0, signalTypes.length - 1) * 2;
      const startSeconds = cluster.reduce<number | null>(function (minValue, signal) {
        const value = signal.window.startSeconds;
        return value === null ? minValue : minValue === null ? value : Math.min(minValue, value);
      }, null);
      const endSeconds = cluster.reduce<number | null>(function (maxValue, signal) {
        const value = signal.window.endSeconds;
        return value === null ? maxValue : maxValue === null ? value : Math.max(maxValue, value);
      }, null);
      const level = score >= 8 || signalTypes.length >= 4 ? "high" : score >= 5 ? "medium" : "low";
      return {
        id: `correlation-cluster-${index + 1}`,
        title: `${signalTypes.length} signal family correlation`,
        detail: `${cluster.length} signal(s) converge around ${formatSeconds(startSeconds)} - ${formatSeconds(endSeconds)}: ${signalTypes.join(", ")}.`,
        score,
        level,
        confidence: signalTypes.length >= 3 ? "medium" : "low",
        startSeconds,
        endSeconds,
        signalCount: cluster.length,
        signalTypes,
        findingIds: cluster
          .map(function (signal) {
            return signal.findingId;
          })
          .filter((entry): entry is string => entry !== null),
      };
    })
    .filter((entry): entry is LabCorrelationCluster => entry !== null)
    .sort(function (left, right) {
      return right.score - left.score;
    })
    .slice(0, 6);
}

function formatPercent(value: number | null): string {
  return value === null ? "unknown" : `${(value * 100).toFixed(1)}%`;
}

function readRecordNumber(record: Record<string, unknown>, key: string): number | null {
  return asFiniteNumber(record[key]);
}

function isMeasuredProbeRecord(record: Record<string, unknown>): boolean {
  return (
    asNonEmptyString(record["status"]) === "measured" &&
    readRecordNumber(record, "sampledFrameCount") !== null
  );
}

function appendMeasuredField(
  fields: string[],
  record: Record<string, unknown>,
  label: string
): string[] {
  return isMeasuredProbeRecord(record) ? fields.concat(label) : fields;
}

function buildForensicSignatureMappingNote(
  finding: LabFindingProjection,
  probeSummary: Record<string, unknown>,
  seen: Set<string>
): LabForensicNote | null {
  const forensicSignature = asLabRecord(
    probeSummary["compressionSignatureMapping"] || probeSummary["forensicSignature"]
  );
  const family = asNonEmptyString(forensicSignature["artifactFamily"]);
  if (family === null || family === "baseline_no_dominant_artifact_signature") {
    return null;
  }
  const label = asNonEmptyString(forensicSignature["artifactLabel"]) || family;
  const confidence = asNonEmptyString(forensicSignature["confidence"]) || "low";
  const score = readRecordNumber(forensicSignature, "score");
  const signatureKey = asNonEmptyString(forensicSignature["signatureKey"]);
  const evidence = asStringArray(forensicSignature["evidence"]);
  const counterEvidence = asStringArray(forensicSignature["counterEvidence"]);
  const manualReviewPrompts = asStringArray(forensicSignature["manualReviewPrompts"]);
  const measuredFields = asStringArray(forensicSignature["measuredFields"]);
  const dedupeKey = [
    "forensic-signature",
    finding.moduleId || "module",
    family,
    signatureKey || "no-signature",
  ].join(":");
  if (seen.has(dedupeKey)) {
    return null;
  }
  seen.add(dedupeKey);
  return {
    id: `forensic-${finding.id}-signature-mapping`,
    label: "compression signature mapping",
    detail: [
      `Mapped likely artifact family ${label} (${confidence} confidence${
        score === null ? "" : `, score ${score.toFixed(2)}`
      }).`,
      evidence.length > 0 ? `Evidence: ${evidence.slice(0, 4).join("; ")}.` : null,
      counterEvidence.length > 0
        ? `Counter-evidence: ${counterEvidence.slice(0, 3).join("; ")}.`
        : null,
      signatureKey ? `Learning fingerprint ${signatureKey}.` : null,
    ]
      .filter((entry): entry is string => entry !== null)
      .join(" "),
    followUpChecks:
      manualReviewPrompts.length > 0 ? manualReviewPrompts.slice(0, 3) : ["manual replay review"],
    measuredFields:
      measuredFields.length > 0
        ? measuredFields
        : ["compression packet signature", "frame cadence drift", "motion split"],
    moduleId: finding.moduleId,
    scope: "local",
  };
}

function buildAttributionForensicNote(
  finding: LabFindingProjection,
  probeSummary: Record<string, unknown>,
  seen: Set<string>
): LabForensicNote | null {
  const attribution = asLabRecord(probeSummary["freezeAttribution"]);
  const classification = asNonEmptyString(attribution["classification"]);
  if (classification === null || classification === "baseline") {
    return null;
  }
  const duplicateFrame = asLabRecord(
    probeSummary["nearDuplicateFrame"] || probeSummary["duplicateFrame"]
  );
  const compressionSignature = asLabRecord(probeSummary["compressionSignature"]);
  const frameCadence = asLabRecord(probeSummary["frameCadence"]);
  const gopStructure = asLabRecord(probeSummary["gopStructure"]);
  const opticalFlow = asLabRecord(
    probeSummary["opticalFlowTracking"] || probeSummary["opticalFlow"]
  );
  const duplicateRatio = readRecordNumber(duplicateFrame, "exactDuplicateFrameRatio");
  const duplicateCount = readRecordNumber(duplicateFrame, "exactDuplicateFrameCount") || 0;
  const cadenceDriftRatio = readRecordNumber(frameCadence, "cadenceDriftRatio");
  const compressionRisk = asNonEmptyString(compressionSignature["riskLevel"]) || "unknown";
  const confidence = asNonEmptyString(attribution["confidence"]) || "low";
  const gopOverlap = readRecordNumber(attribution, "gopBoundaryOverlapCount") || 0;
  const flowClass = asNonEmptyString(opticalFlow["movementClass"]) || "unknown";
  const flowRatio = readRecordNumber(opticalFlow, "subjectBackgroundMotionRatio");
  const measuredFields = appendMeasuredField(
    appendMeasuredField(
      appendMeasuredField(
        appendMeasuredField(
          appendMeasuredField([], duplicateFrame, "duplicate-frame ratio"),
          frameCadence,
          "frame cadence drift"
        ),
        gopStructure,
        "GOP keyframe proximity"
      ),
      compressionSignature,
      "compression packet signature"
    ),
    opticalFlow,
    "optical-flow ROI/background split"
  );
  const dedupeKey = [
    "attribution",
    finding.moduleId || "module",
    classification,
    String(duplicateCount),
    compressionRisk,
    String(gopOverlap),
    flowClass,
  ].join(":");
  if (seen.has(dedupeKey)) {
    return null;
  }
  seen.add(dedupeKey);
  return {
    id: `forensic-${finding.id}-freeze-attribution`,
    label: "freeze attribution",
    detail: [
      `Cause class ${classification} (${confidence} confidence).`,
      `Duplicate-frame ratio ${formatPercent(duplicateRatio)} across ${String(duplicateCount)} repeated decoded frame(s).`,
      `Cadence drift ${formatPercent(cadenceDriftRatio)}; compression risk ${compressionRisk}.`,
      `Motion split ${flowClass}${flowRatio === null ? "" : ` (${flowRatio.toFixed(2)}x subject/background)`}.`,
      gopOverlap > 0
        ? `${String(gopOverlap)} freeze boundary/boundaries align near GOP keyframes.`
        : "No measured GOP boundary overlap.",
    ].join(" "),
    followUpChecks: isMeasuredProbeRecord(opticalFlow)
      ? ["manual ROI replay confirmation"]
      : ["optical-flow ROI/background split"],
    measuredFields,
    moduleId: finding.moduleId,
    scope:
      isMeasuredProbeRecord(gopStructure) ||
      isMeasuredProbeRecord(duplicateFrame) ||
      isMeasuredProbeRecord(opticalFlow)
        ? "local"
        : "global",
  };
}

function buildOpticalFlowForensicNote(
  finding: LabFindingProjection,
  probeSummary: Record<string, unknown>,
  seen: Set<string>
): LabForensicNote | null {
  const opticalFlow = asLabRecord(
    probeSummary["opticalFlowTracking"] || probeSummary["opticalFlow"]
  );
  if (!isMeasuredProbeRecord(opticalFlow)) {
    return null;
  }
  const movementClass = asNonEmptyString(opticalFlow["movementClass"]) || "unknown";
  const confidence = asNonEmptyString(opticalFlow["confidence"]) || "low";
  const subjectEnergy = readRecordNumber(opticalFlow, "subjectMotionEnergy");
  const backgroundEnergy = readRecordNumber(opticalFlow, "backgroundMotionEnergy");
  const ratio = readRecordNumber(opticalFlow, "subjectBackgroundMotionRatio");
  const sampledFrameCount = readRecordNumber(opticalFlow, "sampledFrameCount") || 0;
  const dedupeKey = [
    "optical-flow",
    finding.moduleId || "module",
    movementClass,
    String(sampledFrameCount),
    String(ratio),
  ].join(":");
  if (seen.has(dedupeKey)) {
    return null;
  }
  seen.add(dedupeKey);
  return {
    id: `forensic-${finding.id}-optical-flow`,
    label: "optical-flow proxy",
    detail: `Measured ${movementClass} (${confidence} confidence) across ${String(sampledFrameCount)} frame-difference sample(s); subject energy ${subjectEnergy === null ? "unknown" : subjectEnergy.toFixed(5)}, background energy ${backgroundEnergy === null ? "unknown" : backgroundEnergy.toFixed(5)}, subject/background ratio ${ratio === null ? "unknown" : ratio.toFixed(2)}x.`,
    followUpChecks: ["manual ROI replay confirmation"],
    measuredFields: [
      "subject motion energy",
      "background motion energy",
      "subject/background motion ratio",
    ],
    moduleId: finding.moduleId,
    scope: "local",
  };
}

function buildDuplicateFrameForensicNote(
  finding: LabFindingProjection,
  probeSummary: Record<string, unknown>,
  seen: Set<string>
): LabForensicNote | null {
  const duplicateFrame = asLabRecord(
    probeSummary["nearDuplicateFrame"] || probeSummary["duplicateFrame"]
  );
  const duplicateCount = readRecordNumber(duplicateFrame, "exactDuplicateFrameCount") || 0;
  if (duplicateCount <= 0) {
    return null;
  }
  const duplicateRatio = readRecordNumber(duplicateFrame, "exactDuplicateFrameRatio");
  const longestRun = readRecordNumber(duplicateFrame, "longestDuplicateRunFrames") || 0;
  const sampledFrameCount = readRecordNumber(duplicateFrame, "sampledFrameCount") || 0;
  const dedupeKey = [
    "duplicate-frame",
    finding.moduleId || "module",
    String(duplicateCount),
    String(longestRun),
    String(sampledFrameCount),
  ].join(":");
  if (seen.has(dedupeKey)) {
    return null;
  }
  seen.add(dedupeKey);
  return {
    id: `forensic-${finding.id}-duplicate-frame`,
    label: "duplicate-frame probe",
    detail: `Measured ${String(duplicateCount)} repeated decoded frame(s) in ${String(sampledFrameCount)} sampled frame(s); ratio ${formatPercent(duplicateRatio)}, longest run ${String(longestRun)} frame(s).`,
    followUpChecks: isMeasuredProbeRecord(
      asLabRecord(probeSummary["opticalFlowTracking"] || probeSummary["opticalFlow"])
    )
      ? ["manual frame-by-frame confirmation"]
      : ["optical-flow motion confirmation"],
    measuredFields: ["framehash duplicate runs", "duplicate-frame ratio"],
    moduleId: finding.moduleId,
    scope: "local",
  };
}

function buildForensicNotes(findings: LabFindingProjection[]): LabForensicNote[] {
  const notes: LabForensicNote[] = [];
  const seen = new Set<string>();
  findings.forEach(function (finding) {
    const probeSummary = asLabRecord(asLabRecord(finding.metadata)["probeSummary"]);
    const attributionNote = buildAttributionForensicNote(finding, probeSummary, seen);
    if (attributionNote !== null) {
      notes.push(attributionNote);
    }
    const signatureMappingNote = buildForensicSignatureMappingNote(finding, probeSummary, seen);
    if (signatureMappingNote !== null) {
      notes.push(signatureMappingNote);
    }
    const opticalFlowNote = buildOpticalFlowForensicNote(finding, probeSummary, seen);
    if (opticalFlowNote !== null) {
      notes.push(opticalFlowNote);
    }
    const duplicateFrameNote = buildDuplicateFrameForensicNote(finding, probeSummary, seen);
    if (duplicateFrameNote !== null) {
      notes.push(duplicateFrameNote);
    }
    Object.keys(probeSummary).forEach(function (key) {
      const summary = asLabRecord(probeSummary[key]);
      const count = asFiniteNumber(summary["count"]) || 0;
      if (count <= 0) {
        return;
      }
      const total = asFiniteNumber(summary["totalDurationSeconds"]);
      const max = asFiniteNumber(summary["maxDurationSeconds"]);
      const average = asFiniteNumber(summary["averageDurationSeconds"]);
      const hasLocalSegments = Array.isArray(summary["segments"])
        ? summary["segments"].map(normalizeSignalWindow).some(function (entry) {
            return entry.startSeconds !== null || entry.endSeconds !== null;
          })
        : false;
      const scope = hasLocalSegments ? "local" : "global";
      const measuredFields = [
        "interval count",
        total !== null ? "total duration" : null,
        max !== null ? "max duration" : null,
        average !== null ? "average duration" : null,
        hasLocalSegments ? "temporal segments" : null,
      ].filter((entry): entry is string => entry !== null);
      const followUpChecks = [
        "GOP boundary",
        "duplicate-frame ratio",
        "encoder-artifact attribution",
      ];
      const dedupeKey = `${finding.moduleId || "module"}:${key}:${String(count)}:${String(
        total
      )}:${String(max)}`;
      if (seen.has(dedupeKey)) {
        return;
      }
      seen.add(dedupeKey);
      notes.push({
        id: `forensic-${finding.id}-${key}`,
        label: `${key} probe`,
        detail: `Measured ${scope} evidence: ${count} interval(s), total ${formatSeconds(total)}, max ${formatSeconds(max)}. Follow-up only: ${followUpChecks.join(", ")}.`,
        followUpChecks,
        measuredFields,
        moduleId: finding.moduleId,
        scope,
      });
    });
  });
  return notes.slice(0, 8);
}

function collectProbeRecord(
  findings: LabFindingProjection[],
  keys: string[]
): Record<string, unknown> {
  for (const finding of findings) {
    const probeSummary = asLabRecord(asLabRecord(finding.metadata)["probeSummary"]);
    for (const key of keys) {
      const record = asLabRecord(probeSummary[key]);
      if (Object.keys(record).length > 0) {
        return record;
      }
    }
  }
  return {};
}

function strengthFromScore(score: number | null): LabEvidenceStrengthEntry["strength"] {
  if (score === null || score <= 0) {
    return "none";
  }
  if (score >= 0.72) {
    return "strong";
  }
  return score >= 0.42 ? "moderate" : "weak";
}

function buildEvidenceStrength(
  findings: LabFindingProjection[],
  correlationClusters: LabCorrelationCluster[]
): LabEvidenceStrengthEntry[] {
  const forensicSignature = collectProbeRecord(findings, [
    "compressionSignatureMapping",
    "forensicSignature",
  ]);
  const compressionSignature = collectProbeRecord(findings, ["compressionSignature"]);
  const duplicateFrame = collectProbeRecord(findings, ["nearDuplicateFrame", "duplicateFrame"]);
  const score = readRecordNumber(forensicSignature, "score");
  const artifactLabel =
    asNonEmptyString(forensicSignature["artifactLabel"]) || "No dominant artifact signature";
  const signatureEvidence = asStringArray(forensicSignature["evidence"]);
  const signatureCounterEvidence = asStringArray(forensicSignature["counterEvidence"]);
  const mediumOrHighFindings = findings.filter(function (finding) {
    return finding.level === "high" || finding.level === "medium";
  });
  const compressionRisk = asNonEmptyString(compressionSignature["riskLevel"]);
  const duplicateCount = readRecordNumber(duplicateFrame, "exactDuplicateFrameCount") || 0;
  const technicalStrength =
    correlationClusters.length > 0 || mediumOrHighFindings.length > 1
      ? "moderate"
      : mediumOrHighFindings.length > 0
        ? "weak"
        : "none";
  const compressionStrength =
    artifactLabel.includes("compression") ||
    compressionRisk === "high" ||
    compressionRisk === "medium"
      ? strengthFromScore(
          score ?? (compressionRisk === "high" ? 0.55 : compressionRisk === "medium" ? 0.32 : 0)
        )
      : "none";
  const manipulationStrength =
    artifactLabel.includes("motion") || duplicateCount > 0
      ? strengthFromScore(score ?? (duplicateCount > 0 ? 0.2 : 0))
      : "none";

  return [
    {
      id: "technical-anomaly",
      label: "Technical anomaly strength",
      strength: technicalStrength,
      detail:
        technicalStrength === "none"
          ? "No medium/high technical anomaly cluster was produced by the active run."
          : "The report contains technical anomalies, but this is not a final authenticity judgment.",
      evidence: mediumOrHighFindings.slice(0, 4).map(function (finding) {
        return finding.title;
      }),
      counterEvidence:
        mediumOrHighFindings.length === 0 ? ["no medium/high technical finding was produced"] : [],
    },
    {
      id: "manipulation",
      label: "Manipulation-supporting strength",
      strength: manipulationStrength,
      detail:
        manipulationStrength === "none"
          ? "No manipulation-specific signature crossed the reporting threshold."
          : "Manipulation remains a hypothesis, not a conclusion, until source/reference review confirms it.",
      evidence: duplicateCount > 0 ? [`${String(duplicateCount)} repeated decoded frame(s)`] : [],
      counterEvidence: signatureCounterEvidence.slice(0, 4),
    },
    {
      id: "compression-artifact",
      label: "Compression/explainable artifact strength",
      strength: compressionStrength,
      detail: `Most likely mapped artifact family: ${artifactLabel}.`,
      evidence: signatureEvidence.slice(0, 5),
      counterEvidence: signatureCounterEvidence.slice(0, 4),
    },
    {
      id: "extraordinary",
      label: "Extraordinary/paranormal interpretation",
      strength: "not-testable",
      detail:
        "The Laboratory can test media artifacts and provenance signals; it cannot positively score paranormal or extraordinary claims.",
      evidence: [],
      counterEvidence: ["extraordinary interpretation is outside the technical test surface"],
    },
  ];
}

function buildCounterEvidenceLedger(findings: LabFindingProjection[]): LabCounterEvidenceLedger {
  const duplicateFrame = collectProbeRecord(findings, ["nearDuplicateFrame", "duplicateFrame"]);
  const compressionSignature = collectProbeRecord(findings, ["compressionSignature"]);
  const frameCadence = collectProbeRecord(findings, ["frameCadence"]);
  const metadataProvenance = collectProbeRecord(findings, ["metadataProvenance"]);
  const opticalFlow = collectProbeRecord(findings, ["opticalFlowTracking", "opticalFlow"]);
  const referenceQuality = collectProbeRecord(findings, ["referenceQuality"]);
  const forensicSignature = collectProbeRecord(findings, [
    "compressionSignatureMapping",
    "forensicSignature",
  ]);
  const duplicateCount = readRecordNumber(duplicateFrame, "exactDuplicateFrameCount") || 0;
  const cadenceDrift = readRecordNumber(frameCadence, "cadenceDriftRatio") || 0;
  const compressionRisk = asNonEmptyString(compressionSignature["riskLevel"]);
  const entries: LabCounterEvidenceLedger["entries"] = [];

  if (isMeasuredProbeRecord(duplicateFrame) && duplicateCount <= 0) {
    entries.push({
      id: "duplicate-not-found",
      label: "Duplicate frames",
      status: "measured-not-found",
      detail: "Exact decoded-frame duplicate runs were measured and not found.",
    });
  } else if (
    duplicateCount > 0 &&
    (readRecordNumber(duplicateFrame, "exactDuplicateFrameRatio") || 0) < 0.12
  ) {
    entries.push({
      id: "duplicate-weak",
      label: "Duplicate frames",
      status: "measured-weak",
      detail: "Repeated decoded frames were present, but the measured ratio stayed weak.",
    });
  }

  if (isMeasuredProbeRecord(frameCadence) && cadenceDrift <= 0.08) {
    entries.push({
      id: "cadence-not-found",
      label: "Cadence drift",
      status: "measured-not-found",
      detail: "Frame cadence drift was measured below the reporting threshold.",
    });
  }

  if (isMeasuredProbeRecord(compressionSignature) && compressionRisk !== "high") {
    entries.push({
      id: "compression-weak",
      label: "Compression signature",
      status: compressionRisk === "medium" ? "measured-weak" : "measured-not-found",
      detail: `Compression signature risk was ${compressionRisk || "unknown"}.`,
    });
  }

  [
    {
      id: "metadata-provenance-not-measured",
      label: "Metadata provenance",
      record: metadataProvenance,
      detail: "ExifTool/MediaInfo provenance cross-check was not measured.",
    },
    {
      id: "reference-quality-not-measured",
      label: "Reference quality",
      record: referenceQuality,
      detail: "Reference/pre-upload quality comparison was not measured.",
    },
    {
      id: "optical-flow-not-measured",
      label: "Optical-flow tracking",
      record: opticalFlow,
      detail: "Subject/background optical-flow split was not measured.",
    },
  ].forEach(function (entry) {
    if (asNonEmptyString(entry.record["status"]) === "unavailable") {
      entries.push({
        id: entry.id,
        label: entry.label,
        status: "not-measured",
        detail: asNonEmptyString(entry.record["reason"]) || entry.detail,
      });
    }
  });

  if (asNonEmptyString(metadataProvenance["status"]) === "measured") {
    const missingToolIds = asStringArray(metadataProvenance["missingToolIds"]);
    if (missingToolIds.length > 0) {
      entries.push({
        id: "metadata-provenance-partial",
        label: "Metadata provenance",
        status: "measured-weak",
        detail: `Metadata provenance was measured with limited coverage; missing tool(s): ${missingToolIds.join(", ")}.`,
      });
    }
    if ((readRecordNumber(metadataProvenance, "mismatchCount") || 0) > 0) {
      entries.push({
        id: "metadata-provenance-mismatch",
        label: "Metadata provenance",
        status: "follow-up",
        detail:
          "Metadata source mismatches were detected and need manual timeline/provenance review.",
      });
    }
  }

  if (asNonEmptyString(referenceQuality["status"]) === "measured") {
    const toolResults = asLabRecord(referenceQuality["toolResults"]);
    const vmaf = asLabRecord(toolResults["vmaf"]);
    const ssim = asLabRecord(toolResults["ssim"]);
    const partialMetrics = [
      asNonEmptyString(ssim["status"]) === "unavailable" ? "SSIM" : null,
      asNonEmptyString(vmaf["status"]) === "unavailable" ? "VMAF" : null,
    ].filter((entry): entry is string => entry !== null);
    if (partialMetrics.length > 0) {
      entries.push({
        id: "reference-quality-partial",
        label: "Reference quality",
        status: "measured-weak",
        detail: `Reference quality was partially measured; unavailable metric(s): ${partialMetrics.join(", ")}.`,
      });
    }
  }

  asStringArray(forensicSignature["manualReviewPrompts"])
    .slice(0, 3)
    .forEach(function (prompt, index) {
      entries.push({
        id: `follow-up-${String(index + 1)}`,
        label: "Review recommendation",
        status: "follow-up",
        detail: prompt,
      });
    });

  return {
    summary:
      entries.length === 0
        ? "No explicit counter-evidence ledger entries were produced."
        : `${String(entries.length)} counter-evidence or limitation item(s) were surfaced.`,
    entries: entries.slice(0, 10),
  };
}

function buildDecisionSummary(
  findings: LabFindingProjection[],
  evidenceStrength: LabEvidenceStrengthEntry[],
  counterEvidenceLedger: LabCounterEvidenceLedger
): LabDecisionSummary {
  const technicalStrength = evidenceStrength.find((entry) => entry.id === "technical-anomaly");
  const compressionStrength = evidenceStrength.find((entry) => entry.id === "compression-artifact");
  const manipulationStrength = evidenceStrength.find((entry) => entry.id === "manipulation");
  const anomaly =
    technicalStrength?.strength === "moderate" || technicalStrength?.strength === "strong"
      ? "yes"
      : findings.length > 0
        ? "inconclusive"
        : "no";
  const likelyTechnicalExplanation =
    compressionStrength?.strength === "strong" || compressionStrength?.strength === "moderate"
      ? compressionStrength.detail
      : technicalStrength?.strength === "none"
        ? "No dominant technical anomaly was measured by the active modules."
        : "Technical artifact or capture/encoding behavior is the most likely testable explanation.";
  const manipulationSuspicion =
    manipulationStrength?.strength === "strong"
      ? "high"
      : manipulationStrength?.strength === "moderate"
        ? "medium"
        : manipulationStrength?.strength === "weak"
          ? "low"
          : "inconclusive";
  return {
    anomaly,
    likelyTechnicalExplanation,
    manipulationSuspicion,
    needsFollowUp:
      anomaly !== "no" ||
      counterEvidenceLedger.entries.some((entry) => entry.status === "not-measured"),
    rationale:
      anomaly === "no"
        ? "The active run did not produce reportable technical anomaly evidence."
        : "The report is a triage decision based on measured technical signals, counter-evidence, and missing checks.",
    limitations: counterEvidenceLedger.entries
      .filter((entry) => entry.status === "not-measured")
      .map((entry) => entry.detail)
      .slice(0, 4),
  };
}

function buildReportInsights(
  run: LabRun,
  findings: LabFindingProjection[]
): {
  correlationClusters: LabCorrelationCluster[];
  counterEvidenceLedger: LabCounterEvidenceLedger;
  decisionSummary: LabDecisionSummary;
  evidenceStrength: LabEvidenceStrengthEntry[];
  narrativeCues: LabNarrativeCue[];
  forensicNotes: LabForensicNote[];
} {
  const narrativeCues = buildNarrativeCues(run, run.artifacts, findings);
  const signals = buildCorrelationSignals(run, findings, narrativeCues);
  const correlationClusters = buildCorrelationClusters(signals);
  const evidenceStrength = buildEvidenceStrength(findings, correlationClusters);
  const counterEvidenceLedger = buildCounterEvidenceLedger(findings);
  return {
    correlationClusters,
    counterEvidenceLedger,
    decisionSummary: buildDecisionSummary(findings, evidenceStrength, counterEvidenceLedger),
    evidenceStrength,
    forensicNotes: buildForensicNotes(findings),
    narrativeCues,
  };
}

function buildEvidenceLabels(
  findings: LabFindingProjection[],
  artifacts: LabArtifactProjection[],
  finding: LabFindingProjection
) {
  const artifactLookup = new Map<string, LabArtifactProjection>();
  artifacts.forEach(function (artifact) {
    artifactLookup.set(artifact.id, artifact);
  });
  const labels = finding.artifactIds
    .map(function (artifactId) {
      const artifact = artifactLookup.get(artifactId);
      if (!artifact) {
        return null;
      }
      return artifact.fileName || artifact.kind || artifact.id;
    })
    .filter((entry): entry is string => entry !== null);

  if (labels.length > 0) {
    return labels;
  }
  if (finding.evidenceCount > 0) {
    return [`${String(finding.evidenceCount)} kanit izi`];
  }
  return findings.length > 0 ? ["Yapisal bulgu kaydi"] : [];
}

export function buildUserReport(run: LabRun | null, reportRecord: unknown): LabUserReport | null {
  if (!run) {
    return null;
  }

  const normalizedReport = asLabRecord(reportRecord);
  const reportFindings = Array.isArray(normalizedReport["findings"])
    ? (normalizedReport["findings"] as LabFindingProjection[])
    : [];
  const rankedFindings = reportFindings.length > 0 ? reportFindings : run.findings;
  const primaryFinding = rankedFindings[0] || null;
  const existingUserReport = asLabRecord(normalizedReport["userReport"]);
  const insights = buildReportInsights(run, rankedFindings);
  const primaryCluster = insights.correlationClusters[0] || null;
  const generatedSummary = primaryCluster
    ? `Composite anomaly cluster: ${primaryCluster.detail} Toplam ${String(rankedFindings.length)} bulgu ve ${String(run.artifacts.length)} artefakt kaydi mevcut.`
    : primaryFinding
      ? `En yuksek oncelikli bulgu: ${primaryFinding.title}. Toplam ${String(rankedFindings.length)} bulgu ve ${String(run.artifacts.length)} artefakt kaydi mevcut.`
      : asNonEmptyString(existingUserReport["summary"]) ||
        run.emptyReason ||
        "Calisma tamamlandi fakat on plana cikan bulgu kaydi uretilmedi.";
  const confidence =
    primaryFinding?.confidence || asNonEmptyString(existingUserReport["confidence"]) || "low";

  const suspiciousFrames = run.artifacts
    .filter(function (artifact) {
      return artifact.previewUrl && artifact.kind !== "transcript";
    })
    .slice(0, 6)
    .map(function (artifact) {
      return {
        artifactId: artifact.id,
        previewUrl: artifact.previewUrl || "",
        label: artifact.fileName || artifact.kind || artifact.id,
      };
    });

  const hypothesisResult = run.hypothesisSummary || null;

  const elapsedSeconds =
    run.endedAt && run.startedAt ? Math.round((run.endedAt - run.startedAt) / 1000) : 0;

  const moduleSummary = run.moduleOrder.map(function (moduleId) {
    const mod = run.modules[moduleId];
    if (!mod) {
      return { id: moduleId, title: moduleId, status: "unknown" };
    }
    return {
      id: mod.id,
      title: mod.title || mod.id,
      status: mod.status,
    };
  });

  return {
    summary: generatedSummary,
    confidence,
    topFindings: rankedFindings.slice(0, 3).map(function (finding) {
      return {
        id: finding.id,
        title: finding.title,
        detail: finding.detail,
        confidence: finding.confidence,
        evidence: buildEvidenceLabels(rankedFindings, run.artifacts, finding),
      };
    }),
    suspiciousFrames,
    hypothesisResult,
    elapsedSeconds,
    moduleSummary,
    correlationSummary: primaryCluster ? primaryCluster.detail : null,
    topCorrelationClusters: insights.correlationClusters.slice(0, 3),
    narrativeCues: insights.narrativeCues,
    forensicNotes: insights.forensicNotes,
    decisionSummary: insights.decisionSummary,
    evidenceStrength: insights.evidenceStrength,
    counterEvidenceLedger: insights.counterEvidenceLedger,
  };
}

export function buildAiReport(run: LabRun | null, reportRecord: unknown): LabAiReport | null {
  if (!run) {
    return null;
  }

  const normalizedReport = asLabRecord(reportRecord);
  const degradedConditions = asStringArray(normalizedReport["caveats"]).concat(run.warnings);
  const errors = [run.error, asNonEmptyString(normalizedReport["error"])].filter(
    (entry): entry is string => entry !== null
  );

  const moduleTrace: LabModuleTraceEntry[] = Array.isArray(run.moduleTrace)
    ? run.moduleTrace.slice()
    : [];
  const analysisScope: AnalysisScope | null = run.analysisScope;
  const comparisonVariants: LabComparisonVariant[] = Array.isArray(run.comparisonVariants)
    ? run.comparisonVariants.slice()
    : [];
  const reportFindings = Array.isArray(normalizedReport["findings"])
    ? (normalizedReport["findings"] as LabFindingProjection[])
    : [];
  const rankedFindings = reportFindings.length > 0 ? reportFindings : run.findings;
  const insights = buildReportInsights(run, rankedFindings);

  return {
    manifest: {
      featureId: normalizedReport["featureId"] || null,
      sourceRunId: normalizedReport["sourceRunId"] || run.id,
      generatedAt: normalizedReport["generatedAt"] || new Date().toISOString(),
      moduleCount: run.moduleOrder.length,
      artifactCount: run.artifacts.length,
      findingCount: rankedFindings.length,
      correlationClusterCount: insights.correlationClusters.length,
      narrativeCueCount: insights.narrativeCues.length,
      status: normalizedReport["status"] || run.state,
      emptyReason: normalizedReport["emptyReason"] || run.emptyReason || null,
    },
    findings: rankedFindings,
    artifacts: run.artifacts,
    warnings: Array.from(new Set(asStringArray(normalizedReport["warnings"]).concat(run.warnings))),
    errors,
    degradedConditions: Array.from(new Set(degradedConditions)),
    moduleTrace,
    analysisScope,
    comparisonVariants,
    correlationClusters: insights.correlationClusters,
    narrativeCues: insights.narrativeCues,
    forensicNotes: insights.forensicNotes,
    decisionSummary: insights.decisionSummary,
    evidenceStrength: insights.evidenceStrength,
    counterEvidenceLedger: insights.counterEvidenceLedger,
  };
}

/** V2.3: Build workspace context snapshot for report enrichment */
export interface LabWorkspaceReportContext {
  timeRange: { startMs: number | null; endMs: number | null };
  roiRegions: LabROIRegion[];
  interactiveSettings: LabInteractiveSettings;
  hypothesis: string;
  bookmarks: LabBookmark[];
}

export function buildWorkspaceContext(workspaceState: {
  timelineStartMs: number | null;
  timelineEndMs: number | null;
  roiRegions: LabROIRegion[];
  interactiveSettings: LabInteractiveSettings;
  hypothesis: string;
  bookmarks: LabBookmark[];
}): LabWorkspaceReportContext {
  return {
    timeRange: {
      startMs: workspaceState.timelineStartMs,
      endMs: workspaceState.timelineEndMs,
    },
    roiRegions: workspaceState.roiRegions.filter(function (region) {
      return region.active;
    }),
    interactiveSettings: { ...workspaceState.interactiveSettings },
    hypothesis: workspaceState.hypothesis,
    bookmarks: workspaceState.bookmarks.slice().sort(function (a, b) {
      return a.timeMs - b.timeMs;
    }),
  };
}
