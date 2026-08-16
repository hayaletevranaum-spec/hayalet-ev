(function (global: GameRoomUiGlobal) {
  type TeamTetrisCellInputRecord = {
    x?: unknown;
    y?: unknown;
  };

  type TeamTetrisTeamRecordInput = {
    seatIds?: unknown;
    teamId?: unknown;
  };

  type TeamTetrisPieceSnapshotInputRecord = {
    cells?: unknown;
    pieceId?: unknown;
    placedBy?: unknown;
    placedByRole?: unknown;
    placedBySeatId?: unknown;
    rotation?: unknown;
  };

  type TeamTetrisBoardStateInputRecord = {
    boardBeforePartnerPieceRows?: unknown;
    partnerLastPiece?: unknown;
    rows?: unknown;
    teamId?: unknown;
    visibility?: unknown;
  };

  type TeamTetrisPendingTurnInputRecord = {
    actingRole?: unknown;
    legalRotations?: unknown;
    pieceId?: unknown;
    turnIndex?: unknown;
    turnToken?: unknown;
  };

  type TeamTetrisTurnStateInputRecord = {
    legalRotations?: unknown;
    pieceId?: unknown;
    role?: unknown;
    seatId?: unknown;
    teamId?: unknown;
    turnIndex?: unknown;
    turnToken?: unknown;
  };

  type TeamTetrisSeatIdentityInputRecord = {
    role?: unknown;
    seatId?: unknown;
    teamId?: unknown;
  };

  type TeamTetrisSeatTeamViewInputRecord = {
    boardBeforePartnerPieceRows?: unknown;
    boardRows?: unknown;
    partnerLastPiece?: unknown;
    teamId?: unknown;
  };

  type TeamTetrisSeatViewInputRecord = {
    hiddenPairs?: unknown;
    matchId?: unknown;
    opponentTeam?: unknown;
    ownTeam?: unknown;
    pendingTurn?: unknown;
    result?: unknown;
    revealedPairs?: unknown;
    schemaVersion?: unknown;
    seat?: unknown;
    teams?: unknown;
    winnerTeamId?: unknown;
  };

  type TeamTetrisRequiredSlotsInputRecord = {
    ai1?: unknown;
    ai2?: unknown;
    us1?: unknown;
  };

  type TeamTetrisBoardConfigInputRecord = {
    height?: unknown;
    seedLabel?: unknown;
    width?: unknown;
  };

  type TeamTetrisStateInputRecord = {
    active?: unknown;
    blockedReason?: unknown;
    board?: unknown;
    boards?: unknown;
    canStart?: unknown;
    currentTurn?: unknown;
    hiddenPairs?: unknown;
    matchId?: unknown;
    requiredSlots?: unknown;
    result?: unknown;
    revealPairsOnFinish?: unknown;
    status?: unknown;
    teams?: unknown;
    turnLoop?: unknown;
    userView?: unknown;
  };

  function getFactoryRegistry(host: GameRoomUiGlobal): GameRoomUiFactoriesRegistry {
    return host.GameRoomUiFactories || (host.GameRoomUiFactories = {});
  }

  function isRecord(value: unknown): value is GameRoomUnknownRecord {
    return typeof value === "object" && value !== null && Array.isArray(value) === false;
  }

  function readTrimmedString(value: unknown, fallback = ""): string {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
  }

  function readInteger(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isInteger(value) ? value : fallback;
  }

  const registry = getFactoryRegistry(global);

  registry.createTeamTetrisUiStateShapeRuntime =
    function createTeamTetrisUiStateShapeRuntime(): GameRoomTeamTetrisUiStateShapeRuntime {
      const BOARD_WIDTH = 10;
      const BOARD_HEIGHT = 20;

      function createEmptyRows(): string[] {
        return Array.from({ length: BOARD_HEIGHT }, function () {
          return ".".repeat(BOARD_WIDTH);
        });
      }

      function createTeamTetrisBoard(
        teamId: string,
        visibility: string
      ): GameRoomTeamTetrisBoardState {
        return {
          teamId: teamId,
          visibility: visibility,
          rows: createEmptyRows(),
          boardBeforePartnerPieceRows: createEmptyRows(),
          partnerLastPiece: null,
        };
      }

      function createTeamTetrisDraft(): GameRoomTeamTetrisDraftState {
        return {
          matchId: "",
          turnIndex: null,
          turnToken: "",
          pieceId: "",
          rotation: 0,
          rowShifts: [],
          dragTargets: {},
          preview: null,
          errorKey: "",
          dragActive: false,
          stage: "positioning",
          stagedOriginX: -1,
          routeMode: "straight",
          bendRow: null,
          interactionMode: "positioning",
        };
      }

      function createTeamTetrisState(): GameRoomTeamTetrisState {
        return {
          active: false,
          result: "idle",
          hiddenPairs: true,
          revealPairsOnFinish: true,
          blockedReason: "",
          matchId: null,
          canStart: false,
          requiredSlots: {
            ai1: false,
            ai2: false,
            us1: false,
          },
          board: {
            width: BOARD_WIDTH,
            height: BOARD_HEIGHT,
            seedLabel: "contract-frozen",
          },
          boards: [
            createTeamTetrisBoard("team-a", "private"),
            createTeamTetrisBoard("team-b", "public"),
          ],
          turnLoop: ["team-a-opener", "team-b-opener", "team-a-followup", "team-b-followup"],
          currentTurn: null,
          teams: null,
          userView: null,
          status: "",
        };
      }

      function sanitizeTeamTetrisRows(rows: unknown): string[] {
        if (!Array.isArray(rows)) {
          return createEmptyRows();
        }

        const normalized = rows
          .filter(function (row: unknown): row is string {
            return typeof row === "string" && row.length > 0;
          })
          .map(function (row: string) {
            const nextRow = row.slice(0, BOARD_WIDTH);
            return nextRow.length >= BOARD_WIDTH
              ? nextRow
              : nextRow + ".".repeat(BOARD_WIDTH - nextRow.length);
          })
          .slice(0, BOARD_HEIGHT);

        while (normalized.length < BOARD_HEIGHT) {
          normalized.push(".".repeat(BOARD_WIDTH));
        }

        return normalized;
      }

      function sanitizeTeamTetrisCells(value: unknown): GameRoomTeamTetrisCell[] {
        if (!Array.isArray(value)) {
          return [];
        }

        return value
          .filter(function (cell: unknown): cell is { x: number; y: number } {
            const cellRecord = isRecord(cell) ? (cell as TeamTetrisCellInputRecord) : null;
            return (
              cellRecord !== null &&
              typeof cellRecord.x === "number" &&
              Number.isInteger(cellRecord.x) &&
              typeof cellRecord.y === "number" &&
              Number.isInteger(cellRecord.y)
            );
          })
          .map(function (cell: { x: number; y: number }): GameRoomTeamTetrisCell {
            return { x: cell.x, y: cell.y };
          });
      }

      function sanitizeRotationList(value: unknown): number[] {
        return Array.isArray(value)
          ? value.filter(function (entry: unknown): entry is number {
              return typeof entry === "number" && Number.isInteger(entry);
            })
          : [0];
      }

      function sanitizeTeamRecord(candidate: unknown): GameRoomTeamTetrisTeamRecord {
        const source: TeamTetrisTeamRecordInput = isRecord(candidate) ? candidate : {};
        return {
          teamId: readTrimmedString(source.teamId, "team-a"),
          seatIds: Array.isArray(source.seatIds)
            ? source.seatIds.filter(function (seatId: unknown): seatId is string {
                return typeof seatId === "string" && seatId.trim() !== "";
              })
            : [],
        };
      }

      function sanitizeTeamTetrisPieceSnapshot(
        candidate: unknown
      ): GameRoomTeamTetrisPieceSnapshot | null {
        if (!isRecord(candidate)) {
          return null;
        }
        const source = candidate as TeamTetrisPieceSnapshotInputRecord;

        return {
          pieceId: readTrimmedString(source.pieceId),
          rotation: readInteger(source.rotation, 0),
          cells: sanitizeTeamTetrisCells(source.cells),
          placedBySeatId: readTrimmedString(source.placedBySeatId),
          placedByRole: readTrimmedString(source.placedByRole),
          placedBy: readTrimmedString(source.placedBy),
        };
      }

      function sanitizeTeamTetrisBoardState(
        candidate: unknown,
        fallbackTeamId: string,
        fallbackVisibility: string
      ): GameRoomTeamTetrisBoardState {
        const source: TeamTetrisBoardStateInputRecord = isRecord(candidate) ? candidate : {};

        return {
          teamId: readTrimmedString(source.teamId, fallbackTeamId),
          visibility:
            source.visibility === "public" || source.visibility === "private"
              ? source.visibility
              : fallbackVisibility,
          rows: sanitizeTeamTetrisRows(source.rows),
          boardBeforePartnerPieceRows: sanitizeTeamTetrisRows(source.boardBeforePartnerPieceRows),
          partnerLastPiece: sanitizeTeamTetrisPieceSnapshot(source.partnerLastPiece),
        };
      }

      function sanitizePendingTurn(candidate: unknown): GameRoomTeamTetrisPendingTurn | null {
        if (!isRecord(candidate)) {
          return null;
        }
        const source = candidate as TeamTetrisPendingTurnInputRecord;

        return {
          turnIndex: readInteger(source.turnIndex, 0),
          turnToken: readTrimmedString(source.turnToken),
          pieceId: readTrimmedString(source.pieceId),
          legalRotations: sanitizeRotationList(source.legalRotations),
          actingRole: readTrimmedString(source.actingRole, "opener"),
        };
      }

      function sanitizeCurrentTurn(candidate: unknown): GameRoomTeamTetrisTurnState | null {
        if (!isRecord(candidate)) {
          return null;
        }
        const source = candidate as TeamTetrisTurnStateInputRecord;

        return {
          turnIndex: readInteger(source.turnIndex, 0),
          seatId: readTrimmedString(source.seatId),
          teamId: readTrimmedString(source.teamId),
          role: readTrimmedString(source.role),
          pieceId: readTrimmedString(source.pieceId),
          legalRotations: sanitizeRotationList(source.legalRotations),
          turnToken: readTrimmedString(source.turnToken),
        };
      }

      function sanitizeSeatView(candidate: unknown): GameRoomTeamTetrisSeatView | null {
        if (!isRecord(candidate)) {
          return null;
        }
        const source = candidate as TeamTetrisSeatViewInputRecord;

        const seatSource: TeamTetrisSeatIdentityInputRecord = isRecord(source.seat)
          ? source.seat
          : {};
        const ownTeamSource: TeamTetrisSeatTeamViewInputRecord = isRecord(source.ownTeam)
          ? source.ownTeam
          : {};
        const opponentTeamSource: TeamTetrisSeatTeamViewInputRecord = isRecord(source.opponentTeam)
          ? source.opponentTeam
          : {};

        return {
          schemaVersion: readInteger(source.schemaVersion, 1),
          matchId: readTrimmedString(source.matchId),
          seat: {
            seatId: readTrimmedString(seatSource.seatId, "user"),
            teamId: readTrimmedString(seatSource.teamId, "team-a"),
            role: readTrimmedString(seatSource.role, "opener"),
          },
          hiddenPairs: source.hiddenPairs !== false,
          revealedPairs: source.revealedPairs === true,
          result: readTrimmedString(source.result, "idle"),
          winnerTeamId:
            typeof source.winnerTeamId === "string" && source.winnerTeamId.trim() !== ""
              ? source.winnerTeamId.trim()
              : null,
          teams: Array.isArray(source.teams)
            ? source.teams
                .map(function (entry: unknown) {
                  return sanitizeTeamRecord(entry);
                })
                .slice(0, 2)
            : null,
          ownTeam: {
            teamId: readTrimmedString(ownTeamSource.teamId, "team-a"),
            boardRows: sanitizeTeamTetrisRows(ownTeamSource.boardRows),
            boardBeforePartnerPieceRows: sanitizeTeamTetrisRows(
              ownTeamSource.boardBeforePartnerPieceRows
            ),
            partnerLastPiece: sanitizeTeamTetrisPieceSnapshot(ownTeamSource.partnerLastPiece),
          },
          opponentTeam: {
            teamId: readTrimmedString(opponentTeamSource.teamId, "team-b"),
            boardRows: sanitizeTeamTetrisRows(opponentTeamSource.boardRows),
          },
          pendingTurn: sanitizePendingTurn(source.pendingTurn),
        };
      }

      function sanitizeTeamTetrisState(candidate: unknown): GameRoomTeamTetrisState {
        const source: TeamTetrisStateInputRecord = isRecord(candidate) ? candidate : {};
        const next = createTeamTetrisState();

        next.active = source.active === true;
        next.result = readTrimmedString(source.result, "idle");
        next.hiddenPairs = source.hiddenPairs !== false;
        next.revealPairsOnFinish = source.revealPairsOnFinish !== false;
        next.blockedReason = readTrimmedString(source.blockedReason);
        next.matchId =
          typeof source.matchId === "string" && source.matchId.trim() !== ""
            ? source.matchId.trim()
            : null;
        next.canStart = source.canStart === true;

        if (isRecord(source.requiredSlots)) {
          const requiredSlots = source.requiredSlots as TeamTetrisRequiredSlotsInputRecord;
          next.requiredSlots = {
            ai1: requiredSlots.ai1 === true,
            ai2: requiredSlots.ai2 === true,
            us1: requiredSlots.us1 === true,
          };
        }

        if (isRecord(source.board)) {
          const board = source.board as TeamTetrisBoardConfigInputRecord;
          next.board = {
            width:
              typeof board.width === "number" && Number.isInteger(board.width) && board.width > 0
                ? board.width
                : BOARD_WIDTH,
            height:
              typeof board.height === "number" && Number.isInteger(board.height) && board.height > 0
                ? board.height
                : BOARD_HEIGHT,
            seedLabel: readTrimmedString(board.seedLabel, "contract-frozen"),
          };
        }

        if (Array.isArray(source.boards)) {
          next.boards = source.boards
            .map(function (entry: unknown, index: number) {
              return sanitizeTeamTetrisBoardState(
                entry,
                index === 0 ? "team-a" : "team-b",
                index === 0 ? "private" : "public"
              );
            })
            .slice(0, 2);
        }

        if (Array.isArray(source.turnLoop)) {
          next.turnLoop = source.turnLoop.filter(function (entry: unknown): entry is string {
            return typeof entry === "string" && entry.trim() !== "";
          });
        }

        next.currentTurn = sanitizeCurrentTurn(source.currentTurn);
        next.teams = Array.isArray(source.teams)
          ? source.teams
              .map(function (entry: unknown) {
                return sanitizeTeamRecord(entry);
              })
              .slice(0, 2)
          : null;
        next.userView = sanitizeSeatView(source.userView);
        next.status = readTrimmedString(source.status);

        return next;
      }

      return {
        createTeamTetrisBoard: createTeamTetrisBoard,
        createTeamTetrisDraft: createTeamTetrisDraft,
        createTeamTetrisState: createTeamTetrisState,
        sanitizeTeamTetrisRows: sanitizeTeamTetrisRows,
        sanitizeTeamTetrisState: sanitizeTeamTetrisState,
      };
    };
})((typeof window !== "undefined" ? window : globalThis) as unknown as GameRoomUiGlobal);
