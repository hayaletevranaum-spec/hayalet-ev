import type { PatternEdgeType, PatternLayer } from "../types/pattern-room-domain.js";
import type {
  PatternRoomCaseReviewResult,
  PatternRoomCaseReviewSectionKey,
} from "../types/pattern-room-case-review-result.js";
import type {
  PatternRoomCaseReviewApplyMode,
  PatternRoomCaseReviewApplySummary,
} from "../types/pattern-room-case-review-session.js";

export type PatternRoomCaseReviewApplyTarget = {
  readonly addAuthoredClaim: (label: string, content: string) => void;
  readonly addAuthoredUncertainty: (label: string, content: string) => void;
  readonly addAuthoredEvidence: (
    label: string,
    excerpt: string,
    interpretation?: string,
    layer?: PatternLayer
  ) => void;
  readonly addEvidenceCandidate: (
    suggestionId: string,
    text: string,
    reviewSessionId?: string | null
  ) => boolean;
  readonly addAuthoredEdge: (
    edgeType: PatternEdgeType,
    sourceId: string,
    targetId: string,
    note?: string
  ) => void;
  readonly resolveEntityExists: (id: string) => boolean;
};

export type PatternRoomCaseReviewApplyCopy = {
  readonly reviewPrefix: string;
  readonly evidenceSuggestionLabel: string;
  readonly openQuestionLabel: string;
  readonly userAppliedSuggestion: string;
  readonly sectionLabels: Readonly<Record<PatternRoomCaseReviewSectionKey, string>>;
};

export type PatternRoomCaseReviewApplyOptions = {
  readonly mode: PatternRoomCaseReviewApplyMode;
  readonly sessionId?: string | null;
  readonly copy?: PatternRoomCaseReviewApplyCopy;
};

const DEFAULT_APPLY_COPY: PatternRoomCaseReviewApplyCopy = Object.freeze({
  reviewPrefix: "AI Review",
  evidenceSuggestionLabel: "Evidence Suggestion",
  openQuestionLabel: "Open Question",
  userAppliedSuggestion: "User-applied AI suggestion; not independently verified.",
  sectionLabels: Object.freeze({
    observation: "Observation",
    evidence: "Evidence",
    analysis: "Analysis",
    counterArgument: "Counter Argument",
    missingInformation: "Missing Information",
    openQuestions: "Open Questions",
    confidenceNotes: "Confidence Notes",
  }),
});

type MutableApplySummary = {
  mode: PatternRoomCaseReviewApplyMode;
  boardNotesAdded: number;
  evidenceAdded: number;
  evidenceCandidatesAdded: number;
  openQuestionsAdded: number;
  uncertaintyAdded: number;
  connectionsAdded: number;
  skipped: number;
  warnings: string[];
};

function createSummary(mode: PatternRoomCaseReviewApplyMode): MutableApplySummary {
  return {
    mode,
    boardNotesAdded: 0,
    evidenceAdded: 0,
    evidenceCandidatesAdded: 0,
    openQuestionsAdded: 0,
    uncertaintyAdded: 0,
    connectionsAdded: 0,
    skipped: 0,
    warnings: [],
  };
}

function freezeSummary(summary: MutableApplySummary): PatternRoomCaseReviewApplySummary {
  return Object.freeze({
    ...summary,
    warnings: Object.freeze([...summary.warnings]),
  });
}

function applyBoardNotes(
  result: PatternRoomCaseReviewResult,
  target: PatternRoomCaseReviewApplyTarget,
  summary: MutableApplySummary,
  copy: PatternRoomCaseReviewApplyCopy
): void {
  const boardSections = [
    result.sections.observation,
    result.sections.analysis,
    result.sections.counterArgument,
  ] as const;

  boardSections.forEach((section) => {
    section.items.forEach((item, index) => {
      target.addAuthoredClaim(
        `${copy.reviewPrefix} ${copy.sectionLabels[section.key]} ${String(index + 1)}`,
        item.text
      );
      summary.boardNotesAdded += 1;
    });
  });
}

