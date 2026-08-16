import test from "node:test";
import assert from "node:assert/strict";
import { loadGameRoomHostModule } from "./helpers/game-room-host-module.ts";

const gameRoomHostModule = await loadGameRoomHostModule();

interface BackgammonHostRuntime {
  api: {
    notifyRoom: (type: string, payload?: Record<string, unknown>) => void;
    dispatchBridge: (payload: Record<string, unknown>) => Record<string, unknown>;
    dispatchRoomCommand: (
      commandName: string,
      payload?: Record<string, unknown>
    ) => Promise<Record<string, unknown>>;
    getUs1Identity: () => { remoteUserId: string; nickname: string; email: string };
    isUs1Connected: () => boolean;
    showToast: (payload: { type?: string; message?: string }) => void;
    getLocale: () => string;
    getState: (key: string) => unknown;
    setState: (key: string, value: unknown) => unknown;
    deleteState: (key: string) => boolean;
    log: () => undefined;
  };
  state: Map<string, unknown>;
  protocolCalls: Array<Record<string, unknown>>;
  messageCalls: Array<Record<string, unknown>>;
  us1MessageCalls: Array<Record<string, unknown>>;
  us1SyncCalls: Array<Record<string, unknown>>;
  dispatchCalls: Array<Record<string, unknown>>;
  notifications: Array<{ type: string; payload: Record<string, unknown> }>;
  toastCalls: Array<{ type?: string; message?: string }>;
  selectedRemoteUsers: Array<string | null>;
  exported: Record<string, unknown>;
  enqueueUs1SyncResult: (result: Record<string, unknown>) => void;
  emitHostContext: (context: Record<string, unknown>) => Promise<void>;
  markReady: () => Promise<void>;
  latestGameState: () => GameState;
  latestCommandResult: () => CommandResult | undefined;
}

type HostRuntime = BackgammonHostRuntime;
type CommandResult = Record<string, unknown> & { success?: boolean; message?: string };
type GameState = Record<string, unknown>;
type LegalMove = {
  id: string;
  label?: string;
  diceUsed?: number[];
  moves?: unknown[];
};

const activeRuntimes: HostRuntime[] = [];

function str(v: unknown): string {
  return typeof v === "string" ? v : String(v);
}

