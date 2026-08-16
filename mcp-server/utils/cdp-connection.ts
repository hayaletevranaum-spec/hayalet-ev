// NOTE: CDP connections execute JavaScript remotely in Electron.

import WebSocket from "ws";
import { CDP_TIMEOUTS } from "@timeouts";
import { createMcpTranslatorSync } from "./i18n/index.js";

function normalizePortCandidate(value: unknown): number | null {
  if (typeof value !== "number" || Number.isInteger(value) === false) {
    return null;
  }
  return value >= 1 && value <= 65535 ? value : null;
}

const DEFAULT_CDP_PORT = normalizePortCandidate(Number(process.env["CDP_PORT"] ?? 9222)) ?? 9222;
const DEFAULT_CDP_HOST =
  typeof process.env["CDP_HOST"] === "string" && process.env["CDP_HOST"].trim() !== ""
    ? process.env["CDP_HOST"].trim()
    : "localhost";
const DEFAULT_CDP_INSTANCE_SCAN_RANGE = Object.freeze({
  start: DEFAULT_CDP_PORT,
  end: DEFAULT_CDP_PORT + 2,
});

function cdpConnectionT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.cdpTools.connectionErrors.${key}`, params);
}

export interface CDPConnectionOptions {
  host?: string;
  port?: number;
}

export interface CDPInstanceDiscoveryOptions extends CDPConnectionOptions {
  startPort?: number;
  endPort?: number;
}

interface ResolvedCDPConnectionOptions {
  host: string;
  port: number;
}

export interface CDPTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
}

export interface CDPBrowserVersionInfo {
  Browser?: string;
  "Protocol-Version"?: string;
  "User-Agent"?: string;
  webSocketDebuggerUrl?: string;
}

export interface CDPInstanceInfo {
  host: string;
  port: number;
  browser: string;
  userAgent: string;
  targetsCount: number;
  mainWindow:
    | {
        title: string;
        url: string;
        type: string;
      }
    | null;
  kind: "dev" | "packaged" | "unknown";
  isDefault: boolean;
}

interface CDPResponse {
  id?: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
  exceptionDetails?: {
    exception?: { description?: string };
    text?: string;
  };
}

interface EvaluateResult {
  result?: { value?: unknown };
  exceptionDetails?: {
    exception?: { description?: string };
    text?: string;
  };
}

function resolveConnectionOptions(options: CDPConnectionOptions = {}): ResolvedCDPConnectionOptions {
  const host =
    typeof options.host === "string" && options.host.trim() !== ""
      ? options.host.trim()
      : DEFAULT_CDP_HOST;
  const port = normalizePortCandidate(options.port) ?? DEFAULT_CDP_PORT;
  return { host, port };
}

function buildJsonEndpoint(path: string, connection: ResolvedCDPConnectionOptions): string {
  return `http://${connection.host}:${connection.port}${path}`;
}