function retainEvidenceCandidates(
  result: PatternRoomCaseReviewResult,
  target: PatternRoomCaseReviewApplyTarget,
  summary: MutableApplySummary,
  reviewSessionId?: string | null
): void {
  result.suggestions
    .filter((suggestion) => suggestion.kind === "evidence_candidate")
    .forEach((suggestion) => {
      if (target.addEvidenceCandidate(suggestion.id, suggestion.text, reviewSessionId)) {
        summary.evidenceCandidatesAdded += 1;
        return;
      }
      summary.skipped += 1;
      summary.warnings.push(
        `Evidence candidate was not stored because it was empty or already existed: ${suggestion.id}.`
      );
    });
}

function applyOpenQuestions(
  result: PatternRoomCaseReviewResult,
  target: PatternRoomCaseReviewApplyTarget,
  summary: MutableApplySummary,
  copy: PatternRoomCaseReviewApplyCopy
): void {
  result.openQuestions.forEach((question, index) => {
    target.addAuthoredUncertainty(
      `${copy.reviewPrefix} ${copy.openQuestionLabel} ${String(index + 1)}`,
      question
    );
    summary.openQuestionsAdded += 1;
  });
}

function applyUncertaintyNotes(
  result: PatternRoomCaseReviewResult,
  target: PatternRoomCaseReviewApplyTarget,
  summary: MutableApplySummary,
  copy: PatternRoomCaseReviewApplyCopy
): void {
  const uncertaintySections = [
    result.sections.missingInformation,
    result.sections.confidenceNotes,
  ] as const;

  uncertaintySections.forEach((section) => {
    section.items.forEach((item, index) => {
      target.addAuthoredUncertainty(
        `${copy.reviewPrefix} ${copy.sectionLabels[section.key]} ${String(index + 1)}`,
        item.text
      );
      summary.uncertaintyAdded += 1;
    });
  });
}

function applyConnections(
  result: PatternRoomCaseReviewResult,
  target: PatternRoomCaseReviewApplyTarget,
  summary: MutableApplySummary
): void {
  result.suggestedConnections.forEach((connection) => {
    const sourceExists = target.resolveEntityExists(connection.sourceId);
    const targetExists = target.resolveEntityExists(connection.targetId);
    if (!sourceExists || !targetExists) {
      summary.skipped += 1;
      summary.warnings.push(
        `Suggested connection skipped because exact endpoint ids were not found: ${connection.sourceId} -> ${connection.targetId}.`
      );
      return;
    }

    target.addAuthoredEdge(
      connection.edgeType,
      connection.sourceId,
      connection.targetId,
      connection.note ?? undefined
    );
    summary.connectionsAdded += 1;
  });
}

export function applyPatternRoomCaseReview(
  result: PatternRoomCaseReviewResult,
  target: PatternRoomCaseReviewApplyTarget,
  options: PatternRoomCaseReviewApplyOptions
): PatternRoomCaseReviewApplySummary {
  const summary = createSummary(options.mode);
  const copy = options.copy ?? DEFAULT_APPLY_COPY;

  if (options.mode === "open-questions-only") {
    applyOpenQuestions(result, target, summary, copy);
    return freezeSummary(summary);
  }

  if (options.mode === "evidence-suggestions-only") {
    retainEvidenceCandidates(result, target, summary, options.sessionId);
    return freezeSummary(summary);
  }

  applyBoardNotes(result, target, summary, copy);
  retainEvidenceCandidates(result, target, summary, options.sessionId);
  applyOpenQuestions(result, target, summary, copy);
  applyUncertaintyNotes(result, target, summary, copy);
  applyConnections(result, target, summary);
  return freezeSummary(summary);
}

export function previewPatternRoomCaseReviewApply(
  result: PatternRoomCaseReviewResult,
  target: Pick<PatternRoomCaseReviewApplyTarget, "resolveEntityExists">,
  options: PatternRoomCaseReviewApplyOptions
): PatternRoomCaseReviewApplySummary {
  return applyPatternRoomCaseReview(
    result,
    {
      addAuthoredClaim: () => undefined,
      addAuthoredUncertainty: () => undefined,
      addAuthoredEvidence: () => undefined,
      addEvidenceCandidate: () => true,
      addAuthoredEdge: () => undefined,
      resolveEntityExists: target.resolveEntityExists,
    },
    options
  );
}
