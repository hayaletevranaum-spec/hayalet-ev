import {
  PATTERN_ROOM_CASE_REVIEW_SECTION_KEYS,
  type PatternRoomCaseReviewResult,
  type PatternRoomCaseReviewSectionKey,
} from "../../shared/types/pattern-room-case-review-result.js";
import type {
  PatternRoomCaseReviewApplyMode,
  PatternRoomCaseReviewHistoryEntry,
  PatternRoomCaseReviewSession,
  PatternRoomCaseReviewSessionStatus,
} from "../../shared/types/pattern-room-case-review-session.js";
import type {
  PatternRoomEvidenceCandidate,
  PatternRoomEvidenceCandidatePromotionInput,
} from "../../shared/types/pattern-room-evidence-candidate.js";
import type {
  PatternCaseReviewTextKey,
  PatternCaseReviewTranslator,
} from "../pattern-case-review-i18n.js";
import {
  createActionButton,
  createElement,
  createEmptyState,
  type PatternEmptyStateKind,
} from "./pattern-panel-utils.js";

export type PatternCaseReviewApplyFeedback = {
  readonly tone: "success" | "error";
  readonly message: string;
};

export type PatternCaseReviewEvidenceSourceOption = {
  readonly id: string;
  readonly label: string;
};

export type PatternCaseReviewRuntimePanelState = {
  readonly session: PatternRoomCaseReviewSession | null;
  readonly history: readonly PatternRoomCaseReviewHistoryEntry[];
  readonly applyFeedback: PatternCaseReviewApplyFeedback | null;
  readonly applyDisabled: boolean;
  readonly evidenceCandidates: readonly PatternRoomEvidenceCandidate[];
  readonly evidenceCandidateSources: readonly PatternCaseReviewEvidenceSourceOption[];
  readonly evidenceCandidateFeedback: PatternCaseReviewApplyFeedback | null;
  readonly text: PatternCaseReviewTranslator;
  readonly onCancel: () => void;
  readonly onRetry: () => void;
  readonly onResend: () => void;
  readonly onApply: (mode: PatternRoomCaseReviewApplyMode) => void;
  readonly onPromoteEvidenceCandidate: (input: PatternRoomEvidenceCandidatePromotionInput) => void;
  readonly onRemoveEvidenceCandidate: (candidateId: string) => void;
};

const STATUS_TEXT_KEYS: Readonly<
  Record<PatternRoomCaseReviewSessionStatus, PatternCaseReviewTextKey>
> = {
  preview: "statuses.idle",
  dispatching: "statuses.running",
  "waiting-reply": "statuses.waiting",
  ready: "statuses.ready",
  failed: "statuses.error",
  "timed-out": "statuses.timeout",
  cancelled: "statuses.cancelled",
  applied: "statuses.applied",
};

const STATUS_CLASS_NAMES: Readonly<Record<PatternRoomCaseReviewSessionStatus, string>> = {
  preview: "idle",
  dispatching: "running",
  "waiting-reply": "waiting",
  ready: "ready",
  failed: "error",
  "timed-out": "timeout",
  cancelled: "cancelled",
  applied: "applied",
};

const SECTION_TEXT_KEYS: Readonly<
  Record<PatternRoomCaseReviewSectionKey, PatternCaseReviewTextKey>
> = {
  observation: "sections.observation",
  evidence: "sections.evidence",
  analysis: "sections.analysis",
  counterArgument: "sections.counterArgument",
  missingInformation: "sections.missingInformation",
  openQuestions: "sections.openQuestions",
  confidenceNotes: "sections.confidenceNotes",
};

function resolveSessionEmptyKind(
  session: PatternRoomCaseReviewSession | null
): PatternEmptyStateKind {
  if (
    session === null ||
    session.status === "preview" ||
    session.status === "dispatching" ||
    session.status === "waiting-reply"
  ) {
    return "pending";
  }
  return "complete-empty";
}

function createTextList(items: readonly string[], className?: string): HTMLUListElement | null {
  if (items.length === 0) {
    return null;
  }
  const list = createElement("ul", className ?? "pattern-room-case-review-result-list");
  items.forEach((item) => {
    list.append(createElement("li", undefined, item));
  });
  return list;
}

