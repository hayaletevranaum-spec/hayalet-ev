import {
  attachmentKindBadge,
  attachmentKindFromMediaType,
  buildAttachmentPreviewUrl,
  formatAttachmentSize,
  normalizeMessageAttachment,
} from "./attachments.js";
import { formatTime, t } from "./i18n.js";
import { buildAssistantInteractionRenderPlan } from "./interaction-renderer.js";
import type {
  OpencodeUiMessageAttachment,
  OpencodeUiMessageAttachmentKind,
  OpencodeUiMessageBlock,
  OpencodeUiMessageNotice,
} from "./types.js";

type MessageFileInput = Array<unknown>;

export interface AddMessageOptions {
  blocks?: OpencodeUiMessageBlock[] | undefined;
  notices?: OpencodeUiMessageNotice[] | undefined;
  renderFn?: (text: string) => string;
}

export interface AssistantMessageVisibilityInput {
  blocks?: OpencodeUiMessageBlock[] | undefined;
  files?: MessageFileInput | undefined;
  hasInteractiveRenderer?: boolean | undefined;
  notices?: OpencodeUiMessageNotice[] | undefined;
  text: string;
}

export function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function resolveAddMessageOptions(
  optionsOrRenderFn?: AddMessageOptions | ((text: string) => string)
): AddMessageOptions {
  if (typeof optionsOrRenderFn === "function") {
    return { renderFn: optionsOrRenderFn };
  }

  return optionsOrRenderFn ?? {};
}

function normalizeMessageFiles(files?: MessageFileInput): OpencodeUiMessageAttachment[] {
  if (!Array.isArray(files)) {
    return [];
  }

  return files
    .map((file) => normalizeMessageAttachment(file))
    .filter((file): file is OpencodeUiMessageAttachment => file !== null);
}

function normalizeMessageNotices(notices?: OpencodeUiMessageNotice[]): OpencodeUiMessageNotice[] {
  if (!Array.isArray(notices)) {
    return [];
  }

  const normalized: OpencodeUiMessageNotice[] = [];
  notices.forEach((notice) => {
    const title = notice.title.trim();
    if (title === "") {
      return;
    }

    const detail = typeof notice.detail === "string" ? notice.detail.trim() : "";
    const meta = typeof notice.meta === "string" ? notice.meta.trim() : "";
    normalized.push({
      tone: notice.tone,
      title,
      ...(detail !== "" ? { detail } : {}),
      ...(meta !== "" ? { meta } : {}),
    });
  });
  return normalized;
}

function normalizeMessageBlocks(blocks?: OpencodeUiMessageBlock[]): OpencodeUiMessageBlock[] {
  if (!Array.isArray(blocks)) {
    return [];
  }

  const normalized: OpencodeUiMessageBlock[] = [];
  blocks.forEach((block) => {
    const title = typeof block.title === "string" ? block.title.trim() : "";
    const text = typeof block.text === "string" ? block.text.trim() : "";
    const meta = typeof block.meta === "string" ? block.meta.trim() : "";
    const items = Array.isArray(block.items)
      ? block.items
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter((item) => item !== "")
      : [];

    if (title === "" && text === "" && meta === "" && items.length === 0) {
      return;
    }

    const previous = normalized[normalized.length - 1];
    if (block.kind === "markdown" && previous?.kind === "markdown") {
      previous.text = [typeof previous.text === "string" ? previous.text.trim() : "", text]
        .filter((value) => value !== "")
        .join("\n");
      return;
    }

    normalized.push({
      kind: block.kind,
      ...(title !== "" ? { title } : {}),
      ...(text !== "" ? { text } : {}),
      ...(meta !== "" ? { meta } : {}),
      ...(items.length > 0 ? { items } : {}),
    });
  });
  return normalized;
}

export function shouldSkipAssistantMessage(input: AssistantMessageVisibilityInput): boolean {
  const hasBlocks = normalizeMessageBlocks(input.blocks).length > 0;
  const hasFiles = normalizeMessageFiles(input.files).length > 0;
  const hasNotices = normalizeMessageNotices(input.notices).length > 0;
  return (
    input.text.trim() === "" &&
    hasBlocks !== true &&
    hasFiles !== true &&
    hasNotices !== true &&
    input.hasInteractiveRenderer !== true
  );
}

function attachmentKindLabel(kind: OpencodeUiMessageAttachmentKind): string {
  switch (kind) {
    case "image":
      return t("chat.attachmentKind.image");
    case "text":
      return t("chat.attachmentKind.text");
    case "pdf":
      return t("chat.attachmentKind.pdf");
    case "code":
      return t("chat.attachmentKind.code");
    case "archive":
      return t("chat.attachmentKind.archive");
    case "file":
    default:
      return t("chat.attachmentKind.file");
  }
}

function attachmentSourceLabel(source: OpencodeUiMessageAttachment["source"] | undefined): string {
  switch (source) {
    case undefined:
      return t("chat.attachmentSourceFile");
    case "clipboard":
      return t("chat.attachmentSourceClipboard");
    case "file-picker":
      return t("chat.attachmentSourceFile");
    case "history":
      return t("chat.attachmentSourceHistory");
    default:
      return t("chat.attachmentSourceFile");
  }
}

