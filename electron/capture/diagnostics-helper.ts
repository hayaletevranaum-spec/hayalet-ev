import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { Paths } from "../paths.ts";
import {
  normalizeCompanionDiagnosticsLogEntries,
  normalizeCompanionDiagnosticsStateEntries,
  normalizeFiniteNumber,
  normalizeFreeformText,
  normalizeText,
  sanitizeCompanionDiagnosticsPathSegment,
  type CompanionDiagnosticsShadowSnapshot,
} from "./types-and-defaults.ts";

export const CAPTURE_COMPANION_DIAGNOSTICS_MAX_TEXT_CHARS = 220_000;

export function normalizeCompanionDiagnosticsShadowSnapshot(
  body: Record<string, unknown>
): CompanionDiagnosticsShadowSnapshot | null {
  const deviceId = normalizeText(body["deviceId"]);
  if (deviceId === null) {
    return null;
  }

  const stateEntries = normalizeCompanionDiagnosticsStateEntries(body["stateEntries"]);
  const logEntries = normalizeCompanionDiagnosticsLogEntries(body["logEntries"]);
  const fallbackText = [
    "Hayalet Ev Companion Diagnostics",
    "",
    "State",
    stateEntries.length === 0
      ? "No state entries yet."
      : stateEntries.map((entry) => `${entry.key}: ${entry.value}`).join("\n"),
    "",
    "Logs",
    logEntries.length === 0
      ? "No diagnostic log entries yet."
      : logEntries
          .slice()
          .reverse()
          .map((entry) => {
            const prefix = `[${entry.timestampMs ?? "unknown"}] ${entry.level.padEnd(5, " ")} ${entry.category.toUpperCase()} ${entry.message}`;
            return entry.details === null ? prefix : `${prefix}\n${entry.details}`;
          })
          .join("\n\n"),
  ].join("\n");

  return {
    deviceId,
    generatedAtMs: normalizeFiniteNumber(body["generatedAtMs"]),
    receivedAtMs: Date.now(),
    stateEntries,
    logEntries,
    text:
      normalizeFreeformText(body["text"], CAPTURE_COMPANION_DIAGNOSTICS_MAX_TEXT_CHARS) ??
      fallbackText,
  };
}

export async function writeCompanionDiagnosticsShadowSnapshot(
  snapshot: CompanionDiagnosticsShadowSnapshot
): Promise<{ dir: string; textPath: string; jsonPath: string }> {
  const deviceDir = join(
    Paths.getLogsDir(),
    "android-companion",
    sanitizeCompanionDiagnosticsPathSegment(snapshot.deviceId)
  );
  const textPath = join(deviceDir, "latest.txt");
  const jsonPath = join(deviceDir, "latest.json");

  await mkdir(deviceDir, { recursive: true });
  await Promise.all([
    writeFile(
      textPath,
      snapshot.text.endsWith("\n") ? snapshot.text : `${snapshot.text}\n`,
      "utf8"
    ),
    writeFile(jsonPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8"),
  ]);

  return { dir: deviceDir, textPath, jsonPath };
}
