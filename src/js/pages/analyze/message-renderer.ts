import type { TranslationParams } from "@shared/i18n.js";
import { LogCategory } from "@shared/logging-core";
import { Logger } from "../../modules/logger/index.js";
import { AppState } from "../../modules/app-state.js";
import { AppI18n } from "../../modules/i18n/index.js";
import { VISIBLE_MESSAGE_COUNT, MESSAGE_HEIGHT_ESTIMATE } from "@limits";
import {
  buildAttachmentsByMessage,
  buildRenderSnapshot,
  canUseIncrementalAppend,
  getScrollTopAfterPrepend,
  shouldAutoScrollToBottom,
  shouldSkipRender,
  type RenderSnapshot,
} from "./render-cache.js";
import {
  isDbAttachmentsResult,
  isDbMessagesResult,
  normalizeAttachmentData,
  normalizeMessageItem,
  type AttachmentData,
  type MessageItem,
} from "./message-renderer-types.js";
import { createMessageBubble } from "./message-renderer-bubble.js";

export interface RenderCallbacks {
  onMessageAction?: (
    action: "read" | "prepend" | "append" | "speak",
    data: { provider: string; text: string; messageId: string }
  ) => void;
}

interface RenderState {
  allMessages: MessageItem[];
  visibleStart: number;
  visibleEnd: number;
  totalHeight: number;
  scrollTop: number;
  attachmentsByMessage: Record<string, AttachmentData[]>;
  attachmentsBasePath: string;
}

interface RenderPayload {
  conversationId: string;
  messages: MessageItem[];
  attachmentsByMessage: Record<string, AttachmentData[]>;
  needsVirtualization: boolean;
}

const renderStates = new Map<string, RenderState>();
const renderSnapshots = new Map<string, RenderSnapshot>();
const renderPayloads = new Map<string, RenderPayload>();

function analyzeRendererT(key: string, params?: TranslationParams): string {
  return AppI18n.t(`app.analyze.renderer.${key}`, params);
}

function buildMessagePlaceholder(message: string): string {
  return `<div class="message-placeholder">${message}</div>`;
}

export function resetMessageRenderState(provider: string): void {
  renderStates.delete(provider);
  renderSnapshots.delete(provider);
  renderPayloads.delete(provider);
}

function resolveScrollTarget(container: HTMLElement): HTMLElement {
  const virtualScroll = container.querySelector(".msg-virtual-scroll");
  return virtualScroll instanceof HTMLElement ? virtualScroll : container;
}

function scheduleScrollToBottom(container: HTMLElement, shouldScroll: boolean): void {
  if (!shouldScroll) {
    return;
  }

  const target = resolveScrollTarget(container);

  const raf = globalThis.requestAnimationFrame;
  if (typeof raf === "function") {
    raf(() => {
      target.scrollTop = target.scrollHeight;
    });
    return;
  }

  target.scrollTop = target.scrollHeight;
}

