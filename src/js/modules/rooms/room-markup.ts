import type { InstalledRoomRecord } from "@shared/index.js";
import { resolveRoomShellIcon, resolveRoomShellName } from "./room-shell-presentation.js";

export function getRoomPageName(roomId: string): string {
  return `room-${roomId}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getRoomIconDisplayMode(icon: string): "compact" | "full" {
  return /^[\p{L}\p{N}]{1,3}$/u.test(icon) ? "compact" : "full";
}

export function buildRoomNavMarkup(room: InstalledRoomRecord): string {
  const pageName = getRoomPageName(room.id);
  const roomName = resolveRoomShellName(room.id, room.name);
  const icon = resolveRoomShellIcon(room.id, room.icon, roomName);
  const iconSource = room.iconPath?.trim() ?? "";
  const iconDisplayMode = getRoomIconDisplayMode(icon);
  const iconSourceAttribute =
    iconSource !== "" ? ` data-side-nav-icon-src="${escapeHtml(iconSource)}"` : "";
  return `
    <button class="side-nav-btn" data-page="${escapeHtml(pageName)}" data-room-nav="true" data-room-id="${escapeHtml(room.id)}" title="${escapeHtml(roomName)}">
      <span class="side-nav-icon room-nav-icon" data-room-icon-display="${escapeHtml(iconDisplayMode)}" data-side-nav-icon-fallback="${escapeHtml(icon)}"${iconSourceAttribute}>${escapeHtml(icon)}</span>
      <span class="side-nav-label">${escapeHtml(roomName)}</span>
    </button>
  `;
}

export function buildRoomPageMarkup(room: InstalledRoomRecord): string {
  const pageName = getRoomPageName(room.id);
  return `<div class="page is-hidden room-page" id="page-${escapeHtml(pageName)}" data-room-page="true" data-room-id="${escapeHtml(room.id)}"></div>`;
}
