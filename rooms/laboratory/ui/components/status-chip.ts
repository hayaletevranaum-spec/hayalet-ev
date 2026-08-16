import { escapeHtml } from "../../domain/lab-types.js";

type StatusTone = "idle" | "running" | "ready" | "warning" | "error" | "success" | "neutral";

export function renderStatusChip(label: string, tone: StatusTone = "neutral") {
  return `<span class="labx-status-chip" data-tone="${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}