export async function renderMessages(
  provider: string,
  callbacks: RenderCallbacks = {}
): Promise<{ lastMessage: string }> {
  Logger.debug(LogCategory.ANALYZE, analyzeRendererT("logs.renderStarted", { provider }));

  const container = document.getElementById(`messages-${provider}`);
  const select = document.getElementById(`conversation-${provider}`) as HTMLSelectElement | null;

  Logger.debug(LogCategory.ANALYZE, analyzeRendererT("logs.elementsFound"), {
    hasContainer: !!container,
    hasSelect: !!select,
    selectValue: select?.value,
    selectOptionsCount: select?.options.length,
  });

  if (!container) {
    Logger.warn(LogCategory.ANALYZE, analyzeRendererT("logs.containerNotFound", { provider }));
    return { lastMessage: "" };
  }

  if (!select) {
    Logger.warn(LogCategory.ANALYZE, analyzeRendererT("logs.selectNotFound", { provider }));
    resetMessageRenderState(provider);
    container.innerHTML = buildMessagePlaceholder(
      analyzeRendererT("placeholders.loadingConversationList")
    );
    return { lastMessage: "" };
  }

  const selected = select.selectedOptions[0];

  Logger.debug(LogCategory.ANALYZE, analyzeRendererT("logs.conversationSelection"), {
    selectedValue: selected?.value,
    hasSelected: selected !== undefined,
  });

  if (!selected || selected.value === "new") {
    resetMessageRenderState(provider);
    container.innerHTML = buildMessagePlaceholder(
      analyzeRendererT("placeholders.startingNewConversation")
    );
    return { lastMessage: "" };
  }

  try {
    const conversationId = selected.value;
    const accountInfo = AppState.getAccountForSlot(provider);

    Logger.debug(LogCategory.ANALYZE, analyzeRendererT("logs.fetchingMessagesFromDb"), {
      accountId: accountInfo?.id,
      conversationId,
    });

    const accountId = accountInfo?.id ?? "";
    if (accountId === "") {
      resetMessageRenderState(provider);
      container.innerHTML = buildMessagePlaceholder(
        analyzeRendererT("placeholders.accountInfoMissing")
      );
      return { lastMessage: "" };
    }

    const electronApi = window.electronAPI;
    if (electronApi === undefined) {
      resetMessageRenderState(provider);
      container.innerHTML = buildMessagePlaceholder(
        analyzeRendererT("placeholders.electronApiUnavailable")
      );
      return { lastMessage: "" };
    }

    const dbGetMessages = electronApi.dbGetMessages;
    const rawMessagesResult: unknown =
      typeof dbGetMessages === "function"
        ? await dbGetMessages({ accountId, conversationId })
        : undefined;
    const messagesResult = isDbMessagesResult(rawMessagesResult) ? rawMessagesResult : {};
    const rawMessages = Array.isArray(messagesResult.data) ? messagesResult.data : [];
    const messages = rawMessages.flatMap((message) => {
      const normalized = normalizeMessageItem(message);
      return normalized !== null ? [normalized] : [];
    });

    Logger.debug(LogCategory.ANALYZE, analyzeRendererT("logs.dbQueryResult"), {
      messagesCount: messages.length,
      hasResult: rawMessagesResult !== undefined && rawMessagesResult !== null,
      hasData: Array.isArray(messagesResult.data),
    });
    let attachments: AttachmentData[] = [];
    try {
      Logger.debug(LogCategory.ANALYZE, analyzeRendererT("logs.fetchingAttachments"), {
        accountId,
        conversationId,
      });
      const dbGetAttachments = electronApi["dbGetAttachments"];
      const rawAttachmentsResult: unknown =
        typeof dbGetAttachments === "function"
          ? await dbGetAttachments({
              accountId,
              conversationId,
            })
          : undefined;
      const attachmentsResult = isDbAttachmentsResult(rawAttachmentsResult)
        ? rawAttachmentsResult
        : {};
      const rawAttachments = Array.isArray(attachmentsResult.data) ? attachmentsResult.data : [];
      attachments = rawAttachments.flatMap((attachment) => {
        const normalized = normalizeAttachmentData(attachment);
        return normalized !== null ? [normalized] : [];
      });
      Logger.debug(LogCategory.ANALYZE, analyzeRendererT("logs.attachmentsFetched"), {
        count: attachments.length,
        success: attachmentsResult.success === true,
      });
    } catch (err) {
      Logger.warn(LogCategory.ANALYZE, analyzeRendererT("logs.attachmentsFetchFailed"), {
        error: err,
      });
    }

    const attachmentsByMessage = buildAttachmentsByMessage(attachments);

    const attachmentsBasePath = `data/${accountId}/attachments/${conversationId}`;

    const items = messages;
    const lastAssistant = [...items]
      .reverse()
      .find((m) => m.role === "assistant" && (m.content ?? m.text ?? "").trim().length > 0);

    const nextSnapshot = buildRenderSnapshot(conversationId, items, attachments);
    const previousSnapshot = renderSnapshots.get(provider);
    const previousPayload = renderPayloads.get(provider);
    const totalMessages = items.length;
    const needsVirtualization = totalMessages > VISIBLE_MESSAGE_COUNT;
    const hasRenderedContent =
      container.querySelector(".msg-bubble") !== null ||
      container.querySelector(".msg-virtual-scroll") !== null;

    const scrollTargetBefore = resolveScrollTarget(container);
    const shouldStickToBottom =
      !hasRenderedContent ||
      shouldAutoScrollToBottom({
        scrollTop: scrollTargetBefore.scrollTop,
        clientHeight: scrollTargetBefore.clientHeight,
        scrollHeight: scrollTargetBefore.scrollHeight,
      });

    if (hasRenderedContent && shouldSkipRender(previousSnapshot, nextSnapshot)) {
      Logger.debug(LogCategory.ANALYZE, analyzeRendererT("logs.skipRerender"), {
        provider,
        conversationId,
      });
      renderPayloads.set(provider, {
        conversationId,
        messages: items,
        attachmentsByMessage,
        needsVirtualization,
      });
      scheduleScrollToBottom(container, shouldStickToBottom);
      return { lastMessage: lastAssistant?.text ?? lastAssistant?.content ?? "" };
    }

    const canTryIncrementalAppend =
      hasRenderedContent &&
      !needsVirtualization &&
      previousPayload?.needsVirtualization === false &&
      previousPayload.conversationId === conversationId;

    if (canTryIncrementalAppend) {
      const existingBubbleCount = container.querySelectorAll(".msg-bubble").length;
      const appendDecision = canUseIncrementalAppend({
        previousMessages: previousPayload.messages,
        nextMessages: items,
        previousAttachmentsByMessage: previousPayload.attachmentsByMessage,
        nextAttachmentsByMessage: attachmentsByMessage,
      });

      if (existingBubbleCount >= previousPayload.messages.length && appendDecision.canAppend) {
        const appendedItems = items.slice(appendDecision.appendStart);
        appendedItems.forEach((msg) => {
          const msgAttachments = attachmentsByMessage[msg.id] ?? [];
          const bubble = createMessageBubble(
            msg,
            provider,
            attachmentsBasePath,
            msgAttachments,
            callbacks
          );
          container.appendChild(bubble);
        });

        renderStates.delete(provider);
        renderSnapshots.set(provider, nextSnapshot);
        renderPayloads.set(provider, {
          conversationId,
          messages: items,
          attachmentsByMessage,
          needsVirtualization,
        });
        scheduleScrollToBottom(container, shouldStickToBottom);
        return { lastMessage: lastAssistant?.text ?? lastAssistant?.content ?? "" };
      }
    }

    container.innerHTML = "";

    if (needsVirtualization) {
      const scrollContainer = document.createElement("div");
      scrollContainer.className = "msg-virtual-scroll";

      const contentContainer = document.createElement("div");
      contentContainer.className = "msg-virtual-content";
      const totalHeight = totalMessages * MESSAGE_HEIGHT_ESTIMATE;
      // NOTE: Virtualized list heights are runtime-derived from message count.
      contentContainer.style.height = `${totalHeight}px`;

      const visibleStart = Math.max(0, totalMessages - VISIBLE_MESSAGE_COUNT);
      const visibleEnd = totalMessages;

      renderStates.set(provider, {
        allMessages: items,
        visibleStart,
        visibleEnd,
        totalHeight,
        scrollTop: scrollContainer.scrollTop,
        attachmentsByMessage,
        attachmentsBasePath,
      });

      // NOTE: Virtualization spacers depend on runtime message counts.
      const spacerTop = document.createElement("div");
      spacerTop.style.height = `${visibleStart * MESSAGE_HEIGHT_ESTIMATE}px`;
      contentContainer.appendChild(spacerTop);

      const visibleItems = items.slice(visibleStart, visibleEnd);
      visibleItems.forEach((msg) => {
        const msgAttachments = attachmentsByMessage[msg.id] ?? [];
        const bubble = createMessageBubble(
          msg,
          provider,
          attachmentsBasePath,
          msgAttachments,
          callbacks
        );
        contentContainer.appendChild(bubble);
      });

      const spacerBottom = document.createElement("div");
      spacerBottom.style.height = `${(totalMessages - visibleEnd) * MESSAGE_HEIGHT_ESTIMATE}px`;
      contentContainer.appendChild(spacerBottom);

      scrollContainer.appendChild(contentContainer);
      container.appendChild(scrollContainer);

      if (visibleStart > 0) {
        const loadMoreBtn = document.createElement("button");
        loadMoreBtn.className = "load-more-btn btn btn-secondary btn-sm";
        loadMoreBtn.textContent = analyzeRendererT("actions.loadMore", { count: visibleStart });
        loadMoreBtn.onclick = (): void => {
          loadMoreMessages(provider, container, callbacks);
        };
        container.insertBefore(loadMoreBtn, scrollContainer);
      }

      scheduleScrollToBottom(container, shouldStickToBottom);
    } else {
      renderStates.delete(provider);
      items.forEach((msg) => {
        const msgAttachments = attachmentsByMessage[msg.id] ?? [];
        const bubble = createMessageBubble(
          msg,
          provider,
          attachmentsBasePath,
          msgAttachments,
          callbacks
        );
        container.appendChild(bubble);
      });

      scheduleScrollToBottom(container, shouldStickToBottom);
    }

    renderSnapshots.set(provider, nextSnapshot);
    renderPayloads.set(provider, {
      conversationId,
      messages: items,
      attachmentsByMessage,
      needsVirtualization,
    });

    return { lastMessage: lastAssistant?.text ?? lastAssistant?.content ?? "" };
  } catch (_err) {
    resetMessageRenderState(provider);
    container.innerHTML = buildMessagePlaceholder(
      analyzeRendererT("placeholders.messagesReadFailed")
    );
    return { lastMessage: "" };
  }
}

