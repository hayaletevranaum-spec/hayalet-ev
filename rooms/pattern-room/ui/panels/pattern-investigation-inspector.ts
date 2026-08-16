import type {
  PatternBoardPin,
  PatternConnection,
  PatternConnectionOption,
  PatternPanelActions,
  PatternRoomWorkspaceModel,
} from "../../shared/types/pattern-room.js";
import {
  createPatternWorkspaceTranslator,
  type PatternWorkspaceTranslator,
} from "../pattern-room-workspace-i18n.js";
import {
  CONNECTION_EDGE_TYPE_OPTIONS,
  createConnectionAuthoringForm,
  type AuthoredConnectionEdgeType,
} from "./pattern-connection-composer.js";
import type { PatternInvestigationCanvasMode } from "./pattern-investigation-panel.js";
import { createActionButton, createElement } from "./pattern-panel-utils.js";

type AuthoredBoardNodeType = "claim" | "inspiration" | "uncertainty";
const REMOVE_BOARD_ITEM_CONFIRM_MESSAGE =
  "Bu yerel pano öğesi odadan kaldırılacak. Bağlı yerel bağlantılar da temizlenir. Devam edilsin mi?";

function createTextInput(name: string, placeholder: string): HTMLInputElement {
  const input = createElement("input", "pattern-room-inline-input");
  input.name = name;
  input.placeholder = placeholder;
  return input;
}

function createTextArea(name: string, placeholder: string): HTMLTextAreaElement {
  const textarea = createElement("textarea", "pattern-room-inline-input");
  textarea.name = name;
  textarea.placeholder = placeholder;
  return textarea;
}

function createSubmitButton(label: string): HTMLButtonElement {
  const button = createElement("button", "pattern-room-action-button", label);
  button.type = "submit";
  return button;
}

function createAuthoringDisclosure(label: string, form: HTMLFormElement): HTMLElement {
  const disclosure = createElement("details", "pattern-room-inline-disclosure");
  disclosure.dataset["patternAuthoringDisclosure"] = label;
  disclosure.append(createElement("summary", "pattern-room-inline-summary", label), form);
  return disclosure;
}

function createNodeTypeOption(value: AuthoredBoardNodeType, label: string): HTMLOptionElement {
  const option = createElement("option", undefined, label);
  option.value = value;
  return option;
}

function createBoardAuthoringPanel(
  actions: PatternPanelActions,
  connectionOptions: readonly PatternConnectionOption[]
): HTMLElement {
  const authoring = createElement("section", "pattern-room-inline-authoring");
  const nodeForm = createElement("form", "pattern-room-inline-form");
  nodeForm.dataset["patternAuthorNodeForm"] = "true";

  const nodeType = createElement("select", "pattern-room-inline-input");
  nodeType.name = "nodeType";
  nodeType.dataset["patternAuthorNodeType"] = "true";
  nodeType.append(
    createNodeTypeOption("claim", "İddia"),
    createNodeTypeOption("inspiration", "İlham"),
    createNodeTypeOption("uncertainty", "Belirsizlik")
  );

  const nodeLabel = createTextInput("label", "Başlık");
  nodeLabel.dataset["patternAuthorNodeLabel"] = "true";
  const nodeContent = createTextArea("content", "İçerik");
  nodeContent.dataset["patternAuthorNodeContent"] = "true";

  nodeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const label = nodeLabel.value;
    const content = nodeContent.value;
    if (label.trim() === "" || content.trim() === "") {
      return;
    }

    switch (nodeType.value as AuthoredBoardNodeType) {
      case "claim":
        actions.addAuthoredClaim(label, content);
        break;
      case "inspiration":
        actions.addAuthoredInspiration(label, content);
        break;
      case "uncertainty":
        actions.addAuthoredUncertainty(label, content);
        break;
    }
    nodeForm.reset();
    nodeType.value = "claim";
  });

  nodeForm.append(nodeType, nodeLabel, nodeContent, createSubmitButton("Ekle"));

  const evidenceForm = createElement("form", "pattern-room-inline-form");
  evidenceForm.dataset["patternAuthorEvidenceForm"] = "true";
  const evidenceLabel = createTextInput("label", "Başlık");
  evidenceLabel.dataset["patternAuthorEvidenceLabel"] = "true";
  const excerpt = createTextArea("excerpt", "Alıntı");
  excerpt.dataset["patternAuthorEvidenceExcerpt"] = "true";
  const interpretation = createTextArea("interpretation", "Yorum");
  interpretation.dataset["patternAuthorEvidenceInterpretation"] = "true";

  evidenceForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (evidenceLabel.value.trim() === "" || excerpt.value.trim() === "") {
      return;
    }

    actions.addAuthoredEvidence(evidenceLabel.value, excerpt.value, interpretation.value);
    evidenceForm.reset();
  });

  evidenceForm.append(evidenceLabel, excerpt, interpretation, createSubmitButton("Ekle"));

  authoring.append(
    createAuthoringDisclosure("Yeni Öğe Ekle", nodeForm),
    createAuthoringDisclosure("Kanıt Notu Ekle", evidenceForm),
    createAuthoringDisclosure(
      "Bağlantı Kur",
      createConnectionAuthoringForm(actions, connectionOptions)
    )
  );
  return authoring;
}

