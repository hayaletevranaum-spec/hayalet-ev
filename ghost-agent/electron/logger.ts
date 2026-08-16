import { appendFile, mkdir, writeFile } from "fs/promises";
import { join } from "path";

type ConsoleMethod = "log" | "info" | "warn" | "error" | "debug";

type OriginalConsole = Record<ConsoleMethod, (...args: unknown[]) => void>;

interface GhostLoggerState {
  initialized: boolean;
  sessionId: string;
  sessionDir: string;
  consoleLogPath: string;
  errorLogPath: string;
  structuredLogPath: string;
  startTime: number;
  totalLogs: number;
  errors: number;
  warnings: number;
  duplicateSuppressed: number;
  lastSignature: string;
  lastTimestampMs: number;
  originalConsole: OriginalConsole;
}

type GhostLogLevel = "debug" | "info" | "warn" | "error";

interface GhostStructuredLogEntry {
  timestamp: string;
  level: GhostLogLevel;
  source: "ghost-agent";
  category: string;
  message: string;
  context?: Record<string, unknown>;
}

const runtimeConsole = globalThis.console;

const DUPLICATE_WINDOW_MS = 400;

const state: GhostLoggerState = {
  initialized: false,
  sessionId: "",
  sessionDir: "",
  consoleLogPath: "",
  errorLogPath: "",
  structuredLogPath: "",
  startTime: 0,
  totalLogs: 0,
  errors: 0,
  warnings: 0,
  duplicateSuppressed: 0,
  lastSignature: "",
  lastTimestampMs: 0,
  originalConsole: {
    log: runtimeConsole.log.bind(runtimeConsole),
    info: runtimeConsole.info.bind(runtimeConsole),
    warn: runtimeConsole.warn.bind(runtimeConsole),
    error: runtimeConsole.error.bind(runtimeConsole),
    debug: runtimeConsole.debug.bind(runtimeConsole),
  },
};

function levelFromMethod(method: ConsoleMethod): string {
  if (method === "error") return "ERROR";
  if (method === "warn") return "WARN";
  if (method === "debug") return "DEBUG";
  if (method === "info") return "INFO";
  return "LOG";
}

