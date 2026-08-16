import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const root = dirname(dirname(__filename));

function parseNumber(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv) {
  const args = {
    pid: null,
    script: null,
    timeoutMs: 15000,
    intervalMs: 250,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--pid") {
      args.pid = parseNumber(argv[index + 1], null);
      index += 1;
      continue;
    }

    if (token.startsWith("--pid=")) {
      args.pid = parseNumber(token.slice("--pid=".length), null);
      continue;
    }

    if (token === "--script") {
      args.script = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (token.startsWith("--script=")) {
      args.script = token.slice("--script=".length) || null;
      continue;
    }

    if (token === "--timeout") {
      args.timeoutMs = parseNumber(argv[index + 1], args.timeoutMs);
      index += 1;
      continue;
    }

    if (token.startsWith("--timeout=")) {
      args.timeoutMs = parseNumber(token.slice("--timeout=".length), args.timeoutMs);
      continue;
    }

    if (token === "--interval") {
      args.intervalMs = parseNumber(argv[index + 1], args.intervalMs);
      index += 1;
      continue;
    }

    if (token.startsWith("--interval=")) {
      args.intervalMs = parseNumber(token.slice("--interval=".length), args.intervalMs);
      continue;
    }
  }

  return args;
}

function isProcessAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForExit(pid, timeoutMs, intervalMs) {
  if (!Number.isFinite(pid) || pid <= 0) return;
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (!isProcessAlive(pid)) return;
    await sleep(intervalMs);
  }
}

async function main() {
  const { pid, script, timeoutMs, intervalMs } = parseArgs(process.argv.slice(2));
  if (typeof script !== "string" || script.trim() === "") {
    process.exitCode = 2;
    return;
  }

  await waitForExit(pid, timeoutMs, intervalMs);

  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(command, ["run", script], {
    cwd: root,
    env: process.env,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

void main();
