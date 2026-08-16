import type { RepairPanelId } from "../../shared/types/index.js";
import type { RepairUiState } from "../../shared/ui/state.js";
import { formatRepairTacticalFeedStatusLine } from "../panels/tactical-feed-panel.js";
import { setClassNameIfChanged, setDatasetIfChanged, setTextIfChanged } from "./dom-utils.js";

type TextFn = (
  path: string[],
  fallback: string,
  params?: Record<string, string | number>
) => string;

export function createRepairTacticalFeedDomRuntime(params: {
  documentRef: Document;
  state: RepairUiState;
  text: TextFn;
  updatePanelChrome: (panel: HTMLElement, panelId: RepairPanelId) => void;
}) {
  const { documentRef, state, text, updatePanelChrome } = params;

  function createTacticalFeedEntry(): HTMLElement {
    const entry = documentRef.createElement("div");
    entry.dataset["repairAction"] = "jump-to-event";

    const header = documentRef.createElement("div");
    header.className = "repair-feed-entry__header";

    const badge = documentRef.createElement("span");
    badge.className = "repair-feed-entry__badge";
    header.append(badge);

    const time = documentRef.createElement("span");
    time.className = "repair-feed-entry__time";
    header.append(time);

    const bodyText = documentRef.createElement("div");
    bodyText.className = "repair-feed-entry__body";

    entry.append(header, bodyText);
    return entry;
  }

  function syncTacticalFeedEntry(
    entry: HTMLElement,
    item: RepairUiState["tacticalFeed"][number]
  ): void {
    setClassNameIfChanged(
      entry,
      `repair-feed-entry repair-feed-entry--${item.severity}${
        state.workbench.focusedEventId === item.eventId ? " repair-feed-entry--active" : ""
      }`
    );
    setDatasetIfChanged(entry, "repairAction", "jump-to-event");
    setDatasetIfChanged(entry, "eventId", item.eventId);

    let header = entry.querySelector<HTMLElement>(".repair-feed-entry__header");
    if (header === null) {
      header = documentRef.createElement("div");
      header.className = "repair-feed-entry__header";
      entry.prepend(header);
    }

    let badge = header.querySelector<HTMLElement>(".repair-feed-entry__badge");
    if (badge === null) {
      badge = documentRef.createElement("span");
      header.prepend(badge);
    }
    setClassNameIfChanged(
      badge,
      `repair-feed-entry__badge repair-feed-entry__badge--${item.severity}`
    );
    setTextIfChanged(badge, item.badge);

    let time = header.querySelector<HTMLElement>(".repair-feed-entry__time");
    if (time === null) {
      time = documentRef.createElement("span");
      time.className = "repair-feed-entry__time";
      header.append(time);
    }
    setTextIfChanged(time, item.relativeLabel);

    let bodyText = entry.querySelector<HTMLElement>(".repair-feed-entry__body");
    if (bodyText === null) {
      bodyText = documentRef.createElement("div");
      bodyText.className = "repair-feed-entry__body";
      entry.append(bodyText);
    }
    setTextIfChanged(bodyText, item.body);
  }

  function createChatTurnElement(): HTMLElement {
    const turnEl = documentRef.createElement("div");
    turnEl.className = "repair-chat-turn";

    const header = documentRef.createElement("div");
    header.className = "repair-chat-turn__header";

    const role = documentRef.createElement("span");
    role.className = "repair-chat-turn__role";
    header.append(role);

    const time = documentRef.createElement("span");
    time.className = "repair-chat-turn__time";
    header.append(time);

    const bodyText = documentRef.createElement("div");
    bodyText.className = "repair-chat-turn__body";

    turnEl.append(header, bodyText);
    return turnEl;
  }

  function syncChatTurnElement(
    turnEl: HTMLElement,
    turn: RepairUiState["chat"]["turns"][number]
  ): void {
    setClassNameIfChanged(turnEl, "repair-chat-turn");
    setDatasetIfChanged(turnEl, "turnId", turn.id);

    let header = turnEl.querySelector<HTMLElement>(".repair-chat-turn__header");
    if (header === null) {
      header = documentRef.createElement("div");
      header.className = "repair-chat-turn__header";
      turnEl.prepend(header);
    }

    let role = header.querySelector<HTMLElement>(".repair-chat-turn__role");
    if (role === null) {
      role = documentRef.createElement("span");
      header.prepend(role);
    }
    setClassNameIfChanged(role, `repair-chat-turn__role repair-chat-turn__role--${turn.role}`);
    const roleLabel =
      turn.role === "ai"
        ? text(["tacticalFeed", "chatRoles", "assistant"], "Asistan")
        : text(["tacticalFeed", "chatRoles", "you"], "Sen");
    setTextIfChanged(role, roleLabel);

    let time = header.querySelector<HTMLElement>(".repair-chat-turn__time");
    if (time === null) {
      time = documentRef.createElement("span");
      time.className = "repair-chat-turn__time";
      header.append(time);
    }
    const timeStr = new Date(turn.occurredAt).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setTextIfChanged(time, timeStr);

    let bodyText = turnEl.querySelector<HTMLElement>(".repair-chat-turn__body");
    if (bodyText === null) {
      bodyText = documentRef.createElement("div");
      bodyText.className = "repair-chat-turn__body";
      turnEl.append(bodyText);
    }
    setTextIfChanged(bodyText, turn.text);
  }

  function updateTacticalFeedPanelDom(panel: HTMLElement): void {
    updatePanelChrome(panel, "tactical-feed");

    const hasRisk = state.tacticalFeed.some((item) => item.severity === "risk");
    const dot = panel.querySelector<HTMLElement>(".repair-panel__status-dot");
    if (dot !== null) {
      const dotStatus = hasRisk ? "risk" : state.chat.pendingReplyId !== null ? "amber" : "live";
      setClassNameIfChanged(dot, `repair-panel__status-dot repair-panel__status-dot--${dotStatus}`);
    }

    const calmLine = panel.querySelector<HTMLElement>(".repair-feed-calmline");
    if (calmLine !== null) {
      setTextIfChanged(calmLine, formatRepairTacticalFeedStatusLine(state, text));
    }
    const list = panel.querySelector<HTMLElement>(".repair-feed-list");
    if (list === null) return;

    const previousScrollTop = list.scrollTop;

    // --- Sync feed entries ---
    const activeEventIds = new Set(state.tacticalFeed.map((item) => item.eventId));
    for (const item of state.tacticalFeed) {
      const existing =
        Array.from(list.querySelectorAll<HTMLElement>(".repair-feed-entry")).find(
          (candidate) => candidate.dataset["eventId"] === item.eventId
        ) ?? null;
      const entry = existing ?? createTacticalFeedEntry();
      syncTacticalFeedEntry(entry, item);
      list.append(entry);
    }

    list.querySelectorAll<HTMLElement>(".repair-feed-entry").forEach((entry) => {
      const eventId = entry.dataset["eventId"];
      if (eventId === undefined || !activeEventIds.has(eventId)) {
        entry.remove();
      }
    });

    // --- Sync chat turns ---
    const activeTurnIds = new Set(state.chat.turns.map((turn) => turn.id));
    for (const turn of state.chat.turns) {
      const existing =
        Array.from(list.querySelectorAll<HTMLElement>(".repair-chat-turn")).find(
          (candidate) => candidate.dataset["turnId"] === turn.id
        ) ?? null;
      const turnEl = existing ?? createChatTurnElement();
      syncChatTurnElement(turnEl, turn);
      list.append(turnEl);
    }

    list.querySelectorAll<HTMLElement>(".repair-chat-turn").forEach((turnEl) => {
      const turnId = turnEl.dataset["turnId"];
      if (turnId === undefined || !activeTurnIds.has(turnId)) {
        turnEl.remove();
      }
    });

    // Re-sort all children by data-occurred-at would be ideal but we keep append-order
    // to match the initial render's sort by occurredAt

    list.scrollTop = previousScrollTop;
  }

  return { updateTacticalFeedPanelDom };
}
