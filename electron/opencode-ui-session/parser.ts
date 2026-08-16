import { asNumber, asRecord, asString, parseRecord, stringifyValue } from "./shared.ts";
import { readElectronAppLanguageSync } from "../i18n/language-service.ts";
import { getBuiltInLanguagePack } from "../../shared/i18n/bundled-languages.ts";
import { translateCatalog } from "../../shared/i18n/catalog.ts";
import { DEFAULT_APP_LANGUAGE } from "../../src/types/i18n.ts";
import type {
  JsonRecord,
  MessageRow,
  OpencodeUiMessageBlock,
  OpencodeUiSessionMessage,
  OpencodeUiTodoItem,
  OpencodeUiToolCall,
  PartRow,
} from "./types.ts";

function opencodeUiParserT(key: string, params?: Record<string, string | number>): string {
  const locale = readElectronAppLanguageSync();
  const activeCatalog =
    getBuiltInLanguagePack(locale)?.catalog ??
    getBuiltInLanguagePack(DEFAULT_APP_LANGUAGE)?.catalog;
  const fallbackCatalog = getBuiltInLanguagePack(DEFAULT_APP_LANGUAGE)?.catalog;

  return translateCatalog(
    activeCatalog ?? fallbackCatalog ?? {},
    `opencodeUi.${key}`,
    params,
    fallbackCatalog
  );
}

function mergeText(current: string, next: string): string {
  if (next.trim() === "") {
    return current;
  }
  return current === "" ? next : `${current}\n${next}`;
}