function appendResultSection(
  container: HTMLElement,
  result: PatternRoomCaseReviewResult,
  sectionKey: PatternRoomCaseReviewSectionKey,
  text: PatternCaseReviewTranslator
): void {
  const section = result.sections[sectionKey];
  if (section.items.length === 0 && section.rawText.trim() === "") {
    return;
  }

  const card = createElement("article", "pattern-room-case-review-section");
  card.dataset["patternCaseReviewSection"] = sectionKey;
  card.append(createElement("h4", undefined, text(SECTION_TEXT_KEYS[sectionKey])));
  const list = createTextList(section.items.map((item) => item.text));
  if (list !== null) {
    card.append(list);
  } else {
    card.append(createElement("p", "pattern-room-case-review-section-raw", section.rawText));
  }
  container.append(card);
}

function appendResultMetaList(
  container: HTMLElement,
  title: string,
  items: readonly string[],
  datasetKey: string
): void {
  if (items.length === 0) {
    return;
  }
  const card = createElement("article");
  card.dataset[datasetKey] = "true";
  card.append(createElement("h4", undefined, title));
  const list = createTextList(items);
  if (list !== null) {
    card.append(list);
  }
  container.append(card);
}

function createReviewResult(
  result: PatternRoomCaseReviewResult,
  text: PatternCaseReviewTranslator
): HTMLElement {
  const container = createElement("section", "pattern-room-case-review-result");
  container.dataset["patternCaseReviewResult"] = "true";

  const summary = createElement("article", "pattern-room-case-review-result-summary");
  summary.append(
    createElement("h3", undefined, text("result.title")),
    createElement("p", undefined, result.summary)
  );
  container.append(summary);

  PATTERN_ROOM_CASE_REVIEW_SECTION_KEYS.forEach((sectionKey) => {
    appendResultSection(container, result, sectionKey, text);
  });

  const meta = createElement("div", "pattern-room-case-review-result-meta");
  appendResultMetaList(
    meta,
    text("result.confidence"),
    result.confidence,
    "patternCaseReviewConfidence"
  );
  appendResultMetaList(
    meta,
    text("result.missingEvidence"),
    result.missingEvidence,
    "patternCaseReviewMissingEvidence"
  );
  appendResultMetaList(
    meta,
    text("result.openQuestions"),
    result.openQuestions,
    "patternCaseReviewOpenQuestions"
  );
  appendResultMetaList(
    meta,
    text("result.suggestedConnections"),
    result.suggestedConnections.map((connection) => {
      const connectionText = `${connection.sourceId} → ${connection.edgeType} → ${connection.targetId}`;
      return connection.note === null ? connectionText : `${connectionText} — ${connection.note}`;
    }),
    "patternCaseReviewSuggestedConnections"
  );
  appendResultMetaList(
    meta,
    text("result.warnings"),
    result.warnings.map((warning) => `[${warning.code}] ${warning.message}`),
    "patternCaseReviewWarnings"
  );
  if (meta.children.length > 0) {
    container.append(meta);
  }

  if (result.fallbackUsed) {
    const fallbackWarning = createElement(
      "p",
      "pattern-room-case-review-preview-status failed",
      text("messages.fallbackWarning")
    );
    fallbackWarning.dataset["patternCaseReviewFallbackWarning"] = "true";
    container.append(fallbackWarning);
  }

  return container;
}

function formatHistoryTimestamp(timestamp: string): string {
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) {
    return timestamp;
  }
  return value.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function shortenHash(hash: string | null): string {
  if (hash === null || hash === "") {
    return "—";
  }
  return hash.length > 16 ? `${hash.slice(0, 12)}…` : hash;
}

function createHistoryValue(
  label: string,
  value: string,
  options: { readonly code?: boolean; readonly title?: string } = {}
): HTMLElement {
  const wrapper = createElement("div");
  wrapper.append(createElement("span", undefined, label));
  const valueElement = createElement(options.code === true ? "code" : "p", undefined, value);
  if (options.title !== undefined) {
    valueElement.title = options.title;
  }
  wrapper.append(valueElement);
  return wrapper;
}

function createHistory(
  history: readonly PatternRoomCaseReviewHistoryEntry[],
  text: PatternCaseReviewTranslator
): HTMLElement {
  const section = createElement("section", "pattern-room-case-review-history");
  section.dataset["patternCaseReviewHistory"] = "true";
  section.append(createElement("h3", undefined, text("history.title")));

  if (history.length === 0) {
    section.append(
      createEmptyState(text("messages.historyEmpty"), "data-empty", { compact: true })
    );
    return section;
  }

  const list = createElement("div", "pattern-room-case-review-history-list");
  history.forEach((entry) => {
    const item = createElement("article", "pattern-room-case-review-history-item");
    item.dataset["patternCaseReviewHistoryItem"] = entry.sessionId;
    item.append(
      createHistoryValue(text("history.timestamp"), formatHistoryTimestamp(entry.timestamp)),
      createHistoryValue(text("history.role"), entry.role),
      createHistoryValue(text("history.packetHash"), shortenHash(entry.packetHash), {
        code: true,
        title: entry.packetHash,
      }),
      createHistoryValue(text("history.responseHash"), shortenHash(entry.responseHash), {
        code: true,
        ...(entry.responseHash === null ? {} : { title: entry.responseHash }),
      }),
      createHistoryValue(text("history.state"), text(STATUS_TEXT_KEYS[entry.state]))
    );
    list.append(item);
  });
  section.append(list);
  return section;
}

