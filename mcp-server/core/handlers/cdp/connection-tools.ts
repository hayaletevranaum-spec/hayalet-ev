import {
  checkElectronConnection,
  listCdpInstances,
  listCdpTargets,
  sendCdpCommand,
  sendCommandToElectron,
  takeCdpScreenshot,
} from "../../../tools/cdp-tools.js";
import { createMcpTranslatorSync } from "../../../utils/i18n/index.js";
import type { ToolEntry } from "../../registry.js";

const cdpToolDefinitionTranslator = createMcpTranslatorSync();

function cdpToolT(key: string): string {
  return cdpToolDefinitionTranslator(`mcpServer.fs.toolDefinitions.cdp.${key}`);
}

export function createCdpConnectionTools(): ToolEntry[] {
  return [
    {
      definition: {
        name: "hev_list_cdp_instances",
        description: cdpToolT("listCdpInstances.description"),
        inputSchema: {
          type: "object",
          properties: {
            startPort: {
              type: "number",
              description: cdpToolT("listCdpInstances.startPort"),
            },
            endPort: {
              type: "number",
              description: cdpToolT("listCdpInstances.endPort"),
            },
          },
        },
        metadata: {
          category: "electron",
          subcategory: "cdp",
          priority: "high",
          complexity: "simple",
          useCases: [
            cdpToolT("listCdpInstances.useCases.instanceDiscovery"),
            cdpToolT("listCdpInstances.useCases.devPackagedRouting"),
            cdpToolT("listCdpInstances.useCases.multiAppDebugging"),
          ],
          relatedTools: ["hev_check_electron_connection", "hev_list_cdp_targets"],
          agentGuidance: cdpToolT("listCdpInstances.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "low",
          tags: ["cdp", "instances", "ports", "discovery"],
        },
      },
      handler: async (args) => await listCdpInstances(args ?? {}),
    },
    {
      definition: {
        name: "hev_check_electron_connection",
        description: cdpToolT("checkElectronConnection.description"),
        inputSchema: {
          type: "object",
          properties: {
            port: {
              type: "number",
              description: cdpToolT("checkElectronConnection.port"),
            },
          },
        },
        metadata: {
          category: "electron",
          subcategory: "cdp",
          priority: "high",
          complexity: "simple",
          useCases: [
            cdpToolT("checkElectronConnection.useCases.connectivityCheck"),
            cdpToolT("checkElectronConnection.useCases.appHealth"),
            cdpToolT("checkElectronConnection.useCases.debugStart"),
          ],
          relatedTools: ["hev_test_electron", "hev_send_command_to_electron"],
          agentGuidance: cdpToolT("checkElectronConnection.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "low",
          tags: ["cdp", "connectivity", "electron", "health"],
        },
      },
      handler: async (args) => await checkElectronConnection(args ?? {}),
    },
    {
      definition: {
        name: "hev_list_cdp_targets",
        description: cdpToolT("listCdpTargets.description"),
        inputSchema: {
          type: "object",
          properties: {
            port: {
              type: "number",
              description: cdpToolT("listCdpTargets.port"),
            },
          },
        },
        metadata: {
          category: "electron",
          subcategory: "cdp",
          priority: "medium",
          complexity: "simple",
          useCases: [
            cdpToolT("listCdpTargets.useCases.targetDiscovery"),
            cdpToolT("listCdpTargets.useCases.targetSelection"),
            cdpToolT("listCdpTargets.useCases.multiTargetDebugging"),
          ],
          relatedTools: ["hev_get_cdp_target_info", "hev_send_cdp_command"],
          agentGuidance: cdpToolT("listCdpTargets.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "low",
          tags: ["cdp", "targets", "inspection", "debugging"],
        },
      },
      handler: async (args) => await listCdpTargets(args ?? {}),
    },
    {
      definition: {
        name: "hev_send_command_to_electron",
        description: cdpToolT("sendCommandToElectron.description"),
        inputSchema: {
          type: "object",
          properties: {
            command: { type: "string", description: cdpToolT("sendCommandToElectron.command") },
            description: {
              type: "string",
              description: cdpToolT("sendCommandToElectron.commandDescription"),
            },
            port: {
              type: "number",
              description: cdpToolT("sendCommandToElectron.port"),
            },
          },
          required: ["command"],
        },
        metadata: {
          category: "electron",
          subcategory: "cdp",
          priority: "high",
          complexity: "medium",
          useCases: [
            cdpToolT("sendCommandToElectron.useCases.domManipulation"),
            cdpToolT("sendCommandToElectron.useCases.stateInspection"),
            cdpToolT("sendCommandToElectron.useCases.customJsExecution"),
          ],
          relatedTools: ["hev_inspect_element", "hev_query_elements"],
          agentGuidance: cdpToolT("sendCommandToElectron.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "medium",
          tags: ["cdp", "javascript", "execution", "advanced"],
        },
      },
      handler: async (args) => await sendCommandToElectron(args ?? {}),
    },
    {
      definition: {
        name: "hev_send_cdp_command",
        description: cdpToolT("sendCdpCommand.description"),
        inputSchema: {
          type: "object",
          properties: {
            targetId: {
              type: "string",
              description: cdpToolT("sendCdpCommand.targetId"),
            },
            port: {
              type: "number",
              description: cdpToolT("sendCdpCommand.port"),
            },
            domain: {
              type: "string",
              description: cdpToolT("sendCdpCommand.domain"),
            },
            method: {
              type: "string",
              description: cdpToolT("sendCdpCommand.method"),
            },
            params: {
              type: "object",
              description: cdpToolT("sendCdpCommand.params"),
            },
            timeout: {
              type: "number",
              description: cdpToolT("sendCdpCommand.timeout"),
            },
          },
          required: ["domain", "method"],
        },
        metadata: {
          category: "electron",
          subcategory: "cdp",
          priority: "medium",
          complexity: "advanced",
          useCases: [
            cdpToolT("sendCdpCommand.useCases.rawCdpDebugging"),
            cdpToolT("sendCdpCommand.useCases.targetedReload"),
            cdpToolT("sendCdpCommand.useCases.runtimeEvaluation"),
          ],
          relatedTools: [
            "hev_list_cdp_targets",
            "hev_get_cdp_target_info",
            "hev_send_command_to_electron",
          ],
          agentGuidance: cdpToolT("sendCdpCommand.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "medium",
          tags: ["cdp", "target", "command", "advanced"],
        },
      },
      handler: async (args) => await sendCdpCommand(args ?? {}),
    },
    {
      definition: {
        name: "hev_take_cdp_screenshot",
        description: cdpToolT("takeScreenshot.description"),
        inputSchema: {
          type: "object",
          properties: {
            format: {
              type: "string",
              enum: ["png", "jpeg"],
              description: cdpToolT("takeScreenshot.format"),
              default: "png",
            },
            quality: {
              type: "number",
              description: cdpToolT("takeScreenshot.quality"),
              default: 80,
            },
            savePath: {
              type: "string",
              description: cdpToolT("takeScreenshot.savePath"),
            },
            port: {
              type: "number",
              description: cdpToolT("takeScreenshot.port"),
            },
          },
        },
        metadata: {
          category: "electron",
          subcategory: "cdp",
          priority: "medium",
          complexity: "simple",
          useCases: [
            cdpToolT("takeScreenshot.useCases.visualDebugging"),
            cdpToolT("takeScreenshot.useCases.uiVerification"),
            cdpToolT("takeScreenshot.useCases.documentation"),
          ],
          relatedTools: ["hev_inspect_element", "hev_query_elements"],
          agentGuidance: cdpToolT("takeScreenshot.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "low",
          tags: ["cdp", "screenshot", "visual", "debugging"],
        },
      },
      handler: async (args) => await takeCdpScreenshot(args ?? {}),
    },
  ];
}
