# Third-Party Notices

Hayalet Ev'in kendi kaynak kodu kökteki `LICENSE` dosyasındaki MIT License altında sunulur. Bu dosya, kaynak ağacına kasıtlı olarak gömülen veya vendored olarak tutulan bilinen üçüncü taraf materyalleri özetler.

`package.json`, `package-lock.json`, Android/Gradle yapılandırması ve diğer bağımlılık manifestleri üzerinden indirilen paketler kendi upstream lisanslarına tabidir; bu dosya transitive dependency lisanslarının yerine geçmez.

Gömülü materyaller için doğrulanmış upstream lisans kopyaları `third-party-licenses/` altında tutulur ve masaüstü dağıtımlarına dahil edilir.

## Lucide Icons

Kullanım:

- `src/assets/nav-icons/`
- `rooms/*` içindeki starter/navigation icon varlıkları

Kaynak: Lucide Icons projesi.

Lisans: upstream Lucide `LICENSE` dosyası ISC License içerir; Feather Icons'tan türeyen belirli ikonlar için ayrıca MIT bildirimini taşır.

Yerel kaynak notları:

- `src/assets/nav-icons/README.md`
- `rooms/ICON-SOURCES.md`

Upstream lisans kopyası:

- `third-party-licenses/LUCIDE.txt`

## Konva 10.3.0

Vendored kopyalar:

- `rooms/game-room/shared/vendor/konva.min.js`
- `rooms/repair-room/shared/vendor/konva.min.js`

Kaynak: Konva JavaScript Framework.

Lisans: MIT.

Vendored dosyanın kendi header'ı Konva sürümünü ve MIT lisansını belirtir. `package.json` içinde kullanılan `konva` paketi de aynı upstream projenin bağımlılığıdır.

Upstream lisans kopyası:

- `third-party-licenses/KONVA.txt`

## openWakeWord ONNX modelleri

Dosyalar:

- `android-companion/app/src/main/assets/melspectrogram.onnx`
- `android-companion/app/src/main/assets/embedding_model.onnx`
- `android-companion/app/src/main/assets/hey_jarvis_v0.1.onnx`

Kaynak ve ayrıntılar: `android-companion/app/src/main/assets/OPENWAKEWORD-MODELS.md`.

Lisans: Apache License 2.0.

Lisans metni:

- `third-party-licenses/APACHE-2.0.txt`

## Vosk Turkish small model

Dosya:

- `android-companion/app/src/main/assets/transcript-models/vosk-model-small-tr-0.3.zip`

Kaynak: Alpha Cephei Vosk model kataloğundaki `vosk-model-small-tr-0.3`.

Lisans: Apache License 2.0.

Yerel kaynak notu: `android-companion/app/src/main/assets/VOSK-MODEL.md`.

Lisans metni:

- `third-party-licenses/APACHE-2.0.txt`

## Tencent ncnn Piper / SimpleG2P kaynakları

Dosyalar:

- `scripts/android-ncnn-piper-native/piper.cpp`
- `scripts/android-ncnn-piper-native/piper.h`
- `scripts/android-ncnn-piper-native/simpleg2p.cpp`
- `scripts/android-ncnn-piper-native/simpleg2p.h`

Kaynak: Tencent ncnn projesindeki ilgili Android/Piper örnek kaynakları ve bu proje için yapılan uyarlamalar.

Lisans: BSD 3-Clause. İlgili dosyaların başındaki upstream copyright ve lisans header'ları korunmuştur.

Upstream ncnn lisans kopyası:

- `third-party-licenses/NCNN.txt`

## Yeni üçüncü taraf materyal eklerken

Kaynak ağacına yeni bir model, ikon, font, ses, görsel, vendored kütüphane veya başka bir üçüncü taraf materyal eklenirse kaynak ve yeniden dağıtım lisansı doğrulanmalı; gerekli attribution/lisans metinleri korunmalı, uygun upstream lisans kopyası eklenmeli ve bu dosya güncellenmelidir.
