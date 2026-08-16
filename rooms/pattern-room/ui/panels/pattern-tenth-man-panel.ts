import type {
  PatternDummyRole,
  PatternPanelActions,
  PatternRoomWorkspaceModel,
  PatternTenthManSession,
} from "../../shared/types/pattern-room.js";
import type {
  DebateLocalPhase,
  DebateLocalTurn,
} from "../../shared/state/pattern-room-local-state.js";
import {
  PATTERN_ROOM_CASE_REVIEW_ROLE_SLOTS,
  isPatternRoomCaseReviewRoleSlot,
  type PatternRoomCaseReviewRoleSlot,
} from "../../shared/types/pattern-room-case-review-role.js";
import type {
  PatternCaseReviewDispatchStatus,
  PatternCaseReviewPreviewDraft,
} from "../pattern-case-review-preview.js";
import type {
  PatternCaseReviewTextKey,
  PatternCaseReviewTranslator,
} from "../pattern-case-review-i18n.js";
import {
  createPatternWorkspaceTranslator,
  type PatternWorkspaceTranslator,
} from "../pattern-room-workspace-i18n.js";
import { createPatternCaseReviewSimplifiedView } from "./pattern-case-review-simplified-view.js";
import type { PatternCaseReviewRuntimePanelState } from "./pattern-case-review-runtime-view.js";
import {
  createActionButton,
  createElement,
  createEmptyState,
  createPanelShell,
} from "./pattern-panel-utils.js";

export type PatternCaseReviewPreviewPanelState = PatternCaseReviewRuntimePanelState & {
  readonly preview: PatternCaseReviewPreviewDraft | null;
  readonly dispatchStatus: PatternCaseReviewDispatchStatus;
  readonly selectedRole: PatternRoomCaseReviewRoleSlot;
  readonly onRoleChange: (role: PatternRoomCaseReviewRoleSlot) => void;
  readonly onPrepare: () => void;
  readonly onSend: () => void;
};

type PatternReviewTaskMode = "ai-review" | "tenth-man";

const REVIEW_TASK_MODE_DATASET_KEY = "patternReviewTaskMode";

const PHASE_LABELS: Record<DebateLocalPhase, string> = {
  idle: "Beklemede",
  preparation: "Hazırlık",
  role_assignment: "Rol atama",
  opening: "Açılış",
  counter_argument: "Karşı argüman",
  evidence_review: "Kanıt inceleme",
  weak_point: "Zayıf nokta",
  judge_mapping: "Hakem eşlemesi",
  completed: "Tamamlandı",
};

const DEBATE_PHASE_STEPS: readonly DebateLocalPhase[] = [
  "preparation",
  "role_assignment",
  "opening",
  "counter_argument",
  "evidence_review",
  "weak_point",
  "judge_mapping",
  "completed",
];

const TURN_ROLE_LABELS: Record<DebateLocalTurn["role"], string> = {
  researcher: "Araştırmacı",
  advocate: "Savunucu",
  "tenth-man": "10. Adam / Karşıt",
  arbiter: "Hakem",
};

function readReviewTaskMode(): PatternReviewTaskMode {
  return document.documentElement.dataset[REVIEW_TASK_MODE_DATASET_KEY] === "tenth-man"
    ? "tenth-man"
    : "ai-review";
}

function createReviewTaskButton(
  mode: PatternReviewTaskMode,
  label: string,
  description: string
): HTMLButtonElement {
  const button = createElement("button", "pattern-room-review-task-button");
  button.type = "button";
  button.dataset["patternReviewTask"] = mode;
  button.ariaPressed = "false";
  button.append(
    createElement("strong", undefined, label),
    createElement("span", undefined, description)
  );
  return button;
}