function createRuntimeActions(
  state: PatternCaseReviewRuntimePanelState,
  session: PatternRoomCaseReviewSession
): HTMLElement | null {
  const actions = createElement("div", "pattern-room-case-review-runtime-actions");
  const isActive = session.status === "dispatching" || session.status === "waiting-reply";
  const canRetry =
    session.status === "failed" || session.status === "timed-out" || session.status === "cancelled";
  const canResend =
    session.status === "ready" ||
    session.status === "applied" ||
    session.status === "failed" ||
    session.status === "timed-out" ||
    session.status === "cancelled";

  if (isActive) {
    const cancel = createActionButton(state.text("actions.cancel"), state.onCancel);
    cancel.dataset["patternCaseReviewCancel"] = "true";
    actions.append(cancel);
  }
  if (canRetry) {
    const retry = createActionButton(state.text("actions.retry"), state.onRetry);
    retry.dataset["patternCaseReviewRetry"] = "true";
    actions.append(retry);
  }
  if (canResend) {
    const resend = createActionButton(state.text("actions.resend"), state.onResend);
    resend.dataset["patternCaseReviewResend"] = "true";
    actions.append(resend);
  }

  return actions.children.length === 0 ? null : actions;
}

function createApplyActions(state: PatternCaseReviewRuntimePanelState): HTMLElement | null {
  if (state.session?.result === null || state.session?.status !== "ready") {
    return null;
  }

  const actions = createElement("div", "pattern-room-case-review-apply-actions");
  const applyModes: ReadonlyArray<
    readonly [PatternRoomCaseReviewApplyMode, PatternCaseReviewTextKey, string]
  > = [
    ["all", "actions.applyAll", "patternCaseReviewApplyAll"],
    ["open-questions-only", "actions.applyOpenQuestions", "patternCaseReviewApplyOpenQuestions"],
    [
      "evidence-suggestions-only",
      "actions.applyEvidenceSuggestions",
      "patternCaseReviewApplyEvidenceSuggestions",
    ],
  ];
  applyModes.forEach(([mode, labelKey, datasetKey]) => {
    const button = createActionButton(state.text(labelKey), () => {
      state.onApply(mode);
    });
    button.dataset[datasetKey] = "true";
    button.disabled = state.applyDisabled;
    actions.append(button);
  });
  return actions;
}

function createReviewMetric(label: string, value: number): HTMLElement {
  const metric = createElement("div", "pattern-room-case-review-workspace-metric");
  metric.append(
    createElement("span", undefined, label),
    createElement("strong", undefined, String(value))
  );
  return metric;
}

function createRawResponse(
  session: PatternRoomCaseReviewSession | null,
  text: PatternCaseReviewTranslator
): HTMLElement {
  const response = createElement(
    "section",
    "pattern-room-case-review-workspace-card pattern-room-case-review-response"
  );
  response.dataset["patternCaseReviewReply"] = "true";
  response.append(
    createElement("span", "pattern-room-context-inspector-label", text("workspace.response"))
  );

  if (session?.reply === null || session?.reply === undefined) {
    response.append(
      createEmptyState(text("workspace.responseEmpty"), resolveSessionEmptyKind(session), {
        compact: true,
        live: true,
      })
    );
    return response;
  }

  const meta = createElement("div", "pattern-room-case-review-response-meta");
  meta.append(
    createElement("span", undefined, formatHistoryTimestamp(session.reply.receivedAt)),
    createElement("code", undefined, shortenHash(session.reply.responseHash))
  );
  const raw = createElement("pre", "pattern-room-case-review-response-text", session.reply.text);
  raw.dataset["patternCaseReviewReplyText"] = "true";
  response.append(meta, raw);
  return response;
}

