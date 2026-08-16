import type { ForgeUiState, ForgeWorkbenchUiFlowState } from "../../shared/ui/state.js";
import { createForgePanel } from "./panel-shell.js";

function createOption(
  documentRef: Document,
  value: string,
  label: string,
  selectedValue: string | null
): HTMLOptionElement {
  const option = documentRef.createElement("option");
  option.value = value;
  option.textContent = label;
  option.selected = selectedValue === value;
  return option;
}

function safeTaskKey(taskId: string): string {
  return taskId.replace(/[^a-z0-9_-]/gi, "-");
}

function createField(documentRef: Document, labelText: string, control: HTMLElement): HTMLElement {
  const wrapper = documentRef.createElement("label");
  wrapper.className = "forge-field";
  const label = documentRef.createElement("span");
  label.className = "forge-field__label";
  label.textContent = labelText;
  wrapper.append(label, control);
  return wrapper;
}

function createButton(
  documentRef: Document,
  label: string,
  action?: string,
  options: {
    datasetKey?: string;
    datasetValue?: string;
    disabled?: boolean;
    primary?: boolean;
  } = {}
): HTMLButtonElement {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = options.primary
    ? "forge-button forge-button--primary"
    : "forge-button forge-button--secondary";
  if (action) {
    button.dataset["forgeAction"] = action;
  }
  if (options.datasetKey && options.datasetValue) {
    button.dataset[options.datasetKey] = options.datasetValue;
  }
  button.disabled = options.disabled === true;
  button.textContent = label;
  return button;
}

function createGuideCard(
  documentRef: Document,
  titleText: string,
  summaryText: string
): HTMLElement {
  const card = documentRef.createElement("article");
  card.className = "forge-state-guide";
  const title = documentRef.createElement("strong");
  title.textContent = titleText;
  const summary = documentRef.createElement("p");
  summary.className = "forge-panel__hint";
  summary.textContent = summaryText;
  card.append(title, summary);
  return card;
}

function toDispatchModeLabel(
  mode: string,
  text: (path: string[], fallback: string, params?: Record<string, number | string>) => string
): string {
  if (mode === "single-owner") {
    return text(["workbench", "dispatchModes", "singleOwner"], "Single owner");
  }
  if (mode === "compare") {
    return text(["workbench", "dispatchModes", "compare"], "Compare");
  }
  return mode;
}

function toRoleLabel(
  state: ForgeUiState,
  roleId: string | null,
  text: (path: string[], fallback: string, params?: Record<string, number | string>) => string
): string {
  if (!roleId) {
    return text(["workbench", "draftPanel", "fields", "role"], "Role");
  }
  const entry = state.meta.roleCatalog[roleId] as { label?: string } | undefined;
  return text(["workbench", "roles", roleId], entry?.label ?? roleId);
}

function translateValidationMessage(
  message: string,
  text: (path: string[], fallback: string, params?: Record<string, number | string>) => string
): string {
  const taskRangeMatch = /^Draft breakdown must contain (\d+) to (\d+) top-level tasks\.$/.exec(
    message
  );
  if (taskRangeMatch) {
    return text(
      ["workbench", "validation", "taskRange"],
      "Draft breakdown must contain {min} to {max} top-level tasks.",
      {
        min: taskRangeMatch[1] ?? "",
        max: taskRangeMatch[2] ?? "",
      }
    );
  }

  const missingTitleMatch = /^Task (\d+) is missing a title\.$/.exec(message);
  if (missingTitleMatch) {
    return text(
      ["workbench", "validation", "taskMissingTitle"],
      "Task {index} is missing a title.",
      { index: missingTitleMatch[1] ?? "" }
    );
  }

  const missingSummaryMatch = /^Task (\d+) is missing a summary\.$/.exec(message);
  if (missingSummaryMatch) {
    return text(
      ["workbench", "validation", "taskMissingSummary"],
      "Task {index} is missing a summary.",
      { index: missingSummaryMatch[1] ?? "" }
    );
  }

  const duplicateTitleMatch = /^Task title "(.+)" is duplicated\.$/.exec(message);
  if (duplicateTitleMatch) {
    return text(
      ["workbench", "validation", "duplicateTitle"],
      'Task title "{title}" is duplicated.',
      { title: duplicateTitleMatch[1] ?? "" }
    );
  }

  const compareSeatMatch = /^Compare task "(.+)" must define at least one comparison seat\.$/.exec(
    message
  );
  if (compareSeatMatch) {
    return text(
      ["workbench", "validation", "compareSeatRequired"],
      'Compare task "{title}" must define at least one comparison seat.',
      { title: compareSeatMatch[1] ?? "" }
    );
  }

  const unknownDependencyMatch = /^Task "(.+)" depends on unknown task "(.+)"\.$/.exec(message);
  if (unknownDependencyMatch) {
    return text(
      ["workbench", "validation", "unknownDependency"],
      'Task "{task}" depends on unknown task "{dependency}".',
      {
        dependency: unknownDependencyMatch[2] ?? "",
        task: unknownDependencyMatch[1] ?? "",
      }
    );
  }

  const selfDependencyMatch = /^Task "(.+)" cannot depend on itself\.$/.exec(message);
  if (selfDependencyMatch) {
    return text(
      ["workbench", "validation", "selfDependency"],
      'Task "{task}" cannot depend on itself.',
      { task: selfDependencyMatch[1] ?? "" }
    );
  }

  return message;
}

