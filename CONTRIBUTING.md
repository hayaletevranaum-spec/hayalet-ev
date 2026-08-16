# Contributing to Hayalet Ev

Katkılar; hata düzeltmeleri, yeni özellikler, yeni odalar, testler, dokümantasyon ve mimari iyileştirmeler şeklinde olabilir. Amaç, genişlemeyi kolaylaştırırken core ile oda sınırlarını ve local-first çalışma modelini korumaktır.

## Geliştirme ortamı

Gereksinimler:

- Node.js 22+
- npm 10+

Kurulum:

```bash
npm ci
npm run electron:dev
```

Bazı medya, Android veya dağıtım akışları ek sistem araçları gerektirir. Bunlar için `PACKAGING.md` ve ilgili script/dokümanları kullan.

## Değişiklik yapmadan önce

- `README.md` ile genel yapıyı oku.
- Mimari veya AI destekli geliştirme yapıyorsan `AGENTS.md` ve `.rovo/00-ONBOARDING.md` ile başla.
- Slot/room iletişiminde `.rovo/slot-bridge-contract.md` sözleşmesini koru.
- Var olan davranışı değiştiren bir çalışma için ilgili regression testlerini incele.

## Room geliştirme kuralları

`rooms/<room-id>` kaynakları mümkün olduğunca kendi kendine yeterli olmalıdır.

- Bir room, core içindeki somut uygulama ayrıntılarına doğrudan bağlanmamalıdır.
- Core, belirli bir room'un özel kaynaklarını import etmemelidir.
- Room'a ait manifest/i18n metinleri room namespace'i altında kalmalıdır.
- Core ile iletişim için tanımlı room command/protocol/SlotBridge sınırlarını kullan.
- Dağıtılabilir room çıktısı `.hevroom` paketidir.
- Yeni bir bağımlılık veya köprü gerçekten gerekliyse sınırı açıkça belge ve test et.

Bu sınırlar `scripts/tests/room-source-portability-regressions.test.ts`, dependency-cruiser kuralları ve room regression testleriyle korunur.

## Kalite kapısı

Göndermeden önce mümkünse tam kontrolü çalıştır:

```bash
npm run check:all
```

Daha dar çalışmalar için ilgili lint/typecheck/test komutları kullanılabilir; ancak davranış veya mimari sınır değişiklikleri regression testiyle birlikte gelmelidir.

## Kod ve dokümantasyon

- Mevcut TypeScript/ESLint/Prettier kurallarını takip et.
- Aynı işi yapan ikinci bir legacy yol bırakmak yerine eski yolu temizlemeyi tercih et.
- Yeni mimari sözleşmeler kalıcıysa uygun dokümana ekle; geçici plan/progress dosyalarını kalıcı proje belgesi gibi bırakma.
- Public API, manifest veya paket formatı değişiyorsa geriye dönük etkisini açıkça belirt.

## Üçüncü taraf varlıklar

Repo içine ikon, model, font, vendored kütüphane veya başka bir üçüncü taraf dosya ekleniyorsa:

1. Kaynağını doğrula.
2. Yeniden dağıtıma izin veren lisansını doğrula.
3. Kaynak ve lisans bilgisini dosyanın yanında veya uygun bir kaynak notunda tut.
4. Gerekirse `THIRD_PARTY_NOTICES.md` dosyasını güncelle.

Lisansı veya yeniden dağıtım izni belirsiz bir varlığı repoya ekleme.

## Gizlilik ve güvenlik

- API anahtarları, tokenlar, gerçek kullanıcı verileri, kişisel çalışma alanı yolları, loglar veya yerel ayar dosyaları commit edilmemelidir.
- Testlerde gerçek e-posta/adres yerine `example.test` gibi ayrılmış örnek değerler kullan.
- Güvenlik açığı olduğunu düşündüğün bir konu için public issue içine istismar ayrıntısı veya secret koyma; `SECURITY.md` akışını kullan.

## Pull request beklentisi

Bir PR mümkün olduğunca tek bir amacı taşımalı ve şunları açıklamalıdır:

- ne değişti,
- neden değişti,
- kullanıcı/runtime davranışına etkisi,
- hangi kontrollerin çalıştırıldığı,
- varsa migration veya uyumluluk notları.

Büyük refactorlarda davranış değişikliği ile mekanik taşıma/temizliği mümkün olduğunca ayrıştırmak incelemeyi kolaylaştırır.
