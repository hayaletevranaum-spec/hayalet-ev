/* global document, navigator, window */

(function (global: GameRoomUiGlobal) {
  type UnknownRecord = GameRoomUnknownRecord;

  function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === "object" && value !== null && Array.isArray(value) === false;
  }

  function readString(value: unknown, fallback: string): string {
    return typeof value === "string" && value !== "" ? value : fallback;
  }

  function readRuntimeOptions(value: unknown): GameRoomUiBootstrapRuntimeOptions {
    return isRecord(value) ? value : {};
  }

  function readFeatureContract(value: unknown): GameRoomUiFeatureContractLike {
    return isRecord(value) ? value : {};
  }

  function readRoomApi(value: unknown): GameRoomRoomApi | null {
    return isRecord(value) && typeof value["sendCommand"] === "function" ? value : null;
  }

  function getBootstrapRegistry(host: GameRoomUiGlobal): GameRoomUiBootstrapRuntimeRegistry {
    return host.GameRoomUiBootstrapRuntime || (host.GameRoomUiBootstrapRuntime = {});
  }

  const registry = getBootstrapRegistry(global);

  registry.createGameRoomUiBootstrapRuntime = function createGameRoomUiBootstrapRuntime(
    options: unknown
  ): GameRoomUiBootstrapRuntime {
    const runtimeOptions = readRuntimeOptions(options);
    const documentRef = runtimeOptions.document || document;
    const navigatorRef = runtimeOptions.navigator || navigator;
    const render =
      typeof runtimeOptions.render === "function" ? runtimeOptions.render : function () {};

    const featureContract = readFeatureContract(global.GameRoomUiFeatureContract);
    const roomId = readString(featureContract.ROOM_ID, "game-room");
    const featureId = readString(featureContract.FEATURE_ID, "backgammon");
    const teamTetrisFeatureId = readString(featureContract.TEAM_TETRIS_FEATURE_ID, "team-tetris");
    const bootstrapCopy: GameRoomBootstrapCopy =
      typeof featureContract.getBootstrapCopy === "function"
        ? featureContract.getBootstrapCopy()
        : {
            en: {
              roomTitle: "Game Room",
              loadingTitle: "Loading Game Room",
              loadingBody: "Waiting for room context and translations.",
              userLabel: "User",
              roomApiUnavailable: "Room API bridge is not connected.",
              commandSendFailed: "The command could not be sent to the room host.",
            },
            tr: {
              roomTitle: "Oyun Odasi",
              loadingTitle: "Oyun Odasi Yukleniyor",
              loadingBody: "Oda baglami ve ceviriler bekleniyor.",
              userLabel: "Kullanici",
              roomApiUnavailable: "Room API koprusu bagli degil.",
              commandSendFailed: "Komut oda host'una gonderilemedi.",
            },
          };
    const featureRecords: GameRoomFeatureRecord[] =
      typeof featureContract.getFeatureRecords === "function"
        ? featureContract.getFeatureRecords()
        : [
            { id: featureId, name: "Tavla", description: "" },
            { id: teamTetrisFeatureId, name: "Team Tetris", description: "" },
          ];

    const contextRuntimeFactory = (global.GameRoomUiContextRuntime || {})
      .createGameRoomUiContextRuntime;
    if (typeof contextRuntimeFactory !== "function") {
      throw new Error("Game Room UI context runtime is unavailable.");
    }

    const createScrollRuntime = (global.GameRoomUiScrollRuntime || {})
      .createGameRoomUiScrollRuntime;
    if (typeof createScrollRuntime !== "function") {
      throw new Error("Game Room UI scroll runtime is unavailable.");
    }

    const contextRuntime = contextRuntimeFactory({
      roomId: roomId,
      featureId: featureId,
      bootstrapCopy: bootstrapCopy,
      featureRecords: featureRecords,
    });
    const scrollRuntime = createScrollRuntime();
    const stateRef = { current: null as GameRoomUiState | null };

    function getState(): GameRoomUiState {
      return stateRef.current as GameRoomUiState;
    }

    function text(path: string[]): string {
      return contextRuntime.readPath(getState().translations, path) || path.join(".");
    }

    function bootstrapText(key: string): string {
      const state = getState();
      return (
        contextRuntime.readPath(bootstrapCopy[state.locale], [key]) ||
        contextRuntime.readPath(bootstrapCopy["en"], [key]) ||
        key
      );
    }

    function formatScaleFactor(value: number): string {
      return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    }

    function setRuntimeScaleFactor(
      target: { style?: CSSStyleDeclaration | Record<string, string> | null } | null,
      scaleFactor: string
    ): void {
      const style = target?.style;
      if (!style) {
        return;
      }
      const styleRecord = style as CSSStyleDeclaration & {
        setProperty?: ((propertyName: string, value: string) => void) | undefined;
      };
      if (typeof styleRecord.setProperty === "function") {
        styleRecord.setProperty("--room-runtime-ui-scale-factor", scaleFactor);
        return;
      }
      (style as Record<string, string>)["--room-runtime-ui-scale-factor"] = scaleFactor;
    }

    function applyPresentationMode(nextPresentation: unknown): void {
      const state = getState();
      const presentation = isRecord(nextPresentation)
        ? nextPresentation
        : { mode: nextPresentation };
      state.presentation.mode = contextRuntime.normalizePresentationMode(presentation["mode"]);
      state.presentation.uiScale = contextRuntime.normalizeUiScale(presentation["uiScale"]);
      const scaleFactor = formatScaleFactor(state.presentation.uiScale / 100);
      const body = documentRef.body;
      body.dataset["presentationMode"] = state.presentation.mode;
      body.dataset["roomUiScale"] = String(state.presentation.uiScale);
      setRuntimeScaleFactor(body, scaleFactor);

      const documentElement = documentRef.documentElement;
      documentElement.dataset["presentationMode"] = state.presentation.mode;
      documentElement.dataset["roomUiScale"] = String(state.presentation.uiScale);
      setRuntimeScaleFactor(documentElement, scaleFactor);
    }

    function statusText(key: string): string {
      return (
        contextRuntime.readPath(getState().translations, ["backgammon", "status", key]) ||
        bootstrapText(key === "roomApiUnavailable" ? "roomApiUnavailable" : "commandSendFailed")
      );
    }

    function applyLocale(nextLocale: unknown): void {
      const state = getState();
      state.locale = contextRuntime.resolveLocale(nextLocale);
      documentRef.documentElement.lang = state.locale;
    }

    function getActiveFeatureId(): string {
      const state = getState();
      const activeFeatureId =
        typeof state.context.activeFeature?.id === "string"
          ? state.context.activeFeature.id
          : featureId;
      return featureRecords.some(function (feature: GameRoomFeatureRecord) {
        return feature.id === activeFeatureId;
      })
        ? activeFeatureId
        : featureId;
    }

    function getFeatureLabel(activeFeatureId: string): string {
      const state = getState();
      const feature = Array.isArray(state.context.features)
        ? state.context.features.find(function (entry: GameRoomFeatureRecord) {
            return entry.id === activeFeatureId;
          }) || null
        : null;
      if (feature?.name) {
        return feature.name;
      }
      return text(["features", activeFeatureId]);
    }

    function isRoomApiAvailable(): boolean {
      return readRoomApi(global.roomAPI) !== null;
    }

    function sendRoomCommand(command: string, payload: unknown): void {
      const state = getState();
      const roomApi = readRoomApi(global.roomAPI);
      if (roomApi === null || typeof roomApi.sendCommand !== "function") {
        state.lastCommandMessage = statusText("roomApiUnavailable");
        render();
        return;
      }

      const normalizedPayload = isRecord(payload) ? payload : {};
      const sent = roomApi.sendCommand(command, normalizedPayload);
      if (sent !== true) {
        state.lastCommandMessage = statusText("commandSendFailed");
        render();
      }
    }

    const factories = global.GameRoomUiFactories || {};
    const createBackgammonUiModule = factories.createBackgammonUiModule;
    const createTeamTetrisUiModule = factories.createTeamTetrisUiModule;

    if (typeof createBackgammonUiModule !== "function") {
      throw new Error("Tavla UI module is unavailable.");
    }
    if (typeof createTeamTetrisUiModule !== "function") {
      throw new Error("Team Tetris UI module is unavailable.");
    }

    const backgammonUi = createBackgammonUiModule({
      getState: getState,
      roomId: roomId,
      featureId: featureId,
      createSlot: contextRuntime.createSlot,
      createInviteEntry: contextRuntime.createInviteEntry,
      normalizeSlot: contextRuntime.normalizeSlot,
      bootstrapText: bootstrapText,
      text: text,
      statusText: statusText,
      createElement: contextRuntime.createElement,
      render: render,
      sendRoomCommand: sendRoomCommand,
      isRoomApiAvailable: isRoomApiAvailable,
      getFeatureLabel: getFeatureLabel,
    });
    const teamTetrisUi = createTeamTetrisUiModule({
      getState: getState,
      featureId: teamTetrisFeatureId,
      createSlot: contextRuntime.createSlot,
      createElement: contextRuntime.createElement,
      text: text,
      render: render,
      sendRoomCommand: sendRoomCommand,
      getFeatureLabel: getFeatureLabel,
    });

    const documentLocale = documentRef.documentElement.lang;

    stateRef.current = {
      locale: contextRuntime.resolveLocale(documentLocale || navigatorRef.language),
      translations: null,
      context: contextRuntime.createContext(),
      game: backgammonUi.createGameState(),
      teamTetris: teamTetrisUi.createTeamTetrisState(),
      teamTetrisDraft: teamTetrisUi.createTeamTetrisDraft(),
      presentation: {
        mode: "classic",
        uiScale: 100,
      },
      preferences: {
        target: "ai1",
        starter: "user",
        inviteMessage: "",
        teamTetrisHiddenPairs: true,
        teamTetrisSelectedPartnerSeatId: null,
      },
      lastCommandMessage: "",
    };

    return {
      roomId: roomId,
      featureId: featureId,
      teamTetrisFeatureId: teamTetrisFeatureId,
      contextRuntime: contextRuntime,
      scrollRuntime: scrollRuntime,
      stateRef: stateRef,
      getState: getState,
      backgammonUi: backgammonUi,
      teamTetrisUi: teamTetrisUi,
      bootstrapText: bootstrapText,
      applyPresentationMode: applyPresentationMode,
      applyLocale: applyLocale,
      getActiveFeatureId: getActiveFeatureId,
      getFeatureLabel: getFeatureLabel,
    };
  };
})(window as unknown as GameRoomUiGlobal);
