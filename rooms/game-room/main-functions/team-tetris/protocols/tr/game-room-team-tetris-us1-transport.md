[INFO][GAME-ROOM][TEAM-TETRIS][US1-TRANSPORT]

Team Tetris, bağlı US1 slotu ile canlı room-command taşıması kullanır.

Taşıma kontratı:

- komut: `++cmd:SlotBridge({"action":"room.command","payload":{"commandName":"GameRoomTeamTetrisRemoteMove",...}})`
- kapsam: `us1`
- host, maçı değiştirmeden önce `matchId`, `turnIndex`, `turnToken` ve hamlenin yasallığını doğrular.
- `seatId` güvenilir girdi sayılmaz.

Yaşam döngüsü kuralları:

- Team Tetris, Tavla davet kutusunu veya davet kabul/red akışını yeniden kullanmaz.
- Başlangıca yalnızca `ai1`, `ai2` ve `us1` hazır olduğunda izin verilir.
- `us1` maç ortasında koparsa maç reset gelene kadar blocked durumuna girer.
- Team Tetris özelliğinden çıkmak etkin Team Tetris maçını sıfırlar.

Hamle payload'ı:

- `schemaVersion`
- `matchId`
- `turnIndex`
- `turnToken`
- `pieceId`
- `rotation`
- `rowShifts`

`rowShifts` kuralları:

- aşağı yönlü her ilerleme için bir giriş
- her giriş `-1`, `0` veya `1`
