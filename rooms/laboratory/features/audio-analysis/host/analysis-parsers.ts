type DetectionLogSegment = {
  startSeconds: number | null;
  endSeconds: number | null;
  durationSeconds: number;
};

type DetectionLogSummary = {
  count: number;
  totalDurationSeconds: number;
  averageDurationSeconds: number | null;
  maxDurationSeconds: number | null;
  segments: DetectionLogSegment[];
};

type VolumeDetectSummary = {
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
};

type NumericSummary = {
  sampleCount: number;
  mean: number | null;
  min: number | null;
  max: number | null;
};

type CsvTableRow = Record<string, string>;

type CsvTable = {
  header: string[];
  rows: CsvTableRow[];
};

type SpectralMetricId = "centroid" | "rolloff" | "flatness" | "flux";

type SpectralStatsSummary = Record<SpectralMetricId, NumericSummary>;

type ProsodyNumericSummaries = {
  f0?: NumericSummary;
  loudness?: NumericSummary;
  voiceProbability?: NumericSummary;
};

type ProsodySummary = {
  columns: string[];
  frameCount: number;
  durationSeconds: number;
  meanF0Hz: number | null;
  meanLoudness: number | null;
  voicedRatio: number | null;
  estimatedPauseCount: number;
  numericSummaries: ProsodyNumericSummaries;
};

type EmotionHeuristicSummary = {
  label: string;
  score: number;
  confidence: "low" | "medium";
  cues: string[];
  disclaimer: string;
  prosodySummary: Partial<ProsodySummary>;
};

const EMPTY_NUMERIC_SUMMARY: NumericSummary = {
  sampleCount: 0,
  mean: null,
  min: null,
  max: null,
};