async function flushHostTasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function createRoomHostRuntime(): BackgammonHostRuntime {
  const state = new Map<string, unknown>();
  const protocolCalls: Array<Record<string, unknown>> = [];
  const messageCalls: Array<Record<string, unknown>> = [];
  const us1MessageCalls: Array<Record<string, unknown>> = [];
  const us1SyncCalls: Array<Record<string, unknown>> = [];
  const dispatchCalls: Array<Record<string, unknown>> = [];
  const notifications: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const toastCalls: Array<{ type?: string; message?: string }> = [];
  const selectedRemoteUsers: Array<string | null> = [];
  const us1SyncQueue: Array<Record<string, unknown>> = [];
  const api = {
    notifyRoom(type: string, payload: Record<string, unknown> = {}) {
      notifications.push({ type, payload });
    },
    dispatchBridge: (payload: Record<string, unknown>) => {
      dispatchCalls.push(payload);
      const target =
        typeof payload["toSlot"] === "string"
          ? payload["toSlot"]
          : Array.isArray(payload["toSlots"]) && typeof payload["toSlots"][0] === "string"
            ? payload["toSlots"][0]
            : null;
      const bridgePayload =
        payload["payload"] !== null && typeof payload["payload"] === "object"
          ? (payload["payload"] as Record<string, unknown>)
          : {};
      const protocol =
        bridgePayload["protocol"] !== null && typeof bridgePayload["protocol"] === "object"
          ? (bridgePayload["protocol"] as Record<string, unknown>)
          : null;

      if (protocol !== null) {
        protocolCalls.push(protocol);
      }

      if (
        target !== "us1" &&
        ((typeof bridgePayload["text"] === "string" && bridgePayload["text"].trim() !== "") ||
          typeof bridgePayload["page"] === "string")
      ) {
        messageCalls.push({
          provider: target,
          text: bridgePayload["text"],
          page: bridgePayload["page"],
        });
      }

      if (payload["action"] === "message.send" && target === "us1") {
        const remoteUserId =
          typeof bridgePayload["remoteUserId"] === "string" && bridgePayload["remoteUserId"].trim() !== ""
            ? bridgePayload["remoteUserId"]
            : (selectedRemoteUsers.at(-1) ?? "remote@example.com");
        selectedRemoteUsers.push(remoteUserId);
        us1MessageCalls.push({
          localSessionId:
            payload["sessionRef"] !== null &&
            typeof payload["sessionRef"] === "object" &&
            typeof (payload["sessionRef"] as Record<string, unknown>)["id"] === "string"
              ? (payload["sessionRef"] as Record<string, unknown>)["id"]
              : null,
          text: bridgePayload["text"],
          roomEvent: bridgePayload["roomEvent"],
          roomCommand: bridgePayload["roomCommand"],
          remoteUserId,
        });
        return {
          success: true,
          session: {
            id:
              typeof us1MessageCalls.at(-1)?.["localSessionId"] === "string" &&
              String(us1MessageCalls.at(-1)?.["localSessionId"]).trim() !== ""
                ? us1MessageCalls.at(-1)?.["localSessionId"]
                : `us1-session-${us1MessageCalls.length}`,
            conversationId: `us1-conversation-${us1MessageCalls.length}`,
          },
          data: {
            remoteUserId,
            transportMessageId: `<us1-${us1MessageCalls.length}@example.test>`,
          },
        };
      }

      if (payload["action"] === "session.sync" && target === "us1") {
        us1SyncCalls.push({
          localSessionId:
            payload["sessionRef"] !== null &&
            typeof payload["sessionRef"] === "object" &&
            typeof (payload["sessionRef"] as Record<string, unknown>)["id"] === "string"
              ? (payload["sessionRef"] as Record<string, unknown>)["id"]
              : null,
          consumeRoomCommands: bridgePayload["consumeRoomCommands"],
        });
        const queued = us1SyncQueue.shift() ?? {};
        return {
          success: true,
          session: {
            id:
              typeof queued["localSessionId"] === "string" && queued["localSessionId"].trim() !== ""
                ? queued["localSessionId"]
                : null,
            conversationId:
              typeof queued["conversationId"] === "string" && queued["conversationId"].trim() !== ""
                ? queued["conversationId"]
                : null,
          },
          data: {
            fetchedCount: 0,
            processedCount: 0,
            duplicateCount: 0,
            projectedCount: 0,
            skippedCount: 0,
            unresolvedSessionCount: 0,
            roomPackages: [],
            roomEvents: [],
            roomCommands: [],
            roomInviteInbox: [],
            ...queued,
          },
        };
      }

      return { success: true };
    },
    dispatchRoomCommand: async (commandName: string, payload: Record<string, unknown> = {}) => {
      dispatchCalls.push({ commandName, ...payload });
      const commands = exported["commands"] as Record<string, (payload?: unknown) => unknown>;
      const handler = commands[commandName];
      if (typeof handler === "function") {
        return await handler({
          provider: "us1",
          roomArgs: payload["roomPayload"],
          args: payload["args"],
          transportMessageId: payload["transportMessageId"],
          localSessionId: payload["localSessionId"],
          remoteUserId: payload["remoteUserId"],
        }) as Record<string, unknown>;
      }
      return { success: false, message: `Unknown command: ${commandName}` };
    },
    getUs1Identity: () => ({
      remoteUserId: selectedRemoteUsers.at(-1) ?? "remote@example.com",
      nickname: "Remote Ghost",
      email: "remote@example.com",
    }),
    isUs1Connected: () => true,
    showToast: (payload: { type?: string; message?: string }) => {
      toastCalls.push(payload);
    },
    getLocale: () => "en",
    getState: (key: string) => state.get(key),
    setState: (key: string, value: unknown) => {
      state.set(key, value);
      return value;
    },
    deleteState: (key: string) => state.delete(key),
    log: () => undefined,
  };

  const exported: Record<string, unknown> = gameRoomHostModule.default.activate(api);

  const runtime = {
    api,
    state,
    protocolCalls,
    messageCalls,
    us1MessageCalls,
    us1SyncCalls,
    dispatchCalls,
    notifications,
    toastCalls,
    selectedRemoteUsers,
    exported,
    enqueueUs1SyncResult(result: Record<string, unknown>) {
      us1SyncQueue.push(result);
    },
    async emitHostContext(context: Record<string, unknown>) {
      const handler = runtime.exported["onRoomEvent"];
      assert.equal(typeof handler, "function");
      (handler as (payload: unknown) => unknown)(context);
      await flushHostTasks();
    },
    async markReady() {
      const handler = runtime.exported["onRoomReady"];
      assert.equal(typeof handler, "function");
      (handler as () => unknown)();
      await flushHostTasks();
    },
    latestGameState(): GameState {
      const latest = notifications.filter((entry) => entry.type === "backgammon-state").at(-1)
        ?.payload["state"] as GameState | undefined;
      assert.ok(latest, "expected latest backgammon-state notification");
      return latest;
    },
    latestCommandResult() {
      const cmdResultEntry = notifications.filter((entry) => entry.type === "command-result").at(-1);
if (cmdResultEntry == null) return undefined;
return cmdResultEntry.payload["result"] as CommandResult | undefined;
    },
  };

  activeRuntimes.push(runtime);
  return runtime;
}

