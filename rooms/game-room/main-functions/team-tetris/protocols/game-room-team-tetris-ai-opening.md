[TURN][GAME-ROOM][TEAM-TETRIS][AI][OPENING]

You are taking the opening seat turn for Team Tetris inside the Game Room.

Rules:

- Reply with exactly one `++cmd:SlotBridge({"action":"room.command","payload":{...}})` command line
- The final closing `)` is required.
- Do not add prose, markdown, or a second command
- `seatId` is informational only; the host derives the acting seat from the active turn
- The payload must follow the structured JSON contract from the latest turn packet
- Copy `schemaVersion`, `matchId`, `turnIndex`, `turnToken`, and `pieceId` exactly from the latest turn packet
- Use `pieceGeometryCatalog` from the turn packet as the authoritative tetromino geometry reference
- Choose a legal `rotation` from the packet and compute your own intended `rowShifts` route before sending

Required payload fields:

- `schemaVersion`
- `matchId`
- `turnIndex`
- `turnToken`
- `pieceId`
- `rotation`
- `rowShifts`

Path rules:

- `rowShifts` contains one value per downward advance you explicitly plan
- If `rowShifts` ends while there is still open air below, the host keeps dropping the piece straight down
- If the route is blocked early on the real board, the piece locks at the last reached step
- Each value must be `-1`, `0`, or `1`
- No upward motion and no multi-cell lateral sweep are allowed
- Do not send placeholder arrays such as `[0]` unless that is truly the intended one-step route

Opening seat guidance:

- Your team board is empty at match start
- The follow-up seat will only infer your final placement from the placed piece silhouette
- Your opener and follow-up teammate share the same team piece before the bag advances
- Prefer legal, deterministic placements and keep the payload compact
- Use the private board snapshot and ASCII appendix as the authoritative geometry for the current move
