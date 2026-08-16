// NOTE: MCP tool handlers for CDP-driven Electron automation.

import type WebSocket from "ws";
import type { ToolResult } from "../types/index-mcp.js";

import {
  checkConnection,
  discoverInstances as _discoverInstances,
  discoverTargets as _discoverTargets,
  type CDPConnectionOptions,
  findTargetById,
  pickPreferredTarget,
  evaluateJS,
  sendCDPCommand as dispatchCdpCommand,
  withTargetConnection,
} from "../utils/cdp-connection.js";
import { createMcpTranslatorSync } from "../utils/i18n/index.js";

import {
  checkElement,
  findElements,
  takeScreenshot,
  executeScript,
} from "../utils/cdp-commands.js";

import { logToolError } from "../utils/mcp-logger.js";

const COMMON_CDP_DOMAINS = [
  "Page",
  "Runtime",
  "Debugger",
  "DOM",
  "Network",
  "Console",
  "Memory",
  "Profiler",
  "Performance",
  "HeapProfiler",
];

function cdpT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.cdpTools.${key}`, params);
}

function cdpError(
  toolName: string,
  error: Error,
  key = "errors.generic",
  params?: Record<string, string | number | boolean>
): ToolResult {
  logToolError(toolName, error, {});
  return {
    content: [
      {
        type: "text",
        text: cdpT(key, {
          message: error.message,
          ...(params ?? {}),
        }),
      },
    ],
    isError: true,
  };
}

function isNonEmptyString(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Array.isArray(value) === false;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function toUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [];
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function clipText(value: unknown, maxLength = 240): string {
  const text =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean" || typeof value === "bigint"
        ? String(value)
        : value === null || value === undefined
          ? ""
          : stringifyJson(value);
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

function normalizePort(value: unknown): number | null {
  if (typeof value !== "number" || Number.isInteger(value) === false) {
    return null;
  }
  return value >= 1 && value <= 65535 ? value : null;
}

function normalizeNumber(
  value: unknown,
  fallback: number,
  options: { min: number; max: number }
): number {
  if (typeof value !== "number" || Number.isFinite(value) === false) {
    return fallback;
  }
  return Math.max(options.min, Math.min(options.max, Math.round(value)));
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readTargetId(args: Record<string, unknown>): string | undefined {
  const targetId = args["targetId"];
  return typeof targetId === "string" && targetId.trim() !== "" ? targetId.trim() : undefined;
}

async function wait(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function readConnectionOptions(
  args: Record<string, unknown>
): { value: CDPConnectionOptions } | { error: ToolResult } {
  const portRaw = args["port"];
  if (portRaw === undefined) {
    return { value: {} };
  }

  const port = normalizePort(portRaw);
  if (port === null) {
    return {
      error: {
        content: [{ type: "text", text: cdpT("common.invalidPort") }],
        isError: true,
      },
    };
  }

  return { value: { port } };
}

function createJsonToolResult(title: string, payload: unknown, isError = false): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: `${title}\n\n${stringifyJson(payload)}`,
      },
    ],
    ...(isError ? { isError: true } : {}),
  };
}

function readInstanceDiscoveryRange(
  args: Record<string, unknown>
): { value: { startPort?: number; endPort?: number } } | { error: ToolResult } {
  const startPortRaw = args["startPort"];
  const endPortRaw = args["endPort"];
  const parsedStartPort = startPortRaw === undefined ? undefined : normalizePort(startPortRaw);
  const parsedEndPort = endPortRaw === undefined ? undefined : normalizePort(endPortRaw);

  if (startPortRaw !== undefined && parsedStartPort === null) {
    return {
      error: {
        content: [{ type: "text", text: cdpT("common.invalidStartPort") }],
        isError: true,
      },
    };
  }

  if (endPortRaw !== undefined && parsedEndPort === null) {
    return {
      error: {
        content: [{ type: "text", text: cdpT("common.invalidEndPort") }],
        isError: true,
      },
    };
  }

  const startPort = parsedStartPort ?? undefined;
  const endPort = parsedEndPort ?? undefined;

  return {
    value: {
      ...(startPort !== undefined ? { startPort } : {}),
      ...(endPort !== undefined ? { endPort } : {}),
    },
  };
}

interface CdpEventEnvelope {
  method?: string;
  params?: Record<string, unknown>;
}

interface ConsoleDebugEvent {
  source: "runtime" | "exception" | "log";
  type: string;
  text: string;
  timestamp: number | null;
  url?: string | undefined;
  line?: number | undefined;
  column?: number | undefined;
  stack?: string | undefined;
}

interface NetworkDebugEvent {
  requestId: string;
  url: string;
  method?: string | undefined;
  status?: number | undefined;
  mimeType?: string | undefined;
  type?: string | undefined;
  failed?: boolean | undefined;
  errorText?: string | undefined;
  durationMs?: number | undefined;
}

function rawDataToText(data: WebSocket.RawData): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data));
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return "";
}

function parseCdpEvent(data: WebSocket.RawData): CdpEventEnvelope | null {
  try {
    const parsed = JSON.parse(rawDataToText(data)) as CdpEventEnvelope;
    return typeof parsed.method === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function readNestedString(value: unknown, path: string[]): string | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (isRecord(current) === false) return undefined;
    current = current[key];
  }
  return typeof current === "string" ? current : undefined;
}

function readNestedNumber(value: unknown, path: string[]): number | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (isRecord(current) === false) return undefined;
    current = current[key];
  }
  return typeof current === "number" && Number.isFinite(current) ? current : undefined;
}

function normalizeConsoleEvent(event: CdpEventEnvelope): ConsoleDebugEvent | null {
  const params = event.params ?? {};
  const timestamp = readNestedNumber(params, ["timestamp"]) ?? null;

  if (event.method === "Runtime.consoleAPICalled") {
    const args = Array.isArray(params["args"]) ? params["args"] : [];
    const text = args
      .map((arg) => {
        if (isRecord(arg) && typeof arg["value"] === "string") return arg["value"];
        if (isRecord(arg) && typeof arg["description"] === "string") return arg["description"];
        return "";
      })
      .filter((item) => item !== "")
      .join(" ");
    const stackTrace = toRecord(params["stackTrace"]);
    const callFrames = toUnknownArray(stackTrace?.["callFrames"]);
    const callFrame = callFrames.length > 0 ? callFrames[0] : undefined;

    return {
      source: "runtime",
      type: typeof params["type"] === "string" ? params["type"] : "console",
      text: clipText(text),
      timestamp,
      url: readNestedString(callFrame, ["url"]),
      line: readNestedNumber(callFrame, ["lineNumber"]),
      column: readNestedNumber(callFrame, ["columnNumber"]),
      stack: stackTrace !== null ? clipText(stackTrace, 1200) : undefined,
    };
  }

  if (event.method === "Runtime.exceptionThrown") {
    const details = isRecord(params["exceptionDetails"]) ? params["exceptionDetails"] : {};
    const exception = isRecord(details["exception"]) ? details["exception"] : {};
    const text =
      typeof exception["description"] === "string"
        ? exception["description"]
        : typeof details["text"] === "string"
          ? details["text"]
          : "Runtime exception";

    return {
      source: "exception",
      type: "exception",
      text: clipText(text, 600),
      timestamp,
      url: readNestedString(details, ["url"]),
      line: readNestedNumber(details, ["lineNumber"]),
      column: readNestedNumber(details, ["columnNumber"]),
      stack:
        typeof details["stackTrace"] === "object" && details["stackTrace"] !== null
          ? clipText(JSON.stringify(details["stackTrace"]), 1200)
          : undefined,
    };
  }

  if (event.method === "Log.entryAdded") {
    const entry = isRecord(params["entry"]) ? params["entry"] : {};
    return {
      source: "log",
      type: typeof entry["level"] === "string" ? entry["level"] : "log",
      text: clipText(entry["text"], 600),
      timestamp: readNestedNumber(entry, ["timestamp"]) ?? timestamp,
      url: readNestedString(entry, ["url"]),
      line: readNestedNumber(entry, ["lineNumber"]),
    };
  }

  return null;
}

async function captureConsoleEvents(
  ws: WebSocket,
  sampleMs: number,
  limit: number
): Promise<ConsoleDebugEvent[]> {
  const events: ConsoleDebugEvent[] = [];
  const handler = (data: WebSocket.RawData): void => {
    const parsed = parseCdpEvent(data);
    if (parsed === null) return;
    const event = normalizeConsoleEvent(parsed);
    if (event === null) return;
    events.push(event);
    if (events.length > limit) {
      events.splice(0, events.length - limit);
    }
  };

  ws.on("message", handler);
  try {
    await Promise.allSettled([
      dispatchCdpCommand(ws, "Runtime.enable", {}, 5_000),
      dispatchCdpCommand(ws, "Log.enable", {}, 5_000),
    ]);
    await wait(sampleMs);
  } finally {
    ws.off("message", handler);
  }

  return events;
}

async function captureNetworkEvents(
  ws: WebSocket,
  options: { sampleMs: number; limit: number; reload: boolean }
): Promise<NetworkDebugEvent[]> {
  const startedAt = new Map<string, number>();
  const requests = new Map<string, NetworkDebugEvent>();
  const handler = (data: WebSocket.RawData): void => {
    const parsed = parseCdpEvent(data);
    if (parsed?.params === undefined) return;
    const params = parsed.params;
    const requestId = typeof params["requestId"] === "string" ? params["requestId"] : "";
    if (requestId === "") return;

    if (parsed.method === "Network.requestWillBeSent") {
      const request = isRecord(params["request"]) ? params["request"] : {};
      startedAt.set(requestId, Date.now());
      requests.set(requestId, {
        requestId,
        url: typeof request["url"] === "string" ? request["url"] : "",
        method: typeof request["method"] === "string" ? request["method"] : undefined,
        type: typeof params["type"] === "string" ? params["type"] : undefined,
      });
    }

    if (parsed.method === "Network.responseReceived") {
      const response = isRecord(params["response"]) ? params["response"] : {};
      const current = requests.get(requestId) ?? { requestId, url: "" };
      const status = typeof response["status"] === "number" ? response["status"] : undefined;
      requests.set(requestId, {
        ...current,
        url: typeof response["url"] === "string" ? response["url"] : current.url,
        status,
        mimeType: typeof response["mimeType"] === "string" ? response["mimeType"] : undefined,
        type: typeof params["type"] === "string" ? params["type"] : current.type,
        failed: status !== undefined ? status >= 400 : current.failed,
      });
    }

    if (parsed.method === "Network.loadingFailed") {
      const current = requests.get(requestId) ?? { requestId, url: "" };
      const started = startedAt.get(requestId);
      requests.set(requestId, {
        ...current,
        failed: true,
        errorText:
          typeof params["errorText"] === "string" ? params["errorText"] : "Network loading failed",
        durationMs: started !== undefined ? Math.max(0, Date.now() - started) : undefined,
      });
    }

    if (parsed.method === "Network.loadingFinished") {
      const current = requests.get(requestId);
      const started = startedAt.get(requestId);
      if (current !== undefined && started !== undefined) {
        requests.set(requestId, {
          ...current,
          durationMs: Math.max(0, Date.now() - started),
        });
      }
    }
  };

  ws.on("message", handler);
  try {
    await dispatchCdpCommand(ws, "Network.enable", {}, 5_000);
    if (options.reload) {
      await dispatchCdpCommand(ws, "Page.reload", { ignoreCache: true }, 5_000);
    }
    await wait(options.sampleMs);
  } finally {
    ws.off("message", handler);
  }

  return Array.from(requests.values()).slice(-options.limit);
}

function buildNetworkPerformanceScript(limit: number): string {
  return `
    (() => {
      const entries = [
        ...performance.getEntriesByType("navigation"),
        ...performance.getEntriesByType("resource"),
      ].slice(-${limit});
      return entries.map((entry) => ({
        name: entry.name,
        entryType: entry.entryType,
        initiatorType: entry.initiatorType || entry.entryType,
        startTime: Math.round(entry.startTime),
        duration: Math.round(entry.duration),
        transferSize: Number.isFinite(entry.transferSize) ? entry.transferSize : null,
        decodedBodySize: Number.isFinite(entry.decodedBodySize) ? entry.decodedBodySize : null,
        responseStatus: Number.isFinite(entry.responseStatus) ? entry.responseStatus : null,
      }));
    })()
  `;
}

function buildPageSummaryScript(): string {
  return `
    (() => {
      const count = (selector) => document.querySelectorAll(selector).length;
      const active = document.activeElement;
      const nav = performance.getEntriesByType("navigation")[0];
      return {
        title: document.title,
        url: location.href,
        readyState: document.readyState,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
        },
        document: {
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          bodyTextLength: document.body?.innerText?.length ?? 0,
        },
        counts: {
          buttons: count("button,[role=button]"),
          links: count("a[href]"),
          inputs: count("input,textarea,select,[contenteditable=true]"),
          dialogs: count("dialog,[role=dialog],[aria-modal=true]"),
          headings: count("h1,h2,h3,h4,h5,h6,[role=heading]"),
        },
        activeElement: active
          ? {
              tagName: active.tagName,
              id: active.id || null,
              className: typeof active.className === "string" ? active.className : null,
              text: (active.textContent || active.getAttribute("aria-label") || "").trim().slice(0, 120),
            }
          : null,
        navigation: nav
          ? {
              type: nav.type,
              domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
              loadEventEnd: Math.round(nav.loadEventEnd),
              duration: Math.round(nav.duration),
            }
          : null,
      };
    })()
  `;
}

function buildLayoutAuditScript(limit: number): string {
  return `
    (() => {
      const maxItems = ${limit};
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const selectorFor = (el) => {
        if (el.id) return "#" + CSS.escape(el.id);
        const parts = [];
        let current = el;
        while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 4) {
          let part = current.tagName.toLowerCase();
          if (current.classList.length > 0) {
            part += "." + Array.from(current.classList).slice(0, 2).map((item) => CSS.escape(item)).join(".");
          }
          const parent = current.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
            if (siblings.length > 1) part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
          }
          parts.unshift(part);
          current = parent;
        }
        return parts.join(" > ");
      };
      const rectOf = (el) => {
        const rect = el.getBoundingClientRect();
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
        };
      };
      const isVisible = (rect) => rect.width > 0 && rect.height > 0;
      const elements = Array.from(document.querySelectorAll("body *"));
      const interactive = Array.from(
        document.querySelectorAll("button,a[href],input,textarea,select,[role=button],[tabindex]")
      );
      const overflow = [];
      const offscreen = [];
      const zeroSizeInteractive = [];
      const textClip = [];
      const overlap = [];

      for (const el of elements) {
        const rect = rectOf(el);
        if (!isVisible(rect)) continue;
        const computed = window.getComputedStyle(el);
        if (
          el.scrollWidth > el.clientWidth + 2 ||
          el.scrollHeight > el.clientHeight + 2
        ) {
          overflow.push({
            selector: selectorFor(el),
            rect,
            scrollWidth: el.scrollWidth,
            scrollHeight: el.scrollHeight,
            overflowX: computed.overflowX,
            overflowY: computed.overflowY,
          });
        }
        if ((el.textContent || "").trim().length > 0 && el.scrollWidth > el.clientWidth + 2) {
          textClip.push({
            selector: selectorFor(el),
            rect,
            text: (el.textContent || "").trim().slice(0, 140),
          });
        }
        if (rect.right < 0 || rect.bottom < 0 || rect.x > viewport.width || rect.y > viewport.height) {
          offscreen.push({ selector: selectorFor(el), rect });
        }
      }

      const interactiveRects = interactive
        .map((el) => ({ el, selector: selectorFor(el), rect: rectOf(el) }))
        .filter((item) => isVisible(item.rect));

      for (const item of interactive) {
        const rect = rectOf(item);
        if (rect.width === 0 || rect.height === 0) {
          zeroSizeInteractive.push({ selector: selectorFor(item), rect });
        }
      }

      for (let i = 0; i < interactiveRects.length; i += 1) {
        for (let j = i + 1; j < interactiveRects.length; j += 1) {
          const a = interactiveRects[i];
          const b = interactiveRects[j];
          const xOverlap = Math.max(0, Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.x, b.rect.x));
          const yOverlap = Math.max(0, Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.y, b.rect.y));
          const area = xOverlap * yOverlap;
          const minArea = Math.min(a.rect.width * a.rect.height, b.rect.width * b.rect.height);
          if (minArea > 0 && area / minArea > 0.35) {
            overlap.push({
              first: a.selector,
              second: b.selector,
              overlapRatio: Math.round((area / minArea) * 100) / 100,
            });
          }
        }
      }

      return {
        viewport,
        page: {
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          hasHorizontalPageOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
        },
        counts: {
          overflow: overflow.length,
          textClip: textClip.length,
          offscreen: offscreen.length,
          zeroSizeInteractive: zeroSizeInteractive.length,
          overlap: overlap.length,
        },
        issues: {
          overflow: overflow.slice(0, maxItems),
          textClip: textClip.slice(0, maxItems),
          offscreen: offscreen.slice(0, maxItems),
          zeroSizeInteractive: zeroSizeInteractive.slice(0, maxItems),
          overlap: overlap.slice(0, maxItems),
        },
      };
    })()
  `;
}

function buildActionFlowScript(actions: unknown[], stepTimeoutMs: number): string {
  const payload = JSON.stringify(actions);
  return `
    (async () => {
      const actions = ${payload};
      const defaultTimeout = ${stepTimeoutMs};
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const snapshot = () => ({
        title: document.title,
        url: location.href,
        readyState: document.readyState,
        bodyText: (document.body?.innerText || "").trim().slice(0, 500),
        counts: {
          buttons: document.querySelectorAll("button,[role=button]").length,
          inputs: document.querySelectorAll("input,textarea,select,[contenteditable=true]").length,
          dialogs: document.querySelectorAll("dialog,[role=dialog],[aria-modal=true]").length,
        },
      });
      const waitUntil = async (predicate, timeoutMs) => {
        const started = Date.now();
        while (Date.now() - started <= timeoutMs) {
          const result = predicate();
          if (result) return result;
          await sleep(100);
        }
        return null;
      };
      const visible = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const steps = [];
      const before = snapshot();

      for (let index = 0; index < actions.length; index += 1) {
        const action = actions[index] || {};
        const type = action.type || action.action;
        const timeoutMs = Math.max(250, Math.min(60000, Number(action.timeoutMs || defaultTimeout)));
        const started = Date.now();

        try {
          if (type === "wait") {
            await sleep(Math.max(0, Math.min(timeoutMs, Number(action.ms || timeoutMs))));
            steps.push({ index, type, ok: true, durationMs: Date.now() - started });
            continue;
          }

          if (type === "waitForSelector") {
            const found = await waitUntil(() => document.querySelector(action.selector), timeoutMs);
            steps.push({
              index,
              type,
              selector: action.selector,
              ok: found !== null,
              visible: visible(found),
              durationMs: Date.now() - started,
            });
            continue;
          }

          if (type === "waitForText") {
            const found = await waitUntil(
              () => (document.body?.innerText || "").includes(action.text || ""),
              timeoutMs
            );
            steps.push({
              index,
              type,
              text: action.text,
              ok: found !== null,
              durationMs: Date.now() - started,
            });
            continue;
          }

          if (type === "snapshot") {
            steps.push({ index, type, ok: true, snapshot: snapshot(), durationMs: Date.now() - started });
            continue;
          }

          const element = action.selector ? document.querySelector(action.selector) : null;
          if (!element) {
            steps.push({
              index,
              type,
              selector: action.selector,
              ok: false,
              error: "selector-not-found",
              durationMs: Date.now() - started,
            });
            continue;
          }

          if (type === "click") {
            element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
            element.click();
            steps.push({
              index,
              type,
              selector: action.selector,
              ok: true,
              visible: visible(element),
              durationMs: Date.now() - started,
            });
            continue;
          }

          if (type === "type") {
            element.focus();
            const value = String(action.text || "");
            if ("value" in element) {
              if (action.clear === true) element.value = "";
              element.value = action.append === true ? String(element.value || "") + value : value;
              element.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
              element.dispatchEvent(new Event("change", { bubbles: true }));
            } else {
              element.textContent = action.append === true ? String(element.textContent || "") + value : value;
              element.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
            }
            steps.push({ index, type, selector: action.selector, ok: true, durationMs: Date.now() - started });
            continue;
          }

          if (type === "press") {
            element.focus();
            const key = String(action.key || "");
            element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
            element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key }));
            steps.push({ index, type, selector: action.selector, key, ok: true, durationMs: Date.now() - started });
            continue;
          }

          steps.push({ index, type, ok: false, error: "unsupported-action", durationMs: Date.now() - started });
        } catch (error) {
          steps.push({
            index,
            type,
            selector: action.selector,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - started,
          });
        }
      }

      return {
        ok: steps.every((step) => step.ok === true),
        before,
        steps,
        after: snapshot(),
      };
    })()
  `;
}

function summarizeIssues(report: {
  networkFailures?: number;
  consoleErrors?: number;
  layoutIssues?: number;
}): string[] {
  const issues: string[] = [];
  const networkFailures = report.networkFailures ?? 0;
  const consoleErrors = report.consoleErrors ?? 0;
  const layoutIssues = report.layoutIssues ?? 0;
  if (networkFailures > 0) {
    issues.push(`${networkFailures} network issue(s)`);
  }
  if (consoleErrors > 0) {
    issues.push(`${consoleErrors} console/runtime issue(s)`);
  }
  if (layoutIssues > 0) {
    issues.push(`${layoutIssues} layout issue(s)`);
  }
  return issues;
}

export async function listCdpInstances(args: Record<string, unknown> = {}): Promise<ToolResult> {
  const rangeResult = readInstanceDiscoveryRange(args);
  if ("error" in rangeResult) {
    return rangeResult.error;
  }

  try {
    const instances = await _discoverInstances(rangeResult.value);
    if (instances.length === 0) {
      return {
        content: [{ type: "text", text: cdpT("listCdpInstances.noneFound") }],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: cdpT("listCdpInstances.success", {
            count: instances.length,
            instances: stringifyJson(instances),
          }),
        },
      ],
    };
  } catch (err) {
    return cdpError("hev_list_cdp_instances", err as Error, "errors.listInstances");
  }
}

export async function checkElectronConnection(args: Record<string, unknown> = {}): Promise<ToolResult> {
  const connectionResult = readConnectionOptions(args);
  if ("error" in connectionResult) {
    return connectionResult.error;
  }

  try {
    const status = await checkConnection(connectionResult.value);

    if (status.connected) {
      const notAvailable = cdpT("common.notAvailable");
      return {
        content: [
          {
            type: "text",
            text: cdpT("checkConnection.connected", {
              port: status.port,
              targetsCount: status.targetsCount ?? 0,
              title: status.mainWindow?.title ?? notAvailable,
              url: status.mainWindow?.url ?? notAvailable,
              windowType: status.mainWindow?.type ?? notAvailable,
            }),
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: cdpT("checkConnection.disconnected", {
              error: status.error ?? cdpT("common.unknown"),
              port: status.port,
            }),
          },
        ],
      };
    }
  } catch (err) {
    return cdpError("hev_check_electron_connection", err as Error, "errors.connectionCheck");
  }
}

export async function listCdpTargets(args: Record<string, unknown> = {}): Promise<ToolResult> {
  const connectionResult = readConnectionOptions(args);
  if ("error" in connectionResult) {
    return connectionResult.error;
  }

  try {
    const targets = await _discoverTargets(connectionResult.value);

    if (targets.length === 0) {
      return {
        content: [{ type: "text", text: cdpT("listCdpTargets.noneFound") }],
      };
    }

    const preferredTarget = pickPreferredTarget(targets);
    const summary = targets.map((target, index) => ({
      index: index + 1,
      id: target.id,
      type: target.type,
      title: target.title === "" ? cdpT("common.empty") : target.title,
      url: target.url === "" ? cdpT("common.notAvailable") : target.url,
      connectable: target.webSocketDebuggerUrl !== "",
      isDefault: preferredTarget?.id === target.id,
    }));

    return {
      content: [
        {
          type: "text",
          text: cdpT("listCdpTargets.success", {
            count: summary.length,
            targets: stringifyJson(summary),
          }),
        },
      ],
    };
  } catch (err) {
    return cdpError("hev_list_cdp_targets", err as Error, "errors.listTargets");
  }
}

export async function getCdpTargetInfo(args: Record<string, unknown> = {}): Promise<ToolResult> {
  const connectionResult = readConnectionOptions(args);
  if ("error" in connectionResult) {
    return connectionResult.error;
  }

  const { targetId } = args as { targetId?: string };

  if (isNonEmptyString(targetId) === false) {
    return {
      content: [{ type: "text", text: cdpT("getCdpTargetInfo.missingTargetId") }],
      isError: true,
    };
  }

  try {
    const target = await findTargetById(targetId, connectionResult.value);
    if (target === null) {
      return {
        content: [{ type: "text", text: cdpT("getCdpTargetInfo.notFound", { targetId }) }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: cdpT("getCdpTargetInfo.success", {
            targetId: target.id,
            targetType: target.type,
            title: target.title === "" ? cdpT("common.empty") : target.title,
            url: target.url === "" ? cdpT("common.notAvailable") : target.url,
            connectable:
              target.webSocketDebuggerUrl !== "" ? cdpT("common.yes") : cdpT("common.no"),
            domains: COMMON_CDP_DOMAINS.join(", "),
          }),
        },
      ],
    };
  } catch (err) {
    return cdpError("hev_get_cdp_target_info", err as Error, "errors.targetInfo");
  }
}

export async function sendCdpCommand(args: Record<string, unknown> = {}): Promise<ToolResult> {
  const connectionResult = readConnectionOptions(args);
  if ("error" in connectionResult) {
    return connectionResult.error;
  }

  const { targetId, domain, method, params, timeout } = args as {
    targetId?: string;
    domain?: string;
    method?: string;
    params?: unknown;
    timeout?: number;
  };

  if (isNonEmptyString(domain) === false || isNonEmptyString(method) === false) {
    return {
      content: [{ type: "text", text: cdpT("sendCdpCommand.missingDomainMethod") }],
      isError: true,
    };
  }

  if (params !== undefined && isRecord(params) === false) {
    return {
      content: [{ type: "text", text: cdpT("sendCdpCommand.invalidParams") }],
      isError: true,
    };
  }

  const timeoutMs =
    typeof timeout === "number" && Number.isFinite(timeout)
      ? Math.max(1_000, Math.min(120_000, Math.round(timeout)))
      : undefined;

  try {
    const result = await withTargetConnection(
      targetId,
      async (ws, target) => ({
        commandResult: await dispatchCdpCommand(ws, `${domain}.${method}`, params ?? {}, timeoutMs),
        resolvedTargetId: target.id,
      }),
      {},
      connectionResult.value
    );

    return {
      content: [
        {
          type: "text",
          text: cdpT("sendCdpCommand.success", {
            targetId: result.resolvedTargetId,
            command: `${domain}.${method}`,
            result: stringifyJson(result.commandResult),
          }),
        },
      ],
    };
  } catch (err) {
    return cdpError("hev_send_cdp_command", err as Error, "errors.cdpCommand");
  }
}

export async function sendCommandToElectron(
  args: Record<string, unknown> = {}
): Promise<ToolResult> {
  const connectionResult = readConnectionOptions(args);
  if ("error" in connectionResult) {
    return connectionResult.error;
  }

  const { command, description } = args as { command?: string; description?: string };

  if (command == null || command === "") {
    return {
      content: [{ type: "text", text: cdpT("sendCommand.missingCommand") }],
      isError: true,
    };
  }

  try {
    const result = await executeScript(command, undefined, connectionResult.value);

    return {
      content: [
        {
          type: "text",
          text: cdpT("sendCommand.success", {
            suffix:
              isNonEmptyString(description) === true
                ? cdpT("sendCommand.descriptionSuffix", { description })
                : "",
            result: JSON.stringify(result, null, 2),
          }),
        },
      ],
    };
  } catch (err) {
    return cdpError("hev_send_command_to_electron", err as Error, "errors.command");
  }
}

export async function toggleMcpPanelServers(
  args: Record<string, unknown> = {}
): Promise<ToolResult> {
  const connectionResult = readConnectionOptions(args);
  if ("error" in connectionResult) {
    return connectionResult.error;
  }

  const serversRaw = Array.isArray(args["servers"]) ? args["servers"] : [];
  const servers = serversRaw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item !== "");

  const providerRaw = args["provider"];
  const provider = providerRaw === "opencode" || providerRaw === "auto" ? providerRaw : "auto";

  const settleMsRaw = args["settleMs"];
  const settleMs =
    typeof settleMsRaw === "number" && Number.isFinite(settleMsRaw)
      ? Math.max(1000, Math.min(120000, Math.round(settleMsRaw)))
      : 4000;

  const cycleRaw = args["cycles"];
  const cycles =
    typeof cycleRaw === "number" && Number.isFinite(cycleRaw)
      ? Math.max(1, Math.min(5, Math.round(cycleRaw)))
      : 1;

  const targetServers = servers.length > 0 ? servers : ["context7", "grep_app", "app"];

  const payload = JSON.stringify({
    provider,
    settleMs,
    cycles,
    servers: targetServers,
  });

  const webviewScript = `(async () => {
    const options = ${payload};
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim().toLowerCase();
    const waitUntil = async (predicate, timeoutMs, pollMs) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (predicate() === true) {
          return true;
        }
        await wait(pollMs);
      }
      return false;
    };

    const detectProvider = () => {
      if (options.provider !== "auto") return options.provider;
      if (document.querySelector("button[role=tab]") !== null) {
        return "opencode";
      }
      return "unknown";
    };

    const openOpencodeMcpPanel = async () => {
      for (let i = 0; i < 8; i++) {
        const statusTrigger = document.querySelector("button[aria-haspopup=dialog]");
        if (statusTrigger !== null) {
          const expanded = statusTrigger.getAttribute("aria-expanded") === "true";
          if (!expanded) {
            statusTrigger.click();
          }
          await wait(250);
        }

        const tabs = Array.from(document.querySelectorAll("button[role=tab]"));
        const mcpTab = tabs.find((tab) => normalize(tab.textContent).includes("mcp"));
        if (mcpTab !== undefined) {
          mcpTab.click();
          await wait(300);
          return true;
        }

        await wait(300);
      }

      return false;
    };

    const findOpencodeSwitch = (name) => {
      const rows = Array.from(document.querySelectorAll("button"));

      const row = rows.find((button) => {
        const label = button.querySelector("span");
        if (normalize(label?.textContent) !== name) return false;
        return button.querySelector('input[type="checkbox"][role="switch"]') !== null;
      });

      if (!row) return null;
      return row.querySelector("input[type=checkbox][role=switch]");
    };

    const findRovodevSwitch = (name) => {
      const input = document.querySelector(
        '#mcp-list input[type=checkbox][data-mcp-name="' + name + '"]'
      );
      if (input !== null) return input;

      const rows = Array.from(document.querySelectorAll("#mcp-list .ds-item-row"));
      const row = rows.find((el) => normalize(el.textContent).includes(name));
      if (!row) return null;
      return row.querySelector("input[type=checkbox][data-mcp-name]");
    };

    const getSwitch = (name, mode) => {
      if (mode === "opencode") return findOpencodeSwitch(name);
      return findRovodevSwitch(name);
    };

    const captureStates = (mode) => {
      const out = {};
      for (const server of options.servers) {
        const input = getSwitch(server, mode);
        out[server] = input
          ? {
              checked: input.checked === true,
              ariaChecked: input.getAttribute("aria-checked"),
              id: input.id || null,
            }
          : null;
      }
      return out;
    };

    const mode = detectProvider();
    if (mode === "unknown") {
      return { ok: false, stage: "detect", reason: "mcp-panel-not-detected" };
    }

    if (mode === "opencode") {
      const opened = await openOpencodeMcpPanel();
      if (!opened) {
        return { ok: false, stage: "open-opencode-panel", reason: "mcp-tab-not-found" };
      }
    }

    const missing = options.servers.filter((name) => getSwitch(name, mode) === null);
    if (missing.length > 0) {
      return { ok: false, stage: "resolve-switches", reason: "servers-not-found", missing, mode };
    }

    const before = captureStates(mode);
    const actions = [];
    const stateTimeoutMs = Math.max(12000, options.settleMs * 6);
    const minOffMs = Math.max(5000, options.settleMs);

    for (let cycle = 0; cycle < options.cycles; cycle++) {
      for (const name of options.servers) {
        let input = getSwitch(name, mode);
        if (input === null) continue;

        const wasChecked = input.checked === true;
        let offConfirmed = false;
        let readyForOn = false;

        if (wasChecked) {
          input.click();
          offConfirmed = await waitUntil(() => {
            const current = getSwitch(name, mode);
            return current !== null && current.checked === false;
          }, stateTimeoutMs, 350);
        } else {
          offConfirmed = true;
        }

        await wait(minOffMs);

        readyForOn = await waitUntil(() => {
          const current = getSwitch(name, mode);
          return current !== null && current.disabled !== true;
        }, stateTimeoutMs, 400);

        const stateAfterOffInput = getSwitch(name, mode);
        const stateAfterOff = stateAfterOffInput?.checked === true;
        let onAttempts = 0;
        let onConfirmed = false;

        while (onAttempts < 8) {
          input = getSwitch(name, mode);
          if (input === null) break;
          if (input.checked === true) {
            onConfirmed = true;
            break;
          }

          if (input.disabled === true) {
            onAttempts += 1;
            await wait(Math.max(1000, Math.floor(options.settleMs / 2)));
            continue;
          }

          input.click();
          onAttempts += 1;
          const enabled = await waitUntil(() => {
            const current = getSwitch(name, mode);
            return current !== null && current.checked === true;
          }, Math.max(5000, options.settleMs * 2), 300);

          if (enabled) {
            onConfirmed = true;
            break;
          }

          await wait(Math.max(1000, Math.floor(options.settleMs / 3)));
        }

        const finalInput = getSwitch(name, mode);

        actions.push({
          cycle: cycle + 1,
          server: name,
          before: wasChecked,
          mid: stateAfterOff,
          offConfirmed,
          readyForOn,
          onAttempts,
          onConfirmed,
          after: finalInput?.checked === true,
        });
      }
    }

    return {
      ok: true,
      mode,
      settleMs: options.settleMs,
      cycles: options.cycles,
      before,
      actions,
      after: captureStates(mode),
    };
  })();`;

  const command = `(async () => {
    const ai0Webview = document.querySelector("#ai0-webview");
    if (!ai0Webview || typeof ai0Webview.executeJavaScript !== "function") {
      return { ok: false, stage: "bootstrap", reason: "ai0-webview-not-ready" };
    }
    return await ai0Webview.executeJavaScript(${JSON.stringify(webviewScript)});
  })();`;

  try {
    const commandTimeout = Math.min(
      240_000,
      60_000 +
        cycles *
          targetServers.length *
          (Math.max(5000, settleMs) + Math.max(1200, Math.floor(settleMs / 2)) * 8)
    );

    const result = await executeScript(command, commandTimeout, connectionResult.value);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
      isError:
        typeof result === "object" && result !== null && (result as { ok?: boolean }).ok !== true,
    };
  } catch (err) {
    return cdpError("hev_toggle_mcp_panel_servers", err as Error, "errors.toggleMcpPanel");
  }
}

export async function takeCdpScreenshot(args: Record<string, unknown>): Promise<ToolResult> {
  const connectionResult = readConnectionOptions(args);
  if ("error" in connectionResult) {
    return connectionResult.error;
  }

  const {
    format = "png",
    quality = 80,
    savePath,
  } = args as { format?: string; quality?: number; savePath?: string };

  try {
    const base64Data = await takeScreenshot(format, quality, connectionResult.value);

    if (isNonEmptyString(savePath)) {
      const { writeFile } = await import("fs/promises");
      const buffer = Buffer.from(base64Data, "base64");
      await writeFile(savePath, buffer);

      return {
        content: [
          {
            type: "text",
            text: cdpT("takeScreenshot.saved", {
              savePath,
              sizeBytes: buffer.length,
            }),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: cdpT("takeScreenshot.preview", {
            format: format.toUpperCase(),
            sizeKB: Math.round((base64Data.length * 0.75) / 1024),
          }),
        },
      ],
    };
  } catch (err) {
    return cdpError("hev_take_cdp_screenshot", err as Error, "errors.screenshot");
  }
}

export async function inspectElement(args: Record<string, unknown>): Promise<ToolResult> {
  const connectionResult = readConnectionOptions(args);
  if ("error" in connectionResult) {
    return connectionResult.error;
  }

  const { selector } = args as { selector?: string };

  if (!isNonEmptyString(selector)) {
    return {
      content: [{ type: "text", text: cdpT("inspectElement.missingSelector") }],
      isError: true,
    };
  }

  try {
    const info = await checkElement(selector, connectionResult.value);

    if (info.exists) {
      return {
        content: [
          {
            type: "text",
            text: cdpT("inspectElement.success", {
              selector: info.selector,
              tagName: info.tagName ?? cdpT("common.unknown"),
              id: info.id ?? cdpT("common.none"),
              className: info.className ?? cdpT("common.none"),
              visible: info.visible === true ? cdpT("common.yes") : cdpT("common.no"),
              disabled: info.disabled === true ? cdpT("common.yes") : cdpT("common.no"),
              width: info.bounds?.width ?? 0,
              height: info.bounds?.height ?? 0,
              x: Math.round(info.bounds?.x ?? 0),
              y: Math.round(info.bounds?.y ?? 0),
              textContent: info.textContent ?? cdpT("common.empty"),
            }),
          },
        ],
      };
    } else {
      return {
        content: [{ type: "text", text: cdpT("inspectElement.notFound", { selector }) }],
      };
    }
  } catch (err) {
    return cdpError("hev_inspect_element", err as Error, "errors.inspectElement");
  }
}

export async function queryElements(args: Record<string, unknown>): Promise<ToolResult> {
  const connectionResult = readConnectionOptions(args);
  if ("error" in connectionResult) {
    return connectionResult.error;
  }

  const { selector, limit = 20 } = args as { selector?: string; limit?: number };

  if (!isNonEmptyString(selector)) {
    return {
      content: [{ type: "text", text: cdpT("queryElements.missingSelector") }],
      isError: true,
    };
  }

  try {
    const elements = await findElements(selector, limit, connectionResult.value);

    if (elements.length === 0) {
      return {
        content: [{ type: "text", text: cdpT("queryElements.noneFound", { selector }) }],
      };
    }

    const list = elements
      .map(
        (el) =>
          `${el.index}. <${el.tagName.toLowerCase()}${isNonEmptyString(el.id) ? ` id="${el.id}"` : ""}> ${el.visible ? "👁" : "🚫"} "${el.textContent ?? ""}"`
      )
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: cdpT("queryElements.success", {
            count: elements.length,
            selector,
            list,
          }),
        },
      ],
    };
  } catch (err) {
    return cdpError("hev_query_elements", err as Error, "errors.queryElements");
  }
}

export async function debugNetworkRequests(args: Record<string, unknown> = {}): Promise<ToolResult> {
  const connectionResult = readConnectionOptions(args);
  if ("error" in connectionResult) {
    return connectionResult.error;
  }

  const targetId = readTargetId(args);
  const limit = normalizeNumber(args["limit"], 40, { min: 1, max: 200 });
  const sampleMs = normalizeNumber(args["sampleMs"], 1_000, { min: 250, max: 30_000 });
  const reload = normalizeBoolean(args["reload"], false);

  try {
    const report = await withTargetConnection(
      targetId,
      async (ws, target) => {
        const [performanceEntries, cdpEvents] = await Promise.all([
          evaluateJS(ws, buildNetworkPerformanceScript(limit), true, 10_000),
          captureNetworkEvents(ws, { sampleMs, limit, reload }),
        ]);
        const perfList = toUnknownArray(performanceEntries);
        const statusFailures = perfList.filter((entry) => {
          if (isRecord(entry) === false) return false;
          return typeof entry["responseStatus"] === "number" && entry["responseStatus"] >= 400;
        });
        const failedEvents = cdpEvents.filter((event) => event.failed === true);
        const failures: unknown[] = [...statusFailures, ...failedEvents];

        return {
          target: { id: target.id, title: target.title, url: target.url },
          sampleMs,
          reload,
          counts: {
            performanceEntries: perfList.length,
            capturedEvents: cdpEvents.length,
            failures: failures.length,
          },
          performanceEntries: perfList,
          capturedEvents: cdpEvents,
          failures,
        };
      },
      {},
      connectionResult.value
    );

    return createJsonToolResult("Network Debug Report", report, report.counts.failures > 0);
  } catch (err) {
    return cdpError("hev_debug_network_requests", err as Error, "errors.cdpCommand");
  }
}

export async function debugConsoleEvents(args: Record<string, unknown> = {}): Promise<ToolResult> {
  const connectionResult = readConnectionOptions(args);
  if ("error" in connectionResult) {
    return connectionResult.error;
  }

  const targetId = readTargetId(args);
  const limit = normalizeNumber(args["limit"], 50, { min: 1, max: 200 });
  const sampleMs = normalizeNumber(args["sampleMs"], 1_000, { min: 250, max: 30_000 });

  try {
    const report = await withTargetConnection(
      targetId,
      async (ws, target) => {
        const events = await captureConsoleEvents(ws, sampleMs, limit);
        const errors = events.filter(
          (event) =>
            event.source === "exception" ||
            event.type === "error" ||
            event.type === "assert" ||
            event.type === "warning"
        );
        return {
          target: { id: target.id, title: target.title, url: target.url },
          sampleMs,
          counts: {
            events: events.length,
            errors: errors.length,
          },
          events,
          errors,
        };
      },
      {},
      connectionResult.value
    );

    return createJsonToolResult("Console Debug Report", report, report.counts.errors > 0);
  } catch (err) {
    return cdpError("hev_debug_console_events", err as Error, "errors.cdpCommand");
  }
}

export async function uiAccessibilitySnapshot(args: Record<string, unknown> = {}): Promise<ToolResult> {
  const connectionResult = readConnectionOptions(args);
  if ("error" in connectionResult) {
    return connectionResult.error;
  }

  const targetId = readTargetId(args);
  const limit = normalizeNumber(args["limit"], 80, { min: 1, max: 300 });

  try {
    const snapshot = await withTargetConnection(
      targetId,
      async (ws, target) => {
        const result = await dispatchCdpCommand(ws, "Accessibility.getFullAXTree", {}, 10_000);
        const nodes = Array.isArray(result["nodes"]) ? result["nodes"] : [];
        const interestingRoles = new Set([
          "button",
          "link",
          "textbox",
          "searchbox",
          "combobox",
          "checkbox",
          "radio",
          "switch",
          "tab",
          "menuitem",
          "dialog",
          "heading",
          "alert",
          "status",
          "listbox",
          "option",
        ]);
        const items = nodes
          .filter((node): node is Record<string, unknown> => isRecord(node))
          .map((node) => {
            const role = readNestedString(node, ["role", "value"]) ?? "";
            const name = readNestedString(node, ["name", "value"]) ?? "";
            const value = readNestedString(node, ["value", "value"]) ?? "";
            const ignored = node["ignored"] === true;
            const properties = Array.isArray(node["properties"]) ? node["properties"] : [];
            const disabled = properties.some((property) => {
              if (isRecord(property) === false) return false;
              return property["name"] === "disabled" && readNestedString(property, ["value", "value"]) === "true";
            });
            return {
              role,
              name: clipText(name, 180),
              value: clipText(value, 180),
              ignored,
              disabled,
              childIds: Array.isArray(node["childIds"]) ? node["childIds"] : [],
            };
          })
          .filter((item) => item.ignored === false && (interestingRoles.has(item.role) || item.name !== ""))
          .slice(0, limit);

        return {
          target: { id: target.id, title: target.title, url: target.url },
          count: items.length,
          items,
        };
      },
      {},
      connectionResult.value
    );

    return createJsonToolResult("Accessibility Snapshot", snapshot);
  } catch (err) {
    return cdpError("hev_ui_accessibility_snapshot", err as Error, "errors.cdpCommand");
  }
}

export async function uiLayoutAudit(args: Record<string, unknown> = {}): Promise<ToolResult> {
  const connectionResult = readConnectionOptions(args);
  if ("error" in connectionResult) {
    return connectionResult.error;
  }

  const targetId = readTargetId(args);
  const limit = normalizeNumber(args["limit"], 20, { min: 1, max: 100 });

  try {
    const audit = await withTargetConnection(
      targetId,
      async (ws, target) => {
        const result = await evaluateJS(ws, buildLayoutAuditScript(limit), true, 15_000);
        return {
          target: { id: target.id, title: target.title, url: target.url },
          audit: result,
        };
      },
      {},
      connectionResult.value
    );
    const counts = isRecord(audit.audit) && isRecord(audit.audit["counts"]) ? audit.audit["counts"] : {};
    const issueCount = Object.values(counts).reduce<number>((sum, value) => {
      return sum + (typeof value === "number" ? value : 0);
    }, 0);

    return createJsonToolResult("Layout Audit", audit, issueCount > 0);
  } catch (err) {
    return cdpError("hev_ui_layout_audit", err as Error, "errors.cdpCommand");
  }
}

export async function uiActionFlow(args: Record<string, unknown> = {}): Promise<ToolResult> {
  const connectionResult = readConnectionOptions(args);
  if ("error" in connectionResult) {
    return connectionResult.error;
  }

  const actions = Array.isArray(args["actions"]) ? args["actions"] : [];
  if (actions.length === 0) {
    return {
      content: [{ type: "text", text: "actions array is required" }],
      isError: true,
    };
  }

  const targetId = readTargetId(args);
  const stepTimeoutMs = normalizeNumber(args["stepTimeoutMs"], 5_000, { min: 250, max: 60_000 });
  const sampleConsole = normalizeBoolean(args["sampleConsole"], true);

  try {
    const flow = await withTargetConnection(
      targetId,
      async (ws, target) => {
        const consolePromise = sampleConsole
          ? captureConsoleEvents(ws, Math.min(stepTimeoutMs * Math.max(1, actions.length), 30_000), 80)
          : Promise.resolve([]);
        const result = await evaluateJS(ws, buildActionFlowScript(actions, stepTimeoutMs), true, 120_000);
        const consoleEvents = await consolePromise;
        return {
          target: { id: target.id, title: target.title, url: target.url },
          result,
          consoleEvents,
        };
      },
      {},
      connectionResult.value
    );

    const ok = isRecord(flow.result) && flow.result["ok"] === true;
    return createJsonToolResult("UI Action Flow", flow, ok === false);
  } catch (err) {
    return cdpError("hev_ui_action_flow", err as Error, "errors.cdpCommand");
  }
}

export async function debugUiReport(args: Record<string, unknown> = {}): Promise<ToolResult> {
  const connectionResult = readConnectionOptions(args);
  if ("error" in connectionResult) {
    return connectionResult.error;
  }

  const targetId = readTargetId(args);
  const limit = normalizeNumber(args["limit"], 30, { min: 1, max: 120 });
  const sampleMs = normalizeNumber(args["sampleMs"], 1_000, { min: 250, max: 30_000 });
  const includeScreenshot = normalizeBoolean(args["includeScreenshot"], true);
  const screenshotPath = typeof args["screenshotPath"] === "string" ? args["screenshotPath"] : undefined;

  try {
    const connection = await checkConnection(connectionResult.value);
    const report = await withTargetConnection(
      targetId,
      async (ws, target) => {
        const [
          pageSummary,
          performanceEntries,
          consoleEvents,
          networkEvents,
          accessibilityResult,
          layoutAudit,
          performanceMetrics,
          screenshotResult,
        ] = await Promise.all([
          evaluateJS(ws, buildPageSummaryScript(), true, 10_000),
          evaluateJS(ws, buildNetworkPerformanceScript(limit), true, 10_000),
          captureConsoleEvents(ws, sampleMs, limit),
          captureNetworkEvents(ws, { sampleMs, limit, reload: false }),
          dispatchCdpCommand(ws, "Accessibility.getFullAXTree", {}, 10_000).catch((error: unknown) => ({
            error: error instanceof Error ? error.message : String(error),
          })),
          evaluateJS(ws, buildLayoutAuditScript(Math.min(limit, 30)), true, 15_000),
          dispatchCdpCommand(ws, "Performance.getMetrics", {}, 10_000).catch((error: unknown) => ({
            error: error instanceof Error ? error.message : String(error),
          })),
          includeScreenshot
            ? dispatchCdpCommand(
                ws,
                "Page.captureScreenshot",
                { format: "png", fromSurface: true },
                20_000
              ).catch((error: unknown) => ({
                error: error instanceof Error ? error.message : String(error),
              }))
            : Promise.resolve(null),
        ]);

        const perfList = toUnknownArray(performanceEntries);
        const networkFailures: unknown[] = [
          ...perfList.filter((entry) => {
            if (isRecord(entry) === false) return false;
            return typeof entry["responseStatus"] === "number" && entry["responseStatus"] >= 400;
          }),
          ...networkEvents.filter((event) => event.failed === true),
        ];
        const consoleErrors = consoleEvents.filter(
          (event) =>
            event.source === "exception" ||
            event.type === "error" ||
            event.type === "assert" ||
            event.type === "warning"
        );
        const layoutCounts =
          isRecord(layoutAudit) && isRecord(layoutAudit["counts"]) ? layoutAudit["counts"] : {};
        const layoutIssueCount = Object.values(layoutCounts).reduce<number>(
          (sum, value) => sum + (typeof value === "number" ? value : 0),
          0
        );

        let screenshot: Record<string, unknown> | null = null;
        const screenshotRecord = toRecord(screenshotResult);
        if (screenshotRecord !== null && typeof screenshotRecord["data"] === "string") {
          const buffer = Buffer.from(screenshotRecord["data"], "base64");
          screenshot = { sizeBytes: buffer.length };
          if (screenshotPath !== undefined && screenshotPath.trim() !== "") {
            const { mkdir, writeFile } = await import("fs/promises");
            const { dirname } = await import("path");
            await mkdir(dirname(screenshotPath), { recursive: true });
            await writeFile(screenshotPath, buffer);
            screenshot["path"] = screenshotPath;
          }
        } else if (screenshotRecord !== null) {
          screenshot = screenshotRecord;
        }

        const accessibilityRecord = toRecord(accessibilityResult);
        const axNodes =
          accessibilityRecord !== null && Array.isArray(accessibilityRecord["nodes"])
            ? accessibilityRecord["nodes"]
            : [];
        const accessibility = {
          nodeCount: axNodes.length,
          interestingCount: axNodes.filter((node) => {
            if (isRecord(node) === false || node["ignored"] === true) return false;
            const role = readNestedString(node, ["role", "value"]) ?? "";
            const name = readNestedString(node, ["name", "value"]) ?? "";
            return role !== "" || name !== "";
          }).length,
        };

        const issueSummary = summarizeIssues({
          networkFailures: networkFailures.length,
          consoleErrors: consoleErrors.length,
          layoutIssues: layoutIssueCount,
        });

        return {
          ok: issueSummary.length === 0,
          target: { id: target.id, title: target.title, url: target.url },
          connection,
          pageSummary,
          counts: {
            networkFailures: networkFailures.length,
            consoleErrors: consoleErrors.length,
            layoutIssues: layoutIssueCount,
          },
          issueSummary,
          network: {
            performanceEntries: perfList.slice(-limit),
            capturedEvents: networkEvents,
            failures: networkFailures.slice(0, limit),
          },
          console: {
            events: consoleEvents,
            errors: consoleErrors,
          },
          accessibility,
          layoutAudit,
          performanceMetrics,
          screenshot,
        };
      },
      {},
      connectionResult.value
    );

    const headline =
      report.ok === true
        ? "UI Debug Report\n\nNo obvious network, console, or layout issue was detected."
        : `UI Debug Report\n\nDetected: ${report.issueSummary.join(", ")}`;
    return {
      content: [
        {
          type: "text",
          text: `${headline}\n\n${stringifyJson(report)}`,
        },
      ],
      ...(report.ok === true ? {} : { isError: true }),
    };
  } catch (err) {
    return cdpError("hev_debug_ui_report", err as Error, "errors.cdpCommand");
  }
}

export async function debugFailureBundle(args: Record<string, unknown> = {}): Promise<ToolResult> {
  const screenshotPath =
    typeof args["screenshotPath"] === "string" && args["screenshotPath"].trim() !== ""
      ? args["screenshotPath"]
      : `logs/debug/failure-bundle-${Date.now()}.png`;

  return await debugUiReport({
    ...args,
    includeScreenshot: true,
    screenshotPath,
  });
}