function applyReviewTaskMode(root: HTMLElement, mode: PatternReviewTaskMode): void {
  const aiActive = mode === "ai-review";
  const panel =
    root.dataset["patternView"] === "tenth-man"
      ? root
      : root.querySelector<HTMLElement>("[data-pattern-view='tenth-man']");
  const aiTaskButton = root.querySelector<HTMLButtonElement>(
    "[data-pattern-review-task='ai-review']"
  );
  const localTaskButton = root.querySelector<HTMLButtonElement>(
    "[data-pattern-review-task='tenth-man']"
  );
  const reviewSurface = root.querySelector<HTMLElement>(
    "[data-pattern-review-task-surface='ai-review']"
  );
  const localSurface = root.querySelector<HTMLElement>(
    "[data-pattern-review-task-surface='tenth-man']"
  );
  if (
    panel === null ||
    aiTaskButton === null ||
    localTaskButton === null ||
    reviewSurface === null ||
    localSurface === null
  ) {
    return;
  }

  document.documentElement.dataset[REVIEW_TASK_MODE_DATASET_KEY] = mode;
  panel.dataset["patternReviewTaskActive"] = mode;

  aiTaskButton.ariaPressed = aiActive ? "true" : "false";
  aiTaskButton.tabIndex = aiActive ? 0 : -1;
  aiTaskButton.dataset["patternReviewTaskActive"] = aiActive ? "true" : "false";
  reviewSurface.hidden = !aiActive;
  reviewSurface.dataset["patternReviewTaskActive"] = aiActive ? "true" : "false";

  localTaskButton.ariaPressed = aiActive ? "false" : "true";
  localTaskButton.tabIndex = aiActive ? -1 : 0;
  localTaskButton.dataset["patternReviewTaskActive"] = aiActive ? "false" : "true";
  localSurface.hidden = aiActive;
  localSurface.dataset["patternReviewTaskActive"] = aiActive ? "false" : "true";
}

function openReviewHistory(root: HTMLElement): void {
  const history = root.querySelector<HTMLDetailsElement>(
    "[data-pattern-case-review-history='true']"
  );
  if (history === null) {
    return;
  }
  history.open = true;
  history.tabIndex = -1;
  if (typeof history.focus === "function") {
    history.focus();
  }
  if (typeof history.scrollIntoView === "function") {
    history.scrollIntoView({ block: "start" });
  }
}

function createReviewDisclosure(
  id: string,
  label: string,
  content: HTMLElement,
  open = false
): HTMLDetailsElement {
  const disclosure = createElement("details", "pattern-room-review-disclosure");
  disclosure.dataset["patternReviewDisclosure"] = id;
  disclosure.open = open;
  const summary = createElement("summary", "pattern-room-review-disclosure-summary");
  summary.append(
    createElement("strong", undefined, label),
    createElement("span", undefined, "Ayrıntılar")
  );
  const body = createElement("div", "pattern-room-review-disclosure-body");
  body.append(content);
  disclosure.append(summary, body);
  return disclosure;
}

function createDebateActionButton(
  label: string,
  datasetKey: string,
  onClick: () => void,
  disabled = false
): HTMLButtonElement {
  const button = createActionButton(label, onClick);
  button.dataset[datasetKey] = "true";
  button.disabled = disabled;
  return button;
}

function createPhaseStepIndicator(phase: DebateLocalPhase): HTMLElement {
  const phaseStep = DEBATE_PHASE_STEPS.indexOf(phase);
  const currentStep = phaseStep === -1 ? 0 : phaseStep + 1;

  return createElement(
    "span",
    "pattern-room-phase-step",
    `${currentStep} / ${DEBATE_PHASE_STEPS.length}`
  );
}

