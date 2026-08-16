(function (global: GameRoomUiGlobal) {
  function getFactoryRegistry(host: GameRoomUiGlobal): GameRoomUiFactoriesRegistry {
    return host.GameRoomUiFactories || (host.GameRoomUiFactories = {});
  }

  function readSlotRecord(value: unknown): GameRoomSlotRecord | null {
    return value && typeof value === "object" && Array.isArray(value) === false
      ? (value as GameRoomSlotRecord)
      : null;
  }

  function readNicknameRecord(value: unknown): { nickname?: string } | null {
    return value && typeof value === "object" && Array.isArray(value) === false ? value : null;
  }

  const registry = getFactoryRegistry(global);

  registry.createTeamTetrisUiStateViewRuntime = function createTeamTetrisUiStateViewRuntime(
    deps: GameRoomTeamTetrisUiStateViewRuntimeDeps
  ): GameRoomTeamTetrisUiStateViewRuntime {
    const getState = deps.getState;
    const text = deps.text;
    const createTeamTetrisBoard = deps.createTeamTetrisBoard;

    function getTeamTetrisLocalSeatId(): string {
      const localSeatId = getState().teamTetris.userView?.seat.seatId;
      return typeof localSeatId === "string" && localSeatId.trim() !== "" ? localSeatId : "user";
    }

    function readCreatorPartnerSeatId(): string | null {
      const teams = getState().teamTetris.teams;
      if (!Array.isArray(teams)) {
        return null;
      }

      const creatorTeam =
        teams.find(function (team: GameRoomTeamTetrisTeamRecord) {
          return Array.isArray(team.seatIds) && team.seatIds.includes("user");
        }) || null;
      if (!creatorTeam || !Array.isArray(creatorTeam.seatIds)) {
        return null;
      }

      return (
        creatorTeam.seatIds.find(function (seatId: string) {
          return seatId !== "user";
        }) || null
      );
    }

    function syncTeamTetrisPreferencesFromState(): void {
      const state = getState();
      state.preferences.teamTetrisHiddenPairs = state.teamTetris.hiddenPairs !== false;
      state.preferences.teamTetrisSelectedPartnerSeatId =
        state.teamTetris.hiddenPairs === false ? readCreatorPartnerSeatId() : null;
    }

    function getTeamTetrisView(): GameRoomTeamTetrisSeatView | null {
      return getState().teamTetris.userView;
    }

    function getTeamTetrisBoardLabel(teamId: string): string {
      return teamId === "team-b"
        ? text(["teamTetris", "boards", "teamB"])
        : text(["teamTetris", "boards", "teamA"]);
    }

    function getTeamTetrisSeatDisplayLabel(seatId: string): string {
      const state = getState();
      const localSeatId = getTeamTetrisLocalSeatId();
      if (seatId === localSeatId) {
        return text(["teamTetris", "turns", "you"]);
      }
      if (seatId === "user") {
        if (localSeatId === "us1") {
          const mirroredUser = readSlotRecord(state.context.slots?.["us1"] ?? null);
          if (mirroredUser?.nickname && mirroredUser.nickname.trim() !== "") {
            return mirroredUser.nickname;
          }
        }
        const localUser = readNicknameRecord(state.context["user"]);
        return localUser?.nickname && localUser.nickname.trim() !== ""
          ? localUser.nickname.trim()
          : "USER";
      }

      const slot = readSlotRecord(state.context.slots?.[seatId] ?? null);
      if (slot?.nickname && slot.nickname.trim() !== "") {
        return slot.nickname;
      }

      return seatId.trim() !== "" ? seatId.toUpperCase() : "???";
    }

    function getTeamTetrisPlayerDisplay(seatId: string): GameRoomTeamTetrisPlayerDisplay {
      const state = getState();
      const label = getTeamTetrisSeatDisplayLabel(seatId);
      const localSeatId = getTeamTetrisLocalSeatId();

      if (state.teamTetris.hiddenPairs === true) {
        const view = getTeamTetrisView();
        if (view && view.revealedPairs !== true && seatId !== localSeatId) {
          return {
            avatarUrl: null,
            label: text(["teamTetris", "roster", "partnerUnknown"]),
            isAnonymous: true,
          };
        }
      }

      let avatarUrl: string | null = null;
      if (seatId === "user" || seatId === localSeatId) {
        const userCtx = state.context["user"] as { avatar?: string } | null;
        if (userCtx && typeof userCtx.avatar === "string" && userCtx.avatar.trim() !== "") {
          avatarUrl = userCtx.avatar;
        }
      } else {
        const slot = readSlotRecord(state.context.slots?.[seatId] ?? null);
        if (slot && typeof (slot as unknown as { avatar?: string }).avatar === "string") {
          avatarUrl = (slot as unknown as { avatar: string }).avatar || null;
        }
      }

      return { avatarUrl: avatarUrl, label: label, isAnonymous: false };
    }

    function getTeamTetrisAnonymousSeatLabel(role: string): string {
      return role === "followup"
        ? text(["teamTetris", "roster", "partnerFollowup"])
        : text(["teamTetris", "roster", "partnerOpener"]);
    }

    function getTeamTetrisPlacedByLabel(
      pieceSnapshot: GameRoomTeamTetrisPieceSnapshot | null | undefined
    ): string {
      if (!pieceSnapshot) {
        return text(["teamTetris", "boards", "noPartnerPiece"]);
      }
      if (pieceSnapshot.placedBySeatId) {
        return getTeamTetrisSeatDisplayLabel(pieceSnapshot.placedBySeatId);
      }
      if (pieceSnapshot.placedByRole) {
        return getTeamTetrisAnonymousSeatLabel(pieceSnapshot.placedByRole);
      }
      if (pieceSnapshot.placedBy) {
        return pieceSnapshot.placedBy;
      }
      return text(["teamTetris", "roster", "partnerUnknown"]);
    }

    function getTeamTetrisPendingTurn(): GameRoomTeamTetrisPendingTurn | null {
      const view = getTeamTetrisView();
      return view ? view.pendingTurn : null;
    }

    function getTeamTetrisOwnBoardState(): GameRoomTeamTetrisBoardViewState {
      const state = getState();
      const view = getTeamTetrisView();
      const board = state.teamTetris.boards[0] || createTeamTetrisBoard("team-a", "private");

      if (!view) {
        return {
          teamId: board.teamId,
          label: getTeamTetrisBoardLabel(board.teamId),
          visibility: board.visibility,
          rows: board.rows.slice(),
          boardBeforePartnerPieceRows: board.boardBeforePartnerPieceRows.slice(),
          partnerLastPiece: board.partnerLastPiece,
        };
      }

      return {
        teamId: view.ownTeam.teamId,
        label: getTeamTetrisBoardLabel(view.ownTeam.teamId),
        visibility: "private",
        rows: view.ownTeam.boardRows.slice(),
        boardBeforePartnerPieceRows: view.ownTeam.boardBeforePartnerPieceRows.slice(),
        partnerLastPiece: view.ownTeam.partnerLastPiece,
      };
    }

    function getTeamTetrisOpponentBoardState(): GameRoomTeamTetrisBoardViewState {
      const state = getState();
      const view = getTeamTetrisView();
      const board = state.teamTetris.boards[1] || createTeamTetrisBoard("team-b", "public");

      if (!view) {
        return {
          teamId: board.teamId,
          label: getTeamTetrisBoardLabel(board.teamId),
          visibility: board.visibility,
          rows: board.rows.slice(),
          boardBeforePartnerPieceRows: board.boardBeforePartnerPieceRows.slice(),
          partnerLastPiece: board.partnerLastPiece,
        };
      }

      return {
        teamId: view.opponentTeam.teamId,
        label: getTeamTetrisBoardLabel(view.opponentTeam.teamId),
        visibility: "public",
        rows: view.opponentTeam.boardRows.slice(),
        boardBeforePartnerPieceRows: board.boardBeforePartnerPieceRows.slice(),
        partnerLastPiece: null,
      };
    }

    function getTeamTetrisPartnerRoleLabel(): string {
      const view = getTeamTetrisView();
      if (!view) {
        return text(["teamTetris", "roster", "partnerUnknown"]);
      }

      if (view.teams) {
        const team =
          view.teams.find(function (entry: GameRoomTeamTetrisTeamRecord) {
            return entry.teamId === view.seat.teamId;
          }) || null;
        if (team) {
          const partnerSeatId =
            team.seatIds.find(function (entry: string) {
              return entry !== view.seat.seatId;
            }) || null;
          if (partnerSeatId) {
            return getTeamTetrisSeatDisplayLabel(partnerSeatId);
          }
        }
      }

      return getTeamTetrisAnonymousSeatLabel(view.seat.role === "opener" ? "followup" : "opener");
    }

    function getTeamTetrisTurnLabel(): string {
      const state = getState();
      const currentTurn = state.teamTetris.currentTurn;
      const view = getTeamTetrisView();

      if (!currentTurn) {
        return text(["teamTetris", "turns", "idle"]);
      }
      if (view && currentTurn.seatId === view.seat.seatId) {
        return text(["teamTetris", "turns", "you"]);
      }
      if (view && currentTurn.teamId === view.seat.teamId) {
        return getTeamTetrisPartnerRoleLabel();
      }
      return text(["teamTetris", "turns", "opponent"]);
    }

    function getTeamTetrisResultLabel(): string {
      const state = getState();
      return text(["teamTetris", "results", state.teamTetris.result]);
    }

    function getTeamTetrisDraftStatusText(): string {
      const state = getState();
      const pendingTurn = getTeamTetrisPendingTurn();

      if (!pendingTurn) {
        return text(["teamTetris", "controls", "awaitingTurn"]);
      }
      if (
        state.teamTetrisDraft.preview &&
        state.teamTetrisDraft.preview.success === true &&
        state.teamTetrisDraft.preview.pathComplete === true
      ) {
        return text(["teamTetris", "controls", "pathReady"]);
      }
      if (state.teamTetrisDraft.errorKey) {
        return text(["teamTetris", "validation", state.teamTetrisDraft.errorKey]);
      }
      return text(["teamTetris", "controls", "pathHint"]);
    }

    function getTeamTetrisStatusText(): string {
      const state = getState();
      const currentTurn = state.teamTetris.currentTurn;
      const view = getTeamTetrisView();

      if (state.teamTetris.result === "blocked") {
        return (
          state.lastCommandMessage ||
          state.teamTetris.status ||
          text(["teamTetris", "status", "blocked"])
        );
      }
      if (
        state.teamTetris.result === "team-a-win" ||
        state.teamTetris.result === "team-b-win" ||
        state.teamTetris.result === "draw"
      ) {
        return text(["teamTetris", "status", state.teamTetris.result]);
      }
      if (currentTurn && view) {
        if (currentTurn.seatId === view.seat.seatId) {
          return text(["teamTetris", "status", "yourTurn"]);
        }
        if (currentTurn.teamId === view.seat.teamId) {
          return text([
            "teamTetris",
            "status",
            state.teamTetris.hiddenPairs === true && view.revealedPairs !== true
              ? "partnerTurnHidden"
              : "partnerTurn",
          ]);
        }
        return text(["teamTetris", "status", "opponentTurn"]);
      }
      if (state.lastCommandMessage && state.lastCommandMessage.trim() !== "") {
        return state.lastCommandMessage.trim();
      }
      if (state.teamTetris.status && state.teamTetris.status.trim() !== "") {
        return state.teamTetris.status.trim();
      }
      return text(["teamTetris", "status", "idle"]);
    }

    return {
      syncTeamTetrisPreferencesFromState: syncTeamTetrisPreferencesFromState,
      getTeamTetrisView: getTeamTetrisView,
      getTeamTetrisBoardLabel: getTeamTetrisBoardLabel,
      getTeamTetrisSeatDisplayLabel: getTeamTetrisSeatDisplayLabel,
      getTeamTetrisPlayerDisplay: getTeamTetrisPlayerDisplay,
      getTeamTetrisPendingTurn: getTeamTetrisPendingTurn,
      getTeamTetrisOwnBoardState: getTeamTetrisOwnBoardState,
      getTeamTetrisOpponentBoardState: getTeamTetrisOpponentBoardState,
      getTeamTetrisPlacedByLabel: getTeamTetrisPlacedByLabel,
      getTeamTetrisPartnerRoleLabel: getTeamTetrisPartnerRoleLabel,
      getTeamTetrisTurnLabel: getTeamTetrisTurnLabel,
      getTeamTetrisResultLabel: getTeamTetrisResultLabel,
      getTeamTetrisDraftStatusText: getTeamTetrisDraftStatusText,
      getTeamTetrisStatusText: getTeamTetrisStatusText,
    };
  };
})((typeof window !== "undefined" ? window : globalThis) as unknown as GameRoomUiGlobal);
