import { execFile, spawn } from "node:child_process";
import { join } from "node:path";

import { buildMainAppLaunchArgs, normalizeMainAppUiMode } from "./ghost-wrapper-runtime.mjs";
import { createUserMessage, formatCommand, formatProcessLine, isNoiseLogLine } from "./wrapper-events.mjs";

const VITE_URLS = ["http://127.0.0.1:5174", "http://localhost:5174"];

function resolveExecutable(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function createDeferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(null), timeoutMs);
  });
  const result = await Promise.race([promise, timeout]);
  clearTimeout(timeoutId);
  return result;
}

async function killProcessTree(pid) {
  if (process.platform !== "win32") return false;
  await new Promise((resolve) => {
    execFile("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => {
      resolve();
    });
  });
  await sleep(250);
  return true;
}

export function splitLines(chunk, remainder = "") {
  const text = `${remainder}${chunk.toString("utf-8")}`;
  const parts = text.split(/\r?\n/);
  const tail = parts.pop() ?? "";
  return {
    lines: parts,
    remainder: tail,
  };
}

async function waitForHttpReady(urls, timeoutMs = 30000, intervalMs = 250) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok || response.status < 500) {
          return url;
        }
      } catch {
        // Keep polling until timeout.
      }
    }

    await new Promise((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }

  throw new Error(`Timed out while waiting for Vite readiness after ${timeoutMs}ms.`);
}

