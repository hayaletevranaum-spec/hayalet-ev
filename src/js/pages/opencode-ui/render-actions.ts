import { escapeHtml } from "./chat-utils.js";
import { t } from "./i18n.js";
import { normalizeString, toCompactLabel, toWorkspaceRelativePath } from "./message-content.js";
import type { OpencodeUiTodoItem, OpencodeUiToolCall } from "./types.js";

type ByIdFn = <T extends HTMLElement>(id: string, guard?: (element: T) => boolean) => T | null;

export interface RenderContext {
  byId: ByIdFn;
  initialUsageText: string;
}

export function updateUsagePlaceholders(context: RenderContext, text: string): void {
  const usageValueEl = context.byId<HTMLElement>("usage-value");
  if (usageValueEl != null) {
    usageValueEl.textContent = "--";
  }

  const usageFillEl = context.byId<HTMLElement>("usage-fill");
  if (usageFillEl != null) {
    usageFillEl.classList.remove("is-full");
    usageFillEl.classList.add("is-empty");
  }

  const usageStatsEl = context.byId<HTMLElement>("usage-stats");
  if (usageStatsEl != null) {
    usageStatsEl.innerHTML = `<span class="ds-progress__stat">${escapeHtml(text)}</span>`;
  }
}

export function updateUsageFromSession(
  context: RenderContext,
  usage: Record<string, unknown> | undefined
): void {
  if (usage == null || typeof usage !== "object") {
    updateUsagePlaceholders(context, context.initialUsageText);
    return;
  }

  const usageRecord = usage;
  const promptTokens = Number(usageRecord["prompt_tokens"] ?? 0);
  const completionTokens = Number(usageRecord["completion_tokens"] ?? 0);
  const reasoningTokens = Number(usageRecord["reasoning_tokens"] ?? 0);
  const totalTokens = Number(usageRecord["total_tokens"] ?? promptTokens + completionTokens);

  if (!Number.isFinite(totalTokens) || totalTokens <= 0) {
    updateUsagePlaceholders(context, context.initialUsageText);
    return;
  }

  const usageValueEl = context.byId<HTMLElement>("usage-value");
  if (usageValueEl != null) {
    usageValueEl.textContent = String(totalTokens);
  }

  const usageFillEl = context.byId<HTMLElement>("usage-fill");
  if (usageFillEl != null) {
    usageFillEl.classList.remove("is-empty");
    usageFillEl.classList.add("is-full");
  }

  const usageStatsEl = context.byId<HTMLElement>("usage-stats");
  if (usageStatsEl != null) {
    let statsHtml =
      '<span class="ds-progress__stat">' +
      escapeHtml(t("usage.prompt")) +
      ': <span class="ds-progress__stat-value">' +
      String(promptTokens) +
      '</span></span><span class="ds-progress__stat">' +
      escapeHtml(t("usage.completion")) +
      ': <span class="ds-progress__stat-value">' +
      String(completionTokens) +
      "</span></span>";

    if (Number.isFinite(reasoningTokens) && reasoningTokens > 0) {
      statsHtml +=
        '<span class="ds-progress__stat">' +
        escapeHtml(t("usage.reasoning")) +
        ': <span class="ds-progress__stat-value">' +
        String(reasoningTokens) +
        "</span></span>";
    }

    usageStatsEl.innerHTML = statsHtml;
  }
}

function buildRightTabPanelCard(
  title: string,
  eyebrow: string,
  bodyMarkup: string,
  countLabel?: string
): string {
  const countMarkup =
    countLabel != null && countLabel !== ""
      ? '<span class="ds-panel__count">' + escapeHtml(countLabel) + "</span>"
      : "";

  return (
    '<div class="ds-right-panel-card">' +
    '<div class="ds-right-panel-card__meta">' +
    "<div>" +
    '<div class="ds-right-panel-card__eyebrow">' +
    escapeHtml(eyebrow) +
    "</div>" +
    '<div class="ds-right-panel-card__title">' +
    escapeHtml(title) +
    "</div>" +
    "</div>" +
    countMarkup +
    "</div>" +
    bodyMarkup +
    "</div>"
  );
}

