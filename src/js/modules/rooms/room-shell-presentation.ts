function readRoomShellLabel(roomId: string, fallbackName: string): string {
  const trimmedFallbackName = fallbackName.trim();
  if (trimmedFallbackName !== "") {
    return trimmedFallbackName;
  }

  return roomId.trim();
}

const ROOM_SHELL_ICON_OVERRIDES: Record<string, string> = {
  "forge-room": "\u2692\uFE0F",
};

export function resolveRoomShellName(roomId: string, fallbackName: string): string {
  const label = readRoomShellLabel(roomId, fallbackName);
  return label !== "" ? label : roomId;
}

export function resolveRoomShellIcon(
  roomId: string,
  configuredIcon: string | null | undefined,
  fallbackName: string
): string {
  const overriddenIcon = ROOM_SHELL_ICON_OVERRIDES[roomId];
  if (overriddenIcon !== undefined) {
    return overriddenIcon;
  }

  const trimmedConfiguredIcon = configuredIcon?.trim();
  if (trimmedConfiguredIcon !== undefined && trimmedConfiguredIcon !== "") {
    return trimmedConfiguredIcon;
  }

  const label = readRoomShellLabel(roomId, fallbackName);
  return label.length > 0 ? label.slice(0, 2).toUpperCase() : "OD";
}