function createEvidenceCandidateWorkspace(state: PatternCaseReviewRuntimePanelState): HTMLElement {
  const workspace = createElement(
    "section",
    "pattern-room-case-review-workspace-card pattern-room-evidence-candidate-workspace"
  );
  workspace.dataset["patternEvidenceCandidateWorkspace"] = "true";
  workspace.append(
    createElement("span", "pattern-room-context-inspector-label", state.text("candidates.title")),
    createElement("p", undefined, state.text("candidates.intro"))
  );

  if (state.evidenceCandidates.length === 0) {
    workspace.append(
      createEmptyState(state.text("candidates.empty"), "complete-empty", { compact: true })
    );
  } else {
    const list = createElement("div", "pattern-room-evidence-candidate-list");
    state.evidenceCandidates.forEach((candidate) => {
      const card = createElement("article", "pattern-room-evidence-candidate-card");
      card.dataset["patternEvidenceCandidate"] = candidate.id;
      card.append(
        createElement("span", "pattern-room-list-eyebrow", state.text("candidates.badge")),
        createElement("p", "pattern-room-evidence-candidate-text", candidate.text),
        createElement(
          "code",
          "pattern-room-evidence-candidate-provenance",
          state.text("candidates.provenance", {
            session: candidate.reviewSessionId ?? "—",
            suggestion: candidate.suggestionId,
          })
        )
      );

      const sourceField = createElement("label", "pattern-room-evidence-candidate-field");
      sourceField.append(createElement("span", undefined, state.text("candidates.sourceLabel")));
      const sourceSelect = createElement("select");
      sourceSelect.dataset["patternEvidenceCandidateSource"] = candidate.id;
      const placeholder = createElement(
        "option",
        undefined,
        state.text("candidates.sourcePlaceholder")
      );
      placeholder.value = "";
      sourceSelect.append(placeholder);
      state.evidenceCandidateSources.forEach((sourceOption) => {
        const option = createElement("option", undefined, sourceOption.label);
        option.value = sourceOption.id;
        sourceSelect.append(option);
      });
      sourceField.append(sourceSelect);

      const excerptField = createElement("label", "pattern-room-evidence-candidate-field");
      excerptField.append(createElement("span", undefined, state.text("candidates.excerptLabel")));
      const excerpt = createElement("textarea");
      excerpt.dataset["patternEvidenceCandidateExcerpt"] = candidate.id;
      excerpt.rows = 4;
      excerpt.placeholder = state.text("candidates.excerptPlaceholder");
      excerptField.append(excerpt);

      const actions = createElement("div", "pattern-room-evidence-candidate-actions");
      const promote = createActionButton(state.text("candidates.promote"), () => {
        state.onPromoteEvidenceCandidate({
          candidateId: candidate.id,
          sourceId: sourceSelect.value,
          excerpt: excerpt.value,
        });
      });
      promote.dataset["patternEvidenceCandidatePromote"] = candidate.id;
      const updatePromoteState = (): void => {
        promote.disabled = sourceSelect.value.trim() === "" || excerpt.value.trim() === "";
      };
      sourceSelect.addEventListener("change", updatePromoteState);
      excerpt.addEventListener("input", updatePromoteState);
      updatePromoteState();

      const discard = createActionButton(state.text("candidates.discard"), () => {
        state.onRemoveEvidenceCandidate(candidate.id);
      });
      discard.dataset["patternEvidenceCandidateDiscard"] = candidate.id;
      actions.append(promote, discard);
      card.append(sourceField, excerptField, actions);
      list.append(card);
    });
    workspace.append(list);
  }

  if (state.evidenceCandidateFeedback !== null) {
    const feedback = createElement(
      "p",
      `pattern-room-case-review-apply-feedback ${state.evidenceCandidateFeedback.tone}`,
      state.evidenceCandidateFeedback.message
    );
    feedback.dataset["patternEvidenceCandidateFeedback"] = state.evidenceCandidateFeedback.tone;
    workspace.append(feedback);
  }

  return workspace;
}

