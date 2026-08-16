import type {
  RepairAiVerbosity,
  RepairMeasurementSystem,
  RepairRiskTolerance,
  RepairSkillLevel,
  RepairToolCategory,
} from "../../shared/types/index.js";
import type { RepairUiState } from "../../shared/ui/state.js";
import { createRepairPanel } from "./panel-shell.js";
import { renderRepairSettingsPanelBody } from "./repair-settings-panel.js";

type TextFn = (path: string[], fallback: string) => string;

type OperatorProfileTabId = RepairUiState["layout"]["operatorProfileTabId"];
type OperatorTool = RepairUiState["operatorProfile"]["profile"]["bench"]["tools"][number];
type OperatorSkill = RepairUiState["operatorProfile"]["profile"]["skills"][number];

const TOOL_CATEGORY_OPTIONS: Array<{ label: string; value: RepairToolCategory }> = [
  { label: "Measurement", value: "measurement" },
  { label: "Soldering", value: "soldering" },
  { label: "Power", value: "power" },
  { label: "Vision", value: "vision" },
  { label: "Other", value: "other" },
];

const MEASUREMENT_OPTIONS: Array<{ label: string; value: RepairMeasurementSystem }> = [
  { label: "Metric", value: "metric" },
  { label: "Imperial", value: "imperial" },
];

const RISK_OPTIONS: RepairRiskTolerance[] = ["low", "medium", "high"];
const AI_OPTIONS: RepairAiVerbosity[] = ["terse", "standard", "detailed"];

export function renderOperatorProfilePanel(
  documentRef: Document,
  state: RepairUiState,
  text: TextFn
): HTMLElement {
  const body = documentRef.createElement("div");
  body.className = "repair-panel__body";

  const profile = state.operatorProfile.profile;
  const activeTab = state.layout.operatorProfileTabId;

  const tabs = documentRef.createElement("div");
  tabs.className = "repair-tabs";

  const tabItems: Array<{ id: OperatorProfileTabId; label: string }> = [
    { id: "tools", label: text(["operator", "tabs", "tools"], "Tools & Equipment") },
    { id: "skills", label: text(["operator", "tabs", "skills"], "Skills") },
    { id: "preferences", label: text(["operator", "tabs", "preferences"], "Preferences") },
    { id: "controls", label: text(["operator", "tabs", "controls"], "Repair Controls") },
  ];

  for (const tab of tabItems) {
    const tabEl = documentRef.createElement("div");
    tabEl.className = `repair-tab${tab.id === activeTab ? " repair-tab--active" : ""}`;
    tabEl.textContent = tab.label;
    tabEl.dataset["repairAction"] = "operator-profile-tab";
    tabEl.dataset["tabId"] = tab.id;
    tabs.append(tabEl);
  }

  body.append(tabs);

  if (activeTab === "tools") {
    body.append(renderToolManager(documentRef, profile.bench.tools, text));
  }

  if (activeTab === "skills") {
    body.append(renderSkillManager(documentRef, profile.skills, text));
  }

  if (activeTab === "preferences") {
    body.append(renderPreferences(documentRef, profile.preferences, text));
  }

  if (activeTab === "controls") {
    const controls = renderRepairSettingsPanelBody(documentRef, state, text);
    controls.className = `${controls.className} repair-settings-panel--embedded`;
    body.append(controls);
  }

  return createRepairPanel(documentRef, {
    panelId: "operator-profile",
    eyebrow: text(["operator", "eyebrow"], "OPERATOR PROFILE"),
    title: text(["settings", "operatorOverlayTitle"], "setup"),
    statusDot: "idle",
    collapsed: state.layout.collapsedPanels["operator-profile"],
    noPanelControls: true,
    body,
  });
}

