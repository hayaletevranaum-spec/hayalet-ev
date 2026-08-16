import type { RepairChatTurn } from "../../shared/types/repair-chat.js";
import type { RepairUiState } from "../../shared/ui/state.js";
import { localizeRepairGuidanceLine } from "../runtime/guidance-text.js";
import { createRepairPanel } from "./panel-shell.js";

type TextFn = (
  path: string[],
  fallback: string,
  params?: Record<string, string | number>
) => string;

function formatAssistantSlot(slot: string, text?: TextFn): string {
  if (text !== undefined) {
    if (slot.toLowerCase() === "ai0")
      return text(["tacticalFeed", "slotLabel"], "Asistan AI {slot}", { slot: "0" });
    if (slot.toLowerCase() === "ai1")
      return text(["tacticalFeed", "slotLabel"], "Asistan AI {slot}", { slot: "1" });
    if (slot.toLowerCase() === "ai2")
      return text(["tacticalFeed", "slotLabel"], "Asistan AI {slot}", { slot: "2" });
    return slot.toUpperCase();
  }
  if (slot.toLowerCase() === "ai0") return "Assistant AI 0";
  if (slot.toLowerCase() === "ai1") return "Assistant AI 1";
  if (slot.toLowerCase() === "ai2") return "Assistant AI 2";
  return slot.toUpperCase();
}

export function formatRepairTacticalFeedStatusLine(state: RepairUiState, text?: TextFn): string {
  const dispatch = state.aiDispatch;
  const slot =
    text !== undefined
      ? formatAssistantSlot(dispatch.targetSlot, text)
      : formatAssistantSlot(dispatch.targetSlot);
  if (dispatch.status === "pending") {
    if (dispatch.activity === "evidence-research") {
      return text !== undefined
        ? text(["tacticalFeed", "researchGathering"], "{slot} bu cihaz için kanıt topluyor.", {
            slot,
          })
        : `${slot} is gathering evidence for this device.`;
    }
    if (dispatch.activity === "chat-reply") {
      return text !== undefined
        ? text(["tacticalFeed", "chatDrafting"], "{slot} bir cevap taslaklıyor.", { slot })
        : `${slot} is drafting a reply.`;
    }
    if (dispatch.activity === "risk-scan") {
      return dispatch.message ?? `${slot} is scanning session risks.`;
    }
    return text !== undefined
      ? text(["tacticalFeed", "statusChecking"], "{slot} son ölçümü kontrol ediyor.", { slot })
      : `${slot} is checking the latest measurement.`;
  }
  if (dispatch.status === "succeeded") {
    return (
      dispatch.message ??
      (dispatch.activity === "evidence-research"
        ? text !== undefined
          ? text(["tacticalFeed", "researchPrepared"], "{slot} bir kanıt paketi hazırladı.", {
              slot,
            })
          : `${slot} prepared an evidence pack.`
        : dispatch.activity === "chat-reply"
          ? text !== undefined
            ? text(["tacticalFeed", "chatReady"], "{slot} cevap hazır.", { slot })
            : `${slot} reply is ready.`
          : text !== undefined
            ? text(["tacticalFeed", "statusAddedNote"], "{slot} bir onarım notu ekledi.", {
                slot,
              })
            : `${slot} added a repair note.`)
    );
  }
  if (dispatch.status === "failed") {
    return (
      dispatch.message ??
      (dispatch.activity === "evidence-research"
        ? text !== undefined
          ? text(["tacticalFeed", "researchFailed"], "{slot} bir kanıt paketi hazırlayamadı.", {
              slot,
            })
          : `${slot} could not prepare an evidence pack.`
        : dispatch.activity === "chat-reply"
          ? text !== undefined
            ? text(["tacticalFeed", "chatFailed"], "{slot} bir cevap taslaklayamadı.", { slot })
            : `${slot} could not draft a reply.`
          : text !== undefined
            ? text(["tacticalFeed", "statusFailed"], "{slot} bir onarım notu ekleyemedi.", {
                slot,
              })
            : `${slot} could not add a repair note.`)
    );
  }

  return state.guidance.aiInterruption.shouldSpeak === false
    ? text !== undefined
      ? text(
          ["tacticalFeed", "quietMode"],
          "Sessiz mod: anlamlı bir değişiklik bekleniyor. {remaining} asistan uyarısı kaldı.",
          { remaining: state.guidance.aiInterruption.attentionBudget.remainingAiInterruptions }
        )
      : `Quiet mode: waiting for a meaningful change. ${state.guidance.aiInterruption.attentionBudget.remainingAiInterruptions} assistant prompts left.`
    : text !== undefined
      ? localizeRepairGuidanceLine(state.guidance.aiInterruption.toneLine, text)
      : state.guidance.aiInterruption.toneLine;
}

