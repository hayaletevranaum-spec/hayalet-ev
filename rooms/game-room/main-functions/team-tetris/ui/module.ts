(function (global: GameRoomUiGlobal) {
  function getFactoryRegistry(host: GameRoomUiGlobal): GameRoomUiFactoriesRegistry {
    return host.GameRoomUiFactories || (host.GameRoomUiFactories = {});
  }

  const registry = getFactoryRegistry(global);

  registry.createTeamTetrisUiModule = function createTeamTetrisUiModule(
    deps: GameRoomTeamTetrisUiModuleDeps
  ): GameRoomTeamTetrisUiModule {
    const featureId = deps.featureId || "team-tetris";
    const createTeamTetrisUiStateRuntime = registry.createTeamTetrisUiStateRuntime;
    const createTeamTetrisUiModuleCardRuntime = registry.createTeamTetrisUiModuleCardRuntime;
    const createTeamTetrisUiModuleShellRuntime = registry.createTeamTetrisUiModuleShellRuntime;

    if (typeof createTeamTetrisUiStateRuntime !== "function") {
      throw new Error("Team Tetris UI state runtime is not registered.");
    }
    if (typeof createTeamTetrisUiModuleCardRuntime !== "function") {
      throw new Error("Team Tetris UI module card runtime is not registered.");
    }
    if (typeof createTeamTetrisUiModuleShellRuntime !== "function") {
      throw new Error("Team Tetris UI module shell runtime is not registered.");
    }

    const stateRuntime = createTeamTetrisUiStateRuntime({
      getState: deps.getState,
      render: deps.render,
      sendRoomCommand: deps.sendRoomCommand,
      text: deps.text,
    });
    const moduleCardRuntime = createTeamTetrisUiModuleCardRuntime({
      getState: deps.getState,
      createSlot: deps.createSlot,
      createElement: deps.createElement,
      text: deps.text,
      getTeamTetrisRotationCells: stateRuntime.getTeamTetrisRotationCells,
      getTeamTetrisPieceBounds: stateRuntime.getTeamTetrisPieceBounds,
      sanitizeTeamTetrisRows: stateRuntime.sanitizeTeamTetrisRows,
      startTeamTetrisDrag: stateRuntime.startTeamTetrisDrag,
      updateTeamTetrisDraftTarget: stateRuntime.updateTeamTetrisDraftTarget,
      finishTeamTetrisDrag: stateRuntime.finishTeamTetrisDrag,
      onTeamTetrisBoardColumnSelect: stateRuntime.onTeamTetrisBoardColumnSelect,
      onTeamTetrisBendRowSelect: stateRuntime.onTeamTetrisBendRowSelect,
    });
    const moduleShellRuntime = createTeamTetrisUiModuleShellRuntime({
      getState: deps.getState,
      featureId: featureId,
      createElement: deps.createElement,
      text: deps.text,
      render: deps.render,
      getFeatureLabel: deps.getFeatureLabel,
      createTeamTetrisMetric: moduleCardRuntime.createTeamTetrisMetric,
      createTeamTetrisPieceCard: moduleCardRuntime.createTeamTetrisPieceCard,
      createTeamTetrisRequirementCard: moduleCardRuntime.createTeamTetrisRequirementCard,
      createTeamTetrisSnapshotCard: moduleCardRuntime.createTeamTetrisSnapshotCard,
      renderTeamTetrisBoardCard: moduleCardRuntime.renderTeamTetrisBoardCard,
      getTeamTetrisView: stateRuntime.getTeamTetrisView,
      getTeamTetrisBoardLabel: stateRuntime.getTeamTetrisBoardLabel,
      getTeamTetrisSeatDisplayLabel: stateRuntime.getTeamTetrisSeatDisplayLabel,
      getTeamTetrisPendingTurn: stateRuntime.getTeamTetrisPendingTurn,
      getTeamTetrisOwnBoardState: stateRuntime.getTeamTetrisOwnBoardState,
      getTeamTetrisOpponentBoardState: stateRuntime.getTeamTetrisOpponentBoardState,
      getTeamTetrisPlacedByLabel: stateRuntime.getTeamTetrisPlacedByLabel,
      getTeamTetrisPartnerRoleLabel: stateRuntime.getTeamTetrisPartnerRoleLabel,
      getTeamTetrisTurnLabel: stateRuntime.getTeamTetrisTurnLabel,
      getTeamTetrisResultLabel: stateRuntime.getTeamTetrisResultLabel,
      getTeamTetrisDraftStatusText: stateRuntime.getTeamTetrisDraftStatusText,
      getTeamTetrisStatusText: stateRuntime.getTeamTetrisStatusText,
      onTeamTetrisRotationSelect: stateRuntime.onTeamTetrisRotationSelect,
      onTeamTetrisRotate: stateRuntime.onTeamTetrisRotate,
      onTeamTetrisRotateCcw: stateRuntime.onTeamTetrisRotateCcw,
      onTeamTetrisClearDraft: stateRuntime.onTeamTetrisClearDraft,
      onTeamTetrisSubmit: stateRuntime.onTeamTetrisSubmit,
      onTeamTetrisMoveLeft: stateRuntime.onTeamTetrisMoveLeft,
      onTeamTetrisMoveRight: stateRuntime.onTeamTetrisMoveRight,
      onTeamTetrisConfirmPosition: stateRuntime.onTeamTetrisConfirmPosition,
      onTeamTetrisBackToPosition: stateRuntime.onTeamTetrisBackToPosition,
      onTeamTetrisRouteModeSelect: stateRuntime.onTeamTetrisRouteModeSelect,
      onTeamTetrisBendRowSelect: stateRuntime.onTeamTetrisBendRowSelect,
      onTeamTetrisStart: stateRuntime.onTeamTetrisStart,
      onTeamTetrisReset: stateRuntime.onTeamTetrisReset,
      getTeamTetrisPlayerDisplay: stateRuntime.getTeamTetrisPlayerDisplay,
      compileStageToRowShifts: stateRuntime.compileStageToRowShifts,
    });

    function getTestBridge(): GameRoomTeamTetrisUiTestBridge {
      return {
        replayDraft: stateRuntime.replayTeamTetrisDraft,
        buildRowShiftsFromTargets: stateRuntime.buildTeamTetrisRowShiftsFromTargets,
        getOriginFromCell: stateRuntime.getTeamTetrisOriginFromCell,
        getSpawnPosition: stateRuntime.getTeamTetrisSpawnPosition,
      };
    }

    return {
      createTeamTetrisDraft: stateRuntime.createTeamTetrisDraft,
      createTeamTetrisState: stateRuntime.createTeamTetrisState,
      sanitizeTeamTetrisState: stateRuntime.sanitizeTeamTetrisState,
      syncTeamTetrisPreferencesFromState: stateRuntime.syncTeamTetrisPreferencesFromState,
      syncTeamTetrisDraftFromState: stateRuntime.syncTeamTetrisDraftFromState,
      renderTeamTetris: moduleShellRuntime.renderTeamTetris,
      getTestBridge: getTestBridge,
    };
  };
})((typeof window !== "undefined" ? window : globalThis) as unknown as GameRoomUiGlobal);