function renderToolManager(
  documentRef: Document,
  tools: OperatorTool[],
  text: TextFn
): HTMLElement {
  const panel = documentRef.createElement("div");
  panel.className = "repair-profile-manager";

  panel.append(
    renderManagerHeader(
      documentRef,
      text(["operator", "toolsTitle"], "Your tools"),
      text(["operator", "toolsHint"], "Add the equipment you actually have on your bench.")
    )
  );

  const list = documentRef.createElement("div");
  list.className = "repair-profile-manager__list";

  if (tools.length === 0) {
    list.append(
      renderEmptyState(
        documentRef,
        text(["operator", "toolsEmpty"], "No tools saved yet. Add one below.")
      )
    );
  }

  for (const tool of tools) {
    list.append(renderToolRow(documentRef, tool, text));
  }

  panel.append(list, renderToolForm(documentRef, text));
  return panel;
}

function renderToolRow(documentRef: Document, tool: OperatorTool, text: TextFn): HTMLElement {
  const row = documentRef.createElement("div");
  row.className = "repair-profile-record";

  const label = createInput(documentRef, "text", "Tool name", tool.label);
  label.dataset["repairAction"] = "operator-profile-field";
  label.dataset["profileKind"] = "tool";
  label.dataset["toolId"] = tool.id;
  label.dataset["field"] = "label";

  const category = createSelect(documentRef, TOOL_CATEGORY_OPTIONS, tool.category);
  category.dataset["repairAction"] = "operator-profile-field";
  category.dataset["profileKind"] = "tool";
  category.dataset["toolId"] = tool.id;
  category.dataset["field"] = "category";

  const model = createInput(documentRef, "text", "Model", tool.model ?? "");
  model.dataset["repairAction"] = "operator-profile-field";
  model.dataset["profileKind"] = "tool";
  model.dataset["toolId"] = tool.id;
  model.dataset["field"] = "model";

  const notes = createInput(documentRef, "text", "Notes", tool.notes ?? "");
  notes.dataset["repairAction"] = "operator-profile-field";
  notes.dataset["profileKind"] = "tool";
  notes.dataset["toolId"] = tool.id;
  notes.dataset["field"] = "notes";

  const availability = documentRef.createElement("button");
  availability.type = "button";
  availability.className = `repair-profile-chip${tool.available ? " repair-profile-chip--active" : ""}`;
  availability.textContent = tool.available
    ? text(["operator", "available"], "Available")
    : text(["operator", "unavailable"], "Unavailable");
  availability.dataset["repairAction"] = "operator-profile-update";
  availability.dataset["profileKind"] = "tool";
  availability.dataset["toolId"] = tool.id;
  availability.dataset["available"] = String(!tool.available);

  const remove = documentRef.createElement("button");
  remove.type = "button";
  remove.className = "repair-profile-remove";
  remove.textContent = text(["operator", "remove"], "Remove");
  remove.dataset["repairAction"] = "operator-profile-update";
  remove.dataset["profileKind"] = "tool";
  remove.dataset["toolId"] = tool.id;
  remove.dataset["remove"] = "true";

  row.append(label, category, model, notes, availability, remove);
  return row;
}

function renderToolForm(documentRef: Document, text: TextFn): HTMLElement {
  const form = documentRef.createElement("div");
  form.className = "repair-profile-form";

  const name = createInput(documentRef, "text", text(["operator", "toolName"], "Tool name"));
  name.dataset["repairInput"] = "operator-tool-label";

  const category = createSelect(documentRef, TOOL_CATEGORY_OPTIONS, "measurement");
  category.dataset["repairInput"] = "operator-tool-category";

  const model = createInput(documentRef, "text", text(["operator", "toolModel"], "Model"));
  model.dataset["repairInput"] = "operator-tool-model";

  const add = documentRef.createElement("button");
  add.type = "button";
  add.className = "repair-profile-add";
  add.textContent = text(["operator", "addTool"], "+ Add tool");
  add.dataset["repairAction"] = "operator-profile-add-tool";

  form.append(name, category, model, add);
  return form;
}

