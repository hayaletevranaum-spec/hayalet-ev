import type { PatternRoomCaseReviewSectionKey } from "../../shared/types/pattern-room-case-review-result.js";
import {
  createPatternCaseReviewRuntimeView,
  type PatternCaseReviewRuntimePanelState,
} from "./pattern-case-review-runtime-view.js";
import { createElement } from "./pattern-panel-utils.js";

export type PatternCaseReviewSimplifiedViewOptions = {
  readonly onHistoryFocus?: () => void;
};

type PatternCaseReviewResultGroup = "evaluation" | "gaps" | "confidence";

const RESULT_GROUP_BY_SECTION: Readonly<
  Record<PatternRoomCaseReviewSectionKey, PatternCaseReviewResultGroup>
> = {
  observation: "evaluation",
  evidence: "evaluation",
  analysis: "evaluation",
  counterArgument: "evaluation",
  missingInformation: "gaps",
  openQuestions: "gaps",
  confidenceNotes: "confidence",
};

const RESULT_GROUP_LABELS: Readonly<Record<PatternCaseReviewResultGroup, string>> = {
  evaluation: "Ana değerlendirme",
  gaps: "Eksikler ve açık sorular",
  confidence: "Güven ve teknik notlar",
};

function createDisclosure(
  id: string,
  label: string,
  content: HTMLElement,
  open = false
): HTMLDetailsElement {
  const disclosure = createElement(
    "details",
    "pattern-room-case-review-disclosure pattern-room-case-review-workspace-card"
  );
  disclosure.dataset["patternCaseReviewDisclosure"] = id;
  disclosure.open = open;
  const summary = createElement("summary", "pattern-room-case-review-disclosure-summary");
  summary.append(
    createElement("strong", undefined, label),
    createElement("span", undefined, "Ayrıntılar")
  );
  const body = createElement("div", "pattern-room-case-review-disclosure-body");
  content.remove();
  body.append(content);
  disclosure.append(summary, body);
  return disclosure;
}

function createResultGroup(
  group: PatternCaseReviewResultGroup,
  body: HTMLElement,
  open: boolean
): HTMLDetailsElement | null {
  if (body.children.length === 0) {
    return null;
  }

  const disclosure = createElement("details", "pattern-room-case-review-result-group");
  disclosure.dataset["patternCaseReviewResultGroup"] = group;
  disclosure.open = open;
  const summary = createElement("summary", "pattern-room-case-review-result-group-summary");
  summary.append(
    createElement("strong", undefined, RESULT_GROUP_LABELS[group]),
    createElement("span", undefined, `${String(body.children.length)} bölüm`)
  );
  disclosure.append(summary, body);
  return disclosure;
}

function findResultMeta(result: HTMLElement): HTMLElement | null {
  const selectors = [
    "[data-pattern-case-review-confidence='true']",
    "[data-pattern-case-review-missing-evidence='true']",
    "[data-pattern-case-review-open-questions='true']",
    "[data-pattern-case-review-suggested-connections='true']",
    "[data-pattern-case-review-warnings='true']",
  ];
  for (const selector of selectors) {
    const item = result.querySelector<HTMLElement>(selector);
    if (item?.parentElement !== null && item?.parentElement !== undefined) {
      return item.parentElement;
    }
  }
  return null;
}

function groupReviewResultSections(parsed: HTMLElement): void {
  const result = parsed.querySelector<HTMLElement>("[data-pattern-case-review-result='true']");
  if (result === null) {
    return;
  }

  const bodies: Record<PatternCaseReviewResultGroup, HTMLElement> = {
    evaluation: createElement("div", "pattern-room-case-review-result-group-body"),
    gaps: createElement("div", "pattern-room-case-review-result-group-body"),
    confidence: createElement("div", "pattern-room-case-review-result-group-body"),
  };

  const sections = Array.from(
    result.querySelectorAll<HTMLElement>("[data-pattern-case-review-section]")
  );
  sections.forEach((section) => {
    const sectionKey = section.dataset[
      "patternCaseReviewSection"
    ] as PatternRoomCaseReviewSectionKey;
    section.remove();
    bodies[RESULT_GROUP_BY_SECTION[sectionKey]].append(section);
  });

  const meta = findResultMeta(result);
  if (meta !== null) {
    meta.remove();
    bodies.confidence.append(meta);
  }

  const groups = [
    createResultGroup("evaluation", bodies.evaluation, true),
    createResultGroup("gaps", bodies.gaps, true),
    createResultGroup("confidence", bodies.confidence, false),
  ].filter((group): group is HTMLDetailsElement => group !== null);

  const insertionPoint = result.children[1] ?? null;
  groups.forEach((group) => {
    result.insertBefore(group, insertionPoint);
  });
}

function createHistoryDisclosure(
  history: HTMLElement,
  state: PatternCaseReviewRuntimePanelState,
  options: PatternCaseReviewSimplifiedViewOptions
): HTMLDetailsElement {
  delete history.dataset["patternCaseReviewHistory"];
  delete history.dataset["patternCaseReviewWorkspaceHistory"];
  const disclosure = createDisclosure("history", state.text("history.title"), history);
  disclosure.dataset["patternCaseReviewHistory"] = "true";
  disclosure.dataset["patternCaseReviewWorkspaceHistory"] = "true";

  const nativeFocus =
    typeof disclosure.focus === "function" ? disclosure.focus.bind(disclosure) : null;
  disclosure.focus = (): void => {
    disclosure.open = true;
    options.onHistoryFocus?.();
    nativeFocus?.();
  };
  if (typeof disclosure.scrollIntoView !== "function") {
    disclosure.scrollIntoView = (): void => {
      return;
    };
  }
  return disclosure;
}

export function createPatternCaseReviewSimplifiedView(
  state: PatternCaseReviewRuntimePanelState,
  options: PatternCaseReviewSimplifiedViewOptions = {}
): HTMLElement {
  const runtime = createPatternCaseReviewRuntimeView(state);
  const workspace = runtime.children[1] as HTMLElement | undefined;
  if (workspace === undefined || workspace.children.length < 5) {
    return runtime;
  }

  const response = workspace.children[0] as HTMLElement;
  const parsed = workspace.children[1] as HTMLElement;
  const apply = workspace.children[2] as HTMLElement;
  const candidates = workspace.children[3] as HTMLElement;
  const history = workspace.children[4] as HTMLElement;

  groupReviewResultSections(parsed);

  workspace.replaceChildren(
    parsed,
    createDisclosure("raw-response", state.text("workspace.response"), response),
    createDisclosure(
      "apply",
      state.text("workspace.applyPreview"),
      apply,
      state.session?.status === "ready" || state.session?.status === "applied"
    ),
    createDisclosure(
      "evidence-candidates",
      state.text("candidates.title"),
      candidates,
      state.evidenceCandidates.length > 0
    ),
    createHistoryDisclosure(history, state, options)
  );

  return runtime;
}