function createApplyWorkspace(state: PatternCaseReviewRuntimePanelState): HTMLElement {
  const apply = createElement(
    "section",
    "pattern-room-case-review-workspace-card pattern-room-case-review-apply-workspace"
  );
  apply.dataset["patternCaseReviewApplyWorkspace"] = "true";
  apply.append(
    createElement(
      "span",
      "pattern-room-context-inspector-label",
      state.text("workspace.applyPreview")
    )
  );

  const result = state.session?.result ?? null;
  if (result === null) {
    apply.append(
      createEmptyState(state.text("messages.noResult"), resolveSessionEmptyKind(state.session), {
        compact: true,
      })
    );
  } else {
    const previewMetrics = createElement("div", "pattern-room-case-review-workspace-metrics");
    previewMetrics.append(
      createReviewMetric(state.text("workspace.boardNotes"), result.items.length),
      createReviewMetric(state.text("result.missingEvidence"), result.missingEvidence.length),
      createReviewMetric(state.text("result.openQuestions"), result.openQuestions.length),
      createReviewMetric(
        state.text("result.suggestedConnections"),
        result.suggestedConnections.length
      )
    );
    apply.append(previewMetrics);
  }

  const applyActions = createApplyActions(state);
  if (applyActions !== null) {
    apply.append(applyActions);
  }
  if (state.applyFeedback !== null) {
    const feedback = createElement(
      "p",
      `pattern-room-case-review-apply-feedback ${state.applyFeedback.tone}`,
      state.applyFeedback.message
    );
    feedback.dataset["patternCaseReviewApplyFeedback"] = state.applyFeedback.tone;
    apply.append(feedback);
  }

  const applyResult = createElement("div", "pattern-room-case-review-apply-result");
  applyResult.append(
    createElement(
      "span",
      "pattern-room-context-inspector-label",
      state.text("workspace.applyResult")
    )
  );
  const summary = state.session?.applySummary ?? null;
  if (summary === null) {
    applyResult.append(
      createEmptyState(state.text("workspace.applyEmpty"), "complete-empty", { compact: true })
    );
  } else {
    const resultMetrics = createElement("div", "pattern-room-case-review-workspace-metrics");
    resultMetrics.append(
      createReviewMetric(state.text("workspace.boardNotes"), summary.boardNotesAdded),
      createReviewMetric(state.text("sections.evidence"), summary.evidenceAdded),
      createReviewMetric(
        state.text("workspace.evidenceCandidates"),
        summary.evidenceCandidatesAdded ?? 0
      ),
      createReviewMetric(state.text("result.openQuestions"), summary.openQuestionsAdded),
      createReviewMetric(state.text("result.suggestedConnections"), summary.connectionsAdded),
      createReviewMetric(state.text("workspace.skipped"), summary.skipped)
    );
    applyResult.append(resultMetrics);
  }
  apply.append(applyResult);
  return apply;
}

export function createPatternCaseReviewRuntimeView(
  state: PatternCaseReviewRuntimePanelState
): HTMLElement {
  const runtime = createElement("section", "pattern-room-case-review-runtime");
  runtime.dataset["patternCaseReviewRuntime"] = "true";

  const statusRow = createElement(
    "section",
    "pattern-room-case-review-runtime-status pattern-room-case-review-workspace-card"
  );
  const statusClass = state.session === null ? "idle" : STATUS_CLASS_NAMES[state.session.status];
  const statusKey =
    state.session === null ? "statuses.idle" : STATUS_TEXT_KEYS[state.session.status];
  const status = createElement(
    "span",
    `pattern-room-case-review-status ${statusClass}`,
    state.text(statusKey)
  );
  if (state.session !== null) {
    status.dataset["patternCaseReviewState"] = state.session.status;
  }
  statusRow.append(status);

  if (state.session?.error !== null && state.session?.error !== undefined) {
    const error = createElement("p", "pattern-room-case-review-preview-status failed");
    error.dataset["patternCaseReviewError"] = state.session.error.code;
    error.textContent = state.session.error.message;
    statusRow.append(error);
  }
  if (state.session !== null) {
    const runtimeActions = createRuntimeActions(state, state.session);
    if (runtimeActions !== null) {
      statusRow.append(runtimeActions);
    }
  }
  runtime.append(statusRow);

  const workspace = createElement("div", "pattern-room-case-review-runtime-workspace");
  workspace.append(createRawResponse(state.session, state.text));

  const parsed = createElement(
    "section",
    "pattern-room-case-review-workspace-card pattern-room-case-review-parsed"
  );
  parsed.append(
    createElement("span", "pattern-room-context-inspector-label", state.text("workspace.parsed"))
  );
  if (state.session?.result !== null && state.session?.result !== undefined) {
    parsed.append(createReviewResult(state.session.result, state.text));
  } else {
    parsed.append(
      createEmptyState(state.text("messages.resultEmpty"), resolveSessionEmptyKind(state.session), {
        compact: true,
        live: true,
      })
    );
  }
  workspace.append(parsed, createApplyWorkspace(state), createEvidenceCandidateWorkspace(state));

  const history = createHistory(state.history, state.text);
  history.classList.add("pattern-room-case-review-workspace-card");
  history.dataset["patternCaseReviewWorkspaceHistory"] = "true";
  workspace.append(history);
  runtime.append(workspace);
  return runtime;
}
