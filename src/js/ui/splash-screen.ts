import { LogCategory } from "@shared/logging-core";
import { Logger } from "../modules/logger/index.js";
import { MINIMUM_DISPLAY_TIME, HIDE_ANIMATION_DURATION } from "@ui-constants";
import { AppI18n } from "../modules/i18n/index.js";
import { getSceneLoadingTheme } from "../scene-system/index.js";
import {
  createManagedOverlayController,
  OVERLAY_GROUPS,
  OVERLAY_KINDS,
  type ManagedOverlayController,
} from "./overlay-system.js";
import { getCurrentUiMode, isSceneUiMode, type UiMode } from "./ui-mode.js";

interface SplashElements {
  container: HTMLElement | null;
  progress: HTMLElement | null;
  status: HTMLElement | null;
  logo: HTMLElement | null;
}

const ELEMENT_IDS = {
  container: "splash-screen",
  progress: "splash-progress",
  status: "splash-status",
  logo: "splash-logo",
};

const SCENE_STATUS_KEY = "app.startup.sceneLines";
const SCENE_STATUS_SEPARATOR = "\n";
const SPLASH_LOGO_PATH = "./logo.jpg";

let elements: SplashElements = {
  container: null,
  progress: null,
  status: null,
  logo: null,
};

let showTime: number = 0;
let currentProgress: number = 0;
let isVisible: boolean = false;
let isInitialized: boolean = false;
let sceneAnimationTimer: ReturnType<typeof setInterval> | null = null;
let sceneFrameIndex: number = 0;
let sceneAnimationCompleted: boolean = false;
let splashOverlayController: ManagedOverlayController | null = null;
let splashOverlayElement: HTMLElement | null = null;

let sceneStatusQueue: string[] = [];
let sceneStatusIndex = 0;

function createClassicSplashMarkup(): string {
  const title = AppI18n.t("app.documentTitle");
  const versionLabel = AppI18n.t("app.splash.version");

  return `
    <div class="splash-content">
      <div class="splash-logo-container">
        <img src="${SPLASH_LOGO_PATH}" alt="${title}" class="splash-logo" id="${ELEMENT_IDS.logo}" />
        <div class="splash-logo-glow"></div>
      </div>
      <h1 class="splash-title">${title}</h1>
      <p class="splash-version">${versionLabel}</p>
      <div class="splash-loader">
        <div class="splash-progress" id="${ELEMENT_IDS.progress}"></div>
      </div>
      <p class="splash-status" id="${ELEMENT_IDS.status}">${AppI18n.t("app.startup.starting")}</p>
    </div>
  `;
}

function createSceneSplashMarkup(): string {
  const loadingTheme = getSceneLoadingTheme();
  const frameMarkup = loadingTheme.frames
    .map(
      (frameSrc, index) => `
        <img
          src="${frameSrc}"
          alt=""
          class="splash-scene-frame${index === 0 ? " is-active" : ""}"
          data-scene-frame-index="${index}"
        />
      `
    )
    .join("");

  return `
    <div class="splash-content splash-content--scene">
      <div class="splash-scene-stage" id="${ELEMENT_IDS.logo}">
        <div class="splash-scene-door">${frameMarkup}</div>
      </div>
      <div class="splash-scene-copy">
        <div class="splash-loader">
          <div class="splash-progress" id="${ELEMENT_IDS.progress}"></div>
        </div>
        <p class="splash-status" id="${ELEMENT_IDS.status}">${AppI18n.t("app.startup.starting")}</p>
      </div>
    </div>
  `;
}

function buildSplashMarkup(uiMode: UiMode): string {
  return uiMode === "scene" ? createSceneSplashMarkup() : createClassicSplashMarkup();
}

function stopSceneAnimation(): void {
  if (sceneAnimationTimer !== null) {
    clearInterval(sceneAnimationTimer);
    sceneAnimationTimer = null;
  }
}

function resetSceneAnimation(): void {
  stopSceneAnimation();
  sceneFrameIndex = 0;
  sceneAnimationCompleted = false;
  setSceneFrame(sceneFrameIndex);
}