function flattenAssistantBlock(block: OpencodeUiMessageBlock): string {
  const lines = [
    asString(block.title).trim(),
    asString(block.text).trim(),
    asString(block.meta).trim(),
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
  if (block === null) {
    return;
  }

  if (block.kind === "markdown") {
    const text = asString(block.text).trim();
    if (text === "") {
      return;
    }

    const previous = blocks[blocks.length - 1];
    if (previous?.kind === "markdown") {
      previous.text = mergeText(asString(previous.text), text);
      return;
    }
  }

  blocks.push(block);
}

function includesRovoInteractionToken(text: string): boolean {
  return text.includes("[rovo-ui:v1:");
}

function readTextPartContent(partData: JsonRecord | null): string {
  if (partData === null) {
    return "";
  }

  const directText = asString(partData["text"]).trim();
  if (directText !== "") {
    return directText;
  }

  const content = asString(partData["content"]).trim();
  if (content !== "") {
    return content;
  }

  return asString(partData["content_delta"]).trim();
}

function extractLatestInteractionText(partRows: PartRow[]): string {
  for (let index = partRows.length - 1; index >= 0; index -= 1) {
    const partData = parseRecord(partRows[index]?.data ?? "");
    const partType = asString(partData?.["type"]).trim();
    const partKind = asString(partData?.["part_kind"]).trim();
    if (partType !== "text" && partKind !== "text") {
      continue;
    }

    const content = readTextPartContent(partData);
    if (content !== "" && includesRovoInteractionToken(content)) {
      return content;
    }
  }

  return "";
}

function toCompactLabel(value: unknown): string {
  const raw = asString(value).trim();
  if (raw === "") {
    return "";
  }

  const slashParts = raw.split("/");
  const lastSlash = slashParts[slashParts.length - 1] ?? raw;
  const backslashParts = lastSlash.split("\\");
  return (backslashParts[backslashParts.length - 1] ?? lastSlash).trim();
}

function buildStructuredAssistantBlock(partData: JsonRecord | null): OpencodeUiMessageBlock | null {
  const partType = asString(partData?.["type"]).trim();
  switch (partType) {
    case "reasoning": {
      const text = asString(partData?.["text"]).trim();
      const metadata = asRecord(partData?.["metadata"]);
      const openai = asRecord(metadata?.["openai"]);
      return {
        kind: "reasoning",
        title: opencodeUiParserT("message.reasoningTitle"),
        ...(text !== ""
          ? { text }
          : asString(openai?.["reasoningEncryptedContent"]).trim() !== ""
            ? { text: opencodeUiParserT("message.reasoningUnavailable") }
            : {}),
      };
    }
    case "step-start": {
      const snapshot = asString(partData?.["snapshot"]).trim();
      return {
        kind: "step",
        title: opencodeUiParserT("message.stepStartTitle"),
        ...(snapshot !== ""
          ? {
              meta: opencodeUiParserT("message.stepSnapshotLabel", {
                snapshot: snapshot.slice(0, 12),
              }),
            }
          : {}),
      };
    }
    case "step-finish": {
      const reason = asString(partData?.["reason"]).trim();
      const tokens = asRecord(partData?.["tokens"]);
      const totalTokens = asNumber(tokens?.["total"]);
      const lines: string[] = [];
      if (reason !== "") {
        lines.push(opencodeUiParserT("message.stepReasonLabel", { reason }));
      }
      return {
        kind: "step",
        title: opencodeUiParserT("message.stepFinishTitle"),
        ...(lines.length > 0 ? { text: lines.join("\n") } : {}),
        ...(totalTokens > 0
          ? {
              meta: opencodeUiParserT("message.stepTokensLabel", {
                count: String(totalTokens),
              }),
            }
          : {}),
      };
    }
    case "patch":
      return {
        kind: "patch",
        title: opencodeUiParserT("message.patchTitle"),
        meta: opencodeUiParserT("message.patchFilesLabel"),
        items: Array.isArray(partData?.["files"])
          ? partData["files"].map((item) => toCompactLabel(item)).filter((item) => item !== "")
          : [],
      };
    default:
      return null;
  }
}

function createMarkdownBlock(text: string): OpencodeUiMessageBlock | null {
  const normalized = text.trim();
  if (normalized === "") {
    return null;
  }

  return {
    kind: "markdown",
    text: normalized,
  };
}

function localizeToolState(status: string): string {
  switch (status) {
    case "running":
      return opencodeUiParserT("message.toolCallRunning");
    case "retrying":
      return opencodeUiParserT("message.toolStateLabel.retrying");
    case "interrupted":
      return opencodeUiParserT("message.toolStateLabel.interrupted");
    case "failed":
      return opencodeUiParserT("message.toolStateLabel.failed");
    case "error":
      return opencodeUiParserT("message.toolStateLabel.error");
    default:
      return status;
  }
}

function normalizeToolCallStatus(value: string): NonNullable<OpencodeUiToolCall["status"]> {
  switch (value) {
    case "running":
    case "working":
    case "pending":
    case "in_progress":
      return "running";
    case "retrying":
      return "retrying";
    case "interrupted":
    case "cancelled":
    case "canceled":
      return "interrupted";
    case "failed":
      return "failed";
    case "error":
      return "error";
    case "success":
    case "completed":
    case "done":
    case "succeeded":
      return "done";
    default:
      return "done";
  }
}

function isLimitToolMessage(detail: string): boolean {
  return /((usage|rate) limit|quota|too many requests|limit has been reached|kullanım sınır|limit[ea] ulaşıldı)/iu.test(
    detail
  );
}

function buildToolNotice(
  status: string,
  statusMessage: string
): OpencodeUiSessionMessage["notices"][number] | null {
  const detail = statusMessage.trim();
  if (detail !== "" && isLimitToolMessage(detail)) {
    return {
      tone: "warning",
      title: detail,
      detail,
      ...(status === "retrying" ? { meta: opencodeUiParserT("message.toolStateRetryMeta") } : {}),
    };
  }

  if (status === "retrying") {
    return {
      tone: "warning",
      title: opencodeUiParserT("message.runtimeNotice.retryingTitle"),
      ...(detail !== "" ? { detail } : {}),
      meta: opencodeUiParserT("message.toolStateRetryMeta"),
    };
  }

  if (status === "interrupted") {
    return {
      tone: "warning",
      title: opencodeUiParserT("message.runtimeNotice.interruptedTitle"),
      ...(detail !== "" ? { detail } : {}),
    };
  }

  if (status === "failed" || status === "error") {
    return {
      tone: "error",
      title: opencodeUiParserT("message.toolStateTitle", {
        state: localizeToolState(status),
      }),
      ...(detail !== "" ? { detail } : {}),
    };
  }

  return null;
}

function normalizeTodoItems(value: unknown): OpencodeUiTodoItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = asRecord(item);
      if (record === null) {
        return null;
      }

      const content = asString(record["content"]).trim();
      if (content === "") {
        return null;
      }

      const status = asString(record["status"], "pending").trim().toLowerCase();
      const priority = asString(record["priority"], "medium").trim().toLowerCase();
      return {
        content,
        status: status !== "" ? status : "pending",
        priority: priority !== "" ? priority : "medium",
      };
    })
    .filter((item): item is OpencodeUiTodoItem => item !== null);
}

function parseTodoSource(value: unknown): { found: boolean; todos: OpencodeUiTodoItem[] } {
  if (Array.isArray(value)) {
    return { found: true, todos: normalizeTodoItems(value) };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return { found: false, todos: [] };
    }

    try {
      return parseTodoSource(JSON.parse(trimmed));
    } catch {
      return { found: false, todos: [] };
    }
  }

  const record = asRecord(value);
  if (record === null) {
    return { found: false, todos: [] };
  }

  if ("todos" in record) {
    return parseTodoSource(record["todos"]);
  }

  return { found: false, todos: [] };
}

