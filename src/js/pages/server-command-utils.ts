import { AppI18n } from "../modules/i18n/index.js";
import {
  parseExactInlineCommand,
  parseInlineCommands,
} from "../modules/commands/inline-command-parser.js";

export interface ParsedCommandInput {
  commandName: string;
  args: string;
  inputWasInlineCommand: boolean;
}

export function extractExampleArgsFromDescription(commandName: string, detailText: string): string {
  if (typeof commandName !== "string" || commandName.trim() === "") {
    return "";
  }

  if (typeof detailText !== "string" || detailText.trim() === "") {
    return "";
  }

  const target = commandName.trim().toLowerCase();
  for (const match of parseInlineCommands(detailText)) {
    const parsedName = match.commandName.trim().toLowerCase();
    if (parsedName !== target) {
      continue;
    }

    return match.args.trim();
  }

  return "";
}

export function buildInlineCommandSnippet(commandName: string, args: string): string {
  const name = typeof commandName === "string" ? commandName.trim() : "";
  const argLabel = typeof args === "string" ? args.trim() : "";
  const suffix = argLabel !== "" ? `(${argLabel})` : "()";
  return `++cmd:${name}${suffix}`;
}

export function parseCommandExecutionInput(
  rawInput: string,
  fallbackCommandName: string
): ParsedCommandInput {
  const input = typeof rawInput === "string" ? rawInput.trim() : "";
  const fallback = typeof fallbackCommandName === "string" ? fallbackCommandName.trim() : "";

  const match = parseExactInlineCommand(input);
  if (match !== null) {
    return {
      commandName: match.commandName.trim(),
      args: match.args.trim(),
      inputWasInlineCommand: true,
    };
  }

  return {
    commandName: fallback,
    args: input,
    inputWasInlineCommand: false,
  };
}

export function buildCommandTestMessage(commandName: string, args: string): string {
  return `${buildInlineCommandSnippet(commandName, args)} ${AppI18n.t("app.commands.panel.testMessageSuffix")}`;
}
