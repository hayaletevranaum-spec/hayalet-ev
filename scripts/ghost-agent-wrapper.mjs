import { access, appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultControl,
  formatWrapperEvent,
  normalizeMainAppUiMode,
  normalizeControl,
  normalizeWrapperRestartRequest,
  shouldReopenMainAfterGhost,
  shouldStartGhost,
  toGhostOnlyStartControl,
  toGhostRunningControl,
  toMainRunningControl,
  toPostGhostControl,
} from "./lib/ghost-wrapper-runtime.mjs";
import { createWrapperTranslatorSync } from "./lib/wrapper-i18n.mjs";
import { createWrapperDashboard } from "./lib/wrapper-dashboard.mjs";
import { createUserMessage, createWrapperSessionId } from "./lib/wrapper-events.mjs";
import { createWrapperSupervisor } from "./lib/wrapper-supervisor.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = dirname(__dirname);

const runtimeControlPath = join(root, "data", "assistant-runtime.json");
const runtimeEventLogPath = join(root, "data", "assistant-runtime-events.log");
const wrapperRestartRequestPath = join(root, "data", "assistant-wrapper-restart.json");

const env = {
  ...process.env,
  APP_UI_MODE: normalizeMainAppUiMode(process.env.APP_UI_MODE),
};
delete env.ELECTRON_RUN_AS_NODE;

