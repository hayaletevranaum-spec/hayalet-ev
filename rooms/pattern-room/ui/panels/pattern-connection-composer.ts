import type {
  PatternConnectionOption,
  PatternPanelActions,
} from "../../shared/types/pattern-room.js";
import { createElement } from "./pattern-panel-utils.js";

export type AuthoredConnectionEdgeType = Parameters<PatternPanelActions["addAuthoredEdge"]>[0];

export const CONNECTION_EDGE_TYPE_OPTIONS: ReadonlyArray<{
  readonly value: AuthoredConnectionEdgeType;
  readonly label: string;
}> = [
  { value: "supports", label: "destekliyor" },
  { value: "contradicts", label: "çelişiyor" },
  { value: "references", label: "referans veriyor" },
  { value: "derived_from", label: "türetildi" },
  { value: "inspired_by", label: "ilham aldı" },
  { value: "questions", label: "sorguluyor" },
  { value: "needs_review", label: "inceleme gerekiyor" },
];

function createConnectionEntityOption(optionValue: PatternConnectionOption): HTMLOptionElement {
  const kindLabel =
    optionValue.kind === "evidence" ? "Kanıt" : optionValue.kind === "source" ? "Kaynak" : "Öğe";
  const scopeLabel = optionValue.isLocal ? "Yerel" : "Domain";
  const option = createElement(
    "option",
    undefined,
    `${scopeLabel} ${kindLabel}: ${optionValue.label}`
  );
  option.value = optionValue.id;
  return option;
}

function createEdgeTypeOption(value: AuthoredConnectionEdgeType, label: string): HTMLOptionElement {
  const option = createElement("option", undefined, label);
  option.value = value;
  return option;
}

function resetConnectionFormDefaults(
  sourceSelect: HTMLSelectElement,
  edgeTypeSelect: HTMLSelectElement,
  targetSelect: HTMLSelectElement,
  connectionOptions: readonly PatternConnectionOption[]
): void {
  sourceSelect.value = connectionOptions[0]?.id ?? "";
  edgeTypeSelect.value = "supports";
  targetSelect.value = connectionOptions[1]?.id ?? connectionOptions[0]?.id ?? "";
}

export function createConnectionAuthoringForm(
  actions: PatternPanelActions,
  connectionOptions: readonly PatternConnectionOption[]
): HTMLFormElement {
  const connectionForm = createElement("form", "pattern-room-inline-form");
  connectionForm.dataset["patternAuthorEdgeForm"] = "true";

  const sourceSelect = createElement("select", "pattern-room-inline-input");
  sourceSelect.name = "sourceId";
  sourceSelect.ariaLabel = "Bağlantı kaynağı";
  sourceSelect.dataset["patternAuthorEdgeSource"] = "true";
  sourceSelect.append(...connectionOptions.map(createConnectionEntityOption));

  const edgeTypeSelect = createElement("select", "pattern-room-inline-input");
  edgeTypeSelect.name = "edgeType";
  edgeTypeSelect.ariaLabel = "Bağlantı türü";
  edgeTypeSelect.dataset["patternAuthorEdgeType"] = "true";
  edgeTypeSelect.append(
    ...CONNECTION_EDGE_TYPE_OPTIONS.map((option) => {
      return createEdgeTypeOption(option.value, option.label);
    })
  );

  const targetSelect = createElement("select", "pattern-room-inline-input");
  targetSelect.name = "targetId";
  targetSelect.ariaLabel = "Bağlantı hedefi";
  targetSelect.dataset["patternAuthorEdgeTarget"] = "true";
  targetSelect.append(...connectionOptions.map(createConnectionEntityOption));

  const note = createElement("input", "pattern-room-inline-input");
  note.name = "note";
  note.placeholder = "Not (opsiyonel)";
  note.ariaLabel = "Bağlantı notu";
  note.dataset["patternAuthorEdgeNote"] = "true";

  const submit = createElement("button", "pattern-room-action-button", "Bağla");
  submit.type = "submit";
  const hasEnoughOptions = connectionOptions.length >= 2;
  sourceSelect.disabled = !hasEnoughOptions;
  edgeTypeSelect.disabled = !hasEnoughOptions;
  targetSelect.disabled = !hasEnoughOptions;
  note.disabled = !hasEnoughOptions;
  submit.disabled = !hasEnoughOptions;
  resetConnectionFormDefaults(sourceSelect, edgeTypeSelect, targetSelect, connectionOptions);

  connectionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (
      sourceSelect.value === "" ||
      targetSelect.value === "" ||
      sourceSelect.value === targetSelect.value
    ) {
      return;
    }

    actions.addAuthoredEdge(
      edgeTypeSelect.value as AuthoredConnectionEdgeType,
      sourceSelect.value,
      targetSelect.value,
      note.value
    );
    connectionForm.reset();
    resetConnectionFormDefaults(sourceSelect, edgeTypeSelect, targetSelect, connectionOptions);
  });

  connectionForm.append(
    createElement(
      "p",
      "pattern-room-inline-note",
      "Bağlantılar Rapor panelinde Yerel Bağlantılar bölümünde listelenir."
    ),
    sourceSelect,
    edgeTypeSelect,
    targetSelect,
    note,
    submit
  );
  return connectionForm;
}
