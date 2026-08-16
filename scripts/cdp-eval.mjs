#!/usr/bin/env node

import WebSocket from "ws";

const DEFAULT_HOST = typeof process.env.CDP_HOST === "string" ? process.env.CDP_HOST : "localhost";
const DEFAULT_PORT = Number.parseInt(process.env.CDP_PORT ?? "9222", 10);
const DEFAULT_TIMEOUT_MS = 5_000;

let nextCommandId = 1;

function usage() {
  return [
    "Usage: npm run cdp:eval -- [--host localhost] [--port 9222] [--target id-or-text] [--timeout 5000] <expression>",
    "       echo \"document.title\" | npm run cdp:eval -- --target Hayalet",
  ].join("\n");
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv) {
  const options = {
    host: DEFAULT_HOST.trim() === "" ? "localhost" : DEFAULT_HOST.trim(),
    port: Number.isFinite(DEFAULT_PORT) ? DEFAULT_PORT : 9222,
    target: "",
    timeout: DEFAULT_TIMEOUT_MS,
    expressionParts: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--host") {
      options.host = argv[index + 1] ?? options.host;
      index += 1;
      continue;
    }
    if (arg === "--port") {
      options.port = parseInteger(argv[index + 1], options.port);
      index += 1;
      continue;
    }
    if (arg === "--target") {
      options.target = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--timeout") {
      options.timeout = parseInteger(argv[index + 1], DEFAULT_TIMEOUT_MS);
      index += 1;
      continue;
    }
    options.expressionParts.push(arg);
  }

  return options;
}

async function readStdin() {
  if (process.stdin.isTTY) {
    return "";
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function fetchJson(url, timeoutMs) {
  const controller = new globalThis.AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`CDP HTTP ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchTargets({ host, port, timeout }) {
  const url = `http://${host}:${port}/json/list`;
  const targets = await fetchJson(url, timeout);
  return Array.isArray(targets) ? targets : [];
}

function pickTarget(targets, targetQuery) {
  if (targetQuery !== "") {
    const needle = targetQuery.toLowerCase();
    return (
      targets.find((target) => target.id === targetQuery) ??
      targets.find((target) =>
        `${target.title ?? ""} ${target.url ?? ""} ${target.type ?? ""}`.toLowerCase().includes(needle)
      ) ??
      null
    );
  }

  return targets.find((target) => target.type === "page") ?? targets[0] ?? null;
}

function rawDataToText(data) {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return new globalThis.TextDecoder().decode(new Uint8Array(data));
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return "";
}

async function connectToTarget(wsUrl, timeoutMs) {
  return await new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(wsUrl);
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.terminate();
      reject(new Error("CDP WebSocket connection timed out."));
    }, timeoutMs);

    ws.on("open", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(ws);
    });

    ws.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}

async function sendCDPCommand(ws, method, params, timeoutMs) {
  return await new Promise((resolve, reject) => {
    const id = nextCommandId;
    nextCommandId += 1;

    const timeoutId = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error(`CDP command timed out: ${method}`));
    }, timeoutMs);

    function onMessage(data) {
      let response;
      try {
        response = JSON.parse(rawDataToText(data));
      } catch {
        return;
      }

      if (response.id !== id) return;

      clearTimeout(timeoutId);
      ws.off("message", onMessage);
      if (response.error) {
        reject(new Error(`CDP ${method} failed: ${response.error.message}`));
        return;
      }
      resolve(response.result ?? {});
    }

    ws.on("message", onMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluateExpression(ws, expression, timeoutMs) {
  await sendCDPCommand(ws, "Runtime.enable", {}, timeoutMs);
  const result = await sendCDPCommand(
    ws,
    "Runtime.evaluate",
    {
      expression,
      awaitPromise: true,
      returnByValue: true,
    },
    timeoutMs
  );

  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        "CDP JavaScript evaluation failed."
    );
  }

  return result.result?.value ?? result.result ?? null;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help === true) {
    console.log(usage());
    return;
  }

  const expression = options.expressionParts.join(" ").trim() || (await readStdin()).trim();
  if (expression === "") {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const targets = await fetchTargets(options);
  const target = pickTarget(targets, options.target);
  if (target === null || typeof target.webSocketDebuggerUrl !== "string") {
    throw new Error(`No CDP target found on ${options.host}:${options.port}.`);
  }

  const ws = await connectToTarget(target.webSocketDebuggerUrl, options.timeout);
  try {
    const value = await evaluateExpression(ws, expression, options.timeout);
    console.log(
      JSON.stringify(
        {
          target: {
            id: target.id,
            title: target.title,
            type: target.type,
            url: target.url,
          },
          value,
        },
        null,
        2
      )
    );
  } finally {
    ws.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