function renderSkillManager(
  documentRef: Document,
  skills: OperatorSkill[],
  text: TextFn
): HTMLElement {
  const panel = documentRef.createElement("div");
  panel.className = "repair-profile-manager";

  panel.append(
    renderManagerHeader(
      documentRef,
      text(["operator", "skillsTitle"], "Your skills"),
      text(["operator", "skillsHint"], "Track repair skills you want Assistant AI to account for.")
    )
  );

  const list = documentRef.createElement("div");
  list.className = "repair-profile-manager__list";

  if (skills.length === 0) {
    list.append(
      renderEmptyState(
        documentRef,
        text(["operator", "skillsEmpty"], "No skills saved yet. Add one below.")
      )
    );
  }

  for (const skill of skills) {
    list.append(renderSkillRow(documentRef, skill, text));
  }

  panel.append(list, renderSkillForm(documentRef, text));
  return panel;
}

function renderSkillRow(documentRef: Document, skill: OperatorSkill, text: TextFn): HTMLElement {
  const row = documentRef.createElement("div");
  row.className = "repair-profile-record repair-profile-record--skill";

  const label = createInput(documentRef, "text", "Skill", skill.label);
  label.dataset["repairAction"] = "operator-profile-field";
  label.dataset["profileKind"] = "skill";
  label.dataset["skillId"] = skill.id;
  label.dataset["field"] = "label";

  const levels = documentRef.createElement("div");
  levels.className = "repair-profile-chip-group";
  for (let level = 1; level <= 5; level += 1) {
    const option = documentRef.createElement("button");
    option.type = "button";
    option.className = `repair-profile-chip${skill.proficiency === level ? " repair-profile-chip--active" : ""}`;
    option.textContent = String(level);
    option.dataset["repairAction"] = "operator-profile-update";
    option.dataset["profileKind"] = "skill";
    option.dataset["skillId"] = skill.id;
    option.dataset["proficiency"] = String(level);
    levels.append(option);
  }

  const remove = documentRef.createElement("button");
  remove.type = "button";
  remove.className = "repair-profile-remove";
  remove.textContent = text(["operator", "remove"], "Remove");
  remove.dataset["repairAction"] = "operator-profile-update";
  remove.dataset["profileKind"] = "skill";
  remove.dataset["skillId"] = skill.id;
  remove.dataset["remove"] = "true";

  row.append(label, levels, remove);
  return row;
}

function renderSkillForm(documentRef: Document, text: TextFn): HTMLElement {
  const form = documentRef.createElement("div");
  form.className = "repair-profile-form repair-profile-form--skill";

  const name = createInput(documentRef, "text", text(["operator", "skillName"], "Skill name"));
  name.dataset["repairInput"] = "operator-skill-label";

  const level = createSelect(
    documentRef,
    [1, 2, 3, 4, 5].map((item) => ({ label: `Level ${item}`, value: String(item) })),
    "3"
  );
  level.dataset["repairInput"] = "operator-skill-proficiency";

  const add = documentRef.createElement("button");
  add.type = "button";
  add.className = "repair-profile-add";
  add.textContent = text(["operator", "addSkill"], "+ Add skill");
  add.dataset["repairAction"] = "operator-profile-add-skill";

  form.append(name, level, add);
  return form;
}

function renderPreferences(
  documentRef: Document,
  preferences: RepairUiState["operatorProfile"]["profile"]["preferences"],
  text: TextFn
): HTMLElement {
  const prefs = documentRef.createElement("div");
  prefs.className = "repair-profile-preferences";

  const measurementRow = renderPreferenceRow(
    documentRef,
    text(["operator", "measurement"], "Measurement")
  );
  const measurementSelect = createSelect(
    documentRef,
    MEASUREMENT_OPTIONS,
    preferences.measurementSystem
  );
  measurementSelect.dataset["repairAction"] = "operator-profile-field";
  measurementSelect.dataset["profileKind"] = "preference";
  measurementSelect.dataset["preferenceKey"] = "measurementSystem";
  measurementRow.append(measurementSelect);
  prefs.append(measurementRow);

  const annotationRow = renderPreferenceRow(
    documentRef,
    text(["operator", "annotation"], "Annotation")
  );
  const annotationValue = documentRef.createElement("span");
  annotationValue.className = "repair-sync-row__value";
  annotationValue.textContent = `${preferences.annotationDefaultColor} / ${preferences.annotationDefaultStrokeWidth}px`;
  annotationRow.append(annotationValue);
  annotationRow.append(
    renderPreferenceButton(
      documentRef,
      "-",
      "annotationDefaultStrokeWidth",
      String(preferences.annotationDefaultStrokeWidth - 1)
    )
  );
  annotationRow.append(
    renderPreferenceButton(
      documentRef,
      "+",
      "annotationDefaultStrokeWidth",
      String(preferences.annotationDefaultStrokeWidth + 1)
    )
  );
  prefs.append(annotationRow);

  prefs.append(
    renderPreferenceChipRow(
      documentRef,
      text(["operator", "risk"], "Risk"),
      "riskTolerance",
      RISK_OPTIONS,
      preferences.riskTolerance
    )
  );
  prefs.append(
    renderPreferenceChipRow(
      documentRef,
      text(["operator", "ai"], "Asistan AI"),
      "aiVerbosity",
      AI_OPTIONS,
      preferences.aiVerbosity
    )
  );

  return prefs;
}

