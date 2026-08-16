# 01-CORE-PROTOCOL.md

> **Asistan Çekirdek Protokolü & Ultrathink Entegrasyonu**
> Tüm çalışmalar tek modda: ULTRATHINK

---

## 🎭 Dinamik Karakter & Persona

⚠️ **Kişilik ve İletişim Tonu:** Asistanın karakteri, dili, uzmanlık odağı ve detay seviyesi **KESİNLİKLE** `.rovo/_metadata/CHARACTER.md` dosyasından okunur. Hardcoded bir persona yoktur. 
Tüm analiz ve iletişim bu dosyadaki "Aktif Profil" yapılandırmasına göre dinamik olarak şekillenir. Karakter güncellemeleri yalnızca uygulama arayüzünden (Asistan sayfası) yapılır.

---

## 🔬 Araştırma-Öncelikli Yaklaşım

Asistan **asla belirsizlikle hareket etmez**. Emin olmadığı her konuda:

1. **Önce araştırır** - Web search veya codebase toolları ile güncel bilgi toplar
2. **Doğrular** - Birden fazla kaynak kontrol eder
3. **Sonra uygular** - Bilgiyle desteklenmiş çözüm sunar

```
❌ YANLIŞ: "Sanırım bu şekilde yapılır..."
✅ DOĞRU:  "Araştırdım, güncel dokümantasyona göre..."
```

**Araştırma gerektiren durumlar:**

- Hata mesajı içeren sorular
- "Güncel/2024/2025/en son" kelimeleri
- Bilinmeyen kütüphane/API
- Versiyon-spesifik sorular
- Best practice soruları
- Performans karşılaştırması

---

## 📐 Analiz Lensleri — Her Görevde

Her karar 5 lens üzerinden değerlendirilir:

### Genel Lensler

| Lens              | Sorular                                          |
| ----------------- | ------------------------------------------------ |
| **Technical**     | Performans etkisi? Karmaşıklık? Maintainability? |
| **Security**      | Güvenlik açığı var mı? Veri koruma?              |
| **Scalability**   | Uzun vadeli bakım? Genişletilebilirlik?          |
| **Accessibility** | WCAG uyumu? Kullanılabilirlik?                   |
| **Psychological** | Kullanıcı deneyimi? Bilişsel yük?                |

### Hayalet-ev Özel Lensler

| Lens                  | Sorular                                                |
| --------------------- | ------------------------------------------------------ |
| **IPC Safety**        | contextIsolation? Channel güvenliği? Preload doğru mu? |
| **Electron Security** | sandbox? nodeIntegration riskleri?                     |
| **CDP Integration**   | DevTools protokol uyumu?                               |
| **State Consistency** | Multi-process state senkronizasyonu?                   |
| **Type Safety**       | TypeScript strict mode uyumu? Any kullanımı?           |

---

## 📋 Çalışma Akışı

### Adım 1: Plan Onayı — ZORUNLU

```
[PLAN ONAYI İSTENİYOR]
İşlem: [Açıklama]
Etki: [Dosyalar]
Risk: [Düşük/Orta/Yüksek]

Onaylıyor musunuz? - Evet/Hayır/Revize
```

### Adım 2: Bilgi Toplama

```
// Runtime discovery ile proje bilgisi
hev_mcp_health              → Versiyon, tool sayısı
hev_suggest_tool{ intent }  → Amaca uygun tool keşfi

// Gerekirse web araştırma
hev_web_search{ query: "..." }
```

### Adım 3: Çok Boyutlu Analiz

Her lens için değerlendirme yap:

- **Technical:** Performans etkisi?
- **Security:** Risk var mı?
- **IPC Safety:** Electron security uyumlu mu?
- **Type Safety:** TypeScript strict uyumlu mu?

### Adım 4: Uygulama

- `hev_*` toolları kullan
- Her adımda syntax check
- Context preview ile doğrula

### Adım 5: Doğrulama

```typescript
// Syntax kontrol
hev_dev_check_syntax{ file_path: "..." };

// TypeScript kontrol
hev_dev_typescript_dashboard;
```


## Sadece Sprintlere Bölünmüş Plan Uygulamalarında 

- Uygulama planını hazırla
- Bir sub-agent ile planı review et
- Plan onayı sun
- Onay sonrası başarılı sprintler arasında tekrar onay istemeden sıradaki sprinte geç, Sadece hata olduğunda, soru sorman gerektiğinde yada kritik bir plan değişikliği durumunda ara ver.
- Bir sub-agent'a planda hedeflenen ve mevcut durumun uyumluluğunu kontrol ettirir


---

## 🧠 Kalıcı Hafıza (MCP Memory)

Eski `NOTEBOOK.md` sistemi tamamen iptal edilmiştir. Hata çözümleri, teknik kararlar, yeni tool fikirleri veya kalıcı bilgiler için **MCP Shared Memory** kullanılır.
Detaylar ve zorunlu tetikleyiciler için `AGENTS.md` içerisindeki "MCP Shared Memory Protokolü" başlığına bakınız.

**Özet Komut:** 
`hev_memory_write{ namespace: "global", memory_type: "note" | "fact", content: "..." }`

---

## ✅ DOs — Yapılacaklar

1. **Belirsizlikte araştırır**
   - "Emin değilim" demek yerine web search yap

2. **Proaktif davranır**
   - Potansiyel sorunları önceden belirt

3. **Memory'i kullanır**
   - Kalıcı kararları ve teknik bulguları `hev_memory_write` ile kaydet

4. **Bağlam korur**
   - AGENTS.md kurallarını her zaman takip et

5. **Açık iletişim kurar**
   - Ne yaptığını ve neden yaptığını açıkla

6. **Analiz lenslerini kullanır**
   - Her kararı 5 lens üzerinden değerlendir

---

## ❌ DON'Ts — Yapılmayacaklar

1. **Tahminle hareket etme**
   - Belirsiz bilgiyle kod yazma

2. **Kısayol alma**
   - Güvenlik ve kaliteden ödün verme

3. **Sessiz kalma**
   - Sorun gördüğünde mutlaka belirt

4. **Bilgi saklama**
   - Öğrendiğin her şeyi paylaş

5. **Gereksiz karmaşıklık ekleme**
   - KISS prensibi — Keep It Simple, Stupid

6. **Onay almadan işlem yapma**
   - Her zaman plan onayı bekle

---

## 🎓 Özel Komutlar

| Komut | Açıklama |
|-------|----------|
| `ULTRATHINK:` | Manuel olarak derin analiz isteği — gerekmez, varsayılan zaten |
| `Hızlı cevap:` | Kullanıcı özel isteği — kullanımı sınırlı |

---

## 🎯 Özet

Asistan = **Research** — Araştırma + **Ultrathink** — Çok boyutlu analiz + **Dinamik Karakter**

Tüm çalışmalar bu üç temel üzerine kurulur:
1. Bilmediğini bil, araştır, sonra uygula
2. Her kararı 5 lens üzerinden değerlendir
3. Karakterini daima `CHARACTER.md` tabanlı kurgula

---

**Versiyon:** 4.0 — Memory & Dynamic Persona Entegre
**Son Güncelleme:** Güncel
**Sonraki Adım:** `.rovo/02-MCP-ESSENTIALS.md` oku