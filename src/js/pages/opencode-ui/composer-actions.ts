import { apiCall } from "./api.js";
import { addMessage } from "./chat-utils.js";
import {
  buildOutgoingAttachmentPreview,
  buildDataUrl,
  createClipboardTextAttachment,
  dedupeComposerAttachments,
  extensionFromMime,
  fileToComposerAttachment,
  renderAttachmentTrayHtml,
} from "./attachments.js";
import { t } from "./i18n.js";
import {
  extractAssistantMessageContent,
  extractLatestAssistantTextPart,
} from "./message-content.js";
import {
  getRovoInteractionActivationSnapshot,
  refreshRovoInteractionRuntime,
} from "./interaction-runtime.js";
import { getInteractionModeLabel, loadInteractionSystemPrompt } from "./interaction-mode.js";
import { buildRuntimeErrorNotice } from "./notice-utils.js";
import { parseRovoInteraction } from "../../modules/rovo-interactions/parser.js";
import type {
  ComposerAttachment,
  OpencodeUiMessageBlock,
  OpencodeUiMessageNotice,
  RuntimeState,
  RovoInteractionMode,
} from "./types.js";

type ByIdFn = <T extends HTMLElement>(id: string, guard?: (element: T) => boolean) => T | null;

interface BuildMessageRequestInput {
  text: string;
  modelId: string | null;
  providerId: string | null;
  agentId?: string | null;
  reasoningEffort?: string | null;
  modelOptions?: Record<string, unknown> | null;
  attachments?: ComposerAttachment[];
  system?: string | null;
}

interface ComposerUiContext {
  runtime: RuntimeState;
  byId: ByIdFn;
  showToast: (message: string) => void;
  syncInteractionModeUi?: () => void;
  persistInteractionMode?: (mode: RovoInteractionMode) => Promise<void>;
  ensureActiveSession: () => Promise<string>;
  loadSessionListAndRender: (options?: {
    preserveActive?: boolean;
    syncSelectionToTab?: boolean;
  }) => Promise<void>;
  withHistorySyncFallback: (fallbackMessage: {
    text: string;
    blocks?: OpencodeUiMessageBlock[];
    notices?: OpencodeUiMessageNotice[];
  }) => Promise<void>;
  scrollChatToBottom: (force?: boolean) => void;
}

export function buildMessageRequestBody(input: BuildMessageRequestInput): Record<string, unknown> {
  const parts: Array<Record<string, unknown>> = [];
  const text = input.text.trim();
  if (text !== "") {
    parts.push({ type: "text", text });
  }

  const attachments = Array.isArray(input.attachments) ? input.attachments : [];
  for (const attachment of attachments) {
    if (attachment.base64 === "" || attachment.name === "") {
      continue;
    }

    parts.push({
      type: "file",
      filename: attachment.name,
      name: attachment.name,
      mime: attachment.mimeType,
      media_type: attachment.mimeType,
      url: buildDataUrl(attachment.mimeType, attachment.base64),
      data: attachment.base64,
      base64: attachment.base64,
    });
  }

  const body: Record<string, unknown> = { parts };

  if (
    input.modelId != null &&
    input.modelId !== "" &&
    input.providerId != null &&
    input.providerId !== ""
  ) {
    const modelPayload: Record<string, unknown> = {
      providerID: input.providerId,
      modelID: input.modelId,
    };

    if (
      input.modelOptions != null &&
      typeof input.modelOptions === "object" &&
      Object.keys(input.modelOptions).length > 0
    ) {
      modelPayload["options"] = { ...input.modelOptions };
    } else if (input.reasoningEffort != null && input.reasoningEffort !== "") {
      modelPayload["options"] = {
        reasoningEffort: input.reasoningEffort,
      };
    }

    body["model"] = modelPayload;
  }

  if (input.agentId != null && input.agentId !== "") {
    body["agent"] = input.agentId;
  }

  if (input.system != null && input.system.trim() !== "") {
    body["system"] = input.system.trim();
  }

  return body;
}

async function resolveInteractionSystemPrompt(mode: RovoInteractionMode): Promise<string | null> {
  if (mode === "off") {
    return null;
  }

  const snapshot = getRovoInteractionActivationSnapshot();
  if (snapshot.active !== true) {
    const refreshed = await refreshRovoInteractionRuntime();
    if (refreshed.active !== true) {
      return null;
    }
  }

  return await loadInteractionSystemPrompt(mode);
}

