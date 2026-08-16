import { testElectron, listTools, mcpHealthCheck } from "../../tools/electron-tools.js";
import { handleSuggestTool } from "../../tools/tool-discovery.js";
import { TOOL_DISCOVERY_DEFINITIONS } from "../../tools/tool-discovery.js";
import { readElectronLogs, listLogSessions, getSessionSummary } from "../../tools/log-tools.js";
import { getErrorHints } from "../../tools/debug-tools.js";
import { createMcpTranslator, createMcpTranslatorSync } from "../../utils/i18n/index.js";
import type { TranslationParams } from "../../../src/types/i18n.js";
import type { ToolEntry, ToolContext } from "../registry.js";
import { getToolCount } from "../registry.js";

type McpTranslator = (key: string, params?: TranslationParams) => string;

const electronToolDefinitionTranslator = createMcpTranslatorSync();

function electronToolT(key: string, params?: TranslationParams): string {
  return electronToolDefinitionTranslator(`mcpServer.fs.toolDefinitions.electron.${key}`, params);
}

function electronHealthT(t: McpTranslator, key: string, params?: TranslationParams): string {
  return t(`mcpServer.health.${key}`, params);
}

export function createElectronTools(context: ToolContext): ToolEntry[] {
  const { PROJECT_ROOT, LOG_DIR } = context;

  return [
    {
      definition: {
        name: "hev_mcp_health",
        description: electronToolT("mcpHealth.description"),
        inputSchema: { type: "object", properties: {} },
        metadata: {
          category: "core",
          subcategory: "health",
          priority: "critical",
          complexity: "simple",
          useCases: [
            electronToolT("mcpHealth.useCases.sessionStart"),
            electronToolT("mcpHealth.useCases.troubleshoot"),
          ],
          relatedTools: ["hev_list_tools"],
          agentGuidance: electronToolT("mcpHealth.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "low",
          tags: ["health", "status", "troubleshoot"],
        },
      },
      handler: async (): Promise<unknown> => {
        const t = await createMcpTranslator();
        const health = mcpHealthCheck();
        const toolCount = getToolCount();
        const output = [
          electronHealthT(t, "activeMessage"),
          "",
          electronHealthT(t, "reportTitle"),
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          electronHealthT(t, "statusLine", {
            status: electronHealthT(t, health.healthy ? "healthy" : "unhealthy"),
          }),
          electronHealthT(t, "versionLine", { version: health.version }),
          electronHealthT(t, "uptimeLine", { uptime: Math.floor(health.uptime) }),
          electronHealthT(t, "toolCountLine", { toolCount }),
          "",
          electronHealthT(t, "visibleMessageTitle"),
          electronHealthT(t, "visibleMessageLine1"),
          electronHealthT(t, "visibleMessageLine2"),
          "",
          electronHealthT(t, "failureTitle"),
          electronHealthT(t, "failureLine1"),
          electronHealthT(t, "failureLine2"),
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        ].join("\n");

        return { content: [{ type: "text", text: output }] };
      },
    },
    {
      definition: {
        name: "hev_test_electron",
        description: electronToolT("testElectron.description"),
        inputSchema: {
          type: "object",
          properties: {
            timeout: {
              type: "number",
              description: electronToolT("testElectron.timeout"),
              default: 5,
            },
          },
        },
        metadata: {
          category: "electron",
          subcategory: "testing",
          priority: "medium",
          complexity: "simple",
          useCases: [
            electronToolT("testElectron.useCases.connectivityTest"),
            electronToolT("testElectron.useCases.cdpHealthCheck"),
          ],
          relatedTools: ["hev_check_electron_connection", "hev_mcp_health"],
          agentGuidance: electronToolT("testElectron.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "low",
          tags: ["electron", "testing", "connectivity"],
        },
      },
      handler: async (args): Promise<unknown> => {
        const opts = args ?? {};
        return await testElectron(PROJECT_ROOT, opts);
      },
    },
    {
      definition: {
        name: "hev_list_tools",
        description: electronToolT("listTools.description"),
        inputSchema: { type: "object", properties: {} },
        metadata: {
          category: "core",
          subcategory: "discovery",
          priority: "high",
          complexity: "simple",
          useCases: [
            electronToolT("listTools.useCases.discoverTools"),
            electronToolT("listTools.useCases.categoryResearch"),
            electronToolT("listTools.useCases.countVerification"),
          ],
          relatedTools: ["hev_suggest_tool"],
          agentGuidance: electronToolT("listTools.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "low",
          tags: ["discovery", "list", "reference"],
        },
      },
      handler: (): unknown => {
        return listTools();
      },
    },
    {
      definition: TOOL_DISCOVERY_DEFINITIONS[0],
      handler: (args): unknown => {
        return handleSuggestTool(args ?? {});
      },
    },
    {
      definition: {
        name: "hev_read_electron_logs",
        description: electronToolT("readLogs.description"),
        inputSchema: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["console", "error", "all", "structured"],
              description: electronToolT("readLogs.type"),
              default: "all",
            },
            app: {
              type: "string",
              enum: ["app", "mcp-server", "ghost-agent", "android-companion"],
              description: electronToolT("readLogs.app"),
              default: "app",
            },
            tail: {
              type: "number",
              description: electronToolT("readLogs.tail"),
              default: 50,
            },
            source: {
              type: "string",
              description: electronToolT("readLogs.source"),
            },
            level: {
              type: "string",
              enum: ["LOG", "WARN", "ERROR", "DEBUG", "INFO"],
              description: electronToolT("readLogs.level"),
            },
            contains: {
              type: "string",
              description: electronToolT("readLogs.contains"),
            },
            correlationId: {
              type: "string",
              description: electronToolT("readLogs.correlationId"),
            },
            sessionId: {
              type: "string",
              description: electronToolT("readLogs.sessionId"),
            },
          },
        },
        metadata: {
          category: "debug",
          subcategory: "logs",
          priority: "high",
          complexity: "medium",
          useCases: [
            electronToolT("readLogs.useCases.debugLogs"),
            electronToolT("readLogs.useCases.filterLogs"),
            electronToolT("readLogs.useCases.trackCorrelation"),
          ],
          relatedTools: ["hev_list_log_sessions", "hev_get_session_summary", "hev_get_error_hints"],
          agentGuidance: electronToolT("readLogs.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "low",
          tags: ["debug", "logs", "troubleshooting", "electron"],
        },
      },
      handler: async (args): Promise<unknown> => {
        return await readElectronLogs(LOG_DIR, args);
      },
    },
    {
      definition: {
        name: "hev_list_log_sessions",
        description: electronToolT("listLogSessions.description"),
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: electronToolT("listLogSessions.limit"),
              default: 10,
            },
            app: {
              type: "string",
              enum: ["app", "mcp-server", "ghost-agent", "android-companion"],
              description: electronToolT("listLogSessions.app"),
              default: "app",
            },
          },
        },
        metadata: {
          category: "debug",
          subcategory: "logs",
          priority: "medium",
          complexity: "simple",
          useCases: [
            electronToolT("listLogSessions.useCases.viewSessions"),
            electronToolT("listLogSessions.useCases.findSessionId"),
          ],
          relatedTools: ["hev_read_electron_logs", "hev_get_session_summary"],
          agentGuidance: electronToolT("listLogSessions.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "low",
          tags: ["debug", "logs", "session"],
        },
      },
      handler: async (args): Promise<unknown> => {
        return await listLogSessions(LOG_DIR, args);
      },
    },
    {
      definition: {
        name: "hev_get_error_hints",
        description: electronToolT("getErrorHints.description"),
        inputSchema: {
          type: "object",
          properties: {
            errorMessage: {
              type: "string",
              description: electronToolT("getErrorHints.errorMessage"),
            },
            provider: {
              type: "string",
              description: electronToolT("getErrorHints.provider"),
            },
          },
          required: ["errorMessage"],
        },
        metadata: {
          category: "debug",
          subcategory: "error-analysis",
          priority: "high",
          complexity: "medium",
          useCases: [
            electronToolT("getErrorHints.useCases.patternMatching"),
            electronToolT("getErrorHints.useCases.getSuggestions"),
            electronToolT("getErrorHints.useCases.providerTroubleshooting"),
          ],
          relatedTools: ["hev_read_electron_logs", "hev_get_session_summary"],
          agentGuidance: electronToolT("getErrorHints.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "low",
          tags: ["debug", "error", "hints", "ai-assisted"],
        },
      },
      handler: (args): unknown => {
        return getErrorHints(args ?? {});
      },
    },
    {
      definition: {
        name: "hev_get_session_summary",
        description: electronToolT("getSessionSummary.description"),
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: electronToolT("getSessionSummary.sessionId"),
            },
            app: {
              type: "string",
              enum: ["app", "mcp-server", "ghost-agent", "android-companion"],
              description: electronToolT("getSessionSummary.app"),
              default: "app",
            },
          },
        },
        metadata: {
          category: "debug",
          subcategory: "logs",
          priority: "medium",
          complexity: "simple",
          useCases: [
            electronToolT("getSessionSummary.useCases.healthCheck"),
            electronToolT("getSessionSummary.useCases.errorStats"),
            electronToolT("getSessionSummary.useCases.compareSessions"),
          ],
          relatedTools: ["hev_list_log_sessions", "hev_read_electron_logs"],
          agentGuidance: electronToolT("getSessionSummary.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "low",
          tags: ["debug", "logs", "session", "summary"],
        },
      },
      handler: async (args): Promise<unknown> => {
        const opts = args ?? {};
        return await getSessionSummary(LOG_DIR, opts);
      },
    },
  ];
}