async function fetchJson<T>(
  path: string,
  connection: ResolvedCDPConnectionOptions,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(buildJsonEndpoint(path, connection), {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        cdpConnectionT("httpStatus", {
          status: response.status,
          statusText: response.statusText,
        })
      );
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildConnectionError(error: unknown, connection: ResolvedCDPConnectionOptions): Error {
  const err = error as Error & {
    code?: string;
    cause?: { code?: string };
  };
  const errorCode =
    typeof err.code === "string"
      ? err.code
      : typeof err.cause?.code === "string"
        ? err.cause.code
        : "";

  if (err.name === "AbortError") {
    const timeoutError = new Error(
      cdpConnectionT("connectionTimeout", { port: connection.port })
    ) as Error & { cause?: unknown };
    timeoutError.cause = error;
    return timeoutError;
  }

  if (errorCode === "ECONNREFUSED" || err.message.includes("ECONNREFUSED")) {
    const connectionError = new Error(
      cdpConnectionT("connectionRefused", { port: connection.port })
    ) as Error & { cause?: unknown };
    connectionError.cause = error;
    return connectionError;
  }

  if (err.message.includes("fetch failed")) {
    const fetchError = new Error(
      cdpConnectionT("fetchFailed", { port: connection.port })
    ) as Error & {
      cause?: unknown;
    };
    fetchError.cause = error;
    return fetchError;
  }

  return err;
}

async function loadTargets(
  connection: ResolvedCDPConnectionOptions,
  timeoutMs: number = CDP_TIMEOUTS.TARGET_DISCOVERY
): Promise<CDPTarget[]> {
  try {
    const targets = await fetchJson<CDPTarget[]>("/json", connection, timeoutMs);
    return Array.isArray(targets) ? targets : [];
  } catch (error) {
    throw buildConnectionError(error, connection);
  }
}

async function loadVersionInfo(
  connection: ResolvedCDPConnectionOptions,
  timeoutMs: number = CDP_TIMEOUTS.TARGET_DISCOVERY
): Promise<CDPBrowserVersionInfo> {
  try {
    return await fetchJson<CDPBrowserVersionInfo>("/json/version", connection, timeoutMs);
  } catch (error) {
    throw buildConnectionError(error, connection);
  }
}

function looksLikeHayaletInstance(
  versionInfo: CDPBrowserVersionInfo,
  targets: CDPTarget[]
): boolean {
  const userAgent = (versionInfo["User-Agent"] ?? "").toLowerCase();
  if (userAgent.includes("hayalet-ev")) {
    return true;
  }

  return targets.some((target) =>
    `${target.title} ${target.url}`.toLowerCase().includes("hayalet")
  );
}

function inferInstanceKind(targets: CDPTarget[]): CDPInstanceInfo["kind"] {
  const mainWindow = pickPreferredTarget(targets);
  const mainUrl = mainWindow?.url ?? "";

  if (mainUrl.startsWith("http://localhost") || mainUrl.startsWith("http://127.0.0.1")) {
    return "dev";
  }

  if (mainUrl.startsWith("file://")) {
    return "packaged";
  }

  return "unknown";
}

function normalizeScanRange(options: CDPInstanceDiscoveryOptions): {
  startPort: number;
  endPort: number;
} {
  const defaultStart = normalizePortCandidate(options.port) ?? DEFAULT_CDP_INSTANCE_SCAN_RANGE.start;
  const rawStart = normalizePortCandidate(options.startPort) ?? defaultStart;
  const rawEnd =
    normalizePortCandidate(options.endPort) ??
    Math.max(rawStart, DEFAULT_CDP_INSTANCE_SCAN_RANGE.end);

  return {
    startPort: Math.min(rawStart, rawEnd),
    endPort: Math.max(rawStart, rawEnd),
  };
}

export async function discoverInstances(
  options: CDPInstanceDiscoveryOptions = {}
): Promise<CDPInstanceInfo[]> {
  const connection = resolveConnectionOptions(options);
  const { startPort, endPort } = normalizeScanRange(options);
  const ports = Array.from({ length: endPort - startPort + 1 }, (_, index) => startPort + index);

  const instances = await Promise.all(
    ports.map(async (port) => {
      const currentConnection = { host: connection.host, port };

      try {
        const [targets, versionInfo] = await Promise.all([
          loadTargets(currentConnection, Math.min(CDP_TIMEOUTS.TARGET_DISCOVERY, 750)),
          loadVersionInfo(currentConnection, Math.min(CDP_TIMEOUTS.TARGET_DISCOVERY, 750)),
        ]);

        if (looksLikeHayaletInstance(versionInfo, targets) === false) {
          return null;
        }

        const mainWindow = pickPreferredTarget(targets);
        return {
          host: currentConnection.host,
          port,
          browser: versionInfo["Browser"] ?? "",
          userAgent: versionInfo["User-Agent"] ?? "",
          targetsCount: targets.length,
          mainWindow: mainWindow
            ? {
                title: mainWindow.title,
                url: mainWindow.url,
                type: mainWindow.type,
              }
            : null,
          kind: inferInstanceKind(targets),
          isDefault: port === DEFAULT_CDP_PORT && currentConnection.host === DEFAULT_CDP_HOST,
        } satisfies CDPInstanceInfo;
      } catch {
        return null;
      }
    })
  );

  return instances.filter((instance): instance is CDPInstanceInfo => instance !== null);
}

export async function discoverTargets(options: CDPConnectionOptions = {}): Promise<CDPTarget[]> {
  return await loadTargets(resolveConnectionOptions(options));
}

export function pickPreferredTarget(targets: CDPTarget[]): CDPTarget | null {
  // NOTE: Prefer a "page" target first.
  const pageTarget = targets.find((target) => target.type === "page");
  if (pageTarget) return pageTarget;

  // NOTE: Fall back to the first target if no "page" target is available.
  return targets[0] ?? null;
}

async function findMainWindow(options: CDPConnectionOptions = {}): Promise<CDPTarget | null> {
  const targets = await discoverTargets(options);
  return pickPreferredTarget(targets);
}

export async function findTargetById(
  targetId: string,
  options: CDPConnectionOptions = {}
): Promise<CDPTarget | null> {
  const targets = await discoverTargets(options);
  return targets.find((target) => target.id === targetId) ?? null;
}

export async function resolveTarget(
  targetId?: string,
  options: CDPConnectionOptions = {}
): Promise<CDPTarget> {
  if (targetId !== undefined && targetId !== "") {
    const target = await findTargetById(targetId, options);
    if (target !== null) return target;
    throw new Error(cdpConnectionT("targetNotFound", { targetId }));
  }

  const target = await findMainWindow(options);
  if (target !== null) return target;
  throw new Error(cdpConnectionT("windowNotFound"));
}

async function connectToTarget(wsUrl: string): Promise<WebSocket> {
  return await new Promise((resolve, reject) => {
    let resolved = false;
    const ws = new WebSocket(wsUrl);

    ws.on("open", () => {
      if (!resolved) {
        resolved = true;
        resolve(ws);
      }
    });

    ws.on("error", (err: Error) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(cdpConnectionT("websocketError", { message: err.message })));
      }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.terminate();
        reject(new Error(cdpConnectionT("websocketTimeout")));
      }
    }, CDP_TIMEOUTS.WEBSOCKET_CONNECT);
  });
}

