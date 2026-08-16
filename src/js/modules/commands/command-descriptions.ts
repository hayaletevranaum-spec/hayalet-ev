import { AppI18n } from "../i18n/index.js";

/**
 * Command description registry for the server command panel.
 *
 * Each command exposes four localized fields:
 * - description: one-line summary
 * - detail: detailed behavior description
 * - usage: inline command usage format
 * - example: example command invocation
 *
 * @module commands/command-descriptions
 */

export interface CommandDescriptionInfo {
  description: string;
  detail: string;
  usage: string;
  example: string;
}

const COMMAND_DESCRIPTION_NAMES = [
  "WhisperManager",
  "AIAIChatStart",
  "AIAIChatStop",
  "AIAssistantChatStart",
  "AIAssistantChatStop",
  "SlotBridge",
] as const;

type CommandDescriptionName = (typeof COMMAND_DESCRIPTION_NAMES)[number];
type CommandDescriptionField = keyof CommandDescriptionInfo;

const COMMAND_DESCRIPTION_NAME_SET = new Set<string>(COMMAND_DESCRIPTION_NAMES);
const COMMAND_DESCRIPTION_ALIASES = new Map<string, CommandDescriptionName>([
  ["aiasistanchatstart", "AIAssistantChatStart"],
  ["aiasistanchatstop", "AIAssistantChatStop"],
  ["slotbridge", "SlotBridge"],
]);

function resolveCanonicalCommandDescriptionName(commandName: string): string {
  const key = commandName.trim().toLowerCase();
  return COMMAND_DESCRIPTION_ALIASES.get(key) ?? commandName;
}

function buildCommandDescriptionKey(
  commandName: CommandDescriptionName,
  field: CommandDescriptionField
): string {
  return `app.commands.catalog.${commandName}.${field}`;
}

function createCommandDescription(commandName: CommandDescriptionName): CommandDescriptionInfo {
  return {
    description: AppI18n.t(buildCommandDescriptionKey(commandName, "description")),
    detail: AppI18n.t(buildCommandDescriptionKey(commandName, "detail")),
    usage: AppI18n.t(buildCommandDescriptionKey(commandName, "usage")),
    example: AppI18n.t(buildCommandDescriptionKey(commandName, "example")),
  };
}

export function getCommandDescription(commandName: string): CommandDescriptionInfo | undefined {
  const canonicalName = resolveCanonicalCommandDescriptionName(commandName);
  if (!COMMAND_DESCRIPTION_NAME_SET.has(canonicalName)) {
    return undefined;
  }

  return createCommandDescription(canonicalName as CommandDescriptionName);
}

export function getCommandDescriptionText(commandName: string): string {
  const info = getCommandDescription(commandName);
  if (!info) return "";

  const lines: string[] = [
    `📌 ${info.description}`,
    ``,
    `${AppI18n.t("app.commands.panel.sections.detail")}:`,
    `${info.detail}`,
    ``,
    `${AppI18n.t("app.commands.panel.sections.usage")}:`,
    `${info.usage}`,
    ``,
    `${AppI18n.t("app.commands.panel.sections.example")}:`,
    `${info.example}`,
  ];

  return lines.join("\n");
}
