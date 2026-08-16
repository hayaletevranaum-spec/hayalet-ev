# Changelog

Tüm önemli değişiklikler bu dosyada belgelenecektir.

## [3.0.0] - 2026-02-13

### 🏗️ Architecture: Unified Tool Registry

Tüm MCP tool altyapısı sıfırdan yeniden tasarlandı.

**Sorunlar (Eski Sistem):**

- 12 duplicate tool definition
- 7 handler'sız definition, 1 definition'sız handler
- Tool sayısı tutarsızlığı (86/97/91 farklı yerlerde)
- 2 paralel registry sistemi (biri hiç kullanılmıyordu)
- Definition ve handler farklı dosyalarda, senkron dışı kalıyordu

**Yeni Sistem:**

- `registry.ts` — Tek merkezi Map-based registry (duplicate korumalı, runtime validation)
- Co-located: Her tool'un definition + handler'ı aynı dosyada (ToolEntry formatı)
- Tool sayısı runtime'da hesaplanır, hardcode yok
- Yeni tool ekleme = tek dosyaya tek obje eklemek
- TypeScript compile + runtime garantisi

**Silinen Dosyalar:**

- `tools-registry.ts` (830 satır inline definition)
- `tools-list.ts` (fragmented birleştirici)
- `handler-registry.ts` (kullanılmayan paralel sistem)

**Sonuç:** 85 tool, 0 duplicate, 0 orphan

---

## [1.10.0] - 2026-01-28

### ✨ Yeni Özellikler

#### Structure Visualizer Tool

"Parantez cehennemi" sorunlarını çözmek için dosya yapısını görselleştiren yeni tool eklendi.

**Tool: `hev_dev_visualize_structure`**

**Yetenekler:**

- ✅ **AST-based Parsing**: Function, class, if, for, while, try, switch hierarchy
- ✅ **Scope Hierarchy**: Nested yapı görselleştirmesi (satır aralıkları + durum)
- ✅ **Bracket Analysis**: Kapanmamış/fazla parantezler (satır + sütun bilgisiyle)
- ✅ **Comment Blocks**: Single-line, multi-line, unclosed comment detection

**Kullanım Senaryoları:**

- 🔥 "Parantez cehennemi" durumlarında hangi scope'un kapanmadığını bulma
- 🏗️ Büyük refactoring sonrası dosya yapısını kontrol etme
- 🐛 Multi-line edit sonrası scope dengesi doğrulama
- 📊 Dosyanın genel yapısını anlama (function/class map)

**Örnek Çıktı:**

```
🔍 Dosya Yapısı: app.js
══════════════════════════════════════════════════

📦 SCOPE HIERARCHY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3-14     │ ⚡ calculateTotal            ✅
  7-10     │ └─ 🔀 if statement              ✅
16-33    │ 🏛️ ShoppingCart              ✅
  22-22    │ └─ 🔀 if statement              ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔗 BRACKET ANALYSIS:
❌ Kapanmamış parantezler (1):
   Line 26, Col 15: '{' kapanmamış

💬 COMMENT BLOCKS:
   Line 14: /* ... ❌ UNCLOSED
```

### 🔧 Teknik Değişiklikler

**Yeni Bağımlılıklar:**

- `@babel/parser`: AST parsing için
- `@babel/traverse`: AST traversal için
- `@babel/types`: Type definitions

**Yeni Fonksiyonlar:**

- `tools/dev-tools.ts`: `visualizeStructure()` fonksiyonu eklendi
- Parametreler: `projectRoot`, `filePath`, `options` (showScopes, showBrackets, showComments, showStrings, maxDepth)

**Handler Güncellemeleri:**

- `core/handlers.ts`: `hev_dev_visualize_structure` handler eklendi
- AST parsing ve fallback mekanizması

### 📝 Dokümantasyon

- README.md güncellendi (v1.10.0)
- AGENTS.md'ye Structure Visualizer bölümü eklendi
- Tool sayısı: 67 → 68
- Kullanım senaryoları ve workflow örnekleri

### 🎯 Faydalar

- ✅ "Parantez cehennemi" sorunlarını çözmek artık çok kolay
- ✅ AI'lar dosya yapısını görsel olarak anlayabilir
- ✅ Kapanmamış scope'lar kesin satır/sütun bilgisiyle tespit edilir
- ✅ Context Preview + Syntax Checker + Structure Visualizer = Üçlü güç sistemi

### 🏆 Üçlü Güç Sistemi Tamamlandı

1. **Context Preview (v1.8.0)**: Değişiklikleri görsel doğrula
2. **Structure Visualizer (v1.10.0)**: Dosya yapısını anla

---

## [1.9.0] - 2026-01-28

### ✨ Yeni Özellikler

#### Syntax Checker Tool

Dosyalarda syntax ve parantez dengesi kontrolü için yeni tool eklendi.

**Tool: `hev_dev_check_syntax`**

**Yetenekler:**

