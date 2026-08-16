# 📱 Android Companion

`android-companion/`, Hayalet Ev'in masaüstü tarafındaki merkezi capture hub'ına eşlik eden, telefon üzerinde çalışan yerel Android uygulamasıdır.

Telefonu ayrı bir uygulama gibi kullanmak yerine, Hayalet Ev'in kamera, ses ve capture akışlarına fiziksel bir yardımcı cihaz olarak bağlar.

> **Telefon görüntüyü ve sesi toplar; Hayalet Ev masaüstü çalışma alanını yönetir.**

## 🎯 Amaç

Android Companion'ın temel görevleri:

- kamera önizlemesini telefon ekranında tutmak,
- masaüstü host'tan capture ve command session'ları almak,
- Android tarafında çevrimdışı transcription çalıştırmak,
- fotoğraf çekmek,
- transcript event'lerini Hayalet Ev'e geri göndermek,
- çekilen medyayı masaüstü çalışma alanına aktarmak.

Telefonun kamera ekranını masaüstüne taşımak yerine, telefonun kendi donanımını Hayalet Ev'in çalışma akışına bağlamak amaçlanır.

## 📷 Kamera

Kamera önizlemesi Android cihaz üzerinde kalır. Desktop tarafı telefonun kamera görüntüsünü kendi UI'ına sürekli taşımak zorunda değildir.

```text
Telefon
  │
  ├── Kamera preview
  ├── Fotoğraf capture
  └── Mikrofon
          │
          ▼
   Android Companion
          │
          │ ADB / local bridge
          ▼
   Hayalet Ev Desktop
```

Bu yapı özellikle Laboratory ve Repair Room gibi fiziksel bir nesnenin kamerayla incelendiği akışlarda telefonu ayrı bir capture cihazı olarak kullanmayı sağlar.

## 🔌 Desktop Bridge

Companion, masaüstü host ile `adb reverse` üzerinden kurulan yerel bridge'i kullanır. Uygulama masaüstü bridge'ini polling yöntemiyle kontrol eder.

```text
Desktop Host
    │
    │ capture / command session
    ▼
ADB Reverse Bridge
    │
    ▼
Android Companion
    │
    ├── camera
    ├── microphone
    └── offline models
    │
    ▼
Desktop Host
```

Companion aldığı komutları Android tarafında işler ve sonucu tekrar desktop bridge üzerinden gönderir.

## 🎙️ Çevrimdışı Ses

Android Companion ses işleme için cihaz üzerinde çalışan modeller kullanabilir.

### Ambient Mode

Ambient mode'da:

1. mikrofon dinleme yapar,
2. `openWakeWord` yerel olarak wake-word algılar,
3. wake tespit edildiğinde command window açılır,
4. komut `Vosk` ile çevrimdışı transcription işleminden geçer,
5. transcript event'i Hayalet Ev'e gönderilir.

Bu akışta sesin transcription için zorunlu olarak harici bir servise gönderilmesi gerekmez.

### Analyze Dictation

Analyze akışında telefon mikrofonu doğrudan dikte kaynağı olarak kullanılabilir.

```text
Mikrofon
   ↓
Android Companion
   ↓
Vosk
   ↓
Transcript
   ↓
Hayalet Ev Analyze
```

Transcription cihaz üzerinde Vosk ile gerçekleştirilir.

## 📸 Fotoğraf Capture

Desktop host bir capture command gönderdiğinde Companion:

1. capture isteğini alır,
2. Android kamera tarafında fotoğrafı oluşturur,
3. capture'ın kabul edildiğini bildirir,
4. desteklenen Analyze akışlarında fotoğrafı Hayalet Ev'e upload eder.

Böylece telefon yalnızca bir kamera preview cihazı değil, çalışma alanının fiziksel capture kaynağı haline gelir.

## 🤖 Yerel Modeller

Debug APK'lar aşağıdaki Android runtime/model bileşenlerini içerir:

- Vosk Android runtime,
- openWakeWord,
- wake modelleri,
- transcript modelleri.

Bu bileşenler Companion'ın desteklenen ses akışlarının cihaz üzerinde çalışabilmesini sağlar.

## 📁 Kaynak Yapısı

