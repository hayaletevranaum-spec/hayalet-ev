# Security Policy

Hayalet Ev local-first bir Electron uygulamasıdır; buna rağmen webview, IPC, dosya sistemi, relay, room paketleri ve harici araç entegrasyonları güvenlik sınırları oluşturur.

## Desteklenen sürümler

Güvenlik düzeltmeleri öncelikle güncel `main` ve en yeni yayımlanan sürüm için değerlendirilir. Eski sürümler için sürekli güvenlik desteği garantisi verilmez.

## Güvenlik açığı bildirme

Hassas bir güvenlik açığını normal public issue içinde ayrıntılı biçimde paylaşma.

1. Repository'de GitHub **Security → Report a vulnerability** seçeneği açıksa private vulnerability report kullan.
2. Bu seçenek yoksa, exploit ayrıntısı, credential, kişisel veri veya hassas dosya eklemeden kısa bir issue aç ve maintainer ile özel bir iletişim kanalı kurulmasını iste.
3. Bildirimde mümkünse etkilenen sürüm/commit, etki alanı ve güvenli bir yeniden üretim özeti ver.

Güvenlik raporları için sabit bir yanıt veya düzeltme süresi taahhüt edilmez; doğrulanmış yüksek etkili sorunlar önceliklendirilir.

## Özellikle hassas alanlar

Aşağıdaki konular güvenlik raporu olarak değerlendirilmelidir:

- credential/token/secret sızıntısı,
- Electron IPC veya preload sınırlarının aşılması,
- webview izolasyonu ya da sağlayıcı oturumlarının beklenmeyen erişimi,
- US1 relay kimlik doğrulama, imza, şifreleme veya TLS pinning hataları,
- room/`.hevroom` paketlerinin beklenmeyen core veya dosya sistemi erişimi,
- path traversal veya yetkisiz yerel dosya okuma/yazma,
- arşiv/veritabanı içeriğinin yetkisiz açığa çıkması,
- Android companion veya yerel ağ iletişiminde yetki sınırı ihlali.

## Secret ve test verisi politikası

Gerçek API anahtarı, erişim tokenı, özel anahtar, kullanıcı e-postası, kişisel dosya yolu veya üretim verisi test fixture'ı olarak kullanılmamalıdır. Test verileri sentetik olmalı ve mümkün olduğunda `example.test` gibi ayrılmış alan adlarını kullanmalıdır.

Repo içinde kasıtlı olarak yalnız test amacıyla kullanılan kriptografik fixture bulunuyorsa bunun gerçek credential olmadığı açıkça belirtilmeli ve secret-scanning sistemlerini gereksiz yere tetiklemeyecek biçimde saklanmalıdır.

## Kapsam dışı

Genel hata raporları, özellik talepleri ve güvenlik etkisi olmayan performans/UX problemleri normal issue olarak açılabilir.

Bu proje için bir bug bounty programı taahhüt edilmemektedir.