test.afterEach(async () => {
  const results: Array<Promise<void>> = [];
  for (const runtime of activeRuntimes.splice(0)) {
    const dispose = runtime.exported["dispose"];
    if (typeof dispose === "function") {
      (dispose as () => void)();
      results.push(Promise.resolve());
    }
  }
  await Promise.all(results);
});

function buildReadyHostContext(
  target: "ai1" | "ai2" | "us1" = "ai1",
  options: {
    us1RemoteUserId?: string;
    us1Nickname?: string;
    us1Ready?: boolean;
  } = {}
) {
  const user = {
    nickname: "Raistlin",
  };
  const slots = {
    ai1: {
      slotId: "ai1",
      nickname: target === "ai1" ? "Alpha" : "Beta",
      assigned: true,
      connected: true,
      ready: true,
      state: "connected",
    },
    ai2: {
      slotId: "ai2",
      nickname: target === "ai2" ? "Beta" : "Alpha",
      assigned: true,
      connected: true,
      ready: true,
      state: "connected",
    },
    us1: {
      slotId: "us1",
      nickname: options.us1Nickname ?? "Remote Ghost",
      assigned: true,
      connected: options.us1Ready !== false,
      ready: options.us1Ready !== false,
      state: options.us1Ready === false ? "assigned" : "connected",
      remoteUserId: options.us1RemoteUserId ?? "remote@example.com",
    },
  };
  return {
    type: "host-context",
    locale: "en",
    user,
    slots,
    presence: {
      user: { ...user },
      slots: {
        ai1: { ...slots.ai1 },
        ai2: { ...slots.ai2 },
        us1: { ...slots.us1 },
      },
    },
  };
}

async function runCommand(
  runtime: HostRuntime,
  commandName: string,
  payload: unknown = {}
): Promise<CommandResult> {
  const commands = runtime.exported["commands"] as Record<string, (payload?: unknown) => unknown>;
  const handler = commands[commandName];
  assert.ok(handler != null, commandName);
  return (await handler(payload)) as CommandResult;
}

async function startMatch(
  runtime: HostRuntime,
  options: {
    target?: "ai1" | "ai2" | "us1";
    starter?: "user" | "ai";
    inviteMessage?: string;
    commandName?: string;
  } = {}
) {
  const target = options.target ?? "ai1";
  const starter = options.starter ?? "user";
  await runtime.emitHostContext(buildReadyHostContext(target));
  await runtime.markReady();
  return await runCommand(runtime, options.commandName ?? "GameRoomBackgammonStart", {
    roomArgs: {
      target,
      starter,
      ...(options.inviteMessage !== undefined ? { inviteMessage: options.inviteMessage } : {}),
    },
  });
}

function readLegalMoves(state: GameState): LegalMove[] {
  assert.ok(Array.isArray(state["legalMoves"]), "expected legalMoves array");
  return state["legalMoves"] as LegalMove[];
}

function firstLegalMove(state: GameState): LegalMove {
  const move = readLegalMoves(state)[0];
  assert.ok(move, "expected at least one legal move");
  assert.equal(typeof move.id, "string");
  return move;
}

function moveStepsForCommand(move: LegalMove): unknown[] {
  assert.ok(Array.isArray(move.moves), "expected legal move steps");
  return move.moves.map((step) => {
    assert.ok(step !== null && typeof step === "object" && Array.isArray(step) === false);
    const source = step as Record<string, unknown>;
    return {
      from: source["from"],
      to: source["to"],
    };
  });
}

