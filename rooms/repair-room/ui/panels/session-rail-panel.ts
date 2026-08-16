import type { RepairUiState } from "../../shared/ui/state.js";
import { createRepairPanel } from "./panel-shell.js";
import { renderSessionWizardPanel } from "./session-wizard-panel.js";

type TextFn = (path: string[], fallback: string) => string;

export function renderSessionRailPanel(
  documentRef: Document,
  state: RepairUiState,
  text: TextFn
): HTMLElement {
  const body = documentRef.createElement("div");
  body.className = "repair-panel__body repair-session-rail-body";

  const wizard = renderSessionWizardPanel(documentRef, state, text, { embedded: true });
  body.append(wizard);

  const list = documentRef.createElement("div");
  list.className = "repair-session-list";

  const active = state.sessions.list.filter((s) => !s.isArchived);
  const archived = state.sessions.list.filter((s) => s.isArchived);

  for (const session of active) {
    list.append(buildSessionCard(documentRef, session, state.sessions.activeId, text));
  }

  if (archived.length > 0) {
    const divider = documentRef.createElement("div");
    divider.className = "repair-archive-divider";
    divider.textContent = text(["sessionRail", "archive"], "Archive");
    list.append(divider);

    for (const session of archived) {
      list.append(buildSessionCard(documentRef, session, state.sessions.activeId, text));
    }
  }

  body.append(list);

  return createRepairPanel(documentRef, {
    panelId: "session-rail",
    eyebrow: "",
    title: "",
    statusDot: state.sessions.activeId !== null ? "live" : "idle",
    collapsed: state.layout.collapsedPanels["session-rail"],
    noPanelHeader: true,
    body,
  });
}

function buildSessionCard(
  documentRef: Document,
  session: RepairUiState["sessions"]["list"][number],
  activeId: string | null,
  text: TextFn
): HTMLElement {
  const card = documentRef.createElement("div");
  const isActive = session.id === activeId;
  card.className = `repair-session-card${isActive ? " repair-session-card--active" : ""}${session.isArchived ? " repair-session-card--archived" : ""}`;
  card.dataset["repairAction"] = "activate-session";
  card.dataset["sessionId"] = session.id;

  const header = documentRef.createElement("div");
  header.className = "repair-session-card__header";

  const title = documentRef.createElement("div");
  title.className = "repair-session-card__title";
  title.textContent = session.title;
  header.append(title);

  const deleteButton = documentRef.createElement("button");
  deleteButton.className = "repair-session-card__delete";
  deleteButton.type = "button";
  deleteButton.textContent = text(["sessionRail", "delete"], "Delete");
  deleteButton.title = text(["sessionRail", "deleteTitle"], "Delete saved session and data");
  deleteButton.dataset["repairAction"] = "delete-session";
  deleteButton.dataset["sessionId"] = session.id;
  deleteButton.dataset["sessionTitle"] = session.title;
  header.append(deleteButton);

  card.append(header);

  const device = documentRef.createElement("div");
  device.className = "repair-session-card__device";
  device.textContent = session.deviceLabel;
  card.append(device);

  const meta = documentRef.createElement("div");
  meta.className = "repair-session-card__meta";

  const risk = documentRef.createElement("span");
  risk.className = `repair-session-card__risk repair-session-card__risk--${session.riskLevel}`;
  risk.textContent = session.riskLevel.toUpperCase();
  meta.append(risk);

  const code = documentRef.createElement("span");
  code.textContent = session.boardCode;
  meta.append(code);

  const serial = documentRef.createElement("span");
  serial.className = "repair-session-card__serial";
  serial.textContent = `${text(["sessionRail", "serialPrefix"], "S/N")} ${session.serialNumber}`;
  meta.append(serial);

  card.append(meta);
  return card;
}