function findBoardPin(
  data: PatternRoomWorkspaceModel,
  pinId: string | null
): PatternBoardPin | null {
  if (pinId === null) {
    return null;
  }

  for (const category of data.boardCategories) {
    const match = category.pins.find((pin) => pin.id === pinId);
    if (match !== undefined) {
      return match;
    }
  }
  return null;
}

function createDetailMetric(label: string, value: string): HTMLElement {
  const metric = createElement("div", "pattern-room-detail-metric");
  metric.append(createElement("span", undefined, label), createElement("strong", undefined, value));
  return metric;
}

function createSelectedPinDetail(
  data: PatternRoomWorkspaceModel,
  actions: PatternPanelActions,
  pinId: string | null
): HTMLElement {
  const detail = createElement("section", "pattern-room-board-detail");
  detail.dataset["patternBoardDetail"] = "true";
  detail.ariaLive = "polite";
  const selectedPin = findBoardPin(data, pinId);
  if (selectedPin === null) {
    detail.append(
      createElement("span", "pattern-room-kicker", "Tuval detayı"),
      createElement("h2", undefined, "Bir öğe seç"),
      createElement(
        "p",
        undefined,
        "Seçilen kaynak, kanıt veya düğümün katman, güven ve köken bilgisi burada görünür."
      )
    );
    return detail;
  }

  const metrics = createElement("div", "pattern-room-detail-metrics");
  metrics.append(
    createDetailMetric("Katman", selectedPin.layerLabel),
    createDetailMetric("Güven", selectedPin.confidenceLabel),
    createDetailMetric("Kaynak", selectedPin.sourceLabel)
  );

  const actionsRow = createElement("div", "pattern-room-action-row");
  if (selectedPin.kind === "node") {
    if (!selectedPin.isLocal) {
      const deskButton = createActionButton("Masaya Gönder", () => {
        actions.sendNodeToDesk(selectedPin.id);
      });
      deskButton.dataset["patternSendToDesk"] = selectedPin.id;
      actionsRow.append(deskButton);
    }

    const debateButton = createActionButton("10. Adam’a Ekle", () => {
      actions.addNodeToDebate(selectedPin.id);
    });
    debateButton.dataset["patternAddNodeDebate"] = selectedPin.id;
    actionsRow.append(debateButton);
  }

  if (selectedPin.kind === "source" && selectedPin.sourceId !== null) {
    const sourceId = selectedPin.sourceId;
    const debateButton = createActionButton("10. Adam’a Ekle", () => {
      actions.addSourceToDebate(sourceId);
    });
    debateButton.dataset["patternAddSourceDebate"] = sourceId;
    actionsRow.append(debateButton);
  }

  if (selectedPin.kind === "evidence") {
    const debateButton = createActionButton("10. Adam’a Ekle", () => {
      actions.addNodeToDebate(selectedPin.id);
    });
    debateButton.dataset["patternAddEvidenceDebate"] = selectedPin.id;
    actionsRow.append(debateButton);
  }

  if (selectedPin.isLocal && (selectedPin.kind === "node" || selectedPin.kind === "evidence")) {
    const removeButton = createActionButton("Öğeyi kaldır", () => {
      if (!window.confirm(REMOVE_BOARD_ITEM_CONFIRM_MESSAGE)) {
        return;
      }
      actions.selectNode(null);
      if (selectedPin.kind === "node") {
        actions.removeLocalNode(selectedPin.id);
        return;
      }
      actions.removeLocalEvidence(selectedPin.id);
    });
    removeButton.dataset["patternRemoveBoardItem"] = selectedPin.id;
    removeButton.dataset["patternRemoveBoardItemKind"] = selectedPin.kind;
    actionsRow.append(removeButton);
  }

  detail.append(
    createElement("span", "pattern-room-kicker", "Tuval detayı"),
    createElement("h2", undefined, selectedPin.label),
    metrics,
    createElement("p", undefined, selectedPin.content),
    createElement(
      "small",
      undefined,
      selectedPin.origin === null ? "Kaynak origin bilgisi yok." : selectedPin.origin
    ),
    actionsRow
  );
  return detail;
}

