import { AppState } from "../../modules/app-state.js";
import { isUs1ProjectedAccountId } from "@shared/archive.js";

export function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function highlightSnippet(text: string, query: string): string {
  if (text === "" || query === "") return escapeHtml(text);

  const escaped = escapeHtml(text);
  const queryEscaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${queryEscaped})`, "gi");

  return escaped.replace(regex, "<mark>$1</mark>");
}

export function getAccountLabel(accountId: string | undefined): string {
  if (accountId === undefined || accountId === "") return "";
  const normalizedAccountId = accountId;

  const archiveProvider = AppState.resolveArchiveProviderByAccountId(normalizedAccountId);
  if (archiveProvider !== null) {
    return AppState.getNickname(archiveProvider);
  }

  if (isUs1ProjectedAccountId(normalizedAccountId)) {
    return AppState.getNickname("us1");
  }

  const provider = normalizedAccountId.split("_")[0];
  if (provider === undefined || provider === "") return "";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function getFileIcon(mimeType: string | undefined): string {
  if (mimeType === undefined || mimeType === "") return "📄";
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType.startsWith("video/")) return "🎬";
  if (mimeType.startsWith("audio/")) return "🎵";
  if (mimeType.includes("pdf")) return "📕";
  if (mimeType.includes("zip") || mimeType.includes("rar") || mimeType.includes("tar")) {
    return "📦";
  }
  if (mimeType.includes("text") || mimeType.includes("json") || mimeType.includes("xml")) {
    return "📝";
  }
  return "📄";
}

export function formatFileSize(bytes: number | undefined): string {
  if (bytes === undefined || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i] ?? "B"}`;
}
