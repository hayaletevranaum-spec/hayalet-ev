(function (
  global: typeof globalThis & {
    GameRoomUiFactories?: GameRoomUiFactoriesRegistry;
  }
) {
  type BackgammonTarget = "ai1" | "ai2" | "us1";
  type BackgammonPoint = {
    point: number;
    owner: "user" | "ai" | "";
    count: number;
  };
  type BackgammonLocation =
    { type: "bar"; seat: "user" | "ai" } | { type: "off" } | { type: "point"; point: number };
  type BackgammonSubMove = {
    from: BackgammonLocation;
    to: BackgammonLocation;
    die: number;
    hit: boolean;
  };
  type BackgammonLegalMove = {
    id: string;
    label: string;
    moves: BackgammonSubMove[];
    diceUsed: number[];
    pass?: boolean;
  };
  type BackgammonInviteEntry = {
    inviteId: string;
    remoteUserId: string;
    nickname: string;
    note: string;
    starter: "user" | "opponent";
    sentAt: number | null;
  };
  type BackgammonPendingInvite = {
    direction: "incoming" | "outgoing";
    nickname: string;
    note: string;
  };
  type BackgammonSlotState = {
    slotId: BackgammonTarget;
    dispatchable?: boolean;
    nickname: string;
    avatar?: string | null;
    assigned?: boolean;
    connected?: boolean;
    ready?: boolean;
  };
  type BackgammonMatchHistoryEntry = {
    id: string;
    finishedAt: number;
    target: string;
    opponentNickname: string;
    opponentAvatar: string | null;
    userNickname: string;
    result: "user-win" | "ai-win";
    starter: "ai" | "user";
    scorePoints: number;
  };
  type BackgammonUiState = {
    presentation: {
      mode: string;
    };
    lastCommandMessage: string;
    preferences: {
      target: string;
      starter: string;
      inviteMessage: string;
      invitesTab?: "incoming" | "outgoing";
    };
    context: {
      room: {
        name: string;
      };
      user: {
        nickname: string;
        avatar?: string | null;
      };
      slots: Record<string, BackgammonSlotState>;
    };
    game: {
      pendingInvite: BackgammonPendingInvite | null;
      inviteInbox: BackgammonInviteEntry[];
      matchHistory?: BackgammonMatchHistoryEntry[];
      active: boolean;
      blockedReason: string;
      awaitingMoveFrom: "user" | "ai" | null;
      user: {
        nickname: string;
      };
      board: BackgammonPoint[];
      bar: Record<"user" | "ai", number>;
      off: Record<"user" | "ai", number>;
      dice: number[];
      legalMoves: BackgammonLegalMove[];
      result: string;
      winner?: string;
      opponent?: BackgammonSlotState;
      scorePoints: number;
    };
  };
  type BackgammonUiStateRuntime = {
    onAcceptInvite: (inviteId: string, remoteUserId: string) => void;
    onRejectInvite: (inviteId: string, remoteUserId: string) => void;
    formatInviteMeta: (invite: BackgammonInviteEntry) => string;
    getSelectedTarget: () => BackgammonTarget;
    getDisplayOpponent: () => BackgammonSlotState;
    getSlotOrder: () => BackgammonSlotState[];
    getSlotStatusLabel: (slot: BackgammonSlotState) => string;
    getStarterLabelForCurrentTarget: (value: "user" | "ai") => string;
    onStart: () => void;
    onReset: () => void;
    getCurrentStatus: () => string;
    getTurnLabel: () => string;
    getResultLabel: () => string;
    getDiceLabel: () => string;
    getBearOffLabel: () => string;
    getBarLabel: () => string;
    onLegalMove: (moveId: string) => void;
    onCancelOutgoingInvite: () => void;
    getMatchHistory: () => BackgammonMatchHistoryEntry[];
    getMatchHistoryResultLabel: (entry: BackgammonMatchHistoryEntry) => string;
    getMatchHistoryResultTone: (entry: BackgammonMatchHistoryEntry) => string;
    formatMatchHistoryDate: (entry: BackgammonMatchHistoryEntry) => string;
  };
  type BackgammonStagePlayer = {
    name: string;
    avatar?: string | null;
    active: boolean;
  };
  type BackgammonStageRuntime = {
    destroy: () => void;
    renderBackgammonStage: (
      host: HTMLElement,
      options: {
        canUserMove: boolean;
        game: BackgammonUiState["game"];
        players: {
          user: BackgammonStagePlayer;
          opponent: BackgammonStagePlayer;
        };
      }
    ) => void;
  };
  type InteractiveElement = HTMLElement & {
    type?: string;
    disabled?: boolean;
  };
  type BackgammonRailModel = {
    selectedTarget: BackgammonTarget;
    controlsDisabled: boolean;
    canStart: boolean;
    canReset: boolean;
    canRespondToInvites: boolean;
    canCancelOutgoing: boolean;
  };
  type BackgammonShellCache = {
    root: HTMLElement;
    app: InteractiveElement;
    rail: InteractiveElement;
    stage: InteractiveElement;
    boardStageHost: InteractiveElement;
  };
  type BackgammonUiRenderRuntimeDeps = {
    getState: () => BackgammonUiState;
    featureId: string;
    bootstrapText: (key: string) => string;
    text: (path: string[]) => string;
    createElement: (
      tagName: string,
      className?: string,
      textContent?: string
    ) => InteractiveElement;
    render: () => void;
    isRoomApiAvailable: () => boolean;
    getFeatureLabel: (featureId: string) => string;
    stateRuntime: BackgammonUiStateRuntime;
  };

  type BackgammonUiRenderRuntimeRegistry = GameRoomUiFactoriesRegistry & {
    createBackgammonStageRuntime?: (
      deps: BackgammonUiRenderRuntimeDeps & {
        stateRuntime: BackgammonUiStateRuntime;
      }
    ) => BackgammonStageRuntime;
    createBackgammonUiRenderRuntime?: (deps: BackgammonUiRenderRuntimeDeps) => {
      renderBootstrap(root: HTMLElement): void;
      renderBackgammon(root: HTMLElement): void;
    };
  };

  const registry = (global.GameRoomUiFactories ||
    (global.GameRoomUiFactories =
      {} as GameRoomUiFactoriesRegistry)) as BackgammonUiRenderRuntimeRegistry;

  registry.createBackgammonUiRenderRuntime = function createBackgammonUiRenderRuntime(
    deps: BackgammonUiRenderRuntimeDeps
  ) {
    const getState = deps.getState;
    const featureId = deps.featureId;
    const bootstrapText = deps.bootstrapText;
    const text = deps.text;
    const createElement = deps.createElement;
    const render = deps.render;
    const isRoomApiAvailable = deps.isRoomApiAvailable;
    const getFeatureLabel = deps.getFeatureLabel;
    const stateRuntime = deps.stateRuntime;
    const createStageRuntime = registry.createBackgammonStageRuntime;
    const backgammonStageRuntime =
      typeof createStageRuntime === "function"
        ? createStageRuntime({
            ...deps,
            stateRuntime,
          })
        : null;
    let cachedBoardStageHost: InteractiveElement | null = null;
    let cachedBackgammonShell: BackgammonShellCache | null = null;

    function getInitials(name: string): string {
      const trimmed = (name || "").trim();
      if (trimmed === "") {
        return "??";
      }
      const parts = trimmed.split(/\s+/);
      return parts.length === 1
        ? trimmed.slice(0, 2).toUpperCase()
        : ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
    }

    function createAvatar(
      name: string,
      avatar: string | null | undefined,
      size: "sm" | "md" | "lg"
    ) {
      const wrapper = createElement("span", "backgammon-avatar backgammon-avatar--" + size, "");
      if (avatar && avatar.trim() !== "") {
        const img = document.createElement("img");
        img.src = avatar;
        img.alt = name || "";
        img.loading = "lazy";
        wrapper.append(img);
      } else {
        wrapper.append(createElement("span", "backgammon-avatar__initials", getInitials(name)));
      }
      return wrapper;
    }

    function createSlotCard(slot: BackgammonSlotState, selected: boolean, disabled: boolean) {
      const status = stateRuntime.getSlotStatusLabel(slot);
      const tone =
        slot.ready === true
          ? "ready"
          : slot.assigned === true && slot.connected !== true
            ? "disconnected"
            : slot.assigned === true
              ? "assigned"
              : "empty";
      const button = createElement("button", "backgammon-slot-card", "");
      button.type = "button";
      button.disabled = disabled;
      button.dataset["selected"] = selected ? "true" : "false";
      button.dataset["tone"] = tone;
      const info = createElement("span", "backgammon-slot-card__info", "");
      button.append(createAvatar(slot.nickname, slot.avatar, "md"), info);
      const header = createElement("span", "backgammon-slot-card__header", "");
      header.append(
        createElement("span", "backgammon-slot-card__badge", slot.slotId.toUpperCase()),
        createElement("strong", "backgammon-slot-card__name", slot.nickname)
      );
      const statusLine = createElement("span", "backgammon-slot-card__status", "");
      statusLine.append(
        createElement("span", "backgammon-slot-card__dot", ""),
        createElement("span", "backgammon-slot-card__status-text", status)
      );
      info.append(header, statusLine);
      return button;
    }

    function createChoiceButton(title: string, selected: boolean, disabled: boolean) {
      const button = createElement("button", "backgammon-choice-button", "");
      button.type = "button";
      button.disabled = disabled;
      button.dataset["selected"] = selected ? "true" : "false";
      button.append(createElement("span", "backgammon-choice-button__title", title));
      return button;
    }

    function renderBootstrap(root: HTMLElement) {
      const state = getState();
      const app = createElement("main", "backgammon-shell backgammon-shell--bootstrap", "");
      app.dataset["presentationMode"] = state.presentation.mode;
      const surface = createElement(
        "section",
        "backgammon-surface backgammon-surface--bootstrap",
        ""
      );
      const brand = createElement("div", "backgammon-brand", "");
      brand.append(
        createElement("div", "backgammon-brand__eyebrow", bootstrapText("roomTitle")),
        createElement("h1", "backgammon-brand__title", bootstrapText("loadingTitle")),
        createElement(
          "p",
          "backgammon-brand__subtitle",
          state.lastCommandMessage && state.lastCommandMessage.trim() !== ""
            ? state.lastCommandMessage.trim()
            : bootstrapText("loadingBody")
        )
      );
      surface.append(brand);
      app.append(surface);
      document.title = bootstrapText("roomTitle");
      cachedBackgammonShell = null;
      root.replaceChildren(app);
    }

    function renderEmptyState(message: string) {
      const wrapper = createElement("div", "backgammon-empty-state", "");
      wrapper.append(createElement("p", "backgammon-empty-state__text", message));
      return wrapper;
    }

    function renderIncomingInviteCard(invite: BackgammonInviteEntry, canRespond: boolean) {
      const card = createElement(
        "article",
        "backgammon-invite-card backgammon-invite-card--incoming",
        ""
      );
      const header = createElement("div", "backgammon-invite-card__header", "");
      header.append(
        createAvatar(invite.nickname, null, "sm"),
        createElement("strong", "backgammon-invite-card__title", invite.nickname)
      );
      const actions = createElement("div", "backgammon-invite-card__actions", "");
      const acceptButton = createElement(
        "button",
        "backgammon-button backgammon-button--primary backgammon-button--compact",
        text(["backgammon", "invites", "accept"])
      );
      acceptButton.type = "button";
      acceptButton.disabled = !canRespond;
      acceptButton.addEventListener("click", function () {
        stateRuntime.onAcceptInvite(invite.inviteId, invite.remoteUserId);
      });
      const rejectButton = createElement(
        "button",
        "backgammon-button backgammon-button--ghost backgammon-button--compact",
        text(["backgammon", "invites", "reject"])
      );
      rejectButton.type = "button";
      rejectButton.disabled = !canRespond;
      rejectButton.addEventListener("click", function () {
        stateRuntime.onRejectInvite(invite.inviteId, invite.remoteUserId);
      });
      actions.append(acceptButton, rejectButton);
      card.append(
        header,
        createElement("p", "backgammon-invite-card__meta", stateRuntime.formatInviteMeta(invite)),
        createElement(
          "p",
          "backgammon-invite-card__message",
          invite.note || text(["backgammon", "invites", "messageFallback"])
        ),
        actions
      );
      return card;
    }

    function renderOutgoingInviteCard(invite: BackgammonPendingInvite, canCancel: boolean) {
      const card = createElement(
        "article",
        "backgammon-invite-card backgammon-invite-card--outgoing",
        ""
      );
      const actions = createElement("div", "backgammon-invite-card__actions", "");
      const cancelButton = createElement(
        "button",
        "backgammon-button backgammon-button--ghost backgammon-button--compact",
        text(["backgammon", "invites", "cancel"])
      );
      cancelButton.type = "button";
      cancelButton.disabled = !canCancel;
      cancelButton.addEventListener("click", stateRuntime.onCancelOutgoingInvite);
      actions.append(cancelButton);
      card.append(
        createElement("strong", "backgammon-invite-card__title", invite.nickname),
        createElement(
          "p",
          "backgammon-invite-card__meta",
          text(["backgammon", "invites", "pendingOutgoing"])
        ),
        createElement(
          "p",
          "backgammon-invite-card__message",
          invite.note || text(["backgammon", "invites", "messageFallback"])
        ),
        actions
      );
      return card;
    }

    function renderInvitesPanel(canRespond: boolean, canCancel: boolean) {
      const state = getState();
      const panel = createElement("section", "backgammon-panel backgammon-panel--invites", "");
      const activeTab = state.preferences.invitesTab === "outgoing" ? "outgoing" : "incoming";
      const header = createElement("div", "backgammon-panel__header", "");
      header.append(
        createElement("p", "backgammon-panel__label", text(["backgammon", "invites", "title"]))
      );
      const tabs = createElement("div", "backgammon-tab-row", "");
      const outgoingCount =
        state.game.pendingInvite && state.game.pendingInvite.direction === "outgoing" ? 1 : 0;
      [
        {
          id: "incoming",
          label: text(["backgammon", "invites", "incomingTab"]),
          count: state.game.inviteInbox.length,
        },
        {
          id: "outgoing",
          label: text(["backgammon", "invites", "outgoingTab"]),
          count: outgoingCount,
        },
      ].forEach(function (tabSpec) {
        const tabButton = createElement("button", "backgammon-tab", "");
        tabButton.type = "button";
        tabButton.dataset["active"] = tabSpec.id === activeTab ? "true" : "false";
        tabButton.append(createElement("span", "backgammon-tab__label", tabSpec.label));
        if (tabSpec.count > 0) {
          tabButton.append(createElement("span", "backgammon-tab__count", String(tabSpec.count)));
        }
        tabButton.addEventListener("click", function () {
          const nextTab = tabSpec.id as "incoming" | "outgoing";
          if ((state.preferences.invitesTab ?? "incoming") === nextTab) {
            return;
          }
          state.preferences.invitesTab = nextTab;
          refreshRailOnly();
        });
        tabs.append(tabButton);
      });
      header.append(tabs);
      panel.append(header);

      const body = createElement("div", "backgammon-panel__body backgammon-invite-list", "");
      if (activeTab === "incoming") {
        if (state.game.inviteInbox.length === 0) {
          body.append(renderEmptyState(text(["backgammon", "invites", "empty"])));
        } else {
          state.game.inviteInbox.forEach((invite) =>
            body.append(renderIncomingInviteCard(invite, canRespond))
          );
        }
      } else if (outgoingCount === 0) {
        body.append(renderEmptyState(text(["backgammon", "invites", "outgoingEmpty"])));
      } else if (state.game.pendingInvite && state.game.pendingInvite.direction === "outgoing") {
        body.append(renderOutgoingInviteCard(state.game.pendingInvite, canCancel));
      }
      panel.append(body);
      return panel;
    }

    function renderHistoryPanel() {
      const panel = createElement("section", "backgammon-panel backgammon-panel--history", "");
      panel.append(
        createElement("p", "backgammon-panel__label", text(["backgammon", "history", "title"]))
      );
      const body = createElement("div", "backgammon-panel__body backgammon-history-list", "");
      const entries = stateRuntime.getMatchHistory();
      if (entries.length === 0) {
        body.append(renderEmptyState(text(["backgammon", "history", "empty"])));
      } else {
        entries.forEach(function (entry) {
          const card = createElement("article", "backgammon-history-card", "");
          card.dataset["tone"] = stateRuntime.getMatchHistoryResultTone(entry);
          const main = createElement("div", "backgammon-history-card__main", "");
          main.append(
            createElement("strong", "backgammon-history-card__name", entry.opponentNickname),
            createElement(
              "span",
              "backgammon-history-card__badge",
              stateRuntime.getMatchHistoryResultLabel(entry) + " x" + String(entry.scorePoints)
            ),
            createElement(
              "span",
              "backgammon-history-card__meta",
              stateRuntime.formatMatchHistoryDate(entry)
            )
          );
          card.append(createAvatar(entry.opponentNickname, entry.opponentAvatar, "sm"), main);
          body.append(card);
        });
      }
      panel.append(body);
      return panel;
    }

    function renderSlotsPanel(selectedTarget: BackgammonTarget, disabled: boolean) {
      const state = getState();
      const panel = createElement("section", "backgammon-panel backgammon-panel--slots", "");
      panel.append(
        createElement(
          "p",
          "backgammon-panel__label",
          text(["backgammon", "topbar", "opponentLabel"])
        )
      );
      const list = createElement("div", "backgammon-slot-list", "");
      stateRuntime.getSlotOrder().forEach(function (slot: BackgammonSlotState) {
        const slotDisabled = disabled || slot.assigned !== true;
        const card = createSlotCard(slot, slot.slotId === selectedTarget, slotDisabled);
        card.addEventListener("click", function () {
          if (slotDisabled) {
            return;
          }
          if (state.preferences.target === slot.slotId) {
            return;
          }
          state.preferences.target = slot.slotId;
          refreshRailOnly();
        });
        list.append(card);
      });
      panel.append(list);
      return panel;
    }

    function renderSetupPanel(
      selectedTarget: BackgammonTarget,
      canStart: boolean,
      canReset: boolean,
      disabled: boolean
    ) {
      const state = getState();
      const panel = createElement("section", "backgammon-panel backgammon-panel--setup", "");
      panel.append(
        createElement(
          "p",
          "backgammon-panel__label",
          text(["backgammon", "topbar", "starterLabel"])
        )
      );
      const starterRow = createElement("div", "backgammon-toggle-row", "");
      (["user", "ai"] as const).forEach(function (starter) {
        const button = createChoiceButton(
          stateRuntime.getStarterLabelForCurrentTarget(starter),
          state.preferences.starter === starter,
          disabled
        );
        button.addEventListener("click", function () {
          if (state.preferences.starter === starter) {
            return;
          }
          state.preferences.starter = starter;
          refreshRailOnly();
        });
        starterRow.append(button);
      });
      panel.append(starterRow);

      if (selectedTarget === "us1") {
        const inviteFieldLabel = createElement("label", "backgammon-field", "");
        inviteFieldLabel.append(
          createElement(
            "span",
            "backgammon-field__label",
            text(["backgammon", "topbar", "inviteMessageLabel"])
          )
        );
        const inviteField = document.createElement("textarea");
        inviteField.className = "backgammon-textarea";
        inviteField.rows = 2;
        inviteField.placeholder = text(["backgammon", "topbar", "inviteMessagePlaceholder"]);
        inviteField.value = state.preferences.inviteMessage;
        inviteField.disabled = disabled;
        inviteField.addEventListener("input", function () {
          state.preferences.inviteMessage = inviteField.value;
        });
        inviteFieldLabel.append(inviteField);
        panel.append(inviteFieldLabel);
      }

      const actionGroup = createElement("div", "backgammon-actions", "");
      const startButton = createElement(
        "button",
        "backgammon-button backgammon-button--primary",
        selectedTarget === "us1"
          ? text(["backgammon", "topbar", "sendInvite"])
          : text(["backgammon", "topbar", "start"])
      );
      startButton.type = "button";
      startButton.disabled = !canStart;
      startButton.addEventListener("click", stateRuntime.onStart);
      const resetButton = createElement(
        "button",
        "backgammon-button backgammon-button--ghost",
        text(["backgammon", "topbar", "reset"])
      );
      resetButton.type = "button";
      resetButton.disabled = !canReset;
      resetButton.addEventListener("click", stateRuntime.onReset);
      actionGroup.append(startButton, resetButton);
      panel.append(actionGroup);
      return panel;
    }

    function createChecker(owner: "user" | "ai", index: number, total: number) {
      const checker = createElement(
        "span",
        "backgammon-checker",
        index === 0 && total > 5 ? String(total) : ""
      );
      checker.dataset["owner"] = owner;
      return checker;
    }

    function renderPoint(point: BackgammonPoint) {
      const pointEl = createElement("div", "backgammon-point", "");
      pointEl.dataset["owner"] = point.owner || "empty";
      pointEl.dataset["point"] = String(point.point);
      pointEl.append(createElement("span", "backgammon-point__number", String(point.point)));
      const stack = createElement("span", "backgammon-point__stack", "");
      const visible = Math.min(point.count, 5);
      for (let index = 0; index < visible; index += 1) {
        if (point.owner === "user" || point.owner === "ai") {
          stack.append(createChecker(point.owner, index, point.count));
        }
      }
      pointEl.append(stack);
      return pointEl;
    }

    function renderBoard(game: BackgammonUiState["game"]) {
      if (backgammonStageRuntime !== null) {
        if (cachedBoardStageHost === null) {
          cachedBoardStageHost = createElement("div", "backgammon-board-stage", "");
          cachedBoardStageHost.dataset["backgammonStage"] = "true";
        }
        return cachedBoardStageHost;
      }
      const points = game.board;
      const boardShell = createElement(
        "div",
        "backgammon-board-shell backgammon-board-shell--tavla",
        ""
      );
      const board = createElement("div", "backgammon-board backgammon-board--tavla", "");
      const top = createElement("div", "backgammon-board-row backgammon-board-row--top", "");
      const bottom = createElement("div", "backgammon-board-row backgammon-board-row--bottom", "");
      points
        .slice(12, 24)
        .reverse()
        .forEach((point) => top.append(renderPoint(point)));
      points.slice(0, 12).forEach((point) => bottom.append(renderPoint(point)));
      const bar = createElement("div", "backgammon-board-bar", "");
      bar.append(
        createElement(
          "span",
          "backgammon-board-bar__label",
          text(["backgammon", "board", "barLabel"])
        ),
        createElement("strong", "backgammon-board-bar__value", stateRuntime.getBarLabel())
      );
      board.append(top, bar, bottom);
      boardShell.append(board);
      return boardShell;
    }

    function getRailModel(): BackgammonRailModel | null {
      const state = getState();
      const selectedTarget = stateRuntime.getSelectedTarget();
      const selectedSlot = state.context.slots[selectedTarget] ?? state.context.slots["ai1"];
      if (!selectedSlot) {
        return null;
      }
      const hasPendingOutgoingInvite =
        !!state.game.pendingInvite && state.game.pendingInvite.direction === "outgoing";
      const controlsDisabled = state.game.active === true || hasPendingOutgoingInvite;
      const canStartWithSelectedSlot =
        selectedTarget === "us1"
          ? selectedSlot.dispatchable === true
          : selectedSlot.assigned === true;
      const canStart =
        canStartWithSelectedSlot && state.game.active !== true && !hasPendingOutgoingInvite;
      const canReset = isRoomApiAvailable();
      const canRespondToInvites = state.game.active !== true && !hasPendingOutgoingInvite;
      const canCancelOutgoing = hasPendingOutgoingInvite && canReset;
      return {
        selectedTarget,
        controlsDisabled,
        canStart,
        canReset,
        canRespondToInvites,
        canCancelOutgoing,
      };
    }

    function renderRailPanels(model: BackgammonRailModel): InteractiveElement[] {
      return [
        renderSlotsPanel(model.selectedTarget, model.controlsDisabled),
        renderSetupPanel(
          model.selectedTarget,
          model.canStart,
          model.canReset,
          model.controlsDisabled
        ),
        renderInvitesPanel(model.canRespondToInvites, model.canCancelOutgoing),
        renderHistoryPanel(),
      ];
    }

    function refreshRailOnly(): void {
      const rail = cachedBackgammonShell?.rail ?? document.querySelector(".backgammon-rail");
      const railModel = getRailModel();
      if (!rail || railModel === null) {
        render();
        return;
      }
      rail.replaceChildren(...renderRailPanels(railModel));
    }

    function createBackgammonShell(
      root: HTMLElement,
      railModel: BackgammonRailModel,
      awaiting: string,
      result: string,
      presentationMode: string
    ): BackgammonShellCache {
      const app = createElement("main", "backgammon-shell", "");
      app.dataset["presentationMode"] = presentationMode;
      const surface = createElement("section", "backgammon-surface", "");
      const arena = createElement("section", "backgammon-arena", "");
      const rail = createElement("aside", "backgammon-rail", "");
      rail.append(...renderRailPanels(railModel));

      const stage = createElement("section", "backgammon-stage", "");
      stage.dataset["awaiting"] = awaiting;
      stage.dataset["result"] = result;
      const boardArea = createElement("div", "backgammon-board-area", "");
      const boardStageHost = renderBoard(getState().game);
      boardArea.append(boardStageHost);
      stage.append(boardArea);
      arena.append(rail, stage);
      surface.append(arena);
      app.append(surface);
      root.replaceChildren(app);
      return {
        root,
        app,
        rail,
        stage,
        boardStageHost,
      };
    }

    function syncBackgammonShell(
      root: HTMLElement,
      railModel: BackgammonRailModel,
      awaiting: string,
      result: string,
      presentationMode: string
    ): BackgammonShellCache {
      if (cachedBackgammonShell === null || cachedBackgammonShell.root !== root) {
        cachedBackgammonShell = createBackgammonShell(
          root,
          railModel,
          awaiting,
          result,
          presentationMode
        );
        return cachedBackgammonShell;
      }
      cachedBackgammonShell.app.dataset["presentationMode"] = presentationMode;
      cachedBackgammonShell.stage.dataset["awaiting"] = awaiting;
      cachedBackgammonShell.stage.dataset["result"] = result;
      cachedBackgammonShell.rail.replaceChildren(...renderRailPanels(railModel));
      return cachedBackgammonShell;
    }

    function renderBackgammon(root: HTMLElement) {
      const state = getState();
      document.title = state.context.room.name + " - " + getFeatureLabel(featureId);

      const railModel = getRailModel();
      if (railModel === null) {
        return;
      }
      const displayOpponent = stateRuntime.getDisplayOpponent();
      const canUserMove =
        state.game.active === true &&
        state.game.awaitingMoveFrom === "user" &&
        !state.game.blockedReason;
      const awaitingUser = state.game.active === true && state.game.awaitingMoveFrom === "user";
      const awaitingAi = state.game.active === true && state.game.awaitingMoveFrom === "ai";
      const resultKey = state.game.result || "idle";
      const awaitingKey = awaitingUser ? "user" : awaitingAi ? "ai" : "none";
      const userName = state.game.user.nickname || state.context.user.nickname;
      const userAvatar = state.context.user.avatar ?? null;

      if (backgammonStageRuntime !== null) {
        const shell = syncBackgammonShell(
          root,
          railModel,
          awaitingKey,
          resultKey,
          state.presentation.mode
        );
        backgammonStageRuntime.renderBackgammonStage(shell.boardStageHost, {
          canUserMove,
          game: state.game,
          players: {
            user: {
              name: userName,
              avatar: userAvatar,
              active: awaitingUser,
            },
            opponent: {
              name: displayOpponent.nickname,
              avatar: displayOpponent.avatar ?? null,
              active: awaitingAi,
            },
          },
        });
        return;
      }

      cachedBackgammonShell = null;
      const app = createElement("main", "backgammon-shell", "");
      app.dataset["presentationMode"] = state.presentation.mode;
      const surface = createElement("section", "backgammon-surface", "");
      const arena = createElement("section", "backgammon-arena", "");
      const rail = createElement("aside", "backgammon-rail", "");
      rail.append(...renderRailPanels(railModel));

      const stage = createElement("section", "backgammon-stage", "");
      stage.dataset["awaiting"] = awaitingKey;
      stage.dataset["result"] = resultKey;
      const boardArea = createElement("div", "backgammon-board-area", "");
      const boardStageHost = renderBoard(state.game);
      boardArea.append(boardStageHost);
      stage.append(boardArea);
      arena.append(rail, stage);
      surface.append(arena);
      app.append(surface);
      root.replaceChildren(app);
    }

    return {
      renderBootstrap,
      renderBackgammon,
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