function toText(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function asFiniteNumber(value: unknown): number | null {
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function isNonNullString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}

function buildEmptySpectralStatsSummary(): SpectralStatsSummary {
  return {
    centroid: { ...EMPTY_NUMERIC_SUMMARY },
    rolloff: { ...EMPTY_NUMERIC_SUMMARY },
    flatness: { ...EMPTY_NUMERIC_SUMMARY },
    flux: { ...EMPTY_NUMERIC_SUMMARY },
  };
}

function readDetectionField(line: string, fieldName: string): number | null {
  const escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = line.match(new RegExp(`${escapedFieldName}:\\s*([0-9.]+)`, "i"));
  return match ? asFiniteNumber(match[1]) : null;
}

function parseDetectionLogSegments(rawText: string, prefix: string): DetectionLogSegment[] {
  const segments: DetectionLogSegment[] = [];
  let pendingStartSeconds: number | null = null;

  rawText.split(/\r?\n/).forEach(function (line) {
    if (line.includes(`${prefix}_`) === false) {
      return;
    }

    const startSeconds = readDetectionField(line, `${prefix}_start`);
    const endSeconds = readDetectionField(line, `${prefix}_end`);
    const durationSeconds = readDetectionField(line, `${prefix}_duration`);
    if (startSeconds !== null) {
      pendingStartSeconds = startSeconds;
    }
    if (durationSeconds === null && endSeconds === null) {
      return;
    }
    if (durationSeconds === null && endSeconds !== null && pendingStartSeconds === null) {
      return;
    }

    const resolvedStartSeconds =
      pendingStartSeconds !== null
        ? pendingStartSeconds
        : endSeconds !== null && durationSeconds !== null
          ? Math.max(0, endSeconds - durationSeconds)
          : null;
    const resolvedEndSeconds =
      endSeconds !== null
        ? endSeconds
        : resolvedStartSeconds !== null && durationSeconds !== null
          ? resolvedStartSeconds + durationSeconds
          : null;
    const resolvedDurationSeconds =
      durationSeconds !== null
        ? durationSeconds
        : resolvedStartSeconds !== null && resolvedEndSeconds !== null
          ? Math.max(0, resolvedEndSeconds - resolvedStartSeconds)
          : 0;

    segments.push({
      startSeconds: resolvedStartSeconds,
      endSeconds: resolvedEndSeconds,
      durationSeconds: resolvedDurationSeconds,
    });
    if (endSeconds !== null || durationSeconds !== null) {
      pendingStartSeconds = null;
    }
  });

  return segments;
}

function parseDetectionLogSummary(rawText: string, prefix: string): DetectionLogSummary {
  const segments = parseDetectionLogSegments(rawText, prefix);
  const totalDurationSeconds = segments.reduce<number>(function (total, segment) {
    return total + segment.durationSeconds;
  }, 0);
  const maxDurationSeconds = segments.reduce<number | null>(function (maxValue, segment) {
    if (maxValue === null) {
      return segment.durationSeconds;
    }
    return Math.max(maxValue, segment.durationSeconds);
  }, null);

  return {
    count: segments.length,
    totalDurationSeconds,
    averageDurationSeconds: segments.length > 0 ? totalDurationSeconds / segments.length : null,
    maxDurationSeconds,
    segments,
  };
}

function parseCsvTable(rawText: unknown): CsvTable {
  const lines = toText(rawText)
    .split(/\r?\n/)
    .map(function (entry) {
      return entry.trim();
    })
    .filter(function (entry) {
      return entry.length > 0;
    });

  if (lines.length < 2) {
    return {
      header: [],
      rows: [],
    };
  }

  const header = (lines[0] ?? "").split(";").map(function (entry) {
    return entry.trim();
  });
  const rows = lines.slice(1).map(function (line) {
    const values = line.split(";").map(function (entry) {
      return entry.trim();
    });
    return header.reduce<CsvTableRow>(function (record, key, index) {
      record[key] = values[index] ?? "";
      return record;
    }, {});
  });

  return {
    header,
    rows,
  };
}

function buildNumericSummary(values: number[]): NumericSummary {
  const samples = values.filter(function (entry) {
    return Number.isFinite(entry);
  });
  if (samples.length === 0) {
    return { ...EMPTY_NUMERIC_SUMMARY };
  }

  const total = samples.reduce<number>(function (sum, sample) {
    return sum + sample;
  }, 0);

  return {
    sampleCount: samples.length,
    mean: total / samples.length,
    min: Math.min(...samples),
    max: Math.max(...samples),
  };
}

function findProsodyColumn(header: string[], pattern: RegExp): string | null {
  return (
    header.find(function (column) {
      return pattern.test(column);
    }) ?? null
  );
}

function toPartialProsodySummary(value: unknown): Partial<ProsodySummary> {
  return value !== null && typeof value === "object" ? value : {};
}

export function createAudioAnalysisParserRuntime() {
  function parseBlackDetectLog(stderrValue: unknown): DetectionLogSummary {
    return parseDetectionLogSummary(toText(stderrValue), "black");
  }

  function parseFreezeDetectLog(stderrValue: unknown): DetectionLogSummary {
    return parseDetectionLogSummary(toText(stderrValue), "freeze");
  }

  function parseSilenceDetectLog(stderrValue: unknown): DetectionLogSummary {
    return parseDetectionLogSummary(toText(stderrValue), "silence");
  }

  function parseVolumeDetectLog(stderrValue: unknown): VolumeDetectSummary {
    const rawText = toText(stderrValue);
    const meanMatch = rawText.match(/mean_volume:\s*(-?[0-9.]+)\s*dB/i);
    const maxMatch = rawText.match(/max_volume:\s*(-?[0-9.]+)\s*dB/i);

    return {
      meanVolumeDb: meanMatch ? asFiniteNumber(meanMatch[1]) : null,
      maxVolumeDb: maxMatch ? asFiniteNumber(maxMatch[1]) : null,
    };
  }

  function parseAspectralStatsText(rawText: unknown): SpectralStatsSummary {
    const metricSamples: Record<string, number[]> = {};

    Array.from(
      toText(rawText).matchAll(/lavfi\.aspectralstats\.([a-zA-Z0-9_.-]+)=(-?[0-9.]+)/g)
    ).forEach(function (match) {
      const metricId = match[1] ?? "";
      const numericValue = asFiniteNumber(match[2] ?? "");
      if (metricId.length === 0 || numericValue === null) {
        return;
      }
      const existingSamples = metricSamples[metricId] ?? [];
      existingSamples.push(numericValue);
      metricSamples[metricId] = existingSamples;
    });

    return (["centroid", "rolloff", "flatness", "flux"] as const).reduce<SpectralStatsSummary>(
      function (accumulator, metricId) {
        accumulator[metricId] = buildNumericSummary(metricSamples[metricId] ?? []);
        return accumulator;
      },
      buildEmptySpectralStatsSummary()
    );
  }

  function buildProsodySummaryFromCsv(rawText: unknown): ProsodySummary {
    const table = parseCsvTable(rawText);
    const header = table.header;
    const rows = table.rows;
    const timestampKey = findProsodyColumn(header, /timestamp/i);
    const f0Key = findProsodyColumn(header, /(^|[_-])F0/i);
    const loudnessKey = findProsodyColumn(header, /loudness/i);
    const voiceProbKey = findProsodyColumn(header, /voiceprob/i);
    const f0Values: number[] = [];
    const loudnessValues: number[] = [];
    const timestampValues: number[] = [];
    const voiceProbValues: number[] = [];
    let voicedFrames = 0;
    let estimatedPauseCount = 0;
    let previousVoiced = false;

    rows.forEach(function (record) {
      const timestampValue = asFiniteNumber(timestampKey === null ? null : record[timestampKey]);
      const f0Value = asFiniteNumber(f0Key === null ? null : record[f0Key]);
      const loudnessValue = asFiniteNumber(loudnessKey === null ? null : record[loudnessKey]);
      const voiceProbValue = asFiniteNumber(voiceProbKey === null ? null : record[voiceProbKey]);

      if (timestampValue !== null) {
        timestampValues.push(timestampValue);
      }
      if (f0Value !== null && f0Value > 0) {
        f0Values.push(f0Value);
      }
      if (loudnessValue !== null) {
        loudnessValues.push(loudnessValue);
      }
      if (voiceProbValue !== null) {
        voiceProbValues.push(voiceProbValue);
      }

      const voiced =
        voiceProbValue !== null ? voiceProbValue >= 0.5 : f0Value !== null && f0Value > 0;
      if (voiced) {
        voicedFrames += 1;
      }
      if (previousVoiced && voiced === false) {
        estimatedPauseCount += 1;
      }
      previousVoiced = voiced;
    });

    const totalDurationSeconds =
      timestampValues.length > 1 &&
      (timestampValues[timestampValues.length - 1] ?? 0) >= (timestampValues[0] ?? 0)
        ? (timestampValues[timestampValues.length - 1] ?? 0) - (timestampValues[0] ?? 0)
        : 0;

    const voicedRatio = rows.length > 0 ? voicedFrames / rows.length : null;
    const numericSummaries: ProsodyNumericSummaries = {};

    if (f0Values.length > 0) {
      numericSummaries.f0 = buildNumericSummary(f0Values);
    }
    if (loudnessValues.length > 0) {
      numericSummaries.loudness = buildNumericSummary(loudnessValues);
    }
    if (voiceProbValues.length > 0) {
      numericSummaries.voiceProbability = buildNumericSummary(voiceProbValues);
    }

    return {
      columns: header,
      frameCount: rows.length,
      durationSeconds: totalDurationSeconds,
      meanF0Hz: numericSummaries.f0?.mean ?? null,
      meanLoudness: numericSummaries.loudness?.mean ?? null,
      voicedRatio,
      estimatedPauseCount,
      numericSummaries,
    };
  }

  function buildEmotionHeuristicFromProsody(prosodySummary: unknown): EmotionHeuristicSummary {
    const summary = toPartialProsodySummary(prosodySummary);
    const cues: string[] = [];
    let score = 0;

    if (typeof summary.meanF0Hz === "number") {
      if (summary.meanF0Hz >= 185) {
        score += 1;
        cues.push("Pitch baseline trends high.");
      } else if (summary.meanF0Hz <= 140) {
        score -= 1;
        cues.push("Pitch baseline trends low.");
      }
    }

    if (typeof summary.voicedRatio === "number") {
      if (summary.voicedRatio >= 0.7) {
        score += 1;
        cues.push("Voiced ratio stays consistently high.");
      } else if (summary.voicedRatio <= 0.45) {
        score -= 1;
        cues.push("Voiced ratio drops across the sample.");
      }
    }

    if (
      typeof summary.estimatedPauseCount === "number" &&
      typeof summary.durationSeconds === "number" &&
      summary.durationSeconds > 0
    ) {
      const pauseDensity = summary.estimatedPauseCount / Math.max(summary.durationSeconds, 1);
      if (pauseDensity >= 0.45) {
        score -= 1;
        cues.push("Estimated pause density is elevated.");
      } else if (pauseDensity <= 0.12) {
        score += 1;
        cues.push("Estimated pause density stays low.");
      }
    }

    const label =
      score >= 2
        ? "elevated-arousal-candidate"
        : score <= -2
          ? "subdued-arousal-candidate"
          : "steady-arousal-candidate";

    return {
      label,
      score,
      confidence: Math.abs(score) >= 3 ? "medium" : "low",
      cues: cues.filter(isNonNullString),
      disclaimer:
        "Heuristic only. This module suggests coarse arousal-style labels and is not a factual emotion classifier.",
      prosodySummary: summary,
    };
  }

  return {
    buildEmotionHeuristicFromProsody,
    buildProsodySummaryFromCsv,
    parseAspectralStatsText,
    parseBlackDetectLog,
    parseFreezeDetectLog,
    parseSilenceDetectLog,
    parseVolumeDetectLog,
  };
}
