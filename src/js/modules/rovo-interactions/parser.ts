import {
  ROVO_INTERACTION_TOKEN_PREFIX,
  type ParsedRovoInteraction,
  type RovoChangeApprovalPayload,
  type RovoInteractionPayload,
  type RovoPlanHarderLocalPayload,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && Array.isArray(value) === false;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function buildOptionalStringProp<K extends string>(
  key: K,
  value: string
): Partial<Record<K, string>> {
  return value === "" ? {} : ({ [key]: value } as Record<K, string>);
}

function bytesToBinary(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
}

function binaryToBytes(binary: string): Uint8Array {
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeBase64Url(input: string): string | null {
  const normalized = input.trim().replace(/-/g, "+").replace(/_/g, "/");
  if (normalized === "") {
    return null;
  }

  const padding = normalized.length % 4;
  const withPadding = padding === 0 ? normalized : `${normalized}${"=".repeat(4 - padding)}`;

  try {
    const binary = atob(withPadding);
    return new TextDecoder().decode(binaryToBytes(binary));
  } catch {
    return null;
  }
}

function encodeBase64Url(input: string): string {
  const binary = bytesToBinary(new TextEncoder().encode(input));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeString(item).trim()).filter((item) => item !== "");
}

function parsePlanQuestion(value: unknown): RovoPlanHarderLocalPayload["questions"][number] | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeString(value["id"]).trim();
  const kind = normalizeString(value["kind"]).trim();
  const label = normalizeString(value["label"]).trim();
  const helpText = normalizeString(value["helpText"]).trim();
  const placeholder = normalizeString(value["placeholder"]).trim();
  const required = value["required"] === true;

  if (id === "" || label === "") {
    return null;
  }

  if (kind === "single-choice") {
    const rawOptions = Array.isArray(value["options"]) ? value["options"] : [];
    const options = rawOptions
      .map((option) => {
        if (!isRecord(option)) {
          return null;
        }

        const optionValue = normalizeString(option["value"]).trim();
        const optionLabel = normalizeString(option["label"]).trim();
        if (optionValue === "" || optionLabel === "") {
          return null;
        }

        const description = normalizeString(option["description"]).trim();
        return {
          value: optionValue,
          label: optionLabel,
          ...(description !== "" ? { description } : {}),
          ...(option["recommended"] === true ? { recommended: true } : {}),
        };
      })
      .filter((option): option is NonNullable<typeof option> => option !== null);

    if (options.length === 0) {
      return null;
    }

    return {
      id,
      kind: "single-choice",
      label,
      required,
      options,
      ...buildOptionalStringProp("helpText", helpText),
    };
  }

  if (kind === "short-text" || kind === "long-text") {
    return {
      id,
      kind,
      label,
      required,
      ...buildOptionalStringProp("helpText", helpText),
      ...buildOptionalStringProp("placeholder", placeholder),
    };
  }

  return null;
}

function parseChangeApprovalPayload(
  record: Record<string, unknown>
): RovoChangeApprovalPayload | null {
  const id = normalizeString(record["id"]).trim();
  const title = normalizeString(record["title"]).trim();
  const fallbackText = normalizeString(record["fallbackText"]);
  const issue = normalizeString(record["issue"]).trim();
  const solution = normalizeString(record["solution"]).trim();
  const canonicalReplyValue = normalizeString(record["canonicalReply"]).trim();
  if (canonicalReplyValue !== "evet") {
    return null;
  }

  const canonicalReply = "evet";

  if (id === "" || title === "" || fallbackText.trim() === "" || issue === "" || solution === "") {
    return null;
  }

  const body = normalizeString(record["body"]).trim();
  const packId = normalizeString(record["packId"]).trim();
  const canonicalReplyLabel = normalizeString(record["canonicalReplyLabel"]).trim();
  const modeLabel = normalizeString(record["modeLabel"]).trim();
  const counterpartyLabel = normalizeString(record["counterpartyLabel"]).trim();
  const files = normalizeStringArray(record["files"]);

  return {
    id,
    version: 1,
    type: "change-approval",
    title,
    fallbackText,
    canonicalReply,
    issue,
    solution,
    ...buildOptionalStringProp("body", body),
    ...buildOptionalStringProp("packId", packId),
    ...buildOptionalStringProp("canonicalReplyLabel", canonicalReplyLabel),
    ...buildOptionalStringProp("modeLabel", modeLabel),
    ...buildOptionalStringProp("counterpartyLabel", counterpartyLabel),
    ...(files.length > 0 ? { files } : {}),
  };
}

