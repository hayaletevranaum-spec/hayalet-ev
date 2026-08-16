US1 uzerinden Game Room Tavla parcali bir transport kontrati kullanir.

Yasam dongusu olaylari konusma zarfinda `roomEvent` olarak tasinir:

- `invite`
- `accept`
- `reject`
- `reset`

Tur aksiyonlari `roomCommand` olarak tasinir ve mail govdesinde tek bir `++cmd` satiriyla aynalanir:

- `++cmd:SlotBridge({"action":"room.command","payload":{"commandName":"GameRoomBackgammonRemoteMove",...}})`

Canonical alanlar:

- `matchId`: tek uzak Tavla maci icin sabit kimlik
- `inviteId`: su anda `matchId` ile aynalanan uyumluluk alias'i
- `turnIndex`: hamle uygulanmadan onceki sifir tabanli hamle indeksi
- `boardHashBeforeMove`: hamle oncesi kompakt tahta hash'i
- `turnToken`: host tarafindan mevcut tur icin uretilen token
- `legalMoveId`: host'un legal hamle listesinden bir id

Uzak hamle kontrati:

- Payload tam olarak bir `legalMoveId` icermelidir.
- `matchId` aktif Tavla maci ile eslesmelidir.
- `turnIndex` yerel beklenen tur indeksiyle ayni olmalidir.
- `boardHashBeforeMove` hamle oncesi yerel tahta hash'iyle eslesmelidir.
- `turnToken` aktif yerel token ile eslesmelidir.
- Yinelenen veya stale transport mesajlari tahtayi degistirmeden yoksayilmalidir.

Reset kontrati:

- `reset`, hedeflenen `matchId` icin bekleyen veya aktif maci bitirir.
- Reset sadece hedeflenen mac state'ini temizlemeli, baska uzak hesaplara ait davetleri silmemelidir.
