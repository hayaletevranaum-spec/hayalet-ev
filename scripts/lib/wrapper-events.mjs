function nowIso() {
  return new Date().toISOString();
}

function identityTranslate(key, params = {}) {
  return String(key).replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, token) => {
    const value = params[token];
    return value === null || value === undefined ? "" : String(value);
  });
}

export function createWrapperSessionId(prefix = "wr") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatCommand(command, args = []) {
  return [command, ...args].join(" ");
}

export function isNoiseLogLine(line) {
  if (typeof line !== "string") return true;
  return line.trim() === "";
}

function resolveMainSurfaceKey(details = {}) {
  if (details.uiMode === "scene" && details.sceneDebug === true) {
    return "shell.wrapper.surfaces.sceneDebug";
  }

  if (details.uiMode === "scene") {
    return "shell.wrapper.surfaces.scene";
  }

  return "shell.wrapper.surfaces.main";
}

function resolveSurfaceLabel(event, details, t) {
  if (event.startsWith("ghost.") || event === "cycle.to-ghost") {
    return t("shell.wrapper.surfaces.ghost");
  }

  return t(resolveMainSurfaceKey(details));
}

function resolveRecoverySurfaceLabel(details, t) {
  return t(
    resolveMainSurfaceKey({
      uiMode: details.recoveryUiMode,
      sceneDebug: details.recoverySceneDebug,
    })
  );
}

export function createUserMessage(event, details = {}, t = identityTranslate) {
  switch (event) {
    case "wrapper.start":
      return t("shell.wrapper.events.wrapperStart");
    case "wrapper.stop":
      return t("shell.wrapper.events.wrapperStop");
    case "main.prepare":
    case "ghost.prepare":
      return t(
        details.assistantStartup === true
          ? "shell.wrapper.events.surfacePreparingAssistant"
          : "shell.wrapper.events.surfacePreparing",
        { surface: resolveSurfaceLabel(event, details, t) }
      );
    case "main.build":
    case "ghost.build":
      return t("shell.wrapper.events.surfaceBuilding", {
        surface: resolveSurfaceLabel(event, details, t),
      });
    case "vite.reset":
      return t("shell.wrapper.events.viteReset");
    case "vite.ready":
      return t("shell.wrapper.events.viteReady");
    case "main.launch":
    case "ghost.launch":
      return t("shell.wrapper.events.surfaceOpening", {
        surface: resolveSurfaceLabel(event, details, t),
      });
    case "main.closed":
    case "ghost.closed":
      return t("shell.wrapper.events.surfaceClosed", {
        surface: resolveSurfaceLabel(event, details, t),
      });
    case "cycle.to-ghost":
    case "cycle.to-app":
      return t("shell.wrapper.events.transitionRouted", {
        surface: resolveSurfaceLabel(event, details, t),
      });
    case "cycle.stop":
      return t("shell.wrapper.events.cycleStop");
    case "cleanup":
      return t("shell.wrapper.events.cleanup");
    case "main.crash":
      return t("shell.wrapper.events.surfaceCrash", {
        surface: resolveSurfaceLabel(event, details, t),
        code: details.code,
      });
    case "ghost.crash":
      return t("shell.wrapper.events.ghostCrashRecovery", {
        surface: resolveSurfaceLabel(event, details, t),
        code: details.code,
        recoverySurface: resolveRecoverySurfaceLabel(details, t),
      });
    case "error":
      return typeof details.message === "string" && details.message.trim() !== ""
        ? t("shell.wrapper.events.error", { message: details.message })
        : t("shell.wrapper.events.unexpectedError");
    default:
      return typeof details.message === "string" && details.message.trim() !== ""
        ? details.message
        : `[${nowIso()}] ${event}`;
  }
}

export function formatProcessLine(role, streamName, line) {
  return `[${role}:${streamName}] ${line}`;
}
