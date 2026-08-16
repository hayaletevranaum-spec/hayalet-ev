import { AppI18n } from "../../modules/i18n/index.js";
import { AppState } from "../../modules/app-state.js";
import { formatErrorWithDetail } from "../../../../shared/i18n/error-detail.js";
import {
  getProtocolTokenProvider,
  isProtocolTokenTag,
  resolveProtocolTokenDeletionRange,
  type ProtocolTokenTag,
} from "../../../../shared/protocol-tags.js";
import { RoomProtocolRegistry } from "../../modules/rooms/room-protocol-registry.js";
const PROTOCOL_TOKEN_PATTERN = /<(AI0|AI1|AI2|US1)>/g;
const PROTOCOL_BLOCK_NODES = new Set(["DIV", "P"]);

function archivesProtocolT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.archives.protocol.${key}`, params);
}

function normalizeProtocolText(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function getProtocolTokenSlot(tag: ProtocolTokenTag): "ai0" | "ai1" | "ai2" | "us1" {
  return getProtocolTokenProvider(tag);
}

function getProtocolTokenLabel(tag: ProtocolTokenTag): { slotLabel: string; nickname: string } {
  const slot = getProtocolTokenSlot(tag);
  return {
    slotLabel: tag.slice(1, -1),
    nickname: AppState.getNickname(slot),
  };
}

function createProtocolTokenNode(tag: ProtocolTokenTag): HTMLSpanElement {
  const tokenEl = document.createElement("span");
  const { slotLabel, nickname } = getProtocolTokenLabel(tag);

  tokenEl.className = "protocol-token-chip";
  tokenEl.contentEditable = "false";
  tokenEl.dataset["protocolTag"] = tag;
  tokenEl.dataset["rawLength"] = String(tag.length);
  tokenEl.setAttribute("role", "mark");
  tokenEl.setAttribute("aria-label", `${slotLabel}: ${nickname}`);

  const slotEl = document.createElement("span");
  slotEl.className = "protocol-token-chip__slot";
  slotEl.textContent = slotLabel;

  const nicknameEl = document.createElement("span");
  nicknameEl.className = "protocol-token-chip__name";
  nicknameEl.textContent = nickname;

  tokenEl.append(slotEl, nicknameEl);
  return tokenEl;
}

function appendProtocolTextSegment(root: DocumentFragment | HTMLElement, segment: string): void {
  if (segment === "") {
    return;
  }

  root.append(document.createTextNode(segment));
}

function renderProtocolEditorContent(editorEl: HTMLElement, rawValue: string): void {
  const normalizedValue = normalizeProtocolText(rawValue);
  const fragment = document.createDocumentFragment();
  const lines = normalizedValue.split("\n");

  lines.forEach((line, lineIndex) => {
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    PROTOCOL_TOKEN_PATTERN.lastIndex = 0;
    match = PROTOCOL_TOKEN_PATTERN.exec(line);
    while (match !== null) {
      const matchIndex = match.index;
      appendProtocolTextSegment(fragment, line.slice(lastIndex, matchIndex));
      const tokenValue = match[0];
      if (isProtocolTokenTag(tokenValue)) {
        fragment.append(createProtocolTokenNode(tokenValue));
      } else {
        appendProtocolTextSegment(fragment, tokenValue);
      }
      lastIndex = matchIndex + tokenValue.length;
      match = PROTOCOL_TOKEN_PATTERN.exec(line);
    }

    appendProtocolTextSegment(fragment, line.slice(lastIndex));
    if (lineIndex < lines.length - 1) {
      fragment.append(document.createElement("br"));
    }
  });

  editorEl.replaceChildren(fragment);
}

function getProtocolNodeRawLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent?.length ?? 0;
  }

  if (node instanceof HTMLElement && typeof node.dataset["protocolTag"] === "string") {
    return node.dataset["protocolTag"].length;
  }

  if (node instanceof HTMLBRElement) {
    return 1;
  }

  return Array.from(node.childNodes).reduce((sum, child) => sum + getProtocolNodeRawLength(child), 0);
}

function serializeProtocolNode(node: Node, parts: string[], isRoot: boolean): void {
  if (node.nodeType === Node.TEXT_NODE) {
    parts.push(node.textContent ?? "");
    return;
  }

  if (node instanceof HTMLElement && typeof node.dataset["protocolTag"] === "string") {
    parts.push(node.dataset["protocolTag"]);
    return;
  }

  if (node instanceof HTMLBRElement) {
    parts.push("\n");
    return;
  }

  const isBlock = isRoot === false && node instanceof HTMLElement && PROTOCOL_BLOCK_NODES.has(node.tagName);
  Array.from(node.childNodes).forEach((child) => {
    serializeProtocolNode(child, parts, false);
  });
  if (isBlock === true && node.nextSibling !== null) {
    parts.push("\n");
  }
}

function serializeProtocolEditorContent(editorEl: HTMLElement): string {
  const parts: string[] = [];
  serializeProtocolNode(editorEl, parts, true);
  return normalizeProtocolText(parts.join(""));
}

function getRawOffsetWithinNode(node: Node, offset: number): number {
  if (node.nodeType === Node.TEXT_NODE) {
    const length = node.textContent?.length ?? 0;
    return Math.max(0, Math.min(offset, length));
  }

  if (node instanceof HTMLElement && typeof node.dataset["protocolTag"] === "string") {
    return offset <= 0 ? 0 : node.dataset["protocolTag"].length;
  }

  if (node instanceof HTMLBRElement) {
    return offset <= 0 ? 0 : 1;
  }

  const children = Array.from(node.childNodes);
  let total = 0;
  for (let index = 0; index < Math.min(offset, children.length); index += 1) {
    const child = children[index];
    if (child === undefined) {
      continue;
    }
    total += getProtocolNodeRawLength(child);
  }
  return total;
}

function computeRawOffsetForPoint(root: HTMLElement, targetNode: Node, targetOffset: number): number {
  let total = 0;

  const visit = (node: Node): boolean => {
    if (node === targetNode) {
      total += getRawOffsetWithinNode(node, targetOffset);
      return true;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      total += node.textContent?.length ?? 0;
      return false;
    }

    if (node instanceof HTMLElement && typeof node.dataset["protocolTag"] === "string") {
      total += node.dataset["protocolTag"].length;
      return false;
    }

    if (node instanceof HTMLBRElement) {
      total += 1;
      return false;
    }

    if (node === root) {
      const children = Array.from(node.childNodes);
      if (targetNode === root) {
        total += getRawOffsetWithinNode(root, targetOffset);
        return true;
      }

      for (const child of children) {
        if (visit(child)) {
          return true;
        }
      }
      return false;
    }

    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (visit(child)) {
        return true;
      }
    }
    return false;
  };

  visit(root);
  return total;
}

function getProtocolEditorSelection(editorEl: HTMLElement): { start: number; end: number } {
  const selection = window.getSelection();
  if (selection === null || selection.rangeCount === 0) {
    const length = serializeProtocolEditorContent(editorEl).length;
    return { start: length, end: length };
  }

  const range = selection.getRangeAt(0);
  if (editorEl.contains(range.startContainer) === false || editorEl.contains(range.endContainer) === false) {
    const length = serializeProtocolEditorContent(editorEl).length;
    return { start: length, end: length };
  }

  return {
    start: computeRawOffsetForPoint(editorEl, range.startContainer, range.startOffset),
    end: computeRawOffsetForPoint(editorEl, range.endContainer, range.endOffset),
  };
}

function resolveDomPointForRawOffset(editorEl: HTMLElement, rawOffset: number): { node: Node; offset: number } {
  let remaining = Math.max(0, rawOffset);

  const visit = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const textLength = node.textContent?.length ?? 0;
      if (remaining <= textLength) {
        return { node, offset: remaining };
      }
      remaining -= textLength;
      return null;
    }

    if (node instanceof HTMLElement && typeof node.dataset["protocolTag"] === "string") {
      const tokenLength = node.dataset["protocolTag"].length;
      if (remaining <= tokenLength) {
        const parentNode = node.parentNode ?? editorEl;
        const childIndex = Array.from(parentNode.childNodes).indexOf(node);
        return {
          node: parentNode,
          offset: remaining === 0 ? childIndex : childIndex + 1,
        };
      }
      remaining -= tokenLength;
      return null;
    }

    if (node instanceof HTMLBRElement) {
      if (remaining <= 1) {
        const parentNode = node.parentNode ?? editorEl;
        const childIndex = Array.from(parentNode.childNodes).indexOf(node);
        return {
          node: parentNode,
          offset: remaining === 0 ? childIndex : childIndex + 1,
        };
      }
      remaining -= 1;
      return null;
    }

    const children = Array.from(node.childNodes);
    for (const child of children) {
      const resolved = visit(child);
      if (resolved !== null) {
        return resolved;
      }
    }

    if (node === editorEl) {
      return {
        node: editorEl,
        offset: editorEl.childNodes.length,
      };
    }

    return null;
  };

  return (
    visit(editorEl) ?? {
      node: editorEl,
      offset: editorEl.childNodes.length,
    }
  );
}

function restoreProtocolEditorSelection(editorEl: HTMLElement, rawOffset: number): void {
  const selection = window.getSelection();
  if (selection === null) {
    return;
  }

  const point = resolveDomPointForRawOffset(editorEl, rawOffset);
  const range = document.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function replaceProtocolEditorRange(
  editorEl: HTMLElement,
  textareaEl: HTMLTextAreaElement,
  start: number,
  end: number,
  replacement: string
): void {
  const currentRaw = serializeProtocolEditorContent(editorEl);
  const nextRaw = `${currentRaw.slice(0, start)}${replacement}${currentRaw.slice(end)}`;
  textareaEl.value = nextRaw;
  renderProtocolEditorContent(editorEl, nextRaw);
  restoreProtocolEditorSelection(editorEl, start + replacement.length);
  editorEl.focus();
}

function syncProtocolEditorFromDom(editorEl: HTMLElement, textareaEl: HTMLTextAreaElement): void {
  const selection = getProtocolEditorSelection(editorEl);
  const rawValue = serializeProtocolEditorContent(editorEl);
  textareaEl.value = rawValue;
  renderProtocolEditorContent(editorEl, rawValue);
  restoreProtocolEditorSelection(editorEl, selection.end);
}

function handleProtocolEditorKeydown(event: KeyboardEvent): void {
  const editorEl = event.currentTarget;
  if (!(editorEl instanceof HTMLElement)) {
    return;
  }

  const textareaEl = document.getElementById("protocol-textarea");
  if (!(textareaEl instanceof HTMLTextAreaElement)) {
    return;
  }

  const selection = getProtocolEditorSelection(editorEl);
  if (event.key === "Enter") {
    event.preventDefault();
    replaceProtocolEditorRange(editorEl, textareaEl, selection.start, selection.end, "\n");
    return;
  }

  if (event.key === "Backspace" && selection.start === selection.end) {
    const rawValue = serializeProtocolEditorContent(editorEl);
    const tokenToRemove = resolveProtocolTokenDeletionRange(rawValue, selection.start, "backward");
    if (tokenToRemove !== null) {
      event.preventDefault();
      replaceProtocolEditorRange(
        editorEl,
        textareaEl,
        tokenToRemove.start,
        tokenToRemove.end,
        ""
      );
      return;
    }
  }

  if (event.key === "Delete" && selection.start === selection.end) {
    const rawValue = serializeProtocolEditorContent(editorEl);
    const tokenToRemove = resolveProtocolTokenDeletionRange(rawValue, selection.start, "forward");
    if (tokenToRemove !== null) {
      event.preventDefault();
      replaceProtocolEditorRange(
        editorEl,
        textareaEl,
        tokenToRemove.start,
        tokenToRemove.end,
        ""
      );
    }
  }
}

function handleProtocolEditorPaste(event: ClipboardEvent): void {
  const editorEl = event.currentTarget;
  if (!(editorEl instanceof HTMLElement)) {
    return;
  }

  const textareaEl = document.getElementById("protocol-textarea");
  if (!(textareaEl instanceof HTMLTextAreaElement)) {
    return;
  }

  const pastedText = event.clipboardData?.getData("text/plain") ?? "";
  event.preventDefault();
  const selection = getProtocolEditorSelection(editorEl);
  replaceProtocolEditorRange(editorEl, textareaEl, selection.start, selection.end, pastedText);
}

function handleProtocolEditorInput(event: Event): void {
  const editorEl = event.currentTarget;
  if (!(editorEl instanceof HTMLElement)) {
    return;
  }

  const textareaEl = document.getElementById("protocol-textarea");
  if (!(textareaEl instanceof HTMLTextAreaElement)) {
    return;
  }

  syncProtocolEditorFromDom(editorEl, textareaEl);
}

export function bindProtocolEditor(args: {
  protocolEditorEl: HTMLElement | null;
  protocolTextareaEl: HTMLTextAreaElement | null;
}): void {
  const { protocolEditorEl, protocolTextareaEl } = args;
  if (!(protocolEditorEl instanceof HTMLElement) || !(protocolTextareaEl instanceof HTMLTextAreaElement)) {
    return;
  }

  if (protocolEditorEl.dataset["protocolEditorBound"] === "true") {
    return;
  }

  protocolEditorEl.dataset["protocolEditorBound"] = "true";
  protocolEditorEl.addEventListener("keydown", handleProtocolEditorKeydown);
  protocolEditorEl.addEventListener("paste", handleProtocolEditorPaste);
  protocolEditorEl.addEventListener("input", handleProtocolEditorInput);
  protocolTextareaEl.value = normalizeProtocolText(protocolTextareaEl.value);
  renderProtocolEditorContent(protocolEditorEl, protocolTextareaEl.value);
}

export function refreshProtocolTagButtons(protocolTagButtonsEl: HTMLElement | null): void {
  protocolTagButtonsEl?.querySelectorAll<HTMLElement>(".protocol-tag-btn").forEach((button) => {
    const tag = button.dataset["tag"];
    if (tag === undefined || isProtocolTokenTag(tag) === false) {
      return;
    }

    const { slotLabel, nickname } = getProtocolTokenLabel(tag);
    button.textContent = `${slotLabel}: ${nickname}`;
    button.title = tag;
    button.setAttribute("aria-label", `${slotLabel}: ${nickname}`);
  });
}

export function refreshProtocolEditorTokens(args: {
  protocolEditorEl: HTMLElement | null;
  protocolTextareaEl: HTMLTextAreaElement | null;
}): void {
  const { protocolEditorEl, protocolTextareaEl } = args;
  if (!(protocolEditorEl instanceof HTMLElement) || !(protocolTextareaEl instanceof HTMLTextAreaElement)) {
    return;
  }

  renderProtocolEditorContent(protocolEditorEl, protocolTextareaEl.value);
}

export function readProtocolEditorValue(args: {
  protocolEditorEl: HTMLElement | null;
  protocolTextareaEl: HTMLTextAreaElement | null;
}): string {
  const { protocolEditorEl, protocolTextareaEl } = args;
  if (!(protocolEditorEl instanceof HTMLElement) || !(protocolTextareaEl instanceof HTMLTextAreaElement)) {
    return protocolTextareaEl?.value ?? "";
  }

  const rawValue = serializeProtocolEditorContent(protocolEditorEl);
  protocolTextareaEl.value = rawValue;
  return rawValue;
}

export async function loadProtocolsFromApi(
  electronApi: typeof window.electronAPI | undefined
): Promise<Record<string, string>> {
  if (electronApi === undefined) {
    return await RoomProtocolRegistry.mergeProtocolMap({}, { locale: AppI18n.getLocale() });
  }

  const loadProtocols = electronApi['loadProtocols'] as (() => Promise<{ success: boolean; protocols?: Record<string, string> }>) | undefined;
  if (typeof loadProtocols !== "function") {
    return await RoomProtocolRegistry.mergeProtocolMap({}, { locale: AppI18n.getLocale() });
  }
  const result = await loadProtocols();
  if (result.success === true && result.protocols !== undefined) {
    return await RoomProtocolRegistry.mergeProtocolMap(result.protocols, {
      locale: AppI18n.getLocale(),
    });
  }
  return await RoomProtocolRegistry.mergeProtocolMap({}, { locale: AppI18n.getLocale() });
}

export function renderProtocolListView(args: {
  protocolListEl: HTMLElement | null;
  protocols: Record<string, string>;
  selectedProtocolKey: string | null;
  onSelect: (key: string) => void;
}): void {
  const { protocolListEl, protocols, selectedProtocolKey, onSelect } = args;
  if (!protocolListEl) return;

  const keys = Object.keys(protocols);
  if (keys.length === 0) {
    protocolListEl.innerHTML = `<div class="empty">${archivesProtocolT("empty")}</div>`;
    return;
  }

  protocolListEl.innerHTML = "";
  keys.forEach((key) => {
    const item = document.createElement("div");
    item.className = "protocol-item";
    if (key === selectedProtocolKey) {
      item.classList.add("is-active");
    }

    const icon = document.createElement("span");
    icon.className = "protocol-item-icon";
    icon.textContent = "📄";

    const name = document.createElement("span");
    name.className = "protocol-item-name";
    name.textContent = key;

    item.appendChild(icon);
    item.appendChild(name);

    item.addEventListener("click", () => {
      onSelect(key);
    });

    protocolListEl.appendChild(item);
  });
}

export function applyProtocolSelectionView(args: {
  key: string;
  protocols: Record<string, string>;
  protocolEditorTitleEl: HTMLElement | null;
  protocolEditorEl: HTMLElement | null;
  protocolTextareaEl: HTMLTextAreaElement | null;
  protocolEmptyEl: HTMLElement | null;
  protocolSaveBtn: HTMLElement | null;
  protocolTagButtonsEl: HTMLElement | null;
  setStatus: (text: string, type?: string) => void;
}): void {
  const {
    key,
    protocols,
    protocolEditorTitleEl,
    protocolEditorEl,
    protocolTextareaEl,
    protocolEmptyEl,
    protocolSaveBtn,
    protocolTagButtonsEl,
    setStatus,
  } = args;

  if (protocolEditorTitleEl) {
    protocolEditorTitleEl.textContent = key;
  }

  if (protocolTextareaEl) {
    protocolTextareaEl.value = protocols[key] ?? "";
    protocolTextareaEl.classList.remove("is-hidden");
  }

  if (protocolEditorEl) {
    protocolEditorEl.classList.remove("is-hidden");
    renderProtocolEditorContent(protocolEditorEl, protocolTextareaEl?.value ?? "");
  }

  refreshProtocolTagButtons(protocolTagButtonsEl);
  protocolEmptyEl?.classList.add("is-hidden");
  protocolSaveBtn?.classList.remove("is-hidden");
  protocolTagButtonsEl?.classList.remove("is-hidden");
  setStatus("");
}

export async function saveProtocolContent(args: {
  electronApi: typeof window.electronAPI | undefined;
  selectedProtocolKey: string;
  content: string;
}): Promise<{ success: boolean; message?: string }> {
  const { electronApi, selectedProtocolKey, content } = args;

  if (electronApi === undefined) {
    return { success: false, message: archivesProtocolT("electronApiUnavailable") };
  }

  const saveProtocol = electronApi['saveProtocol'] as ((key: string, content: string) => Promise<{ success: boolean; message?: string }>) | undefined;
  if (typeof saveProtocol !== "function") {
    return { success: false, message: archivesProtocolT("electronApiUnavailable") };
  }
  const result = await saveProtocol(selectedProtocolKey, content);
  if (typeof result.message === "string" && result.message !== "") {
    return {
      success: result.success === true,
      message:
        result.success === true
          ? result.message
          : formatErrorWithDetail(archivesProtocolT("status.saveFailed"), result.message),
    };
  }
  return {
    success: result.success === true,
  };
}

export function insertTagAtCursor(args: {
  protocolEditorEl: HTMLElement | null;
  protocolTextareaEl: HTMLTextAreaElement | null;
  tag: string;
}): void {
  const { protocolEditorEl, protocolTextareaEl, tag } = args;
  if (
    !(protocolEditorEl instanceof HTMLElement) ||
    !(protocolTextareaEl instanceof HTMLTextAreaElement) ||
    isProtocolTokenTag(tag) === false
  ) {
    return;
  }

  protocolEditorEl.focus();
  const selection = getProtocolEditorSelection(protocolEditorEl);
  replaceProtocolEditorRange(protocolEditorEl, protocolTextareaEl, selection.start, selection.end, tag);
}

export function setProtocolStatusView(
  protocolStatusEl: HTMLElement | null,
  text: string,
  type: string = "info"
): void {
  if (!protocolStatusEl) return;
  protocolStatusEl.textContent = text;
  protocolStatusEl.className = `form-hint is-${type}`;
}