function isSceneDebugEnabled() {
  const value = String(env.APP_SCENE_DEBUG ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "debug";
}

function nowIso() {
  return new Date().toISOString();
}

async function ensureControlFile() {
  await mkdir(dirname(runtimeControlPath), { recursive: true });
  try {
    await access(runtimeControlPath);
  } catch {
    await writeFile(runtimeControlPath, `${JSON.stringify(defaultControl(nowIso()), null, 2)}\n`, "utf-8");
  }
}

async function logWrapperEvent(event, details = {}) {
  const line = formatWrapperEvent(event, details, nowIso());
  await appendFile(runtimeEventLogPath, `${line}\n`, "utf-8");
}

async function readControl() {
  await ensureControlFile();
  try {
    const raw = await readFile(runtimeControlPath, "utf-8");
    return normalizeControl(JSON.parse(raw), nowIso());
  } catch {
    return defaultControl(nowIso());
  }
}

async function writeControl(nextControl) {
  const normalized = normalizeControl(nextControl, nowIso());
  await writeFile(runtimeControlPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
  return normalized;
}

async function clearWrapperRestartRequest() {
  await rm(wrapperRestartRequestPath, { force: true });
}

async function consumeWrapperRestartRequest() {
  try {
    const raw = await readFile(wrapperRestartRequestPath, "utf-8");
    await clearWrapperRestartRequest();
    return normalizeWrapperRestartRequest(JSON.parse(raw));
  } catch {
    return null;
  }
}

function createRuntimeTools(sessionId) {
  const i18n = createWrapperTranslatorSync({ root });
  const dashboard = createWrapperDashboard({
    sessionId,
    userLabel: i18n.t("shell.wrapper.dashboard.userLabel"),
    formatPhaseLabel(phase) {
      return i18n.t(`shell.wrapper.dashboard.phases.${phase}`);
    },
  });
  dashboard.attach();

  const supervisor = createWrapperSupervisor({
    root,
    env,
    dashboard,
    sessionId,
    translator: i18n.t,
    onEvent(event, details) {
      void logWrapperEvent(`supervisor.${event}`, { sessionId, ...details });
    },
  });

  return {
    dashboard,
    sessionId,
    supervisor,
    t: i18n.t,
  };
}

async function runMain(supervisor, launchOptions) {
  const currentControl = await readControl();
  const runningMainControl = toMainRunningControl(currentControl, nowIso());
  const uiMode = normalizeMainAppUiMode(launchOptions.uiMode);
  const sceneDebug = launchOptions.sceneDebug === true;
  await writeControl(runningMainControl);
  await logWrapperEvent("cycle.main.sync", {
    desiredMode: runningMainControl.desiredMode,
    phase: runningMainControl.phase,
    workflowSessionId: runningMainControl.workflowSessionId,
    assistantStartup: launchOptions.assistantStartup === true,
    uiMode,
    sceneDebug,
  });

  return supervisor.runMainAppCycle({
    assistantStartup: launchOptions.assistantStartup === true,
    uiMode,
    sceneDebug,
  });
}

async function runGhost(supervisor) {
  return supervisor.runGhostAppCycle();
}

async function runGhostOnly() {
  await ensureControlFile();
  await clearWrapperRestartRequest();
  const { dashboard, sessionId, supervisor, t } = createRuntimeTools(createWrapperSessionId());
  await logWrapperEvent("wrapper.start", { runtimeControlPath, mode: "ghost-only", sessionId });

  try {
    const startControl = await readControl();
    const ghostOnlyControl = toGhostOnlyStartControl(startControl, nowIso());
    await writeControl(ghostOnlyControl);
    await logWrapperEvent("cycle.ghost.start", {
      nextTarget: "ghost",
      desiredMode: ghostOnlyControl.desiredMode,
      phase: ghostOnlyControl.phase,
      sessionId,
    });

    const code = await runGhost(supervisor);
    const afterControl = await readControl();
    const idleControl = toPostGhostControl(afterControl, nowIso());
    await writeControl(idleControl);
    await logWrapperEvent("cycle.ghost.closed", {
      code,
      desiredMode: idleControl.desiredMode,
      phase: idleControl.phase,
      sessionId,
    });

    if (shouldReopenMainAfterGhost(idleControl)) {
      supervisor.emit("cycle.to-app", {
        uiMode: normalizeMainAppUiMode(env.APP_UI_MODE),
        sceneDebug: isSceneDebugEnabled(),
      });
      await logWrapperEvent("cycle.main.start", { nextTarget: "app", assistantStartup: true, sessionId });
      const mainCode = await runMain(supervisor, {
        assistantStartup: true,
        uiMode: normalizeMainAppUiMode(env.APP_UI_MODE),
        sceneDebug: isSceneDebugEnabled(),
      });
      process.exitCode = mainCode !== 0 ? mainCode : code;
      return;
    }

    supervisor.emit("cycle.stop");
    await logWrapperEvent("cycle.stop", {
      reason: "ghost-close-requested",
      desiredMode: idleControl.desiredMode,
      phase: idleControl.phase,
      sessionId,
    });
    process.exitCode = code !== 0 ? code : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dashboard.user(createUserMessage("error", { message }, t));
    await logWrapperEvent("wrapper.error", { sessionId, message });
    process.exitCode = 1;
  } finally {
    await supervisor.cleanup();
    await logWrapperEvent("wrapper.stop", { sessionId, mode: "ghost-only" });
    dashboard.dispose();
  }
}

async function main() {
  if (process.argv.includes("--ghost-only")) {
    return runGhostOnly();
  }

  await ensureControlFile();
  await clearWrapperRestartRequest();
  const { dashboard, sessionId, supervisor, t } = createRuntimeTools(createWrapperSessionId());
  await logWrapperEvent("wrapper.start", { runtimeControlPath, sessionId });

  let nextTarget = "app";
  let nextMainLaunchOptions = {
    assistantStartup: false,
    uiMode: normalizeMainAppUiMode(env.APP_UI_MODE),
    sceneDebug: isSceneDebugEnabled(),
  };

  try {
    while (true) {
      if (nextTarget === "app") {
        const launchOptions = { ...nextMainLaunchOptions };
        await logWrapperEvent("cycle.main.start", {
          nextTarget,
          assistantStartup: launchOptions.assistantStartup,
          uiMode: launchOptions.uiMode,
          sceneDebug: launchOptions.sceneDebug,
          sessionId,
        });
        const code = await runMain(supervisor, launchOptions);
        nextMainLaunchOptions = {
          ...launchOptions,
          assistantStartup: false,
        };
        if (code !== 0) {
          dashboard.user(createUserMessage("main.crash", { code, ...launchOptions }, t));
          await logWrapperEvent("cycle.main.crash", { code, sessionId });
          process.exitCode = code;
          return;
        }

        const restartRequest = await consumeWrapperRestartRequest();
        if (restartRequest !== null) {
          nextMainLaunchOptions = {
            ...launchOptions,
            ...restartRequest,
            assistantStartup: launchOptions.assistantStartup,
          };
          supervisor.emit("cycle.to-app", {
            uiMode: nextMainLaunchOptions.uiMode,
            sceneDebug: nextMainLaunchOptions.sceneDebug,
          });
          await logWrapperEvent("cycle.main.restart", {
            sessionId,
            uiMode: nextMainLaunchOptions.uiMode,
            sceneDebug: nextMainLaunchOptions.sceneDebug,
          });
          nextTarget = "app";
          continue;
        }

        const control = await readControl();
        await logWrapperEvent("cycle.main.closed", {
          desiredMode: control.desiredMode,
          phase: control.phase,
          workflowSessionId: control.workflowSessionId,
          sessionId,
        });

        if (!shouldStartGhost(control)) {
          supervisor.emit("cycle.stop");
          await logWrapperEvent("cycle.stop", {
            reason: "ghost-not-requested",
            desiredMode: control.desiredMode,
            phase: control.phase,
            sessionId,
          });
          return;
        }

        const inGhostControl = toGhostRunningControl(control, nowIso());
        await writeControl(inGhostControl);
        supervisor.emit("cycle.to-ghost", {
          uiMode: "ghost-agent",
          sceneDebug: false,
        });
        await logWrapperEvent("cycle.ghost.prepare", {
          desiredMode: inGhostControl.desiredMode,
          phase: inGhostControl.phase,
          sessionId,
        });
        nextTarget = "ghost";
        continue;
      }

      await logWrapperEvent("cycle.ghost.start", { nextTarget, sessionId });
      const ghostCode = await runGhost(supervisor);
      if (ghostCode !== 0) {
        dashboard.user(
          createUserMessage(
            "ghost.crash",
            {
              code: ghostCode,
              recoveryUiMode: nextMainLaunchOptions.uiMode,
              recoverySceneDebug: nextMainLaunchOptions.sceneDebug,
            },
            t
          )
        );
      }

      const control = await readControl();
      const idleControl = toPostGhostControl(control, nowIso());
      await writeControl(idleControl);
      await logWrapperEvent("cycle.ghost.closed", {
        code: ghostCode,
        desiredMode: idleControl.desiredMode,
        phase: idleControl.phase,
        workflowSessionId: idleControl.workflowSessionId,
        sessionId,
      });

      if (!shouldReopenMainAfterGhost(idleControl)) {
        supervisor.emit("cycle.stop");
        await logWrapperEvent("cycle.stop", {
          reason: "ghost-close-requested",
          desiredMode: idleControl.desiredMode,
          phase: idleControl.phase,
          sessionId,
        });
        return;
      }

      nextMainLaunchOptions = {
        ...nextMainLaunchOptions,
        assistantStartup: true,
      };
      nextTarget = "app";
      supervisor.emit("cycle.to-app", {
        uiMode: nextMainLaunchOptions.uiMode,
        sceneDebug: nextMainLaunchOptions.sceneDebug,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dashboard.user(createUserMessage("error", { message }, t));
    await logWrapperEvent("wrapper.error", { sessionId, message });
    process.exitCode = 1;
  } finally {
    await supervisor.cleanup();
    await logWrapperEvent("wrapper.stop", { sessionId });
    dashboard.dispose();
  }
}

void main();
