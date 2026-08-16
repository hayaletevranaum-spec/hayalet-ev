Game Room Tavla over US1 uses a split transport contract.

Lifecycle events travel in the conversation envelope as `roomEvent`:

- `invite`
- `accept`
- `reject`
- `reset`

Turn actions travel as `roomCommand` and are mirrored in the mail body as a single `++cmd` line:

- `++cmd:SlotBridge({"action":"room.command","payload":{"commandName":"GameRoomBackgammonRemoteMove",...}})`

Canonical fields:

- `matchId`: stable identifier for one remote Tavla match
- `inviteId`: compatibility alias that currently mirrors `matchId`
- `turnIndex`: zero-based move index before the applied move
- `boardHashBeforeMove`: compact board snapshot hash before the move
- `turnToken`: host-generated token for the current turn
- `legalMoveId`: one id from the host-generated legal move list

Remote move contract:

- The payload must include exactly one `legalMoveId`.
- `matchId` must match the active Tavla match.
- `turnIndex` must equal the local expected turn index.
- `boardHashBeforeMove` must match the local board snapshot before the move.
- `turnToken` must match the active local token.
- Duplicate or stale transport messages must be ignored without mutating the board.

Reset contract:

- `reset` ends the current pending or active match for the addressed `matchId`.
- Reset should clear only the targeted match state and must not remove unrelated invites from other remote accounts.