- ✅ **Bracket Balance Check**: `()`, `{}`, `[]` parantez dengesi kontrolü
- ✅ **ESLint Integration**: JavaScript/TypeScript syntax kontrolü (opsiyonel)
- ✅ **TypeScript Check**: Type kontrolü (opsiyonel)
- ✅ **JSON Validation**: JSON dosyaları için parse kontrolü

**Kullanım Senaryoları:**

- Multi-line edit sonrası hızlı syntax kontrolü
- Refactoring sonrası doğrulama
- JSON dosyalarının geçerliliğini kontrol etme
- Parantez dengesizliği tespiti

**Örnek Çıktı:**

```
🔍 Syntax Kontrolü: test.js
──────────────────────────────────────────────────
❌ Parantez Dengesi: BOZUK
   Süslü Parantez: 4 açık / 5 kapalı
──────────────────────────────────────────────────
❌ 1 sorun bulundu
```

### 🔧 Teknik Değişiklikler

**Yeni Fonksiyonlar:**

- `tools/dev-tools.ts`: `checkSyntax()` fonksiyonu eklendi
- Parametreler: `projectRoot`, `filePath`, `options` (checkBrackets, checkESLint, checkTS)

**Handler Güncellemeleri:**

- `core/handlers.ts`: `hev_dev_check_syntax` handler eklendi
- ESLint ve TypeScript entegrasyonu

**Bug Fixes:**

- `PROJECT_ROOT` hesaplaması düzeltildi (`__dirname` yerine `process.cwd()`)
- MCP config `npx` yerine `node` komutu ile düzeltildi

### 📝 Dokümantasyon

- README.md güncellendi (v1.9.0)
- AGENTS.md'ye syntax checker bölümü eklendi
- Tool sayısı: 66 → 67

### 🎯 Faydalar

- ✅ AI'lar edit sonrası anında syntax kontrolü yapabilir
- ✅ Parantez dengesizliği gibi yaygın sorunları otomatik yakalar
- ✅ JSON dosyalarının geçerliliğini doğrular
- ✅ Context Preview ile birlikte çalışarak kod kalitesini artırır

---

## [1.8.0] - 2026-01-28

### ✨ Yeni Özellikler

#### Context Preview Mekanizması

Edit operasyonlarına otomatik context preview desteği eklendi. Artık tüm kod değişikliklerinde değişiklik bölgesinin ±5 satır önü ve sonrası gösteriliyor.

**Etkilenen Tool'lar:**

- `hev_dev_edit_lines` (insert, replace, delete operasyonları)
- `hev_fs_find_and_replace`

**Faydaları:**

- ✅ AI'lar değişikliklerin doğru yere yapıldığını görsel olarak doğrulayabilir
- ✅ Yanlış satıra ekleme/silme sorunları minimuma iner
- ✅ Değişikliğin mantıksal context'ini görerek daha iyi karar verilir
- ✅ Tüm edit operasyonlarında otomatik olarak çalışır

**Örnek Çıktı:**

```
✅ 1 satır eklendi

Context Preview (±5 lines):
──────────────────────────────────────────────────
    3 │ function example() {
    4 │   const x = 1;
┌─[CHANGE START]─────────────────────
►   5 │   // Yeni eklenen satır
└─[CHANGE END]───────────────────────
    6 │   return x;
    7 │ }
──────────────────────────────────────────────────
```

### 🔧 Teknik Değişiklikler

**Yeni Fonksiyonlar:**

- `utils/file-utils.ts`: `getContextPreview()` helper fonksiyonu eklendi
- Parametreler: `filePath`, `startLine`, `endLine`, `contextLines` (default: 5)

**Güncellenen Fonksiyonlar:**

- `tools/dev-tools.ts`: `editLines()` fonksiyonu async yapıldı
- `tools/filesystem-tools.ts`: `findAndReplaceCode()` context preview desteği eklendi

**Type Güncellemeleri:**

- `EditLinesResult` interface'ine `contextPreview?: string` eklendi
- `ReplaceResult` interface'ine `contextPreview?: string` eklendi

**Handler Güncellemeleri:**

- `core/handlers.ts`: `hev_dev_edit_lines` handler eklendi
- Context preview otomatik olarak çıktıya dahil ediliyor

### 📝 Dokümantasyon

- README.md güncellendi (v1.8.0)
- Context Preview özelliği için yeni bölüm eklendi
- Örnek çıktılar ve kullanım senaryoları eklendi

---

## [1.7.0] - 2026-01-24

### Özellikler

- CDP (Chrome DevTools Protocol) desteği
- Filesystem operasyonları
- Dev Tools entegrasyonu
- Recycle Bin sistemi
- Diff araçları
- Provider validation

---

**Format:** [Semantic Versioning](https://semver.org/)

- **Major**: Breaking changes
- **Minor**: Yeni özellikler (geriye uyumlu)
- **Patch**: Bug fixes (geriye uyumlu)
