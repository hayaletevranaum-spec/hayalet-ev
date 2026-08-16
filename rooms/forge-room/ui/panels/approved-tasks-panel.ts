import type { ForgeUiState, ForgeWorkbenchUiFlowState } from "../../shared/ui/state.js";
import { createForgePanel } from "./panel-shell.js";

function safeTaskKey(taskId: string): string {
  return taskId.replace(/[^a-z0-9_-]/gi, "-");
}

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

function createField(documentRef: Document, labelText: string, control: HTMLElement): HTMLElement {
  const wrapper = documentRef.createElement("label");
  wrapper.className = "forge-field";
  const label = documentRef.createElement("span");
  label.className = "forge-field__label";
  label.textContent = labelText;
  wrapper.append(label, control);
  return wrapper;
}

function createTextarea(
  documentRef: Document,
  value: string,
  placeholder: string,
  disabled: boolean
): HTMLTextAreaElement {
  const textarea = documentRef.createElement("textarea");
  textarea.className = "forge-textarea forge-textarea--compact";
  textarea.value = value;
  textarea.placeholder = placeholder;
  textarea.disabled = disabled;
  return textarea;
}

function createButton(
  documentRef: Document,
  label: string,
  options: {
    action?: string;
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
  if (options.action) {
    button.dataset["forgeAction"] = options.action;
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
    return text(["workbench", "approvedPanel", "fields", "role"], "Role");
  }
  const entry = state.meta.roleCatalog[roleId] as { label?: string } | undefined;
  return text(["workbench", "roles", roleId], entry?.label ?? roleId);
}

export function renderApprovedTasksPanel(
  documentRef: Document,
  state: ForgeUiState,
  text: (path: string[], fallback: string, params?: Record<string, number | string>) => string,
  options: {
    advancedCapsulesOpen: boolean;
    dispatchBlockedReason: string | null;
    flowState: ForgeWorkbenchUiFlowState;
  }
): HTMLElement {
  const body = documentRef.createElement("div");
  body.className = "forge-panel__body";
  const topLevelTasks = state.snapshot.approvedTasks.filter((task) => task.level === 1);
  const approvedState = (() => {
    switch (options.flowState) {
      case "APPROVED":
        return {
          title: text(
            ["workbench", "approvedPanel", "guide", "approved", "title"],
            "DISPATCH READY"
          ),
          summary: text(
            ["workbench", "approvedPanel", "guide", "approved", "summary"],
            "NEXT ACTION: DISPATCH ASSIGNMENTS"
          ),
        };
      case "DISPATCHED":
        return {
          title: text(
            ["workbench", "approvedPanel", "guide", "dispatched", "title"],
            "DISPATCH LOCKED"
          ),
          summary: text(
            ["workbench", "approvedPanel", "guide", "dispatched", "summary"],
            "STATE: WORK IN FLIGHT"
          ),
        };
      case "IDLE":
      case "GOAL_DEFINED":
      case "SESSION_CREATED":
      case "DRAFT_READY":
        return {
          title: text(
            ["workbench", "approvedPanel", "guide", "locked", "title"],
            "DISPATCH LOCKED"
          ),
          summary: text(
            ["workbench", "approvedPanel", "guide", "locked", "summary"],
            "REQUIRES: APPROVED DRAFT"
          ),
        };
      case "RESPONSES_READY":
      case "CONFLICT":
      case "SYNTHESIS_READY":
      case "EXPORTED":
        return {
          title: text(
            ["workbench", "approvedPanel", "guide", "referenceOnly", "title"],
            "DISPATCH LOCKED"
          ),
          summary: text(
            ["workbench", "approvedPanel", "guide", "referenceOnly", "summary"],
            "STATE: REFERENCE ONLY"
          ),
        };
      default: {
        const _exhaustive: never = options.flowState;
        return _exhaustive;
      }
    }
  })();
  const settingsLocked = options.flowState !== "APPROVED";

  const toolbar = documentRef.createElement("div");
  toolbar.className = "forge-toolbar";
  const title = documentRef.createElement("p");
  title.className = "forge-toolbar__title";
  title.textContent =
    topLevelTasks.length > 0
      ? topLevelTasks.length === 1
        ? text(["workbench", "approvedPanel", "toolbar", "countOne"], "{count} approved task", {
            count: topLevelTasks.length,
          })
        : text(["workbench", "approvedPanel", "toolbar", "countOther"], "{count} approved tasks", {
            count: topLevelTasks.length,
          })
      : text(["workbench", "approvedPanel", "toolbar", "empty"], "No approved tasks");
  toolbar.append(title);
  if (topLevelTasks.length > 0) {
    toolbar.append(
      createButton(
        documentRef,
        options.advancedCapsulesOpen ? "Hide advanced capsule" : "Advanced capsule",
        {
          datasetKey: "forgeToggleAdvancedCapsules",
          datasetValue: "true",
        }
      )
    );
  }
  body.append(toolbar);
  body.append(createGuideCard(documentRef, approvedState.title, approvedState.summary));

  if (options.flowState === "APPROVED" && options.dispatchBlockedReason) {
    const blocked = documentRef.createElement("p");
    blocked.className = "forge-inline-status forge-inline-status--warning";
    blocked.textContent = options.dispatchBlockedReason;
    body.append(blocked);
  }

  if (topLevelTasks.length === 0) {
    const empty = documentRef.createElement("p");
    empty.className = "forge-panel__hint";
    empty.textContent = text(
      ["workbench", "states", "emptyApproved"],
      "Approve the draft to arm dispatch-ready task lanes here."
    );
    body.append(empty);
  } else {
    const cards = documentRef.createElement("div");
    cards.className = "forge-card-list";
    topLevelTasks.forEach((task) => {
      const taskKey = safeTaskKey(task.id);
      const taskAssignments = state.snapshot.assignments.filter(
        (entry) => entry.taskId === task.id
      );
      const queuedCount = taskAssignments.filter((entry) => entry.status === "queued").length;
      const completedCount = taskAssignments.filter((entry) => entry.status === "completed").length;

      const card = documentRef.createElement("article");
      card.className = "forge-card forge-card--task-editor forge-card--approved";

      const header = documentRef.createElement("div");
      header.className = "forge-task-card__header";
      const titleBlock = documentRef.createElement("div");
      titleBlock.className = "forge-task-card__title";
      const titleText = documentRef.createElement("strong");
      titleText.textContent = task.title;
      const summary = documentRef.createElement("p");
      summary.className = "forge-flow-item__summary";
      summary.textContent = task.summary;
      titleBlock.append(titleText, summary);
      const meta = documentRef.createElement("div");
      meta.className = "forge-flow-item__meta";
      [
        queuedCount === 1
          ? text(["workbench", "approvedPanel", "meta", "queuedOne"], "{count} queued", {
              count: queuedCount,
            })
          : text(["workbench", "approvedPanel", "meta", "queuedOther"], "{count} queued", {
              count: queuedCount,
            }),
        completedCount === 1
          ? text(["workbench", "approvedPanel", "meta", "doneOne"], "{count} done", {
              count: completedCount,
            })
          : text(["workbench", "approvedPanel", "meta", "doneOther"], "{count} done", {
              count: completedCount,
            }),
        toDispatchModeLabel(task.dispatchMode, text),
        toRoleLabel(state, task.roleId, text),
      ].forEach((value, index) => {
        const chip = documentRef.createElement("span");
        chip.className = index < 2 ? "forge-chip forge-chip--soft" : "forge-chip";
        chip.textContent = value;
        meta.append(chip);
      });
      header.append(titleBlock, meta);

      const modeSelect = documentRef.createElement("select");
      modeSelect.id = `forge-approved-mode-${taskKey}`;
      modeSelect.className = "forge-input";
      modeSelect.disabled = settingsLocked;
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

      const seatSelect = documentRef.createElement("select");
      seatSelect.id = `forge-approved-seat-${taskKey}`;
      seatSelect.className = "forge-input";
      seatSelect.disabled = settingsLocked;
      (["ai1", "ai2", "us1"] as const).forEach((seatId) => {
        seatSelect.append(createOption(documentRef, seatId, seatId, task.seatId));
      });

      const roleSelect = documentRef.createElement("select");
      roleSelect.id = `forge-approved-role-${taskKey}`;
      roleSelect.className = "forge-input";
      roleSelect.disabled = settingsLocked;
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

      const compareSeatSelect = documentRef.createElement("select");
      compareSeatSelect.id = `forge-approved-compare-seat-${taskKey}`;
      compareSeatSelect.className = "forge-input";
      compareSeatSelect.disabled = settingsLocked;
      compareSeatSelect.append(
        createOption(documentRef, "", text(["workbench", "common", "none"], "none"), null)
      );
      (["ai1", "ai2", "us1"] as const).forEach((seatId) => {
        compareSeatSelect.append(
          createOption(documentRef, seatId, seatId, task.compareSeatIds[0] ?? null)
        );
      });

      const personaSelect = documentRef.createElement("select");
      personaSelect.id = `forge-approved-persona-${taskKey}`;
      personaSelect.className = "forge-input";
      personaSelect.disabled = settingsLocked;
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

      const controls = documentRef.createElement("div");
      controls.className = "forge-form-grid forge-form-grid--approved";
      const capsuleSummary = createTextarea(
        documentRef,
        task.contextCapsule?.summary ?? "",
        "Optional task summary",
        settingsLocked
      );
      capsuleSummary.id = `forge-approved-capsule-summary-${taskKey}`;
      const capsuleModules = createTextarea(
        documentRef,
        (task.contextCapsule?.relevantModules ?? []).join("\n"),
        "One relevant module per line",
        settingsLocked
      );
      capsuleModules.id = `forge-approved-capsule-modules-${taskKey}`;
      const capsuleConstraints = createTextarea(
        documentRef,
        (task.contextCapsule?.constraints ?? []).join("\n"),
        "One task constraint per line",
        settingsLocked
      );
      capsuleConstraints.id = `forge-approved-capsule-constraints-${taskKey}`;
      controls.append(
        createField(
          documentRef,
          text(["workbench", "approvedPanel", "fields", "mode"], "Mode"),
          modeSelect
        ),
        createField(
          documentRef,
          text(["workbench", "approvedPanel", "fields", "seat"], "Seat"),
          seatSelect
        ),
        createField(
          documentRef,
          text(["workbench", "approvedPanel", "fields", "role"], "Role"),
          roleSelect
        ),
        createField(
          documentRef,
          text(["workbench", "approvedPanel", "fields", "compareSeat"], "Compare seat"),
          compareSeatSelect
        ),
        createField(
          documentRef,
          text(["workbench", "approvedPanel", "fields", "persona"], "Persona"),
          personaSelect
        )
      );
      if (options.advancedCapsulesOpen) {
        controls.append(
          createField(
            documentRef,
            text(["workbench", "approvedPanel", "fields", "capsuleSummary"], "Capsule summary"),
            capsuleSummary
          ),
          createField(
            documentRef,
            text(["workbench", "approvedPanel", "fields", "capsuleModules"], "Capsule modules"),
            capsuleModules
          ),
          createField(
            documentRef,
            text(
              ["workbench", "approvedPanel", "fields", "capsuleConstraints"],
              "Capsule constraints"
            ),
            capsuleConstraints
          )
        );
      }

      const capsuleHint = documentRef.createElement("p");
      capsuleHint.className = "forge-panel__hint";
      capsuleHint.textContent = text(
        [
          "workbench",
          "approvedPanel",
          "capsuleHint",
          options.advancedCapsulesOpen ? "open" : "closed",
        ],
        options.advancedCapsulesOpen
          ? "Advanced capsule is session-local prompt context. It supplements preflight for this task only and is not exported."
          : "Advanced capsule is hidden by default. Open it only when a task needs extra prompt context."
      );

      const actionRail = documentRef.createElement("div");
      actionRail.className = "forge-actions";
      if (options.flowState === "APPROVED") {
        actionRail.append(
          createButton(
            documentRef,
            text(
              ["workbench", "approvedPanel", "actions", "saveDispatchSettings"],
              "Save dispatch settings"
            ),
            {
              datasetKey: "forgeSaveApprovedTask",
              datasetValue: task.id,
              disabled: taskAssignments.some((assignment) => assignment.status !== "queued"),
            }
          )
        );
        if (options.advancedCapsulesOpen) {
          actionRail.append(
            createButton(
              documentRef,
              text(["workbench", "approvedPanel", "actions", "saveCapsule"], "Save capsule"),
              {
                datasetKey: "forgeSaveContextCapsule",
                datasetValue: task.id,
                disabled: taskAssignments.some((assignment) => assignment.status !== "queued"),
              }
            )
          );
        }
      }

      card.append(header, controls, capsuleHint, actionRail);
      cards.append(card);
    });
    body.append(cards);
  }

  return createForgePanel(documentRef, {
    panelId: "approved",
    title: text(["workbench", "panels", "approved"], "Dispatch Plan"),
    body,
  });
}