function setSceneFrame(index: number): void {
  const frames = Array.from(document.querySelectorAll<HTMLImageElement>(".splash-scene-frame"));
  frames.forEach((frame, frameIndex) => {
    frame.classList.toggle("is-active", frameIndex === index);
  });
}

function startSceneAnimation(): void {
  if (!isSceneUiMode()) {
    stopSceneAnimation();
    return;
  }

  const loadingTheme = getSceneLoadingTheme();
  const frameCount = Number(loadingTheme.frames.length);
  if (frameCount <= 1) {
    setSceneFrame(0);
    sceneAnimationCompleted = true;
    return;
  }

  if (sceneAnimationTimer !== null || sceneAnimationCompleted) {
    return;
  }

  setSceneFrame(sceneFrameIndex);
  sceneAnimationTimer = setInterval(() => {
    if (sceneFrameIndex >= frameCount - 1) {
      sceneAnimationCompleted = true;
      stopSceneAnimation();
      return;
    }

    sceneFrameIndex += 1;
    setSceneFrame(sceneFrameIndex);

    if (sceneFrameIndex >= frameCount - 1) {
      sceneAnimationCompleted = true;
      stopSceneAnimation();
    }
  }, loadingTheme.frameDurationMs);
}

function shuffleSceneLines(lines: string[]): string[] {
  const next = [...lines];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = next[i];
    const target = next[j];
    if (current === undefined || target === undefined) {
      continue;
    }
    next[i] = target;
    next[j] = current;
  }
  return next;
}

