# 🎲 Backgammon / Tavla

Backgammon, Game Room'un tamamlanmış ana fonksiyonlarından biridir.

Dışarıdan klasik Tavla gibi görünür: iki taraf, 24 nokta, zar, bar, toplama ve legal hamleler. Ama Hayalet Ev içindeki asıl rolü farklıdır:

> İnsan, AI ve uzak kullanıcı aynı oyun kontratının içinde aynı kurallara tabi olur.

## 🎯 Nedir?

Backgammon, Game Room içinde `backgammon` feature'ı olarak çalışır.

Oyuncu:

- AI1,
- AI2,
- bağlı US1

ile oynayabilir.

Başlangıçta rakip ve kimin başlayacağı seçilir. Sonrasında oyun host tarafından hesaplanan legal hamleler üzerinden ilerler.

**AI hakem değildir. Oyuncudur.**

## 🎲 Kural Çerçevesi

Bu sürümde:

- doubling cube yoktur,
- her oyuncuda 15 pul vardır,
- kullanıcı 24. noktadan 1. noktaya ilerler,
- rakip 1. noktadan 24. noktaya ilerler,
- kırık pullar bar'dan oyuna girmek zorundadır,
- tüm pullar ev alanına gelmeden toplama yapılmaz,
- sonuç mars/katmerli mars durumuna göre hesaplanır.

Zar host tarafından üretilir.

AI'ya gönderilen temel bilgiler:

- zar,
- tahta,
- bar/off durumu,
- turn token,
- legal move ID'leri.

## ⚖️ Legal Move Contract

Backgammon'un güvenlik merkezinde `legalMoveId` bulunur.

Host:

1. tahtayı normalize eder,
2. zar sırasına göre olası hamle dizilerini hesaplar,
3. kurala uygun ve en uzun dizileri tutar,
4. her legal hamleye deterministik ID verir.

Kullanıcı bir hamle seçer. AI ise verilen legal hamleler arasından bir `legalMoveId` seçer.

AI'nin görevi kendi hamlesini icat etmek değil, mevcut oyun durumunda mümkün olan hamlelerden birini seçmektir.

## 🔄 Tur Akışı

Tipik AI oyunu:

1. Kullanıcı rakibi seçer.
2. Host match state oluşturur.
3. Kullanıcı turundaysa legal hamleler gösterilir.
4. Kullanıcı hamle yapar.
5. Host sonucu uygular.
6. Yeni zar ve AI turn packet oluşturulur.
7. AI legal move seçer.
8. Host hamleyi doğrular ve uygular.
9. Sıra devam eder.

15 pulunu ilk toplayan taraf oyunu kazanır.

## 🌐 US1 ile Uzak Tavla

Uzak kullanıcı hamlesi AI hamlesinden daha sıkı transport kontrolüne tabidir.

Hamlelerde şu alanlar korunur:

- `matchId`,
- `inviteId`,
- `turnIndex`,
- `boardHashBeforeMove`,
- `turnToken`,
- `legalMoveId`.

Bunlardan biri aktif state ile uyuşmazsa hamle uygulanmaz. Bu sayede stale veya duplicate mesajlar tahtayı değiştiremez.

## ✉️ Davet Sistemi

US1 oyunu doğrudan başlamaz; önce davet akışı vardır.

Uzak kullanıcı:

- daveti kabul edebilir,
- reddedebilir,
- aktif maçı reset ile bitirebilir.

Davet notu uzak transport mesajının parçasıdır; AI protocol preface'i ile aynı mekanizma değildir.

## 🖼️ UI

Backgammon iki sunum moduna uyabilir:

### Classic

Daha geniş masa düzeni.

### Scene View

Tahta, oda sahnesindeki transparent window alanına uyacak biçimde kompakt hale gelir.

UI şu yüzeyleri içerir:

- rakip slotları,
- başlangıç seçimi,
- davetler,
- maç durumu,
- zar,
- bar/off,
- legal hamleler,
- tahta,
- geçmiş.

Görsel tahta yüklenemezse legal hamle butonları yedek akışı korur.

## 🤖 AI İçin Anlamı

AI:

- oyun durumunu okur,
- legal hamle listesini değerlendirir,
- bir `legalMoveId` seçer,
- aktif turn bilgilerini korur.

Host ise:

- kuralları uygular,
- hamleyi doğrular,
- oyunun gerçek state'ini tutar.

**AI karar verendir; host hakemdir.**

## 🏠 Neden Game Room İçinde Önemli?

Tavla yalnızca bir oyun eklemek için yapılmadı. Aynı deneyimde:

- room manifest,
- runtime,
- AI protocol,
- US1 transport,
- Scene Mode,
- i18n,
- match state,
- history

birleşir.

Bu nedenle Backgammon, Game Room mimarisinin referans uygulamalarından biridir.

## 🎯 Amaç

Tavla burada yalnızca zar şansı değildir. Her turda aynı soru sorulur:

> Bu durumda gerçekten hangi hamle mümkün?

İnsan, AI veya uzak kullanıcı fark etmez. Herkes aynı oyun kontratına gelir: legal bir hamle seç, sıranı tamamla ve yeni oyun durumuyla devam et.