function loadMoreMessages(
  provider: string,
  container: HTMLElement,
  callbacks: RenderCallbacks
): void {
  const state = renderStates.get(provider);
  if (!state) return;

  const newVisibleStart = Math.max(0, state.visibleStart - VISIBLE_MESSAGE_COUNT);
  if (newVisibleStart === state.visibleStart) return;

  const additionalMessages = state.allMessages.slice(newVisibleStart, state.visibleStart);

  const scrollContainer = container.querySelector(".msg-virtual-scroll");
  if (!(scrollContainer instanceof HTMLElement)) return;
  const contentContainer = scrollContainer.querySelector(".msg-virtual-content");
  if (!(contentContainer instanceof HTMLElement)) return;

  const previousHeight = contentContainer.scrollHeight;
  const previousScrollTop = scrollContainer.scrollTop;

  const spacerTop = contentContainer.firstChild;
  if (spacerTop instanceof HTMLElement) {
    // NOTE: Virtualized spacers use runtime heights based on scroll state.
    spacerTop.style.height = `${newVisibleStart * MESSAGE_HEIGHT_ESTIMATE}px`;
  }

  const fragment = document.createDocumentFragment();
  additionalMessages.forEach((msg) => {
    const msgAttachments = state.attachmentsByMessage[msg.id] ?? [];
    const bubble = createMessageBubble(
      msg,
      provider,
      state.attachmentsBasePath,
      msgAttachments,
      callbacks
    );
    fragment.appendChild(bubble);
  });

  const firstVisibleBubble = contentContainer.children[1];
  if (firstVisibleBubble) {
    contentContainer.insertBefore(fragment, firstVisibleBubble);
  }

  const nextHeight = contentContainer.scrollHeight;
  scrollContainer.scrollTop = getScrollTopAfterPrepend({
    previousScrollTop,
    previousHeight,
    nextHeight,
  });

  state.visibleStart = newVisibleStart;
  state.scrollTop = scrollContainer.scrollTop;

  const loadMoreBtn = container.querySelector(".load-more-btn");
  if (loadMoreBtn) {
    if (newVisibleStart === 0) {
      loadMoreBtn.remove();
    } else {
      loadMoreBtn.textContent = analyzeRendererT("actions.loadMore", {
        count: newVisibleStart,
      });
    }
  }
}