function parseSceneStatusLines(raw: string): string[] {
  const fallback = AppI18n.t("app.common.translationMissing");
  if (raw.trim() === "" || raw === fallback) {
    return [];
  }
  return raw
    .split(SCENE_STATUS_SEPARATOR)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function resetSceneStatusQueue(): void {
  if (!isSceneUiMode()) {
    sceneStatusQueue = [];
    sceneStatusIndex = 0;
    return;
  }
  sceneStatusQueue = shuffleSceneLines(parseSceneStatusLines(AppI18n.t(SCENE_STATUS_KEY)));
  sceneStatusIndex = 0;
}

function nextSceneStatus(): string | null {
  if (!isSceneUiMode()) {
    return null;
  }
  if (sceneStatusQueue.length === 0 || sceneStatusIndex >= sceneStatusQueue.length) {
    resetSceneStatusQueue();
  }
  if (sceneStatusQueue.length === 0) {
    return null;
  }
  const next = sceneStatusQueue[sceneStatusIndex];
  if (next === undefined) {
    return null;
  }
  sceneStatusIndex += 1;
  return next;
}

function syncSplashVariant(): void {
  const container = document.getElementById(ELEMENT_IDS.container);
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const uiMode = getCurrentUiMode();
  const hasSceneFrames = container.querySelector(".splash-scene-frame") !== null;
  if (container.dataset["uiMode"] === uiMode && (uiMode !== "scene" || hasSceneFrames)) {
    return;
  }

  container.dataset["uiMode"] = uiMode;
  container.innerHTML = buildSplashMarkup(uiMode);
  resetSceneAnimation();
  resetSceneStatusQueue();
  if (uiMode !== "scene") {
    stopSceneAnimation();
  }
  isInitialized = false;
}

function getElements(): SplashElements {
  syncSplashVariant();
  if (!isInitialized) {
    elements = {
      container: document.getElementById(ELEMENT_IDS.container),
      progress: document.getElementById(ELEMENT_IDS.progress),
      status: document.getElementById(ELEMENT_IDS.status),
      logo: document.getElementById(ELEMENT_IDS.logo),
    };
    isInitialized = true;
  }
  return elements;
}

function logSplashDebug(
  key: string,
  params?: Record<string, string | number>,
  context?: Record<string, unknown>
): void {
  Logger.debugT(LogCategory.UI_SPLASH, `app.logs.${key}`, params, context);
}

function createSplashElement(): HTMLElement {
  const splash = document.createElement("div");
  splash.id = ELEMENT_IDS.container;
  splash.className = "splash";
  splash.dataset["uiMode"] = getCurrentUiMode();
  splash.innerHTML = buildSplashMarkup(getCurrentUiMode());

  return splash;
}

function ensureSplashOverlayController(container: HTMLElement): void {
  if (splashOverlayElement === container && splashOverlayController !== null) {
    splashOverlayController.sync();
    return;
  }

  splashOverlayController?.destroy();
  splashOverlayElement = container;
  splashOverlayController = createManagedOverlayController({
    id: ELEMENT_IDS.container,
    element: container,
    kind: OVERLAY_KINDS.loading,
    exclusiveGroup: OVERLAY_GROUPS.loading,
    closeOnEscape: false,
    isOpen: () => container.isConnected && !container.classList.contains("is-hidden"),
    setOpen: (open: boolean) => {
      container.classList.toggle("is-hidden", !open);
      if (open) {
        container.classList.remove("splash-hiding");
      }
    },
  });
}

function disposeSplashOverlayController(): void {
  splashOverlayController?.destroy();
  splashOverlayController = null;
  splashOverlayElement = null;
}

const splashScreen = {
  show(): void {
    let container = getElements().container;

    if (!container) {
      container = createSplashElement();
      document.body.insertBefore(container, document.body.firstChild);
      isInitialized = false; // NOTE: Force re-fetch after injecting DOM.
      getElements();
    }

    ensureSplashOverlayController(container);
    splashOverlayController?.open();
    showTime = Date.now();
    isVisible = true;
    currentProgress = 0;
    resetSceneAnimation();
    resetSceneStatusQueue();
    startSceneAnimation();

    logSplashDebug("splashShown", undefined, { timestamp: showTime });
  },

  async hide(): Promise<void> {
    const { container } = getElements();
    if (!container || !isVisible) return;

    const elapsed = Date.now() - showTime;
    const remainingTime = Math.max(0, MINIMUM_DISPLAY_TIME - elapsed);

    if (remainingTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingTime));
    }

    container.classList.add("splash-hiding");

    await new Promise((resolve) => setTimeout(resolve, HIDE_ANIMATION_DURATION));

    stopSceneAnimation();
    container.remove();
    isVisible = false;
    isInitialized = false;
    elements = { container: null, progress: null, status: null, logo: null };
    disposeSplashOverlayController();

    logSplashDebug("splashRemoved", undefined, {
      totalTime: Date.now() - showTime,
    });
  },

  setProgress(percent: number): void {
    const { progress } = getElements();
    if (!progress) return;

    const value = Math.max(0, Math.min(100, percent));
    currentProgress = value;

    progress.classList.remove("indeterminate");

    // NOTE: Progress is runtime-driven via CSS var to avoid width injection.
    progress.style.setProperty("--splash-progress", `${value}%`);

    logSplashDebug("splashProgressUpdated", undefined, { percent: value });
  },

  setIndeterminate(): void {
    const { progress } = getElements();
    if (!progress) return;

    progress.style.removeProperty("--splash-progress");
    progress.classList.add("indeterminate");
  },

  setStatus(message: string): void {
    const { status } = getElements();
    if (!status) return;

    status.textContent = message;

    logSplashDebug("splashStatusUpdated", undefined, { message });
  },

  update(percent: number, message: string): void {
    if (!isVisible) {
      const { container } = getElements();
      if (container && !container.classList.contains("is-hidden")) {
        isVisible = true;
        showTime = Date.now();
      }
    }
    startSceneAnimation();
    splashScreen.setProgress(percent);
    const sceneStatus = nextSceneStatus();
    splashScreen.setStatus(sceneStatus ?? message);
  },

  get isVisible(): boolean {
    return isVisible;
  },

  get progress(): number {
    return currentProgress;
  },

  complete(): void {
    splashScreen.setProgress(100);
    splashScreen.setStatus(AppI18n.t("app.startup.ready"));
  },

  reset(): void {
    syncSplashVariant();
    resetSceneStatusQueue();
    resetSceneAnimation();
    splashScreen.setProgress(0);
    splashScreen.setStatus(AppI18n.t("app.startup.starting"));
    currentProgress = 0;
  },
};

export { splashScreen as SplashScreen };
