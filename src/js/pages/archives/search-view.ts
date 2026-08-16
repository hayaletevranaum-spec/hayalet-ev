import type { TranslationParams } from "@shared/i18n.js";
import { AppI18n } from "../../modules/i18n/index.js";
import type { FileResult, MessageResult } from "./types.js";
import {
  escapeHtml,
  formatFileSize,
  getAccountLabel,
  getFileIcon,
  highlightSnippet,
} from "./text-utils.js";

function archivesT(key: string, params?: TranslationParams): string {
  return AppI18n.t(`app.archives.${key}`, params);
}

export function renderMessageResult(
  message: MessageResult,
  searchQuery: string,
  searchScope: string
): string {
  const snippet = highlightSnippet(message.snippet ?? message.content ?? "", searchQuery);
  const accountLabel = getAccountLabel(message.accountId);

  return `
      <div class="result-item glass-panel" data-conversation-id="${message.conversationId}">
        <div class="result-item-header">
          <span class="result-item-title">${escapeHtml(message.conversationTitle ?? archivesT("search.untitledConversation"))}</span>
          ${searchScope === "all" ? `<span class="result-item-account">${accountLabel}</span>` : ""}
        </div>
        <div class="result-item-snippet">${snippet}</div>
      </div>
    `;
}

export function renderFileResult(file: FileResult, searchScope: string): string {
  const icon = getFileIcon(file.mimeType);
  const size = formatFileSize(file.size);
  const accountLabel = getAccountLabel(file.accountId ?? "");

  return `
      <div class="result-item glass-panel" data-stored-path="${escapeHtml(file.storedPath ?? "")}">
        <div class="file-result">
          <span class="file-icon">${icon}</span>
          <div class="file-info">
            <div class="file-name">${escapeHtml(file.originalName ?? "")}</div>
            <div class="file-meta">
              ${escapeHtml(file.conversationTitle ?? archivesT("search.untitledConversation"))} · ${size}
              ${searchScope === "all" ? ` · ${accountLabel}` : ""}
            </div>
          </div>
        </div>
      </div>
    `;
}

export function switchSearchTab(
  tab: string,
  resultsMessagesEl: HTMLElement | null,
  resultsFilesEl: HTMLElement | null
): void {
  document.querySelectorAll(".search-tabs .tab-btn").forEach((btn) => {
    btn.classList.toggle("is-active", (btn as HTMLElement).dataset["tab"] === tab);
  });

  resultsMessagesEl?.classList.toggle("is-active", tab === "messages");
  resultsFilesEl?.classList.toggle("is-active", tab === "files");
}

export function clearSearchResultsView(args: {
  messagesCountEl: HTMLElement | null;
  filesCountEl: HTMLElement | null;
  resultsMessagesEl: HTMLElement | null;
  resultsFilesEl: HTMLElement | null;
  searchEmptyEl: HTMLElement | null;
}): void {
  const { messagesCountEl, filesCountEl, resultsMessagesEl, resultsFilesEl, searchEmptyEl } = args;

  if (messagesCountEl) messagesCountEl.textContent = "0";
  if (filesCountEl) filesCountEl.textContent = "0";
  if (resultsMessagesEl) resultsMessagesEl.innerHTML = "";
  if (resultsFilesEl) resultsFilesEl.innerHTML = "";
  searchEmptyEl?.classList.remove("is-hidden");
}

export function renderSearchResultsView(args: {
  searchResults: { messages: MessageResult[]; attachments: FileResult[] };
  searchQuery: string;
  searchScope: string;
  messagesCountEl: HTMLElement | null;
  filesCountEl: HTMLElement | null;
  searchEmptyEl: HTMLElement | null;
  resultsMessagesEl: HTMLElement | null;
  resultsFilesEl: HTMLElement | null;
  onNavigate: (result: MessageResult | FileResult, type: "message" | "file") => Promise<void>;
}): void {
  const {
    searchResults,
    searchQuery,
    searchScope,
    messagesCountEl,
    filesCountEl,
    searchEmptyEl,
    resultsMessagesEl,
    resultsFilesEl,
    onNavigate,
  } = args;
  const { messages, attachments } = searchResults;

  if (messagesCountEl) messagesCountEl.textContent = String(messages.length);
  if (filesCountEl) filesCountEl.textContent = String(attachments.length);

  const hasResults = messages.length > 0 || attachments.length > 0;
  searchEmptyEl?.classList.toggle("is-hidden", hasResults || searchQuery === "");

  if (resultsMessagesEl) {
    if (messages.length === 0) {
      resultsMessagesEl.innerHTML =
        searchQuery !== "" ? `<div class="no-results">${archivesT("search.noMessages")}</div>` : "";
    } else {
      resultsMessagesEl.innerHTML = messages
        .map((message) => renderMessageResult(message, searchQuery, searchScope))
        .join("");
    }

    resultsMessagesEl.querySelectorAll(".result-item").forEach((el: Element, index: number) => {
      const message = messages[index];
      if (message) {
        el.addEventListener("click", () => {
          void onNavigate(message, "message");
        });
      }
    });
  }

  if (resultsFilesEl) {
    if (attachments.length === 0) {
      resultsFilesEl.innerHTML =
        searchQuery !== "" ? `<div class="no-results">${archivesT("search.noFiles")}</div>` : "";
      return;
    }

    resultsFilesEl.innerHTML = attachments
      .map((attachment) => renderFileResult(attachment, searchScope))
      .join("");
    resultsFilesEl.querySelectorAll(".result-item").forEach((el: Element, index: number) => {
      const attachment = attachments[index];
      if (attachment) {
        el.addEventListener("click", () => {
          void onNavigate(attachment, "file");
        });
      }
    });
  }
}
