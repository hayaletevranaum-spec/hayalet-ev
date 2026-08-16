import type { PatternViewId } from "../../shared/types/pattern-room.js";
import type {
  PatternWorkspaceTextKey,
  PatternWorkspaceTranslator,
} from "../pattern-room-workspace-i18n.js";
import { createElement } from "./pattern-panel-utils.js";

export type PatternWorkspaceSection = "default" | "review-history";

export type PatternWorkspaceSummary = {
  readonly subject: string;
  readonly sourceCount: number;
  readonly evidenceCount: number;
  readonly boardNoteCount: number;
  readonly connectionCount: number;
  readonly reviewCount: number;
};

export type PatternWorkspaceFeedbackTone = "success" | "info" | "warning" | "error";

export type PatternWorkspaceFeedback = {
  readonly tone: PatternWorkspaceFeedbackTone;
  readonly message: string;
};

export type PatternWorkspaceShell = {
  readonly element: HTMLElement;
  readonly outlet: HTMLElement;
  readonly inspector: HTMLElement;
  setInspectorContent: (content: HTMLElement | null) => void;
  showActionFeedback: (feedback: PatternWorkspaceFeedback | null) => void;
  updateActiveView: (viewId: PatternViewId, section: PatternWorkspaceSection) => void;
  updateSummary: (summary: PatternWorkspaceSummary) => void;
};

type PatternWorkspaceNavigationItem = {
  readonly id: PatternViewId | "review-history";
  readonly viewId: PatternViewId;
  readonly section: PatternWorkspaceSection;
  readonly labelKey: PatternWorkspaceTextKey;
  readonly descriptionKey: PatternWorkspaceTextKey;
  readonly icon: string;
};

const NAVIGATION_ITEMS: readonly PatternWorkspaceNavigationItem[] = [
  {
    id: "overview",
    viewId: "overview",
    section: "default",
    labelKey: "nav.overview.label",
    descriptionKey: "nav.overview.description",
    icon: "⌂",
  },
  {
    id: "board",
    viewId: "board",
    section: "default",
    labelKey: "nav.board.label",
    descriptionKey: "nav.board.description",
    icon: "⌘",
  },
  {
    id: "archive",
    viewId: "archive",
    section: "default",
    labelKey: "nav.archive.label",
    descriptionKey: "nav.archive.description",
    icon: "▤",
  },
  {
    id: "tenth-man",
    viewId: "tenth-man",
    section: "default",
    labelKey: "nav.review.label",
    descriptionKey: "nav.review.description",
    icon: "Ⅹ",
  },
  {
    id: "review-history",
    viewId: "tenth-man",
    section: "review-history",
    labelKey: "nav.reviewHistory.label",
    descriptionKey: "nav.reviewHistory.description",
    icon: "↺",
  },
  {
    id: "report",
    viewId: "report",
    section: "default",
    labelKey: "nav.report.label",
    descriptionKey: "nav.report.description",
    icon: "≡",
  },
];

function createNavigationButton(
  item: PatternWorkspaceNavigationItem,
  text: PatternWorkspaceTranslator,
  onNavigate: (viewId: PatternViewId, section: PatternWorkspaceSection) => void
): HTMLButtonElement {
  const button = createElement("button", "pattern-room-workspace-nav-button");
  button.type = "button";
  button.dataset["patternWorkspaceNav"] = item.id;
  button.ariaLabel = text(item.labelKey);
  button.title = text(item.descriptionKey);

  const icon = createElement("span", "pattern-room-workspace-nav-icon", item.icon);
  icon.ariaHidden = "true";
  const copy = createElement("span", "pattern-room-workspace-nav-copy");
  copy.append(
    createElement("strong", undefined, text(item.labelKey)),
    createElement("small", undefined, text(item.descriptionKey))
  );
  button.append(icon, copy);
  button.addEventListener("click", () => {
    onNavigate(item.viewId, item.section);
  });
  return button;
}

function connectKeyboardNavigation(
  navigation: HTMLElement,
  buttons: readonly HTMLButtonElement[]
): void {
  navigation.addEventListener("keydown", (event) => {
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "ArrowRight" &&
      event.key !== "ArrowLeft" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }

    const target = event.target as HTMLButtonElement | null;
    const currentIndex = target === null ? -1 : buttons.indexOf(target);
    let nextIndex: number;
    if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = buttons.length - 1;
    } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % buttons.length;
    } else {
      nextIndex = currentIndex <= 0 ? buttons.length - 1 : currentIndex - 1;
    }

    event.preventDefault();
    buttons[nextIndex]?.focus();
  });
}

function resolveEmbeddedInspector(
  outlet: HTMLElement,
  inspectorView: string | undefined
): HTMLElement | null {
  if (inspectorView === "archive") {
    const sourceDetail = outlet.querySelector<HTMLElement>(
      "[data-pattern-archive-source-detail='true']"
    );
    return sourceDetail?.parentElement ?? null;
  }

  if (inspectorView === "report") {
    return outlet.querySelector<HTMLElement>("[data-pattern-report-outline='true']");
  }

  return null;
}

