import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { join } from "path";
import { logError } from "../utils/mcp-logger.js";
import { createMcpTranslatorSync } from "../utils/i18n/index.js";
import { setMcpServer, setProgressToken } from "../utils/progress.js";
import { PROJECT_ROOT } from "../utils/project-root.js";
import { getAllDefinitions, getToolCount } from "./registry.js";
import { registerAllTools } from "./handlers/index.js";
import { handleToolCall } from "./handlers.js";

const LOG_DIR = join(PROJECT_ROOT, "logs", "app");

const MCP_VERSION = "3.0.0";
const startupTranslator = createMcpTranslatorSync();

function startupT(key: string, params?: Record<string, string | number | boolean>): string {
  return startupTranslator(`mcpServer.startup.${key}`, params);
}

interface McpServerInitialization {
  server: Server;
  PROJECT_ROOT: string;
  LOG_DIR: string;
}

export function initializeMcpServer(): McpServerInitialization {
  const server = new Server(
    {
      name: "app-mcp",
      version: MCP_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  registerAllTools({ PROJECT_ROOT, LOG_DIR });

  setMcpServer(server);

  server.setRequestHandler(ListToolsRequestSchema, () => {
    return { tools: getAllDefinitions() };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const progressToken = (request.params as { _meta?: { progressToken?: string | number } })._meta
      ?.progressToken;
    setProgressToken(progressToken ?? null);

    return (await handleToolCall(name, args ?? {})) as Record<string, unknown>;
  });

  return { server, PROJECT_ROOT, LOG_DIR };
}

export async function main(): Promise<void> {
  try {
    const { server } = initializeMcpServer();

    const transport = new StdioServerTransport();
    await server.connect(transport);
    // NOTE: Keep the process alive for stdio-based MCP clients.
    process.stdin.resume();
    process.stderr.write(
      `${startupT("serverStarted", {
        version: MCP_VERSION,
        toolCount: getToolCount(),
      })}\n`
    );
  } catch (err) {
    const error = err as Error;
    logError(startupT("serverStartError"), error);
    process.stderr.write(
      `${startupT("serverErrorLine", { message: error.message })}\n${error.stack ?? ""}\n`
    );
    process.exit(1);
  }
}
