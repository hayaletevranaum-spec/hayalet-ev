import { REPAIR_UI_COMMANDS, type RepairUiCommandName } from "./repair-constants.js";

export type RepairActionCategory =
  "navigation" | "capture" | "measurement" | "verification" | "investigation";

export interface RepairActionRegistryEntry {
  id: string;
  label: string;
  category: RepairActionCategory;
  enabled: boolean;
  commandName: RepairUiCommandName;
  phrases: readonly string[];
}

export const REPAIR_ACTION_REGISTRY = [
  {
    id: "focus-measurement",
    label: "Focus Measurement",
    category: "navigation",
    enabled: true,
    commandName: REPAIR_UI_COMMANDS.focusOverlayEntity,
    phrases: ["focus measurement", "show measurement"],
  },
  {
    id: "focus-ai-mark",
    label: "Focus AI Mark",
    category: "navigation",
    enabled: true,
    commandName: REPAIR_UI_COMMANDS.focusOverlayEntity,
    phrases: ["focus ai mark", "show ai mark"],
  },
  {
    id: "next-event",
    label: "Next Event",
    category: "navigation",
    enabled: true,
    commandName: REPAIR_UI_COMMANDS.updateTimeline,
    phrases: ["next event", "go to next event"],
  },
  {
    id: "previous-event",
    label: "Previous Event",
    category: "navigation",
    enabled: true,
    commandName: REPAIR_UI_COMMANDS.updateTimeline,
    phrases: ["previous event", "go to previous event"],
  },
  {
    id: "take-snapshot",
    label: "Take Snapshot",
    category: "capture",
    enabled: true,
    commandName: REPAIR_UI_COMMANDS.addTimelineEvent,
    phrases: ["take snapshot", "capture snapshot"],
  },
  {
    id: "start-measurement",
    label: "Start Measurement",
    category: "measurement",
    enabled: true,
    commandName: REPAIR_UI_COMMANDS.addMeasurement,
    phrases: ["start measurement", "record measurement"],
  },
  {
    id: "verify-region",
    label: "Verify Region",
    category: "verification",
    enabled: true,
    commandName: REPAIR_UI_COMMANDS.focusInvestigationRegion,
    phrases: ["verify region", "confirm region"],
  },
  {
    id: "conclude-investigation",
    label: "Conclude Investigation",
    category: "investigation",
    enabled: true,
    commandName: REPAIR_UI_COMMANDS.updateFocus,
    phrases: ["conclude investigation", "finish investigation"],
  },
] as const satisfies readonly RepairActionRegistryEntry[];

export function getRepairVoiceCommandPhraseMap(
  entries: readonly RepairActionRegistryEntry[] = REPAIR_ACTION_REGISTRY
): Record<string, readonly string[]> {
  const commands: Record<string, string[]> = {};
  entries.forEach((entry) => {
    if (entry.enabled !== true) return;
    commands[entry.commandName] = [...(commands[entry.commandName] ?? []), ...entry.phrases];
  });
  return commands;
}
