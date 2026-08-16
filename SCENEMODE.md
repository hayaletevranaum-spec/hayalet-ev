# 🎭 Scene Mode

Scene Mode, Hayalet Ev'in oda listesini bir menüden çıkarıp yaşanan bir mekâna dönüştüren sunum ve etkileşim katmanıdır.

Klasik modda odalar liste veya kart olarak görünür. Scene Mode'da aynı odalar koridorda, kapılarda, masalarda, çalışma tezgâhlarında ve yakın görünümlerde karşına çıkar.

Bu yüzden Scene Mode yalnızca görsel bir tema değildir; Hayalet Ev'in “ev” fikrini gerçekten hissettiren katmandır.

## 🏠 Temel Fikir

Hayalet Ev'de oda yalnızca açılan bir sayfa değildir. Her oda:

- bir mekâna sahiptir,
- bir giriş noktasına sahiptir,
- ana fonksiyonlarını sahnede gösterebilir,
- gerekirse yakın görünüm açabilir,
- AI, kullanıcı ve uzak kullanıcı varlığını sahneye taşıyabilir.

Scene Mode bu parçaları aynı akışta birleştirir.

> Kullanıcı bir kart seçmez. Bir yere gider.

## 🖥️ Klasik Mod ve Scene Mode

### Klasik Mod

- odalar liste/kart olarak görünür,
- açma eylemi doğrudan sayfa geçişidir,
- arayüz operasyoneldir.

### Scene Mode

- odalar sahnedeki hedeflerdir,
- arka plan, karakterler ve hotspot'lar aynı projeksiyonda hizalanır,
- oda içindeki ana fonksiyonlar da sahne hedefidir,
- ana fonksiyon seçildiğinde yakın görünüm ve runtime birlikte gelir.

Her iki mod aynı room kayıtlarını kullanır. Fark verinin nasıl yaşandığıdır.

## 🚪 Rooms Koridoru

Rooms sayfası Scene Mode aktifken bir koridor gibi davranır.

Kurulu odalar:

- manifest'teki `scene.roomsHotspot` alanından kapısını alır,
- aktif sahneye yerleşir,
- tıklanabilir hedef haline gelir,
- ilgili room page'e götürür,
- AI1, AI2, kullanıcı veya US1 varlığını roster üzerinden gösterebilir.

Böylece sonradan eklenen bir oda da sahnede fiziksel bir yere sahip olabilir.

## 🏠 Oda Sahnesi

Bir oda açıldığında iki katman oluşur:

1. odanın genel sahnesi,
2. ana fonksiyonun yakın görünümü.

Genel sahnede oda arka planı, geri dönüş hedefi ve ana fonksiyon hotspot'ları bulunur.

Ana fonksiyon seçildiğinde yakın görünüm açılır. Bu görünümde:

- `backgroundSrc` ana sahne görselini verir,
- `transparentWindow` runtime yüzeyinin konumunu belirler,
- room runtime UI bu pencerenin içinde çalışır,
- geri hedefi oda sahnesine döndürür.

Böylece oyun tahtası, Laboratory paneli, Forge tezgâhı veya Repair çalışma yüzeyi yalnızca HTML ekranı gibi değil, odanın içindeki fiziksel bir nesne gibi davranabilir.

## 🎯 Hotspot Mantığı

Scene Mode'da hotspot dekor değildir; bir kontrattır.

Bir hotspot:

- sahnedeki dikdörtgen alanı,
- label,
- hedef oda veya feature,
- kaynak manifest bağlantısı

gibi bilgileri taşır.

Oda seviyesinde `roomsHotspot` ve `backHotspot`; feature seviyesinde `feature.scene.hotspot` ve `feature.scene.view` birlikte çalışır.

## 🔄 Runtime ile İlişki

Scene Mode room runtime'ını yeniden yazmaz. Aynı runtime farklı bir presentation context içinde çalışır.

Context `classic` veya `scene-view` olabilir. Böylece aynı feature classic modda daha geniş, scene-view'da daha kompakt bir düzen kullanabilir.

Backgammon ve Team Tetris bunun mevcut örneklerindendir.

## 🛠️ Scene Debug / Editor

Editor/debug katmanı:

- hotspot konumlarını,
- karakter anchor'larını,
- transparent window alanlarını,
- scene asset hedeflerini

düzenleyebilir.

Değişiklikler kaynak manifest'e geri taşınabilir. Bu nedenle bir oda yalnızca koduyla değil, sahnedeki yeriyle de tamamlanır.

## 🔗 Kaynak Zinciri

Scene Mode'da source of truth room manifest'tir.

```text
manifest
  ↓
installed room record
  ↓
room page payload
  ↓
scene runtime
  ↓
room UI
```

Bu zincirdeki uyumsuzluklar sahne doğru görünse bile runtime'ın yanlış context almasına neden olabilir. Bu nedenle oda veya feature eklerken scene fields, runtime payload ve UI presentation birlikte düşünülmelidir.

## 🧭 Neden Var?

Scene Mode'un amacı arayüzü süslemek değildir. Amaç:

- Hayalet Ev'in oda fikrini hissedilir yapmak,
- AI ve kullanıcı varlığını aynı mekâna yerleştirmek,
- odalar arasında zihinsel harita oluşturmak,
- ana fonksiyonları ekran yerine nesne gibi hissettirmek.

Bu nedenle Scene Mode hem atmosferik hem mimari bir katmandır.

## 🧠 Son Söz

Scene Mode açıldığında uygulama değişmez; kullanma biçimi değişir.

Listeye bakmazsın, koridorda yürürsün. Butona basmazsın, bir şeyin yanına gidersin. Bir feature açmazsın, odanın içindeki çalışma tezgâhına yaklaşırsın.

Hayalet Ev'in gerçekten ev gibi hissettiği yer burasıdır.