export function createPatternWorkspaceShell(
  text: PatternWorkspaceTranslator,
  initialSummary: PatternWorkspaceSummary,
  onNavigate: (viewId: PatternViewId, section: PatternWorkspaceSection) => void
): PatternWorkspaceShell {
  const shell = createElement("div", "pattern-room-app-shell");
  shell.dataset["patternWorkspaceShell"] = "true";

  const rail = createElement("aside", "pattern-room-workspace-rail");
  rail.dataset["patternWorkspaceSpine"] = "true";
  const brand = createElement("div", "pattern-room-workspace-brand");
  const brandMark = createElement("span", "pattern-room-workspace-brand-mark", "PR");
  brandMark.ariaHidden = "true";
  const brandCopy = createElement("div");
  brandCopy.append(
    createElement("span", "pattern-room-kicker", text("shell.kicker")),
    createElement("strong", undefined, text("shell.title"))
  );
  brand.append(brandMark, brandCopy);

  const status = createElement("div", "pattern-room-workspace-status");
  status.append(
    createElement("i", "pattern-room-workspace-status-dot"),
    createElement("span", undefined, text("shell.status"))
  );

  const navigation = createElement("nav", "pattern-room-workspace-navigation");
  navigation.ariaLabel = text("shell.navigationLabel");
  const navigationLabel = createElement(
    "span",
    "pattern-room-workspace-navigation-label",
    text("shell.navigationLabel")
  );
  const buttons = NAVIGATION_ITEMS.map((item) => {
    return createNavigationButton(item, text, onNavigate);
  });
  navigation.append(navigationLabel, ...buttons);
  connectKeyboardNavigation(navigation, buttons);

  const caseCard = createElement("section", "pattern-room-workspace-case-card");
  const caseLabel = createElement("span", "pattern-room-kicker", text("shell.caseLabel"));
  const subject = createElement("strong", "pattern-room-workspace-case-subject");
  const metrics = createElement("div", "pattern-room-workspace-case-metrics");
  const sourceMetric = createElement("span");
  const evidenceMetric = createElement("span");
  const boardNoteMetric = createElement("span");
  const connectionMetric = createElement("span");
  const reviewMetric = createElement("span");
  metrics.append(sourceMetric, evidenceMetric, boardNoteMetric, connectionMetric, reviewMetric);
  caseCard.append(caseLabel, subject, metrics);

  const keyboardHint = createElement(
    "p",
    "pattern-room-workspace-keyboard-hint",
    text("shell.keyboardHint")
  );
  rail.append(brand, status, navigation, caseCard, keyboardHint);

  const workspace = createElement("main", "pattern-room-workspace");
  workspace.dataset["patternWorkspaceCanvas"] = "true";
  const outlet = createElement("div", "pattern-room-workspace-outlet");
  outlet.dataset["patternWorkspaceOutlet"] = "true";
  outlet.tabIndex = -1;
  workspace.append(outlet);

  const inspector = createElement("aside", "pattern-room-workspace-inspector");
  inspector.dataset["patternWorkspaceInspector"] = "true";
  inspector.ariaLabel = text("shell.inspectorLabel");

  const inspectorHeader = createElement("header", "pattern-room-workspace-inspector-header");
  inspectorHeader.append(
    createElement("span", "pattern-room-context-inspector-label", text("shell.inspectorLabel"))
  );
  const inspectorTitle = createElement("strong", "pattern-room-workspace-inspector-title");
  const inspectorDescription = createElement("p", "pattern-room-workspace-inspector-description");
  inspectorHeader.append(inspectorTitle, inspectorDescription);

  const inspectorCase = createElement("section", "pattern-room-workspace-inspector-case");
  inspectorCase.append(createElement("span", "pattern-room-kicker", text("shell.caseLabel")));
  const inspectorSubject = createElement("strong", "pattern-room-workspace-inspector-subject");
  const inspectorMetrics = createElement("div", "pattern-room-workspace-inspector-metrics");
  const inspectorSourceMetric = createElement("span");
  const inspectorEvidenceMetric = createElement("span");
  const inspectorBoardNoteMetric = createElement("span");
  const inspectorConnectionMetric = createElement("span");
  const inspectorReviewMetric = createElement("span");
  inspectorMetrics.append(
    inspectorSourceMetric,
    inspectorEvidenceMetric,
    inspectorBoardNoteMetric,
    inspectorConnectionMetric,
    inspectorReviewMetric
  );
  inspectorCase.append(inspectorSubject, inspectorMetrics);
  const inspectorContent = createElement("div", "pattern-room-workspace-inspector-content");
  inspectorContent.dataset["patternWorkspaceInspectorContent"] = "true";
  inspector.append(inspectorHeader, inspectorCase, inspectorContent);

  const feedbackSlot = createElement("div", "pattern-room-workspace-feedback-slot");
  feedbackSlot.dataset["patternWorkspaceFeedbackSlot"] = "true";
  feedbackSlot.ariaLive = "polite";

  shell.append(rail, workspace, inspector, feedbackSlot);

  const updateSummary = (summary: PatternWorkspaceSummary): void => {
    subject.textContent = summary.subject;
    inspectorSubject.textContent = summary.subject;
    const sourceText = text("shell.sourceMetric", {
      count: String(summary.sourceCount),
    });
    const evidenceText = text("shell.evidenceMetric", {
      count: String(summary.evidenceCount),
    });
    const boardNoteText = text("shell.boardNoteMetric", {
      count: String(summary.boardNoteCount),
    });
    const connectionText = text("shell.connectionMetric", {
      count: String(summary.connectionCount),
    });
    const reviewText = text("shell.reviewMetric", {
      count: String(summary.reviewCount),
    });
    sourceMetric.textContent = sourceText;
    evidenceMetric.textContent = evidenceText;
    boardNoteMetric.textContent = boardNoteText;
    connectionMetric.textContent = connectionText;
    reviewMetric.textContent = reviewText;
    inspectorSourceMetric.textContent = sourceText;
    inspectorEvidenceMetric.textContent = evidenceText;
    inspectorBoardNoteMetric.textContent = boardNoteText;
    inspectorConnectionMetric.textContent = connectionText;
    inspectorReviewMetric.textContent = reviewText;
  };

  let adoptedInspector: HTMLElement | null = null;
  let adoptedInspectorHome: HTMLElement | null = null;

  const restoreAdoptedInspector = (): void => {
    if (adoptedInspector !== null && adoptedInspectorHome !== null) {
      adoptedInspector.remove();
      adoptedInspectorHome.append(adoptedInspector);
    }
    adoptedInspector = null;
    adoptedInspectorHome = null;
  };

  updateSummary(initialSummary);

  return {
    element: shell,
    outlet,
    inspector,
    setInspectorContent(content): void {
      restoreAdoptedInspector();
      const resolvedContent =
        content ??
        resolveEmbeddedInspector(outlet, inspector.dataset["patternWorkspaceInspectorView"]);
      inspectorContent.replaceChildren();
      if (resolvedContent !== null) {
        if (content === null) {
          adoptedInspector = resolvedContent;
          adoptedInspectorHome = resolvedContent.parentElement;
          resolvedContent.remove();
        }
        inspectorContent.append(resolvedContent);
      }
    },
    showActionFeedback(feedback): void {
      feedbackSlot.replaceChildren();
      if (feedback === null) {
        return;
      }

      const item = createElement("section", `pattern-room-workspace-feedback ${feedback.tone}`);
      item.dataset["patternWorkspaceFeedback"] = "true";
      item.dataset["patternWorkspaceFeedbackTone"] = feedback.tone;
      item.role = feedback.tone === "error" ? "alert" : "status";

      const icon = createElement(
        "span",
        "pattern-room-workspace-feedback-icon",
        feedback.tone === "success"
          ? "✓"
          : feedback.tone === "error"
            ? "!"
            : feedback.tone === "warning"
              ? "△"
              : "i"
      );
      icon.ariaHidden = "true";
      const message = createElement(
        "p",
        "pattern-room-workspace-feedback-message",
        feedback.message
      );
      const dismiss = createElement("button", "pattern-room-workspace-feedback-dismiss", "×");
      dismiss.type = "button";
      dismiss.dataset["patternWorkspaceFeedbackDismiss"] = "true";
      dismiss.ariaLabel = text("feedback.dismiss");
      dismiss.title = text("feedback.dismiss");
      dismiss.addEventListener("click", () => {
        feedbackSlot.replaceChildren();
      });
      item.append(icon, message, dismiss);
      feedbackSlot.append(item);
    },
    updateActiveView(viewId, section): void {
      const navigationViewId = viewId === "desk" ? "board" : viewId;
      const activeItem = NAVIGATION_ITEMS.find((item) => {
        return item.viewId === navigationViewId && item.section === section;
      });
      if (activeItem !== undefined) {
        inspector.dataset["patternWorkspaceInspectorView"] = activeItem.id;
        inspectorTitle.textContent = text(activeItem.labelKey);
        inspectorDescription.textContent = text(activeItem.descriptionKey);
      }

      buttons.forEach((button, index) => {
        const item = NAVIGATION_ITEMS[index];
        const isActive = item?.viewId === navigationViewId && item.section === section;
        button.dataset["patternWorkspaceNavActive"] = isActive ? "true" : "false";
        button.ariaCurrent = isActive ? "page" : null;
        button.tabIndex = isActive ? 0 : -1;
        if (isActive) {
          button.classList.add("active");
        } else {
          button.classList.remove("active");
        }
      });
    },
    updateSummary,
  };
}
