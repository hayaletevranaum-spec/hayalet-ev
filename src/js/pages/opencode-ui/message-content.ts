import type { OpencodeUiMessageBlock, OpencodeUiSessionMessage } from "./types.js";
import { t } from "./i18n.js";

export function normalizeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function toCompactLabel(value: unknown): string {
  const raw = normalizeString(value).trim();
  if (raw === "") {
    return "";
  }

  const slashParts = raw.split("/");
  const lastSlash = slashParts[slashParts.length - 1] ?? raw;
  const backslashParts = lastSlash.split("\\");
  return (backslashParts[backslashParts.length - 1] ?? lastSlash).trim();
}

export function toWorkspaceRelativePath(filePath: unknown, workspacePath: string): string {
  const raw = normalizeString(filePath).trim();
  if (raw === "") {
    return "";
  }

  const workspace = normalizeString(workspacePath)
    .trim()
    .replace(/[\\/]+$/, "");
  if (workspace === "") {
    return raw;
  }

  if (raw === workspace) {
    return ".";
  }

  if (raw.startsWith(`${workspace}/`) || raw.startsWith(`${workspace}\\`)) {
    return raw.slice(workspace.length + 1);
  }

  return raw;
}

function flattenAssistantBlock(block: OpencodeUiMessageBlock): string {
  const lines = [
    normalizeString(block.title).trim(),
    normalizeString(block.text).trim(),
    normalizeString(block.meta).trim(),
  ];
  if (Array.isArray(block.items) && block.items.length > 0) {
    lines.push(...block.items.map((item) => `- ${item}`));
  }

  return lines
    .filter((line) => line !== "")
    .join("\n")
    .trim();
}

function appendAssistantBlock(
  blocks: OpencodeUiMessageBlock[],
  block: OpencodeUiMessageBlock | null
): void {
  if (block == null) {
    return;
  }

  if (block.kind === "markdown") {
    const text = normalizeString(block.text).trim();
    if (text === "") {
      return;
    }

    const previous = blocks[blocks.length - 1];
    if (previous?.kind === "markdown") {
      previous.text =
        normalizeString(previous.text).trim() !== ""
          ? `${normalizeString(previous.text)}\n${text}`
          : text;
      return;
    }
  }

  blocks.push(block);
}

function readTextLikePart(record: Record<string, unknown>): string {
  const directText = normalizeString(record["text"]);
  if (directText !== "") {
    return directText;
  }

  const content = normalizeString(record["content"]);
  if (content !== "") {
    return content;
  }

  return normalizeString(record["content_delta"]);
}

function buildAssistantBlockFromPart(part: unknown): OpencodeUiMessageBlock | null {
  if (part == null || typeof part !== "object" || Array.isArray(part)) {
    return null;
  }

  const record = part as Record<string, unknown>;
  const type = normalizeString(record["type"]).trim();
  const partKind = normalizeString(record["part_kind"]).trim();

  if (type === "text" || partKind === "text") {
    const text = readTextLikePart(record).trim();
    return text !== ""
      ? {
          kind: "markdown",
          text,
        }
      : null;
  }

  if (type === "reasoning") {
    const text = normalizeString(record["text"]).trim();
    const metadata =
      record["metadata"] != null &&
      typeof record["metadata"] === "object" &&
      !Array.isArray(record["metadata"])
        ? (record["metadata"] as Record<string, unknown>)
        : null;
    const openai =
      metadata?.["openai"] != null &&
      typeof metadata["openai"] === "object" &&
      !Array.isArray(metadata["openai"])
        ? (metadata["openai"] as Record<string, unknown>)
        : null;

    return {
      kind: "reasoning",
      title: t("message.reasoningTitle"),
      ...(text !== ""
        ? { text }
        : normalizeString(openai?.["reasoningEncryptedContent"]).trim() !== ""
          ? { text: t("message.reasoningUnavailable") }
          : {}),
    };
  }

  if (type === "step-start") {
    const snapshot = normalizeString(record["snapshot"]).trim();
    return {
      kind: "step",
      title: t("message.stepStartTitle"),
      ...(snapshot !== ""
        ? {
            meta: t("message.stepSnapshotLabel", {
              snapshot: snapshot.slice(0, 12),
            }),
          }
        : {}),
    };
  }

  if (type === "step-finish") {
    const reason = normalizeString(record["reason"]).trim();
    const tokens =
      record["tokens"] != null &&
      typeof record["tokens"] === "object" &&
      !Array.isArray(record["tokens"])
        ? (record["tokens"] as Record<string, unknown>)
        : null;
    const total = Number(tokens?.["total"] ?? 0);

    return {
      kind: "step",
      title: t("message.stepFinishTitle"),
      ...(reason !== "" ? { text: t("message.stepReasonLabel", { reason }) } : {}),
      ...(Number.isFinite(total) && total > 0
        ? { meta: t("message.stepTokensLabel", { count: String(total) }) }
        : {}),
    };
  }

  if (type === "patch") {
    const filesRaw = Array.isArray(record["files"]) ? record["files"] : [];
    const items = filesRaw.map((item) => toCompactLabel(item)).filter((item) => item !== "");
    return {
      kind: "patch",
      title: t("message.patchTitle"),
      ...(items.length > 0 ? { meta: t("message.patchFilesLabel"), items } : {}),
    };
  }

  return null;
}

