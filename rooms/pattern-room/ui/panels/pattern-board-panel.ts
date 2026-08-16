import type {
  PatternPanelActions,
  PatternRoomWorkspaceModel,
} from "../../shared/types/pattern-room.js";
import {
  createPatternWorkspaceTranslator,
  type PatternWorkspaceTranslator,
} from "../pattern-room-workspace-i18n.js";
import { createElement, createEmptyState, createPanelShell } from "./pattern-panel-utils.js";

export function createBoardPanel(
  data: PatternRoomWorkspaceModel,
  actions: PatternPanelActions,
  onBack: () => void,
  text: PatternWorkspaceTranslator = createPatternWorkspaceTranslator("tr", null)
): HTMLElement {
  const shell = createPanelShell("board", text("nav.board.label"), onBack);
  const workspace = createElement(
    "div",
    "pattern-room-board-workspace pattern-room-board-workspace-canvas-only"
  );
  const canvas = createElement("section", "pattern-room-board-canvas");
  canvas.ariaLabel = text("board.canvasLabel");
  const canvasHeader = createElement("header", "pattern-room-workspace-section-header");
  const pinCount = data.boardCategories.reduce((count, category) => {
    return count + category.pins.length;
  }, 0);
  canvasHeader.append(
    createElement("span", "pattern-room-kicker", text("board.canvasLabel")),
    createElement("strong", undefined, String(pinCount) + " · " + data.subject)
  );
  const boardScene = createElement("div", "pattern-room-board-scene");
  const grid = createElement("div", "pattern-room-board-grid");
  const pinButtons: HTMLButtonElement[] = [];

  function markSelectedPin(pinId: string | null): void {
    pinButtons.forEach((button) => {
      const isSelected = button.dataset["patternBoardPin"] === pinId;
      button.dataset["patternBoardPinSelected"] = isSelected ? "true" : "false";
      button.ariaPressed = isSelected ? "true" : "false";
      if (isSelected) {
        button.classList.add("selected");
      } else {
        button.classList.remove("selected");
      }
    });
  }

  data.boardCategories.forEach((category) => {
    const lane = createElement("article", "pattern-room-board-lane " + category.tone);
    const laneHeader = createElement("header", "pattern-room-board-lane-header");
    laneHeader.append(
      createElement("span", "pattern-room-board-lane-label", "Pano kategorisi"),
      createElement("span", "pattern-room-board-lane-count", String(category.pins.length)),
      createElement("h2", undefined, category.label),
      createElement("p", undefined, category.summary)
    );

    const pinList = createElement("div", "pattern-room-board-pins");
    if (category.pins.length === 0) {
      pinList.append(
        createEmptyState("Bu kategoride henüz pano öğesi yok.", "data-empty", {
          compact: true,
        })
      );
    }
    category.pins.forEach((pinItem) => {
      const pin = createElement("button", "pattern-room-board-node " + category.tone);
      pin.type = "button";
      pin.append(
        createElement("span", "pattern-room-board-node-copy", pinItem.label),
        createElement(
          "small",
          "pattern-room-board-node-meta",
          pinItem.layerLabel + " · " + pinItem.confidenceLabel
        )
      );
      pin.dataset["patternBoardPin"] = pinItem.id;
      pin.dataset["patternBoardPinKind"] = pinItem.kind;
      pin.addEventListener("click", () => {
        actions.selectNode(pinItem.id);
        markSelectedPin(pinItem.id);
      });
      pinButtons.push(pin);
      pinList.append(pin);
    });

    lane.append(laneHeader, pinList);
    grid.append(lane);
  });

  markSelectedPin(actions.getSelectedNodeId());
  boardScene.append(grid);
  canvas.append(canvasHeader, boardScene);
  workspace.append(canvas);
  shell.append(workspace);
  return shell;
}