function extractTodoPayload(partData: JsonRecord | null): {
  matched: boolean;
  todos: OpencodeUiTodoItem[];
} {
  const toolName = asString(partData?.["tool"], asString(partData?.["name"])).trim().toLowerCase();
  if (toolName !== "todowrite") {
    return { matched: false, todos: [] };
  }

  const state = asRecord(partData?.["state"]);
  const input = asRecord(state?.["input"]);
  const metadata = asRecord(state?.["metadata"]) ?? asRecord(partData?.["metadata"]);
  const candidates = [input?.["todos"], metadata?.["todos"], state?.["output"]];

  for (const candidate of candidates) {
    const parsed = parseTodoSource(candidate);
    if (parsed.found) {
      return { matched: true, todos: parsed.todos };
    }
  }

  return { matched: true, todos: [] };
}

export function extractLatestTodos(partRows: PartRow[]): OpencodeUiTodoItem[] {
  let todos: OpencodeUiTodoItem[] = [];

  for (const part of partRows) {
    const parsed = extractTodoPayload(parseRecord(part.data));
    if (parsed.matched) {
      todos = parsed.todos;
    }
  }

  return todos;
}

export function extractChangedFiles(partRows: PartRow[]): string[] {
  const seen = new Set<string>();
  const files: string[] = [];

  for (let index = partRows.length - 1; index >= 0; index -= 1) {
    const partData = parseRecord(partRows[index]?.data ?? "");
    if (asString(partData?.["type"]).trim() !== "patch") {
      continue;
    }

    const patchFiles = partData?.["files"];
    if (!Array.isArray(patchFiles)) {
      continue;
    }

    for (const file of patchFiles) {
      const normalized = asString(file).trim();
      if (normalized === "" || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      files.push(normalized);
    }
  }

  return files;
}

export function parseMessages(
  messageRows: MessageRow[],
  partRows: PartRow[]
): OpencodeUiSessionMessage[] {
  const partsByMessage = new Map<string, PartRow[]>();
  for (const part of partRows) {
    const list = partsByMessage.get(part.message_id);
    if (list === undefined) {
      partsByMessage.set(part.message_id, [part]);
    } else {
      list.push(part);
    }
  }

  const messages: OpencodeUiSessionMessage[] = [];

  for (const row of messageRows) {
    const messageData = parseRecord(row.data);
    const role = asString(messageData?.["role"]).trim();
    if (role !== "user" && role !== "assistant") {
      continue;
    }

    const parts = partsByMessage.get(row.id) ?? [];
    const interactionText = role === "assistant" ? extractLatestInteractionText(parts) : "";
    let text = "";
    const files: OpencodeUiSessionMessage["files"] = [];
    const notices: OpencodeUiSessionMessage["notices"] = [];
    const blocks: OpencodeUiSessionMessage["blocks"] = [];
    const toolCalls: OpencodeUiToolCall[] = [];

    for (const part of parts) {
      const partData = parseRecord(part.data);
      const partType = asString(partData?.["type"]).trim();
      const partKind = asString(partData?.["part_kind"]).trim();

      if (partType === "text" || partKind === "text") {
        const content = readTextPartContent(partData);
        text = mergeText(text, content);
        if (role === "assistant") {
          appendAssistantBlock(blocks, createMarkdownBlock(content));
        }
        continue;
      }

      if (role === "assistant") {
        const structuredBlock = buildStructuredAssistantBlock(partData);
        if (structuredBlock !== null) {
          text = mergeText(text, flattenAssistantBlock(structuredBlock));
          appendAssistantBlock(blocks, structuredBlock);
          continue;
        }
      }

      if (partType === "file" && role === "user") {
        const fileName = asString(
          partData?.["filename"],
          asString(partData?.["name"], opencodeUiParserT("chat.attachmentFallbackName"))
        );
        const mediaType = asString(
          partData?.["mime"],
          asString(partData?.["media_type"], "application/octet-stream")
        );
        const data = asString(partData?.["data"], asString(partData?.["base64"])).trim();
        const url = asString(partData?.["url"]).trim();
        const base64 = asString(partData?.["base64"]).trim();
        const size = asNumber(partData?.["size"]);
        files.push({
          name: fileName,
          fileName,
          media_type: mediaType,
          ...(url !== "" ? { url } : {}),
          ...(data !== "" ? { data } : {}),
          ...(base64 !== "" ? { base64 } : {}),
          source: "history",
          ...(size > 0 ? { size } : {}),
        });
        continue;
      }

      if (partType === "tool" && role === "assistant") {
        const state = asRecord(partData?.["state"]);
        const metadata = asRecord(state?.["metadata"]);
        const args = stringifyValue(state?.["input"]);
        const outputValue = state?.["output"] ?? metadata?.["output"];
        const result = stringifyValue(outputValue);
        const status = asString(state?.["status"]).trim().toLowerCase();
        const statusMessage = asString(
          state?.["message"],
          asString(metadata?.["message"], asString(metadata?.["error"]))
        ).trim();

        if (
          status === "failed" ||
          status === "error" ||
          status === "interrupted" ||
          status === "retrying"
        ) {
          const notice = buildToolNotice(status, statusMessage);
          if (notice !== null) {
            notices.push(notice);
          }
        }

        toolCalls.push({
          name: asString(partData?.["tool"], asString(partData?.["name"], "unknown")),
          args,
          result,
          ...(statusMessage !== "" ? { detail: statusMessage } : {}),
          status: normalizeToolCallStatus(status),
        });
      }
    }

    if (role === "user") {
      if (text.trim() === "" && files.length === 0) {
        continue;
      }
      messages.push({
        role: "user",
        text: text.trim(),
        files,
        notices: [],
        blocks: [],
        toolCalls: [],
      });
      continue;
    }

    if (interactionText !== "") {
      text = interactionText;
      blocks.length = 0;
      appendAssistantBlock(blocks, createMarkdownBlock(interactionText));
    }

    if (
      text.trim() === "" &&
      blocks.length === 0 &&
      toolCalls.length === 0 &&
      notices.length === 0
    ) {
      continue;
    }

    messages.push({ role: "assistant", text: text.trim(), files: [], notices, blocks, toolCalls });
  }

  return messages;
}

function readUsageTokens(value: JsonRecord | null): {
  input: number;
  output: number;
  reasoning: number;
} {
  if (value === null) {
    return { input: 0, output: 0, reasoning: 0 };
  }

  const inputCandidates = [
    asNumber(value["input"]),
    asNumber(value["prompt_tokens"]),
    asNumber(value["inputTokens"]),
    asNumber(value["promptTokens"]),
  ];
  const input = inputCandidates.find((tokenCount) => tokenCount > 0) ?? 0;

  const outputCandidates = [
    asNumber(value["output"]),
    asNumber(value["completion_tokens"]),
    asNumber(value["outputTokens"]),
    asNumber(value["completionTokens"]),
  ];
  const outputBase = outputCandidates.find((tokenCount) => tokenCount > 0) ?? 0;

  const reasoningCandidates = [asNumber(value["reasoning"]), asNumber(value["reasoning_tokens"])];
  const reasoning = reasoningCandidates.find((tokenCount) => tokenCount > 0) ?? 0;

  return {
    input,
    output: outputBase,
    reasoning,
  };
}

export function aggregateUsage(
  messageRows: MessageRow[],
  partRows: PartRow[]
): Record<string, unknown> {
  let messagePromptTokens = 0;
  let messageCompletionTokens = 0;
  let messageReasoningTokens = 0;

  for (const message of messageRows) {
    const messageData = parseRecord(message.data);
    if (messageData === null) {
      continue;
    }

    const role = asString(messageData["role"]).trim();
    if (role !== "assistant") {
      continue;
    }

    const fromTokens = readUsageTokens(asRecord(messageData["tokens"]));
    const fromUsage = readUsageTokens(asRecord(messageData["usage"]));

    messagePromptTokens += fromTokens.input > 0 ? fromTokens.input : fromUsage.input;
    messageCompletionTokens += fromTokens.output > 0 ? fromTokens.output : fromUsage.output;
    messageReasoningTokens += fromTokens.reasoning > 0 ? fromTokens.reasoning : fromUsage.reasoning;
  }

  if (messagePromptTokens > 0 || messageCompletionTokens > 0 || messageReasoningTokens > 0) {
    return {
      prompt_tokens: messagePromptTokens,
      completion_tokens: messageCompletionTokens,
      total_tokens: messagePromptTokens + messageCompletionTokens,
      reasoning_tokens: messageReasoningTokens,
    };
  }

  let promptTokens = 0;
  let completionTokens = 0;
  let reasoningTokens = 0;

  for (const part of partRows) {
    const partData = parseRecord(part.data);
    if (partData === null) {
      continue;
    }

    const metadata =
      asRecord(partData["metadata"]) ?? asRecord(asRecord(partData["state"])?.["metadata"]);
    if (metadata === null) {
      continue;
    }

    const usage = readUsageTokens(asRecord(metadata["usage"]));
    if (usage.input === 0 && usage.output === 0) {
      continue;
    }

    promptTokens += usage.input;
    completionTokens += usage.output;
    reasoningTokens += usage.reasoning;
  }

  if (promptTokens === 0 && completionTokens === 0 && reasoningTokens === 0) {
    return {};
  }

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    reasoning_tokens: reasoningTokens,
  };
}
