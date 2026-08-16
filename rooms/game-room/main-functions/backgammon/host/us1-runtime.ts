import { createGameRoomBackgammonUs1InviteRuntime } from "./us1-invite-runtime.js";
import { createGameRoomBackgammonUs1SyncRuntime } from "./us1-sync-runtime.js";

type BackgammonUs1InviteRuntimeDeps = Parameters<
  typeof createGameRoomBackgammonUs1InviteRuntime
>[0];
type BackgammonUs1InviteRuntime = ReturnType<typeof createGameRoomBackgammonUs1InviteRuntime>;
type BackgammonUs1SyncRuntimeDeps = Omit<
  Parameters<typeof createGameRoomBackgammonUs1SyncRuntime>[0],
  "inviteRuntime"
>;
type BackgammonUs1SyncRuntime = ReturnType<typeof createGameRoomBackgammonUs1SyncRuntime>;
type BackgammonInviteApi = Parameters<BackgammonUs1InviteRuntime["sendUs1Invite"]>[0];
type BackgammonUs1Api = Parameters<BackgammonUs1SyncRuntime["syncUs1Mailbox"]>[0];
type BackgammonUs1State = Parameters<BackgammonUs1InviteRuntime["sendUs1Invite"]>[1];
type BackgammonSyncReason = Parameters<BackgammonUs1SyncRuntime["syncUs1Mailbox"]>[1];
type BackgammonUs1InviteApiAdapter = (api: BackgammonUs1Api) => BackgammonInviteApi;

export function createGameRoomBackgammonUs1Runtime(
  deps: BackgammonUs1InviteRuntimeDeps &
    BackgammonUs1SyncRuntimeDeps & {
      toInviteApi: BackgammonUs1InviteApiAdapter;
    }
) {
  const { toInviteApi, ...sharedDeps } = deps;
  const inviteRuntime = createGameRoomBackgammonUs1InviteRuntime(sharedDeps);
  const syncRuntime = createGameRoomBackgammonUs1SyncRuntime({
    ...sharedDeps,
    inviteRuntime: inviteRuntime as unknown as Parameters<
      typeof createGameRoomBackgammonUs1SyncRuntime
    >[0]["inviteRuntime"],
  });
  const asInviteApi = (api: BackgammonUs1Api) => toInviteApi(api);

  const sendUs1Invite = async (
    api: BackgammonUs1Api,
    state: BackgammonUs1State,
    inviteNote: string
  ) =>
    inviteRuntime.sendUs1Invite(
      asInviteApi(api),
      state,
      inviteNote,
      async (_inviteApi: BackgammonInviteApi, reason: string) => {
        await syncRuntime.syncUs1Mailbox(api, reason);
      }
    );
  const ensureUs1SyncLoop = (api: BackgammonUs1Api) =>
    syncRuntime.ensureUs1SyncLoop(api, syncRuntime.syncUs1Mailbox);
  const syncUs1Mailbox = (api: BackgammonUs1Api, reason: BackgammonSyncReason) =>
    syncRuntime.syncUs1Mailbox(api, reason);

  return {
    applyInviteAcceptedState: (
      api: BackgammonUs1Api,
      inviteEntry: Parameters<BackgammonUs1InviteRuntime["applyInviteAcceptedState"]>[1],
      starter: Parameters<BackgammonUs1InviteRuntime["applyInviteAcceptedState"]>[2]
    ) => inviteRuntime.applyInviteAcceptedState(asInviteApi(api), inviteEntry, starter),
    clearUs1SyncLoop: syncRuntime.clearUs1SyncLoop,
    ensureUs1SyncLoop,
    findInviteById: (api: BackgammonUs1Api, inviteId: string, remoteUserId: string) =>
      inviteRuntime.findInviteById(asInviteApi(api), inviteId, remoteUserId),
    processRoomCommands: syncRuntime.processRoomCommands,
    processRoomEvents: syncRuntime.processRoomEvents,
    readIncomingInviteStarter: inviteRuntime.readIncomingInviteStarter,
    readOutgoingInviteStarter: inviteRuntime.readOutgoingInviteStarter,
    removeInviteFromInbox: (api: BackgammonUs1Api, inviteId: string, remoteUserId: string | null) =>
      inviteRuntime.removeInviteFromInbox(asInviteApi(api), inviteId, remoteUserId || ""),
    sendUs1Invite,
    sendUs1Move: inviteRuntime.sendUs1Move,
    sendUs1Reset: inviteRuntime.sendUs1Reset,
    syncFromSnapshot: (api: BackgammonUs1Api, roomInviteInbox: unknown) =>
      inviteRuntime.syncFromSnapshot(asInviteApi(api), roomInviteInbox),
    syncUs1Mailbox,
  };
}
