(function bootstrapGameRoomUi(global: GameRoomUiGlobal) {
  const runtimeFactories = global.GameRoomUiRuntime || {};
  const createGameRoomUiRuntime = runtimeFactories.createGameRoomUiRuntime;
  if (typeof createGameRoomUiRuntime !== "function") {
    throw new Error("Game Room UI runtime is unavailable.");
  }

  createGameRoomUiRuntime().start();
})(window as unknown as GameRoomUiGlobal);
