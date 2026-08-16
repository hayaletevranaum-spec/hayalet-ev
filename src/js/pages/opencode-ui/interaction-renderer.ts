import {
  buildPlanHarderLocalReply,
  findMissingRequiredPlanQuestions,
} from "../../modules/rovo-interactions/reply-builder.js";
import { parseRovoInteraction } from "../../modules/rovo-interactions/parser.js";
import type {
  ParsedRovoInteraction,
  RovoInteractionQuestion,
} from "../../modules/rovo-interactions/types.js";
import {
  getRovoInteractionActivationSnapshot,
  getRovoInteractionRuntimeActions,
} from "./interaction-runtime.js";
import {
  deletePlanHarderLocalDraft,
  loadPlanHarderLocalDraft,
  savePlanHarderLocalDraft,
} from "./interaction-draft-store.js";
import { t } from "./i18n.js";

export interface AssistantInteractionRenderPlan {
  displayText: string;
  renderInto?: (container: HTMLElement) => void;
}

interface QuestionFieldEntry {
  field: HTMLElement;
  focus: () => void;
  reset: () => void;
  setValue: (value: string) => void;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  textContent?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className !== undefined && className !== "") {
    element.className = className;
  }
  if (textContent !== undefined) {
    element.textContent = textContent;
  }
  return element;
}

function buildDetailRow(label: string, value: string): HTMLElement {
  const row = createElement("div", "rovo-interaction__detail-row");
  const key = createElement("div", "rovo-interaction__detail-label", label);
  const content = createElement("div", "rovo-interaction__detail-value", value);
  row.append(key, content);
  return row;
}

function createActionGroup(): HTMLElement {
  return createElement("div", "rovo-interaction__actions");
}

function renderChangeApprovalCard(
  parsed: ParsedRovoInteraction & {
    payload: Extract<ParsedRovoInteraction["payload"], { type: "change-approval" }>;
  },
  container: HTMLElement
): void {
  const actions = getRovoInteractionRuntimeActions();
  const wrapper = createElement("section", "rovo-interaction rovo-interaction--approval");
  const header = createElement("div", "rovo-interaction__header");
  const title = createElement("div", "rovo-interaction__title", parsed.payload.title);
  header.appendChild(title);
  wrapper.appendChild(header);

  if ((parsed.payload.body ?? "").trim() !== "") {
    wrapper.appendChild(createElement("p", "rovo-interaction__body", parsed.payload.body?.trim()));
  }

  if ((parsed.payload.modeLabel ?? "").trim() !== "") {
    wrapper.appendChild(
      buildDetailRow(t("interaction.approval.modeLabel"), parsed.payload.modeLabel?.trim() ?? "")
    );
  }

  if ((parsed.payload.counterpartyLabel ?? "").trim() !== "") {
    wrapper.appendChild(
      buildDetailRow(
        t("interaction.approval.counterpartyLabel"),
        parsed.payload.counterpartyLabel?.trim() ?? ""
      )
    );
  }

  wrapper.appendChild(buildDetailRow(t("interaction.approval.issueLabel"), parsed.payload.issue));
  wrapper.appendChild(
    buildDetailRow(t("interaction.approval.solutionLabel"), parsed.payload.solution)
  );

  if (Array.isArray(parsed.payload.files) && parsed.payload.files.length > 0) {
    const fileSection = createElement("div", "rovo-interaction__detail-row");
    fileSection.appendChild(
      createElement("div", "rovo-interaction__detail-label", t("interaction.approval.filesLabel"))
    );
    const fileList = createElement("div", "rovo-interaction__chip-list");
    parsed.payload.files.forEach((file) => {
      fileList.appendChild(createElement("span", "rovo-interaction__chip", file));
    });
    fileSection.appendChild(fileList);
    wrapper.appendChild(fileSection);
  }

  const footer = createElement("div", "rovo-interaction__footer");
  footer.appendChild(
    createElement(
      "div",
      "rovo-interaction__hint",
      parsed.displayText === "" ? parsed.payload.fallbackText : parsed.displayText
    )
  );

  const approvalLabel = parsed.payload.canonicalReplyLabel?.trim();
  const approveButton = createElement(
    "button",
    "btn btn-primary btn-sm rovo-interaction__action",
    approvalLabel !== undefined && approvalLabel !== ""
      ? approvalLabel
      : parsed.payload.canonicalReply
  );
  approveButton.type = "button";
  approveButton.disabled = actions === null;
  approveButton.addEventListener("click", () => {
    if (actions === null) {
      return;
    }

    approveButton.disabled = true;
    void actions.submitText(parsed.payload.canonicalReply).finally(() => {
      approveButton.disabled = false;
    });
  });
  const actionGroup = createActionGroup();
  actionGroup.appendChild(approveButton);
  footer.appendChild(actionGroup);
  wrapper.appendChild(footer);
  container.appendChild(wrapper);
}

