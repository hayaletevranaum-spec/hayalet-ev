# 🧪 Laboratory

Laboratory bir araç ekranı değil, bir çalışma tezgâhıdır.

Amaç bir medya dosyasını yalnızca açmak veya bir AI'ya analiz ettirmek değildir. Kaynağı çalışma alanına almak, gerekli zemini hazırlamak, insan gözüyle incelemek, otomatik analizleri uygulamak, bulguları işaretlemek ve sonucu tekrar kullanılabilir bir çalışma bağlamına dönüştürmektir.

```text
Kaynak
  ↓
Hazırlık
  ↓
İnceleme
  ↓
Analiz
  ↓
Karşılaştırma / Annotation
  ↓
Rapor / Export
  ↓
AI ile devam
```

> Otomatik analiz insan incelemesinin yerine geçmez; onunla aynı çalışma alanında bulunur.

## 🔬 Bugünkü Laboratory

Güncel Laboratory iki ana özellik yüzeyini aynı guided workbench içinde toplar:

- **Media Analysis**
- **Audio Analysis**

Bu nedenle Laboratory yalnızca player, editör veya rapor ekranı değildir. Kaynak, araç, işlem, sonuç ve rapor aynı proje bağlamında tutulur.

## 📥 Kaynak ve Proje

Laboratory çalışmayı tek seferlik bir işlem olarak değil, proje olarak ele alır.

Kaynak katmanı yerel medya kaynaklarının yanında desteklenen URL/YouTube intake akışlarını da barındırabilir.

Proje katmanı şu ilişkileri korur:

- kaynak,
- türetilmiş varlıklar,
- analiz durumu,
- sonuçlar,
- rapor,
- export kayıtları.

Böylece aynı kaynağa daha sonra geri dönülebilir ve analiz süreci yalnızca son dosyadan ibaret kalmaz.

## 🧰 Readiness

Bir analiz başlamadan önce Laboratory mümkün olduğunca çalışma zemininin durumunu görünür kılar.

Room-local readiness akışı:

- gerekli araçları,
- model/runtime bağımlılıklarını,
- eksik bileşenleri,
- otomatik hazırlanabilecek parçaları,
- kullanıcı müdahalesi gerektiren adımları

gösterebilir.

Bu yaklaşım ağır medya ve model işlemlerini kara kutu haline getirmemeyi amaçlar.

## 🖼️ Görüntü ve Video

Media Analysis çalışma alanında güncel olarak:

- tek görsel inceleme,
- iki görsel karşılaştırması,
- zoom/pan,
- aktif karşılaştırma tarafı,
- ROI/seçim,
- detay/geometri odaklı inceleme,
- capture/export,
- iki görseli tek PNG çıktısında birleştirme

gibi yüzeyler bulunur.

Video kaynakları aynı proje ve timeline altyapısıyla çalışır.

## ✏️ Annotation

Görüntü çalışma alanında room-local annotation katmanı bulunur.

Desteklenen araçlar:

- serbest kalem,
- daire/elips,
- çizgi kalınlığı,
- çizgi rengi,
- temizleme/sıfırlama.

Annotation kaynak dosyayı değiştirmez. İşaretler çalışma oturumunun parçası olarak tutulur ve capture/export sırasında çıktıya yansıtılabilir.

Bu ayrım önemlidir: kaynak veri ile insanın çalışma sırasında üzerine koyduğu işaret aynı şey değildir.

## 🔊 Audio Analysis

Audio Analysis, Laboratory'nin ayrı bir uygulaması değildir. Aynı proje, readiness, işlem ve raporlama yaklaşımını kullanır.

Mevcut pipeline'lar arasında:

- sinyal ve yerel analiz/probe,
- speech/transcript hazırlıkları,
- forensic analiz,
- music/rhythm model analizi,
- sound-event model analizi,
- source-separation model akışları

bulunabilir.

Kullanılabilirlik gerekli araç ve model durumuna bağlıdır.

## 📈 Sonuçlar

Laboratory sonuçları yalnızca “başarılı” veya “başarısız” olarak ele almaz.

Çalışma alanı ve sonuç yüzeyleri:

- türetilmiş varlıkları,
- analiz sonuçlarını,
- timeline bağlamını,
- seçili kapsamı,
- çalışma bölgelerini,
- keşif sonuçlarını

aynı proje içinde tutar.

Amaç bulguyu kaynağından koparmamaktır.

## ⚙️ Process

Bir analiz koşusu başladığında süreç proje durumuna bağlanır.

Mümkün olduğunca şu bilgiler görünür tutulur:

- hangi aşamanın çalıştığı,
- hangi aracın kullanıldığı,
- hangi varlığın üretildiği,
- neyin eksik kaldığı,
- hangi adımın yeniden denenebileceği.

Bu, özellikle uzun süren medya/model işlemlerinde önemlidir.

## 📊 Rapor ve AI Handoff

Laboratory raporu yalnızca işlemin sonunda üretilen dekoratif bir özet değildir.

Rapor:

- neyin bulunduğunu,
- neyin bulunamadığını,
- hangi koşullarda çalışıldığını,
- seçilen çalışma bağlamını,
- insan incelemesinin önemli noktalarını,
- AI'nin yeniden değerlendirebileceği teknik bağlamı

taşıyabilir.

Desteklenen akışlarda rapor veya seçili çalışma bağlamı AI slotuna aktarılabilir. Böylece yeni bir sohbet başlatmak yerine mevcut çalışmanın devamı oluşturulur.

## 💾 Export

Güncel görüntü akışında export:

- tek çalışma anı,
- iki görsel karşılaştırması,
- annotation uygulanmış karşılaştırma

gibi PNG çıktıları üretebilir.

Export kaynak dosyayı destructive biçimde değiştirmez.

## 🧭 Çalışma İlkeleri

Laboratory geliştirilirken:

- kaynak dosya ile çalışma durumu ayrılır,
- annotation kaynak medyayı sessizce değiştirmez,
- araç/model hazırlığı görünür tutulur,
- sonuç kaynak ve proje bağlamından koparılmaz,
- UI, runtime ve host ownership sınırları korunur,
- deneysel özellikler uygulanmış özellik gibi belgelenmez,
- AI çıktısı otomatik olarak doğrulanmış bulgu kabul edilmez.

## 🧱 Kaynak Yapısı

Laboratory'nin editable source of truth'u `rooms/laboratory` altındadır.

Önemli katmanlar:

- `features/media-analysis/`
- `features/audio-analysis/`
- `shared/host/`
- `runtime/`
- `ui/`
- `tools/`

Ayrıntılı ownership kuralları: [rooms/laboratory/README.md](rooms/laboratory/README.md).

## ✅ Doğrulama

```bash
node rooms/laboratory/scripts/laboratory-check.mjs
npm run check:all
```

## 🎯 Amaç

Laboratory'nin amacı yalnızca bir analiz işlemini tamamlamak değildir; kaynağı açmak değil, onunla çalışmaktır.

Kaynak hazırlanır. İnsan inceler. Araçlar analiz eder. İşaretler eklenir. Bulgular kaydedilir. Rapor oluşur. Çalışma gerektiğinde AI ile başka bir aşamaya taşınabilir.