function findConnection(
  data: PatternRoomWorkspaceModel,
  connectionId: string | null
): PatternConnection | null {
  if (connectionId === null) {
    return null;
  }
  return data.connections.find((connection) => connection.id === connectionId) ?? null;
}

function createConnectionEditorOption(
  value: AuthoredConnectionEdgeType,
  label: string
): HTMLOptionElement {
  const option = createElement("option", undefined, label);
  option.value = value;
  return option;
}

function createSelectedConnectionDetail(
  data: PatternRoomWorkspaceModel,
  actions: PatternPanelActions,
  connectionId: string | null
): HTMLElement {
  const detail = createElement("section", "pattern-room-connection-detail");
  detail.dataset["patternConnectionDetail"] = "true";
  detail.ariaLive = "polite";
  const connection = findConnection(data, connectionId);
  if (connection === null) {
    detail.append(
      createElement("span", "pattern-room-kicker", "Bağlantı detayı"),
      createElement("h2", undefined, "Bir bağlantı seç"),
      createElement(
        "p",
        undefined,
        "İlişki yüzeyindeki bir bağlantıyı seçtiğinizde kaynak, hedef, tür ve not burada görünür."
      )
    );
    return detail;
  }

  const metrics = createElement("div", "pattern-room-detail-metrics");
  metrics.append(
    createDetailMetric("Kapsam", connection.scope === "local" ? "Yerel" : "Domain"),
    createDetailMetric("Kaynak", connection.sourceLabel),
    createDetailMetric("Hedef", connection.targetLabel)
  );
  detail.append(
    createElement("span", "pattern-room-kicker", "Bağlantı detayı"),
    createElement("h2", undefined, connection.edgeTypeLabel),
    metrics,
    createElement(
      "p",
      undefined,
      `${connection.sourceLabel} → ${connection.edgeTypeLabel} → ${connection.targetLabel}`
    )
  );

  if (!connection.editable) {
    detail.append(
      createElement(
        "small",
        undefined,
        connection.note === null
          ? "Domain bağlantıları salt okunur; bağlantı notu yok."
          : `Domain bağlantısı salt okunur. Not: ${connection.note}`
      )
    );
    return detail;
  }

  const form = createElement("form", "pattern-room-inline-form pattern-room-connection-edit-form");
  form.dataset["patternEditEdgeForm"] = connection.id;
  const edgeType = createElement("select", "pattern-room-inline-input");
  edgeType.dataset["patternEditEdgeType"] = connection.id;
  edgeType.name = "edgeType";
  edgeType.append(
    ...CONNECTION_EDGE_TYPE_OPTIONS.map((option) =>
      createConnectionEditorOption(option.value, option.label)
    )
  );
  edgeType.value = connection.edgeType;
  const note = createElement("textarea", "pattern-room-inline-input");
  note.dataset["patternEditEdgeNote"] = connection.id;
  note.name = "note";
  note.placeholder = "Bağlantı notu (opsiyonel)";
  note.value = connection.note ?? "";
  const submit = createSubmitButton("Bağlantıyı Güncelle");
  submit.dataset["patternEditEdgeSubmit"] = connection.id;
  const feedback = createElement("small", "pattern-room-edit-feedback");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const submittedType = edgeType.value as AuthoredConnectionEdgeType;
    const submittedNote = note.value;
    actions.updateLocalEdge(connection.id, submittedType, submittedNote);
    edgeType.value = submittedType;
    note.value = submittedNote;
    feedback.textContent = submittedNote ? `Not: ${submittedNote}` : "İlişki notu temizlendi.";
  });
  form.append(edgeType, note, submit, feedback);
  detail.append(form);
  return detail;
}

