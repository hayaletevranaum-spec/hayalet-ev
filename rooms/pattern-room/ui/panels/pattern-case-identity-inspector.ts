import type {
  PatternPanelActions,
  PatternRoomWorkspaceModel,
} from "../../shared/types/pattern-room.js";
import {
  createPatternWorkspaceTranslator,
  type PatternWorkspaceTranslator,
} from "../pattern-room-workspace-i18n.js";
import { createElement } from "./pattern-panel-utils.js";

export function createPatternCaseIdentityInspector(
  data: PatternRoomWorkspaceModel,
  actions: PatternPanelActions,
  text: PatternWorkspaceTranslator = createPatternWorkspaceTranslator("tr", null)
): HTMLElement {
  const section = createElement("section", "pattern-room-case-identity-inspector");
  section.dataset["patternCaseIdentityInspector"] = "true";

  const form = createElement("form", "pattern-room-case-identity-form");
  form.dataset["patternCaseIdentityForm"] = "true";

  const caseNameLabel = createElement("label", "pattern-room-case-identity-field");
  caseNameLabel.append(createElement("span", undefined, text("overview.caseNameLabel")));
  const caseName = createElement("input", "pattern-room-inline-input");
  caseName.name = "caseLabel";
  caseName.value = data.subject;
  caseName.placeholder = text("overview.caseNamePlaceholder");
  caseName.dataset["patternCaseIdentityName"] = "true";
  caseName.required = true;
  caseNameLabel.append(caseName);

  const questionLabel = createElement("label", "pattern-room-case-identity-field");
  questionLabel.append(createElement("span", undefined, text("overview.researchQuestionLabel")));
  const question = createElement("textarea", "pattern-room-inline-input");
  question.name = "researchQuestion";
  question.value = data.researchQuestion;
  question.placeholder = text("overview.researchQuestionPlaceholder");
  question.dataset["patternCaseIdentityQuestion"] = "true";
  questionLabel.append(question);

  const submit = createElement(
    "button",
    "pattern-room-action-button pattern-room-case-identity-submit",
    text("overview.saveIdentity")
  );
  submit.type = "submit";
  submit.dataset["patternCaseIdentitySubmit"] = "true";

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const normalizedLabel = caseName.value.trim();
    if (normalizedLabel === "") {
      caseName.ariaInvalid = "true";
      caseName.focus();
      return;
    }
    caseName.ariaInvalid = "false";
    actions.updateCaseIdentity(normalizedLabel, question.value);
  });

  form.append(caseNameLabel, questionLabel, submit);
  section.append(
    createElement("span", "pattern-room-context-inspector-label", text("overview.identityLabel")),
    createElement("h2", undefined, text("overview.identityTitle")),
    createElement("p", undefined, text("overview.identityCopy")),
    form
  );
  return section;
}