function appendReferences(device: HTMLElement, session: PatternTenthManSession): void {
  const references = createElement("section", "pattern-room-debate-references");
  references.append(
    createElement("span", "pattern-room-kicker", "Yerel referanslar"),
    createElement("h2", undefined, "10. Adam referans listesi")
  );

  if (session.references.length === 0) {
    references.append(
      createEmptyState(
        "Referans eklemek için Pano veya Arşiv üzerinden 10. Adam’a Ekle akışını kullan.",
        "data-empty",
        { compact: true }
      )
    );
    device.append(references);
    return;
  }

  session.references.forEach((reference) => {
    const item = createElement("article", "pattern-room-reference-item");
    item.dataset["patternDebateReference"] = reference.id;
    item.append(
      createElement("span", "pattern-room-list-eyebrow", reference.kind),
      createElement("h3", undefined, reference.label),
      createElement("p", undefined, reference.note)
    );
    references.append(item);
  });
  device.append(references);
}

function createRoleSlot(role: PatternDummyRole): HTMLElement {
  const [slotId = role.label, slotName = role.label] = role.label.split(" — ");
  const slot = createElement(
    "article",
    role.connected === true ? "pattern-room-role-slot connected" : "pattern-room-role-slot"
  );
  slot.dataset["patternRoleConnected"] = role.connected === true ? "true" : "false";
  slot.append(
    createElement("span", "pattern-room-role-id", slotId),
    createElement("strong", undefined, role.label),
    createElement("span", "pattern-room-role-name", slotName),
    createElement(
      "span",
      "pattern-room-role-connection",
      role.connected === true ? "dummy bağlı" : "dummy beklemede"
    ),
    createElement("p", undefined, role.note)
  );
  slot.title = role.note;
  return slot;
}

function appendTurnList(device: HTMLElement, turns: readonly DebateLocalTurn[]): void {
  if (turns.length === 0) {
    return;
  }

  const turnList = createElement("section", "pattern-room-debate-turns");
  turnList.append(
    createElement("span", "pattern-room-kicker", "Local tur akışı"),
    createElement("h2", undefined, "Dummy tartışma turları")
  );
  turns.forEach((turn) => {
    const card = createElement("article", "pattern-room-debate-turn");
    card.dataset["patternDebateTurn"] = turn.phaseKey;
    card.append(
      createElement("span", "pattern-room-list-eyebrow", PHASE_LABELS[turn.phaseKey]),
      createElement("h3", undefined, `${turn.actorId} — ${TURN_ROLE_LABELS[turn.role]}`),
      createElement("p", undefined, turn.content)
    );
    turnList.append(card);
  });
  device.append(turnList);
}

function appendVerdict(device: HTMLElement, verdict: string | null | undefined): void {
  if (verdict === null || verdict === undefined) {
    return;
  }

  const verdictCard = createElement("section", "pattern-room-debate-verdict");
  verdictCard.append(
    createElement("span", "pattern-room-kicker", "Local sonuç"),
    createElement("h2", undefined, "Oturum özeti"),
    createElement("p", undefined, verdict)
  );
  device.append(verdictCard);
}

function appendPreviewWarnings(container: HTMLElement, warnings: readonly string[]): void {
  if (warnings.length === 0) {
    return;
  }

  const warningList = createElement("ul", "pattern-room-case-review-preview-warnings");
  warnings.forEach((warning) => {
    warningList.append(createElement("li", undefined, warning));
  });
  container.append(warningList);
}

const ROLE_TEXT_KEYS: Readonly<Record<PatternRoomCaseReviewRoleSlot, PatternCaseReviewTextKey>> = {
  AI0: "roles.AI0",
  AI1: "roles.AI1",
  AI2: "roles.AI2",
  US1: "roles.US1",
};

function renderCaseReviewPreview(
  container: HTMLElement,
  preview: PatternCaseReviewPreviewDraft,
  text: PatternCaseReviewTranslator
): void {
  const meta = createElement("div", "pattern-room-case-review-preview-meta");
  meta.append(
    createElement(
      "span",
      "pattern-room-device-status pattern-room-device-status-secondary",
      `${text("targetLabel")}: ${preview.roleSlot} / ${preview.targetSlot}`
    ),
    createElement(
      "span",
      "pattern-room-device-status pattern-room-device-status-secondary",
      `${text("protocolLabel")}: ${preview.protocol.protocolKey}`
    )
  );

  const textPreview = createElement("pre", "pattern-room-case-review-preview-text");
  textPreview.dataset["patternCaseReviewPreviewText"] = "true";
  textPreview.textContent = preview.text;

  container.replaceChildren(meta, textPreview);
  appendPreviewWarnings(container, preview.warnings);
}