async function applyUserLegalMove(
  runtime: HostRuntime,
  commandName = "GameRoomBackgammonUserMove"
) {
  const state = runtime.latestGameState();
  const move = firstLegalMove(state);
  return await runCommand(runtime, commandName, {
    roomArgs: {
      legalMoveId: move.id,
      turnToken: state['turnToken'],
      turnIndex: state['turnIndex'],
    },
  });
}

async function applyAiMoveSteps(
  runtime: HostRuntime,
  provider: "ai1" | "ai2" = "ai1",
  commandName = "GameRoomBackgammonAiMove"
) {
  const state = runtime.latestGameState();
  const move = firstLegalMove(state);
  return await runCommand(runtime, commandName, {
    provider,
    roomArgs: {
      moves: moveStepsForCommand(move),
    },
  });
}

async function applyRemoteMove(
  runtime: HostRuntime,
  options: {
    matchId: string;
    legalMoveId: string;
    turnToken: unknown;
    turnIndex: unknown;
    boardHashBeforeMove: unknown;
    remoteUserId?: string;
    transportMessageId?: string;
  }
) {
  return await runCommand(runtime, "GameRoomBackgammonRemoteMove", {
    provider: "us1",
    remoteUserId: options.remoteUserId ?? str(runtime.latestGameState()['remoteUserId']),
    ...(options.transportMessageId !== undefined
      ? { transportMessageId: options.transportMessageId }
      : {}),
    roomArgs: {
      matchId: options.matchId,
      inviteId: options.matchId,
      legalMoveId: options.legalMoveId,
      turnToken: options.turnToken,
      turnIndex: options.turnIndex,
      boardHashBeforeMove: options.boardHashBeforeMove,
    },
  });
}

void test("game-room Tavla delays protocol until the first AI turn when the user starts", async () => {
  const runtime = createRoomHostRuntime();
  const startResult = await startMatch(runtime, { target: "ai1", starter: "user" });

  assert.equal(startResult.success, true);
  assert.equal(runtime.protocolCalls.length, 0);
  assert.equal(runtime.latestGameState()['awaitingMoveFrom'], "user");
  assert.ok(readLegalMoves(runtime.latestGameState()).length > 0);

  const userMoveResult = await applyUserLegalMove(runtime);

  assert.equal(userMoveResult.success, true);
  assert.equal(runtime.protocolCalls.length, 1);
  assert.equal(runtime.messageCalls.length, 1);
  assert.equal((runtime.protocolCalls[0] as Record<string, unknown>)['scenario'], "backgammon-user-start");
  const protocolContext = (runtime.protocolCalls[0] as Record<string, unknown>)['context'] as Record<string, unknown>;
  assert.match(str(runtime.messageCalls[0]?.["text"] ?? ""), /GameRoomBackgammonAiMove/);
  assert.doesNotMatch(str(runtime.messageCalls[0]?.["text"] ?? ""), /Legal moves:/);
  assert.doesNotMatch(str(runtime.messageCalls[0]?.["text"] ?? ""), /legalMoveId/);
  assert.equal("legalMoveIds" in protocolContext, false);
  assert.equal("turnToken" in protocolContext, false);
  assert.ok(Array.isArray(protocolContext["board"]));
  assert.equal(runtime.latestGameState()['selectedTarget'], "ai1");
  assert.equal(runtime.latestGameState()['awaitingMoveFrom'], "ai");
  assert.equal(runtime.latestGameState()['protocolDelivered'], true);
});

void test("game-room Tavla sends protocol immediately when the AI starts", async () => {
  const runtime = createRoomHostRuntime();
  const startResult = await startMatch(runtime, { target: "ai2", starter: "ai" });

  assert.equal(startResult.success, true);
  assert.equal(runtime.protocolCalls.length, 1);
  assert.equal(runtime.messageCalls.length, 1);
  assert.equal(runtime.protocolCalls[0]?.['scenario'], "backgammon-ai-start");
  assert.equal(runtime.latestGameState()['selectedTarget'], "ai2");
  assert.equal(runtime.latestGameState()['awaitingMoveFrom'], "ai");
  assert.doesNotMatch(str(runtime.messageCalls[0]?.["text"] ?? ""), /legalMoveId/);

  const aiMoveResult = await applyAiMoveSteps(runtime, "ai2");

  assert.equal(aiMoveResult.success, true);
  assert.equal(runtime.latestGameState()['awaitingMoveFrom'], "user");
  assert.equal(runtime.latestGameState()['turnIndex'], 1);
});

