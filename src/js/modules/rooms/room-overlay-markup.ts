import type { InstalledRoomRecord, RoomWorkspaceEntry } from "@shared/index.js";
import { AppI18n } from "../i18n/index.js";
import { resolveRoomShellName } from "./room-shell-presentation.js";

interface RoomListEntry {
  id: string;
  workspace: RoomWorkspaceEntry | null;
  installed: InstalledRoomRecord | null;
}

interface RoomListState {
  label: string;
  value: "installed" | "ready" | "invalid";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function roomOverlayText(key: string): string {
  return AppI18n.t(`shell.rooms.${key}`);
}

function getVisibleInstalledRooms(installedRooms: InstalledRoomRecord[]): InstalledRoomRecord[] {
  return installedRooms.filter((room) => room.isWorkspaceFallback !== true);
}

function getWorkspaceRoomId(room: RoomWorkspaceEntry): string {
  return room.manifest?.id ?? room.dirName;
}

function getRoomListName(entry: RoomListEntry): string {
  const fallbackName =
    entry.workspace?.manifest?.name ??
    entry.workspace?.dirName ??
    entry.installed?.name ??
    entry.id;
  return resolveRoomShellName(entry.id, fallbackName);
}

function buildRoomListEntries(
  workspaceRooms: RoomWorkspaceEntry[],
  installedRooms: InstalledRoomRecord[]
): RoomListEntry[] {
  const entriesById = new Map<string, RoomListEntry>();

  for (const workspace of workspaceRooms) {
    const id = getWorkspaceRoomId(workspace);
    const current = entriesById.get(id);
    if (current === undefined) {
      entriesById.set(id, { id, workspace, installed: null });
    } else {
      current.workspace = workspace;
    }
  }

  for (const installed of getVisibleInstalledRooms(installedRooms)) {
    const current = entriesById.get(installed.id);
    if (current === undefined) {
      entriesById.set(installed.id, { id: installed.id, workspace: null, installed });
    } else {
      current.installed = installed;
    }
  }

  return [...entriesById.values()].sort((left, right) => {
    const installedOrder = Number(right.installed !== null) - Number(left.installed !== null);
    if (installedOrder !== 0) {
      return installedOrder;
    }

    return getRoomListName(left).localeCompare(getRoomListName(right), undefined, {
      sensitivity: "base",
    });
  });
}

function buildRoomListState(entry: RoomListEntry): RoomListState {
  if (entry.installed !== null) {
    return {
      label: roomOverlayText("states.installed"),
      value: "installed",
    };
  }

  if (entry.workspace?.valid === true) {
    return {
      label: roomOverlayText("states.ready"),
      value: "ready",
    };
  }

  return {
    label: roomOverlayText("states.invalid"),
    value: "invalid",
  };
}

function buildRoomActions(entry: RoomListEntry): string {
  const actions: string[] = [];
  const workspace = entry.workspace;
  const installed = entry.installed;

  if (workspace !== null) {
    const workspaceEnabled = workspace.valid === true;
    const disabledAttribute = workspaceEnabled ? "" : " disabled";
    const installLabel =
      installed === null ? roomOverlayText("actions.install") : roomOverlayText("actions.update");

    actions.push(
      `<button class="btn btn-primary btn-sm" data-room-action="install" data-room-id="${escapeHtml(
        entry.id
      )}"${disabledAttribute}>${escapeHtml(installLabel)}</button>`
    );
    actions.push(
      `<button class="btn btn-ghost btn-sm" data-room-action="package" data-room-id="${escapeHtml(
        entry.id
      )}"${disabledAttribute}>${escapeHtml(roomOverlayText("actions.package"))}</button>`
    );

    if (installed === null) {
      const deleteDisabledAttribute =
        workspace.readOnly === true || workspace.valid !== true ? " disabled" : "";
      actions.push(
        `<button class="btn btn-danger btn-sm" data-room-action="delete" data-room-id="${escapeHtml(
          entry.id
        )}"${deleteDisabledAttribute}>${escapeHtml(roomOverlayText("actions.delete"))}</button>`
      );
    }
  }

  if (installed !== null) {
    actions.push(
      `<button class="btn btn-danger btn-sm" data-room-action="remove" data-room-id="${escapeHtml(
        entry.id
      )}">${escapeHtml(roomOverlayText("actions.remove"))}</button>`
    );
  }

  return actions.join("");
}

export function buildRoomOverlaySummary(
  workspaceRooms: RoomWorkspaceEntry[],
  installedRooms: InstalledRoomRecord[]
): string {
  const visibleInstalledRooms = getVisibleInstalledRooms(installedRooms);
  const validWorkspaceCount = workspaceRooms.filter((room) => room.valid === true).length;

  return [
    `<div class="room-manager-chip">${escapeHtml(roomOverlayText("summary.workspace"))}: <strong>${String(
      workspaceRooms.length
    )}</strong></div>`,
    `<div class="room-manager-chip">${escapeHtml(roomOverlayText("summary.ready"))}: <strong>${String(
      validWorkspaceCount
    )}</strong></div>`,
    `<div class="room-manager-chip">${escapeHtml(roomOverlayText("summary.installed"))}: <strong>${String(
      visibleInstalledRooms.length
    )}</strong></div>`,
  ].join("");
}

export function buildRoomListMarkup(
  workspaceRooms: RoomWorkspaceEntry[],
  installedRooms: InstalledRoomRecord[]
): string {
  const entries = buildRoomListEntries(workspaceRooms, installedRooms);
  if (entries.length === 0) {
    return `<div class="room-manager-empty">${escapeHtml(roomOverlayText("emptyList"))}</div>`;
  }

  return entries
    .map((entry) => {
      const state = buildRoomListState(entry);
      const roomName = getRoomListName(entry);
      const roomVersion = entry.workspace?.manifest?.version ?? entry.installed?.version ?? "-";
      const roomPath = entry.workspace?.dirPath ?? entry.installed?.installedDir ?? "";
      const errorsMarkup =
        entry.workspace?.valid === false && entry.workspace.errors.length > 0
          ? `<div class="room-manager-errors">${entry.workspace.errors
              .map((error) => `<div>${escapeHtml(error)}</div>`)
              .join("")}</div>`
          : "";
      const classes = ["room-manager-card", "room-manager-card--row"];
      if (entry.installed !== null) {
        classes.push("room-manager-card--installed");
      }

      return [
        `<article class="${classes.join(" ")}" data-room-id="${escapeHtml(
          entry.id
        )}" data-room-status="${state.value}">`,
        '  <div class="room-manager-title-wrap">',
        `    <div class="room-manager-title">${escapeHtml(roomName)}</div>`,
        `    <div class="room-manager-subtitle">${escapeHtml(entry.id)} • ${escapeHtml(
          roomVersion
        )}</div>`,
        "  </div>",
        `  <div class="room-manager-path" title="${escapeHtml(roomPath)}">${escapeHtml(
          roomPath
        )}</div>`,
        `  <span class="room-manager-state-badge" data-state="${state.value}">${escapeHtml(
          state.label
        )}</span>`,
        `  <div class="room-manager-actions">${buildRoomActions(entry)}</div>`,
        errorsMarkup,
        "</article>",
      ].join("");
    })
    .join("");
}
