(function (global: GameRoomUiGlobal) {
  function getFactoryRegistry(host: GameRoomUiGlobal): GameRoomUiFactoriesRegistry {
    return host.GameRoomUiFactories || (host.GameRoomUiFactories = {});
  }

  const registry = getFactoryRegistry(global);

  registry.createTeamTetrisUiStateRuntime = function createTeamTetrisUiStateRuntime(
    deps: GameRoomTeamTetrisUiStateRuntimeDeps
  ): GameRoomTeamTetrisUiStateRuntime {
    const createTeamTetrisUiStateShapeRuntime = registry.createTeamTetrisUiStateShapeRuntime;
    const createTeamTetrisUiStateViewRuntime = registry.createTeamTetrisUiStateViewRuntime;
    const createTeamTetrisUiDraftRuntime = registry.createTeamTetrisUiDraftRuntime;

    if (typeof createTeamTetrisUiStateShapeRuntime !== "function") {
      throw new Error("Team Tetris UI state shape runtime is not registered.");
    }
    if (typeof createTeamTetrisUiStateViewRuntime !== "function") {
      throw new Error("Team Tetris UI state view runtime is not registered.");
    }
    if (typeof createTeamTetrisUiDraftRuntime !== "function") {
      throw new Error("Team Tetris UI draft runtime is not registered.");
    }

    const getState = deps.getState;
    const sendRoomCommand = deps.sendRoomCommand;

    function readSelectedPartnerSeatId(): string | null {
      const selectedPartnerSeatId = getState().preferences.teamTetrisSelectedPartnerSeatId;
      return selectedPartnerSeatId === "ai1" ||
        selectedPartnerSeatId === "ai2" ||
        selectedPartnerSeatId === "us1"
        ? selectedPartnerSeatId
        : null;
    }

    const stateShapeRuntime = createTeamTetrisUiStateShapeRuntime();
    const stateViewRuntime = createTeamTetrisUiStateViewRuntime({
      getState: deps.getState,
      text: deps.text,
      createTeamTetrisBoard: stateShapeRuntime.createTeamTetrisBoard,
    });
    const draftRuntime = createTeamTetrisUiDraftRuntime({
      createTeamTetrisDraft: stateShapeRuntime.createTeamTetrisDraft,
      getState: deps.getState,
      render: deps.render,
      sendRoomCommand: deps.sendRoomCommand,
      sanitizeTeamTetrisRows: stateShapeRuntime.sanitizeTeamTetrisRows,
      getTeamTetrisOwnBoardState: stateViewRuntime.getTeamTetrisOwnBoardState,
      getTeamTetrisPendingTurn: stateViewRuntime.getTeamTetrisPendingTurn,
    });

    function onTeamTetrisStart(): void {
      const state = getState();
      state.lastCommandMessage = "";
      const hiddenPairs = state.preferences.teamTetrisHiddenPairs !== false;
      sendRoomCommand("GameRoomTeamTetrisStart", {
        hiddenPairs: hiddenPairs,
        ...(hiddenPairs !== true && readSelectedPartnerSeatId()
          ? { selectedPartnerSeatId: readSelectedPartnerSeatId() }
          : {}),
      });
    }

    function onTeamTetrisReset(): void {
      const state = getState();
      state.lastCommandMessage = "";
      sendRoomCommand("GameRoomTeamTetrisReset", {});
    }

    return {
      createTeamTetrisBoard: stateShapeRuntime.createTeamTetrisBoard,
      createTeamTetrisDraft: stateShapeRuntime.createTeamTetrisDraft,
      createTeamTetrisState: stateShapeRuntime.createTeamTetrisState,
      sanitizeTeamTetrisRows: stateShapeRuntime.sanitizeTeamTetrisRows,
      sanitizeTeamTetrisState: stateShapeRuntime.sanitizeTeamTetrisState,
      syncTeamTetrisPreferencesFromState: stateViewRuntime.syncTeamTetrisPreferencesFromState,
      getTeamTetrisView: stateViewRuntime.getTeamTetrisView,
      getTeamTetrisBoardLabel: stateViewRuntime.getTeamTetrisBoardLabel,
      getTeamTetrisSeatDisplayLabel: stateViewRuntime.getTeamTetrisSeatDisplayLabel,
      getTeamTetrisPlayerDisplay: stateViewRuntime.getTeamTetrisPlayerDisplay,
      getTeamTetrisPendingTurn: stateViewRuntime.getTeamTetrisPendingTurn,
      getTeamTetrisOwnBoardState: stateViewRuntime.getTeamTetrisOwnBoardState,
      getTeamTetrisOpponentBoardState: stateViewRuntime.getTeamTetrisOpponentBoardState,
      getTeamTetrisPlacedByLabel: stateViewRuntime.getTeamTetrisPlacedByLabel,
      getTeamTetrisPartnerRoleLabel: stateViewRuntime.getTeamTetrisPartnerRoleLabel,
      getTeamTetrisTurnLabel: stateViewRuntime.getTeamTetrisTurnLabel,
      getTeamTetrisResultLabel: stateViewRuntime.getTeamTetrisResultLabel,
      getTeamTetrisDraftStatusText: stateViewRuntime.getTeamTetrisDraftStatusText,
      getTeamTetrisStatusText: stateViewRuntime.getTeamTetrisStatusText,
      getTeamTetrisRotationCells: draftRuntime.getTeamTetrisRotationCells,
      getTeamTetrisPieceBounds: draftRuntime.getTeamTetrisPieceBounds,
      getTeamTetrisSpawnPosition: draftRuntime.getTeamTetrisSpawnPosition,
      replayTeamTetrisDraft: draftRuntime.replayTeamTetrisDraft,
      compileStageToRowShifts: draftRuntime.compileStageToRowShifts,
      buildTeamTetrisRowShiftsFromTargets: draftRuntime.buildTeamTetrisRowShiftsFromTargets,
      getTeamTetrisOriginFromCell: draftRuntime.getTeamTetrisOriginFromCell,
      syncTeamTetrisDraftFromState: draftRuntime.syncTeamTetrisDraftFromState,
      startTeamTetrisDrag: draftRuntime.startTeamTetrisDrag,
      updateTeamTetrisDraftTarget: draftRuntime.updateTeamTetrisDraftTarget,
      finishTeamTetrisDrag: draftRuntime.finishTeamTetrisDrag,
      onTeamTetrisRotationSelect: draftRuntime.onTeamTetrisRotationSelect,
      onTeamTetrisRotate: draftRuntime.onTeamTetrisRotate,
      onTeamTetrisRotateCcw: draftRuntime.onTeamTetrisRotateCcw,
      onTeamTetrisClearDraft: draftRuntime.onTeamTetrisClearDraft,
      onTeamTetrisSubmit: draftRuntime.onTeamTetrisSubmit,
      onTeamTetrisMoveLeft: draftRuntime.onTeamTetrisMoveLeft,
      onTeamTetrisMoveRight: draftRuntime.onTeamTetrisMoveRight,
      onTeamTetrisConfirmPosition: draftRuntime.onTeamTetrisConfirmPosition,
      onTeamTetrisBackToPosition: draftRuntime.onTeamTetrisBackToPosition,
      onTeamTetrisRouteModeSelect: draftRuntime.onTeamTetrisRouteModeSelect,
      onTeamTetrisBoardColumnSelect: draftRuntime.onTeamTetrisBoardColumnSelect,
      onTeamTetrisBendRowSelect: draftRuntime.onTeamTetrisBendRowSelect,
      onTeamTetrisStart: onTeamTetrisStart,
      onTeamTetrisReset: onTeamTetrisReset,
    };
  };
})((typeof window !== "undefined" ? window : globalThis) as unknown as GameRoomUiGlobal);
