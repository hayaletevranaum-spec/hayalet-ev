import { resolveLabI18n, type LabI18nKey, type LabI18nLocale } from "./lab-i18n.js";

export type LabDecisionCoherence = {
  state: "aligned" | "mixed" | "conflicted";
  dominantAxis: "safety" | "exploration" | "neutral";
  confidence: number;
  summary: string;
};

type LabDecisionCoherenceInput = {
  posture?: "proceed" | "proceed-with-caution" | "reconsider";
  readiness?: {
    level: "steady" | "guarded" | "strained";
    score: number;
  };
  projection?: {
    expectedAlignment?: "better" | "worse" | "similar";
    expectedStability?: "higher" | "lower" | "similar";
    expectedCoverage?: "increase" | "decrease" | "stable";
  };
};

type LabDecisionCoherenceProjection = NonNullable<LabDecisionCoherenceInput["projection"]>;

function scorePosture(posture: LabDecisionCoherenceInput["posture"]) {
  if (posture === "proceed") {
    return 1;
  }
  if (posture === "reconsider") {
    return -1;
  }
  return 0;
}

function scoreReadiness(readiness: LabDecisionCoherenceInput["readiness"]) {
  if (readiness?.level === "steady") {
    return 1;
  }
  if (readiness?.level === "strained") {
    return -1;
  }
  return 0;
}

function scoreProjectionAlignment(alignment: LabDecisionCoherenceProjection["expectedAlignment"]) {
  if (alignment === "better") {
    return 1;
  }
  if (alignment === "worse") {
    return -1;
  }
  return 0;
}

function scoreProjectionStability(stability: LabDecisionCoherenceProjection["expectedStability"]) {
  if (stability === "higher") {
    return 1;
  }
  if (stability === "lower") {
    return -1;
  }
  return 0;
}

function scoreProjection(projection: LabDecisionCoherenceInput["projection"]) {
  const projectionScore =
    scoreProjectionAlignment(projection?.expectedAlignment) +
    scoreProjectionStability(projection?.expectedStability);
  if (projectionScore >= 1) {
    return 1;
  }
  if (projectionScore <= -1) {
    return -1;
  }
  return 0;
}

function resolveState(totalScore: number): LabDecisionCoherence["state"] {
  if (totalScore >= 2) {
    return "aligned";
  }
  if (totalScore <= -2) {
    return "conflicted";
  }
  return "mixed";
}

function resolveDominantAxis(
  readiness: LabDecisionCoherenceInput["readiness"],
  projection: LabDecisionCoherenceInput["projection"]
): LabDecisionCoherence["dominantAxis"] {
  if (projection?.expectedCoverage === "increase") {
    return "exploration";
  }
  if (readiness?.level === "strained") {
    return "safety";
  }
  return "neutral";
}

function formatAxisHint(axis: LabDecisionCoherence["dominantAxis"], locale: LabI18nLocale) {
  if (locale === "tr") {
    if (axis === "exploration") {
      return " ve keşif eğilimi taşıyor";
    }
    if (axis === "safety") {
      return " ve dikkat sinyalleri taşıyor";
    }
    return "";
  }
  if (axis === "exploration") {
    return " with exploratory tendencies";
  }
  if (axis === "safety") {
    return " with cautionary signals";
  }
  return "";
}

function getCoherenceKey(state: LabDecisionCoherence["state"]): LabI18nKey {
  if (state === "aligned") {
    return "coherence.aligned";
  }
  if (state === "conflicted") {
    return "coherence.conflicted";
  }
  return "coherence.mixed";
}

export function formatDecisionCoherenceAdvisory(
  coherence: LabDecisionCoherence,
  locale: LabI18nLocale = "en"
): string {
  const view = resolveLabI18n("coherence.view", locale);
  const axisHint = formatAxisHint(coherence.dominantAxis, locale);
  return `${view}: ${resolveLabI18n(getCoherenceKey(coherence.state), locale)}${axisHint}.`;
}

export function buildDecisionCoherence(input: LabDecisionCoherenceInput): LabDecisionCoherence {
  const totalScore =
    scorePosture(input.posture) +
    scoreReadiness(input.readiness) +
    scoreProjection(input.projection);
  const coherence = {
    state: resolveState(totalScore),
    dominantAxis: resolveDominantAxis(input.readiness, input.projection),
    confidence: Math.min(1, Math.abs(totalScore) / 3),
    summary: "",
  } satisfies LabDecisionCoherence;
  return {
    ...coherence,
    summary: formatDecisionCoherenceAdvisory(coherence),
  };
}
