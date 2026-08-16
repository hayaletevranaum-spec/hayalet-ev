// NOTE: High-level DOM helpers executed via CDP.

import type WebSocket from "ws";
import type { CDPConnectionOptions } from "./cdp-connection.js";
import { withConnection, evaluateJS, sendCDPCommand } from "./cdp-connection.js";
import { CDP_TIMEOUTS } from "@timeouts";

interface ElementInfo {
  exists: boolean;
  selector: string;
  tagName?: string;
  id?: string;
  className?: string;
  visible?: boolean;
  bounds?: { x: number; y: number; width: number; height: number };
  disabled?: boolean;
  textContent?: string;
}

interface ElementListItem {
  index: number;
  tagName: string;
  id?: string;
  className?: string;
  textContent?: string;
  visible: boolean;
}

export async function checkElement(
  selector: string,
  connectionOptions: CDPConnectionOptions = {}
): Promise<ElementInfo> {
  return await withConnection(async (ws: WebSocket) => {
    const script = `
      (function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { exists: false, selector: ${JSON.stringify(selector)} };

        const rect = el.getBoundingClientRect();
        return {
          exists: true,
          selector: ${JSON.stringify(selector)},
          tagName: el.tagName,
          id: el.id,
          className: el.className,
          visible: rect.width > 0 && rect.height > 0,
          bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          disabled: el.disabled,
          textContent: el.textContent?.substring(0, 100),
        };
      })()
    `;
    return await (evaluateJS(ws, script) as Promise<ElementInfo>);
  }, connectionOptions);
}

export async function findElements(
  selector: string,
  limit = 20,
  connectionOptions: CDPConnectionOptions = {}
): Promise<ElementListItem[]> {
  return await withConnection(async (ws: WebSocket) => {
    const script = `
      (function() {
        const elements = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).slice(0, ${limit});
        return elements.map((el, index) => ({
          index,
          tagName: el.tagName,
          id: el.id ?? undefined,
          className: el.className ?? undefined,
          textContent: el.textContent?.substring(0, 50),
          visible: el.offsetWidth > 0 && el.offsetHeight > 0,
        }));
      })()
    `;
    return await (evaluateJS(ws, script) as Promise<ElementListItem[]>);
  }, connectionOptions);
}

// NOTE: On multi-monitor setups, screenshots can fail while in background. Bring to front first.
export async function takeScreenshot(
  format = "png",
  quality = 80,
  connectionOptions: CDPConnectionOptions = {}
): Promise<string> {
  return await withConnection(async (ws: WebSocket) => {
    await sendCDPCommand(ws, "Page.bringToFront", {}, CDP_TIMEOUTS.COMMAND_FAST);
    await sendCDPCommand(ws, "Page.enable", {}, CDP_TIMEOUTS.COMMAND_FAST);

    const result = await sendCDPCommand(
      ws,
      "Page.captureScreenshot",
      {
        format,
        quality: format === "jpeg" ? quality : undefined,
        // NOTE: Read from the compositor surface for better reliability.
        fromSurface: true,
      },
      CDP_TIMEOUTS.SCREENSHOT
    );

    return result["data"] as string;
  }, connectionOptions);
}

export async function executeScript(
  code: string,
  timeout?: number,
  connectionOptions: CDPConnectionOptions = {}
): Promise<unknown> {
  return await withConnection(async (ws: WebSocket) => {
    return await evaluateJS(ws, code, true, timeout);
  }, connectionOptions);
}