export function setComposerSendButtonState(runtime: RuntimeState, byId: ByIdFn): void {
  const sendBtn = byId<HTMLButtonElement>("send-btn");
  const chatInput = byId<HTMLTextAreaElement>("chat-input");
  if (sendBtn == null || chatInput == null) {
    return;
  }

  if (runtime.isSubmitting) {
    sendBtn.disabled = false;
    sendBtn.textContent = "...";
    sendBtn.setAttribute("data-mode", "stop");
    return;
  }

  sendBtn.textContent = "↑";
  sendBtn.removeAttribute("data-mode");
  sendBtn.disabled = chatInput.value.trim() === "" && runtime.stagedAttachments.length === 0;
}

export function renderComposerAttachmentTray(runtime: RuntimeState, byId: ByIdFn): void {
  const tray = byId<HTMLElement>("clipboard-preview-area");
  if (tray == null) {
    return;
  }

  if (runtime.stagedAttachments.length === 0) {
    tray.classList.add("is-hidden");
    tray.innerHTML = "";
    return;
  }

  tray.classList.remove("is-hidden");
  tray.innerHTML = renderAttachmentTrayHtml(runtime.stagedAttachments);
}

export function setComposerAttachments(
  runtime: RuntimeState,
  attachments: ComposerAttachment[],
  byId: ByIdFn
): void {
  runtime.stagedAttachments = attachments;
  renderComposerAttachmentTray(runtime, byId);
  setComposerSendButtonState(runtime, byId);
}

export function removeComposerAttachmentById(
  runtime: RuntimeState,
  attachmentId: string,
  byId: ByIdFn
): void {
  setComposerAttachments(
    runtime,
    runtime.stagedAttachments.filter((attachment) => attachment.id !== attachmentId),
    byId
  );
}

export function stageComposerAttachments(
  runtime: RuntimeState,
  attachments: ComposerAttachment[],
  context: Pick<ComposerUiContext, "byId" | "showToast">
): void {
  if (attachments.length === 0) {
    return;
  }

  const next = dedupeComposerAttachments(runtime.stagedAttachments, attachments);
  const addedCount = next.length - runtime.stagedAttachments.length;
  setComposerAttachments(runtime, next, context.byId);

  if (addedCount > 0) {
    context.showToast(t("chat.attachmentReadyCount", { count: addedCount }));
  } else {
    context.showToast(t("chat.attachmentDuplicate"));
  }
}

export async function stageComposerFileList(
  runtime: RuntimeState,
  files: FileList | File[],
  source: ComposerAttachment["source"],
  context: Pick<ComposerUiContext, "byId" | "showToast">
): Promise<void> {
  const entries = Array.from(files);
  if (entries.length === 0) {
    return;
  }

  const attachments = await Promise.all(
    entries.map(async (file) => await fileToComposerAttachment(file, source))
  );
  stageComposerAttachments(runtime, attachments, context);
}

export async function readClipboardAttachmentsFromEvent(
  event: ClipboardEvent,
  runtime: RuntimeState,
  context: Pick<ComposerUiContext, "byId" | "showToast">
): Promise<boolean> {
  const clipboardData = event.clipboardData;
  if (clipboardData == null) {
    return false;
  }

  const directFiles = Array.from(clipboardData.files);
  const itemFiles = Array.from(clipboardData.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file != null);
  const files = [...directFiles, ...itemFiles];
  if (files.length > 0) {
    event.preventDefault();
    await stageComposerFileList(runtime, files, "clipboard", context);
    return true;
  }

  return false;
}

export async function readClipboardAttachmentsFromSystem(): Promise<ComposerAttachment[]> {
  const clipboardApi = navigator.clipboard as Clipboard & {
    read?: () => Promise<ClipboardItem[]>;
  };

  if (typeof clipboardApi.read === "function") {
    const items = await clipboardApi.read();
    const attachmentGroups = await Promise.all(
      items.map(async (item) => {
        const imageTypes = item.types.filter((type) => type.startsWith("image/"));
        return await Promise.all(
          imageTypes.map(async (type) => {
            const blob = await item.getType(type);
            const extension = extensionFromMime(type);
            const file = new File([blob], `clipboard-${Date.now()}.${extension}`, { type });
            return await fileToComposerAttachment(file, "clipboard");
          })
        );
      })
    );
    const attachments = attachmentGroups.flat();

    if (attachments.length > 0) {
      return attachments;
    }
  }

  if (typeof navigator.clipboard.readText === "function") {
    const text = await navigator.clipboard.readText();
    const textAttachment = createClipboardTextAttachment(text);
    if (textAttachment != null) {
      return [textAttachment];
    }
  }

  return [];
}

