# 🔧 Repair Room

Repair Room, Hayalet Ev içinde elektronik onarım çalışmalarını tek bir session altında tutan dijital çalışma tezgâhıdır.

Amaç yalnızca PCB görüntüsüne bakmak veya AI'ya soru sormak değildir. Cihaz bilgisi, semptomlar, evidence, kaynaklar, ölçümler, görsel işaretler, riskler, konuşma geçmişi ve onarım zaman çizgisi aynı çalışma bağlamında tutulabilir.

> **AI önerir, ölçüm doğrular, operatör karar verir; session bütün izi saklar.**

## 🧰 Repair Workbench

Güncel `repair-workbench` yüzeyi şunları aynı çalışma alanında birleştirir:

- repair session oluşturma,
- session seçme,
- güncelleme,
- arşivleme,
- silme,
- cihaz bilgisi,
- semptom,
- risk seviyesi,
- evidence araştırması,
- knowledge kaynakları,
- PCB/kamera çalışma alanı,
- annotation,
- measurement,
- timeline,
- AI chat,
- operator profile,
- hands-free kullanım,
- Android Companion kamera.

Bazı özellikler bağlı AI slotu, Android Companion veya merkezi capture/TTS runtime gerektirir.

## 🔧 Repair Session

Her onarım bir session olarak ele alınır.

Session içinde örneğin:

- cihaz/board kimliği,
- semptom,
- risk,
- evidence,
- knowledge pack,
- ölçümler,
- annotation,
- AI mark,
- timeline,
- sohbet bağlamı,
- operator tercihleri

korunabilir.

Amaç onarımı birbirinden kopuk ekran görüntülerine veya sohbet mesajlarına bölmemektir.

## 📚 Evidence ve Knowledge

Yeni session Assistant AI ile evidence araştırması başlatabilir veya bu adımı atlayabilir.

Knowledge katmanı:

- schematic,
- board image,
- datasheet,
- forum/thread,
- operator note,
- common failure,
- rail,
- probe/test point

gibi kaynakları session'a bağlayabilir.

Kullanıcı hangi parçaların çalışma arşivine gireceğini seçebilir.

AI araştırması kararın kendisi değildir; evidence paketinin bir parçasıdır.

## 🖼️ PCB / Kamera Workbench

Workbench canlı veya freeze-frame board görüntüsü üzerinde çalışabilir.

Komut yüzeyleri arasında:

- aktif araç,
- freeze-frame,
- grid,
- AI mark,
- annotation,
- pin,
- zoom/pan,
- investigation region,
- live edge'e dönüş

bulunur.

Android Companion bağlı olduğunda telefon kamerası Repair Room için capture kaynağı olabilir.

## 📏 Measurement ve Timeline

Ölçüm yalnızca ekranda görünen geçici bir sayı değildir; session'a kayıt olarak eklenebilir.

Timeline:

- annotation,
- measurement,
- note,
- AI mark,
- risk flag

gibi olayları taşıyabilir.

Böylece daha sonra “Bu ölçüm hangi anda ve hangi görsel bağlamda alındı?” sorusuna dönmek mümkün olur.

## 🤖 Assistant AI

Repair Room Assistant farklı görevler için ayrılmış protokoller kullanır:

- `repair-room-assistant-evidence`
- `repair-room-assistant-observation`
- `repair-room-assistant-chat`
- `repair-room-assistant-risk-scan`

AI çıktısı ölçümün veya operatör kararının yerine geçmez; çalışma alanına yardımcı bir katman ekler.

## 🎙️ Hands-free

Repair Room ellerin meşgul olduğu çalışma koşullarını da hesaba katabilir.

Desteklenen kontrol yüzeyleri:

- dictation,
- ambient listener,
- TTS guidance,
- camera feed,
- photo capture,
- camera torch.

Room ayrıca AI interruption/attention budget gibi rehberlik tercihlerini taşıyabilir.

## 👤 Operator Profile

Operator profile:

- araçlar,
- beceriler,
- çalışma tercihleri,
- novice/advanced yoğunluğu,
- hands-free tercihleri

gibi bilgileri workbench davranışına bağlayabilir.

## 🧭 Spatial Investigation

Investigation mode, board üzerindeki anlamlı entity ve region'ların knowledge ile ilişkilendirilmesini sağlar.

Bir knowledge referansı geçici olarak odaklanabilir veya canonical investigation event haline getirilebilir.

Amaç bilgi kartı ile fiziksel board bölgesi arasındaki ilişkiyi kaybetmemektir.

## 🧱 Room Boundary

Repair Room'un source of truth'u `rooms/repair-room` altındadır.

- `manifest.json` feature, command ve protocol kontratlarını tanımlar.
- `host/` runtime'ı taşır.
- `main-functions/` domain ve protokol parçalarını taşır.
- `shared/` room-local ortak katmandır.
- `ui/` kullanıcı yüzeyidir.
- `i18n/` çevirileri taşır.

Core, Repair Room'un iş mantığını sahiplenmemelidir. Room core ile desteklenen room/SlotBridge/command sınırları üzerinden konuşur.

## ✅ Doğrulama

```bash
npm run rooms:typecheck
npm run test:all
npm run check:all
```

Feature-specific regression için:

```bash
npm run rooms:test:file -- <test files>
```

## 🎯 Amaç

Repair Room'un hedefi “AI ile cihaz tamir etmek” değildir.

Hedef; insanın gözlemini, gerçek ölçümleri, kaynak bilgisini ve AI desteğini birbirinin yerine koymadan aynı onarım günlüğünde birleştirmektir.
