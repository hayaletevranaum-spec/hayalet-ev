import { toggleMcpPanelServers, uiActionFlow } from "../../../tools/cdp-tools.js";
import { createMcpTranslatorSync } from "../../../utils/i18n/index.js";
import type { ToolEntry } from "../../registry.js";

const cdpToolDefinitionTranslator = createMcpTranslatorSync();

function cdpToolT(key: string): string {
  return cdpToolDefinitionTranslator(`mcpServer.fs.toolDefinitions.cdp.${key}`);
}

export function createCdpWorkflowTools(): ToolEntry[] {
  return [
    {
      definition: {
        name: "hev_ui_action_flow",
        description: cdpToolT("uiActionFlow.description"),
        inputSchema: {
          type: "object",
          properties: {
            targetId: { type: "string", description: cdpToolT("common.targetId") },
            port: { type: "number", description: cdpToolT("common.port") },
            actions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: [
                      "click",
                      "type",
                      "press",
                      "wait",
                      "waitForSelector",
                      "waitForText",
                      "snapshot",
                    ],
                  },
                  selector: { type: "string" },
                  text: { type: "string" },
                  key: { type: "string" },
                  timeoutMs: { type: "number" },
                },
              },
              description: cdpToolT("uiActionFlow.actions"),
            },
            stepTimeoutMs: {
              type: "number",
              description: cdpToolT("uiActionFlow.stepTimeoutMs"),
              default: 5000,
            },
            sampleConsole: {
              type: "boolean",
              description: cdpToolT("uiActionFlow.sampleConsole"),
              default: true,
            },
          },
          required: ["actions"],
        },
        metadata: {
          category: "electron",
          subcategory: "cdp-workflow",
          priority: "high",
          complexity: "medium",
          useCases: [
            cdpToolT("uiActionFlow.useCases.repro"),
            cdpToolT("uiActionFlow.useCases.beforeAfter"),
            cdpToolT("uiActionFlow.useCases.smoke"),
          ],
          relatedTools: [
            "hev_debug_ui_report",
            "hev_ui_accessibility_snapshot",
            "hev_debug_console_events",
          ],
          agentGuidance: cdpToolT("uiActionFlow.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "medium",
          tags: ["cdp", "ui", "action-flow", "repro"],
        },
      },
      handler: async (args) => await uiActionFlow(args ?? {}),
    },
    {
      definition: {
        name: "hev_toggle_mcp_panel_servers",
        description: cdpToolT("toggleMcpPanelServers.description"),
        inputSchema: {
          type: "object",
          properties: {
            provider: {
              type: "string",
              enum: ["auto", "opencode"],
              default: "auto",
              description: cdpToolT("toggleMcpPanelServers.provider"),
            },
            servers: {
              type: "array",
              items: { type: "string" },
              description: cdpToolT("toggleMcpPanelServers.servers"),
            },
            settleMs: {
              type: "number",
              description: cdpToolT("toggleMcpPanelServers.settleMs"),
              default: 4000,
            },
            cycles: {
              type: "number",
              description: cdpToolT("toggleMcpPanelServers.cycles"),
              default: 1,
            },
            port: {
              type: "number",
              description: cdpToolT("toggleMcpPanelServers.port"),
            },
          },
        },
        metadata: {
          category: "electron",
          subcategory: "cdp-workflow",
          priority: "high",
          complexity: "medium",
          useCases: [
            cdpToolT("toggleMcpPanelServers.useCases.panelToggleAutomation"),
            cdpToolT("toggleMcpPanelServers.useCases.postRestartVerification"),
          ],
          relatedTools: [
            "hev_send_command_to_electron",
            "hev_check_electron_connection",
            "hev_take_cdp_screenshot",
          ],
          agentGuidance: cdpToolT("toggleMcpPanelServers.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "medium",
          tags: ["cdp", "mcp", "opencode", "automation"],
        },
      },
      handler: async (args) => await toggleMcpPanelServers(args ?? {}),
    },
  ];
}
