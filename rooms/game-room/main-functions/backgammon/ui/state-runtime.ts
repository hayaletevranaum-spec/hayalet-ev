(function (
  global: typeof globalThis & {
    GameRoomUiFactories?: GameRoomUiFactoriesRegistry;
  }
) {
  type UnknownRecord = Record<string, unknown>;
  type BackgammonTarget = "ai1" | "ai2" | "us1";
  type BackgammonStarter = "user" | "ai";
  type BackgammonInviteStarter = "user" | "opponent";
  type BackgammonAwaitingMove = "user" | "ai" | null;
  type BackgammonOwner = "user" | "ai" | "";
  type BackgammonPoint = {
    point: number;
    owner: BackgammonOwner;
    count: number;
  };
  type BackgammonSubMove = {
    from: { type: "bar"; seat: "user" | "ai" } | { type: "point"; point: number };
    to: { type: "off" } | { type: "point"; point: number };
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
    roomId: string;
    featureId: string;
    inviteId: string;
    remoteUserId: string;
    nickname: string;
    senderEmail: string;
    note: string;
    starter: BackgammonInviteStarter;
    localSessionId: string;
    conversationId: string;
    sentAt: number | null;
  };
  type BackgammonPendingInvite = BackgammonInviteEntry & {
    direction: "incoming" | "outgoing";
  };
  type BackgammonSlotState = {
    slotId: BackgammonTarget;
    nickname: string;
    avatar?: string | null;
    assigned?: boolean;
    connected?: boolean;
    ready?: boolean;
    dispatchable?: boolean;
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
    boardHash: string;
  };
  type BackgammonGameState = {
    board: BackgammonPoint[];
    boardAscii: string;
    boardHash: string;
    bar: Record<"user" | "ai", number>;
    off: Record<"user" | "ai", number>;
    dice: number[];
    legalMoves: BackgammonLegalMove[];
    active: boolean;
    awaitingMoveFrom: BackgammonAwaitingMove;
    result: string;
    winner: string;
    selectedTarget: BackgammonTarget;
    starter: BackgammonStarter;
    status: string;
    blockedReason: string;
    protocolDelivered: boolean;
    opponentReady: boolean;
    inviteId: string | null;
    matchId: string | null;
    turnIndex: number;
    turnToken: string;
    localSessionId: string | null;
    remoteUserId: string | null;
    pendingInvite: BackgammonPendingInvite | null;
    inviteInbox: BackgammonInviteEntry[];
    matchHistory: BackgammonMatchHistoryEntry[];
    opponent: BackgammonSlotState;
    user: {
      nickname: string;
    };
    scorePoints: number;
  };
  type BackgammonUiState = {
    game: BackgammonGameState;
    context: {
      slots: Record<BackgammonTarget, BackgammonSlotState>;
      user: {
        nickname: string;
      };
    };
    preferences: {
      target: BackgammonTarget;
      starter: BackgammonStarter;
      inviteMessage: string;
    };
    lastCommandMessage: string;
    locale: string;
  };
  type BackgammonUiStateRuntimeDeps = {
    getState: () => BackgammonUiState;
    roomId: string;
    featureId: string;
    createSlot: (slotId: string) => BackgammonSlotState;
    createInviteEntry: () => BackgammonInviteEntry;
    normalizeSlot: (candidate: unknown, slotId: string) => BackgammonSlotState;
    text: (path: string[]) => string;
    sendRoomCommand: (command: string, payload: UnknownRecord) => void;
  };

  type BackgammonUiStateRuntime = {
    createGameState: () => BackgammonGameState;
    sanitizeGameState: (candidate: unknown) => BackgammonGameState;
    syncPreferencesFromGame: () => void;
    getSlotOrder: () => BackgammonSlotState[];
    getSlotStatusLabel: (slot: BackgammonSlotState) => string;
    getSelectedTarget: () => BackgammonTarget;
    getDisplayOpponent: () => BackgammonSlotState;
    getCurrentStatus: () => string;
    getResultLabel: () => string;
    getTurnLabel: () => string;
    getDiceLabel: () => string;
    getBearOffLabel: () => string;
    getBarLabel: () => string;
    getStarterLabelForCurrentTarget: (value: BackgammonStarter) => string;
    formatInviteMeta: (invite: BackgammonInviteEntry) => string;
    onStart: () => void;
    onReset: () => void;
    onLegalMove: (moveId: string) => void;
    onAcceptInvite: (inviteId: string, remoteUserId: string) => void;
    onRejectInvite: (inviteId: string, remoteUserId: string) => void;
    onCancelOutgoingInvite: () => void;
    getMatchHistory: () => BackgammonMatchHistoryEntry[];
    getMatchHistoryResultLabel: (entry: BackgammonMatchHistoryEntry) => string;
    getMatchHistoryResultTone: (entry: BackgammonMatchHistoryEntry) => string;
    formatMatchHistoryDate: (entry: BackgammonMatchHistoryEntry) => string;
  };

  function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === "object" && value !== null && Array.isArray(value) === false;
  }

  function readString(value: unknown, fallback: string): string {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
  }

  function readOptionalString(value: unknown): string | null {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  }

  function readCounter(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
  }

  function readTarget(value: unknown): BackgammonTarget {
    return value === "ai2" || value === "us1" ? value : "ai1";
  }

  function readStarter(value: unknown): BackgammonStarter {
    return value === "ai" ? "ai" : "user";
  }

  function readInviteStarter(value: unknown): BackgammonInviteStarter {
    return value === "opponent" ? "opponent" : "user";
  }

  function createDefaultBoard(): BackgammonPoint[] {
    const board: BackgammonPoint[] = [];
    for (let point = 1; point <= 24; point += 1) {
      board.push({ point, owner: "", count: 0 });
    }
    [
      [24, "user", 2],
      [13, "user", 5],
      [8, "user", 3],
      [6, "user", 5],
      [1, "ai", 2],
      [12, "ai", 5],
      [17, "ai", 3],
      [19, "ai", 5],
    ].forEach(function (entry) {
      const point = entry[0] as number;
      board[point - 1] = {
        point,
        owner: entry[1] as BackgammonOwner,
        count: entry[2] as number,
      };
    });
    return board;
  }

  function normalizePoint(candidate: unknown, fallbackPoint: number): BackgammonPoint {
    const source = isRecord(candidate) ? candidate : {};
    const point =
      typeof source["point"] === "number" &&
      Number.isInteger(source["point"]) &&
      source["point"] >= 1 &&
      source["point"] <= 24
        ? source["point"]
        : fallbackPoint;
    const owner = source["owner"] === "user" || source["owner"] === "ai" ? source["owner"] : "";
    const count = readCounter(source["count"]);
    return {
      point,
      owner: count > 0 ? owner : "",
      count: owner === "" ? 0 : count,
    };
  }

  function normalizeBoard(value: unknown): BackgammonPoint[] {
    const fallback = createDefaultBoard();
    if (Array.isArray(value) === false) {
      return fallback;
    }
    const emptyOwner: BackgammonOwner = "";
    const board: BackgammonPoint[] = fallback.map(function (point) {
      return { point: point.point, owner: emptyOwner, count: 0 };
    });
    value.slice(0, 24).forEach(function (entry, index) {
      const point = normalizePoint(entry, index + 1);
      board[point.point - 1] = point;
    });
    return board;
  }

  function normalizeCounters(value: unknown): Record<"user" | "ai", number> {
    const source = isRecord(value) ? value : {};
    return {
      user: readCounter(source["user"]),
      ai: readCounter(source["ai"]),
    };
  }

  function normalizeDice(value: unknown): number[] {
    return Array.isArray(value)
      ? value.filter(function (entry): entry is number {
          return typeof entry === "number" && Number.isInteger(entry) && entry >= 1 && entry <= 6;
        })
      : [];
  }

  function normalizeLegalMoves(value: unknown): BackgammonLegalMove[] {
    if (Array.isArray(value) === false) {
      return [];
    }
    return value
      .map(function (entry): BackgammonLegalMove | null {
        if (isRecord(entry) === false) {
          return null;
        }
        const id = readString(entry["id"], "");
        if (id === "") {
          return null;
        }
        return {
          id,
          label: readString(entry["label"], id),
          moves: Array.isArray(entry["moves"]) ? (entry["moves"] as BackgammonSubMove[]) : [],
          diceUsed: normalizeDice(entry["diceUsed"]),
          pass: entry["pass"] === true,
        };
      })
      .filter(function (entry): entry is BackgammonLegalMove {
        return entry !== null;
      });
  }

  type BackgammonUiStateRuntimeRegistry = GameRoomUiFactoriesRegistry & {
    createBackgammonUiStateRuntime?: (
      deps: BackgammonUiStateRuntimeDeps
    ) => BackgammonUiStateRuntime;
  };

  const registry = (global.GameRoomUiFactories ||
    (global.GameRoomUiFactories =
      {} as GameRoomUiFactoriesRegistry)) as BackgammonUiStateRuntimeRegistry;

  registry.createBackgammonUiStateRuntime = function createBackgammonUiStateRuntime(
    deps: BackgammonUiStateRuntimeDeps
  ) {
    const getState = deps.getState;
    const roomId = deps.roomId;
    const featureId = deps.featureId;
    const createSlot = deps.createSlot;
    const createInviteEntry = deps.createInviteEntry;
    const normalizeSlot = deps.normalizeSlot;
    const text = deps.text;
    const sendRoomCommand = deps.sendRoomCommand;
    const backgammonCommandNames = {
      acceptInvite: "GameRoomBackgammonAcceptInvite",
      reset: "GameRoomBackgammonReset",
      rejectInvite: "GameRoomBackgammonRejectInvite",
      start: "GameRoomBackgammonStart",
      userMove: "GameRoomBackgammonUserMove",
    };

    function sendBackgammonCommand(
      commandKey: keyof typeof backgammonCommandNames,
      payload: UnknownRecord
    ) {
      sendRoomCommand(backgammonCommandNames[commandKey], payload);
    }

    function createGameState(): BackgammonGameState {
      return {
        board: createDefaultBoard(),
        boardAscii: "",
        boardHash: "",
        bar: { user: 0, ai: 0 },
        off: { user: 0, ai: 0 },
        dice: [],
        legalMoves: [],
        active: false,
        awaitingMoveFrom: null,
        result: "idle",
        winner: "",
        selectedTarget: "ai1",
        starter: "user",
        status: "",
        blockedReason: "",
        protocolDelivered: false,
        opponentReady: false,
        inviteId: null,
        matchId: null,
        turnIndex: 0,
        turnToken: "",
        localSessionId: null,
        remoteUserId: null,
        pendingInvite: null,
        inviteInbox: [],
        matchHistory: [],
        opponent: createSlot("ai1"),
        user: {
          nickname: "User",
        },
        scorePoints: 1,
      };
    }

    function normalizeInviteEntry(candidate: unknown): BackgammonInviteEntry {
      const source = isRecord(candidate) ? candidate : {};
      const entry = createInviteEntry();
      entry.roomId = readString(source["roomId"], roomId);
      entry.featureId = readString(source["featureId"], featureId);
      entry.inviteId = readString(source["inviteId"], readString(source["matchId"], ""));
      entry.remoteUserId = readString(source["remoteUserId"], "");
      entry.nickname = readString(source["nickname"], readString(source["senderNickname"], "US1"));
      entry.senderEmail = readString(source["senderEmail"], "");
      entry.note = readString(source["note"], "");
      entry.starter = readInviteStarter(source["starter"]);
      entry.localSessionId = readString(source["localSessionId"], "");
      entry.conversationId = readString(source["conversationId"], "");
      entry.sentAt =
        typeof source["sentAt"] === "number" &&
        Number.isFinite(source["sentAt"]) &&
        source["sentAt"] >= 0
          ? Math.trunc(source["sentAt"])
          : null;
      return entry;
    }

    function normalizeInviteInbox(value: unknown): BackgammonInviteEntry[] {
      return Array.isArray(value)
        ? value
            .map(normalizeInviteEntry)
            .filter((entry) => entry.inviteId !== "" && entry.remoteUserId !== "")
        : [];
    }

    function normalizePendingInvite(value: unknown): BackgammonPendingInvite | null {
      if (isRecord(value) === false) {
        return null;
      }
      const entry = normalizeInviteEntry(value);
      if (entry.inviteId === "" || entry.remoteUserId === "") {
        return null;
      }
      return {
        ...entry,
        direction: value["direction"] === "incoming" ? "incoming" : "outgoing",
      };
    }

    function normalizeMatchHistory(value: unknown): BackgammonMatchHistoryEntry[] {
      if (Array.isArray(value) === false) {
        return [];
      }
      return value
        .map(function (entry): BackgammonMatchHistoryEntry | null {
          if (isRecord(entry) === false) {
            return null;
          }
          const id = readString(entry["id"], "");
          const result = entry["result"];
          if (id === "" || (result !== "user-win" && result !== "ai-win")) {
            return null;
          }
          return {
            id,
            finishedAt: readCounter(entry["finishedAt"]),
            target: readString(entry["target"], "ai1"),
            opponentNickname: readString(entry["opponentNickname"], "Rakip"),
            opponentAvatar: readOptionalString(entry["opponentAvatar"]),
            userNickname: readString(entry["userNickname"], "User"),
            result,
            starter: entry["starter"] === "ai" ? "ai" : "user",
            scorePoints: readCounter(entry["scorePoints"]) || 1,
            boardHash: readString(entry["boardHash"], ""),
          };
        })
        .filter((entry): entry is BackgammonMatchHistoryEntry => entry !== null)
        .slice(0, 20);
    }

    function sanitizeGameState(candidate: unknown): BackgammonGameState {
      const source = isRecord(candidate) ? candidate : {};
      const next = createGameState();
      next.board = normalizeBoard(source["board"]);
      next.boardAscii = readString(source["boardAscii"], "");
      next.boardHash = readString(source["boardHash"], "");
      next.bar = normalizeCounters(source["bar"]);
      next.off = normalizeCounters(source["off"]);
      next.dice = normalizeDice(source["dice"]);
      next.legalMoves = normalizeLegalMoves(source["legalMoves"]);
      next.active = source["active"] === true;
      next.awaitingMoveFrom =
        source["awaitingMoveFrom"] === "user" || source["awaitingMoveFrom"] === "ai"
          ? source["awaitingMoveFrom"]
          : null;
      next.result = readString(source["result"], "idle");
      next.winner =
        source["winner"] === "user" || source["winner"] === "ai" ? source["winner"] : "";
      next.selectedTarget = readTarget(source["selectedTarget"]);
      next.starter = readStarter(source["starter"]);
      next.status = readString(source["status"], "");
      next.blockedReason = readString(source["blockedReason"], "");
      next.protocolDelivered = source["protocolDelivered"] === true;
      next.opponentReady = source["opponentReady"] === true;
      next.inviteId = readOptionalString(source["inviteId"]);
      next.matchId = readOptionalString(source["matchId"]);
      next.turnIndex = readCounter(source["turnIndex"]);
      next.turnToken = readString(source["turnToken"], "");
      next.localSessionId = readOptionalString(source["localSessionId"]);
      next.remoteUserId = readOptionalString(source["remoteUserId"]);
      next.pendingInvite = normalizePendingInvite(source["pendingInvite"]);
      next.inviteInbox = normalizeInviteInbox(source["inviteInbox"]);
      next.matchHistory = normalizeMatchHistory(source["matchHistory"]);
      next.opponent = normalizeSlot(source["opponent"], next.selectedTarget);
      next.scorePoints = readCounter(source["scorePoints"]) || 1;
      if (isRecord(source["user"])) {
        next.user.nickname = readString(source["user"]["nickname"], next.user.nickname);
      }
      return next;
    }

    function getSlotOrder(): BackgammonSlotState[] {
      const state = getState();
      return [state.context.slots.ai1, state.context.slots.ai2, state.context.slots.us1];
    }

    function getSlotStatusLabel(slot: BackgammonSlotState): string {
      if (slot.ready === true) {
        return text(["backgammon", "slotState", "ready"]);
      }
      if (slot.assigned === true && slot.connected !== true) {
        return text(["backgammon", "slotState", "disconnected"]);
      }
      if (slot.assigned === true) {
        return text(["backgammon", "slotState", "assigned"]);
      }
      return text(["backgammon", "slotState", "empty"]);
    }

    function getSelectedTarget(): BackgammonTarget {
      return readTarget(getState().preferences.target);
    }

    function getDisplayOpponent(): BackgammonSlotState {
      const state = getState();
      if (state.game.active === true) {
        return state.game.opponent;
      }
      if (state.game.pendingInvite && state.game.pendingInvite.nickname) {
        return {
          slotId: "us1",
          nickname: state.game.pendingInvite.nickname,
        };
      }
      return state.context.slots[getSelectedTarget()];
    }

    function getCurrentStatus(): string {
      const state = getState();
      return (
        readString(state.lastCommandMessage, "") ||
        readString(state.game.status, "") ||
        text(["backgammon", "status", "idle"])
      );
    }

    function getResultLabel(): string {
      const state = getState();
      if (state.game.result === "user-win") {
        return text(["backgammon", "results", "user-win"]);
      }
      if (state.game.result === "ai-win") {
        return text(["backgammon", "results", "ai-win"]);
      }
      if (state.game.result === "blocked") {
        return text(["backgammon", "results", "blocked"]);
      }
      return state.game.active === true
        ? text(["backgammon", "results", "pending"])
        : text(["backgammon", "results", "idle"]);
    }

    function getTurnLabel(): string {
      const state = getState();
      if (state.game.awaitingMoveFrom === "user") {
        return state.game.user.nickname || state.context.user.nickname;
      }
      if (state.game.awaitingMoveFrom === "ai") {
        return state.game.opponent.nickname;
      }
      return text(["backgammon", "turns", "idle"]);
    }

    function getDiceLabel(): string {
      const dice = getState().game.dice;
      return dice.length > 0 ? dice.join(" - ") : "-";
    }

    function getBearOffLabel(): string {
      const off = getState().game.off;
      return "User " + off.user + " / Opponent " + off.ai;
    }

    function getBarLabel(): string {
      const bar = getState().game.bar;
      return "User " + bar.user + " / Opponent " + bar.ai;
    }

    function getStarterLabelForCurrentTarget(value: BackgammonStarter): string {
      if (getSelectedTarget() === "us1") {
        return value === "ai"
          ? text(["backgammon", "topbar", "starterRemote"])
          : text(["backgammon", "topbar", "starterUser"]);
      }
      return value === "ai"
        ? text(["backgammon", "topbar", "starterAi"])
        : text(["backgammon", "topbar", "starterUser"]);
    }

    function formatInviteMeta(invite: BackgammonInviteEntry): string {
      const starterLabel =
        invite.starter === "opponent"
          ? text(["backgammon", "invites", "starterRemote"])
          : text(["backgammon", "invites", "starterUser"]);
      return invite.sentAt === null
        ? starterLabel
        : starterLabel + " - " + new Date(invite.sentAt).toLocaleString(getState().locale);
    }

    function onStart() {
      const state = getState();
      state.lastCommandMessage = "";
      sendBackgammonCommand("start", {
        target: getSelectedTarget(),
        starter: state.preferences.starter === "ai" ? "ai" : "user",
        inviteMessage: state.preferences.inviteMessage,
      });
    }

    function onReset() {
      getState().lastCommandMessage = "";
      sendBackgammonCommand("reset", {});
    }

    function onLegalMove(moveId: string) {
      const state = getState();
      if (
        state.game.active !== true ||
        state.game.awaitingMoveFrom !== "user" ||
        state.game.blockedReason
      ) {
        return;
      }
      getState().lastCommandMessage = "";
      sendBackgammonCommand("userMove", {
        legalMoveId: moveId,
        turnToken: state.game.turnToken,
        turnIndex: state.game.turnIndex,
      });
    }

    function onAcceptInvite(inviteId: string, remoteUserId: string) {
      getState().lastCommandMessage = "";
      sendRoomCommand("GameRoomBackgammonAcceptInvite", { inviteId, remoteUserId });
    }

    function onRejectInvite(inviteId: string, remoteUserId: string) {
      getState().lastCommandMessage = "";
      sendRoomCommand("GameRoomBackgammonRejectInvite", { inviteId, remoteUserId });
    }

    function onCancelOutgoingInvite() {
      getState().lastCommandMessage = "";
      sendBackgammonCommand("reset", {});
    }

    function getMatchHistory(): BackgammonMatchHistoryEntry[] {
      return getState().game.matchHistory;
    }

    function getMatchHistoryResultLabel(entry: BackgammonMatchHistoryEntry): string {
      return entry.result === "user-win"
        ? text(["backgammon", "history", "win"])
        : text(["backgammon", "history", "loss"]);
    }

    function getMatchHistoryResultTone(entry: BackgammonMatchHistoryEntry): string {
      return entry.result === "user-win" ? "win" : "loss";
    }

    function formatMatchHistoryDate(entry: BackgammonMatchHistoryEntry): string {
      if (!entry.finishedAt || entry.finishedAt <= 0) {
        return "";
      }
      try {
        return new Date(entry.finishedAt).toLocaleString(getState().locale);
      } catch (_error) {
        return "";
      }
    }

    function syncPreferencesFromGame() {
      const state = getState();
      if (
        state.game.active !== true &&
        state.game.pendingInvite === null &&
        state.game.inviteId === null &&
        state.game.remoteUserId === null
      ) {
        return;
      }
      state.preferences.target = state.game.selectedTarget;
      state.preferences.starter = state.game.starter;
    }

    return {
      createGameState,
      sanitizeGameState,
      syncPreferencesFromGame,
      getSlotOrder,
      getSlotStatusLabel,
      getSelectedTarget,
      getDisplayOpponent,
      getCurrentStatus,
      getResultLabel,
      getTurnLabel,
      getDiceLabel,
      getBearOffLabel,
      getBarLabel,
      getStarterLabelForCurrentTarget,
      formatInviteMeta,
      onStart,
      onReset,
      onLegalMove,
      onAcceptInvite,
      onRejectInvite,
      onCancelOutgoingInvite,
      getMatchHistory,
      getMatchHistoryResultLabel,
      getMatchHistoryResultTone,
      formatMatchHistoryDate,
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
