import { exec } from "child_process";
import { promisify } from "util";
import { ELECTRON_TIMEOUTS } from "@timeouts";
import type { ToolResult } from "../types/index-mcp.js";
import type { TranslationParams } from "../../src/types/i18n.js";
import { getToolCount, getRegistryStats } from "../core/registry.js";
import { logToolError } from "../utils/mcp-logger.js";
import { createMcpTranslatorSync } from "../utils/i18n/index.js";

const execAsync = promisify(exec);

type CommandRunner = (
  command: string,
  options: { cwd: string; timeout: number }
) => Promise<{ stdout: string; stderr: string }>;

type McpTranslator = (key: string, params?: TranslationParams) => string;

interface TestElectronArgs {
  timeout?: number;
  _runCommand?: CommandRunner;
}

interface ModeStatusProbe {
  mode: string | null;
  appOpen: boolean;
  electronConnectionAvailable: boolean;
}

function getElectronToolsTranslator(): McpTranslator {
  return createMcpTranslatorSync();
}

function electronToolsT(t: McpTranslator, key: string, params?: TranslationParams): string {
  return t(`mcpServer.electronTools.${key}`, params);
}

function parseModeStatusOutput(stdout: string): ModeStatusProbe {
  const firstBrace = stdout.indexOf("{");
  const lastBrace = stdout.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace < firstBrace) {
    return {
      mode: null,
      appOpen: false,
      electronConnectionAvailable: false,
    };
  }

  try {
    const parsed = JSON.parse(stdout.slice(firstBrace, lastBrace + 1)) as {
      mode?: unknown;
      appOpen?: unknown;
      electronConnectionAvailable?: unknown;
      observedSignals?: {
        appOpen?: unknown;
        electronConnectionAvailable?: unknown;
        mainProcess?: unknown;
      };
      snapshot?: {
        main?: {
          alive?: unknown;
        };
      };
    };
    const mode = typeof parsed.mode === "string" ? parsed.mode.trim().toLowerCase() : null;
    const appOpen =
      typeof parsed.appOpen === "boolean"
        ? parsed.appOpen
        : typeof parsed.observedSignals?.appOpen === "boolean"
          ? parsed.observedSignals.appOpen
          : typeof parsed.snapshot?.main?.alive === "boolean"
            ? parsed.snapshot.main.alive
            : typeof parsed.observedSignals?.mainProcess === "boolean"
              ? parsed.observedSignals.mainProcess
              : false;
    const electronConnectionAvailable =
      typeof parsed.electronConnectionAvailable === "boolean"
        ? parsed.electronConnectionAvailable
        : typeof parsed.observedSignals?.electronConnectionAvailable === "boolean"
          ? parsed.observedSignals.electronConnectionAvailable
          : appOpen;

    return {
      mode,
      appOpen,
      electronConnectionAvailable,
    };
  } catch {
    return {
      mode: null,
      appOpen: false,
      electronConnectionAvailable: false,
    };
  }
}

export async function testElectron(
  projectRoot: string,
  args?: TestElectronArgs
): Promise<ToolResult> {
  const t = getElectronToolsTranslator();
  const timeout = args?.timeout ?? ELECTRON_TIMEOUTS.TEST_DEFAULT / 1000;
  const runCommand: CommandRunner = args?._runCommand ?? (execAsync);

  try {
    const probe = await runCommand("npm run mode:status", {
      cwd: projectRoot,
      timeout: Math.min(5000, timeout * 1000),
    });
    const probeInfo = parseModeStatusOutput(probe.stdout);

    if (
      probeInfo.mode === "app" ||
      probeInfo.mode === "ghost-agent" ||
      probeInfo.appOpen === true ||
      probeInfo.electronConnectionAvailable === true
    ) {
      const modeLabel =
        probeInfo.mode === "terminal" && probeInfo.appOpen === true
          ? "terminal/app-open"
          : (probeInfo.mode ?? "unknown");
      return {
        content: [
          {
            type: "text",
            text: electronToolsT(t, "testElectron.alreadyActive", { mode: modeLabel }),
          },
        ],
      };
    }
  } catch {
    // NOTE: Ignore the probe error and continue with the explicit start attempt.
  }

  try {
    const { stdout, stderr } = await runCommand("npm run start", {
      cwd: projectRoot,
      timeout: timeout * 1000,
    });

    return {
      content: [
        {
          type: "text",
          text: [
            electronToolsT(t, "testElectron.resultTitle"),
            "",
            electronToolsT(t, "testElectron.stdoutTitle"),
            stdout,
            "",
            electronToolsT(t, "testElectron.stderrTitle"),
            stderr,
          ].join("\n"),
        },
      ],
    };
  } catch (err) {
    const error = err as Error & { killed?: boolean };
    if (error.killed === true) {
      return {
        content: [
          {
            type: "text",
            text: electronToolsT(t, "testElectron.timeoutStopped", { timeout }),
          },
        ],
      };
    }

    logToolError("hev_test_electron", error, { timeout });
    return {
      content: [
        {
          type: "text",
          text: electronToolsT(t, "testElectron.error", { message: error.message }),
        },
      ],
      isError: true,
    };
  }
}

export function listTools(): ToolResult {
  const t = getElectronToolsTranslator();
  const stats = getRegistryStats();
  const totalTools = getToolCount();

  const emojiMap: Record<string, string> = {
    core: "🏠",
    electron: "⚡",
    debug: "🔍",
    filesystem: "📁",
    development: "🔧",
    context: "📊",
    git: "🌿",
    workflow: "🔄",
    web: "🌐",
    ui: "🎨",
    uncategorized: "📦",
  };

  const categoryLabelKeys: Record<string, string> = {
    core: "listTools.categories.core",
    electron: "listTools.categories.electron",
    debug: "listTools.categories.debug",
    filesystem: "listTools.categories.filesystem",
    development: "listTools.categories.development",
    context: "listTools.categories.context",
    git: "listTools.categories.git",
    workflow: "listTools.categories.workflow",
    web: "listTools.categories.web",
    ui: "listTools.categories.ui",
    uncategorized: "listTools.categories.uncategorized",
  };

  let output = `${electronToolsT(t, "listTools.title", { totalTools })}\n`;
  output += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

  for (const [category, count] of Object.entries(stats)) {
    if (category === "total") continue;
    const emoji = emojiMap[category] ?? "📦";
    const categoryLabelKey = categoryLabelKeys[category];
    const categoryLabel =
      categoryLabelKey !== undefined ? electronToolsT(t, categoryLabelKey) : category;
    output += `${emoji} ${categoryLabel} (${count})\n`;
  }

  output += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  output += `${electronToolsT(t, "listTools.hint")}\n`;

  return {
    content: [{ type: "text", text: output }],
  };
}

export function mcpHealthCheck(): {
  healthy: boolean;
  version: string;
  uptime: number;
  toolCount: number;
  message: string;
} {
  const t = getElectronToolsTranslator();
  const startTime = process.uptime();
  const toolCount = getToolCount();

  return {
    healthy: true,
    version: "3.0.0",
    uptime: startTime,
    toolCount,
    message: electronToolsT(t, "health.activeMessage"),
  };
}
