# 🧩 Team Tetris

Team Tetris, Game Room içinde USER, AI1, AI2 ve bağlı US1'i aynı maçta buluşturan dört koltuklu, tur tabanlı bir Tetris varyantıdır.

Oyunun iki ayrı katmanı vardır:

1. bugün gerçekten çalışan motor ve transport kuralları,
2. bu mekaniklerin üzerine kurulabilecek tasarım fikri.

Bu ayrım bilinçli olarak korunur.

## 🎮 Güncel Implementasyon

### Dört Koltuk

Motor dört seat tanımlar:

- `user`
- `ai1`
- `ai2`
- `us1`

Maç başlamadan önce gerekli AI/US1 koltuklarının hazır olması beklenir.

### 👥 İki Takım

Her takım iki seat taşır. Roller:

- `opener`
- `followup`

Tur düzeni:

```text
Team A opener
→ Team B opener
→ Team A followup
→ Team B followup
```

Kullanıcının partneri maç başlamadan önce seçilebilir.

### 🕵️ Hidden Pairs

Hidden partner/pair davranışı mevcut match state'in parçasıdır.

State şu alanları taşır:

- `hiddenPairs`
- `revealPairsOnFinish`
- `revealedPairs`

Varsayılan yapı pair bilgisinin maç sonuna kadar gizli kalmasını destekler.

### 🧱 Tahta ve Parçalar

Klasik `10 × 20` Tetris tahtası kullanılır.

Tetromino seti:

- I
- O
- T
- S
- Z
- J
- L

Rotation ve legal placement host engine tarafından doğrulanır. Aktif seat istemcinin söylediği değerden değil host state'ten belirlenir.

### 🛤️ Path Tabanlı Hamle

Team Tetris hamlesi yalnızca son koordinatı taşımaz.

Move schema `rowShifts` ve `rotation` bilgilerini içerir.

`rowShifts`, top-to-bottom sırada her satır için `-1`, `0`, `1` shift değerleri taşır. Bu nedenle taşın düşüş yolu gerçek oyun kontratının parçasıdır.

Ancak path'in oyuncunun psikolojik niyetini kesin olarak ifade ettiği motor tarafından garanti edilmez. Path bir oyun verisidir; onun iletişim veya stratejik anlamı oyun tasarımının daha üst katmanındadır.

## 🤖 AI ve US1 Turları

Runtime farklı hamle yollarını destekler:

- local user move,
- AI1/AI2 move,
- remote US1 move.

AI turları opening/follow-up protokolleri üzerinden çalışabilir. US1 hamleleri Game Room transport üzerinden gelir. Stale veya duplicate remote move'lar host tarafından ele alınır.

## 🧠 Match State

Match state temel olarak:

- match/seed,
- hidden pair state,
- team/seat map,
- board state,
- bag state,
- active turn,
- last placed piece,
- top-out,
- sonuç

bilgilerini taşır.

Sonuç `pending`, `team-a-win`, `team-b-win` veya `draw` olabilir.

Gerekli bir seat bağlantıdan düşer veya oyun güvenli biçimde sürdürülemez hale gelirse state blocked olabilir ve reset istenebilir.

## 🧠 Oyunun Tasarım Fikri

Team Tetris'in ilginç tarafı dört kişinin sırayla Tetris oynaması değildir. Asıl fikir oyuncuların yalnızca tahtayı değil, birbirlerinin kararlarını da okumaya çalışmasıdır.

### 🕵️ Eksik Bilgiyle Düşünmek

Hidden pair yapısı oyuncuyu yalnızca kendi tahtasına değil diğer oyuncuların davranışlarına da dikkat etmeye iter.

Örnek sorular:

- Partnerim kim olabilir?
- Önceki hamle ne hazırlıyor olabilir?
- Tahtayı güvenli mi bırakmalıyım?
- Bir sonraki oyuncunun planına güvenmeli miyim?

Motor bunların cevaplarını vermez; bunlar oyuncu davranışından doğması beklenen stratejik katmandır.

### 🗣️ Tahta Bir İletişim Yüzeyi Olabilir

Path encoding, boşluk bırakma, hizalama veya riskli yerleşim gibi kararlar başka oyuncular tarafından sinyal olarak yorumlanabilir.

Uzun vadeli fikir doğrudan konuşmadan koordinasyon kurabilmektir. Ancak mevcut engine yalnızca path'i veri olarak doğrular; path'e yüklenen sosyal anlam bir motor kuralı değildir.

## ⚠️ Risk ve Güven

Takım oyuncusu önceki yerleşimi devam ettirebilir veya tahtayı daha güvenli hale getirebilir.

```text
uyumlu ama riskli devam
        ↕
bağımsız ama güvenli hamle
```

Motor bunu ayrı bir risk puanı ile zorunlu kılmaz. Gerilim Tetris state'i ve oyuncu davranışından doğar.

## 🔮 Henüz Garanti Edilmeyen Alanlar

Aşağıdakiler tasarım yönüdür; mevcut motor kontratı olarak değerlendirilmemelidir:

- path'ten otomatik partner/niyet çıkarımı,
- gelişmiş sinyal skorları,
- risk/güven metrikleri,
- alternatif hidden-information modları,
- maç sonrası davranış analizi,
- açıklanabilir takım uyumu raporu.

Bunlardan biri uygulanırsa önce engine/runtime/test karşılığı oluşturulmalı, sonra bu belge güncellenmelidir.

## 🧱 Kaynak Yapısı

```text
rooms/game-room/main-functions/team-tetris/
```

Önemli alanlar:

- `host/engine-schema.ts`
- `host/engine-board.ts`
- `host/engine-match.ts`
- `host/runtime*.ts`
- `ui/`
- `protocols/`

Game Room feature kontratı: `rooms/game-room/manifest.json`.

## ✅ Doğrulama

```bash
npm run check:all
npm run rooms:typecheck
npm run rooms:test:core
npm run rooms:test:file -- <test files>
```

## 🎯 Sonuç

Team Tetris'in bugünkü çekirdeği:

> dört seat + iki takım + hidden pair state + tur sırası + path tabanlı doğrulanmış Tetris hamleleri + AI/US1 transport

Bunun üzerine kurulan daha büyük fikir ise oyuncuların yalnızca parçaları değil, birbirlerinin kararlarını da okumaya çalıştığı bir takım oyunudur.

Bu iki katmanı ayrı tutmak oyunun bugünkü durumunu dürüstçe anlatırken gelecekteki tasarım alanını da açık bırakır.