export function buildMessageSnapshotToken(message: OpencodeUiSessionMessage | undefined): string {
  if (message == null) {
    return "";
  }

  const text = normalizeString(message.text);
  const tail = text.slice(-160);
  const toolCalls = Array.isArray(message.toolCalls) ? message.toolCalls : [];
  const files = Array.isArray(message.files) ? message.files : [];
  const notices = Array.isArray(message.notices) ? message.notices : [];
  const blocks = Array.isArray(message.blocks) ? message.blocks : [];
  const toolTail = toolCalls
    .slice(-2)
    .map((item) => normalizeString(item.name))
    .join(",");
  const fileTail = files
    .slice(-2)
    .map((item) => {
      const name = normalizeString(item.fileName ?? item.name);
      const mediaType = normalizeString(item.media_type);
      const previewToken = String(
        normalizeString(item.previewUrl) !== "" ||
          normalizeString(item.url) !== "" ||
          normalizeString(item.data) !== "" ||
          normalizeString(item.base64) !== ""
      );
      return `${name}:${mediaType}:${previewToken}`;
    })
    .join(",");
  const noticeTail = notices
    .slice(-2)
    .map((item) => `${normalizeString(item.tone)}:${normalizeString(item.title).slice(-48)}`)
    .join(",");
  const blockTail = blocks
    .slice(-2)
    .map((item) => {
      return `${normalizeString(item.kind)}:${normalizeString(item.title).slice(-24)}:${flattenAssistantBlock(item).slice(-64)}`;
    })
    .join(",");
  return `${message.role}:${String(text.length)}:${tail}:${String(toolCalls.length)}:${toolTail}:${String(files.length)}:${fileTail}:${String(notices.length)}:${noticeTail}:${String(blocks.length)}:${blockTail}`;
}

export function buildSessionSnapshotKey(messages: OpencodeUiSessionMessage[] | undefined): string {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "0";
  }

  const last = messages[messages.length - 1];
  const prev = messages.length > 1 ? messages[messages.length - 2] : undefined;
  return `${String(messages.length)}|${buildMessageSnapshotToken(prev)}|${buildMessageSnapshotToken(last)}`;
}

export function normalizeSessionId(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }

  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    return "";
  }

  const record = payload as Record<string, unknown>;
  const directId =
    record["id"] ?? record["sessionID"] ?? record["sessionId"] ?? record["session_id"];
  if (typeof directId === "string" && directId !== "") {
    return directId;
  }

  const nestedSession = record["session"];
  if (nestedSession != null && typeof nestedSession === "object" && !Array.isArray(nestedSession)) {
    const nestedId = (nestedSession as Record<string, unknown>)["id"];
    if (typeof nestedId === "string" && nestedId !== "") {
      return nestedId;
    }
  }

  return "";
}

export function extractAssistantBlocks(payload: unknown): OpencodeUiMessageBlock[] {
  if (payload == null) {
    return [];
  }

  if (Array.isArray(payload)) {
    const blocks: OpencodeUiMessageBlock[] = [];
    payload.forEach((item) => {
      extractAssistantBlocks(item).forEach((block) => {
        appendAssistantBlock(blocks, block);
      });
    });
    return blocks;
  }

  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;

    const directParts = record["parts"];
    if (Array.isArray(directParts)) {
      const blocks: OpencodeUiMessageBlock[] = [];
      directParts.forEach((part) => {
        appendAssistantBlock(blocks, buildAssistantBlockFromPart(part));
      });
      if (blocks.length > 0) {
        return blocks;
      }
    }

    const nestedInfo = record["info"];
    if (nestedInfo != null && typeof nestedInfo === "object" && !Array.isArray(nestedInfo)) {
      const nestedContent = (nestedInfo as Record<string, unknown>)["content"];
      if (typeof nestedContent === "string" && nestedContent.trim() !== "") {
        return [
          {
            kind: "markdown",
            text: nestedContent.trim(),
          },
        ];
      }
    }
  }

  return [];
}

export function extractAssistantMessageContent(payload: unknown): {
  text: string;
  blocks: OpencodeUiMessageBlock[];
} {
  const blocks = extractAssistantBlocks(payload);
  return {
    text: blocks
      .map((block) => flattenAssistantBlock(block))
      .filter((blockText) => blockText !== "")
      .join("\n")
      .trim(),
    blocks,
  };
}

export function extractLatestAssistantTextPart(payload: unknown): string {
  if (payload == null) {
    return "";
  }

  if (Array.isArray(payload)) {
    for (let index = payload.length - 1; index >= 0; index -= 1) {
      const candidate = extractLatestAssistantTextPart(payload[index]);
      if (candidate !== "") {
        return candidate;
      }
    }
    return "";
  }

  if (typeof payload !== "object") {
    return "";
  }

  const record = payload as Record<string, unknown>;
  const directParts: unknown[] = Array.isArray(record["parts"]) ? record["parts"] : [];
  for (let index = directParts.length - 1; index >= 0; index -= 1) {
    const part = directParts[index];
    if (part == null || typeof part !== "object" || Array.isArray(part)) {
      continue;
    }

    const partRecord = part as Record<string, unknown>;
    const type = normalizeString(partRecord["type"]);
    const partKind = normalizeString(partRecord["part_kind"]);
    if (type !== "text" && partKind !== "text") {
      continue;
    }

    const content = normalizeString(partRecord["text"]).trim();
    if (content !== "") {
      return content;
    }

    const fallbackContent = normalizeString(partRecord["content"]).trim();
    if (fallbackContent !== "") {
      return fallbackContent;
    }

    const deltaContent = normalizeString(partRecord["content_delta"]).trim();
    if (deltaContent !== "") {
      return deltaContent;
    }
  }

  const nestedInfo = record["info"];
  if (nestedInfo != null && typeof nestedInfo === "object" && !Array.isArray(nestedInfo)) {
    const nestedContent = normalizeString(
      (nestedInfo as Record<string, unknown>)["content"]
    ).trim();
    if (nestedContent !== "") {
      return nestedContent;
    }
  }

  return "";
}