export function renderDraftBreakdownPanel(
  documentRef: Document,
  state: ForgeUiState,
  text: (path: string[], fallback: string, params?: Record<string, number | string>) => string,
  options: {
    approvalBlockedReason: string | null;
    flowState: ForgeWorkbenchUiFlowState;
    rawEditorOpen: boolean;
  }
): HTMLElement {
  const body = documentRef.createElement("div");
  body.className = "forge-panel__body";
  const topLevelTasks = state.snapshot.draftTasks.filter((task) => task.level === 1);
  const draftState = (() => {
    switch (options.flowState) {
      case "IDLE":
        return {
          title: text(["workbench", "draftPanel", "guide", "idle", "title"], "REQUIRES: GOAL"),
          summary: text(
            ["workbench", "draftPanel", "guide", "idle", "summary"],
            "SAVE GOAL -> START"
          ),
        };
      case "SESSION_CREATED":
        return {
          title: text(
            ["workbench", "draftPanel", "guide", "sessionCreated", "title"],
            "REQUIRES: GOAL"
          ),
          summary: text(
            ["workbench", "draftPanel", "guide", "sessionCreated", "summary"],
            "SAVE GOAL -> START"
          ),
        };
      case "GOAL_DEFINED":
        return {
          title: text(
            ["workbench", "draftPanel", "guide", "goalDefined", "title"],
            "NEXT: GENERATE DRAFT"
          ),
          summary: text(
            ["workbench", "draftPanel", "guide", "goalDefined", "summary"],
            "DRAFT OPENS AFTER GENERATION"
          ),
        };
      case "DRAFT_READY":
        return state.snapshot.validationMessages.length > 0
          ? {
              title: text(
                ["workbench", "draftPanel", "guide", "draftReadyBlocked", "title"],
                "BLOCKER: DRAFT ISSUES"
              ),
              summary: text(
                ["workbench", "draftPanel", "guide", "draftReadyBlocked", "summary"],
                "FIX THE TASKS BELOW"
              ),
            }
          : {
              title: text(
                ["workbench", "draftPanel", "guide", "draftReadyOpen", "title"],
                "NEXT: APPROVE DRAFT"
              ),
              summary: text(
                ["workbench", "draftPanel", "guide", "draftReadyOpen", "summary"],
                "REFINE, THEN APPROVE"
              ),
            };
      case "APPROVED":
      case "DISPATCHED":
      case "RESPONSES_READY":
      case "CONFLICT":
      case "SYNTHESIS_READY":
      case "EXPORTED":
        return {
          title: text(
            ["workbench", "draftPanel", "guide", "locked", "title"],
            "STATE: REFERENCE ONLY"
          ),
          summary: text(
            ["workbench", "draftPanel", "guide", "locked", "summary"],
            "DRAFT IS LOCKED"
          ),
        };
      default: {
        const _exhaustive: never = options.flowState;
        return _exhaustive;
      }
    }
  })();
  const checklistByParentId = new Map(
    topLevelTasks.map((task) => [
      task.id,
      state.snapshot.draftTasks
        .filter((candidate) => candidate.parentTaskId === task.id && candidate.level === 2)
        .map((candidate) => candidate.title),
    ])
  );

  const toolbar = documentRef.createElement("div");
  toolbar.className = "forge-toolbar";
  const title = documentRef.createElement("p");
  title.className = "forge-toolbar__title";
  title.textContent =
    topLevelTasks.length > 0
      ? topLevelTasks.length === 1
        ? text(["workbench", "draftPanel", "toolbar", "countOne"], "{count} task in draft", {
            count: topLevelTasks.length,
          })
        : text(["workbench", "draftPanel", "toolbar", "countOther"], "{count} tasks in draft", {
            count: topLevelTasks.length,
          })
      : text(["workbench", "draftPanel", "toolbar", "empty"], "No draft yet");
  const actions = documentRef.createElement("div");
  actions.className = "forge-actions";
  if (options.flowState === "DRAFT_READY") {
    actions.append(
      createButton(
        documentRef,
        text(["workbench", "draftPanel", "actions", "addTask"], "Add task"),
        "add-draft-task"
      ),
      createButton(
        documentRef,
        text(["workbench", "draftPanel", "actions", "toggleRaw"], "Advanced / raw"),
        undefined,
        {
          datasetKey: "forgeToggleAdvancedDraft",
          datasetValue: "true",
        }
      )
    );
  }
  toolbar.append(title, actions);
  body.append(toolbar);
  body.append(createGuideCard(documentRef, draftState.title, draftState.summary));

  if (options.flowState === "DRAFT_READY" && options.approvalBlockedReason !== null) {
    const blocked = documentRef.createElement("p");
    blocked.className = "forge-inline-status forge-inline-status--warning";
    blocked.textContent = options.approvalBlockedReason;
    body.append(blocked);
  }

  if (topLevelTasks.length === 0 || options.flowState !== "DRAFT_READY") {
    const empty = documentRef.createElement("p");
    empty.className = "forge-panel__hint";
    empty.textContent = text(
      [
        "workbench",
        "draftPanel",
        "empty",
        options.flowState === "GOAL_DEFINED" ? "goalDefined" : "locked",
      ],
      "No draft yet. Save goal to generate the first structure."
    );
    body.append(empty);
  } else {
    const cards = documentRef.createElement("div");
    cards.className = "forge-card-list";
    topLevelTasks.forEach((task) => {
      const taskKey = safeTaskKey(task.id);
      const card = documentRef.createElement("article");
      card.className = "forge-card forge-card--task-editor";

      const header = documentRef.createElement("div");
      header.className = "forge-task-card__header";
      const titleInput = documentRef.createElement("input");
      titleInput.id = `forge-draft-title-${taskKey}`;
      titleInput.className = "forge-input";
      titleInput.value = task.title;
      titleInput.placeholder = text(
        ["workbench", "draftPanel", "placeholders", "taskTitle"],
        "Task title"
      );
      const meta = documentRef.createElement("div");
      meta.className = "forge-flow-item__meta";
      [
        toDispatchModeLabel(task.dispatchMode, text),
        task.seatId ?? "ai1",
        toRoleLabel(state, task.roleId, text),
      ].forEach((value, index) => {
        const chip = documentRef.createElement("span");
        chip.className = index === 0 ? "forge-chip forge-chip--soft" : "forge-chip";
        chip.textContent = value;
        meta.append(chip);
      });
      header.append(titleInput, meta);

      const summaryInput = documentRef.createElement("textarea");
      summaryInput.id = `forge-draft-summary-${taskKey}`;
      summaryInput.className = "forge-textarea forge-textarea--compact";
      summaryInput.value = task.summary;
      summaryInput.placeholder = text(
        ["workbench", "draftPanel", "placeholders", "taskSummary"],
        "Task summary"
      );

      const seatSelect = documentRef.createElement("select");
      seatSelect.id = `forge-draft-seat-${taskKey}`;
      seatSelect.className = "forge-input";
      (["ai1", "ai2", "us1"] as const).forEach((seatId) => {
        seatSelect.append(createOption(documentRef, seatId, seatId, task.seatId));
      });

      const roleSelect = documentRef.createElement("select");
      roleSelect.id = `forge-draft-role-${taskKey}`;
      roleSelect.className = "forge-input";
      Object.values(state.meta.roleCatalog).forEach((entry) => {
        const record = entry as { id?: string; label?: string; localActor?: boolean };
        if (record.localActor === true || !record.id) {
          return;
        }
        roleSelect.append(
          createOption(
            documentRef,
            record.id,
            text(["workbench", "roles", record.id], record.label ?? record.id),
            task.roleId
          )
        );
      });

      const modeSelect = documentRef.createElement("select");
      modeSelect.id = `forge-draft-mode-${taskKey}`;
      modeSelect.className = "forge-input";
      modeSelect.append(
        createOption(
          documentRef,
          "single-owner",
          text(["workbench", "dispatchModes", "singleOwner"], "Single owner"),
          task.dispatchMode
        ),
        createOption(
          documentRef,
          "compare",
          text(["workbench", "dispatchModes", "compare"], "Compare"),
          task.dispatchMode
        )
      );

      const compareSeatSelect = documentRef.createElement("select");
      compareSeatSelect.id = `forge-draft-compare-seat-${taskKey}`;
      compareSeatSelect.className = "forge-input";
      compareSeatSelect.append(
        createOption(documentRef, "", text(["workbench", "common", "none"], "none"), null)
      );
      ["ai1", "ai2", "us1"].forEach((seatId) => {
        compareSeatSelect.append(
          createOption(documentRef, seatId, seatId, task.compareSeatIds[0] ?? null)
        );
      });

      const personaSelect = documentRef.createElement("select");
      personaSelect.id = `forge-draft-persona-${taskKey}`;
      personaSelect.className = "forge-input";
      personaSelect.append(
        createOption(
          documentRef,
          "",
          text(["workbench", "common", "none"], "none"),
          task.personaPresetId
        )
      );
      Object.values(state.meta.personaPresets).forEach((entry) => {
        const record = entry as { id?: string; label?: string };
        if (!record.id) {
          return;
        }
        personaSelect.append(
          createOption(documentRef, record.id, record.label ?? record.id, task.personaPresetId)
        );
      });

      const checklistInput = documentRef.createElement("textarea");
      checklistInput.id = `forge-draft-checklist-${taskKey}`;
      checklistInput.className = "forge-textarea forge-textarea--compact";
      checklistInput.value = (checklistByParentId.get(task.id) ?? []).join("\n");
      checklistInput.placeholder = text(
        ["workbench", "draftPanel", "placeholders", "checklist"],
        "Checklist"
      );

      const fieldGrid = documentRef.createElement("div");
      fieldGrid.className = "forge-form-grid forge-form-grid--task";
      fieldGrid.append(
        createField(
          documentRef,
          text(["workbench", "draftPanel", "fields", "summary"], "Summary"),
          summaryInput
        ),
        createField(
          documentRef,
          text(["workbench", "draftPanel", "fields", "seat"], "Seat"),
          seatSelect
        ),
        createField(
          documentRef,
          text(["workbench", "draftPanel", "fields", "role"], "Role"),
          roleSelect
        ),
        createField(
          documentRef,
          text(["workbench", "draftPanel", "fields", "mode"], "Mode"),
          modeSelect
        ),
        createField(
          documentRef,
          text(["workbench", "draftPanel", "fields", "compareSeat"], "Compare seat"),
          compareSeatSelect
        ),
        createField(
          documentRef,
          text(["workbench", "draftPanel", "fields", "persona"], "Persona"),
          personaSelect
        ),
        createField(
          documentRef,
          text(["workbench", "draftPanel", "fields", "checklist"], "Checklist"),
          checklistInput
        )
      );

      const taskActions = documentRef.createElement("div");
      taskActions.className = "forge-actions";
      taskActions.append(
        createButton(
          documentRef,
          text(["workbench", "draftPanel", "actions", "saveTask"], "Save task"),
          undefined,
          {
            datasetKey: "forgeSaveDraftTask",
            datasetValue: task.id,
          }
        ),
        createButton(
          documentRef,
          text(["workbench", "draftPanel", "actions", "remove"], "Remove"),
          undefined,
          {
            datasetKey: "forgeRemoveDraftTask",
            datasetValue: task.id,
          }
        )
      );

      card.append(header, fieldGrid, taskActions);
      cards.append(card);
    });
    body.append(cards);
  }

  if (state.snapshot.validationMessages.length > 0) {
    const errors = documentRef.createElement("ul");
    errors.className = "forge-list forge-list--errors";
    state.snapshot.validationMessages.forEach((message) => {
      const item = documentRef.createElement("li");
      item.className = "forge-list__item";
      item.textContent = translateValidationMessage(message, text);
      errors.append(item);
    });
    body.append(errors);
  }

  if (options.flowState === "DRAFT_READY" && options.rawEditorOpen) {
    const rawCard = documentRef.createElement("div");
    rawCard.className = "forge-advanced-raw";
    const rawTitle = documentRef.createElement("p");
    rawTitle.className = "forge-advanced-raw__title";
    rawTitle.textContent = text(
      ["workbench", "draftPanel", "rawTitle"],
      "Advanced / raw draft edit"
    );
    const editor = documentRef.createElement("textarea");
    editor.id = "forge-draft-source";
    editor.className = "forge-textarea forge-textarea--draft";
    editor.placeholder = text(
      ["workbench", "draftPanel", "placeholders", "rawEditor"],
      '{"tasks":[{"title":"Task title"}]}'
    );
    editor.value = state.snapshot.draftSourceText ?? "";
    rawCard.append(rawTitle, editor);
    rawCard.append(
      createButton(
        documentRef,
        text(["workbench", "draftPanel", "actions", "applyRawDraft"], "Apply raw draft"),
        "apply-draft-text"
      )
    );
    body.append(rawCard);
  }

  return createForgePanel(documentRef, {
    panelId: "draft",
    title: text(["workbench", "panels", "draft"], "Draft"),
    body,
  });
}
