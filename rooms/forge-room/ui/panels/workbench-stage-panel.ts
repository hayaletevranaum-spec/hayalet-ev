import type {
  ForgeOperatorEquipmentRecord,
  ForgeOperatorSkillRecord,
  ForgeSessionContextSelection,
} from "../../shared/types/index.js";
import type {
  ForgeUiState,
  ForgeWorkbenchStageId,
  ForgeWorkbenchUiFlowState,
} from "../../shared/ui/state.js";
import { createForgePanel } from "./panel-shell.js";

type ForgeTextFn = (
  path: string[],
  fallback: string,
  params?: Record<string, number | string>
) => string;

type ForgeGoalDraftView = {
  brief: string;
  constraints: string[];
  summary: string;
  targetRoomId: string;
};

type ForgeRunOverrideDraftView = {
  architectSeatId: "ai1" | "ai2";
  enableRovoPreAnalysis: boolean;
  mode?: string;
  notes: string;
  riskTolerance?: string;
  temporaryConditions: string[];
};

type ForgeStageDescriptor = {
  canOpen: boolean;
  complete: boolean;
  id: ForgeWorkbenchStageId;
  title: string;
};

type ForgeStageSplitPanelDescriptor = {
  body: HTMLElement;
  title: string;
};

export const FORGE_NEW_SESSION_PICKER_VALUE = "__forge-new-session__";

const FORGE_STAGE_ORDER: ForgeWorkbenchStageId[] = ["session", "preflight", "tracking", "draft"];

