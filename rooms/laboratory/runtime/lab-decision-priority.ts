type LabDecisionSummaryCoherenceState = "aligned" | "mixed" | "conflicted";

type LabDecisionSummaryPartKey = "descriptor" | "readiness" | "bridge" | "coherence";

type LabDecisionSummaryParts = {
  posturePrefix?: string;
  descriptor?: string;
  readiness?: string;
  bridge?: string;
  coherence?: string;
};

type LabDecisionSummaryPriorityInput = {
  summaryParts: LabDecisionSummaryParts;
  coherenceState?: LabDecisionSummaryCoherenceState;
};

const BASE_ORDER: LabDecisionSummaryPartKey[] = ["descriptor", "readiness", "bridge", "coherence"];
const MIXED_ORDER: LabDecisionSummaryPartKey[] = ["descriptor", "readiness", "coherence", "bridge"];
const CONFLICTED_ORDER: LabDecisionSummaryPartKey[] = [
  "coherence",
  "readiness",
  "descriptor",
  "bridge",
];

function getPriorityOrder(
  coherenceState: LabDecisionSummaryPriorityInput["coherenceState"]
): LabDecisionSummaryPartKey[] {
  if (coherenceState === "conflicted") {
    return CONFLICTED_ORDER;
  }
  if (coherenceState === "mixed") {
    return MIXED_ORDER;
  }
  return BASE_ORDER;
}

function normalizeJoinPart(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

export function reorderDecisionSummary(input: LabDecisionSummaryPriorityInput): string {
  const { summaryParts } = input;
  const posturePrefix = normalizeJoinPart(summaryParts.posturePrefix);
  const orderedParts = getPriorityOrder(input.coherenceState)
    .map(function (partKey) {
      return normalizeJoinPart(summaryParts[partKey]);
    })
    .filter(function (part): part is string {
      return part !== null;
    });

  return [posturePrefix, ...orderedParts]
    .filter(function (part): part is string {
      return part !== null;
    })
    .join(" ");
}