let cdpCommandId = 1;

function rawDataToText(data: WebSocket.RawData): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(data));
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }
  return "";
}

export async function sendCDPCommand(
  ws: WebSocket,
  method: string,
  params: Record<string, unknown> = {},
  timeout: number = CDP_TIMEOUTS.COMMAND_DEFAULT
): Promise<Record<string, unknown>> {
  return await new Promise((resolve, reject) => {
    const id = cdpCommandId++;
    const messageHandler = (data: WebSocket.RawData): void => {
      try {
        const response = JSON.parse(rawDataToText(data)) as CDPResponse;
        if (response.id === id) {
          clearTimeout(timeoutId);
          ws.off("message", messageHandler);
          if (response.error) {
            reject(new Error(cdpConnectionT("cdpError", { message: response.error.message })));
          } else {
            resolve(response.result ?? {});
          }
        }
      } catch {
        // NOTE: Ignore JSON parse errors and keep listening.
      }
    };

    const timeoutId = setTimeout(() => {
      ws.off("message", messageHandler);
      reject(new Error(cdpConnectionT("commandTimeout", { method })));
    }, timeout);

    ws.on("message", messageHandler);

    try {
      ws.send(JSON.stringify({ id, method, params }));
    } catch (error) {
      const err = error as Error;
      ws.off("message", messageHandler);
      reject(new Error(cdpConnectionT("websocketSendError", { message: err.message })));
    }
  });
}

export async function evaluateJS(
  ws: WebSocket,
  expression: string,
  awaitPromise = true,
  timeout?: number
): Promise<unknown> {
  const result = (await sendCDPCommand(
    ws,
    "Runtime.evaluate",
    {
      expression,
      awaitPromise,
      returnByValue: true,
    },
    timeout
  )) as EvaluateResult;

  if (result.exceptionDetails) {
    throw new Error(
      cdpConnectionT("javascriptError", {
        message:
          result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text ??
          cdpConnectionT("unknown"),
      })
    );
  }

  return result.result?.value;
}

export async function withConnection<T>(
  action: (ws: WebSocket) => Promise<T>,
  connectionOptions: CDPConnectionOptions = {}
): Promise<T> {
  return await withTargetConnection(
    undefined,
    async (ws) => await action(ws),
    {},
    connectionOptions
  );
}

export async function withTargetConnection<T>(
  targetId: string | undefined,
  action: (ws: WebSocket, target: CDPTarget) => Promise<T>,
  options: { enableRuntime?: boolean } = {},
  connectionOptions: CDPConnectionOptions = {}
): Promise<T> {
  const target = await resolveTarget(targetId, connectionOptions);

  if (target.webSocketDebuggerUrl === "") {
    throw new Error(cdpConnectionT("targetMissingWebSocket", { targetId: target.id }));
  }

  const ws = await connectToTarget(target.webSocketDebuggerUrl);

  try {
    if (options.enableRuntime !== false) {
      await sendCDPCommand(ws, "Runtime.enable");
    }
    return await action(ws, target);
  } finally {
    ws.close();
  }
}

interface ConnectionStatus {
  connected: boolean;
  host: string;
  port: string | number;
  kind?: CDPInstanceInfo["kind"];
  targetsCount?: number;
  mainWindow?: {
    title: string;
    url: string;
    type: string;
  } | null;
  error?: string;
}

export async function checkConnection(
  options: CDPConnectionOptions = {}
): Promise<ConnectionStatus> {
  const connection = resolveConnectionOptions(options);

  try {
    const targets = await discoverTargets(connection);
    const mainWindow = targets.find((target) => target.type === "page");

    return {
      connected: true,
      host: connection.host,
      port: connection.port,
      kind: inferInstanceKind(targets),
      targetsCount: targets.length,
      mainWindow: mainWindow
        ? {
            title: mainWindow.title,
            url: mainWindow.url,
            type: mainWindow.type,
          }
        : null,
    };
  } catch (error) {
    const err = error as Error;
    return {
      connected: false,
      host: connection.host,
      port: connection.port,
      error: err.message,
    };
  }
}