function hasActiveRepairSession(state: RepairUiState): boolean {
  return state.sessions.activeId !== null && state.sessions.detail !== null;
}

function isDictationReviewActive(state: RepairUiState): boolean {
  return (
    state.layout.voiceGuidance.handsBusyMode &&
    state.layout.interactionSettings.dictationSubmitMode === "send" &&
    state.chat.composerDraft.trim() !== ""
  );
}

function getChatModeText(state: RepairUiState, text?: TextFn): string {
  if (!hasActiveRepairSession(state)) {
    return text !== undefined
      ? text(["tacticalFeed", "chatStatus", "sessionRequired"], "Önce bir tamir oturumu aç")
      : "Open a repair session first";
  }
  const voice = state.layout.voiceGuidance;
  const settings = state.layout.interactionSettings;
  if (isDictationReviewActive(state))
    return text !== undefined
      ? text(["tacticalFeed", "chatStatus", "dictationReview"], "Sesli not onay bekliyor")
      : "Voice note waiting for confirmation";
  if (state.chat.pendingReplyId !== null)
    return text !== undefined
      ? text(["tacticalFeed", "chatStatus", "assistantPreparing"], "Asistan bir cevap hazırlıyor")
      : "Assistant is preparing a reply";
  if (voice.handsBusyMode && voice.ambientListeningState === "listening") {
    return settings.dictationSubmitMode === "send"
      ? text !== undefined
        ? text(
            ["tacticalFeed", "chatStatus", "handsFreeSend"],
            "Eller serbest: dikte ettikten sonra gönder veya sil de de"
          )
        : "Hands-free mode: say send or clear after dictation"
      : text !== undefined
        ? text(
            ["tacticalFeed", "chatStatus", "handsFreeComposer"],
            "Eller serbest: dikte edilen notlar taslakta kalır"
          )
        : "Hands-free mode: dictated notes stay in the composer";
  }
  return settings.autoReadAiReplies
    ? text !== undefined
      ? text(
          ["tacticalFeed", "chatStatus", "readAloud"],
          "Cevaplar tamir kontrollerinden sesli okunabilir"
        )
      : "Replies can be read aloud from repair controls"
    : text !== undefined
      ? text(["tacticalFeed", "chatStatus", "textOnly"], "Yazılı cevaplar")
      : "Text replies only";
}

/** Unified feed item type for interleaved rendering */
interface FeedTimelineItem {
  type: "feed" | "chat";
  occurredAt: string;
  feedItem?: RepairUiState["tacticalFeed"][number];
  chatTurn?: RepairChatTurn;
}

function buildInterleavedTimeline(state: RepairUiState): FeedTimelineItem[] {
  const items: FeedTimelineItem[] = [];

  for (const item of state.tacticalFeed) {
    items.push({ type: "feed", occurredAt: item.occurredAt, feedItem: item });
  }

  for (const turn of state.chat.turns) {
    items.push({ type: "chat", occurredAt: turn.occurredAt, chatTurn: turn });
  }

  items.sort((a, b) => {
    if (a.occurredAt < b.occurredAt) return -1;
    if (a.occurredAt > b.occurredAt) return 1;
    return 0;
  });

  return items;
}

