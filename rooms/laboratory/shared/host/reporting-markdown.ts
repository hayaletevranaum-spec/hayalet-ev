type LaboratoryRecord = Record<string, unknown>;

type LaboratoryProjectRecord = LaboratoryRecord & {
  name?: unknown;
};

type LaboratoryReportCardRecord = LaboratoryRecord & {
  label?: unknown;
  labelKey?: unknown;
  value?: unknown;
};

type LaboratoryReportFindingRecord = LaboratoryRecord & {
  confidence?: unknown;
  detail?: unknown;
  evidence?: unknown;
  moduleId?: unknown;
  title?: unknown;
};

type LaboratoryReportExportRecord = LaboratoryRecord & {
  fileName?: unknown;
  format?: unknown;
  path?: unknown;
  status?: unknown;
};

type LaboratoryFeatureReportRecord = LaboratoryRecord & {
  aiReport?: unknown;
  caveats?: unknown;
  exports?: unknown;
  findings?: unknown;
  generatedAt?: unknown;
  summaryCards?: unknown;
  userReport?: unknown;
  warnings?: unknown;
};

type LaboratoryAudioMetricRecord = LaboratoryRecord & {
  id?: unknown;
  label?: unknown;
  value?: unknown;
};

type LaboratoryAudioModuleResultRecord = LaboratoryRecord & {
  blockers?: unknown;
  metrics?: unknown;
  moduleId?: unknown;
  status?: unknown;
  summary?: unknown;
  warnings?: unknown;
};

type LaboratoryAudioReportProjection = {
  orderedResults: LaboratoryAudioModuleResultRecord[];
};

type LaboratoryReportMarkdownRuntimeDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  audioFeatureId: string;
  buildAudioAnalysisReportProjection: (
    runtime: LaboratoryRecord,
    project: LaboratoryProjectRecord
  ) => LaboratoryAudioReportProjection;
  formatIdentifierLabel: (value: string) => string;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createLaboratoryReportMarkdownRuntime(deps: LaboratoryReportMarkdownRuntimeDeps) {
  const {
    asNonEmptyString,
    audioFeatureId,
    buildAudioAnalysisReportProjection,
    formatIdentifierLabel,
    toRecord,
  } = deps;

  function toProjectRecord(value: unknown): LaboratoryProjectRecord {
    return toRecord(value);
  }

  function toReportCardRecord(value: unknown): LaboratoryReportCardRecord {
    return toRecord(value);
  }

  function toFeatureReportRecord(value: unknown): LaboratoryFeatureReportRecord {
    return toRecord(value);
  }

  function toFindingRecord(value: unknown): LaboratoryReportFindingRecord {
    return toRecord(value);
  }

  function toExportRecord(value: unknown): LaboratoryReportExportRecord {
    return toRecord(value);
  }

  function toMetricRecord(value: unknown): LaboratoryAudioMetricRecord {
    return toRecord(value);
  }

  function toAudioModuleResultRecord(value: unknown): LaboratoryAudioModuleResultRecord {
    return toRecord(value);
  }

  function toInsightRecord(value: unknown): LaboratoryRecord {
    return toRecord(value);
  }

  function toString(value: unknown, fallback = ""): string {
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return fallback;
  }

  function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map(function (entry) {
        const stringValue = toString(entry).trim();
        return stringValue !== "" ? stringValue : null;
      })
      .filter((entry): entry is string => entry !== null);
  }

  function formatValue(value: unknown): string {
    const stringValue = toString(value).trim();
    return stringValue !== "" ? stringValue : "--";
  }

  function formatReportCardLabel(card: LaboratoryReportCardRecord): string {
    const label = asNonEmptyString(card.label);
    if (label !== null) {
      return label;
    }

    const labelKey = asNonEmptyString(card.labelKey);
    if (labelKey !== null) {
      return formatIdentifierLabel(labelKey.split(".").pop() || labelKey);
    }

    return "Summary";
  }

  function getFeatureLabel(featureId: string | null): string {
    if (featureId === audioFeatureId) {
      return "Audio Analysis";
    }
    return "Media Analysis";
  }

  function buildReportMarkdown(
    runtime: LaboratoryRecord,
    project: LaboratoryProjectRecord,
    featureId: string | null,
    reportRecord: LaboratoryFeatureReportRecord
  ): string {
    const projectRecord = toProjectRecord(project);
    const normalizedReportRecord = toFeatureReportRecord(reportRecord);
    const userReport = toRecord(normalizedReportRecord.userReport);
    const emptyReason = asNonEmptyString(normalizedReportRecord["emptyReason"]);
    const lines = [
      `# ${getFeatureLabel(featureId)} Report`,
      "",
      `Project: ${asNonEmptyString(projectRecord.name) || "--"}`,
      `Generated: ${asNonEmptyString(normalizedReportRecord.generatedAt) || new Date().toISOString()}`,
      "",
      "## Summary",
    ];

    if (asNonEmptyString(userReport["summary"]) !== null) {
      lines.push(asNonEmptyString(userReport["summary"]) || "--");
      lines.push("");
      lines.push(`Confidence: ${formatValue(userReport["confidence"])}`);
    } else {
      const summaryCards = Array.isArray(normalizedReportRecord.summaryCards)
        ? normalizedReportRecord.summaryCards.map(toReportCardRecord)
        : [];
      summaryCards.forEach(function (card) {
        lines.push(`- ${formatReportCardLabel(card)}: ${formatValue(card.value)}`);
      });
      if (summaryCards.length === 0 && emptyReason !== null) {
        lines.push(emptyReason);
      }
    }

    if (featureId === audioFeatureId) {
      const projection = buildAudioAnalysisReportProjection(runtime, projectRecord);
      lines.push("", "## Modules");
      projection.orderedResults.map(toAudioModuleResultRecord).forEach(function (result) {
        const metrics = Array.isArray(result.metrics) ? result.metrics.map(toMetricRecord) : [];
        const metricsSummary = metrics
          .map(function (metric) {
            const label =
              asNonEmptyString(metric.label) || formatIdentifierLabel(toString(metric.id));
            return `${label}: ${formatValue(metric.value)}`;
          })
          .filter(Boolean)
          .join(", ");

        lines.push(
          `- ${formatIdentifierLabel(toString(result.moduleId, "module"))}: ${formatIdentifierLabel(
            toString(result.status, "idle")
          )}${toString(result.summary) !== "" ? ` - ${toString(result.summary)}` : ""}`
        );
        const blockers = toStringArray(result.blockers);
        const warnings = toStringArray(result.warnings);
        if (metricsSummary !== "") {
          lines.push(`  Metrics: ${metricsSummary}`);
        }
        if (blockers.length > 0) {
          lines.push(`  Blockers: ${blockers.join(" | ")}`);
        }
        if (warnings.length > 0) {
          lines.push(`  Warnings: ${warnings.join(" | ")}`);
        }
      });
    }

    const decisionSummary = toInsightRecord(userReport["decisionSummary"]);
    if (Object.keys(decisionSummary).length > 0) {
      lines.push("", "## Triage Decision");
      lines.push(`- Anomaly: ${formatValue(decisionSummary["anomaly"])}`);
      lines.push(
        `- Likely technical explanation: ${formatValue(decisionSummary["likelyTechnicalExplanation"])}`
      );
      lines.push(
        `- Manipulation suspicion: ${formatValue(decisionSummary["manipulationSuspicion"])}`
      );
      lines.push(`- Follow-up required: ${formatValue(decisionSummary["needsFollowUp"])}`);
      if (asNonEmptyString(decisionSummary["rationale"]) !== null) {
        lines.push(`- Rationale: ${formatValue(decisionSummary["rationale"])}`);
      }
    }

    const evidenceStrength = Array.isArray(userReport["evidenceStrength"])
      ? (userReport["evidenceStrength"] as unknown[]).map(toInsightRecord)
      : [];
    if (evidenceStrength.length > 0) {
      lines.push("", "## Evidence Strength");
      evidenceStrength.forEach(function (entry) {
        lines.push(
          `- ${formatValue(entry["label"])}: ${formatValue(entry["strength"])} - ${formatValue(
            entry["detail"]
          )}`
        );
      });
    }

    const counterEvidenceLedger = toInsightRecord(userReport["counterEvidenceLedger"]);
    const counterEvidenceEntries = Array.isArray(counterEvidenceLedger["entries"])
      ? (counterEvidenceLedger["entries"] as unknown[]).map(toInsightRecord)
      : [];
    if (counterEvidenceEntries.length > 0) {
      lines.push("", "## Counter Evidence");
      if (asNonEmptyString(counterEvidenceLedger["summary"]) !== null) {
        lines.push(formatValue(counterEvidenceLedger["summary"]));
      }
      counterEvidenceEntries.forEach(function (entry) {
        lines.push(
          `- ${formatValue(entry["label"])} (${formatValue(entry["status"])}): ${formatValue(
            entry["detail"]
          )}`
        );
      });
    }

    const correlationClusters = Array.isArray(userReport["topCorrelationClusters"])
      ? (userReport["topCorrelationClusters"] as unknown[]).map(toInsightRecord)
      : [];
    if (correlationClusters.length > 0) {
      lines.push("", "## Correlation");
      correlationClusters.forEach(function (cluster) {
        lines.push(
          `- ${formatValue(cluster["title"])}: score ${formatValue(cluster["score"])} (${formatValue(
            cluster["level"]
          )})`
        );
        if (asNonEmptyString(cluster["detail"]) !== null) {
          lines.push(`  ${asNonEmptyString(cluster["detail"])}`);
        }
      });
    }

    const narrativeCues = Array.isArray(userReport["narrativeCues"])
      ? (userReport["narrativeCues"] as unknown[]).map(toInsightRecord)
      : [];
    if (narrativeCues.length > 0) {
      lines.push("", "## Narrative Cues");
      narrativeCues.forEach(function (cue) {
        const qualifiers = [cue["confidence"], cue["temporalBasis"]]
          .map(formatValue)
          .filter(function (entry) {
            return entry !== "-";
          });
        lines.push(
          `- ${formatValue(cue["phrase"])}${
            qualifiers.length > 0 ? ` (${qualifiers.join(", ")})` : ""
          }: ${formatValue(cue["detail"])}`
        );
      });
    }

    const forensicNotes = Array.isArray(userReport["forensicNotes"])
      ? (userReport["forensicNotes"] as unknown[]).map(toInsightRecord)
      : [];
    if (forensicNotes.length > 0) {
      lines.push("", "## Forensic Notes");
      forensicNotes.forEach(function (note) {
        lines.push(`- ${formatValue(note["label"])}: ${formatValue(note["detail"])}`);
      });
    }

    lines.push("", "## Findings");
    const findings = Array.isArray(userReport["topFindings"])
      ? (userReport["topFindings"] as unknown[]).map(toFindingRecord)
      : Array.isArray(normalizedReportRecord.findings)
        ? normalizedReportRecord.findings.map(toFindingRecord)
        : [];
    if (findings.length > 0) {
      findings.forEach(function (finding) {
        lines.push(
          `- ${toString(finding.title) || toString(finding.moduleId) || "Finding"}: ${toString(
            finding.detail
          )}${asNonEmptyString(finding.confidence) ? ` (${toString(finding.confidence)})` : ""}`
        );
        const evidence = toStringArray(finding.evidence);
        if (evidence.length > 0) {
          lines.push(`  Evidence: ${evidence.join(" | ")}`);
        }
      });
    } else {
      lines.push(`- ${emptyReason || "No findings were recorded for the active report."}`);
    }

    const caveats = toStringArray(normalizedReportRecord.caveats);
    if (caveats.length > 0) {
      lines.push("", "## Caveats");
      caveats.forEach(function (entry) {
        lines.push(`- ${entry}`);
      });
    }

    const warnings = toStringArray(normalizedReportRecord.warnings);
    if (warnings.length > 0) {
      lines.push("", "## Warnings");
      warnings.forEach(function (entry) {
        lines.push(`- ${entry}`);
      });
    }

    const exports = Array.isArray(normalizedReportRecord.exports)
      ? normalizedReportRecord.exports.map(toExportRecord)
      : [];
    if (exports.length > 0) {
      lines.push("", "## Exports");
      exports.forEach(function (entry) {
        lines.push(
          `- ${toString(entry.fileName) || toString(entry.path) || "--"} (${toString(
            entry.format,
            "md"
          )}, ${toString(entry.status, "ready")})`
        );
      });
    }

    return lines.join("\n");
  }

  return {
    buildReportMarkdown,
    formatReportCardLabel,
  };
}