function getTodoStatusLabel(status: string): string {
  switch (status) {
    case "completed":
      return t("panel.todoStatus.completed");
    case "in_progress":
      return t("panel.todoStatus.inProgress");
    case "blocked":
      return t("panel.todoStatus.blocked");
    case "cancelled":
    case "canceled":
      return t("panel.todoStatus.cancelled");
    case "pending":
    default:
      return t("panel.todoStatus.pending");
  }
}

function getTodoPriorityLabel(priority: string): string {
  switch (priority) {
    case "low":
      return t("panel.todoPriority.low");
    case "high":
      return t("panel.todoPriority.high");
    case "urgent":
      return t("panel.todoPriority.urgent");
    case "medium":
    default:
      return t("panel.todoPriority.medium");
  }
}

export function renderTodoPanel(context: RenderContext, todos: OpencodeUiTodoItem[]): void {
  const panel = context.byId<HTMLElement>("rtab-todo");
  if (panel == null) {
    return;
  }

  if (!Array.isArray(todos) || todos.length === 0) {
    panel.innerHTML = buildRightTabPanelCard(
      t("panel.todoTitle"),
      t("panel.todoEyebrow"),
      `<div class="ds-empty-state">${escapeHtml(t("panel.todoEmpty"))}</div>`,
      "0"
    );
    return;
  }

  const items = todos
    .map((todo) => {
      const content = normalizeString(todo.content).trim();
      if (content === "") {
        return "";
      }

      const statusRaw = normalizeString(todo.status).trim().toLowerCase();
      const priorityRaw = normalizeString(todo.priority).trim().toLowerCase();
      const status = statusRaw !== "" ? statusRaw : "pending";
      const priority = priorityRaw !== "" ? priorityRaw : "medium";
      return (
        '<div class="ds-todo-item ds-todo-item--' +
        escapeHtml(status) +
        '">' +
        '<div class="ds-todo-item__badges">' +
        '<span class="ds-todo-item__badge ds-todo-item__badge--status">' +
        escapeHtml(getTodoStatusLabel(status)) +
        "</span>" +
        '<span class="ds-todo-item__badge ds-todo-item__badge--priority">' +
        escapeHtml(getTodoPriorityLabel(priority)) +
        "</span>" +
        "</div>" +
        '<div class="ds-todo-item__content">' +
        escapeHtml(content) +
        "</div>" +
        "</div>"
      );
    })
    .filter((item) => item !== "");

  panel.innerHTML = buildRightTabPanelCard(
    t("panel.todoTitle"),
    t("panel.todoEyebrow"),
    '<div class="ds-todo-list">' + items.join("") + "</div>",
    String(items.length)
  );
}

export function renderFilesPanel(
  context: RenderContext,
  files: string[],
  workspacePath: string
): void {
  const panel = context.byId<HTMLElement>("rtab-files");
  if (panel == null) {
    return;
  }

  if (!Array.isArray(files) || files.length === 0) {
    panel.innerHTML = buildRightTabPanelCard(
      t("panel.filesTitle"),
      t("panel.filesEyebrow"),
      `<div class="ds-empty-state">${escapeHtml(t("panel.filesEmpty"))}</div>`,
      "0"
    );
    return;
  }

  const items = files
    .map((filePath) => {
      const fullPath = normalizeString(filePath).trim();
      if (fullPath === "") {
        return "";
      }

      const compactLabel = toCompactLabel(fullPath);
      const label = compactLabel !== "" ? compactLabel : fullPath;
      const relativePath = toWorkspaceRelativePath(fullPath, workspacePath);
      return (
        '<div class="ds-file-item" title="' +
        escapeHtml(fullPath) +
        '">' +
        '<div class="ds-file-item__name">' +
        escapeHtml(label) +
        "</div>" +
        '<div class="ds-file-item__path">' +
        escapeHtml(relativePath) +
        "</div>" +
        "</div>"
      );
    })
    .filter((item) => item !== "");

  if (items.length === 0) {
    panel.innerHTML = buildRightTabPanelCard(
      t("panel.filesTitle"),
      t("panel.filesEyebrow"),
      `<div class="ds-empty-state">${escapeHtml(t("panel.filesEmpty"))}</div>`,
      "0"
    );
    return;
  }

  panel.innerHTML = buildRightTabPanelCard(
    t("panel.filesTitle"),
    t("panel.filesEyebrow"),
    '<div class="ds-file-list">' + items.join("") + "</div>",
    String(items.length)
  );
}

