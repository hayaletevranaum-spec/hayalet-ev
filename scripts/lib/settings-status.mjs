import { readFile } from "node:fs/promises";
import { join } from "node:path";

function isRecord(value) {
  return value !== null && typeof value === "object" && Array.isArray(value) === false;
}

function normalizeAccountId(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function normalizeCommandCaptureStatus(value) {
  if (value === true) {
    return "enabled";
  }

  if (value === false) {
    return "disabled";
  }

  return "unknown";
}

export function getProjectSettingsPath(root) {
  return join(root, "config", "settings.json");
}

export async function readAssistantSlotSettingsReport(root) {
  const source = getProjectSettingsPath(root);

  try {
    const raw = await readFile(source, "utf8");
    const parsed = JSON.parse(raw);
    const assistantSlot =
      isRecord(parsed) && isRecord(parsed.assistantSlot) ? parsed.assistantSlot : null;
    const catchCommands =
      assistantSlot !== null && typeof assistantSlot.catchCommands === "boolean"
        ? assistantSlot.catchCommands
        : null;

    return {
      source,
      loaded: true,
      accountId: normalizeAccountId(assistantSlot?.accountId),
      catchCommands,
      commandCaptureStatus: normalizeCommandCaptureStatus(catchCommands),
      error: null,
      errorCode: null,
    };
  } catch (error) {
    return {
      source,
      loaded: false,
      accountId: null,
      catchCommands: null,
      commandCaptureStatus: "unknown",
      error: error instanceof Error ? error.message : String(error),
      errorCode:
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : null,
    };
  }
}
