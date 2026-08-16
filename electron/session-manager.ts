// NOTE: Clears cache on startup while preserving login data (cookies, localStorage).

import { session } from "electron";
import { getLoggerCore } from "./logger/index.js";
import { LogCategory, LogLevel } from "@shared/index.js";
import { PARTITIONS } from "@slots";

const logger = getLoggerCore();

interface ClearResult {
  success: boolean;
  cleared: string[];
  error?: string;
}

const CLEARABLE_STORAGES: ("cachestorage" | "serviceworkers")[] = [
  "cachestorage",
  "serviceworkers",
];

async function clearPartitionCache(partitionName: string): Promise<ClearResult> {
  try {
    const ses = session.fromPartition(partitionName);

    await ses.clearStorageData({
      storages: CLEARABLE_STORAGES,
    });

    await ses.clearCache();

    await logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.INFO,
      "electron.session.logs.cacheClearedForPartition",
      { partition: partitionName },
      {
        partition: partitionName,
        storages: [...CLEARABLE_STORAGES, "httpcache"],
      }
    );

    return {
      success: true,
      cleared: [...CLEARABLE_STORAGES, "httpcache"],
    };
  } catch (error) {
    await logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.ERROR,
      "electron.session.logs.cacheClearError",
      { message: (error as Error).message },
      {
        partition: partitionName,
        error: {
          name: (error as Error).name,
          message: (error as Error).message,
          stack: (error as Error).stack,
        },
      }
    );

    return {
      success: false,
      cleared: [],
      error: (error as Error).message,
    };
  }
}

export async function clearStartupCache(): Promise<{ main: ClearResult; assistant: ClearResult }> {
  await logger.logInternalT(
    LogCategory.MAIN,
    LogLevel.INFO,
    "electron.session.logs.startupCacheClearingStarted"
  );

  const results = {
    main: await clearPartitionCache(PARTITIONS.MAIN),
    assistant: await clearPartitionCache(PARTITIONS.ASSISTANT),
  };

  const totalSuccess = results.main.success && results.assistant.success;

  await logger.logInternalT(
    LogCategory.MAIN,
    LogLevel.INFO,
    totalSuccess
      ? "electron.session.logs.startupCacheClearingCompleted"
      : "electron.session.logs.startupCacheClearingPartiallyFailed",
    undefined,
    { mainSuccess: results.main.success, assistantSuccess: results.assistant.success }
  );

  return results;
}

const sessionManager = {
  PARTITIONS,
  clearStartupCache,
  clearPartitionCache,
};

export { sessionManager as SessionManager };