void test("game-room Tavla starts against an assigned disconnected AI slot", async () => {
  const runtime = createRoomHostRuntime();
  const context = buildReadyHostContext("ai1");
  for (const slot of [context.slots.ai1, context.presence.slots.ai1]) {
    slot.connected = false;
    slot.ready = false;
    slot.state = "assigned";
  }
  await runtime.emitHostContext(context);
  await runtime.markReady();

  const startResult = await runCommand(runtime, "GameRoomBackgammonStart", {
    roomArgs: {
      target: "ai1",
      starter: "user",
    },
  });

  assert.equal(startResult.success, true);
  assert.equal(runtime.latestGameState()['active'], true);
  assert.equal(runtime.latestGameState()['opponentReady'], true);
  assert.ok(
    runtime.dispatchCalls.some(
      (call: Record<string, unknown>) => call["action"] === "connection.ensure" && call["toSlot"] === "ai1"
    )
  );
  assert.equal(runtime.messageCalls.length, 0);
});

void test("game-room Tavla rejects stale tokens and invalid user legal move ids", async () => {
  const runtime = createRoomHostRuntime();
  await startMatch(runtime, { target: "ai1", starter: "user" });

  const staleTokenResult = await runCommand(runtime, "GameRoomBackgammonUserMove", {
    roomArgs: {
      legalMoveId: firstLegalMove(runtime.latestGameState()).id,
      turnToken: "stale-token",
      turnIndex: 0,
    },
  });
  const invalidMoveResult = await runCommand(runtime, "GameRoomBackgammonUserMove", {
    roomArgs: {
      legalMoveId: "missing-move",
      turnToken: runtime.latestGameState()['turnToken'],
      turnIndex: 0,
    },
  });
  const legalMoveResult = await applyUserLegalMove(runtime);

  assert.equal(staleTokenResult.success, false);
  assert.match(String(staleTokenResult.message ?? ""), /stale/i);
  assert.equal(invalidMoveResult.success, false);
  assert.match(String(invalidMoveResult.message ?? ""), /legal Tavla move/i);
  assert.equal(legalMoveResult.success, true);
});

void test("game-room Tavla blocks invalid opponent legal move ids", async () => {
  const runtime = createRoomHostRuntime();
  await startMatch(runtime, { target: "ai1", starter: "user" });
  await applyUserLegalMove(runtime);

  const invalidAiMoveResult = await runCommand(runtime, "GameRoomBackgammonAiMove", {
    provider: "ai1",
    roomArgs: {
      legalMoveId: "missing-move",
      turnToken: runtime.latestGameState()['turnToken'],
      turnIndex: runtime.latestGameState()['turnIndex'],
    },
  });

  assert.equal(invalidAiMoveResult.success, false);
  assert.equal(runtime.latestGameState()['result'], "blocked");
  assert.equal(runtime.latestGameState()['blockedReason'], "ai-invalid-move");
});

void test("game-room Tavla sends US1 invites with Tavla note metadata", async () => {
  const runtime = createRoomHostRuntime();
  const startResult = await startMatch(runtime, {
    target: "us1",
    starter: "user",
    inviteMessage: "Ready for a rematch?",
  });

  assert.equal(startResult.success, true);
  assert.equal(runtime.protocolCalls.length, 0);
  assert.equal(runtime.us1MessageCalls.length, 1);
  const us1Msg0 = runtime.us1MessageCalls[0] as Record<string, unknown>;
  const roomEvent = us1Msg0["roomEvent"] as Record<string, unknown>;
  assert.equal(roomEvent["eventType"], "invite");
  assert.equal(roomEvent["note"], "Ready for a rematch?");
  assert.equal(roomEvent["starter"], "user");
  assert.match(
    str(us1Msg0["text"] ?? ""),
    /^Ready for a rematch\?\n\nTavla invite/
  );
  assert.equal(runtime.latestGameState()['selectedTarget'], "us1");
  assert.equal(
    (runtime.latestGameState()['pendingInvite'] as Record<string, unknown>)["direction"],
    "outgoing"
  );
  assert.equal(roomEvent["matchId"], runtime.latestGameState()['matchId']);
});

