(function (global: GameRoomUiGlobal) {
  function getFactoryRegistry(host: GameRoomUiGlobal): GameRoomUiFactoriesRegistry {
    return host.GameRoomUiFactories || (host.GameRoomUiFactories = {});
  }

  const registry = getFactoryRegistry(global);

  registry.createTeamTetrisUiModuleShellRuntime = function createTeamTetrisUiModuleShellRuntime(
    deps: GameRoomTeamTetrisUiModuleShellRuntimeDeps
  ): GameRoomTeamTetrisUiModuleShellRuntime {
    const getState = deps.getState;
    const featureId = deps.featureId || "team-tetris";
    const createElement = deps.createElement;
    const text = deps.text;
    const render = deps.render;
    const getFeatureLabel = deps.getFeatureLabel;
    const createTeamTetrisPieceCard = deps.createTeamTetrisPieceCard;
    const createTeamTetrisSnapshotCard = deps.createTeamTetrisSnapshotCard;
    const renderTeamTetrisBoardCard = deps.renderTeamTetrisBoardCard;
    const getTeamTetrisView = deps.getTeamTetrisView;
    const getTeamTetrisBoardLabel = deps.getTeamTetrisBoardLabel;
    const getTeamTetrisSeatDisplayLabel = deps.getTeamTetrisSeatDisplayLabel;
    const getTeamTetrisPendingTurn = deps.getTeamTetrisPendingTurn;
    const getTeamTetrisOwnBoardState = deps.getTeamTetrisOwnBoardState;
    const getTeamTetrisOpponentBoardState = deps.getTeamTetrisOpponentBoardState;
    const getTeamTetrisPlacedByLabel = deps.getTeamTetrisPlacedByLabel;
    const getTeamTetrisPartnerRoleLabel = deps.getTeamTetrisPartnerRoleLabel;
    const getTeamTetrisTurnLabel = deps.getTeamTetrisTurnLabel;
    const getTeamTetrisResultLabel = deps.getTeamTetrisResultLabel;
    const getTeamTetrisDraftStatusText = deps.getTeamTetrisDraftStatusText;
    const getTeamTetrisStatusText = deps.getTeamTetrisStatusText;
    const onTeamTetrisRotate = deps.onTeamTetrisRotate;
    const onTeamTetrisRotateCcw = deps.onTeamTetrisRotateCcw;
    const onTeamTetrisClearDraft = deps.onTeamTetrisClearDraft;
    const onTeamTetrisSubmit = deps.onTeamTetrisSubmit;
    const onTeamTetrisMoveLeft = deps.onTeamTetrisMoveLeft;
    const onTeamTetrisMoveRight = deps.onTeamTetrisMoveRight;
    const onTeamTetrisConfirmPosition = deps.onTeamTetrisConfirmPosition;
    const onTeamTetrisBackToPosition = deps.onTeamTetrisBackToPosition;
    const onTeamTetrisRouteModeSelect = deps.onTeamTetrisRouteModeSelect;
    const onTeamTetrisBendRowSelect = deps.onTeamTetrisBendRowSelect;
    const onTeamTetrisStart = deps.onTeamTetrisStart;
    const onTeamTetrisReset = deps.onTeamTetrisReset;
    const getTeamTetrisPlayerDisplay = deps.getTeamTetrisPlayerDisplay;

    function createButton(className: string, label: string): HTMLButtonElement {
      const button = createElement("button", className, label) as HTMLButtonElement;
      button.type = "button";
      return button;
    }

    function setElementAttribute(element: HTMLElement, name: string, value: string): void {
      const target = element as HTMLElement & {
        setAttribute?: (attrName: string, attrValue: string) => void;
      };
      if (typeof target.setAttribute === "function") {
        target.setAttribute(name, value);
      }
    }

    function readSelectedPartnerSeatId(state: GameRoomUiState): string | null {
      const selectedPartnerSeatId = state.preferences.teamTetrisSelectedPartnerSeatId;
      return selectedPartnerSeatId === "ai1" ||
        selectedPartnerSeatId === "ai2" ||
        selectedPartnerSeatId === "us1"
        ? selectedPartnerSeatId
        : null;
    }

    function getTeamTetrisNeutralSeatLabel(seatId: string): string {
      return seatId.trim() !== "" ? seatId.trim().toUpperCase() : "???";
    }

    function buildTeamTetrisSelectionPreview(selectedPartnerSeatId: string): string[] {
      const remainingPair = ["ai1", "ai2", "us1"].filter(function (seatId) {
        return seatId !== selectedPartnerSeatId;
      });
      return [
        "USER + " + getTeamTetrisNeutralSeatLabel(selectedPartnerSeatId),
        remainingPair.map(getTeamTetrisNeutralSeatLabel).join(" + "),
      ];
    }

    function buildTeamTetrisPairStatusLines(state: GameRoomUiState): string[] {
      if (Array.isArray(state.teamTetris.teams) && state.teamTetris.teams.length > 0) {
        return state.teamTetris.teams.map(function (team: GameRoomTeamTetrisTeamRecord) {
          return (
            getTeamTetrisBoardLabel(team.teamId) +
            ": " +
            team.seatIds.map(getTeamTetrisNeutralSeatLabel).join(" + ")
          );
        });
      }

      if (state.teamTetris.hiddenPairs === true) {
        return [text(["teamTetris", "roster", "hiddenHint"])];
      }

      return [text(["teamTetris", "roster", "revealedHint"])];
    }

    function isSlotReady(seatId: string, state: GameRoomUiState): boolean | null {
      const reqSlots = state.teamTetris.requiredSlots;
      if (seatId === "ai1") {
        return reqSlots.ai1 === true;
      }
      if (seatId === "ai2") {
        return reqSlots.ai2 === true;
      }
      if (seatId === "us1") {
        return reqSlots.us1 === true;
      }
      return null;
    }

    function renderLobbySlotCard(seatId: string, state: GameRoomUiState): HTMLElement {
      const display = getTeamTetrisPlayerDisplay(seatId);
      const ready = isSlotReady(seatId, state);
      const card = createElement("div", "tt-lobby-slot", "");
      card.dataset["seatId"] = seatId;
      card.dataset["anonymous"] = display.isAnonymous ? "true" : "false";
      if (ready !== null) {
        card.dataset["ready"] = ready ? "true" : "false";
      }

      const avatarEl = createElement("div", "tt-lobby-slot__avatar", "");
      if (display.avatarUrl && !display.isAnonymous) {
        const img = createElement("img", "tt-lobby-slot__img", "") as HTMLImageElement;
        img.src = display.avatarUrl;
        img.alt = display.label;
        avatarEl.append(img);
      } else {
        avatarEl.append(
          createElement("span", "tt-lobby-slot__initial", display.label.charAt(0).toUpperCase())
        );
      }

      card.append(avatarEl, createElement("span", "tt-lobby-slot__name", display.label));

      if (ready !== null) {
        const badge = createElement(
          "span",
          "tt-lobby-slot__badge",
          ready
            ? text(["teamTetris", "controls", "requirementReady"])
            : text(["teamTetris", "controls", "requirementWaiting"])
        );
        badge.dataset["ready"] = ready ? "true" : "false";
        card.append(badge);
      }

      return card;
    }

    function renderPrepArea(
      pendingTurn: GameRoomTeamTetrisPendingTurn | null,
      draft: GameRoomTeamTetrisDraftState
    ): HTMLElement {
      const prepArea = createElement("section", "tt-prep-area", "");

      if (!pendingTurn) {
        prepArea.append(
          createElement("p", "tt-prep-area__empty", text(["teamTetris", "stage", "noPiece"]))
        );
        return prepArea;
      }

      const pieceCard = createTeamTetrisPieceCard(
        text(["teamTetris", "boards", "currentPiece"]),
        pendingTurn.pieceId,
        draft.rotation,
        ""
      );
      pieceCard.className = (pieceCard.className + " tt-prep-area__piece").trim();
      pieceCard.dataset["variant"] = "current-piece";

      const stageLabel = createElement("div", "tt-prep-area__stage-label", "");
      const stageText =
        draft.stage === "positioning"
          ? text(["teamTetris", "stage", "positioningLabel"])
          : text(["teamTetris", "stage", "routeLabel"]);
      stageLabel.append(createElement("span", "tt-prep-area__stage-badge", stageText));

      const controlsRow = createElement("div", "tt-prep-area__controls", "");

      if (draft.stage === "positioning") {
        const moveLeftBtn = createButton(
          "backgammon-button backgammon-button--ghost tt-prep-btn",
          text(["teamTetris", "stage", "moveLeft"])
        );
        moveLeftBtn.addEventListener("click", onTeamTetrisMoveLeft);

        const rotateCcwBtn = createButton(
          "backgammon-button backgammon-button--ghost tt-prep-btn",
          text(["teamTetris", "stage", "rotateCcw"])
        );
        rotateCcwBtn.addEventListener("click", onTeamTetrisRotateCcw);

        const rotateCwBtn = createButton(
          "backgammon-button backgammon-button--ghost tt-prep-btn",
          text(["teamTetris", "stage", "rotateCw"])
        );
        rotateCwBtn.addEventListener("click", onTeamTetrisRotate);

        const moveRightBtn = createButton(
          "backgammon-button backgammon-button--ghost tt-prep-btn",
          text(["teamTetris", "stage", "moveRight"])
        );
        moveRightBtn.addEventListener("click", onTeamTetrisMoveRight);

        const confirmBtn = createButton(
          "backgammon-button backgammon-button--primary tt-prep-btn--confirm",
          text(["teamTetris", "stage", "confirmPosition"])
        );
        confirmBtn.addEventListener("click", onTeamTetrisConfirmPosition);

        controlsRow.append(moveLeftBtn, rotateCcwBtn, rotateCwBtn, moveRightBtn);
        prepArea.append(stageLabel, pieceCard, controlsRow, confirmBtn);
      } else {
        const backBtn = createButton(
          "backgammon-button backgammon-button--ghost tt-prep-btn",
          text(["teamTetris", "stage", "backToPosition"])
        );
        backBtn.addEventListener("click", onTeamTetrisBackToPosition);

        const routeModes: { mode: GameRoomTeamTetrisRouteMode; labelKey: string }[] = [
          { mode: "straight", labelKey: "routeStraight" },
          { mode: "bend-left", labelKey: "routeBendLeft" },
          { mode: "bend-right", labelKey: "routeBendRight" },
        ];

        const routeChoices = createElement("div", "tt-route-choices", "");
        routeModes.forEach(function (entry) {
          const btn = createButton(
            "tt-toggle tt-route-btn",
            text(["teamTetris", "stage", entry.labelKey])
          );
          btn.dataset["selected"] = draft.routeMode === entry.mode ? "true" : "false";
          btn.addEventListener("click", function () {
            onTeamTetrisRouteModeSelect(entry.mode);
          });
          routeChoices.append(btn);
        });

        const routePanel = createElement("div", "tt-route-panel", "");
        routePanel.append(
          createElement("p", "tt-panel__label", text(["teamTetris", "stage", "routeTitle"])),
          routeChoices
        );

        if (draft.routeMode !== "straight") {
          const bendLabel = createElement(
            "p",
            "tt-panel__label",
            text(["teamTetris", "stage", "bendRowLabel"])
          );
          const bendRowPicker = createElement("div", "tt-bend-row-picker", "");
          for (let r = 0; r < 20; r += 1) {
            const rowBtn = createButton("tt-bend-row-btn", String(r));
            rowBtn.dataset["selected"] = draft.bendRow === r ? "true" : "false";
            (function (rowIndex: number) {
              rowBtn.addEventListener("click", function () {
                onTeamTetrisBendRowSelect(rowIndex);
              });
            })(r);
            bendRowPicker.append(rowBtn);
          }
          routePanel.append(bendLabel, bendRowPicker);
        }

        const submitBtn = createButton(
          "backgammon-button backgammon-button--primary tt-prep-btn--confirm",
          text(["teamTetris", "controls", "submitMove"])
        );
        const canSubmitFromStage =
          draft.preview !== null &&
          draft.preview.success === true &&
          draft.preview.pathComplete === true;
        submitBtn.disabled = !canSubmitFromStage;
        submitBtn.addEventListener("click", onTeamTetrisSubmit);

        controlsRow.append(backBtn);
        prepArea.append(stageLabel, pieceCard, routePanel, controlsRow, submitBtn);
      }

      return prepArea;
    }

    function renderTeamTetris(root: HTMLElement): void {
      const state = getState();
      document.title = state.context.room.name + " - " + getFeatureLabel(featureId);

      const view = getTeamTetrisView();
      const pendingTurn = getTeamTetrisPendingTurn();
      const ownBoard = getTeamTetrisOwnBoardState();
      const opponentBoard = getTeamTetrisOpponentBoardState();
      const hiddenPairs = state.preferences.teamTetrisHiddenPairs !== false;
      const selectedPartnerSeatId = readSelectedPartnerSeatId(state);
      const draft = state.teamTetrisDraft;
      const draftPreview = draft.preview;
      const draftCanSubmit =
        draftPreview !== null &&
        draftPreview.success === true &&
        draftPreview.pathComplete === true;
      const draftOverlayCells =
        draftPreview && Array.isArray(draftPreview.cells) ? draftPreview.cells : [];
      const draftPathCells =
        draftPreview && Array.isArray(draftPreview.pathCells) ? draftPreview.pathCells : [];
      const draftPathTail: GameRoomTeamTetrisCell | null =
        draftPathCells.length > 1 ? draftPathCells[draftPathCells.length - 1] || null : null;
      const draftPathBeforeTail: GameRoomTeamTetrisCell | null =
        draftPathCells.length > 1 ? draftPathCells[draftPathCells.length - 2] || null : null;
      const hasHorizontalTail =
        draftPathTail !== null &&
        draftPathBeforeTail !== null &&
        draftPathTail.y === draftPathBeforeTail.y &&
        draftPathTail.x !== draftPathBeforeTail.x;
      const draftPathTurnCell: GameRoomTeamTetrisCell | null = hasHorizontalTail
        ? draftPathTail
        : null;
      const draftPathLineCells = hasHorizontalTail ? draftPathCells.slice(0, -1) : draftPathCells;
      const draftOverlayTone = draftCanSubmit ? "draft-valid" : "draft-blocked";
      const draftPathTone = draftCanSubmit ? "trace-valid" : "trace-blocked";
      const draftPathTurnTone = draftCanSubmit ? "trace-valid-turn" : "trace-blocked-turn";
      const canConfigureMatch =
        state.teamTetris.active !== true && state.teamTetris.result !== "pending";
      const canStart =
        state.teamTetris.canStart === true &&
        canConfigureMatch &&
        (hiddenPairs === true || selectedPartnerSeatId !== null);
      // active+pending avoids stale match ids shifting setup into the live board layout.
      const isMatchView = state.teamTetris.active === true && state.teamTetris.result === "pending";

      const app = createElement("main", "tt-shell", "");
      app.dataset["presentationMode"] = state.presentation.mode;
      app.dataset["ttView"] = isMatchView ? "match" : "setup";
      const surface = createElement("section", "tt-surface", "");
      const arena = createElement("section", "tt-arena", "");
      const rail = createElement("aside", "tt-rail", "");
      const stage = createElement("section", "tt-stage", "");

      const intro = createElement("section", "tt-panel tt-panel--intro", "");
      intro.append(
        createElement("div", "tt-panel__eyebrow", text(["teamTetris", "heroBadge"])),
        createElement("h1", "tt-panel__title", text(["teamTetris", "heroTitle"])),
        createElement(
          "p",
          "tt-panel__body",
          getTeamTetrisStatusText() || text(["teamTetris", "heroSubtitle"])
        )
      );

      const roster = createElement("section", "tt-panel tt-panel--overview", "");
      const overviewGrid = createElement("div", "tt-overview-grid", "");
      const overviewCopy = createElement("div", "tt-overview-copy", "");

      const lobbySlots = createElement("div", "tt-lobby-slots", "");
      (["user", "ai1", "ai2", "us1"] as const).forEach(function (seatId) {
        lobbySlots.append(renderLobbySlotCard(seatId, state));
      });

      overviewCopy.append(
        createElement("p", "tt-panel__label", text(["teamTetris", "roster", "title"])),
        lobbySlots,
        createElement(
          "p",
          "tt-panel__body",
          text(["teamTetris", "roster", "partnerLabel"]) + ": " + getTeamTetrisPartnerRoleLabel()
        )
      );
      overviewGrid.append(overviewCopy);
      roster.append(overviewGrid);

      if (state.teamTetris.matchId || state.teamTetris.active === true) {
        roster.append(
          createElement("p", "tt-panel__label", text(["teamTetris", "roster", "pairStatusTitle"]))
        );
        buildTeamTetrisPairStatusLines(state).forEach(function (line: string) {
          roster.append(createElement("p", "tt-panel__body", line));
        });
      }

      const controls = createElement("section", "tt-panel", "");
      controls.append(
        createElement("p", "tt-panel__label", text(["teamTetris", "controls", "featureLabel"]))
      );

      const hiddenChoices = createElement("div", "tt-toggle-row", "");
      const hiddenToggleOptions = [
        { value: true, label: text(["teamTetris", "controls", "hiddenPairsOn"]) },
        { value: false, label: text(["teamTetris", "controls", "hiddenPairsOff"]) },
      ];

      hiddenToggleOptions.forEach(function (entry: { value: boolean; label: string }) {
        const button = createButton("tt-toggle", entry.label);
        button.disabled = !canConfigureMatch;
        button.dataset["selected"] = hiddenPairs === entry.value ? "true" : "false";
        button.addEventListener("click", function () {
          state.preferences.teamTetrisHiddenPairs = entry.value;
          render();
        });
        hiddenChoices.append(button);
      });

      controls.append(hiddenChoices);

      if (hiddenPairs !== true) {
        const partnerChoices = createElement("div", "tt-partner-row", "");
        (["ai1", "ai2", "us1"] as const).forEach(function (seatId) {
          const button = createButton("tt-toggle", getTeamTetrisSeatDisplayLabel(seatId));
          button.disabled = !canConfigureMatch;
          button.dataset["selected"] = selectedPartnerSeatId === seatId ? "true" : "false";
          button.addEventListener("click", function () {
            state.preferences.teamTetrisSelectedPartnerSeatId = seatId;
            render();
          });
          partnerChoices.append(button);
        });

        const previewCard = createElement("div", "tt-pairing-preview", "");
        previewCard.append(
          createElement(
            "p",
            "tt-panel__label",
            text(["teamTetris", "controls", "partnerPreviewTitle"])
          )
        );
        if (selectedPartnerSeatId) {
          buildTeamTetrisSelectionPreview(selectedPartnerSeatId).forEach(function (line: string) {
            previewCard.append(createElement("p", "tt-panel__body", line));
          });
        } else {
          previewCard.append(
            createElement("p", "tt-panel__body", text(["teamTetris", "controls", "partnerPending"]))
          );
        }
        previewCard.append(
          createElement("p", "tt-panel__hint", text(["teamTetris", "controls", "partnerHint"]))
        );

        controls.append(
          createElement("p", "tt-panel__label", text(["teamTetris", "controls", "partnerLabel"])),
          partnerChoices,
          previewCard
        );
      }

      const actions = createElement("div", "tt-actions", "");
      const startButton = createButton(
        "backgammon-button backgammon-button--primary",
        text(["teamTetris", "controls", "start"])
      );
      startButton.disabled = !canStart;
      startButton.addEventListener("click", onTeamTetrisStart);

      const resetButton = createButton(
        "backgammon-button backgammon-button--ghost",
        text(["teamTetris", "controls", "reset"])
      );
      resetButton.addEventListener("click", onTeamTetrisReset);

      actions.append(startButton, resetButton);
      controls.append(
        createElement("p", "tt-panel__hint", text(["teamTetris", "controls", "startHint"])),
        actions
      );
      rail.append(intro, roster, controls);

      const stageMain = createElement("div", "tt-stage-main", "");
      const supportStack = createElement("div", "tt-support-stack", "");
      const supportPair = createElement("div", "tt-support-pair", "");
      const statusPanel = createElement("section", "tt-context-card tt-context-card--status", "");

      const snapshotCard = createTeamTetrisSnapshotCard(
        text(["teamTetris", "boards", "beforePartner"]),
        ownBoard.boardBeforePartnerPieceRows
      );
      const partnerPieceCard = createTeamTetrisPieceCard(
        text(["teamTetris", "boards", "partnerPiece"]),
        ownBoard.partnerLastPiece ? ownBoard.partnerLastPiece.pieceId : "",
        ownBoard.partnerLastPiece ? ownBoard.partnerLastPiece.rotation : 0,
        getTeamTetrisPlacedByLabel(ownBoard.partnerLastPiece)
      );

      snapshotCard.dataset["variant"] = "snapshot";
      partnerPieceCard.dataset["variant"] = "partner";

      const turnIndicator = createElement("div", "tt-turn-indicator", "");
      turnIndicator.dataset["active"] = pendingTurn !== null ? "true" : "false";
      turnIndicator.append(
        createElement("span", "tt-turn-indicator__dot", ""),
        createElement("span", "tt-turn-indicator__text", getTeamTetrisTurnLabel())
      );

      statusPanel.append(
        createElement("span", "tt-context-card__label", text(["teamTetris", "heroBadge"])),
        turnIndicator,
        createElement("p", "tt-context-card__lead", getTeamTetrisStatusText()),
        createElement(
          "p",
          "tt-context-card__meta",
          text(["teamTetris", "metrics", "turnLabel"]) +
            ": " +
            getTeamTetrisTurnLabel() +
            " • " +
            text(["teamTetris", "metrics", "resultLabel"]) +
            ": " +
            getTeamTetrisResultLabel()
        ),
        createElement(
          "p",
          "tt-context-card__meta",
          view && view.hiddenPairs === true && view.revealedPairs !== true
            ? text(["teamTetris", "roster", "hiddenHint"])
            : text(["teamTetris", "roster", "revealedHint"])
        ),
        createElement("p", "tt-context-card__meta", text(["teamTetris", "boards", "publicHint"]))
      );

      const prepArea = renderPrepArea(pendingTurn, draft);
      let matchTopbar: HTMLElement | null = null;
      if (isMatchView) {
        matchTopbar = createElement("section", "tt-match-topbar", "");
        setElementAttribute(matchTopbar, "aria-label", text(["teamTetris", "heroBadge"]));
        setElementAttribute(matchTopbar, "aria-live", "polite");
        matchTopbar.append(
          createElement("strong", "tt-match-topbar__status", getTeamTetrisStatusText()),
          createElement(
            "span",
            "tt-match-topbar__turn",
            text(["teamTetris", "metrics", "turnLabel"]) + ": " + getTeamTetrisTurnLabel()
          ),
          createElement(
            "span",
            "tt-match-topbar__roster",
            text(["teamTetris", "roster", "partnerLabel"]) + ": " + getTeamTetrisPartnerRoleLabel()
          ),
          createElement("span", "tt-match-topbar__ready", getTeamTetrisDraftStatusText())
        );
      }

      const clearButton = createButton(
        "backgammon-button backgammon-button--ghost",
        text(["teamTetris", "controls", "clearPath"])
      );
      clearButton.disabled = pendingTurn === null;
      clearButton.addEventListener("click", onTeamTetrisClearDraft);

      const draftHint = createElement("p", "tt-context-card__hint", getTeamTetrisDraftStatusText());

      supportPair.append(snapshotCard, partnerPieceCard);
      supportStack.append(statusPanel, prepArea, clearButton, draftHint, supportPair);

      const boardInteractionMode = draft.interactionMode;
      const boardGrid = createElement("div", "tt-board-grid", "");
      boardGrid.append(
        renderTeamTetrisBoardCard(ownBoard, {
          tone: "private",
          meta: text(["teamTetris", "boards", "privateBoard"]),
          interactive: pendingTurn !== null && boardInteractionMode === "positioning",
          boardInteractionMode: boardInteractionMode,
          overlayCells: draftOverlayCells,
          overlayTone: draftOverlayTone,
          overlayPieceId: pendingTurn ? pendingTurn.pieceId : "",
          pathCells: draftPathLineCells,
          pathTone: draftPathTone,
          pathTurnCell: draftPathTurnCell,
          pathTurnTone: draftPathTurnTone,
        }),
        renderTeamTetrisBoardCard(opponentBoard, {
          tone: "public",
          meta: text(["teamTetris", "boards", "publicBoard"]),
          interactive: false,
        })
      );

      stageMain.append(boardGrid, supportStack);
      if (matchTopbar) {
        stage.append(matchTopbar);
      }
      stage.append(stageMain);
      arena.append(rail, stage);
      surface.append(arena);
      app.append(surface);
      root.replaceChildren(app);
    }

    return {
      renderTeamTetris: renderTeamTetris,
    };
  };
})((typeof window !== "undefined" ? window : globalThis) as unknown as GameRoomUiGlobal);