function appendDispatchStatus(
  container: HTMLElement,
  status: PatternCaseReviewDispatchStatus
): void {
  if (status.message === null) {
    return;
  }

  const statusLine = createElement(
    "p",
    `pattern-room-case-review-preview-status ${status.kind}`,
    status.message
  );
  statusLine.dataset["patternCaseReviewDispatchStatus"] = "true";
  container.append(statusLine);
}

function isCaseReviewActive(state: PatternCaseReviewPreviewPanelState): boolean {
  return (
    state.session?.status === "preview" ||
    state.session?.status === "dispatching" ||
    state.session?.status === "waiting-reply" ||
    state.dispatchStatus.kind === "sending"
  );
}

function createRoleField(state: PatternCaseReviewPreviewPanelState): HTMLElement {
  const field = createElement("label", "pattern-room-case-review-role-field");
  const select = createElement("select");
  select.dataset["patternCaseReviewRole"] = "true";
  PATTERN_ROOM_CASE_REVIEW_ROLE_SLOTS.forEach((role) => {
    const option = createElement("option", undefined, state.text(ROLE_TEXT_KEYS[role]));
    option.value = role;
    select.append(option);
  });
  select.value = state.selectedRole;
  select.disabled = isCaseReviewActive(state);
  select.addEventListener("change", () => {
    if (isPatternRoomCaseReviewRoleSlot(select.value)) {
      state.onRoleChange(select.value);
    }
  });
  field.append(createElement("span", undefined, state.text("roleLabel")), select);
  return field;
}

function appendCaseReviewPreview(
  device: HTMLElement,
  previewState: PatternCaseReviewPreviewPanelState,
  onHistoryFocus: () => void
): void {
  const previewSection = createElement("section", "pattern-room-case-review-preview");
  previewSection.dataset["patternCaseReviewPreview"] = "true";
  previewSection.ariaLabel = previewState.text("title");
  const previewResult = createElement("div", "pattern-room-case-review-preview-result");
  if (previewState.preview === null) {
    previewResult.append(
      createEmptyState(previewState.text("previewEmpty"), "pending", { live: true })
    );
  } else {
    renderCaseReviewPreview(previewResult, previewState.preview, previewState.text);
  }

  const prepareButton = createActionButton(
    previewState.text("actions.prepare"),
    previewState.onPrepare
  );
  prepareButton.dataset["patternCaseReviewPreviewPrepare"] = "true";
  prepareButton.disabled = isCaseReviewActive(previewState);

  const sendButton = createActionButton(previewState.text("actions.send"), previewState.onSend);
  sendButton.dataset["patternCaseReviewDispatchSend"] = "true";
  sendButton.disabled = previewState.preview === null || isCaseReviewActive(previewState);

  const actionRow = createElement(
    "div",
    "pattern-room-action-row pattern-room-case-review-controls"
  );
  actionRow.append(createRoleField(previewState), prepareButton, sendButton);
  appendDispatchStatus(previewResult, previewState.dispatchStatus);

  const request = createElement(
    "section",
    "pattern-room-case-review-workspace-card pattern-room-case-review-request"
  );
  request.dataset["patternCaseReviewRequest"] = "true";
  request.append(
    createElement(
      "span",
      "pattern-room-context-inspector-label",
      previewState.text("workspace.request")
    ),
    previewResult
  );

  previewSection.append(
    createElement("span", "pattern-room-kicker", previewState.text("kicker")),
    createElement("h2", undefined, `${previewState.selectedRole} ${previewState.text("title")}`),
    createElement("p", undefined, previewState.text("intro")),
    actionRow
  );
  const workspace = createElement("div", "pattern-room-case-review-workspace");
  workspace.append(
    createReviewDisclosure(
      "case-request",
      previewState.text("workspace.request"),
      request,
      previewState.preview !== null
    ),
    createPatternCaseReviewSimplifiedView(previewState, { onHistoryFocus })
  );
  previewSection.append(workspace);
  device.append(previewSection);
}

