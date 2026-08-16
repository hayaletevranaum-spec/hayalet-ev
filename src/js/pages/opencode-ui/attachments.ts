import { t } from "./i18n.js";
import type {
  ComposerAttachment,
  OpencodeUiMessageAttachment,
  OpencodeUiMessageAttachmentKind,
} from "./types.js";

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function sanitizeAttachmentName(name: string, fallback: string): string {
  const withoutReservedChars = name.trim().replace(/[<>:"/\\|?*]+/g, "_");
  const cleaned = Array.from(withoutReservedChars, (char) => {
    return char.charCodeAt(0) <= 0x1f ? "_" : char;
  }).join("");
  return cleaned !== "" ? cleaned : fallback;
}

export function extensionFromMime(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "text/plain":
      return "txt";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function textToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

export function buildDataUrl(mimeType: string, base64: string): string {
  const safeMimeType = mimeType.trim() !== "" ? mimeType : "application/octet-stream";
  return `data:${safeMimeType};base64,${base64}`;
}

export function formatAttachmentSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) {
    return "";
  }
  if (size < 1024) {
    return `${String(size)} B`;
  }
  if (size < 1024 * 1024) {
    return `${String(Math.max(1, Math.round(size / 1024)))} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function attachmentKindFromMediaType(
  mediaType: string,
  fileName = ""
): OpencodeUiMessageAttachmentKind {
  const normalizedMediaType = mediaType.trim().toLowerCase();
  if (normalizedMediaType.startsWith("image/")) {
    return "image";
  }
  if (normalizedMediaType.startsWith("text/")) {
    return "text";
  }
  if (normalizedMediaType === "application/pdf") {
    return "pdf";
  }

  const extension = fileName.split(".").pop()?.trim().toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(extension)) {
    return "image";
  }
  if (["txt", "md", "log"].includes(extension)) {
    return "text";
  }
  if (["pdf"].includes(extension)) {
    return "pdf";
  }
  if (["js", "ts", "tsx", "py", "css", "html", "json", "sh", "yml", "yaml"].includes(extension)) {
    return "code";
  }
  if (["zip", "tar", "gz", "rar", "7z"].includes(extension)) {
    return "archive";
  }

  return "file";
}

export function attachmentKindBadge(kind: OpencodeUiMessageAttachmentKind): string {
  switch (kind) {
    case "image":
      return t("chat.attachmentKindBadge.image");
    case "text":
      return t("chat.attachmentKindBadge.text");
    case "pdf":
      return t("chat.attachmentKindBadge.pdf");
    case "code":
      return t("chat.attachmentKindBadge.code");
    case "archive":
      return t("chat.attachmentKindBadge.archive");
    case "file":
    default:
      return t("chat.attachmentKindBadge.file");
  }
}

export function createAttachmentId(): string {
  return `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeDataUrlCandidate(value: string): string | null {
  const normalized = value.trim();
  if (normalized === "") {
    return null;
  }

  return normalized.startsWith("data:") ? normalized : null;
}

function normalizeImageUrlCandidate(value: string): string | null {
  const normalized = value.trim();
  if (normalized === "") {
    return null;
  }

  if (normalized.startsWith("data:")) {
    return normalized;
  }

  try {
    const baseUrl =
      typeof window !== "undefined" && typeof window.location.href === "string"
        ? window.location.href
        : "http://127.0.0.1/";
    const resolved = new URL(normalized, baseUrl);
    const protocol = resolved.protocol.toLowerCase();
    if (["http:", "https:", "blob:", "file:"].includes(protocol)) {
      return resolved.toString();
    }
  } catch (_error) {}

  return null;
}

export function buildAttachmentPreviewUrl(
  attachment: {
    media_type?: string | undefined;
    previewUrl?: string | undefined;
    url?: string | undefined;
    data?: string | undefined;
    base64?: string | undefined;
  },
  fallbackName = ""
): string | null {
  const mediaType = attachment.media_type?.trim() ?? "";
  const kind = attachmentKindFromMediaType(mediaType, fallbackName);
  if (kind !== "image") {
    return null;
  }

  const directPreviewUrl =
    typeof attachment.previewUrl === "string" ? attachment.previewUrl.trim() : "";
  if (directPreviewUrl !== "") {
    return normalizeImageUrlCandidate(directPreviewUrl) ?? directPreviewUrl;
  }

  const fromUrl =
    typeof attachment.url === "string" ? normalizeImageUrlCandidate(attachment.url) : null;
  if (fromUrl !== null) {
    return fromUrl;
  }

  const fromData =
    typeof attachment.data === "string" ? normalizeDataUrlCandidate(attachment.data) : null;
  if (fromData !== null) {
    return fromData;
  }

  const base64 = typeof attachment.base64 === "string" ? attachment.base64.trim() : "";
  if (base64 !== "" && mediaType !== "") {
    return buildDataUrl(mediaType, base64);
  }

  const rawData = typeof attachment.data === "string" ? attachment.data.trim() : "";
  if (rawData !== "" && mediaType !== "") {
    return buildDataUrl(mediaType, rawData);
  }

  return null;
}

export function normalizeMessageAttachment(
  input: unknown,
  fallbackSource: OpencodeUiMessageAttachment["source"] = "history"
): OpencodeUiMessageAttachment | null {
  if (typeof input === "string") {
    const normalizedName = input.trim();
    if (normalizedName === "") {
      return null;
    }

    return {
      name: normalizedName,
      fileName: normalizedName,
      source: fallbackSource,
      kind: attachmentKindFromMediaType("", normalizedName),
    };
  }

  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const record = input as Record<string, unknown>;
  const readTrimmedString = (value: unknown): string => {
    return typeof value === "string" ? value.trim() : "";
  };
  const nameCandidates = [
    readTrimmedString(record["name"]),
    readTrimmedString(record["fileName"]),
    readTrimmedString(record["filename"]),
    readTrimmedString(record["path"]),
  ];
  const nameCandidate = nameCandidates.find((value) => value !== "") ?? "";

  if (nameCandidate === "") {
    return null;
  }

  const mediaTypeCandidates = [
    readTrimmedString(record["media_type"]),
    readTrimmedString(record["mimeType"]),
    readTrimmedString(record["mime"]),
  ];
  const mediaType = mediaTypeCandidates.find((value) => value !== "") ?? "";
  const kind = attachmentKindFromMediaType(mediaType, nameCandidate);
  const previewUrl = buildAttachmentPreviewUrl(
    {
      media_type: mediaType,
      previewUrl: typeof record["previewUrl"] === "string" ? record["previewUrl"] : undefined,
      url: typeof record["url"] === "string" ? record["url"] : undefined,
      data: typeof record["data"] === "string" ? record["data"] : undefined,
      base64: typeof record["base64"] === "string" ? record["base64"] : undefined,
    },
    nameCandidate
  );

  const sizeRaw = record["size"];
  const size =
    typeof sizeRaw === "number" && Number.isFinite(sizeRaw) && sizeRaw > 0 ? sizeRaw : undefined;
  const sourceRaw = record["source"];
  const source =
    sourceRaw === "clipboard" || sourceRaw === "file-picker" || sourceRaw === "history"
      ? sourceRaw
      : fallbackSource;

  return {
    ...(typeof record["id"] === "string" ? { id: record["id"] } : {}),
    name: nameCandidate,
    fileName:
      typeof record["fileName"] === "string" && record["fileName"].trim() !== ""
        ? record["fileName"].trim()
        : nameCandidate,
    ...(typeof record["path"] === "string" && record["path"].trim() !== ""
      ? { path: record["path"].trim() }
      : {}),
    ...(mediaType !== "" ? { media_type: mediaType } : {}),
    ...(size != null ? { size } : {}),
    source,
    ...(typeof record["url"] === "string" && record["url"].trim() !== ""
      ? { url: record["url"].trim() }
      : {}),
    ...(typeof record["data"] === "string" && record["data"].trim() !== ""
      ? { data: record["data"].trim() }
      : {}),
    ...(typeof record["base64"] === "string" && record["base64"].trim() !== ""
      ? { base64: record["base64"].trim() }
      : {}),
    ...(previewUrl != null ? { previewUrl } : {}),
    kind,
  };
}

function renderAttachmentPreviewMarkup(attachment: OpencodeUiMessageAttachment): string {
  if ((attachment.previewUrl ?? "").trim() === "") {
    return (
      '<div class="ds-attachment-card__preview ds-attachment-card__preview--icon">' +
      escapeHtml(attachmentKindBadge(attachment.kind ?? "file")) +
      "</div>"
    );
  }

  return (
    '<div class="ds-attachment-card__preview">' +
    '<img class="ds-attachment-card__image" src="' +
    escapeHtml(attachment.previewUrl ?? "") +
    '" alt="' +
    escapeHtml(attachment.name) +
    '">' +
    "</div>"
  );
}

function buildAttachmentMeta(attachment: OpencodeUiMessageAttachment): string {
  const kindLabel = attachmentKindBadge(attachment.kind ?? "file");
  const sizeText = attachment.size != null ? formatAttachmentSize(attachment.size) : "";
  return [kindLabel, sizeText].filter((item) => item !== "").join(" • ");
}

export async function fileToComposerAttachment(
  file: File,
  source: ComposerAttachment["source"]
): Promise<ComposerAttachment> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const hasMimeType = file.type.trim() !== "";
  const mimeType = hasMimeType ? file.type : "application/octet-stream";
  const inferredExtension = hasMimeType ? extensionFromMime(file.type) : "bin";
  return {
    id: createAttachmentId(),
    name: sanitizeAttachmentName(file.name, `attachment.${inferredExtension}`),
    mimeType,
    base64: bytesToBase64(bytes),
    size: file.size,
    source,
  };
}

export function createClipboardTextAttachment(text: string): ComposerAttachment | null {
  const normalized = text.trim();
  if (normalized === "") {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return {
    id: createAttachmentId(),
    name: `clipboard-${timestamp}.txt`,
    mimeType: "text/plain",
    base64: textToBase64(normalized),
    size: new TextEncoder().encode(normalized).length,
    source: "clipboard",
  };
}

export function dedupeComposerAttachments(
  current: ComposerAttachment[],
  incoming: ComposerAttachment[]
): ComposerAttachment[] {
  const seen = new Set(
    current.map(
      (attachment) => `${attachment.name}:${attachment.size}:${attachment.base64.slice(0, 32)}`
    )
  );
  const next = [...current];
  for (const attachment of incoming) {
    const key = `${attachment.name}:${attachment.size}:${attachment.base64.slice(0, 32)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(attachment);
  }
  return next;
}

export function buildOutgoingAttachmentPreview(
  attachments: ComposerAttachment[]
): OpencodeUiMessageAttachment[] {
  return attachments
    .map((attachment) =>
      normalizeMessageAttachment(
        {
          id: attachment.id,
          name: attachment.name,
          fileName: attachment.name,
          media_type: attachment.mimeType,
          size: attachment.size,
          source: attachment.source,
          base64: attachment.base64,
          previewUrl: buildAttachmentPreviewUrl(
            {
              media_type: attachment.mimeType,
              base64: attachment.base64,
            },
            attachment.name
          ),
        },
        attachment.source
      )
    )
    .filter((attachment): attachment is OpencodeUiMessageAttachment => attachment !== null);
}

export function renderAttachmentTrayHtml(attachments: ComposerAttachment[]): string {
  return buildOutgoingAttachmentPreview(attachments)
    .map((attachment) => {
      const sourceLabel =
        attachment.source === "clipboard"
          ? t("chat.attachmentSourceClipboard")
          : t("chat.attachmentSourceFile");
      return (
        '<div class="ds-attachment-card" title="' +
        escapeHtml(`${attachment.name}\n${sourceLabel}`) +
        '">' +
        renderAttachmentPreviewMarkup(attachment) +
        '<div class="ds-attachment-card__body">' +
        '<div class="ds-attachment-card__meta">' +
        escapeHtml(buildAttachmentMeta(attachment)) +
        "</div>" +
        '<div class="ds-attachment-card__name">' +
        escapeHtml(attachment.name) +
        "</div>" +
        '<div class="ds-attachment-card__source">' +
        escapeHtml(sourceLabel) +
        "</div>" +
        "</div>" +
        '<button type="button" class="ds-attachment-card__remove" data-attachment-remove="' +
        escapeHtml(attachment.id ?? "") +
        '" aria-label="' +
        escapeHtml(t("chat.removeAttachmentAria", { name: attachment.name })) +
        '">×</button>' +
        "</div>"
      );
    })
    .join("");
}
