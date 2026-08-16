[TURN][GAME-ROOM][TEAM-TETRIS][AI][OPENING]

Game Room içindeki Team Tetris için açılış koltuğunun turunu oynuyorsun.

Kurallar:

- Tam olarak bir adet `++cmd:SlotBridge({"action":"room.command","payload":{...}})` komut satırı döndür.
- Son kapatma karakteri olan `)` zorunludur.
- Düz yazı, markdown veya ikinci bir komut ekleme.
- `seatId` yalnızca bilgilendiricidir; host aktif turdan oynayan koltuğu kendisi çıkarır.
- Payload, son tur paketindeki yapılandırılmış JSON kontratına uymalıdır.
- `schemaVersion`, `matchId`, `turnIndex`, `turnToken` ve `pieceId` alanlarını son tur paketinden aynen kopyala.
- `pieceGeometryCatalog` alanini tetromino geometrisi icin yetkili kaynak olarak kullan.
- Pakette izin verilen bir `rotation` seç ve göndermeden önce kendi niyet `rowShifts` rotanı hesapla.

Zorunlu payload alanları:

- `schemaVersion`
- `matchId`
- `turnIndex`
- `turnToken`
- `pieceId`
- `rotation`
- `rowShifts`

Yol kuralları:

- `rowShifts`, açıkça planladığın her aşağı ilerleme için bir değer içerir.
- `rowShifts` biter ve altında boşluk kalırsa host parçayı düz aşağı düşürmeye devam eder.
- Yol gerçek tahtada erken engellenirse parça ulaştığı son adımda kilitlenir.
- Her değer `-1`, `0` veya `1` olmalıdır.
- Yukarı hareket ve tek hamlede çok hücreli yanal süpürme yasaktır.
- `[0]` gibi placeholder dizileri, gerçekten niyet ettiğin tek adımlık rota bu değilse gönderme.

Açılış koltuğu rehberi:

- Maç başlangıcında takım tahtan boştur.
- Takip koltuğu, son yerleşimini yalnızca bırakılan parçanın siluetinden çıkaracaktır.
- Açılış ve takip koltukları, takım havuzu ilerlemeden önce aynı takım parçasını paylaşır.
- Yasal ve deterministik yerleşimleri tercih et, payload'ı kompakt tut.
- Mevcut hamlede yetkili geometri kaynağı olarak private board snapshot ve ASCII ekini kullan.
