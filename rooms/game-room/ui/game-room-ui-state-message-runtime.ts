/* global window */

(function (global: GameRoomUiGlobal) {
  type UnknownRecord = GameRoomUnknownRecord;
  type BackgammonStateMessageModule = Required<
    Pick<GameRoomBackgammonUiModule, "sanitizeGameState" | "syncPreferencesFromGame">
  >;
  type TeamTetrisStateMessageModule = Required<
    Pick<
      GameRoomTeamTetrisUiModule,
      | "sanitizeTeamTetrisState"
      | "syncTeamTetrisPreferencesFromState"
      | "syncTeamTetrisDraftFromState"
    >
  >;
  type StateMessageRuntimeOptions = {
    stateRef: {
      current: GameRoomUiState | null;
    };
    backgammonUi: BackgammonStateMessageModule;
    teamTetrisUi: TeamTetrisStateMessageModule;
    render: () => void;
    scheduleRender?: () => void;
  };

  function readRecord(value: unknown): UnknownRecord | null {
    return value && typeof value === "object" && Array.isArray(value) === false
      ? (value as UnknownRecord)
      : null;
  }

  function readString(value: unknown): string | null {
    return typeof value === "string" ? value : null;
  }

  function readRuntimeOptions(value: unknown): StateMessageRuntimeOptions | null {
    return readRecord(value) ? (value as StateMessageRuntimeOptions) : null;
  }

  function getStateMessageRegistry(host: GameRoomUiGlobal): GameRoomUiStateMessageRuntimeRegistry {
    return host.GameRoomUiStateMessageRuntime || (host.GameRoomUiStateMessageRuntime = {});
  }

  const registry = getStateMessageRegistry(global);

  registry.createGameRoomUiStateMessageRuntime = function createGameRoomUiStateMessageRuntime(
    options: unknown
  ): GameRoomUiStateMessageRuntime {
    const runtimeOptions = readRuntimeOptions(options);
    if (!runtimeOptions) {
      throw new Error("Game Room UI state message runtime options are invalid.");
    }

    const stateRef = runtimeOptions.stateRef;
    const backgammonUi = runtimeOptions.backgammonUi;
    const teamTetrisUi = runtimeOptions.teamTetrisUi;
    const render = runtimeOptions.render;
    const scheduleRender =
      typeof runtimeOptions.scheduleRender === "function" ? runtimeOptions.scheduleRender : render;

    function getState(): GameRoomUiState | null {
      return stateRef.current;
    }

    function readPayload(message: unknown): UnknownRecord {
      const source = readRecord(message);
      return readRecord(source?.["payload"]) || {};
    }

    function handleBackgammonState(message: unknown): void {
      const state = getState();
      if (state === null) {
        return;
      }
      const payload = readPayload(message);
      state.game = backgammonUi.sanitizeGameState(payload["state"]);
      backgammonUi.syncPreferencesFromGame();
      state.lastCommandMessage = "";
      scheduleRender();
    }

    function handleTeamTetrisState(message: unknown): void {
      const state = getState();
      if (state === null) {
        return;
      }
      const payload = readPayload(message);
      state.teamTetris = teamTetrisUi.sanitizeTeamTetrisState(payload["state"]);
      teamTetrisUi.syncTeamTetrisPreferencesFromState();
      teamTetrisUi.syncTeamTetrisDraftFromState();
      state.lastCommandMessage = "";
      render();
    }

    function handleCommandResult(message: unknown): void {
      const state = getState();
      if (state === null) {
        return;
      }
      const source = readRecord(message);
      const result = readRecord(source?.["result"]) || {};
      if (typeof result["message"] === "string" && result["message"].trim() !== "") {
        state.lastCommandMessage = result["message"].trim();
      }
      const command = readString(source?.["command"]);
      if (command?.startsWith("GameRoomBackgammon") === true) {
        scheduleRender();
        return;
      }
      render();
    }

    return {
      handleBackgammonState: handleBackgammonState,
      handleTeamTetrisState: handleTeamTetrisState,
      handleCommandResult: handleCommandResult,
    };
  };
})(window as unknown as GameRoomUiGlobal);