function appendPhaseAction(
  device: HTMLElement,
  session: PatternTenthManSession,
  actions: PatternPanelActions
): void {
  const phase = session.phase ?? "idle";
  const actionRow = createElement("div", "pattern-room-action-row pattern-room-debate-actions");

  if (phase === "idle") {
    actionRow.append(
      createDebateActionButton(
        "Oturumu Hazırla",
        "patternPrepareDebate",
        actions.prepareDebate,
        session.references.length === 0
      )
    );
  }

  if (phase === "preparation") {
    actionRow.append(
      createDebateActionButton("Rolleri Ata", "patternAssignDebateRoles", actions.assignDebateRoles)
    );
  }

  if (phase === "role_assignment") {
    actionRow.append(
      createDebateActionButton("Oturumu Başlat", "patternStartDebate", actions.startDebate)
    );
  }

  if (
    phase === "opening" ||
    phase === "counter_argument" ||
    phase === "evidence_review" ||
    phase === "weak_point"
  ) {
    actionRow.append(
      createDebateActionButton("Sonraki Tur", "patternAdvanceDebate", actions.advanceDebatePhase)
    );
  }

  if (phase === "judge_mapping") {
    actionRow.append(
      createDebateActionButton("Oturumu Tamamla", "patternCompleteDebate", actions.completeDebate)
    );
  }

  if (phase === "completed") {
    actionRow.append(
      createDebateActionButton(
        "Rapora Yansıt",
        "patternReflectDebate",
        actions.reflectDebateToReport
      )
    );
  }

  device.append(actionRow);
}

