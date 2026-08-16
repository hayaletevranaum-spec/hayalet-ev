(function (
  global: typeof globalThis & {
    GameRoomUiFactories?: GameRoomUiFactoriesRegistry;
  }
) {
  type BackgammonUiStateRuntime = {
    createGameState: () => unknown;
    sanitizeGameState: (candidate: unknown) => unknown;
    syncPreferencesFromGame: () => void;
  };
  type BackgammonUiRenderRuntime = {
    renderBootstrap: (root: HTMLElement) => void;
    renderBackgammon: (root: HTMLElement) => void;
  };
  type BackgammonUiModuleRegistry = GameRoomUiFactoriesRegistry & {
    createBackgammonUiStateRuntime: (
      deps: GameRoomBackgammonUiModuleDeps
    ) => BackgammonUiStateRuntime;
    createBackgammonUiRenderRuntime: (
      deps: GameRoomBackgammonUiModuleDeps & {
        stateRuntime: BackgammonUiStateRuntime;
      }
    ) => BackgammonUiRenderRuntime;
    createBackgammonUiModule?: (deps: GameRoomBackgammonUiModuleDeps) => GameRoomBackgammonUiModule;
  };

  const registry = (global.GameRoomUiFactories ||
    (global.GameRoomUiFactories = {} as GameRoomUiFactoriesRegistry)) as BackgammonUiModuleRegistry;

  registry.createBackgammonUiModule = function createBackgammonUiModule(
    deps: GameRoomBackgammonUiModuleDeps
  ) {
    const stateRuntime = registry.createBackgammonUiStateRuntime(deps);
    const renderRuntime = registry.createBackgammonUiRenderRuntime({
      ...deps,
      stateRuntime,
    });

    return {
      createGameState: stateRuntime.createGameState,
      sanitizeGameState: stateRuntime.sanitizeGameState,
      syncPreferencesFromGame: stateRuntime.syncPreferencesFromGame,
      renderBootstrap: renderRuntime.renderBootstrap,
      renderBackgammon: renderRuntime.renderBackgammon,
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
