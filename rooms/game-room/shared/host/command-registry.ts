type CommandHandler = (api: unknown, payload?: unknown) => unknown;

interface GameRoomCommandRegistryDependencies {
  backgammonCommandNames: Record<string, string>;
  handleBackgammonStart: CommandHandler;
  handleBackgammonReset: (api: unknown) => unknown;
  handleBackgammonUserMove: CommandHandler;
  handleBackgammonAiMove: CommandHandler;
  handleBackgammonRemoteMove: CommandHandler;
  handleBackgammonAcceptInvite: CommandHandler;
  handleBackgammonRejectInvite: CommandHandler;
  handleTeamTetrisStart: CommandHandler;
  handleTeamTetrisReset: (api: unknown) => unknown;
  handleTeamTetrisMove: CommandHandler;
}

export function createGameRoomCommandRegistry(
  api: unknown,
  deps: GameRoomCommandRegistryDependencies
): Record<string, (payload?: unknown) => unknown> {
  const backgammonCommands = {
    start: deps.backgammonCommandNames["start"] || "GameRoomBackgammonStart",
    reset: deps.backgammonCommandNames["reset"] || "GameRoomBackgammonReset",
    userMove: deps.backgammonCommandNames["userMove"] || "GameRoomBackgammonUserMove",
    aiMove: deps.backgammonCommandNames["aiMove"] || "GameRoomBackgammonAiMove",
    remoteMove: deps.backgammonCommandNames["remoteMove"] || "GameRoomBackgammonRemoteMove",
    acceptInvite: deps.backgammonCommandNames["acceptInvite"] || "GameRoomBackgammonAcceptInvite",
    rejectInvite: deps.backgammonCommandNames["rejectInvite"] || "GameRoomBackgammonRejectInvite",
  };

  const registry: Record<string, (payload?: unknown) => unknown> = {
    [backgammonCommands.start]: function (payload?: unknown) {
      return deps.handleBackgammonStart(api, payload || {});
    },
    [backgammonCommands.reset]: function () {
      return deps.handleBackgammonReset(api);
    },
    [backgammonCommands.userMove]: function (payload?: unknown) {
      return deps.handleBackgammonUserMove(api, payload || {});
    },
    [backgammonCommands.aiMove]: function (payload?: unknown) {
      return deps.handleBackgammonAiMove(api, payload || {});
    },
    [backgammonCommands.remoteMove]: function (payload?: unknown) {
      return deps.handleBackgammonRemoteMove(api, payload || {});
    },
    [backgammonCommands.acceptInvite]: function (payload?: unknown) {
      return deps.handleBackgammonAcceptInvite(api, payload || {});
    },
    [backgammonCommands.rejectInvite]: function (payload?: unknown) {
      return deps.handleBackgammonRejectInvite(api, payload || {});
    },
    GameRoomTeamTetrisStart: function (payload?: unknown) {
      return deps.handleTeamTetrisStart(api, payload || {});
    },
    GameRoomTeamTetrisReset: function () {
      return deps.handleTeamTetrisReset(api);
    },
    GameRoomTeamTetrisUserMove: function (payload?: unknown) {
      return deps.handleTeamTetrisMove(api, payload || {});
    },
    GameRoomTeamTetrisAiMove: function (payload?: unknown) {
      return deps.handleTeamTetrisMove(api, payload || {});
    },
    GameRoomTeamTetrisRemoteMove: function (payload?: unknown) {
      return deps.handleTeamTetrisMove(api, payload || {});
    },
  };

  return registry;
}
