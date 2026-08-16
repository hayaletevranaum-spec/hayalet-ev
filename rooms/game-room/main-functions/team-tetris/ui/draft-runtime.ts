(function (global: GameRoomUiGlobal) {
  function getFactoryRegistry(host: GameRoomUiGlobal): GameRoomUiFactoriesRegistry {
    return host.GameRoomUiFactories || (host.GameRoomUiFactories = {});
  }

  const registry = getFactoryRegistry(global);

  registry.createTeamTetrisUiDraftRuntime = function createTeamTetrisUiDraftRuntime(
    deps: GameRoomTeamTetrisUiDraftRuntimeDeps
  ): GameRoomTeamTetrisUiDraftRuntime {
    const createTeamTetrisDraft = deps.createTeamTetrisDraft;
    const getState = deps.getState;
    const render = deps.render;
    const sendRoomCommand = deps.sendRoomCommand;
    const sanitizeTeamTetrisRows = deps.sanitizeTeamTetrisRows;
    const getTeamTetrisOwnBoardState = deps.getTeamTetrisOwnBoardState;
    const getTeamTetrisPendingTurn = deps.getTeamTetrisPendingTurn;

    const BOARD_WIDTH = 10;
    const BOARD_HEIGHT = 20;
    const PIECES: Record<string, GameRoomTeamTetrisRotationCell[][]> = {
      I: [
        [
          [0, 0],
          [1, 0],
          [2, 0],
          [3, 0],
        ],
        [
          [0, 0],
          [0, 1],
          [0, 2],
          [0, 3],
        ],
      ],
      O: [
        [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ],
      ],
      T: [
        [
          [1, 0],
          [0, 1],
          [1, 1],
          [2, 1],
        ],
        [
          [0, 0],
          [0, 1],
          [1, 1],
          [0, 2],
        ],
        [
          [0, 0],
          [1, 0],
          [2, 0],
          [1, 1],
        ],
        [
          [1, 0],
          [0, 1],
          [1, 1],
          [1, 2],
        ],
      ],
      S: [
        [
          [1, 0],
          [2, 0],
          [0, 1],
          [1, 1],
        ],
        [
          [0, 0],
          [0, 1],
          [1, 1],
          [1, 2],
        ],
      ],
      Z: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [2, 1],
        ],
        [
          [1, 0],
          [0, 1],
          [1, 1],
          [0, 2],
        ],
      ],
      J: [
        [
          [0, 0],
          [0, 1],
          [1, 1],
          [2, 1],
        ],
        [
          [0, 0],
          [1, 0],
          [0, 1],
          [0, 2],
        ],
        [
          [0, 0],
          [1, 0],
          [2, 0],
          [2, 1],
        ],
        [
          [1, 0],
          [1, 1],
          [0, 2],
          [1, 2],
        ],
      ],
      L: [
        [
          [2, 0],
          [0, 1],
          [1, 1],
          [2, 1],
        ],
        [
          [0, 0],
          [0, 1],
          [0, 2],
          [1, 2],
        ],
        [
          [0, 0],
          [1, 0],
          [2, 0],
          [0, 1],
        ],
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [1, 2],
        ],
      ],
    };

    function getTeamTetrisRotationCells(
      pieceId: string,
      rotation: number
    ): GameRoomTeamTetrisRotationCell[] {
      const rotations = PIECES[pieceId];
      if (!Array.isArray(rotations) || rotations.length === 0) {
        return [];
      }
      const rotationCells = rotations[rotation];
      return Array.isArray(rotationCells) ? rotationCells : rotations[0] || [];
    }

    function getTeamTetrisLegalRotations(pieceId: string): number[] {
      const rotations = PIECES[pieceId];
      return !Array.isArray(rotations) || rotations.length === 0
        ? [0]
        : rotations.map(function (_entry: GameRoomTeamTetrisRotationCell[], index: number) {
            return index;
          });
    }

    function getTeamTetrisPieceBounds(
      pieceId: string,
      rotation: number
    ): GameRoomTeamTetrisPieceBounds {
      const cells = getTeamTetrisRotationCells(pieceId, rotation);
      if (cells.length === 0) {
        return { width: 0, height: 0 };
      }

      let maxX = 0;
      let maxY = 0;
      cells.forEach(function (cell: GameRoomTeamTetrisRotationCell) {
        maxX = Math.max(maxX, cell[0]);
        maxY = Math.max(maxY, cell[1]);
      });

      return { width: maxX + 1, height: maxY + 1 };
    }

    function clampNumber(value: number, min: number, max: number): number {
      return Math.max(min, Math.min(max, value));
    }

    function getTeamTetrisSpawnPosition(pieceId: string, rotation: number): GameRoomTeamTetrisCell {
      const bounds = getTeamTetrisPieceBounds(pieceId, rotation);
      return {
        x: Math.max(0, Math.floor((BOARD_WIDTH - bounds.width) / 2)),
        y: 0,
      };
    }

    function buildTeamTetrisMatrix(rows: string[]): string[][] {
      return sanitizeTeamTetrisRows(rows).map(function (row: string) {
        return row.split("").map(function (value: string) {
          return value === "." ? "" : value;
        });
      });
    }

    function getTeamTetrisPlacedCells(
      pieceId: string,
      rotation: number,
      originX: number,
      originY: number
    ): GameRoomTeamTetrisCell[] {
      return getTeamTetrisRotationCells(pieceId, rotation).map(function (
        cell: GameRoomTeamTetrisRotationCell
      ) {
        return {
          x: originX + cell[0],
          y: originY + cell[1],
        };
      });
    }

    function doesTeamTetrisPieceCollide(
      rows: string[],
      pieceId: string,
      rotation: number,
      originX: number,
      originY: number
    ): boolean {
      const matrix = buildTeamTetrisMatrix(rows);
      const cells = getTeamTetrisPlacedCells(pieceId, rotation, originX, originY);
      if (cells.length === 0) {
        return true;
      }

      return cells.some(function (cell: GameRoomTeamTetrisCell) {
        if (cell.x < 0 || cell.x >= BOARD_WIDTH || cell.y < 0 || cell.y >= BOARD_HEIGHT) {
          return true;
        }
        const row = matrix[cell.y];
        return !row || row[cell.x] !== "";
      });
    }

    function pushUniqueTeamTetrisPathCell(
      pathCells: GameRoomTeamTetrisCell[],
      pieceId: string,
      rotation: number,
      originX: number,
      originY: number
    ): void {
      const bounds = getTeamTetrisPieceBounds(pieceId, rotation);
      const traceCell = {
        x: clampNumber(
          originX + Math.floor((Math.max(bounds.width, 1) - 1) / 2),
          0,
          BOARD_WIDTH - 1
        ),
        y: clampNumber(
          originY + Math.floor((Math.max(bounds.height, 1) - 1) / 2),
          0,
          BOARD_HEIGHT - 1
        ),
      };
      const lastCell = pathCells[pathCells.length - 1];
      if (lastCell && lastCell.x === traceCell.x && lastCell.y === traceCell.y) {
        return;
      }
      pathCells.push(traceCell);
    }

    function buildSimplifiedTeamTetrisPathCells(
      pieceId: string,
      rotation: number,
      rowShifts: number[],
      preview: GameRoomTeamTetrisDraftReplayResult
    ): GameRoomTeamTetrisCell[] {
      if (preview.success !== true) {
        return [];
      }

      const bounds = getTeamTetrisPieceBounds(pieceId, rotation);
      const spawn = getTeamTetrisSpawnPosition(pieceId, rotation);
      const centerOffsetX = Math.floor((Math.max(bounds.width, 1) - 1) / 2);
      const centerOffsetY = Math.floor((Math.max(bounds.height, 1) - 1) / 2);
      const finalCenterX = clampNumber(preview.x + centerOffsetX, 0, BOARD_WIDTH - 1);
      const finalCenterY = clampNumber(preview.y + centerOffsetY, 0, BOARD_HEIGHT - 1);
      const pathCells: GameRoomTeamTetrisCell[] = [];
      const totalHorizontalIntent = rowShifts.reduce(function (sum: number, shift: number) {
        return sum + shift;
      }, 0);
      const spawnCenterX = clampNumber(spawn.x + centerOffsetX, 0, BOARD_WIDTH - 1);
      const horizontalDirection =
        totalHorizontalIntent !== 0
          ? totalHorizontalIntent > 0
            ? 1
            : -1
          : finalCenterX === spawnCenterX
            ? 0
            : finalCenterX > spawnCenterX
              ? 1
              : -1;

      for (let rowIndex = centerOffsetY; rowIndex <= finalCenterY; rowIndex += 1) {
        pathCells.push({
          x: finalCenterX,
          y: rowIndex,
        });
      }

      if (horizontalDirection !== 0) {
        const branchX = clampNumber(finalCenterX - horizontalDirection, 0, BOARD_WIDTH - 1);
        const lastCell = pathCells[pathCells.length - 1] || null;
        if (!lastCell || lastCell.x !== branchX || lastCell.y !== finalCenterY) {
          pathCells.push({
            x: branchX,
            y: finalCenterY,
          });
        }
      }

      return pathCells;
    }

    function replayTeamTetrisDraft(
      rows: string[],
      pieceId: string,
      rotation: number,
      rowShifts: number[]
    ): GameRoomTeamTetrisDraftReplayResult {
      const legalRotations = getTeamTetrisLegalRotations(pieceId);
      if (legalRotations.indexOf(rotation) === -1) {
        return { success: false, reason: "invalidRotation" };
      }

      if (
        !Array.isArray(rowShifts) ||
        rowShifts.some(function (value: number) {
          return value !== -1 && value !== 0 && value !== 1;
        })
      ) {
        return { success: false, reason: "invalidRowShifts" };
      }

      const spawn = getTeamTetrisSpawnPosition(pieceId, rotation);
      if (doesTeamTetrisPieceCollide(rows, pieceId, rotation, spawn.x, spawn.y)) {
        return { success: false, reason: "spawnCollision" };
      }

      let x = spawn.x;
      let y = spawn.y;
      const pathCells: GameRoomTeamTetrisCell[] = [];
      pushUniqueTeamTetrisPathCell(pathCells, pieceId, rotation, x, y);

      for (let index = 0; index < rowShifts.length; index += 1) {
        const shift = rowShifts[index] ?? 0;
        if (shift !== 0) {
          if (doesTeamTetrisPieceCollide(rows, pieceId, rotation, x + shift, y)) {
            return {
              success: true,
              x: x,
              y: y,
              rotation: rotation,
              cells: getTeamTetrisPlacedCells(pieceId, rotation, x, y),
              pathCells: pathCells,
              pathComplete: false,
              autoDropDistance: 0,
              blockedReason: "horizontalCollision",
              stepIndex: index,
            };
          }
          x += shift;
        }

        if (doesTeamTetrisPieceCollide(rows, pieceId, rotation, x, y + 1)) {
          return {
            success: true,
            x: x,
            y: y,
            rotation: rotation,
            cells: getTeamTetrisPlacedCells(pieceId, rotation, x, y),
            pathCells: pathCells,
            pathComplete: false,
            autoDropDistance: 0,
            blockedReason: "downwardCollision",
            stepIndex: index,
          };
        }

        y += 1;
        pushUniqueTeamTetrisPathCell(pathCells, pieceId, rotation, x, y);
      }

      let autoDropDistance = 0;
      while (!doesTeamTetrisPieceCollide(rows, pieceId, rotation, x, y + 1)) {
        y += 1;
        autoDropDistance += 1;
        pushUniqueTeamTetrisPathCell(pathCells, pieceId, rotation, x, y);
      }

      return {
        success: true,
        x: x,
        y: y,
        rotation: rotation,
        cells: getTeamTetrisPlacedCells(pieceId, rotation, x, y),
        pathCells: pathCells,
        pathComplete: true,
        autoDropDistance: autoDropDistance,
      };
    }

    function getTeamTetrisOriginFromCell(pieceId: string, rotation: number, cellX: number): number {
      const bounds = getTeamTetrisPieceBounds(pieceId, rotation);
      const maxOrigin = Math.max(0, BOARD_WIDTH - bounds.width);
      return clampNumber(cellX - Math.floor(bounds.width / 2), 0, maxOrigin);
    }

    function compileStageToRowShifts(
      stagedOriginX: number,
      rotation: number,
      pieceId: string,
      routeMode: GameRoomTeamTetrisRouteMode,
      bendRow: number | null
    ): number[] {
      const spawn = getTeamTetrisSpawnPosition(pieceId, rotation);
      const bounds = getTeamTetrisPieceBounds(pieceId, rotation);
      if (bounds.width === 0 || bounds.height === 0) {
        return [];
      }

      const maxOriginX = Math.max(0, BOARD_WIDTH - bounds.width);
      const clampedOriginX = clampNumber(stagedOriginX, 0, maxOriginX);
      const maxSafeSteps = Math.max(0, BOARD_HEIGHT - bounds.height - spawn.y);
      const bendStart =
        routeMode !== "straight" && bendRow !== null ? clampNumber(bendRow, 0, maxSafeSteps) : null;

      const rowShifts: number[] = [];
      let currentX = spawn.x;

      while (rowShifts.length < maxSafeSteps) {
        const rowIndex = rowShifts.length;
        const desiredX =
          routeMode !== "straight" && bendStart !== null && rowIndex >= bendStart
            ? clampNumber(clampedOriginX + (routeMode === "bend-left" ? -1 : 1), 0, maxOriginX)
            : clampedOriginX;

        const shift = clampNumber(desiredX - currentX, -1, 1);
        if (shift === 0 && desiredX === currentX && (bendStart === null || rowIndex >= bendStart)) {
          break;
        }
        rowShifts.push(shift);
        currentX += shift;
      }

      return rowShifts;
    }

    function buildTeamTetrisRowShiftsFromTargets(
      pieceId: string,
      rotation: number,
      dragTargets: Record<number, number>
    ): number[] {
      const targetRows = Object.keys(dragTargets)
        .map(function (key: string) {
          return Number.parseInt(key, 10);
        })
        .filter(function (value: number) {
          return Number.isInteger(value) && value >= 0;
        });

      if (targetRows.length === 0) {
        return [];
      }

      const maxTargetRow = Math.max.apply(null, targetRows);
      const spawn = getTeamTetrisSpawnPosition(pieceId, rotation);
      const rowShifts: number[] = [];
      let desiredX = spawn.x;
      let currentX = spawn.x;

      for (let rowIndex = 1; rowIndex <= maxTargetRow; rowIndex += 1) {
        if (Object.prototype.hasOwnProperty.call(dragTargets, String(rowIndex))) {
          const nextDesiredX = dragTargets[rowIndex];
          if (typeof nextDesiredX === "number") {
            desiredX = nextDesiredX;
          }
        }
        const shift = clampNumber(desiredX - currentX, -1, 1);
        rowShifts.push(shift);
        currentX += shift;
      }

      return rowShifts;
    }

    function refreshTeamTetrisDraftPreview(): void {
      const state = getState();
      const pendingTurn = getTeamTetrisPendingTurn();

      if (!pendingTurn) {
        state.teamTetrisDraft = createTeamTetrisDraft();
        return;
      }

      const draft = state.teamTetrisDraft;

      if (draft.stage === "route" && draft.stagedOriginX >= 0) {
        const compiledShifts = compileStageToRowShifts(
          draft.stagedOriginX,
          draft.rotation,
          pendingTurn.pieceId,
          draft.routeMode,
          draft.bendRow
        );
        draft.rowShifts = compiledShifts;
      } else if (draft.stage === "positioning" && draft.stagedOriginX >= 0) {
        const compiledShifts = compileStageToRowShifts(
          draft.stagedOriginX,
          draft.rotation,
          pendingTurn.pieceId,
          "straight",
          null
        );
        draft.rowShifts = compiledShifts;
      } else if (Object.keys(draft.dragTargets).length === 0 && draft.stagedOriginX < 0) {
        draft.preview = null;
        draft.errorKey = "";
        return;
      }

      const ownBoard = getTeamTetrisOwnBoardState();
      const preview = replayTeamTetrisDraft(
        ownBoard.rows,
        pendingTurn.pieceId,
        draft.rotation,
        draft.rowShifts
      );

      draft.preview =
        preview.success === true
          ? Object.assign({}, preview, {
              pathCells: buildSimplifiedTeamTetrisPathCells(
                pendingTurn.pieceId,
                draft.rotation,
                draft.rowShifts,
                preview
              ),
            })
          : preview;
      draft.errorKey =
        preview.success === true
          ? preview.pathComplete === true
            ? ""
            : preview.blockedReason || ""
          : preview.reason;
    }

    function getInitialRotation(pendingTurn: GameRoomTeamTetrisPendingTurn): number {
      const legalRotations =
        pendingTurn.legalRotations.length > 0 ? pendingTurn.legalRotations : [0];
      return legalRotations[0] ?? 0;
    }

    function syncTeamTetrisDraftFromState(): void {
      const state = getState();
      const pendingTurn = getTeamTetrisPendingTurn();

      if (!pendingTurn) {
        state.teamTetrisDraft = createTeamTetrisDraft();
        return;
      }

      const legalRotations =
        pendingTurn.legalRotations.length > 0 ? pendingTurn.legalRotations : [0];
      const initialRotation = getInitialRotation(pendingTurn);

      if (state.teamTetrisDraft.turnToken !== pendingTurn.turnToken) {
        const nextDraft = createTeamTetrisDraft();
        nextDraft.matchId = state.teamTetris.matchId || "";
        nextDraft.turnIndex = pendingTurn.turnIndex;
        nextDraft.turnToken = pendingTurn.turnToken;
        nextDraft.pieceId = pendingTurn.pieceId;
        nextDraft.rotation = initialRotation;
        nextDraft.stage = "positioning";
        nextDraft.stagedOriginX = -1;
        nextDraft.routeMode = "straight";
        nextDraft.bendRow = null;
        nextDraft.interactionMode = "positioning";
        state.teamTetrisDraft = nextDraft;
        refreshTeamTetrisDraftPreview();
        return;
      }

      if (legalRotations.indexOf(state.teamTetrisDraft.rotation) === -1) {
        state.teamTetrisDraft.rotation = initialRotation;
        state.teamTetrisDraft.dragTargets = {};
        state.teamTetrisDraft.rowShifts = [];
        state.teamTetrisDraft.stage = "positioning";
        state.teamTetrisDraft.stagedOriginX = -1;
        state.teamTetrisDraft.routeMode = "straight";
        state.teamTetrisDraft.bendRow = null;
        state.teamTetrisDraft.interactionMode = "positioning";
      }

      refreshTeamTetrisDraftPreview();
    }

    function clearTeamTetrisDraft(): void {
      const state = getState();
      const pendingTurn = getTeamTetrisPendingTurn();

      if (!pendingTurn) {
        state.teamTetrisDraft = createTeamTetrisDraft();
        return;
      }

      state.teamTetrisDraft.dragTargets = {};
      state.teamTetrisDraft.rowShifts = [];
      state.teamTetrisDraft.preview = null;
      state.teamTetrisDraft.errorKey = "";
      state.teamTetrisDraft.dragActive = false;
      state.teamTetrisDraft.stage = "positioning";
      state.teamTetrisDraft.stagedOriginX = -1;
      state.teamTetrisDraft.routeMode = "straight";
      state.teamTetrisDraft.bendRow = null;
      state.teamTetrisDraft.interactionMode = "positioning";
    }

    function onTeamTetrisRotate(): void {
      const state = getState();
      const pendingTurn = getTeamTetrisPendingTurn();

      if (!pendingTurn) {
        return;
      }

      const legalRotations =
        pendingTurn.legalRotations.length > 0 ? pendingTurn.legalRotations : [0];
      const currentIndex = legalRotations.indexOf(state.teamTetrisDraft.rotation);
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % legalRotations.length;

      state.teamTetrisDraft.rotation = legalRotations[nextIndex] ?? 0;
      clearTeamTetrisDraft();
      refreshTeamTetrisDraftPreview();
      render();
    }

    function onTeamTetrisRotationSelect(rotation: number): void {
      const state = getState();
      const pendingTurn = getTeamTetrisPendingTurn();

      if (!pendingTurn || pendingTurn.legalRotations.indexOf(rotation) === -1) {
        return;
      }

      state.teamTetrisDraft.rotation = rotation;
      clearTeamTetrisDraft();
      refreshTeamTetrisDraftPreview();
      render();
    }

    function updateTeamTetrisDraftTarget(cellX: number, cellY: number): void {
      const state = getState();
      const pendingTurn = getTeamTetrisPendingTurn();

      if (!pendingTurn) {
        return;
      }

      const nextTargets: Record<number, number> = Object.assign(
        {},
        state.teamTetrisDraft.dragTargets
      );
      const targetRow = clampNumber(cellY, 0, BOARD_HEIGHT - 1);
      nextTargets[targetRow] = getTeamTetrisOriginFromCell(
        pendingTurn.pieceId,
        state.teamTetrisDraft.rotation,
        cellX
      );

      state.teamTetrisDraft.dragTargets = nextTargets;
      state.teamTetrisDraft.rowShifts = buildTeamTetrisRowShiftsFromTargets(
        pendingTurn.pieceId,
        state.teamTetrisDraft.rotation,
        nextTargets
      );
      refreshTeamTetrisDraftPreview();
      render();
    }

    function startTeamTetrisDrag(cellX: number, cellY: number): void {
      const state = getState();
      const pendingTurn = getTeamTetrisPendingTurn();

      if (!pendingTurn) {
        return;
      }

      state.teamTetrisDraft.dragActive = true;
      updateTeamTetrisDraftTarget(cellX, cellY);
    }

    function finishTeamTetrisDrag(): void {
      const state = getState();
      state.teamTetrisDraft.dragActive = false;
    }

    function onTeamTetrisClearDraft(): void {
      clearTeamTetrisDraft();
      render();
    }

    function onTeamTetrisRotateCcw(): void {
      const state = getState();
      const pendingTurn = getTeamTetrisPendingTurn();

      if (!pendingTurn) {
        return;
      }

      const legalRotations =
        pendingTurn.legalRotations.length > 0 ? pendingTurn.legalRotations : [0];
      const currentIndex = legalRotations.indexOf(state.teamTetrisDraft.rotation);
      const nextIndex = currentIndex <= 0 ? legalRotations.length - 1 : currentIndex - 1;

      state.teamTetrisDraft.rotation = legalRotations[nextIndex] ?? 0;
      clearTeamTetrisDraft();
      refreshTeamTetrisDraftPreview();
      render();
    }

    function onTeamTetrisMoveLeft(): void {
      const state = getState();
      const pendingTurn = getTeamTetrisPendingTurn();
      if (!pendingTurn) {
        return;
      }

      const bounds = getTeamTetrisPieceBounds(pendingTurn.pieceId, state.teamTetrisDraft.rotation);
      const spawn = getTeamTetrisSpawnPosition(pendingTurn.pieceId, state.teamTetrisDraft.rotation);
      const currentX =
        state.teamTetrisDraft.stagedOriginX >= 0 ? state.teamTetrisDraft.stagedOriginX : spawn.x;
      const maxOriginX = Math.max(0, BOARD_WIDTH - bounds.width);
      state.teamTetrisDraft.stagedOriginX = clampNumber(currentX - 1, 0, maxOriginX);
      state.teamTetrisDraft.interactionMode = "positioning";
      refreshTeamTetrisDraftPreview();
      render();
    }

    function onTeamTetrisMoveRight(): void {
      const state = getState();
      const pendingTurn = getTeamTetrisPendingTurn();
      if (!pendingTurn) {
        return;
      }

      const bounds = getTeamTetrisPieceBounds(pendingTurn.pieceId, state.teamTetrisDraft.rotation);
      const spawn = getTeamTetrisSpawnPosition(pendingTurn.pieceId, state.teamTetrisDraft.rotation);
      const currentX =
        state.teamTetrisDraft.stagedOriginX >= 0 ? state.teamTetrisDraft.stagedOriginX : spawn.x;
      const maxOriginX = Math.max(0, BOARD_WIDTH - bounds.width);
      state.teamTetrisDraft.stagedOriginX = clampNumber(currentX + 1, 0, maxOriginX);
      state.teamTetrisDraft.interactionMode = "positioning";
      refreshTeamTetrisDraftPreview();
      render();
    }

    function onTeamTetrisConfirmPosition(): void {
      const state = getState();
      const pendingTurn = getTeamTetrisPendingTurn();
      if (!pendingTurn) {
        return;
      }

      if (state.teamTetrisDraft.stagedOriginX < 0) {
        const spawn = getTeamTetrisSpawnPosition(
          pendingTurn.pieceId,
          state.teamTetrisDraft.rotation
        );
        state.teamTetrisDraft.stagedOriginX = spawn.x;
      }

      state.teamTetrisDraft.stage = "route";
      state.teamTetrisDraft.interactionMode = "route-row-picker";
      refreshTeamTetrisDraftPreview();
      render();
    }

    function onTeamTetrisBackToPosition(): void {
      const state = getState();
      state.teamTetrisDraft.stage = "positioning";
      state.teamTetrisDraft.interactionMode = "positioning";
      state.teamTetrisDraft.routeMode = "straight";
      state.teamTetrisDraft.bendRow = null;
      refreshTeamTetrisDraftPreview();
      render();
    }

    function onTeamTetrisRouteModeSelect(mode: GameRoomTeamTetrisRouteMode): void {
      const state = getState();
      state.teamTetrisDraft.routeMode = mode;
      if (mode === "straight") {
        state.teamTetrisDraft.bendRow = null;
      }
      refreshTeamTetrisDraftPreview();
      render();
    }

    function onTeamTetrisBoardColumnSelect(column: number): void {
      const state = getState();
      const pendingTurn = getTeamTetrisPendingTurn();
      if (!pendingTurn) {
        return;
      }

      const bounds = getTeamTetrisPieceBounds(pendingTurn.pieceId, state.teamTetrisDraft.rotation);
      const originX = getTeamTetrisOriginFromCell(
        pendingTurn.pieceId,
        state.teamTetrisDraft.rotation,
        column
      );
      const maxOriginX = Math.max(0, BOARD_WIDTH - bounds.width);
      state.teamTetrisDraft.stagedOriginX = clampNumber(originX, 0, maxOriginX);
      state.teamTetrisDraft.interactionMode = "positioning";
      refreshTeamTetrisDraftPreview();
      render();
    }

    function onTeamTetrisBendRowSelect(row: number): void {
      const state = getState();
      state.teamTetrisDraft.bendRow = clampNumber(row, 0, BOARD_HEIGHT - 1);
      refreshTeamTetrisDraftPreview();
      render();
    }

    function onTeamTetrisSubmit(): void {
      const state = getState();
      const pendingTurn = getTeamTetrisPendingTurn();

      if (!pendingTurn || !state.teamTetrisDraft.preview) {
        return;
      }
      if (
        state.teamTetrisDraft.preview.success !== true ||
        state.teamTetrisDraft.preview.pathComplete !== true
      ) {
        return;
      }

      state.lastCommandMessage = "";
      sendRoomCommand("GameRoomTeamTetrisUserMove", {
        schemaVersion: 1,
        matchId: state.teamTetris.matchId,
        turnIndex: pendingTurn.turnIndex,
        turnToken: pendingTurn.turnToken,
        pieceId: pendingTurn.pieceId,
        rotation: state.teamTetrisDraft.rotation,
        rowShifts: state.teamTetrisDraft.rowShifts.slice(),
      });
    }

    return {
      getTeamTetrisRotationCells: getTeamTetrisRotationCells,
      getTeamTetrisPieceBounds: getTeamTetrisPieceBounds,
      getTeamTetrisSpawnPosition: getTeamTetrisSpawnPosition,
      replayTeamTetrisDraft: replayTeamTetrisDraft,
      compileStageToRowShifts: compileStageToRowShifts,
      buildTeamTetrisRowShiftsFromTargets: buildTeamTetrisRowShiftsFromTargets,
      getTeamTetrisOriginFromCell: getTeamTetrisOriginFromCell,
      syncTeamTetrisDraftFromState: syncTeamTetrisDraftFromState,
      startTeamTetrisDrag: startTeamTetrisDrag,
      updateTeamTetrisDraftTarget: updateTeamTetrisDraftTarget,
      finishTeamTetrisDrag: finishTeamTetrisDrag,
      onTeamTetrisRotationSelect: onTeamTetrisRotationSelect,
      onTeamTetrisRotate: onTeamTetrisRotate,
      onTeamTetrisRotateCcw: onTeamTetrisRotateCcw,
      onTeamTetrisClearDraft: onTeamTetrisClearDraft,
      onTeamTetrisSubmit: onTeamTetrisSubmit,
      onTeamTetrisMoveLeft: onTeamTetrisMoveLeft,
      onTeamTetrisMoveRight: onTeamTetrisMoveRight,
      onTeamTetrisConfirmPosition: onTeamTetrisConfirmPosition,
      onTeamTetrisBackToPosition: onTeamTetrisBackToPosition,
      onTeamTetrisRouteModeSelect: onTeamTetrisRouteModeSelect,
      onTeamTetrisBoardColumnSelect: onTeamTetrisBoardColumnSelect,
      onTeamTetrisBendRowSelect: onTeamTetrisBendRowSelect,
    };
  };
})((typeof window !== "undefined" ? window : globalThis) as unknown as GameRoomUiGlobal);
