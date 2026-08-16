import type { PatternRoomWorkspaceModel, PatternViewId } from "../../shared/types/pattern-room.js";
import {
  createPatternWorkspaceTranslator,
  type PatternWorkspaceTextKey,
  type PatternWorkspaceTranslator,
} from "../pattern-room-workspace-i18n.js";
import { createElement, createMetric } from "./pattern-panel-utils.js";

const HOTSPOTS: Array<{
  id: Exclude<PatternViewId, "overview">;
  labelKey: PatternWorkspaceTextKey;
  descriptionKey: PatternWorkspaceTextKey;
  iconClass: string;
}> = [
  {
    id: "board",
    labelKey: "nav.board.label",
    descriptionKey: "nav.board.description",
    iconClass: "board",
  },
  {
    id: "desk",
    labelKey: "nav.connections.label",
    descriptionKey: "nav.connections.description",
    iconClass: "desk",
  },
  {
    id: "archive",
    labelKey: "nav.archive.label",
    descriptionKey: "nav.archive.description",
    iconClass: "archive",
  },
  {
    id: "tenth-man",
    labelKey: "nav.review.label",
    descriptionKey: "nav.review.description",
    iconClass: "tenth-man",
  },
  {
    id: "report",
    labelKey: "nav.report.label",
    descriptionKey: "nav.report.description",
    iconClass: "report",
  },
];

export function createOverviewPanel(
  data: PatternRoomWorkspaceModel,
  onOpenView: (viewId: Exclude<PatternViewId, "overview">) => void,
  text: PatternWorkspaceTranslator = createPatternWorkspaceTranslator("tr", null)
): HTMLElement {
  const shell = createElement("section", "pattern-room-overview");
  shell.dataset["patternView"] = "overview";

  const header = createElement("header", "pattern-room-overview-header");
  const titleWrap = createElement("div", "pattern-room-title-block");
  titleWrap.append(createElement("span", "pattern-room-kicker", data.roomLabel));
  titleWrap.append(createElement("h1", undefined, data.roomTitle));
  titleWrap.append(createElement("p", undefined, data.roomSummary));
  const metrics = createElement("div", "pattern-room-metrics");
  metrics.append(
    createMetric("Kategori", String(data.boardCategories.length)),
    createMetric("Kaynak", String(data.sources.length)),
    createMetric("Rol", String(data.tenthManSession.roles.length))
  );
  header.append(titleWrap, metrics);

  const stage = createElement("div", "pattern-room-office");
  stage.append(createElement("div", "pattern-room-office-wall"));

  const board = createElement("div", "pattern-room-office-board");
  board.append(createElement("span", "pattern-room-object-label", "Pano"));
  data.boardCategories.forEach((category) => {
    const pin = createElement("span", `pattern-room-pin ${category.tone}`, category.label);
    board.append(pin);
  });

  const table = createElement("div", "pattern-room-holo-table");
  table.append(
    createElement("span", "pattern-room-object-label", "Masa"),
    createElement("strong", undefined, data.subject)
  );

  const archive = createElement("div", "pattern-room-archive-cabinet");
  archive.append(createElement("span", "pattern-room-object-label", "Arşiv"));

  const tenthManDevice = createElement("div", "pattern-room-tenth-device");
  tenthManDevice.append(
    createElement("span", "pattern-room-object-label", "10. Adam"),
    createElement("i")
  );

  const reportTerminal = createElement("div", "pattern-room-report-terminal");
  reportTerminal.append(
    createElement("span", "pattern-room-object-label", "Rapor"),
    createElement("i")
  );

  const hotspotLayer = createElement("div", "pattern-room-hotspots");
  HOTSPOTS.forEach((hotspot) => {
    const label = text(hotspot.labelKey);
    const description = text(hotspot.descriptionKey);
    const button = createElement("button", `pattern-room-hotspot ${hotspot.id}`);
    button.type = "button";
    button.dataset["patternHotspot"] = hotspot.id;
    button.ariaLabel = label;
    button.title = description;
    const textWrap = createElement("span", "pattern-room-hotspot-copy");
    textWrap.append(
      createElement("strong", undefined, label),
      createElement("span", undefined, description)
    );
    button.append(createElement("span", `pattern-room-object-icon ${hotspot.iconClass}`), textWrap);
    button.addEventListener("click", () => {
      onOpenView(hotspot.id);
    });
    hotspotLayer.append(button);
  });

  stage.append(board, archive, table, tenthManDevice, reportTerminal, hotspotLayer);

  const activity = createElement("aside", "pattern-room-overview-activity");
  activity.append(
    createElement("span", "pattern-room-kicker", text("overview.activityLabel")),
    createElement("strong", undefined, text("overview.activityTitle")),
    createElement("p", undefined, text("overview.activityCopy"))
  );

  shell.append(header, activity, stage);
  return shell;
}