function createAttachmentCard(attachment: OpencodeUiMessageAttachment): HTMLElement {
  const resolvedKind =
    attachment.kind ??
    attachmentKindFromMediaType(
      attachment.media_type ?? "",
      attachment.fileName ?? attachment.name
    );
  const previewUrl =
    attachment.previewUrl ??
    buildAttachmentPreviewUrl(
      {
        media_type: attachment.media_type,
        previewUrl: attachment.previewUrl,
        url: attachment.url,
        data: attachment.data,
        base64: attachment.base64,
      },
      attachment.fileName ?? attachment.name
    ) ??
    undefined;
  const card = document.createElement("article");
  card.className = "ds-attachment-card ds-attachment-card--message";
  card.title = attachment.name;

  const preview = document.createElement("div");
  preview.className =
    previewUrl != null && previewUrl !== ""
      ? "ds-attachment-card__preview"
      : "ds-attachment-card__preview ds-attachment-card__preview--icon";

  if (previewUrl != null && previewUrl !== "") {
    const image = document.createElement("img");
    image.className = "ds-attachment-card__image";
    image.src = previewUrl;
    image.alt = attachment.name;
    preview.appendChild(image);
  } else {
    preview.textContent = attachmentKindBadge(resolvedKind);
  }

  const body = document.createElement("div");
  body.className = "ds-attachment-card__body";

  const meta = document.createElement("div");
  meta.className = "ds-attachment-card__meta";
  const sizeText = attachment.size != null ? formatAttachmentSize(attachment.size) : "";
  meta.textContent = [attachmentKindLabel(resolvedKind), sizeText]
    .filter((value) => value !== "")
    .join(" • ");

  const name = document.createElement("div");
  name.className = "ds-attachment-card__name";
  name.textContent = attachment.fileName ?? attachment.name;

  const source = document.createElement("div");
  source.className = "ds-attachment-card__source";
  source.textContent = attachmentSourceLabel(attachment.source);

  body.append(meta, name, source);
  card.append(preview, body);
  return card;
}

function createNoticeBlock(notice: OpencodeUiMessageNotice): HTMLElement {
  const block = document.createElement("div");
  block.className = `ds-message-notice ds-message-notice--${notice.tone}`;

  const title = document.createElement("div");
  title.className = "ds-message-notice__title";
  title.textContent = notice.title;
  block.appendChild(title);

  if (notice.detail != null && notice.detail !== "") {
    const detail = document.createElement("div");
    detail.className = "ds-message-notice__detail";
    detail.textContent = notice.detail;
    block.appendChild(detail);
  }

  if (notice.meta != null && notice.meta !== "") {
    const meta = document.createElement("div");
    meta.className = "ds-message-notice__meta";
    meta.textContent = notice.meta;
    block.appendChild(meta);
  }

  return block;
}

function createAssistantMessageBlock(
  block: OpencodeUiMessageBlock,
  renderFn?: (text: string) => string
): HTMLElement | null {
  if (block.kind === "markdown") {
    const text = typeof block.text === "string" ? block.text.trim() : "";
    if (text === "") {
      return null;
    }

    const contentDiv = document.createElement("div");
    contentDiv.className = "ds-message__content";
    contentDiv.innerHTML = renderFn ? renderFn(text) : escapeHtml(text).replace(/\n/g, "<br>");
    return contentDiv;
  }

  const section = document.createElement("section");
  section.className = `ds-message-section ds-message-section--${block.kind}`;

  if (typeof block.title === "string" && block.title.trim() !== "") {
    const header = document.createElement("div");
    header.className = "ds-message-section__title";
    header.textContent = block.title;
    section.appendChild(header);
  }

  if (typeof block.text === "string" && block.text.trim() !== "") {
    const body = document.createElement("div");
    body.className = "ds-message-section__body";
    body.textContent = block.text;
    section.appendChild(body);
  }

  if (typeof block.meta === "string" && block.meta.trim() !== "") {
    const meta = document.createElement("div");
    meta.className = "ds-message-section__meta";
    meta.textContent = block.meta;
    section.appendChild(meta);
  }

  if (Array.isArray(block.items) && block.items.length > 0) {
    const list = document.createElement("ul");
    list.className = "ds-message-section__list";
    block.items.forEach((item) => {
      const listItem = document.createElement("li");
      listItem.className = "ds-message-section__list-item";
      listItem.textContent = item;
      list.appendChild(listItem);
    });
    section.appendChild(list);
  }

  return section;
}

function appendAssistantMessageBlocks(
  bubbleDiv: HTMLElement,
  blocks: OpencodeUiMessageBlock[],
  renderFn?: (text: string) => string
): void {
  const normalizedBlocks = normalizeMessageBlocks(blocks);
  if (normalizedBlocks.length === 0) {
    return;
  }

  bubbleDiv.classList.add("ds-markdown");
  const stack = document.createElement("div");
  stack.className = "ds-message-sections";
  normalizedBlocks.forEach((block) => {
    const section = createAssistantMessageBlock(block, renderFn);
    if (section != null) {
      stack.appendChild(section);
    }
  });

  if (stack.childElementCount > 0) {
    bubbleDiv.appendChild(stack);
  }
}