void test("game-room Tavla sends mirrored US1 legal move metadata after accept", async () => {
  const runtime = createRoomHostRuntime();
  await startMatch(runtime, {
    target: "us1",
    starter: "user",
    inviteMessage: "Ready?",
  });
  const pendingInvite = runtime.latestGameState()['pendingInvite'] as Record<string, unknown>;
  runtime.enqueueUs1SyncResult({
    roomEvents: [
      {
        roomId: "game-room",
        featureId: "backgammon",
        inviteId: pendingInvite["inviteId"],
        matchId: pendingInvite["matchId"],
        eventType: "accept",
        starter: "user",
        remoteUserId: pendingInvite["remoteUserId"],
        localSessionId: runtime.latestGameState()['localSessionId'],
        conversationId: "us1-conversation-1",
        transportMessageId: "<accept-move-meta@example.test>",
        sentAt: 1700000004500,
        senderNickname: pendingInvite["nickname"],
        senderEmail: str(pendingInvite["remoteUserId"]),
      },
    ],
  });
  await runtime.emitHostContext(
    buildReadyHostContext("us1", {
      us1RemoteUserId: String(pendingInvite["remoteUserId"]),
      us1Nickname: String(pendingInvite["nickname"]),
    })
  );

  const beforeMove = runtime.latestGameState();
  const localLegalMove = firstLegalMove(beforeMove);
  const userMoveResult = await applyUserLegalMove(runtime);
  const sentCommand = runtime.us1MessageCalls[1]?.['roomCommand'] as Record<string, unknown>;
  const roomPayload = sentCommand["roomPayload"] as Record<string, unknown>;

  assert.equal(userMoveResult.success, true);
  assert.equal(sentCommand["commandName"], "GameRoomBackgammonRemoteMove");
  assert.equal(sentCommand["matchId"], pendingInvite["matchId"]);
  assert.equal(sentCommand["turnIndex"], 0);
  assert.equal(typeof sentCommand["boardHashBeforeMove"], "string");
  assert.notEqual(sentCommand["boardHashBeforeMove"], "");
  assert.equal(typeof roomPayload["legalMoveId"], "string");
  assert.equal(roomPayload["turnToken"], beforeMove["turnToken"]);
  assert.equal(roomPayload["turnIndex"], 0);
  assert.notEqual(roomPayload["legalMoveId"], localLegalMove.id);
  assert.match(str(runtime.us1MessageCalls[1]?.['text'] ?? ""), /GameRoomBackgammonRemoteMove/);
  assert.equal(runtime.latestGameState()['turnIndex'], 1);
});

void test("game-room Tavla applies generated US1 remote moves and rejects duplicate or stale moves", async () => {
  const runtime = createRoomHostRuntime();
  const inviteEntry = {
    roomId: "game-room",
    featureId: "backgammon",
    inviteId: "invite-replay",
    matchId: "invite-replay",
    remoteUserId: "challenger@example.com",
    nickname: "Challenger",
    starter: "user",
    localSessionId: "challenger-session-replay",
    conversationId: "challenger-conversation-replay",
  };
  runtime.api.setState("backgammon-invite-inbox", [inviteEntry]);
  runtime.api.setState(
    "backgammon-context",
    buildReadyHostContext("us1", {
      us1RemoteUserId: "challenger@example.com",
      us1Nickname: "Challenger",
    })
  );
  const acceptResult = await runCommand(runtime, "GameRoomBackgammonAcceptInvite", {
    roomArgs: { inviteId: "invite-replay" },
  });

  assert.equal(acceptResult.success, true);
  assert.equal(runtime.latestGameState()['awaitingMoveFrom'], "ai");
  const firstRemoteState = runtime.latestGameState();
  const firstRemoteMove = firstLegalMove(firstRemoteState);
  const firstMoveResult = await applyRemoteMove(runtime, {
    matchId: "invite-replay",
    legalMoveId: firstRemoteMove.id,
    turnToken: firstRemoteState['turnToken'],
    turnIndex: firstRemoteState['turnIndex'],
    boardHashBeforeMove: firstRemoteState['boardHash'],
    transportMessageId: "<remote-replay-1@example.test>",
  });
  const duplicateMoveResult = await applyRemoteMove(runtime, {
    matchId: "invite-replay",
    legalMoveId: firstRemoteMove.id,
    turnToken: firstRemoteState['turnToken'],
    turnIndex: firstRemoteState['turnIndex'],
    boardHashBeforeMove: firstRemoteState['boardHash'],
    transportMessageId: "<remote-replay-1@example.test>",
  });
  const staleMoveResult = await applyRemoteMove(runtime, {
    matchId: "invite-replay",
    legalMoveId: firstRemoteMove.id,
    turnToken: firstRemoteState['turnToken'],
    turnIndex: firstRemoteState['turnIndex'],
    boardHashBeforeMove: firstRemoteState['boardHash'],
    transportMessageId: "<remote-replay-2@example.test>",
  });

  assert.equal(firstMoveResult.success, true);
  assert.equal(runtime.latestGameState()['awaitingMoveFrom'], "user");
  assert.equal(runtime.latestGameState()['turnIndex'], 1);
  assert.equal(duplicateMoveResult.success, false);
  assert.match(String(duplicateMoveResult.message ?? ""), /duplicate/i);
  assert.equal(staleMoveResult.success, false);
  assert.match(String(staleMoveResult.message ?? ""), /stale/i);
  assert.equal(
    runtime.latestGameState()['lastRemoteTransportMessageId'],
    "<remote-replay-1@example.test>"
  );
});