function markQuestionInvalid(field: HTMLElement, invalid: boolean): void {
  field.classList.toggle("is-invalid", invalid);
  field
    .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")
    .forEach((control) => {
      control.setAttribute("aria-invalid", invalid ? "true" : "false");
    });
}

function buildQuestionField(
  question: RovoInteractionQuestion,
  initialValue: string,
  onChange: (value: string) => void
): QuestionFieldEntry {
  const field = createElement("div", "rovo-interaction__field");
  const labelText = question.required === true ? `${question.label} *` : question.label;
  const label = createElement("label", "rovo-interaction__field-label", labelText);
  label.htmlFor = `rovo-interaction-${question.id}`;
  field.appendChild(label);

  if ((question.helpText ?? "").trim() !== "") {
    field.appendChild(
      createElement("div", "rovo-interaction__field-help", question.helpText?.trim())
    );
  }

  if (question.kind === "single-choice") {
    const choiceList = createElement("div", "rovo-interaction__choice-list");
    let firstRadio: HTMLInputElement | null = null;

    question.options.forEach((option, index) => {
      const chip = createElement("label", "ds-choice-chip rovo-interaction__choice");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `rovo-interaction-${question.id}`;
      radio.value = option.value;
      radio.checked = initialValue === option.value;
      if (index === 0) {
        firstRadio = radio;
      }
      radio.addEventListener("change", () => {
        if (radio.checked) {
          onChange(option.value);
        }
      });

      const text = createElement(
        "span",
        "rovo-interaction__choice-label",
        option.recommended === true
          ? `${option.label} (${t("interaction.plan.recommendedSuffix")})`
          : option.label
      );

      chip.append(radio, text);

      if ((option.description ?? "").trim() !== "") {
        chip.appendChild(
          createElement("span", "rovo-interaction__choice-help", option.description?.trim())
        );
      }

      choiceList.appendChild(chip);
    });

    field.appendChild(choiceList);
    return {
      field,
      focus: (): void => {
        firstRadio?.focus();
      },
      reset: (): void => {
        choiceList.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach((radio) => {
          radio.checked = false;
        });
      },
      setValue: (value: string): void => {
        choiceList.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach((radio) => {
          radio.checked = radio.value === value;
        });
      },
    };
  }

  const control =
    question.kind === "long-text"
      ? createElement("textarea", "input rovo-interaction__textarea")
      : createElement("input", "input rovo-interaction__input");

  control.id = `rovo-interaction-${question.id}`;
  if (control instanceof HTMLTextAreaElement) {
    control.rows = 4;
    control.value = initialValue;
  } else {
    control.type = "text";
    control.value = initialValue;
  }

  if ((question.placeholder ?? "").trim() !== "") {
    control.placeholder = question.placeholder?.trim() ?? "";
  }

  control.addEventListener("input", () => {
    onChange(control.value);
  });
  field.appendChild(control);

  return {
    field,
    focus: (): void => {
      control.focus();
    },
    reset: (): void => {
      control.value = "";
    },
    setValue: (value: string): void => {
      control.value = value;
    },
  };
}