export async function sendComposerMessage(context: ComposerUiContext): Promise<void> {
  const chatInput = context.byId<HTMLTextAreaElement>("chat-input");
  if (chatInput == null) {
    return;
  }

  if (context.runtime.isSubmitting) {
    return;
  }

  const text = chatInput.value.trim();
  const stagedAttachments = [...context.runtime.stagedAttachments];
  if (text === "" && stagedAttachments.length === 0) {
    setComposerSendButtonState(context.runtime, context.byId);
    return;
  }

  context.runtime.isSubmitting = true;
  setComposerSendButtonState(context.runtime, context.byId);

  const sessionId = await context.ensureActiveSession();
  context.runtime.submittingSessionId = sessionId;
  await context.loadSessionListAndRender({ preserveActive: true });

  const previousText = chatInput.value;
  chatInput.value = "";
  // NOTE: Auto-resize relies on runtime scrollHeight; keep inline height reset.
  chatInput.style.height = "";
  addMessage("user", text, undefined, buildOutgoingAttachmentPreview(stagedAttachments));
  context.scrollChatToBottom(true);

  try {
    const activeInteractionMode = context.runtime.activeInteractionMode;
    const modelMeta =
      context.runtime.activeModelKey != null
        ? context.runtime.modelMetaByKey[context.runtime.activeModelKey]
        : undefined;
    const selectedVariant =
      modelMeta?.variantOptions.find(
        (variant) => variant.key === context.runtime.activeReasoningEffort
      ) ?? null;
    let interactionSystemPrompt: string | null = null;
    if (activeInteractionMode !== "off") {
      try {
        interactionSystemPrompt = await resolveInteractionSystemPrompt(activeInteractionMode);
        if (interactionSystemPrompt === null) {
          context.showToast(
            t("interaction.mode.inactive", {
              mode: getInteractionModeLabel(activeInteractionMode),
            })
          );
        }
      } catch (error) {
        context.showToast(
          t("interaction.mode.loadFailed", {
            mode: getInteractionModeLabel(activeInteractionMode),
            message: error instanceof Error && error.message !== "" ? error.message : String(error),
          })
        );
      }
    }

    const body = buildMessageRequestBody({
      text,
      modelId: modelMeta?.modelId ?? null,
      providerId: modelMeta?.providerId ?? null,
      agentId: context.runtime.activeAgentId,
      reasoningEffort: context.runtime.activeReasoningEffort,
      modelOptions: selectedVariant?.options ?? null,
      attachments: stagedAttachments,
      system: interactionSystemPrompt,
    });

    const response = await apiCall<unknown>(
      "POST",
      `/session/${encodeURIComponent(sessionId)}/message`,
      body
    );
    const fallbackMessage = extractAssistantMessageContent(response);
    const interactionCandidateText = extractLatestAssistantTextPart(response);
    const parsedInteractionCandidate =
      interactionCandidateText !== "" ? parseRovoInteraction(interactionCandidateText) : null;
    const renderableFallbackMessage =
      parsedInteractionCandidate !== null
        ? {
            text: interactionCandidateText,
          }
        : fallbackMessage;
    if (
      activeInteractionMode !== "off" &&
      interactionSystemPrompt !== null &&
      interactionCandidateText !== "" &&
      parsedInteractionCandidate === null
    ) {
      context.showToast(
        t("interaction.mode.tokenMissing", {
          mode: getInteractionModeLabel(activeInteractionMode),
        })
      );
    }

    await context.withHistorySyncFallback(renderableFallbackMessage);
    setComposerAttachments(context.runtime, [], context.byId);
  } catch (error) {
    chatInput.value = previousText;
    setComposerAttachments(context.runtime, stagedAttachments, context.byId);
    const detail = error instanceof Error && error.message !== "" ? error.message : String(error);
    addMessage("assistant", "", undefined, undefined, {
      notices: [buildRuntimeErrorNotice(detail, { defaultTitleKey: "chat.sendFailedTitle" })],
    });
    context.scrollChatToBottom(true);
  } finally {
    context.runtime.isSubmitting = false;
    context.runtime.submittingSessionId = null;
    setComposerSendButtonState(context.runtime, context.byId);
    await context.loadSessionListAndRender({ preserveActive: true });
  }
}