function createConnectionEntity(option: PatternConnectionOption): HTMLElement {
  const kindLabel =
    option.kind === "evidence" ? "Kanıt" : option.kind === "source" ? "Kaynak" : "Öğe";
  const card = createElement("article", "pattern-room-connection-entity");
  card.dataset["patternConnectionEntity"] = option.id;
  card.append(
    createElement("span", "pattern-room-list-eyebrow", kindLabel),
    createElement("strong", undefined, option.label),
    createElement(
      "small",
      "pattern-room-connection-scope " + (option.isLocal ? "local" : "domain"),
      option.isLocal ? "Yerel" : "Domain"
    )
  );
  return card;
}

function createBoardInspectorContent(
  data: PatternRoomWorkspaceModel,
  actions: PatternPanelActions,
  selectedPinId: string | null,
  text: PatternWorkspaceTranslator
): HTMLElement {
  const content = createElement("div", "pattern-room-investigation-inspector-content");
  content.dataset["patternInvestigationInspectorMode"] = "board";
  content.append(createSelectedPinDetail(data, actions, selectedPinId));

  const tools = createElement(
    "section",
    "pattern-room-investigation-inspector-section pattern-room-board-inspector-tools"
  );
  tools.append(
    createElement("span", "pattern-room-context-inspector-label", text("board.toolsLabel")),
    createBoardAuthoringPanel(actions, data.connectionOptions)
  );
  content.append(tools);
  return content;
}

function createGraphInspectorContent(
  data: PatternRoomWorkspaceModel,
  actions: PatternPanelActions,
  selectedConnectionId: string | null,
  text: PatternWorkspaceTranslator
): HTMLElement {
  const content = createElement("div", "pattern-room-investigation-inspector-content");
  content.dataset["patternInvestigationInspectorMode"] = "graph";
  content.append(createSelectedConnectionDetail(data, actions, selectedConnectionId));

  const entitySection = createElement(
    "section",
    "pattern-room-investigation-inspector-section pattern-room-connection-entities"
  );
  entitySection.append(
    createElement("span", "pattern-room-context-inspector-label", text("connections.entitiesLabel"))
  );
  const entityList = createElement("div", "pattern-room-connection-entity-list");
  entityList.append(...data.connectionOptions.map(createConnectionEntity));
  entitySection.append(entityList);

  const composer = createElement(
    "section",
    "pattern-room-investigation-inspector-section pattern-room-connection-composer"
  );
  composer.append(
    createElement(
      "span",
      "pattern-room-context-inspector-label",
      text("connections.composerLabel")
    ),
    createConnectionAuthoringForm(actions, data.connectionOptions)
  );

  content.append(entitySection, composer);
  return content;
}

export function createInvestigationInspectorContent(
  mode: PatternInvestigationCanvasMode,
  data: PatternRoomWorkspaceModel,
  actions: PatternPanelActions,
  selectedPinId: string | null,
  selectedConnectionId: string | null,
  text: PatternWorkspaceTranslator = createPatternWorkspaceTranslator("tr", null)
): HTMLElement {
  return mode === "graph"
    ? createGraphInspectorContent(data, actions, selectedConnectionId, text)
    : createBoardInspectorContent(data, actions, selectedPinId, text);
}
