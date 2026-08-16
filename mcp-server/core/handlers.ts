import { getHandler, getToolCount, getRegisteredToolNames, getRegistryStats } from "./registry.js";
import { logToolCall, logToolSuccess, logToolError } from "../utils/mcp-logger.js";
import { createMcpTranslatorSync } from "../utils/i18n/index.js";

interface LoggingAdapter {
  logToolCall: (name: string, args: unknown) => { startTime: number };
  logToolSuccess: (name: string, result: unknown, duration: number) => void;
  logToolError: (name: string, error: Error, args: unknown, startTime?: number) => void;
  now: () => number;
}

const defaultLoggingAdapter: LoggingAdapter = {
  logToolCall,
  logToolSuccess,
  logToolError,
  now: () => Date.now(),
};

const handlerT = createMcpTranslatorSync();

export async function executeHandlerWithLogging(
  name: string,
  args: Record<string, unknown> | undefined,
  handler: (args?: Record<string, unknown>) => unknown,
  logging: LoggingAdapter = defaultLoggingAdapter
): Promise<unknown> {
  const { startTime } = logging.logToolCall(name, args ?? {});

  try {
    const result = await handler(args);
    logging.logToolSuccess(name, result, logging.now() - startTime);
    return result;
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    logging.logToolError(name, normalizedError, args ?? {}, startTime);
    throw normalizedError;
  }
}

export async function handleToolCall(
  name: string,
  args?: Record<string, unknown> | string,
  logging: LoggingAdapter = defaultLoggingAdapter
): Promise<unknown> {
  const handler = getHandler(name);

  if (!handler) {
    logging.logToolError(
      name === "" ? "unknown-tool" : name,
      new Error(
        handlerT("mcpServer.handlers.unknownTool", {
          name,
          count: getToolCount(),
        })
      ),
      {
        requestedTool: name,
        availableToolCount: getToolCount(),
      }
    );

    return {
      content: [
        {
          type: "text",
          text: handlerT("mcpServer.handlers.unknownTool", {
            name,
            count: getToolCount(),
          }),
        },
      ],
      isError: true,
    };
  }

  // NOTE: Some LLMs occasionally send tool_input as a raw string; parse before failing.
  let safeArgs: Record<string, unknown> | undefined = typeof args === "string" ? undefined : args;
  if (typeof args === "string") {
    try {
      safeArgs = JSON.parse(args) as Record<string, unknown>;
    } catch {
      logging.logToolError(
        name === "" ? "tool-input-parse" : name,
        new Error(
          handlerT("mcpServer.handlers.toolInputParseError", {
            value: String(args).slice(0, 200),
          })
        ),
        {
          rawArgsPreview: String(args).slice(0, 200),
        }
      );

      return {
        content: [
          {
            type: "text",
            text: handlerT("mcpServer.handlers.toolInputParseError", {
              value: String(args).slice(0, 200),
            }),
          },
        ],
        isError: true,
      };
    }
  }

  try {
    return await executeHandlerWithLogging(name, safeArgs, handler, logging);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: handlerT("mcpServer.handlers.executionError", {
            name,
            message: errorMessage,
          }),
        },
      ],
      isError: true,
    };
  }
}

export function getHandlerInfo(): {
  totalHandlers: number;
  categories: Record<string, number>;
  handlerNames: string[];
} {
  const stats = getRegistryStats();
  return {
    totalHandlers: getToolCount(),
    categories: stats,
    handlerNames: getRegisteredToolNames(),
  };
}