```text
android-companion/
├── app/
│   ├── src/
│   │   ├── main/
│   │   │   ├── kotlin/
│   │   │   │   └── com/hayaletev/androidcompanion/
│   │   │   └── res/
│   │   └── ...
│   └── ...
└── ...
```

Ana alanlar:

- `app/` — Android application module,
- `app/src/main/kotlin/com/hayaletev/androidcompanion/` — Kotlin giriş noktaları ve Android tarafı uygulama kodu,
- `app/src/main/res/` — Android kaynakları.

## 🛠️ Build

Android Companion build işlemleri root proje scriptleri üzerinden yönetilir.

### Ortam kontrolü

```bash
npm run android:check
```

### Debug APK

```bash
npm run android:build
```

Başarılı build sonrasında artifact'ler `dist/android-companion/` altında yayınlanır.

## 📲 Kurulum

Bağlı Android cihazları ADB üzerinden yönetmek için:

```bash
npm run android:install -- <deviceId>
npm run android:open -- <deviceId>
```

İlk komut Companion'ı cihaza kurar veya günceller; ikinci komut uygulamayı açar.

## 🔄 Sürüm / Artifact Kontrolü

Desktop tarafındaki install/update karşılaştırmaları `companion-manifest.json` üzerinden yapılır.

Bu manifest, cihazdaki Companion sürümü ile yayınlanan artifact arasında karşılaştırma yapılabilmesini sağlayan ortak referanstır. Bu nedenle APK'nın kendisi dışında canonical artifact manifest de build çıktısının bir parçasıdır.

## 🧩 Hayalet Ev İçindeki Rolü

Android Companion bağımsız bir Hayalet Ev istemcisi değildir ve masaüstü uygulamasının yerine geçmez.

```text
          FİZİKSEL DÜNYA
                │
        ┌───────┴───────┐
        │ Android       │
        │ Companion     │
        │               │
        │ Kamera        │
        │ Mikrofon      │
        │ Wake word     │
        │ Offline STT   │
        └───────┬───────┘
                │
          Local Bridge
                │
                ▼
        ┌───────────────┐
        │ Hayalet Ev    │
        │ Desktop Host  │
        └───────────────┘
                │
        ┌───────┼────────┐
        ▼       ▼        ▼
     Analyze  Repair   Diğer
                       akışlar
```

Telefonun görevi mümkün olduğunca **capture ve yerel cihaz işlerini** üstlenmektir. Çalışmanın kendisi Hayalet Ev'in desktop tarafında devam eder.

## 🔐 Yerel Öncelik

Companion'ın ses özelliklerinde mümkün olduğunca cihaz üzerinde çalışan runtime'lar kullanılır:

- wake-word algılama: `openWakeWord`,
- transcription: `Vosk`.

Bu yaklaşım bağlantı bağımlılığını azaltmak, capture akışını hızlandırmak ve fiziksel çalışma sırasında daha doğrudan kullanım sağlamak için tercih edilir.

## 🧭 Güncel Durum

Android Companion şu anda:

- telefon üzerinde kamera preview çalıştırır,
- desktop bridge'i `adb reverse` üzerinden polling ile takip eder,
- ambient mode'da wake-word'ü `openWakeWord` ile yerel algılar,
- command window transcription'ını Vosk ile cihaz üzerinde yapar,
- Analyze dictation'ı telefon mikrofonundan alır,
- Analyze dictation'ı Vosk ile çevrimdışı işler,
- capture command'larını kabul edebilir,
- Analyze fotoğraflarını desktop'a upload edebilir,
- desktop install/update karşılaştırmalarında `companion-manifest.json` kullanır.

## 🧱 Tasarım İlkesi

Android Companion'ın temel amacı telefonu Hayalet Ev'in içine tamamen taşımak değildir.

> **Telefonun sahip olduğu fiziksel yetenekleri Hayalet Ev'in çalışma alanına bağlamak.**

Kamera telefonda kalır. Mikrofon telefonda kalır. Yerel ses modelleri telefonda çalışabilir. Desktop ise bunları gerektiğinde bir çalışma akışının parçası haline getirir.

Böylece telefon, Hayalet Ev'in başka bir ekranı olmak yerine **evin dış dünyaya açılan küçük bir duyusu** gibi davranır.