function parsePlanHarderPayload(
  record: Record<string, unknown>
): RovoPlanHarderLocalPayload | null {
  const id = normalizeString(record["id"]).trim();
  const title = normalizeString(record["title"]).trim();
  const fallbackText = normalizeString(record["fallbackText"]);
  const rawQuestions = Array.isArray(record["questions"]) ? record["questions"] : [];
  const questions = rawQuestions
    .map((question) => parsePlanQuestion(question))
    .filter((question): question is NonNullable<typeof question> => question !== null);

  if (id === "" || title === "" || fallbackText.trim() === "" || questions.length === 0) {
    return null;
  }

  const body = normalizeString(record["body"]).trim();
  const packId = normalizeString(record["packId"]).trim();
  const submitLabel = normalizeString(record["submitLabel"]).trim();
  const clearLabel = normalizeString(record["clearLabel"]).trim();
  const responseTitle = normalizeString(record["responseTitle"]).trim();
  const responsePreamble = normalizeString(record["responsePreamble"]).trim();

  return {
    id,
    version: 1,
    type: "plan-harder-local",
    title,
    fallbackText,
    persistDraft: record["persistDraft"] !== false,
    questions,
    ...buildOptionalStringProp("body", body),
    ...buildOptionalStringProp("packId", packId),
    ...buildOptionalStringProp("submitLabel", submitLabel),
    ...buildOptionalStringProp("clearLabel", clearLabel),
    ...buildOptionalStringProp("responseTitle", responseTitle),
    ...buildOptionalStringProp("responsePreamble", responsePreamble),
  };
}

function parsePayload(input: unknown): RovoInteractionPayload | null {
  if (!isRecord(input)) {
    return null;
  }

  if (Number(input["version"]) !== 1) {
    return null;
  }

  const type = normalizeString(input["type"]).trim();
  if (type === "change-approval") {
    return parseChangeApprovalPayload(input);
  }

  if (type === "plan-harder-local") {
    return parsePlanHarderPayload(input);
  }

  return null;
}

function matchesVisibleFallbackTransport(visibleText: string, fallbackText: string): boolean {
  return (
    visibleText === fallbackText ||
    visibleText === `${fallbackText}\n` ||
    visibleText === `${fallbackText}\r\n` ||
    new RegExp(`^${escapeRegExp(fallbackText)}[ \\t]+$`, "u").test(visibleText)
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseRovoInteraction(text: string): ParsedRovoInteraction | null {
  const source = typeof text === "string" ? text : "";
  const prefixIndex = source.lastIndexOf(ROVO_INTERACTION_TOKEN_PREFIX);
  if (prefixIndex < 0) {
    return null;
  }

  const endIndex = source.indexOf("]", prefixIndex);
  if (endIndex < 0) {
    return null;
  }

  if (source.slice(endIndex + 1).trim() !== "") {
    return null;
  }

  const rawToken = source.slice(prefixIndex, endIndex + 1);
  const encoded = source.slice(prefixIndex + ROVO_INTERACTION_TOKEN_PREFIX.length, endIndex).trim();
  const decoded = decodeBase64Url(encoded);
  if (decoded === null) {
    return null;
  }

  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(decoded);
  } catch {
    return null;
  }

  const payload = parsePayload(parsedUnknown);
  if (payload === null) {
    return null;
  }

  const visibleText = source.slice(0, prefixIndex);
  if (
    visibleText.trim() === "" ||
    matchesVisibleFallbackTransport(visibleText, payload.fallbackText) === false
  ) {
    return null;
  }
  const displayText = payload.fallbackText.trim() !== "" ? payload.fallbackText : visibleText;

  return {
    payload,
    displayText,
    rawToken,
  };
}

export function encodeRovoInteractionToken(payload: RovoInteractionPayload): string {
  return `${ROVO_INTERACTION_TOKEN_PREFIX}${encodeBase64Url(JSON.stringify(payload))}]`;
}

export function appendRovoInteractionToken(
  visibleText: string,
  payload: RovoInteractionPayload
): string {
  const candidateText = typeof visibleText === "string" ? visibleText : "";
  const baseText = candidateText.trim() === "" ? payload.fallbackText : candidateText;
  const token = encodeRovoInteractionToken(payload);
  if (baseText === "") {
    return token;
  }

  return `${baseText}${baseText.endsWith("\n") ? "" : "\n"}${token}`;
}