function normalizeValue(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (typeof arg === "number" || typeof arg === "boolean" || typeof arg === "bigint") {
    return String(arg);
  }
  if (arg instanceof Error) {
    const stack = typeof arg.stack === "string" && arg.stack.length > 0 ? `\n${arg.stack}` : "";
    return `${arg.name}: ${arg.message}${stack}`;
  }
  if (arg == null) return "";
  try {
    return JSON.stringify(arg);
  } catch {
    return "[unserializable]";
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function shouldSuppressDuplicate(signature: string, timestampMs: number): boolean {
  if (state.lastSignature !== signature) {
    state.lastSignature = signature;
    state.lastTimestampMs = timestampMs;
    return false;
  }

  if (timestampMs - state.lastTimestampMs <= DUPLICATE_WINDOW_MS) {
    state.duplicateSuppressed += 1;
    state.lastTimestampMs = timestampMs;
    return true;
  }

  state.lastTimestampMs = timestampMs;
  return false;
}

function generateSessionId(): string {
  const now = new Date();
  const date = now.toISOString().split("T")[0]?.replace(/-/g, "") ?? "00000000";
  const time = now.toTimeString().split(" ")[0]?.replace(/:/g, "") ?? "000000";
  const random = Math.random().toString(36).slice(2, 6);
  return `${date}-${time}-${random}`;
}

async function writeLog(method: ConsoleMethod, args: unknown[]): Promise<void> {
  if (!state.initialized) return;

  const timestampMs = Date.now();
  const timestamp = new Date(timestampMs).toISOString();
  const level = levelFromMethod(method);
  const message = args.map((arg) => normalizeValue(arg)).join(" ");
  const signature = `${level}|${message}`;

  if (shouldSuppressDuplicate(signature, timestampMs)) {
    return;
  }

  state.totalLogs += 1;
  if (method === "warn") state.warnings += 1;
  if (method === "error") state.errors += 1;

  const line = `[${timestamp}] [${level}] [GHOST-AGENT] ${message}\n`;

  try {
    await appendFile(state.consoleLogPath, line, "utf-8");
    if (method === "error") {
      await appendFile(state.errorLogPath, line, "utf-8");
    }
    await appendFile(
      state.structuredLogPath,
      `${safeStringify({
        timestamp,
        level: level.toLowerCase(),
        source: "ghost-agent",
        category: "ghost-agent",
        message,
      })}\n`,
      "utf-8"
    );
  } catch (err) {
    state.originalConsole.error("[ghost-agent-logger] write failed", err);
  }
}

function buildStructuredLine(entry: GhostStructuredLogEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

async function appendStructured(entry: GhostStructuredLogEntry): Promise<void> {
  if (!state.initialized) return;
  try {
    await appendFile(state.structuredLogPath, buildStructuredLine(entry), "utf-8");
  } catch (err) {
    state.originalConsole.error("[ghost-agent-logger] structured write failed", err);
  }
}

function patchConsole(): void {
  const methods: ConsoleMethod[] = ["log", "info", "warn", "error", "debug"];

  for (const method of methods) {
    runtimeConsole[method] = (...args: unknown[]): void => {
      state.originalConsole[method](...args);
      void writeLog(method, args);
    };
  }
}

function restoreConsole(): void {
  runtimeConsole.log = state.originalConsole.log;
  runtimeConsole.info = state.originalConsole.info;
  runtimeConsole.warn = state.originalConsole.warn;
  runtimeConsole.error = state.originalConsole.error;
  runtimeConsole.debug = state.originalConsole.debug;
}

export async function initGhostLogger(projectRoot: string = process.cwd()): Promise<void> {
  if (state.initialized) return;

  state.startTime = Date.now();
  state.sessionId = generateSessionId();

  const baseDir = join(projectRoot, "logs", "ghost-agent");
  state.sessionDir = join(baseDir, state.sessionId);
  state.consoleLogPath = join(state.sessionDir, "console-001.log");
  state.errorLogPath = join(state.sessionDir, "error.log");
  state.structuredLogPath = join(state.sessionDir, "structured.jsonl");

  await mkdir(state.sessionDir, { recursive: true });

  const metadata = {
    sessionId: state.sessionId,
    startTime: new Date(state.startTime).toISOString(),
    pid: process.pid,
    platform: process.platform,
    nodeVersion: process.version,
    electronVersion: process.versions.electron,
    app: "ghost-agent",
  };

  await writeFile(
    join(state.sessionDir, "session-metadata.json"),
    JSON.stringify(metadata, null, 2)
  );

  patchConsole();
  state.initialized = true;
  state.originalConsole.info("[ghost-agent-logger] initialized", {
    sessionId: state.sessionId,
    sessionDir: state.sessionDir,
  });
}

export async function shutdownGhostLogger(): Promise<void> {
  if (!state.initialized) return;

  const summary = {
    sessionId: state.sessionId,
    startTime: new Date(state.startTime).toISOString(),
    endTime: new Date().toISOString(),
    duration: Date.now() - state.startTime,
    stats: {
      totalLogs: state.totalLogs,
      errorCount: state.errors,
      warningCount: state.warnings,
      duplicateSuppressed: state.duplicateSuppressed,
    },
  };

  await writeFile(
    join(state.sessionDir, "summary.json"),
    JSON.stringify(summary, null, 2),
    "utf-8"
  );

  restoreConsole();
  state.initialized = false;
}

export async function logGhost(
  level: GhostLogLevel,
  message: string,
  context?: Record<string, unknown>
): Promise<void> {
  const timestampMs = Date.now();
  const timestamp = new Date(timestampMs).toISOString();
  const entry: GhostStructuredLogEntry = {
    timestamp,
    level,
    source: "ghost-agent",
    category: "ghost-agent",
    message,
    ...(context !== undefined ? { context } : {}),
  };

  if (!state.initialized) {
    const args = context !== undefined ? [message, context] : [message];
    if (level === "error") state.originalConsole.error(...args);
    else if (level === "warn") state.originalConsole.warn(...args);
    else if (level === "debug") state.originalConsole.debug(...args);
    else state.originalConsole.info(...args);
    return;
  }

  const signature = `${level}|${message}|${context !== undefined ? safeStringify(context) : ""}`;
  if (shouldSuppressDuplicate(signature, timestampMs)) {
    return;
  }

  state.totalLogs += 1;
  if (level === "warn") state.warnings += 1;
  if (level === "error") state.errors += 1;

  const consoleLevel =
    level === "warn" ? "WARN" : level === "error" ? "ERROR" : level.toUpperCase();
  const contextSuffix = context !== undefined ? ` | ctx: ${safeStringify(context)}` : "";
  const line = `[${entry.timestamp}] [${consoleLevel}] [GHOST-AGENT] ${message}${contextSuffix}\n`;

  try {
    await appendFile(state.consoleLogPath, line, "utf-8");
    if (level === "error") {
      await appendFile(state.errorLogPath, line, "utf-8");
    }
  } catch (err) {
    state.originalConsole.error("[ghost-agent-logger] console write failed", err);
  }

  await appendStructured(entry);
}

export function getGhostLogSessionId(): string {
  return state.sessionId;
}