function buildCopyText(target: HTMLElement): string {
  const clone = target.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".ds-msg-copy, .ds-message__role").forEach((element) => {
    element.remove();
  });
  return clone.innerText.trim();
}

export function addMessage(
  role: string,
  text: string,
  extra?: string,
  files?: MessageFileInput,
  optionsOrRenderFn?: AddMessageOptions | ((text: string) => string)
): HTMLElement | null {
  const chatMessages = document.getElementById("chat-messages");
  if (chatMessages == null) {
    return null;
  }

  const chatEmpty = document.getElementById("chat-empty");
  const options = resolveAddMessageOptions(optionsOrRenderFn);
  const attachments = normalizeMessageFiles(files);
  const blocks = normalizeMessageBlocks(options.blocks);
  const notices = normalizeMessageNotices(options.notices);
  const interactionPlan = role === "assistant" ? buildAssistantInteractionRenderPlan(text) : null;
  const visibleText = interactionPlan?.displayText ?? text;

  if (
    role === "assistant" &&
    shouldSkipAssistantMessage({
      text: visibleText,
      blocks,
      files,
      notices,
      hasInteractiveRenderer: interactionPlan?.renderInto !== undefined,
    })
  ) {
    return null;
  }

  if (chatEmpty != null) {
    chatEmpty.classList.add("is-hidden");
  }

  const msgDiv = document.createElement("div");
  msgDiv.className = `ds-message ds-message--${role}`;
  if (notices.length > 0) {
    msgDiv.classList.add("ds-message--has-notice");
  }
  if (attachments.length > 0) {
    msgDiv.classList.add("ds-message--has-files");
  }

  const bubbleDiv = document.createElement("div");
  bubbleDiv.className = "ds-message__bubble";

  const roleBadge = document.createElement("span");
  roleBadge.className = "ds-message__role";
  roleBadge.textContent = role === "assistant" ? t("chat.roleAssistant") : t("chat.roleUser");
  bubbleDiv.appendChild(roleBadge);

  if (role === "assistant" && interactionPlan?.renderInto !== undefined) {
    const contentDiv = document.createElement("div");
    contentDiv.className = "ds-message__content";
    bubbleDiv.classList.add("ds-message__bubble--interactive");
    interactionPlan.renderInto(contentDiv);
    bubbleDiv.appendChild(contentDiv);
  } else if (role === "assistant" && blocks.length > 0) {
    appendAssistantMessageBlocks(bubbleDiv, blocks, options.renderFn);
  } else if (visibleText.trim() !== "") {
    const contentDiv = document.createElement("div");
    contentDiv.className = "ds-message__content";
    if (role === "assistant") {
      bubbleDiv.classList.add("ds-markdown");
      contentDiv.innerHTML = options.renderFn
        ? options.renderFn(visibleText)
        : escapeHtml(visibleText).replace(/\n/g, "<br>");
    } else {
      bubbleDiv.classList.add("ds-message__bubble--plain");
      contentDiv.textContent = visibleText;
    }
    bubbleDiv.appendChild(contentDiv);
  } else {
    bubbleDiv.classList.add("ds-message__bubble--plain", "ds-message__bubble--notice-only");
  }

  if (notices.length > 0) {
    const noticeStack = document.createElement("div");
    noticeStack.className = "ds-message-notices";
    notices.forEach((notice) => {
      noticeStack.appendChild(createNoticeBlock(notice));
    });
    bubbleDiv.appendChild(noticeStack);
  }

  if (attachments.length > 0) {
    const attachmentList = document.createElement("div");
    attachmentList.className = "ds-file-chips ds-file-chips--cards";
    attachments.forEach((attachment) => {
      attachmentList.appendChild(createAttachmentCard(attachment));
    });
    bubbleDiv.appendChild(attachmentList);
  }

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "ds-msg-copy";
  copyBtn.textContent = t("chat.copyAction");
  copyBtn.title = t("chat.copyMessageTitle");
  copyBtn.setAttribute("aria-label", t("chat.copyMessageTitle"));
  copyBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const copyText = buildCopyText(bubbleDiv);
    if (copyText === "") {
      return;
    }

    void navigator.clipboard.writeText(copyText).then(() => {
      copyBtn.textContent = t("chat.copyStateCopied");
      window.setTimeout(() => {
        copyBtn.textContent = t("chat.copyAction");
      }, 1500);
    });
  });
  bubbleDiv.appendChild(copyBtn);

  const stamp = formatTime(new Date());
  const timeDiv = document.createElement("div");
  timeDiv.className = "ds-message__meta";
  timeDiv.title = extra != null && extra !== "" ? `${stamp} · ${extra}` : stamp;
  timeDiv.textContent = extra ?? "";

  msgDiv.append(bubbleDiv, timeDiv);
  chatMessages.appendChild(msgDiv);
  return bubbleDiv;
}