function getAvatarMimeType(filePath: string): string {
  const normalizedPath = filePath.trim().toLowerCase();
  if (normalizedPath.endsWith(".jpg") || normalizedPath.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (normalizedPath.endsWith(".gif")) {
    return "image/gif";
  }
  if (normalizedPath.endsWith(".svg")) {
    return "image/svg+xml";
  }
  if (normalizedPath.endsWith(".webp")) {
    return "image/webp";
  }
  return "image/png";
}

function isBrowserLoadableAvatarSource(value: string): boolean {
  return (
    value.startsWith("blob:") ||
    value.startsWith("data:") ||
    value.startsWith("file://") ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("/")
  );
}

function applyIdentityAvatarSource(
  image: HTMLImageElement,
  avatar: string,
  onFailure: () => void
): void {
  const normalizedAvatar = avatar.trim();
  if (normalizedAvatar === "") {
    onFailure();
    return;
  }

  if (isBrowserLoadableAvatarSource(normalizedAvatar)) {
    image.src = normalizedAvatar;
    return;
  }

  const readFile = window.electronAPI?.["readFile"] as
    ((filePath: string) => Promise<string | null>) | undefined;
  if (typeof readFile !== "function") {
    image.src = normalizedAvatar;
    return;
  }

  // NOTE: Forge runs inside a file:// room webview, so app-relative avatar paths
  // need the Electron bridge before the browser can render them.
  void readFile(normalizedAvatar)
    .then((encoded: string | null) => {
      if (typeof encoded !== "string" || encoded.trim() === "") {
        onFailure();
        return;
      }

      image.src = `data:${getAvatarMimeType(normalizedAvatar)};base64,${encoded}`;
    })
    .catch(() => {
      onFailure();
    });
}

function createField(
  documentRef: Document,
  labelText: string,
  control: HTMLElement,
  options?: {
    hint?: string | null;
  }
): HTMLElement {
  const wrapper = documentRef.createElement("label");
  wrapper.className = "forge-field";

  const label = documentRef.createElement("span");
  label.className = "forge-field__label";
  label.textContent = labelText;
  wrapper.append(label, control);

  if (options?.hint) {
    const hint = documentRef.createElement("span");
    hint.className = "forge-field__hint";
    hint.textContent = options.hint;
    wrapper.append(hint);
  }

  return wrapper;
}

function createButton(
  documentRef: Document,
  label: string,
  action: string,
  options: {
    actionValue?: string;
    disabled?: boolean;
    primary?: boolean;
  } = {}
): HTMLButtonElement {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = options.primary
    ? "forge-button forge-button--primary"
    : "forge-button forge-button--secondary";
  button.dataset["forgeAction"] = action;
  if (options.actionValue) {
    button.dataset["forgeActionValue"] = options.actionValue;
  }
  button.disabled = options.disabled === true;
  button.textContent = label;
  return button;
}

function createOption(
  documentRef: Document,
  value: string,
  label: string,
  selectedValue: string
): HTMLOptionElement {
  const option = documentRef.createElement("option");
  option.value = value;
  option.textContent = label;
  option.selected = selectedValue === value;
  return option;
}

function createMetaPill(documentRef: Document, label: string, value: string): HTMLElement {
  const pill = documentRef.createElement("div");
  pill.className = "forge-meta-pill";
  const copy = documentRef.createElement("span");
  copy.className = "forge-meta-pill__label";
  copy.textContent = label;
  const strong = documentRef.createElement("strong");
  strong.className = "forge-meta-pill__value";
  strong.textContent = value;
  pill.append(copy, strong);
  return pill;
}

function createContextChip(
  documentRef: Document,
  params: {
    detail: string;
    disabled?: boolean;
    key: string;
    label: string;
    section: "equipment" | "general" | "skill";
    selected: boolean;
  }
): HTMLElement {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = "forge-context-chip";
  button.dataset["forgeContextChip"] = "true";
  button.dataset["forgeContextKey"] = params.key;
  button.dataset["forgeContextSection"] = params.section;
  button.dataset["selected"] = params.selected ? "true" : "false";
  button.disabled = params.disabled === true;

  const label = documentRef.createElement("span");
  label.className = "forge-context-chip__label";
  label.textContent = params.label;
  const detail = documentRef.createElement("span");
  detail.className = "forge-context-chip__detail";
  detail.textContent = params.detail;
  button.append(label, detail);
  return button;
}

function createContextGroup(
  documentRef: Document,
  title: string,
  chips: HTMLElement[],
  emptyText: string
): HTMLElement {
  const group = documentRef.createElement("section");
  group.className = "forge-context-group";
  const heading = documentRef.createElement("h4");
  heading.className = "forge-context-group__title";
  heading.textContent = title;
  const list = documentRef.createElement("div");
  list.className = "forge-context-group__list forge-context-group__list--chips";
  if (chips.length > 0) {
    list.append(...chips);
  } else {
    const emptyWrap = documentRef.createElement("div");
    emptyWrap.className = "forge-context-group__empty";
    const empty = documentRef.createElement("p");
    empty.className = "forge-field__hint";
    empty.textContent = emptyText;
    emptyWrap.append(empty);
    list.append(emptyWrap);
  }
  group.append(heading, list);
  return group;
}

function renderNotesBlock(
  documentRef: Document,
  text: ForgeTextFn,
  notes: string,
  options: {
    disabled?: boolean;
    hideLabel?: boolean;
  } = {}
): HTMLElement {
  const notesInput = documentRef.createElement("textarea");
  notesInput.id = "forge-run-override-notes";
  notesInput.className = "forge-textarea forge-textarea--compact";
  notesInput.value = notes;
  notesInput.dataset["forgeRunOverrideField"] = "notes";
  notesInput.disabled = options.disabled === true;
  notesInput.placeholder = text(
    ["workbench", "goalPanel", "runOverrides", "notesPlaceholderLong"],
    "Optional run note for this session"
  );
  if (options.hideLabel === true) {
    const wrapper = documentRef.createElement("div");
    wrapper.className = "forge-preflight-agent__control";
    wrapper.append(notesInput);
    return wrapper;
  }
  return createField(
    documentRef,
    text(["workbench", "goalPanel", "runOverrides", "notes"], "Run notes"),
    notesInput
  );
}

function countSelectedSessionContext(selection: ForgeSessionContextSelection): number {
  const preferenceKeys = selection.preferenceKeys;
  return selection.skillKeys.length + selection.equipmentKeys.length + preferenceKeys.length;
}

function renderSkillValue(text: ForgeTextFn, value: ForgeOperatorSkillRecord["level"]): string {
  return text(
    ["workbench", "goalPanel", "operatorProfile", "skillLevels", value],
    value.replace(/_/g, " ")
  );
}

function renderEquipmentValue(
  text: ForgeTextFn,
  value: ForgeOperatorEquipmentRecord["status"]
): string {
  return text(
    ["workbench", "goalPanel", "operatorProfile", "equipmentStatus", value],
    value.replace(/_/g, " ")
  );
}

function renderModeValue(text: ForgeTextFn, value: string): string {
  return text(
    ["workbench", "goalPanel", "operatorProfile", "modeValues", value],
    value.replace(/_/g, " ")
  );
}

function renderRiskValue(text: ForgeTextFn, value: string): string {
  return text(
    ["workbench", "goalPanel", "operatorProfile", "riskValues", value],
    value.replace(/_/g, " ")
  );
}

function createBlockHeading(documentRef: Document, title: string): HTMLElement {
  const heading = documentRef.createElement("h4");
  heading.className = "forge-context-group__title";
  heading.textContent = title;
  return heading;
}

function createIdentityAvatar(
  documentRef: Document,
  nickname: string,
  avatar: string | null
): HTMLElement {
  const createEmptyAvatar = () => {
    const placeholder = documentRef.createElement("div");
    placeholder.className = "forge-profile-identity__avatar forge-profile-identity__avatar--empty";
    if (typeof placeholder.setAttribute === "function") {
      placeholder.setAttribute("aria-label", nickname);
    } else {
      (placeholder as HTMLElement & { ariaLabel?: string }).ariaLabel = nickname;
    }
    return placeholder;
  };

  if (!avatar || avatar.trim() === "") {
    return createEmptyAvatar();
  }

  const image = documentRef.createElement("img");
  image.className = "forge-profile-identity__avatar";
  image.alt = nickname;
  const replaceWithEmptyAvatar = () => {
    const parent = image.parentElement;
    if (parent) {
      parent.replaceChild(createEmptyAvatar(), image);
    }
  };
  image.addEventListener("error", replaceWithEmptyAvatar);
  applyIdentityAvatarSource(image, avatar, replaceWithEmptyAvatar);
  return image;
}

function readDraftArchitectStatusLabel(
  text: ForgeTextFn,
  options: {
    assigned: boolean;
    connected: boolean;
    selected: boolean;
  }
): string {
  const parts = [
    options.selected
      ? text(["workbench", "goalPanel", "runOverrides", "selected"], "selected")
      : null,
    options.assigned
      ? options.connected
        ? text(["workbench", "goalPanel", "runOverrides", "connected"], "connected")
        : text(["workbench", "goalPanel", "runOverrides", "disconnected"], "disconnected")
      : text(["workbench", "goalPanel", "runOverrides", "unassigned"], "no account"),
  ].filter((entry): entry is string => typeof entry === "string");
  return parts.join(" / ");
}

function buildDraftArchitectBlock(
  documentRef: Document,
  state: ForgeUiState,
  text: ForgeTextFn,
  runOverrideDraft: ForgeRunOverrideDraftView
): HTMLElement {
  const draftArchitectBlock = documentRef.createElement("section");
  draftArchitectBlock.className = "forge-goal-block forge-goal-block--compact";
  draftArchitectBlock.append(
    createBlockHeading(
      documentRef,
      text(["workbench", "goalPanel", "runOverrides", "architectTitle"], "Draft architect")
    )
  );
  const draftArchitectSelect = documentRef.createElement("select");
  draftArchitectSelect.id = "forge-run-override-architect-seat";
  draftArchitectSelect.className = "forge-select";
  (["ai1", "ai2"] as const).forEach((seatId) => {
    const seat = state.context.draftArchitectSeats[seatId];
    draftArchitectSelect.append(
      createOption(
        documentRef,
        seatId,
        `${seatId.toUpperCase()} - ${seat.nickname}`,
        runOverrideDraft.architectSeatId
      )
    );
  });
  draftArchitectSelect.value = runOverrideDraft.architectSeatId;
  draftArchitectBlock.append(
    createField(
      documentRef,
      text(["workbench", "goalPanel", "runOverrides", "architectField"], "Draft lane"),
      draftArchitectSelect,
      {
        hint: text(
          ["workbench", "goalPanel", "runOverrides", "architectHint"],
          "Choose which AI receives the first draft breakdown after preflight."
        ),
      }
    )
  );
  const draftArchitectList = documentRef.createElement("div");
  draftArchitectList.className = "forge-context-group__list";
  (["ai1", "ai2"] as const).forEach((seatId) => {
    const seat = state.context.draftArchitectSeats[seatId];
    const selected = runOverrideDraft.architectSeatId === seatId;
    const row = documentRef.createElement("div");
    row.className = "forge-profile-identity";
    const copy = documentRef.createElement("div");
    copy.className = "forge-profile-identity__copy";
    const name = documentRef.createElement("strong");
    name.className = "forge-profile-identity__name";
    name.textContent = `${seatId.toUpperCase()} - ${seat.nickname}`;
    const detail = documentRef.createElement("span");
    detail.className = "forge-field__hint";
    detail.textContent = readDraftArchitectStatusLabel(text, {
      assigned: seat.assigned,
      connected: seat.connected,
      selected,
    });
    copy.append(name, detail);
    row.append(createIdentityAvatar(documentRef, seat.nickname, seat.avatar), copy);
    draftArchitectList.append(row);
  });
  draftArchitectBlock.append(draftArchitectList);
  return draftArchitectBlock;
}

function renderCatalogLabel(text: ForgeTextFn, value: string, fallback: string): string {
  const translationKey = value
    .split(/[^a-z0-9]+/i)
    .filter((segment) => segment !== "")
    .map((segment) => segment.toLowerCase())
    .map((segment, index) =>
      index === 0 ? segment : `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`
    )
    .join("");
  return text(["workbench", "goalPanel", "catalog", "items", translationKey], fallback);
}

function createStageDescriptorMap(
  text: ForgeTextFn,
  state: ForgeUiState,
  options: {
    goalDraft: ForgeGoalDraftView;
  }
): Record<ForgeWorkbenchStageId, ForgeStageDescriptor> {
  const goalComplete =
    options.goalDraft.summary.trim() !== "" &&
    options.goalDraft.brief.trim() !== "" &&
    options.goalDraft.constraints.length > 0 &&
    options.goalDraft.targetRoomId.trim() !== "";
  const preflightComplete = goalComplete;
  const draftArtifactsAvailable =
    state.snapshot.draftTasks.length > 0 ||
    state.snapshot.approvedTasks.length > 0 ||
    state.snapshot.assignments.length > 0 ||
    state.snapshot.responses.length > 0 ||
    state.snapshot.syntheses.length > 0 ||
    state.snapshot.exports.length > 0;
  const trackingComplete = draftArtifactsAvailable;

  return {
    session: {
      canOpen: true,
      complete: goalComplete,
      id: "session",
      title: text(["workbench", "stageTower", "stages", "session", "title"], "Registration"),
    },
    preflight: {
      canOpen: goalComplete,
      complete: preflightComplete,
      id: "preflight",
      title: text(["workbench", "stageTower", "stages", "preflight", "title"], "Preflight"),
    },
    tracking: {
      canOpen: preflightComplete,
      complete: trackingComplete,
      id: "tracking",
      title: text(["workbench", "stageTower", "stages", "tracking", "title"], "Process tracking"),
    },
    draft: {
      canOpen: trackingComplete,
      complete: state.snapshot.approvedTasks.length > 0,
      id: "draft",
      title: text(["workbench", "stageTower", "stages", "draft", "title"], "Draft stage"),
    },
  };
}

function resolveActiveStageId(
  requestedStageId: ForgeWorkbenchStageId,
  stageMap: Record<ForgeWorkbenchStageId, ForgeStageDescriptor>
): ForgeWorkbenchStageId {
  if (stageMap[requestedStageId].canOpen === true) {
    return requestedStageId;
  }

  for (let index = FORGE_STAGE_ORDER.length - 1; index >= 0; index -= 1) {
    const stageId = FORGE_STAGE_ORDER[index];
    if (stageId && stageMap[stageId].canOpen === true) {
      return stageId;
    }
  }

  return "session";
}

function createStageHeader(
  documentRef: Document,
  text: ForgeTextFn,
  stage: ForgeStageDescriptor,
  active: boolean
): HTMLElement {
  const header = documentRef.createElement("button");
  header.type = "button";
  header.className = "forge-stage__header";
  header.disabled = !stage.canOpen;
  if (stage.canOpen) {
    header.dataset["forgeAction"] = "open-stage";
    header.dataset["forgeActionValue"] = stage.id;
  }

  const copy = documentRef.createElement("div");
  copy.className = "forge-stage__header-copy";
  const title = documentRef.createElement("strong");
  title.className = "forge-stage__title";
  title.textContent = stage.title;
  copy.append(title);

  const badge = documentRef.createElement("span");
  badge.className = "forge-stage__badge";
  badge.dataset["forgeStageBadge"] = stage.id;
  badge.textContent = active
    ? text(["workbench", "stageTower", "status", "active"], "Active")
    : stage.complete
      ? text(["workbench", "stageTower", "status", "complete"], "Complete")
      : stage.canOpen
        ? text(["workbench", "stageTower", "status", "available"], "Ready")
        : text(["workbench", "stageTower", "status", "locked"], "Locked");

  header.append(copy, badge);
  return header;
}

function createStageFooter(
  documentRef: Document,
  text: ForgeTextFn,
  options: {
    allowNext?: boolean;
    complete: boolean;
    nextStageId: ForgeWorkbenchStageId | null;
    previousStageId: ForgeWorkbenchStageId | null;
  }
): HTMLElement {
  const footer = documentRef.createElement("footer");
  footer.className = "forge-stage__footer";

  const left = documentRef.createElement("div");
  left.className = "forge-actions";
  left.append(
    createButton(
      documentRef,
      text(["workbench", "stageTower", "previous"], "Previous"),
      "open-stage",
      {
        actionValue: options.previousStageId ?? "",
        disabled: options.previousStageId === null,
      }
    )
  );

  const right = documentRef.createElement("div");
  right.className = "forge-actions";
  if (options.nextStageId) {
    right.append(
      createButton(documentRef, text(["workbench", "stageTower", "next"], "Next"), "open-stage", {
        actionValue: options.nextStageId,
        disabled: options.allowNext === true ? false : !options.complete,
        primary: true,
      })
    );
  }

  footer.append(left, right);
  return footer;
}

function buildSessionStageBody(
  documentRef: Document,
  state: ForgeUiState,
  text: ForgeTextFn,
  options: {
    goalDraft: ForgeGoalDraftView;
    selectedSessionId: string | null;
  }
): HTMLElement {
  const body = documentRef.createElement("div");
  body.className = "forge-stage__body-scroll";

  const picker = documentRef.createElement("select");
  picker.id = "forge-session-picker";
  picker.className = "forge-input";
  picker.append(
    createOption(
      documentRef,
      FORGE_NEW_SESSION_PICKER_VALUE,
      text(["workbench", "goalPanel", "sessionManager", "newSession"], "New session"),
      options.selectedSessionId ?? FORGE_NEW_SESSION_PICKER_VALUE
    ),
    ...state.snapshot.sessionList.map((session) =>
      createOption(documentRef, session.id, session.title, options.selectedSessionId ?? "")
    )
  );
  const pickerRow = documentRef.createElement("div");
  pickerRow.className = "forge-inline-editor forge-inline-editor--row";
  pickerRow.append(
    picker,
    createButton(
      documentRef,
      text(["workbench", "goalPanel", "sessionManager", "deleteSession"], "Delete"),
      "delete-selected-session",
      {
        disabled:
          options.selectedSessionId === null ||
          options.selectedSessionId === FORGE_NEW_SESSION_PICKER_VALUE,
      }
    )
  );
  body.append(
    createField(
      documentRef,
      text(["workbench", "stageTower", "savedSessions"], "Saved sessions"),
      pickerRow
    )
  );

  const goalInput = documentRef.createElement("input");
  goalInput.id = "forge-goal-summary";
  goalInput.className = "forge-input forge-input--goal";
  goalInput.value = options.goalDraft.summary;
  goalInput.placeholder = text(["workbench", "goalPanel", "placeholders", "goal"], "Goal");
  goalInput.dataset["forgeGoalField"] = "summary";

  const briefInput = documentRef.createElement("textarea");
  briefInput.id = "forge-goal-brief";
  briefInput.className = "forge-textarea forge-textarea--compact";
  briefInput.value = options.goalDraft.brief;
  briefInput.placeholder = text(["workbench", "goalPanel", "placeholders", "brief"], "Brief");
  briefInput.dataset["forgeGoalField"] = "brief";

  const constraintsInput = documentRef.createElement("textarea");
  constraintsInput.id = "forge-goal-constraints";
  constraintsInput.className = briefInput.className;
  constraintsInput.value = options.goalDraft.constraints.join("\n");
  constraintsInput.placeholder = text(
    ["workbench", "goalPanel", "placeholders", "constraints"],
    "One constraint per line"
  );
  constraintsInput.dataset["forgeGoalField"] = "constraints";

  const targetRoomInput = documentRef.createElement("input");
  targetRoomInput.id = "forge-goal-target-room";
  targetRoomInput.className = "forge-input";
  targetRoomInput.value = options.goalDraft.targetRoomId;
  targetRoomInput.placeholder = text(
    ["workbench", "goalPanel", "placeholders", "targetRoom"],
    "target-room-id"
  );
  targetRoomInput.dataset["forgeGoalField"] = "targetRoomId";

  const goalDetails = documentRef.createElement("div");
  goalDetails.className = "forge-inline-editor";
  goalDetails.append(
    createField(documentRef, text(["workbench", "goalPanel", "fields", "goal"], "Goal"), goalInput),
    createField(
      documentRef,
      text(["workbench", "goalPanel", "fields", "brief"], "Brief"),
      briefInput
    ),
    createField(
      documentRef,
      text(["workbench", "goalPanel", "fields", "constraints"], "Constraints"),
      constraintsInput
    ),
    createField(
      documentRef,
      text(["workbench", "goalPanel", "fields", "targetRoom"], "Target room"),
      targetRoomInput
    )
  );
  body.append(goalDetails);

  return body;
}

function buildOperatorStageBody(
  documentRef: Document,
  state: ForgeUiState,
  text: ForgeTextFn,
  options: {
    runOverrideDraft: ForgeRunOverrideDraftView;
    sessionContextSelection: ForgeSessionContextSelection;
  }
): HTMLElement {
  const body = documentRef.createElement("div");
  body.className = "forge-stage__body-scroll";

  const operatorProfile = state.snapshot.operatorProfile;
  const selectedContextCount = countSelectedSessionContext(options.sessionContextSelection);

  const operatorSummary = documentRef.createElement("div");
  operatorSummary.className = "forge-goal-meta";
  operatorSummary.append(
    createMetaPill(
      documentRef,
      text(["workbench", "goalPanel", "catalog", "groups", "skills"], "Skills"),
      String(operatorProfile.skills.length)
    ),
    createMetaPill(
      documentRef,
      text(["workbench", "goalPanel", "catalog", "groups", "equipment"], "Equipment"),
      String(operatorProfile.equipment.length)
    ),
    createMetaPill(
      documentRef,
      text(["workbench", "goalPanel", "operatorProfile", "selectedLabel"], "Selected"),
      String(selectedContextCount)
    )
  );
  body.append(operatorSummary);

  const contextGroups = documentRef.createElement("div");
  contextGroups.className = "forge-context-groups forge-context-groups--scroll";
  contextGroups.append(
    createContextGroup(
      documentRef,
      text(["workbench", "goalPanel", "catalog", "groups", "skills"], "Skills"),
      operatorProfile.skills.map((record) =>
        createContextChip(documentRef, {
          disabled: false,
          section: "skill",
          key: record.skillKey,
          label: renderCatalogLabel(text, record.skillKey, record.label),
          detail: renderSkillValue(text, record.level),
          selected: options.sessionContextSelection.skillKeys.includes(record.skillKey),
        })
      ),
      text(
        ["workbench", "goalPanel", "sessionContext", "emptySkills"],
        "No saved skills yet. Use Operator Profile from the top bar."
      )
    ),
    createContextGroup(
      documentRef,
      text(["workbench", "goalPanel", "catalog", "groups", "equipment"], "Equipment"),
      operatorProfile.equipment.map((record) =>
        createContextChip(documentRef, {
          disabled: false,
          section: "equipment",
          key: record.equipmentKey,
          label: renderCatalogLabel(text, record.equipmentKey, record.label),
          detail: record.brandModel
            ? `${renderEquipmentValue(text, record.status)} • ${record.brandModel}`
            : renderEquipmentValue(text, record.status),
          selected: options.sessionContextSelection.equipmentKeys.includes(record.equipmentKey),
        })
      ),
      text(
        ["workbench", "goalPanel", "sessionContext", "emptyEquipment"],
        "No saved equipment yet. Use Operator Profile from the top bar."
      )
    )
  );
  body.append(contextGroups);

  const modeSelect = documentRef.createElement("select");
  modeSelect.id = "forge-run-override-mode";
  modeSelect.className = "forge-input";
  modeSelect.append(
    createOption(
      documentRef,
      "",
      text(["workbench", "common", "none"], "none"),
      options.runOverrideDraft.mode || ""
    ),
    createOption(
      documentRef,
      "learn_first",
      renderModeValue(text, "learn_first"),
      options.runOverrideDraft.mode || ""
    ),
    createOption(
      documentRef,
      "result_first",
      renderModeValue(text, "result_first"),
      options.runOverrideDraft.mode || ""
    )
  );

  const riskSelect = documentRef.createElement("select");
  riskSelect.id = "forge-run-override-risk";
  riskSelect.className = "forge-input";
  riskSelect.append(
    createOption(
      documentRef,
      "",
      text(["workbench", "common", "none"], "none"),
      options.runOverrideDraft.riskTolerance || ""
    ),
    createOption(
      documentRef,
      "low",
      renderRiskValue(text, "low"),
      options.runOverrideDraft.riskTolerance || ""
    ),
    createOption(
      documentRef,
      "medium",
      renderRiskValue(text, "medium"),
      options.runOverrideDraft.riskTolerance || ""
    ),
    createOption(
      documentRef,
      "high",
      renderRiskValue(text, "high"),
      options.runOverrideDraft.riskTolerance || ""
    )
  );

  const modeRiskGrid = documentRef.createElement("div");
  modeRiskGrid.className = "forge-form-grid forge-form-grid--compact";
  modeRiskGrid.append(
    createField(
      documentRef,
      text(["workbench", "goalPanel", "runOverrides", "mode"], "Mode"),
      modeSelect
    ),
    createField(
      documentRef,
      text(["workbench", "goalPanel", "runOverrides", "risk"], "Risk tolerance"),
      riskSelect
    )
  );
  body.append(modeRiskGrid);

  return body;
}

function createStageSplitPanel(
  documentRef: Document,
  descriptor: ForgeStageSplitPanelDescriptor
): HTMLElement {
  const panel = documentRef.createElement("section");
  panel.className = "forge-stage-split-panel";
  const header = documentRef.createElement("div");
  header.className = "forge-stage-split-panel__header";
  const title = documentRef.createElement("strong");
  title.className = "forge-stage-split-panel__title";
  title.textContent = descriptor.title;
  header.append(title);
  descriptor.body.classList.add("forge-stage-split-panel__body");
  panel.append(header, descriptor.body);
  return panel;
}

function buildRegistrationStageBody(
  documentRef: Document,
  state: ForgeUiState,
  text: ForgeTextFn,
  options: {
    goalDraft: ForgeGoalDraftView;
    runOverrideDraft: ForgeRunOverrideDraftView;
    selectedSessionId: string | null;
    sessionContextSelection: ForgeSessionContextSelection;
  }
): HTMLElement {
  const body = documentRef.createElement("div");
  body.className = "forge-stage__body-scroll forge-stage__body-scroll--registration";

  const splitGrid = documentRef.createElement("div");
  splitGrid.className = "forge-stage-registration-grid";
  splitGrid.append(
    createStageSplitPanel(documentRef, {
      title: text(["workbench", "stageTower", "registrationPanels", "session"], "Session + goal"),
      body: buildSessionStageBody(documentRef, state, text, {
        goalDraft: options.goalDraft,
        selectedSessionId: options.selectedSessionId,
      }),
    }),
    createStageSplitPanel(documentRef, {
      title: text(["workbench", "stageTower", "registrationPanels", "operator"], "Operator"),
      body: buildOperatorStageBody(documentRef, state, text, {
        runOverrideDraft: options.runOverrideDraft,
        sessionContextSelection: options.sessionContextSelection,
      }),
    })
  );

  body.append(splitGrid);
  return body;
}

function buildPreflightStageBody(
  documentRef: Document,
  state: ForgeUiState,
  text: ForgeTextFn,
  options: {
    runConditionComposerValue: string;
    runOverrideDraft: ForgeRunOverrideDraftView;
  }
): HTMLElement {
  const body = documentRef.createElement("div");
  body.className = "forge-stage__body-scroll";
  const preflight = state.snapshot.preflight;
  const assistantUnavailable = state.context.assistantAssigned !== true;
  const assistantRecovering =
    state.context.assistantAssigned === true && state.context.assistantConnected !== true;
  const localizedOfflineMessage = text(
    ["workbench", "goalPanel", "preflight", "aiOffline"],
    "AI0 is offline"
  );
  const localizedReconnectMessage = text(
    ["workbench", "goalPanel", "preflight", "aiReconnect"],
    "AI0 will reconnect during preflight."
  );
  const hasCompletedRun = preflight.ranAt !== null || preflight.bundle !== null;
  const canClearPreflight = hasCompletedRun && preflight.status !== "running";

  const normalizeAssistantStatusMessage = (value: string): string => {
    const trimmed = value.trim();
    if (trimmed === "" || trimmed.toLowerCase().includes("ai0") !== true) {
      return trimmed;
    }
    if (assistantUnavailable) {
      return localizedOfflineMessage;
    }
    if (assistantRecovering) {
      return localizedReconnectMessage;
    }
    return trimmed;
  };

  const agentBlock = documentRef.createElement("section");
  agentBlock.className = "forge-goal-block forge-goal-block--compact forge-preflight-agent";
  const agentBar = documentRef.createElement("div");
  agentBar.className = "forge-preflight-agent__bar";
  const identity = documentRef.createElement("div");
  identity.className = "forge-profile-identity";
  const identityCopy = documentRef.createElement("div");
  identityCopy.className = "forge-profile-identity__copy";
  const identityName = documentRef.createElement("strong");
  identityName.className = "forge-profile-identity__name";
  identityName.textContent = state.context.assistantNickname;
  identityCopy.append(identityName);
  identity.classList.add("forge-preflight-agent__slot");
  identity.append(
    createIdentityAvatar(
      documentRef,
      state.context.assistantNickname,
      state.context.assistantAvatar
    ),
    identityCopy
  );
  const notesField = renderNotesBlock(documentRef, text, options.runOverrideDraft.notes, {
    hideLabel: true,
  });
  notesField.classList.add("forge-preflight-agent__notes", "forge-preflight-agent__slot");
  const conditionField = documentRef.createElement("div");
  conditionField.className = "forge-preflight-agent__condition forge-preflight-agent__slot";
  const preflightActions = documentRef.createElement("div");
  preflightActions.className =
    "forge-actions forge-preflight-agent__actions forge-preflight-agent__slot";
  preflightActions.append(
    createButton(
      documentRef,
      hasCompletedRun
        ? text(["workbench", "goalPanel", "preflight", "updateAction"], "Refresh")
        : text(["workbench", "goalPanel", "preflight", "action"], "Run Preflight"),
      "run-preflight",
      {
        disabled: assistantUnavailable,
        primary: true,
      }
    ),
    createButton(
      documentRef,
      text(["workbench", "goalPanel", "preflight", "clearAction"], "Clear"),
      "clear-preflight",
      {
        disabled: !canClearPreflight,
      }
    )
  );
  const conditionsRail = documentRef.createElement("div");
  conditionsRail.className = "forge-chip-row forge-preflight-agent__conditions";
  options.runOverrideDraft.temporaryConditions.forEach((condition) => {
    const chip = documentRef.createElement("button");
    chip.type = "button";
    chip.className = "forge-condition-chip";
    chip.dataset["forgeRemoveRunCondition"] = condition;
    chip.append(
      Object.assign(documentRef.createElement("span"), {
        textContent: condition,
      }),
      Object.assign(documentRef.createElement("span"), {
        className: "forge-condition-chip__remove",
        textContent: "x",
      })
    );
    conditionsRail.append(chip);
  });
  const composer = documentRef.createElement("div");
  composer.className =
    "forge-inline-editor forge-inline-editor--row forge-preflight-agent__condition-editor";
  const input = documentRef.createElement("input");
  input.id = "forge-run-override-condition-input";
  input.className = "forge-input";
  input.value = options.runConditionComposerValue;
  input.placeholder = text(
    ["workbench", "goalPanel", "runOverrides", "notesPlaceholder"],
    "Temporary condition for this run"
  );
  composer.append(
    input,
    createButton(
      documentRef,
      text(["workbench", "goalPanel", "runOverrides", "commitCondition"], "Add"),
      "commit-run-condition"
    )
  );
  conditionField.append(composer);
  if (options.runOverrideDraft.temporaryConditions.length > 0) {
    conditionField.append(conditionsRail);
  }
  agentBar.append(identity, notesField, conditionField, preflightActions);
  agentBlock.append(agentBar);
  body.append(agentBlock);

  const resultBlock = documentRef.createElement("section");
  resultBlock.className = "forge-goal-block forge-goal-block--compact";
  resultBlock.append(
    createBlockHeading(
      documentRef,
      text(["workbench", "goalPanel", "preflight", "resultTitle"], "Preview")
    )
  );
  const resultBody = documentRef.createElement("div");
  resultBody.className = "forge-preflight-result";
  const resultStatus = documentRef.createElement("span");
  resultStatus.className =
    preflight.status === "warning"
      ? "forge-chip forge-chip--warning"
      : preflight.status === "running"
        ? "forge-chip forge-chip--accent"
        : "forge-chip forge-chip--soft";
  resultStatus.textContent = text(
    [
      "workbench",
      "goalPanel",
      "preflight",
      preflight.status === "fresh" ? "ready" : preflight.status,
    ],
    preflight.status
  );
  const resultSummary = documentRef.createElement("p");
  resultSummary.className = "forge-panel__hint";
  const preAnalysisSummary = normalizeAssistantStatusMessage(
    preflight.bundle?.rovoPreAnalysis?.summary.trim() ?? ""
  );
  const staleReason = normalizeAssistantStatusMessage(preflight.staleReason?.trim() ?? "");
  const errorMessage = normalizeAssistantStatusMessage(preflight.errorMessage?.trim() ?? "");
  const preAnalysisWarnings = (preflight.bundle?.rovoPreAnalysis?.warnings ?? []).map((warning) =>
    normalizeAssistantStatusMessage(warning)
  );
  const preAnalysisMissingInfo = (preflight.bundle?.rovoPreAnalysis?.missingInfo ?? []).map(
    (item) => item.trim()
  );
  const normalizedWarnings = preflight.warnings.map((warning) =>
    normalizeAssistantStatusMessage(warning)
  );
  const hasAssistantStatusWarning = normalizedWarnings.some(
    (warning, index) => warning !== preflight.warnings[index]?.trim()
  );
  const computedResultSummary =
    (assistantUnavailable || assistantRecovering) &&
    (preAnalysisSummary !== "" || hasAssistantStatusWarning || errorMessage !== "")
      ? preAnalysisSummary ||
        errorMessage ||
        (assistantUnavailable ? localizedOfflineMessage : localizedReconnectMessage)
      : preAnalysisSummary ||
        staleReason ||
        errorMessage ||
        (preflight.ranAt !== null
          ? text(
              ["workbench", "goalPanel", "preflight", "resultReady"],
              "Preflight context is ready."
            )
          : text(
              ["workbench", "goalPanel", "preflight", "resultIdle"],
              "No preflight result yet. Draft can still start without a preflight report."
            ));
  resultSummary.textContent =
    preflight.status === "running"
      ? text(["workbench", "goalPanel", "preflight", "resultRunning"], "Preflight is running.")
      : computedResultSummary;
  resultBody.append(resultStatus, resultSummary);
  const preflightReport = documentRef.createElement("div");
  preflightReport.className = "forge-preflight-report";
  if (preAnalysisSummary !== "" && preAnalysisSummary !== resultSummary.textContent) {
    const summarySection = documentRef.createElement("section");
    summarySection.className = "forge-preflight-report__section";
    const summaryTitle = documentRef.createElement("strong");
    summaryTitle.className = "forge-preflight-report__title";
    summaryTitle.textContent = text(
      ["workbench", "goalPanel", "preflight", "summaryTitle"],
      "Compatibility summary"
    );
    const summaryCopy = documentRef.createElement("p");
    summaryCopy.className = "forge-panel__hint";
    summaryCopy.textContent = preAnalysisSummary;
    summarySection.append(summaryTitle, summaryCopy);
    preflightReport.append(summarySection);
  }
  const visibleWarnings = Array.from(
    new Set(
      [...normalizedWarnings, ...preAnalysisWarnings].filter(
        (warning) => warning !== "" && warning !== computedResultSummary
      )
    )
  ).slice(0, 3);
  if (visibleWarnings.length > 0) {
    const warningSection = documentRef.createElement("section");
    warningSection.className = "forge-preflight-report__section";
    const warningTitle = documentRef.createElement("strong");
    warningTitle.className = "forge-preflight-report__title";
    warningTitle.textContent = text(
      ["workbench", "goalPanel", "preflight", "warningsTitle"],
      "Warnings"
    );
    const warningRail = documentRef.createElement("div");
    warningRail.className = "forge-chip-row forge-chip-row--report";
    visibleWarnings.forEach((warning) => {
      const chip = documentRef.createElement("span");
      chip.className = "forge-chip forge-chip--warning";
      chip.textContent = warning;
      warningRail.append(chip);
    });
    warningSection.append(warningTitle, warningRail);
    preflightReport.append(warningSection);
  }
  const visibleMissingInfo = Array.from(
    new Set(preAnalysisMissingInfo.filter((item) => item !== ""))
  ).slice(0, 4);
  if (visibleMissingInfo.length > 0) {
    const missingSection = documentRef.createElement("section");
    missingSection.className = "forge-preflight-report__section";
    const missingTitle = documentRef.createElement("strong");
    missingTitle.className = "forge-preflight-report__title";
    missingTitle.textContent = text(
      ["workbench", "goalPanel", "preflight", "missingInfoTitle"],
      "Missing info"
    );
    const missingList = documentRef.createElement("ul");
    missingList.className = "forge-preflight-report__list";
    visibleMissingInfo.forEach((item) => {
      const entry = documentRef.createElement("li");
      entry.textContent = item;
      missingList.append(entry);
    });
    missingSection.append(missingTitle, missingList);
    preflightReport.append(missingSection);
  }
  if (preflightReport.childElementCount > 0) {
    resultBody.append(preflightReport);
  }
  const resultMeta = documentRef.createElement("div");
  resultMeta.className = "forge-goal-meta";
  if (hasCompletedRun && state.snapshot.runSignature?.value) {
    resultMeta.append(
      createMetaPill(
        documentRef,
        text(["workbench", "goalPanel", "preflight", "signatureLabel"], "Run signature"),
        state.snapshot.runSignature.value
      )
    );
  }
  if (preflight.promptCharCount > 0) {
    resultMeta.append(
      createMetaPill(
        documentRef,
        text(["workbench", "goalPanel", "preflight", "promptSizeLabel"], "Prompt"),
        `${preflight.promptCharCount}`
      )
    );
  }
  if (resultMeta.childElementCount > 0) {
    resultBody.append(resultMeta);
  }
  resultBlock.append(resultBody);
  body.append(resultBlock);

  return body;
}

function buildTrackingStageBody(
  documentRef: Document,
  state: ForgeUiState,
  text: ForgeTextFn,
  options: {
    flowLabel: string;
    flowState: ForgeWorkbenchUiFlowState;
    runOverrideDraft: ForgeRunOverrideDraftView;
  }
): HTMLElement {
  const body = documentRef.createElement("div");
  body.className = "forge-stage__body-scroll";

  const summary = documentRef.createElement("div");
  summary.className = "forge-goal-meta";
  summary.append(
    createMetaPill(
      documentRef,
      text(["workbench", "statusBar", "requiredAction"], "Action"),
      options.flowLabel
    ),
    createMetaPill(
      documentRef,
      text(["workbench", "statusBar", "stats", "queue"], "QUEUE"),
      String(state.snapshot.coordinatorState.assignmentQueueTotal)
    ),
    createMetaPill(
      documentRef,
      text(["workbench", "statusBar", "stats", "answers"], "ANS"),
      String(state.snapshot.responses.length)
    ),
    createMetaPill(
      documentRef,
      text(["workbench", "statusBar", "stats", "decisions"], "CF"),
      String(state.snapshot.conflicts.filter((conflict) => conflict.status === "open").length)
    )
  );
  body.append(summary);

  body.append(buildDraftArchitectBlock(documentRef, state, text, options.runOverrideDraft));

  if (options.flowState === "GOAL_DEFINED") {
    const actions = documentRef.createElement("div");
    actions.className = "forge-actions";
    actions.append(
      createButton(
        documentRef,
        text(["workbench", "primaryAction", "generateDraft"], "Generate draft"),
        "generate-draft",
        { primary: true }
      )
    );
    body.append(actions);
  }

  return body;
}

function buildDraftStageBody(
  documentRef: Document,
  draftSurfacePanel: HTMLElement | null
): HTMLElement {
  const body = documentRef.createElement("div");
  body.className = "forge-stage__body-scroll";

  if (draftSurfacePanel === null) {
    return body;
  }

  draftSurfacePanel.classList.add("forge-stage-embedded-panel");
  body.append(draftSurfacePanel);
  return body;
}

export function renderWorkbenchStagePanel(
  documentRef: Document,
  state: ForgeUiState,
  text: ForgeTextFn,
  options: {
    activeStageId: ForgeWorkbenchStageId;
    draftSurfacePanel: HTMLElement | null;
    flowLabel: string;
    flowState: ForgeWorkbenchUiFlowState;
    goalDraft: ForgeGoalDraftView;
    goalDraftDirty: boolean;
    runConditionComposerValue: string;
    runOverrideDraft: ForgeRunOverrideDraftView;
    selectedSessionId: string | null;
    sessionContextDirty: boolean;
    sessionContextSelection: ForgeSessionContextSelection;
  }
): HTMLElement {
  const body = documentRef.createElement("div");
  body.className = "forge-panel__body forge-stage-tower-panel";

  const stageMap = createStageDescriptorMap(text, state, {
    goalDraft: options.goalDraft,
  });
  const activeStageId = resolveActiveStageId(options.activeStageId, stageMap);
  const activeStageIndex = FORGE_STAGE_ORDER.indexOf(activeStageId);

  const stageStack = documentRef.createElement("div");
  stageStack.className = "forge-stage-stack";

  FORGE_STAGE_ORDER.forEach((stageId) => {
    const descriptor = stageMap[stageId];
    const stage = documentRef.createElement("section");
    const stageState =
      stageId === activeStageId
        ? "active"
        : descriptor.complete
          ? "complete"
          : descriptor.canOpen
            ? "available"
            : "locked";
    stage.className = "forge-stage";
    stage.dataset["stageId"] = stageId;
    stage.dataset["state"] = stageState;
    stage.append(createStageHeader(documentRef, text, descriptor, stageId === activeStageId));

    if (stageId === activeStageId) {
      const frame = documentRef.createElement("div");
      frame.className = "forge-stage__frame";

      const stageBody =
        stageId === "session"
          ? buildRegistrationStageBody(documentRef, state, text, {
              goalDraft: options.goalDraft,
              runOverrideDraft: options.runOverrideDraft,
              selectedSessionId: options.selectedSessionId,
              sessionContextSelection: options.sessionContextSelection,
            })
          : stageId === "preflight"
            ? buildPreflightStageBody(documentRef, state, text, {
                runConditionComposerValue: options.runConditionComposerValue,
                runOverrideDraft: options.runOverrideDraft,
              })
            : stageId === "tracking"
              ? buildTrackingStageBody(documentRef, state, text, {
                  flowLabel: options.flowLabel,
                  flowState: options.flowState,
                  runOverrideDraft: options.runOverrideDraft,
                })
              : buildDraftStageBody(documentRef, options.draftSurfacePanel);
      frame.append(stageBody);

      const previousStageId =
        activeStageIndex > 0 ? (FORGE_STAGE_ORDER[activeStageIndex - 1] ?? null) : null;
      const nextStageId =
        activeStageIndex < FORGE_STAGE_ORDER.length - 1
          ? (FORGE_STAGE_ORDER[activeStageIndex + 1] ?? null)
          : null;

      frame.append(
        createStageFooter(documentRef, text, {
          allowNext: stageId === "preflight",
          complete: descriptor.complete,
          nextStageId,
          previousStageId,
        })
      );
      stage.append(frame);
    }

    stageStack.append(stage);
  });

  body.append(stageStack);

  const panel = createForgePanel(documentRef, {
    panelId: "goal",
    title: text(["workbench", "stageTower", "panelTitle"], "Forge stage flow"),
    body,
  });
  panel.dataset["forgeGoalEditable"] = "true";
  panel.dataset["forgeStagePanel"] = "true";
  panel.dataset["forgeActiveStage"] = activeStageId;
  return panel;
}