void test("game-room Tavla blocks the match when the selected opponent disappears mid-game", async () => {
  const runtime = createRoomHostRuntime();
  await startMatch(runtime, { target: "ai1", starter: "user" });
  await applyUserLegalMove(runtime);

  await runtime.emitHostContext({
    type: "host-context",
    locale: "en",
    user: {
      nickname: "Raistlin",
    },
    slots: {
      ai1: {
        slotId: "ai1",
        nickname: "Alpha",
        assigned: false,
        connected: false,
        ready: false,
        state: "empty",
      },
      ai2: {
        slotId: "ai2",
        nickname: "Beta",
        assigned: true,
        connected: true,
        ready: true,
        state: "connected",
      },
      us1: {
        slotId: "us1",
        nickname: "Remote Ghost",
        assigned: true,
        connected: true,
        ready: true,
        state: "connected",
        remoteUserId: "remote@example.com",
      },
    },
  });

  assert.equal(runtime.latestGameState()['result'], "blocked");
  assert.equal(runtime.latestGameState()['blockedReason'], "opponent-unavailable");
  assert.match(str(runtime.latestGameState()['status'] ?? ""), /Reset to begin again/);
});

void test("game-room Tavla keeps an assigned AI match alive through disconnect state", async () => {
  const runtime = createRoomHostRuntime();
  await startMatch(runtime, { target: "ai1", starter: "user" });
  await applyUserLegalMove(runtime);

  await runtime.emitHostContext({
    type: "host-context",
    locale: "en",
    user: {
      nickname: "Raistlin",
    },
    slots: {
      ai1: {
        slotId: "ai1",
        nickname: "Alpha",
        assigned: true,
        connected: false,
        ready: false,
        state: "assigned",
      },
      ai2: {
        slotId: "ai2",
        nickname: "Beta",
        assigned: true,
        connected: true,
        ready: true,
        state: "connected",
      },
      us1: {
        slotId: "us1",
        nickname: "Remote Ghost",
        assigned: true,
        connected: true,
        ready: true,
        state: "connected",
        remoteUserId: "remote@example.com",
      },
    },
  });

  assert.equal(runtime.latestGameState()['result'], "pending");
  assert.equal(runtime.latestGameState()['blockedReason'], "");
  assert.equal(runtime.latestGameState()['awaitingMoveFrom'], "ai");
});

void test("game-room Backgammon command names route to the Tavla handlers", async () => {
  const runtime = createRoomHostRuntime();
  const startResult = await startMatch(runtime, {
    target: "ai1",
    starter: "user",
    commandName: "GameRoomBackgammonStart",
  });
  const userMoveResult = await applyUserLegalMove(runtime, "GameRoomBackgammonUserMove");

  assert.equal(startResult.success, true);
  assert.equal(userMoveResult.success, true);
  assert.equal(runtime.latestGameState()['selectedTarget'], "ai1");
  assert.equal(runtime.latestGameState()['awaitingMoveFrom'], "ai");
});
