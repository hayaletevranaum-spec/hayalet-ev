/* global document, navigator, window */

(function (global: GameRoomUiGlobal) {
  type UnknownRecord = GameRoomUnknownRecord;

  function getRuntimeRegistry(host: GameRoomUiGlobal): GameRoomUiRuntimeRegistry {
    return host.GameRoomUiRuntime || (host.GameRoomUiRuntime = {});
  }

  function readRecord(value: unknown): UnknownRecord | null {
    return value && typeof value === "object" && Array.isArray(value) === false
      ? (value as UnknownRecord)
      : null;
  }

  function readString(value: unknown): string | null {
    return typeof value === "string" ? value : null;
  }

  const registry = getRuntimeRegistry(global);

  registry.createGameRoomUiRuntime = function createGameRoomUiRuntime(): GameRoomUiRuntimeHandle {
    const bootstrapFactories = global.GameRoomUiBootstrapRuntime || {};
    const createBootstrapRuntime = bootstrapFactories.createGameRoomUiBootstrapRuntime;
    if (typeof createBootstrapRuntime !== "function") {
      throw new Error("Game Room UI bootstrap runtime is unavailable.");
    }

    const stateMessageFactories = global.GameRoomUiStateMessageRuntime || {};
    const createStateMessageRuntime = stateMessageFactories.createGameRoomUiStateMessageRuntime;
    if (typeof createStateMessageRuntime !== "function") {
      throw new Error("Game Room UI state message runtime is unavailable.");
    }

    const bootstrapRuntime = createBootstrapRuntime({
      document: document,
      navigator: navigator,
      render: render,
    });
    const roomId = bootstrapRuntime.roomId;
    const teamTetrisFeatureId = bootstrapRuntime.teamTetrisFeatureId;
    const contextRuntime = bootstrapRuntime.contextRuntime;
    const scrollRuntime = bootstrapRuntime.scrollRuntime;
    const getState = bootstrapRuntime.getState;
    const backgammonUi = bootstrapRuntime.backgammonUi;
    const teamTetrisUi = bootstrapRuntime.teamTetrisUi;
    const bootstrapText = bootstrapRuntime.bootstrapText;
    const applyPresentationMode = bootstrapRuntime.applyPresentationMode;
    const applyLocale = bootstrapRuntime.applyLocale;
    const getActiveFeatureId = bootstrapRuntime.getActiveFeatureId;
    const getFeatureLabel = bootstrapRuntime.getFeatureLabel;
    let renderQueued = false;
    let renderInProgress = false;
    let renderRequestedAfterCurrent = false;
    const stateMessageRuntime = createStateMessageRuntime({
      stateRef: bootstrapRuntime.stateRef,
      backgammonUi: backgammonUi,
      teamTetrisUi: teamTetrisUi,
      render: render,
      scheduleRender: scheduleRender,
    });

    function isRenderableRoot(value: unknown): value is HTMLElement {
      return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as { append?: unknown }).append === "function"
      );
    }

    function getRoomCloseLabel(): string {
      const state = getState();
      return state.locale === "tr" ? "Ana sayfaya dön" : "Return home";
    }

    function createRoomCloseButton(): HTMLElement | null {
      const runtimeCreateElement = (contextRuntime as { createElement?: GameRoomCreateElement })
        .createElement;
      if (typeof runtimeCreateElement === "function") {
        return runtimeCreateElement("button", "game-room-close-button");
      }
      if (typeof document.createElement !== "function") {
        return null;
      }
      const button = document.createElement("button");
      button.className = "game-room-close-button";
      return button;
    }

    function setRoomCloseButtonLabel(button: HTMLElement, label: string): void {
      const target = button as HTMLElement & {
        ariaLabel?: string;
        setAttribute?: (name: string, value: string) => void;
      };
      button.title = label;
      if (typeof target.setAttribute === "function") {
        target.setAttribute("aria-label", label);
        return;
      }
      target.ariaLabel = label;
    }

    function findExistingRoomCloseButton(root: HTMLElement): HTMLElement | null {
      const children = (root as unknown as { children?: ArrayLike<Element> }).children;
      if (children === undefined) {
        return null;
      }
      for (let index = 0; index < children.length; index += 1) {
        const child = children[index];
        if (
          child !== undefined &&
          typeof child.className === "string" &&
          child.className.split(/\s+/).includes("game-room-close-button")
        ) {
          return child as HTMLElement;
        }
      }
      return null;
    }

    function syncRoomCloseControl(root: HTMLElement): void {
      const label = getRoomCloseLabel();
      const existingButton = findExistingRoomCloseButton(root);
      if (existingButton !== null) {
        setRoomCloseButtonLabel(existingButton, label);
        return;
      }
      const button = createRoomCloseButton();
      if (button === null) {
        return;
      }
      (button as HTMLButtonElement).type = "button";
      setRoomCloseButtonLabel(button, label);
      button.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
      if (typeof button.addEventListener === "function") {
        button.addEventListener("click", function () {
          const roomApi = global.roomAPI;
          if (roomApi && typeof roomApi.close === "function") {
            roomApi.close();
          }
        });
      }
      root.append(button);
    }

    function render(): void {
      const state = getState();
      const root = document.getElementById("app");
      if (!isRenderableRoot(root)) {
        return;
      }

      const scrollState = scrollRuntime.capture(root);

      try {
        if (!state.translations) {
          backgammonUi.renderBootstrap(root);
          syncRoomCloseControl(root);
          return;
        }

        document.title = state.context.room.name + " - " + getFeatureLabel(getActiveFeatureId());

        if (getActiveFeatureId() === teamTetrisFeatureId) {
          teamTetrisUi.renderTeamTetris(root);
          syncRoomCloseControl(root);
          return;
        }

        backgammonUi.renderBackgammon(root);
        syncRoomCloseControl(root);
      } finally {
        scrollRuntime.restore(root, scrollState);
      }
    }

    function scheduleRender(): void {
      if (renderInProgress) {
        renderRequestedAfterCurrent = true;
        return;
      }
      if (renderQueued) {
        return;
      }
      renderQueued = true;

      const schedulerHost = globalThis as typeof globalThis & {
        clearTimeout?: (handle: unknown) => void;
        queueMicrotask?: (callback: () => void) => void;
        requestAnimationFrame?: (callback: FrameRequestCallback) => unknown;
        setTimeout?: (callback: () => void, delay: number) => unknown;
      };
      let fallbackTimer: unknown = null;
      let renderCompleted = false;
      const clearFallbackTimer = function (): void {
        if (fallbackTimer === null) {
          return;
        }
        if (typeof schedulerHost.clearTimeout === "function") {
          schedulerHost.clearTimeout(fallbackTimer);
        }
        fallbackTimer = null;
      };
      const runRender: FrameRequestCallback = function () {
        if (renderCompleted) {
          return;
        }
        renderCompleted = true;
        clearFallbackTimer();
        renderQueued = false;
        renderInProgress = true;
        try {
          render();
        } finally {
          renderInProgress = false;
          if (renderRequestedAfterCurrent) {
            renderRequestedAfterCurrent = false;
            scheduleRender();
          }
        }
      };

      try {
        if (typeof schedulerHost.requestAnimationFrame === "function") {
          schedulerHost.requestAnimationFrame(runRender);
          if (typeof schedulerHost.setTimeout === "function") {
            fallbackTimer = schedulerHost.setTimeout(function () {
              runRender(Date.now());
            }, 50);
          }
          return;
        }
        if (typeof schedulerHost.setTimeout === "function") {
          schedulerHost.setTimeout(function () {
            runRender(Date.now());
          }, 0);
          return;
        }
        if (typeof schedulerHost.queueMicrotask === "function") {
          schedulerHost.queueMicrotask(function () {
            runRender(Date.now());
          });
          return;
        }
        runRender(Date.now());
      } catch (error) {
        renderQueued = false;
        renderInProgress = false;
        throw error;
      }
    }

    function handleHostMessage(message: unknown) {
      const state = getState();
      const messageRecord = readRecord(message);
      if (messageRecord === null) {
        return;
      }
      const messageType = readString(messageRecord["type"]);
      if (messageType === null) {
        return;
      }

      if (messageType === "host-context") {
        const presentation = readRecord(messageRecord["presentation"]) || {};
        applyPresentationMode(presentation);
        const locale = readString(messageRecord["locale"]);
        if (locale !== null) {
          applyLocale(locale);
        }
        const translations = readRecord(messageRecord["translations"]);
        if (translations !== null) {
          state.translations = translations;
        }
        const previousTarget = state.preferences.target;
        state.context = contextRuntime.normalizeContext(messageRecord);
        state.preferences.target =
          previousTarget === "ai1" || previousTarget === "ai2" || previousTarget === "us1"
            ? previousTarget
            : "ai1";
        render();
        return;
      }

      if (messageType === "backgammon-state") {
        stateMessageRuntime.handleBackgammonState(messageRecord);
        return;
      }

      if (messageType === "team-tetris-state") {
        stateMessageRuntime.handleTeamTetrisState(messageRecord);
        return;
      }

      if (messageType === "command-result") {
        stateMessageRuntime.handleCommandResult(messageRecord);
      }
    }

    function start(): void {
      const state = getState();
      const roomApi = global.roomAPI;
      if (roomApi && typeof roomApi.onHostMessage === "function") {
        roomApi.onHostMessage(handleHostMessage);
      } else {
        state.lastCommandMessage = bootstrapText("roomApiUnavailable");
      }

      global.__gameRoomTeamTetrisTest__ = teamTetrisUi.getTestBridge();

      applyPresentationMode(state.presentation);
      applyLocale(state.locale);
      render();

      if (roomApi && typeof roomApi.ready === "function") {
        roomApi.ready({
          room: roomId,
          feature: getActiveFeatureId(),
          stage: "ui-ready",
        });
      }
    }

    return {
      getState: getState,
      handleHostMessage: handleHostMessage,
      render: render,
      start: start,
    };
  };
})(window as unknown as GameRoomUiGlobal);
