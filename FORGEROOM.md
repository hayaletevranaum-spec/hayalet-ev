# 🔥 Forge Room

Forge Room, Hayalet Ev içinde ham fikirleri uygulanabilir işlere dönüştüren üretim odasıdır.

Bir hedefi doğrudan “yap” komutuna çevirmek yerine önce onun ne olduğunu anlamaya, parçalamaya ve farklı zihinlerin değerlendirmesine açar.

```text
Hedef
  ↓
Preflight
  ↓
Görev taslağı
  ↓
Assignment
  ↓
Yanıtlar
  ↓
Çelişkiler
  ↓
Sentez
  ↓
Handoff
```

> Birden fazla AI'ya cevap sordurmak yeterli değildir. Onları aynı işin farklı parçalarına yerleştirmek gerekir.

## 🧱 Forge Workbench

Ana özellik: `forge-workbench`.

Workbench bir koordinasyon yüzeyidir. Temel akış:

1. oturum oluştur veya yükle,
2. hedefi tanımla,
3. operator bağlamını seç,
4. preflight çalıştır,
5. görev taslağı oluştur,
6. taslağı düzenle ve onayla,
7. görevleri slotlara dağıt,
8. yanıtları incele,
9. çelişkileri ele al,
10. sentez oluştur,
11. handoff üret.

Bu akış gerektiğinde geri dönülebilir bir çalışma zinciri olarak ele alınır.

## 🧠 Oturum

Forge her çalışmayı bir session olarak saklar. Session içinde:

- hedef,
- brief,
- kısıtlar,
- kabul kriterleri,
- görevler,
- assignments,
- AI yanıtları,
- çelişkiler,
- sentezler,
- seçili sentez,
- export,
- karar izi,
- preflight durumu

saklanabilir.

Böylece üretim bir mesaj dizisi olarak kaybolmaz.

## 🎯 Hedef

Hedef yalnızca başlık değildir. Şunları taşıyabilir:

- kısa özet,
- detaylı brief,
- kısıtlar,
- kabul kriterleri,
- hedef room ID.

Hedef room ID, üretilen çalışmanın daha sonra başka bir odaya aktarılabilmesini sağlar.

## 👤 Operator Context

Forge kullanıcının gerçek çalışma koşullarını hesaba katabilir. Örneğin:

- beceri seviyesi,
- mevcut ekipman,
- çalışma tercihi,
- risk toleransı,
- geçici koşullar,
- run-local notlar

AI'ya giden bağlamı etkileyebilir.

Amaç teorik olarak kusursuz bir plan değil, uygulanabilir bir plan üretmektir.

## 🔎 Preflight

Preflight plan değildir. Bir hedefin çalışılabilir durumunu anlamaya yarayan erken kontrol aşamasıdır.

Şunları inceleyebilir:

- operator context,
- kısıtlar,
- hedef oda,
- run signature,
- context digest,
- eksik bilgi,
- bağlam riskleri.

Hedef veya çalışma bağlamı değişirse eski preflight stale hale gelebilir. Böylece sonraki aşamalar eski bağlama körü körüne devam etmez.

## 🧩 Görev Taslağı

Forge hedefi 3–7 top-level göreve ayırabilir. Görevler:

- uygulanabilir,
- kabul kriterleriyle ilişkili,
- hedef room'a uygun,
- gerektiğinde alt adımlara bölünebilir

olmalıdır.

Taslak AI tarafından üretilebilir ama kullanıcı tarafından düzenlenebilir.

> AI taslak üretir; işin ne olduğuna insan karar verir.

## 🪑 Assignment

Onaylanan görevler assignment'lara dönüşür.

Bir görev:

- tek seat'e,
- karşılaştırma için birden fazla seat'e,
- belirli role/persona bilgisiyle,
- daraltılmış context capsule ile

gönderilebilir.

Böylece farklı AI katılımcıları aynı hedefe farklı açılardan yaklaşabilir.

## ⚖️ Yanıtlar ve Çelişkiler

Assignment cevapları yapılandırılmış biçimde yakalanır. Birden fazla cevap geldiğinde Forge bunlar arasındaki yaklaşım, kapsam, risk ve sıra/öncelik farklılıklarını görünür hale getirebilir.

Forge için çelişki hata değildir; karar verilmesi gereken yerdir.

## 🧠 Sentez

Sentez, aşağı akış için daha dar bir sonuç gerektiğinde oluşturulur.

Şunları birlikte değerlendirebilir:

- tamamlanan yanıtlar,
- çözülmüş çelişkiler,
- seçilmiş cevaplar,
- kabul kriterleri,
- gerekli açık sorular.

Sentez bütün cevapların mekanik birleşimi değil, bir sonraki aşama için en kullanışlı sonuç adayıdır.

## 📦 Handoff

Forge'un önemli çıktılarından biri handoff paketidir. Paket:

- hedef özeti,
- brief,
- kısıtlar,
- görev grafiği,
- seçili sentez,
- çelişkiler,
- açık sorular,
- kabul kriterleri,
- repo referansları,
- artifact referansları,
- karar izi,
- preflight uyarıları

taşıyabilir.

Böylece bir odada yapılan çalışma başka bir odaya yalnızca metin olarak değil, bağlamıyla aktarılabilir.

## 🎭 Roller

Forge içinde roller üretim sorumluluğunu temsil eder:

- **Architect** — ilk görev dağılımını kurar,
- **Challenger** — varsayımları zorlar,
- **External Perspective** — farklı bakış getirir,
- **Coordinator** — akışı ve karar izini toparlar.

Bunlar insan karakterleri değil, çalışma rolleridir.

## 🧭 Neden Var?

Birden fazla AI'nın aynı ortamda bulunması tek başına işbirliği yaratmaz. AI'lar aynı şeyi tekrar edebilir, farklı yönlere dağılabilir, uygulanamaz çözümler önerebilir veya karar yükünü kullanıcıya geri bırakabilir.

Forge Room bu dağınıklığı bir üretim akışına dönüştürmek için vardır.

## 🎯 Amaç

Forge'un sorusu “Bunu hangi AI yapacak?” değildir. Önce “Bu iş gerçekte hangi parçalardan oluşuyor?” diye sorar.

Sonra farklı zihinleri o parçaların etrafına yerleştirir; cevapları toplar, çelişkileri gösterir, sentezler ve işi başka bir yere taşınabilir hale getirir.