function renderPreferenceChipRow(
  documentRef: Document,
  label: string,
  key: "riskTolerance" | "aiVerbosity",
  options: string[],
  current: string
): HTMLElement {
  const row = renderPreferenceRow(documentRef, label);
  const group = documentRef.createElement("div");
  group.className = "repair-profile-chip-group";
  for (const option of options) {
    group.append(renderPreferenceButton(documentRef, option, key, option, option === current));
  }
  row.append(group);
  return row;
}

function renderPreferenceButton(
  documentRef: Document,
  label: string,
  key: string,
  value: string,
  active = false
): HTMLButtonElement {
  const action = documentRef.createElement("button");
  action.type = "button";
  action.className = `repair-profile-chip${active ? " repair-profile-chip--active" : ""}`;
  action.textContent = label;
  action.dataset["repairAction"] = "operator-profile-update";
  action.dataset["profileKind"] = "preference";
  action.dataset["preferenceKey"] = key;
  action.dataset["preferenceValue"] = value;
  return action;
}

function renderPreferenceRow(documentRef: Document, label: string): HTMLElement {
  const row = documentRef.createElement("div");
  row.className = "repair-sync-row repair-profile-preference-row";
  const labelEl = documentRef.createElement("span");
  labelEl.className = "repair-sync-row__label";
  labelEl.textContent = label;
  row.append(labelEl);
  return row;
}

function renderManagerHeader(
  documentRef: Document,
  titleText: string,
  copyText: string
): HTMLElement {
  const header = documentRef.createElement("div");
  header.className = "repair-profile-manager__header";

  const title = documentRef.createElement("div");
  title.className = "repair-profile-manager__title";
  title.textContent = titleText;
  header.append(title);

  const copy = documentRef.createElement("div");
  copy.className = "repair-profile-manager__copy";
  copy.textContent = copyText;
  header.append(copy);

  return header;
}

function renderEmptyState(documentRef: Document, message: string): HTMLElement {
  const empty = documentRef.createElement("div");
  empty.className = "repair-profile-empty";
  empty.textContent = message;
  return empty;
}

function createInput(
  documentRef: Document,
  type: string,
  placeholder: string,
  value = ""
): HTMLInputElement {
  const input = documentRef.createElement("input");
  input.className = "repair-profile-input";
  input.type = type;
  input.placeholder = placeholder;
  input.value = value;
  return input;
}

function createSelect<T extends string>(
  documentRef: Document,
  options: Array<{ label: string; value: T }>,
  value: T
): HTMLSelectElement {
  const select = documentRef.createElement("select");
  select.className = "repair-profile-select";
  select.value = value;
  options.forEach((option) => {
    const item = documentRef.createElement("option");
    item.value = option.value;
    item.textContent = option.label;
    if (option.value === value) item.selected = true;
    select.append(item);
  });
  return select;
}

export function createRepairOperatorProfileId(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${slug || "item"}-${Date.now().toString(36)}`;
}

export function normalizeRepairSkillLevel(value: number): RepairSkillLevel {
  return Math.max(1, Math.min(5, Math.round(value))) as RepairSkillLevel;
}