export function createHistoricAssistantToolHost(context: RenderContext): HTMLElement | null {
  const chatMessages = context.byId<HTMLElement>("chat-messages");
  if (chatMessages == null) {
    return null;
  }

  const chatEmpty = context.byId<HTMLElement>("chat-empty");
  if (chatEmpty != null) {
    chatEmpty.classList.add("is-hidden");
  }

  const host = document.createElement("div");
  host.className = "ds-message ds-message--assistant";
  chatMessages.appendChild(host);
  return host;
}

export function renderHistoricToolCall(
  targetContainer: HTMLElement,
  toolCall: OpencodeUiToolCall
): void {
  const getStatusTone = (status: OpencodeUiToolCall["status"]): string => {
    switch (status) {
      case undefined:
      case "done":
        return "done";
      case "running":
        return "running";
      case "retrying":
        return "retrying";
      case "interrupted":
        return "interrupted";
      case "failed":
      case "error":
        return "failed";
      default:
        return "done";
    }
  };
  const getStatusLabel = (status: OpencodeUiToolCall["status"]): string => {
    switch (status) {
      case undefined:
      case "done":
        return t("message.toolCallDone");
      case "running":
        return t("message.toolCallRunning");
      case "retrying":
        return t("message.toolCallRetrying");
      case "interrupted":
        return t("message.toolCallInterrupted");
      case "failed":
        return t("message.toolCallFailed");
      case "error":
        return t("message.toolCallError");
      default:
        return t("message.toolCallDone");
    }
  };
  const summarizePayload = (value: string): string => {
    const compact = normalizeString(value).trim().replace(/\s+/g, " ");
    if (compact === "") {
      return "";
    }
    return compact.length > 88 ? `${compact.slice(0, 85)}...` : compact;
  };

  const card = document.createElement("div");
  card.className = "ds-tool-call";

  const args = normalizeString(toolCall.args);
  const result = normalizeString(toolCall.result);
  const detail = normalizeString(toolCall.detail);
  const argsPreview = summarizePayload(args);
  const detailPreview = summarizePayload(detail);
  const status = toolCall.status ?? "done";
  const statusTone = getStatusTone(status);
  const statusLabel = getStatusLabel(status);
  const previewText = argsPreview !== "" ? argsPreview : detailPreview;
  const hasDetails = args !== "" || result !== "" || detail !== "";

  card.innerHTML =
    '<button type="button" class="ds-tool-call__header"' +
    (hasDetails ? "" : ' disabled aria-disabled="true"') +
    ">" +
    '<span class="ds-tool-call__chevron">▸</span>' +
    '<span class="ds-tool-call__icon">⌘</span>' +
    '<span class="ds-tool-call__name">' +
    escapeHtml(toolCall.name) +
    "</span>" +
    (previewText !== ""
      ? '<span class="ds-tool-call__args" title="' +
        escapeHtml(args !== "" ? args : detail) +
        '">' +
        escapeHtml(previewText) +
        "</span>"
      : "") +
    '<span class="ds-tool-call__status ds-tool-call__status--' +
    escapeHtml(statusTone) +
    '">' +
    escapeHtml(statusLabel) +
    "</span>" +
    "</button>" +
    '<div class="ds-tool-call__body">' +
    (args !== ""
      ? '<div class="ds-tool-call__result"><strong>' +
        escapeHtml(t("message.toolCallArgsLabel")) +
        "</strong><br>" +
        escapeHtml(args) +
        "</div>"
      : "") +
    (detail !== ""
      ? '<div class="ds-tool-call__result"><strong>' +
        escapeHtml(t("message.toolCallDetailLabel")) +
        "</strong><br>" +
        escapeHtml(detail) +
        "</div>"
      : "") +
    (result !== ""
      ? '<div class="ds-tool-call__result"><strong>' +
        escapeHtml(t("message.toolCallResultLabel")) +
        "</strong><br>" +
        escapeHtml(result) +
        "</div>"
      : "") +
    "</div>";

  if (hasDetails) {
    card
      .querySelector<HTMLButtonElement>(".ds-tool-call__header")
      ?.addEventListener("click", () => {
        card.classList.toggle("ds-tool-call--open");
      });
  }

  targetContainer.appendChild(card);
}