export function createTenthManPanel(
  data: PatternRoomWorkspaceModel,
  actions: PatternPanelActions,
  onBack: () => void,
  caseReviewPreviewState: PatternCaseReviewPreviewPanelState,
  workspaceText: PatternWorkspaceTranslator = createPatternWorkspaceTranslator("tr", null)
): HTMLElement {
  const shell = createPanelShell("tenth-man", workspaceText("nav.review.label"), onBack);
  shell.classList.add("pattern-room-review-panel");
  const session = data.tenthManSession;
  const phase = session.phase ?? "idle";

  const switcher = createElement("section", "pattern-room-review-task-switcher");
  switcher.dataset["patternReviewTaskSwitcher"] = "true";
  const switcherCopy = createElement("div", "pattern-room-review-task-switcher-copy");
  switcherCopy.append(
    createElement("span", "pattern-room-kicker", "İnceleme çalışma alanı"),
    createElement("strong", undefined, "Bir göreve odaklan"),
    createElement(
      "p",
      undefined,
      "AI incelemesi ile yerel 10. Adam simülasyonu aynı vaka verisini kullanır; sonuçlar otomatik uygulanmaz."
    )
  );
  const taskButtons = createElement("div", "pattern-room-review-task-buttons");
  const aiTaskButton = createReviewTaskButton(
    "ai-review",
    "AI Vaka İncelemesi",
    "Önizleme, yanıt, sonuç ve uygulama"
  );
  const localTaskButton = createReviewTaskButton(
    "tenth-man",
    "Yerel 10. Adam",
    "Referanslar, roller ve tartışma turları"
  );
  taskButtons.append(aiTaskButton, localTaskButton);
  switcher.append(switcherCopy, taskButtons);

  const workspace = createElement("div", "pattern-room-review-workspace");
  const reviewSurface = createElement("section", "pattern-room-review-surface");
  reviewSurface.dataset["patternReviewTaskSurface"] = "ai-review";
  reviewSurface.ariaLabel = workspaceText("review.workspaceLabel");

  const device = createElement(
    "aside",
    "pattern-room-device pattern-room-slot-device pattern-room-review-inspector"
  );
  device.dataset["patternReviewTaskSurface"] = "tenth-man";
  device.ariaLabel = workspaceText("review.debateInspectorLabel");
  device.append(
    createElement(
      "span",
      "pattern-room-context-inspector-label",
      workspaceText("review.debateInspectorLabel")
    )
  );

  const setActiveTask = (mode: PatternReviewTaskMode): void => {
    applyReviewTaskMode(shell, mode);
  };

  aiTaskButton.addEventListener("click", () => {
    setActiveTask("ai-review");
  });
  localTaskButton.addEventListener("click", () => {
    setActiveTask("tenth-man");
  });

  const statusRow = createElement("div", "pattern-room-device-status-row");
  statusRow.append(
    createElement(
      "span",
      "pattern-room-device-status",
      `${session.status} / ${PHASE_LABELS[phase]}`
    ),
    createElement(
      "span",
      "pattern-room-device-status pattern-room-device-status-secondary",
      "Yerel Simülasyon"
    ),
    createPhaseStepIndicator(phase)
  );

  device.append(
    statusRow,
    createElement("h2", undefined, session.label),
    createElement("p", undefined, session.prompt)
  );
  appendPhaseAction(device, session, actions);

  const slots = createElement("div", "pattern-room-device-slots");
  session.roles.forEach((role) => {
    slots.append(createRoleSlot(role));
  });
  device.append(
    createReviewDisclosure(
      "local-roles",
      "Roller ve bağlantı durumu",
      slots,
      phase === "preparation" || phase === "role_assignment"
    )
  );

  const references = createElement("div", "pattern-room-review-disclosure-content");
  appendReferences(references, session);
  device.append(
    createReviewDisclosure(
      "local-references",
      `Yerel referanslar (${String(session.references.length)})`,
      references,
      phase === "idle" && session.references.length > 0
    )
  );

  const sessionFlow = createElement("div", "pattern-room-review-disclosure-content");
  appendTurnList(sessionFlow, session.turns ?? []);
  appendVerdict(sessionFlow, session.verdict);
  if (sessionFlow.children.length > 0) {
    device.append(
      createReviewDisclosure(
        "local-flow",
        `Oturum akışı (${String(session.turns?.length ?? 0)})`,
        sessionFlow,
        phase === "completed"
      )
    );
  }

  appendCaseReviewPreview(reviewSurface, caseReviewPreviewState, () => {
    setActiveTask("ai-review");
  });

  workspace.append(reviewSurface, device);
  shell.append(switcher, workspace);
  setActiveTask(readReviewTaskMode());

  queueMicrotask(() => {
    const appShell = shell.parentElement?.parentElement?.parentElement;
    const historyNavigation = appShell?.querySelector<HTMLButtonElement>(
      "[data-pattern-workspace-nav='review-history']"
    );
    if (
      appShell === null ||
      appShell === undefined ||
      historyNavigation === null ||
      historyNavigation === undefined
    ) {
      return;
    }

    if (historyNavigation.dataset["patternReviewHistoryTaskBinding"] !== "true") {
      historyNavigation.dataset["patternReviewHistoryTaskBinding"] = "true";
      historyNavigation.addEventListener("click", () => {
        queueMicrotask(() => {
          const currentAppShell = historyNavigation.parentElement?.parentElement?.parentElement;
          if (currentAppShell === null || currentAppShell === undefined) {
            return;
          }
          applyReviewTaskMode(currentAppShell, "ai-review");
          openReviewHistory(currentAppShell);
        });
      });
    }

    if (historyNavigation.ariaCurrent === "page") {
      applyReviewTaskMode(appShell, "ai-review");
      openReviewHistory(appShell);
    }
  });

  return shell;
}
