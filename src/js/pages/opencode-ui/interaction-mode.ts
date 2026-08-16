import { apiCall } from "./api.js";
import { t } from "./i18n.js";
import type { CustomSelectItem, RovoInteractionMode, RuntimeState } from "./types.js";

interface PathResponse {
  path?: string;
  directory?: string;
  worktree?: string;
}

interface BuildInteractionPromptInput {
  mode: Exclude<RovoInteractionMode, "off">;
  protocolText: string;
  manifestText: string;
  promptText: string;
  questionsText?: string;
}

function decodeBase64Text(input: string): string {
  const normalized = typeof input === "string" ? input.trim() : "";
  if (normalized === "") {
    return "";
  }

  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function normalizeWorkspacePath(path: string): string {
  return path.trim().replace(/[\\/]+$/u, "");
}

function joinWorkspacePath(...segments: string[]): string {
  const trimmed = segments.map((segment) => segment.trim()).filter((segment) => segment !== "");
  if (trimmed.length === 0) {
    return "";
  }

  return trimmed
    .map((segment, index) => {
      if (index === 0) {
        return segment.replace(/[\\/]+$/u, "");
      }
      return segment.replace(/^[\\/]+/u, "").replace(/[\\/]+$/u, "");
    })
    .join("/");
}

function readJsonForPrompt(raw: string): string {
  const text = raw.trim();
  if (text === "") {
    return "";
  }

  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

async function resolveWorkspacePath(): Promise<string> {
  const result = await apiCall<PathResponse>("GET", "/path");
  const workspacePath =
    typeof result.path === "string"
      ? result.path
      : typeof result.directory === "string"
        ? result.directory
        : typeof result.worktree === "string"
          ? result.worktree
          : "";
  const normalized = normalizeWorkspacePath(workspacePath);
  if (normalized === "") {
    throw new Error("Workspace path is unavailable.");
  }

  return normalized;
}

async function readWorkspaceTextFile(filePath: string): Promise<string> {
  const readFile = window.electronAPI?.["readFile"] as
    ((path: string) => Promise<string | null>) | undefined;
  if (typeof readFile !== "function") {
    throw new Error("Electron file bridge is unavailable.");
  }

  const encoded = await readFile(filePath);
  const decoded = typeof encoded === "string" ? decodeBase64Text(encoded) : "";
  if (decoded.trim() === "") {
    throw new Error(`Interaction file could not be read: ${filePath}`);
  }

  return decoded;
}

export function getInteractionModeLabel(mode: RovoInteractionMode): string {
  switch (mode) {
    case "off":
      return t("interaction.mode.off");
    case "plan-harder-local":
      return t("interaction.mode.planHarderLocal");
    case "change-approval":
      return t("interaction.mode.changeApproval");
    default: {
      const exhaustiveMode: never = mode;
      return exhaustiveMode;
    }
  }
}

export function buildInteractionModeItems(): CustomSelectItem[] {
  return [
    {
      value: "off",
      label: getInteractionModeLabel("off"),
      subtitle: t("interaction.mode.offHelp"),
    },
    {
      value: "plan-harder-local",
      label: getInteractionModeLabel("plan-harder-local"),
      subtitle: t("interaction.mode.planHarderLocalHelp"),
    },
    {
      value: "change-approval",
      label: getInteractionModeLabel("change-approval"),
      subtitle: t("interaction.mode.changeApprovalHelp"),
    },
  ];
}

export function buildInteractionSystemPrompt(input: BuildInteractionPromptInput): string {
  const modeSpecificRule =
    input.mode === "change-approval"
      ? "- Preserve `evet` as the canonical approval reply."
      : "- Never let the generated planning reply collapse to the literal approval reply `evet`.";
  const sections = [
    "You are responding inside Hayalet Ev's repo-local Rovo Interaction Layer.",
    `The user manually selected the interaction mode \`${input.mode}\` for the next assistant reply.`,
    "Follow the selected pack exactly for this reply.",
    "Hard requirements:",
    "- Keep the visible assistant text human-readable plain text.",
    "- Append exactly one final token in the form `[rovo-ui:v1:<base64url-json>]`.",
    "- The payload `fallbackText` must exactly match the visible assistant text before the token.",
    `- Set payload \`packId\` to \`${input.mode}\`.`,
    modeSpecificRule,
    "",
    "=== Protocol ===",
    input.protocolText.trim(),
    "",
    "=== Pack Manifest ===",
    readJsonForPrompt(input.manifestText),
    "",
    "=== Pack Prompt ===",
    input.promptText.trim(),
  ];

  if (typeof input.questionsText === "string" && input.questionsText.trim() !== "") {
    sections.push("", "=== Pack Questions ===", readJsonForPrompt(input.questionsText));
  }

  return sections.join("\n");
}

export function clearConsumedInteractionMode(
  runtime: Pick<RuntimeState, "activeInteractionMode">,
  usedMode: RovoInteractionMode
): boolean {
  if (usedMode === "off" || runtime.activeInteractionMode !== usedMode) {
    return false;
  }

  runtime.activeInteractionMode = "off";
  return true;
}

export async function loadInteractionSystemPrompt(
  mode: Exclude<RovoInteractionMode, "off">
): Promise<string> {
  const workspacePath = await resolveWorkspacePath();
  const interactionRoot = joinWorkspacePath(workspacePath, ".rovo", "interactions");
  const protocolPath = joinWorkspacePath(interactionRoot, "protocol.md");
  const packRoot = joinWorkspacePath(interactionRoot, mode);
  const manifestPath = joinWorkspacePath(packRoot, "manifest.json");
  const promptPath = joinWorkspacePath(packRoot, "prompt.md");
  const questionsPath = joinWorkspacePath(packRoot, "questions.json");

  const [protocolText, manifestText, promptText, questionsText] = await Promise.all([
    readWorkspaceTextFile(protocolPath),
    readWorkspaceTextFile(manifestPath),
    readWorkspaceTextFile(promptPath),
    mode === "plan-harder-local"
      ? readWorkspaceTextFile(questionsPath)
      : Promise.resolve<string | undefined>(undefined),
  ]);

  return buildInteractionSystemPrompt({
    mode,
    protocolText,
    manifestText,
    promptText,
    ...(typeof questionsText === "string" ? { questionsText } : {}),
  });
}