function renderPlanHarderLocalCard(
  parsed: ParsedRovoInteraction & {
    payload: Extract<ParsedRovoInteraction["payload"], { type: "plan-harder-local" }>;
  },
  container: HTMLElement
): void {
  const actions = getRovoInteractionRuntimeActions();
  const wrapper = createElement("section", "rovo-interaction rovo-interaction--plan");
  const header = createElement("div", "rovo-interaction__header");
  header.appendChild(createElement("div", "rovo-interaction__title", parsed.payload.title));
  if (parsed.payload.persistDraft !== false) {
    header.appendChild(
      createElement("div", "rovo-interaction__storage-hint", t("interaction.plan.storageHint"))
    );
  }
  wrapper.appendChild(header);

  if ((parsed.payload.body ?? "").trim() !== "") {
    wrapper.appendChild(createElement("p", "rovo-interaction__body", parsed.payload.body?.trim()));
  }

  const fieldsHost = createElement("div", "rovo-interaction__fields");
  const fieldRegistry = new Map<string, QuestionFieldEntry>();
  const answers: Record<string, string> = {};
  const previewHost = createElement("section", "rovo-interaction__preview is-empty");
  const previewTitle = createElement(
    "div",
    "rovo-interaction__preview-title",
    t("interaction.plan.previewTitle")
  );
  const previewBody = createElement(
    "pre",
    "rovo-interaction__preview-body",
    t("interaction.plan.previewEmpty")
  );
  previewHost.append(previewTitle, previewBody);

  const persistDraft = parsed.payload.persistDraft !== false;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  const clearScheduledDraftSave = (): void => {
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
  };
  const updatePreview = (): void => {
    const reply = buildPlanHarderLocalReply(parsed.payload, answers);
    const empty = reply === "";
    previewHost.classList.toggle("is-empty", empty);
    previewBody.textContent = empty ? t("interaction.plan.previewEmpty") : reply;
  };
  const scheduleDraftSave = (): void => {
    if (!persistDraft) {
      return;
    }

    clearScheduledDraftSave();
    const answersSnapshot = { ...answers };
    persistTimer = setTimeout(() => {
      persistTimer = null;
      void savePlanHarderLocalDraft(parsed.payload.id, answersSnapshot);
    }, 250);
  };

  parsed.payload.questions.forEach((question) => {
    answers[question.id] = "";
    const entry = buildQuestionField(question, "", (value) => {
      answers[question.id] = value;
      markQuestionInvalid(entry.field, false);
      updatePreview();
      scheduleDraftSave();
    });
    fieldRegistry.set(question.id, entry);
    fieldsHost.appendChild(entry.field);
  });

  wrapper.appendChild(fieldsHost);
  wrapper.appendChild(previewHost);
  updatePreview();

  if (persistDraft) {
    void loadPlanHarderLocalDraft(parsed.payload.id).then((savedAnswers) => {
      if (savedAnswers === null) {
        return;
      }

      parsed.payload.questions.forEach((question) => {
        const value = savedAnswers[question.id];
        if (typeof value !== "string") {
          return;
        }

        answers[question.id] = value;
        const entry = fieldRegistry.get(question.id);
        entry?.setValue(value);
      });
      updatePreview();
    });
  }

  const footer = createElement("div", "rovo-interaction__footer");
  footer.appendChild(createElement("div", "rovo-interaction__hint", parsed.displayText));
  const clearLabel = parsed.payload.clearLabel?.trim();
  const clearButton = createElement(
    "button",
    "btn btn-secondary btn-sm rovo-interaction__action",
    clearLabel !== undefined && clearLabel !== "" ? clearLabel : t("interaction.plan.clear")
  );
  clearButton.type = "button";
  clearButton.addEventListener("click", () => {
    clearScheduledDraftSave();
    fieldRegistry.forEach((entry, questionId) => {
      entry.reset();
      answers[questionId] = "";
      markQuestionInvalid(entry.field, false);
    });
    updatePreview();
    void deletePlanHarderLocalDraft(parsed.payload.id);
  });

  const submitLabel = parsed.payload.submitLabel?.trim();
  const submitButton = createElement(
    "button",
    "btn btn-primary btn-sm rovo-interaction__action",
    submitLabel !== undefined && submitLabel !== "" ? submitLabel : t("interaction.plan.submit")
  );
  submitButton.type = "button";
  submitButton.disabled = actions === null;
  submitButton.addEventListener("click", () => {
    const missing = findMissingRequiredPlanQuestions(parsed.payload, answers);

    fieldRegistry.forEach((entry, questionId) => {
      const isMissing = missing.some((question) => question.id === questionId);
      markQuestionInvalid(entry.field, isMissing);
    });

    if (missing.length > 0) {
      const firstMissingQuestion = missing[0];
      const firstMissingEntry =
        firstMissingQuestion !== undefined ? fieldRegistry.get(firstMissingQuestion.id) : undefined;
      if (firstMissingEntry != null) {
        firstMissingEntry.focus();
      }
      actions?.showToast(t("interaction.plan.missingRequired"));
      return;
    }

    const reply = buildPlanHarderLocalReply(parsed.payload, answers);
    if (reply === "") {
      actions?.showToast(t("interaction.plan.emptyReply"));
      return;
    }

    submitButton.disabled = true;
    void (actions?.submitText(reply) ?? Promise.resolve())
      .then(async () => {
        clearScheduledDraftSave();
        if (persistDraft) {
          await deletePlanHarderLocalDraft(parsed.payload.id);
        }
      })
      .finally(() => {
        submitButton.disabled = false;
      });
  });

  const actionGroup = createActionGroup();
  actionGroup.append(clearButton, submitButton);
  footer.appendChild(actionGroup);
  wrapper.appendChild(footer);

  container.appendChild(wrapper);
}

export function buildAssistantInteractionRenderPlan(
  text: string
): AssistantInteractionRenderPlan | null {
  const parsed = parseRovoInteraction(text);
  if (parsed === null) {
    return null;
  }

  const activation = getRovoInteractionActivationSnapshot();
  if (activation.active !== true) {
    return {
      displayText: parsed.displayText,
    };
  }

  if (parsed.payload.type === "change-approval") {
    return {
      displayText: parsed.displayText,
      renderInto: (container): void => {
        renderChangeApprovalCard(
          parsed as ParsedRovoInteraction & {
            payload: Extract<ParsedRovoInteraction["payload"], { type: "change-approval" }>;
          },
          container
        );
      },
    };
  }

  return {
    displayText: parsed.displayText,
    renderInto: (container): void => {
      renderPlanHarderLocalCard(
        parsed as ParsedRovoInteraction & {
          payload: Extract<ParsedRovoInteraction["payload"], { type: "plan-harder-local" }>;
        },
        container
      );
    },
  };
}
