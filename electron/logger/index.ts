export * from "./core/index.js";
export * from "./writers/index.js";
export * from "./readers/index.js";

import { LoggerCore } from "./core/LoggerCore.js";
import { ConsoleInterceptor } from "./core/ConsoleInterceptor.js";

export async function initLogger(logDir?: string): Promise<void> {
  const logger = LoggerCore.getInstance();
  await logger.init(logDir);
  ConsoleInterceptor.install();
}

export async function shutdownLogger(): Promise<void> {
  const logger = LoggerCore.getInstance();
  await logger.shutdown();
  ConsoleInterceptor.uninstall();
}
