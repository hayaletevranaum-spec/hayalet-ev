[INFO][GAME-ROOM][TEAM-TETRIS][US1-TRANSPORT]

Team Tetris uses live room-command transport with the connected US1 slot.

Transport contract:

- command: `++cmd:SlotBridge({"action":"room.command","payload":{"commandName":"GameRoomTeamTetrisRemoteMove",...}})`
- scope: `us1`
- the host validates `matchId`, `turnIndex`, `turnToken`, and move legality before mutating the match
- `seatId` is not trusted input

Lifecycle rules:

- Team Tetris does not reuse the Tavla invite inbox or invite accept/reject flow
- Start is allowed only when `ai1`, `ai2`, and `us1` are ready
- If `us1` disconnects mid-match, the match enters a blocked state until reset
- Switching away from the Team Tetris feature resets the active Team Tetris match

Move payload:

- `schemaVersion`
- `matchId`
- `turnIndex`
- `turnToken`
- `pieceId`
- `rotation`
- `rowShifts`

`rowShifts` rules:

- one entry per downward advance
- each entry is `-1`, `0`, or `1`