export function createWrapperSupervisor({
  root,
  env,
  dashboard,
  sessionId,
  translator = undefined,
  onEvent = () => {},
}) {
  const children = new Map();
  const npmCommand = resolveExecutable("npm");
  const viteCommand = resolveExecutable("vite");
  const electronCommand = resolveExecutable("electron");
  const mainEntry = join(root, "dist", "electron", "main.js");
  const ghostEntry = join(root, "dist", "ghost-agent", "electron", "main.js");

  function emit(event, details = {}) {
    dashboard.user(createUserMessage(event, details, translator));
    onEvent(event, details);
  }

  function developer(message) {
    dashboard.developer(message);
  }

  function registerChild(role, child, command, args) {
    const closed = createDeferred();
    let settled = false;
    const record = {
      role,
      child,
      command,
      args,
      closed: closed.promise,
    };

    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      if (children.get(role)?.child === child) {
        children.delete(role);
      }
      developer(`${role} exited code=${code ?? 0} signal=${signal ?? "none"}`);
      closed.resolve(code ?? 0);
    });

    child.once("error", (error) => {
      developer(`${role} spawn error: ${error.message}`);
      if (settled) return;
      settled = true;
      if (children.get(role)?.child === child) {
        children.delete(role);
      }
      closed.resolve(1);
    });

    children.set(role, record);
    return record;
  }

  function attachPipe(role, streamName, stream) {
    if (stream == null) return;
    let remainder = "";
    stream.on("data", (chunk) => {
      const next = splitLines(chunk, remainder);
      remainder = next.remainder;
      for (const line of next.lines) {
        if (isNoiseLogLine(line)) continue;
        developer(formatProcessLine(role, streamName, line));
      }
    });
    stream.on("end", () => {
      const finalLine = remainder.trim();
      if (finalLine !== "" && !isNoiseLogLine(finalLine)) {
        developer(formatProcessLine(role, streamName, finalLine));
      }
    });
  }

  function spawnManaged(role, command, args, options = {}) {
    developer(`$ ${formatCommand(command, args)}`);
    const child = spawn(command, args, {
      cwd: root,
      env: { ...env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
      windowsHide: true,
    });
    attachPipe(role, "stdout", child.stdout);
    attachPipe(role, "stderr", child.stderr);
    return registerChild(role, child, command, args);
  }

  async function runShortCommand(role, command, args, { eventName = null, eventDetails = {} } = {}) {
    if (eventName !== null) {
      emit(eventName, eventDetails);
    }

    const record = spawnManaged(role, command, args);
    const code = await record.closed;
    if (code !== 0) {
      throw new Error(`${role} failed with exit code ${code}`);
    }
  }

  async function stopRole(role, { signal = "SIGTERM", timeoutMs = 5000 } = {}) {
    const record = children.get(role);
    if (record === undefined) return;

    if (process.platform === "win32") {
      developer(`Stopping ${role} process tree`);
      await killProcessTree(record.child.pid);
      const treeExitCode = await withTimeout(record.closed, timeoutMs);
      if (treeExitCode === null) {
        record.child.kill("SIGKILL");
        await withTimeout(record.closed, timeoutMs);
      }
      return;
    }

    developer(`Stopping ${role} with ${signal}`);
    record.child.kill(signal);
    const cleanExitCode = await withTimeout(record.closed, timeoutMs);
    if (cleanExitCode !== null) return;

    developer(`Stopping ${role} process tree after timeout`);
    const treeKilled = await killProcessTree(record.child.pid);
    if (!treeKilled) {
      record.child.kill("SIGKILL");
    }
    await withTimeout(record.closed, timeoutMs);
  }

  async function resetVite() {
    dashboard.setPhase("resetting-vite");
    emit("vite.reset");
    await stopRole("vite");
    const record = spawnManaged("vite", viteCommand, [], {
      env: {
        FORCE_COLOR: "0",
      },
    });
    await waitForHttpReady(VITE_URLS);
    emit("vite.ready");
    return record;
  }

  function buildMainArgs({ assistantStartup = false, uiMode = "classic", sceneDebug = false }) {
    return buildMainAppLaunchArgs(mainEntry, {
      assistantStartup,
      uiMode,
      sceneDebug,
      cdpPort: process.env.CDP_PORT ?? "9222",
    });
  }

  function buildGhostArgs() {
    return [ghostEntry, "--no-sandbox", `--remote-debugging-port=${process.env.CDP_PORT ?? "9222"}`];
  }

  async function runMainAppCycle({ assistantStartup = false, uiMode = "classic", sceneDebug = false } = {}) {
    const mainSurfaceDetails = {
      assistantStartup,
      uiMode: normalizeMainAppUiMode(uiMode),
      sceneDebug,
    };

    dashboard.setPhase("preparing-app");
    emit("main.prepare", mainSurfaceDetails);
    await runShortCommand("build-main", npmCommand, ["run", "electron:build"], {
      eventName: "main.build",
      eventDetails: mainSurfaceDetails,
    });
    await resetVite();
    dashboard.setPhase("running-app");
    emit("main.launch", mainSurfaceDetails);
    const record = spawnManaged("main-app", electronCommand, buildMainArgs({
      assistantStartup,
      uiMode: normalizeMainAppUiMode(uiMode),
      sceneDebug,
    }), {
      env: {
        HAYALET_WRAPPER_MANAGED: "1",
        HAYALET_WRAPPER_SESSION_ID: sessionId,
      },
    });
    const code = await record.closed;
    emit("main.closed", mainSurfaceDetails);
    await stopRole("vite");
    return code;
  }

  async function runGhostAppCycle() {
    const ghostSurfaceDetails = {
      uiMode: "ghost-agent",
      sceneDebug: false,
    };

    dashboard.setPhase("preparing-ghost");
    emit("ghost.prepare", ghostSurfaceDetails);
    await runShortCommand("build-ghost", npmCommand, ["run", "ghost:build:all"], {
      eventName: "ghost.build",
      eventDetails: ghostSurfaceDetails,
    });
    dashboard.setPhase("running-ghost");
    emit("ghost.launch", ghostSurfaceDetails);
    const record = spawnManaged("ghost-app", electronCommand, buildGhostArgs(), {
      env: {},
    });
    const code = await record.closed;
    emit("ghost.closed", ghostSurfaceDetails);
    return code;
  }

  async function cleanup() {
    dashboard.setPhase("cleanup");
    emit("cleanup");
    await stopRole("main-app");
    await stopRole("ghost-app");
    await stopRole("vite");
  }

  developer(`wrapper session ${sessionId} initialized`);

  return {
    cleanup,
    emit,
    runGhostAppCycle,
    runMainAppCycle,
  };
}