export function renderTacticalFeedPanel(
  documentRef: Document,
  state: RepairUiState,
  text: TextFn
): HTMLElement {
  const hasSession = hasActiveRepairSession(state);
  const body = documentRef.createElement("div");
  body.className = "repair-panel__body repair-panel__body--column";

  const calmLine = documentRef.createElement("div");
  calmLine.className = "repair-feed-calmline";
  calmLine.textContent = formatRepairTacticalFeedStatusLine(state, text);
  body.append(calmLine);

  // -- Interleaved feed + chat list
  const list = documentRef.createElement("div");
  list.className = "repair-feed-list repair-feed-list--scroll";

  const timeline = buildInterleavedTimeline(state);

  for (const item of timeline) {
    if (item.type === "feed" && item.feedItem !== undefined) {
      const entry = documentRef.createElement("div");
      entry.className = `repair-feed-entry repair-feed-entry--${item.feedItem.severity}${state.workbench.focusedEventId === item.feedItem.eventId ? " repair-feed-entry--active" : ""}`;
      entry.dataset["repairAction"] = "jump-to-event";
      entry.dataset["eventId"] = item.feedItem.eventId;

      const header = documentRef.createElement("div");
      header.className = "repair-feed-entry__header";

      const badge = documentRef.createElement("span");
      badge.className = `repair-feed-entry__badge repair-feed-entry__badge--${item.feedItem.severity}`;
      badge.textContent = item.feedItem.badge;
      header.append(badge);

      const time = documentRef.createElement("span");
      time.className = "repair-feed-entry__time";
      time.textContent = item.feedItem.relativeLabel;
      header.append(time);

      entry.append(header);

      const bodyText = documentRef.createElement("div");
      bodyText.className = "repair-feed-entry__body";
      bodyText.textContent = item.feedItem.body;
      entry.append(bodyText);

      list.append(entry);
    } else if (item.type === "chat" && item.chatTurn !== undefined) {
      const turnEl = documentRef.createElement("div");
      turnEl.className = "repair-chat-turn";

      const header = documentRef.createElement("div");
      header.className = "repair-chat-turn__header";

      const role = documentRef.createElement("span");
      role.className = `repair-chat-turn__role repair-chat-turn__role--${item.chatTurn.role}`;
      role.textContent =
        item.chatTurn.role === "ai"
          ? text(["tacticalFeed", "chatRoles", "assistant"], "Asistan")
          : text(["tacticalFeed", "chatRoles", "you"], "Sen");
      header.append(role);

      const time = documentRef.createElement("span");
      time.className = "repair-chat-turn__time";
      time.textContent = new Date(item.chatTurn.occurredAt).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      header.append(time);

      turnEl.append(header);

      const bodyText = documentRef.createElement("div");
      bodyText.className = "repair-chat-turn__body";
      bodyText.textContent = item.chatTurn.text;
      turnEl.append(bodyText);

      list.append(turnEl);
    }
  }

  body.append(list);

  // -- Mode line (from chat panel)
  if (hasSession) {
    const mode = documentRef.createElement("div");
    mode.className = "repair-chat-mode";
    mode.textContent = getChatModeText(state, text);
    body.append(mode);
  }

  // -- Rich composer (from chat panel)
  const composer = documentRef.createElement("div");
  composer.className = "repair-feed-composer";
  composer.dataset["reviewState"] = isDictationReviewActive(state) ? "dictation-review" : "idle";

  if (isDictationReviewActive(state)) {
    const review = documentRef.createElement("div");
    review.className = "repair-feed-composer__review";
    review.textContent = text(
      ["tacticalFeed", "dictationReview"],
      "Sesli not hazır. Gönder de, Gönder'e bas veya sil ve tekrar dikte et."
    );
    composer.append(review);
  }

  const composerInput = documentRef.createElement("input");
  composerInput.className = "repair-feed-composer__input";
  composerInput.type = "text";
  composerInput.placeholder = hasSession
    ? text(["tacticalFeed", "composer"], "Tamir asistanına sor...")
    : "";
  composerInput.value = state.chat.composerDraft;
  composerInput.dataset["repairInput"] = "feed-composer";
  composer.append(composerInput);

  const composerButton = documentRef.createElement("button");
  composerButton.className = "repair-feed-composer__send";
  composerButton.type = "button";
  composerButton.textContent =
    state.chat.pendingReplyId === null
      ? text(["tacticalFeed", "send"], "Gönder")
      : text(["tacticalFeed", "chatStatus", "waiting"], "Bekliyor");
  composerButton.disabled = state.chat.pendingReplyId !== null;
  composerButton.dataset["repairAction"] = "send-chat";
  composer.append(composerButton);

  if (state.chat.composerDraft.trim() !== "") {
    const clearBtn = documentRef.createElement("button");
    clearBtn.className = "repair-feed-composer__clear";
    clearBtn.type = "button";
    clearBtn.textContent = text(["tacticalFeed", "clear"], "Sil");
    clearBtn.dataset["repairAction"] = "clear-chat-composer";
    composer.append(clearBtn);
  }

  body.append(composer);

  const hasRisk = state.tacticalFeed.some((i) => i.severity === "risk");

  return createRepairPanel(documentRef, {
    panelId: "tactical-feed",
    eyebrow: text(["tacticalFeed", "eyebrow"], "ASİSTAN"),
    title: text(["tacticalFeed", "title"], "Tamir Akışı"),
    statusDot: hasRisk ? "risk" : state.chat.pendingReplyId !== null ? "amber" : "live",
    collapsed: state.layout.collapsedPanels["tactical-feed"],
    noPanelControls: true,
    body,
  });
}
