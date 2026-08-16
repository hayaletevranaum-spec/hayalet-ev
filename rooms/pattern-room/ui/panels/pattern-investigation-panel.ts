import type {
  PatternPanelActions,
  PatternRoomWorkspaceModel,
} from "../../shared/types/pattern-room.js";
import {
  createPatternWorkspaceTranslator,
  type PatternWorkspaceTranslator,
} from "../pattern-room-workspace-i18n.js";
import { createBoardPanel } from "./pattern-board-panel.js";
import { createDeskPanel } from "./pattern-desk-panel.js";
import { createElement, createPanelShell } from "./pattern-panel-utils.js";

export type PatternInvestigationCanvasMode = "board" | "graph";

export type PatternInvestigationPanelOptions = {
  readonly initialMode?: PatternInvestigationCanvasMode;
  readonly onModeChange?: (mode: PatternInvestigationCanvasMode) => void;
};

function prepareModeSurface(panel: HTMLElement, mode: PatternInvestigationCanvasMode): HTMLElement {
  delete panel.dataset["patternView"];
  panel.classList.add("pattern-room-investigation-mode-surface");
  panel.dataset["patternInvestigationSurface"] = mode;
  panel.children[0]?.remove();
  return panel;
}

function createModeButton(mode: PatternInvestigationCanvasMode, label: string): HTMLButtonElement {
  const button = createElement("button", "pattern-room-investigation-mode-button", label);
  button.type = "button";
  button.dataset["patternInvestigationMode"] = mode;
  button.ariaPressed = "false";
  return button;
}

export function createInvestigationPanel(
  data: PatternRoomWorkspaceModel,
  actions: PatternPanelActions,
  onBack: () => void,
  options: PatternInvestigationPanelOptions = {},
  text: PatternWorkspaceTranslator = createPatternWorkspaceTranslator("tr", null)
): HTMLElement {
  let activeMode = options.initialMode ?? "board";
  const shell = createPanelShell(
    activeMode === "graph" ? "desk" : "board",
    text("nav.board.label"),
    onBack
  );
  shell.classList.add("pattern-room-investigation-panel");
  shell.dataset["patternInvestigationCanvas"] = "true";

  const toolbar = createElement("section", "pattern-room-investigation-toolbar");
  const toolbarCopy = createElement("div", "pattern-room-investigation-toolbar-copy");
  toolbarCopy.append(
    createElement("span", "pattern-room-kicker", text("connections.kicker")),
    createElement("strong", undefined, text("nav.board.label")),
    createElement("p", undefined, text("nav.board.description"))
  );

  const modeControls = createElement("div", "pattern-room-investigation-mode-controls");
  modeControls.ariaLabel = text("connections.kicker");
  const boardButton = createModeButton("board", text("board.canvasLabel"));
  const graphButton = createModeButton("graph", text("nav.connections.label"));
  modeControls.append(boardButton, graphButton);
  toolbar.append(toolbarCopy, modeControls);

  const surface = createElement("div", "pattern-room-investigation-surface");

  const createSurface = (mode: PatternInvestigationCanvasMode): HTMLElement => {
    return prepareModeSurface(
      mode === "board"
        ? createBoardPanel(data, actions, onBack, text)
        : createDeskPanel(data, actions, onBack, text),
      mode
    );
  };

  const renderMode = (mode: PatternInvestigationCanvasMode, notify: boolean): void => {
    activeMode = mode;
    shell.dataset["patternView"] = mode === "graph" ? "desk" : "board";
    shell.dataset["patternInvestigationActiveMode"] = mode;
    surface.replaceChildren(createSurface(mode));

    [boardButton, graphButton].forEach((button) => {
      const isActive = button.dataset["patternInvestigationMode"] === mode;
      button.dataset["patternInvestigationModeActive"] = isActive ? "true" : "false";
      button.ariaPressed = isActive ? "true" : "false";
      button.tabIndex = isActive ? 0 : -1;
      if (isActive) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }
    });

    if (notify) {
      options.onModeChange?.(activeMode);
    }
  };

  boardButton.addEventListener("click", () => {
    if (activeMode !== "board") {
      renderMode("board", true);
    }
  });
  graphButton.addEventListener("click", () => {
    if (activeMode !== "graph") {
      renderMode("graph", true);
    }
  });

  renderMode(activeMode, false);
  shell.append(toolbar, surface);
  return shell;
}
