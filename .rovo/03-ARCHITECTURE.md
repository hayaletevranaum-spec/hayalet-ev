# 04-ARCHITECTURE.md

> **Hayalet-ev Proje Mimarisi**
> Kritik modüller, bağımlılıklar ve dikkat edilmesi gerekenler

---

## 🏗️ Proje Özeti

**Hayalet-ev — Ghost House:** Electron tabanlı multi-AI chat platformu

### Tech Stack

| Teknoloji  | Versiyon | Notlar         |
| ---------- | -------- | -------------- |
| Electron   | 39+      | Node.js ESM    |
| TypeScript | 5.x      | Strict mode    |
| Vite       | 7.3      | Build tool     |
| SQLite     | -        | better-sqlite3 |
| Node.js    | 22.22.0  | ESM only       |

### AI Asistan Development Tools

| Tool                         | Amaç   | Notlar                         |
| ---------------------------- | ------ | ------------------------------ |
| `typescript-language-server` | ^5.1.3 | AI asistanlar için LSP desteği |
| `typescript`                 | ^5.9.3 | Type checking ve compiler      |

### Mimari Yapı

```
Main Process - Node.js
  ├── electron/              # Ana process kodları
  │   ├── main.js           # Entry point
  │   ├── preload.cjs       # IPC bridge
  │   ├── database/         # SQLite
  │   └── logger/           # Log sistemi
  │
  └── Renderer Process - Chromium
      ├── src/js/           # UI kodları
      ├── src/ui/           # HTML templates
      └── src/assets/       # CSS, images

MCP Server - Ayrı process
  └── mcp-server/           # hev_* toolları - sayı: hev_mcp_health ile kontrol et
```

---

## 🎯 Ana Modüller ve Rolleri

### 1. Core Engine

**Dosya:** `src/js/modules/core-engine.ts`

**Rol:** Ana koordinatör. Tüm modülleri başlatır ve yönetir.

**Kritik Metodlar:**

- `initialize` - Uygulama başlangıcı
- `handleMessage` - Mesaj yönlendirme
- `shutdown` - Güvenli kapatma

**Dikkat:** Başlatma sırası kritik. Yanlış sıra = race condition.

---

### 2. Slot Controller

**Dosya:** `src/js/modules/slot-controller.ts`

**Rol:** State machine. AI slot'larının yaşam döngüsünü yönetir.

**Kritik Metodlar:**

- `createSlot` - Yeni slot oluştur
- `activateSlot` - Slot'u aktif et
- `destroySlot` - Slot'u temizle

---

### 3. Webview Manager

**Dosya:** `src/js/modules/webview-manager.ts`

**Rol:** Webview lifecycle yönetimi. AI provider'ların — ChatGPT, Gemini, Grok — webview'larını kontrol eder.

**Kritik Metodlar:**

- `createWebview` - Provider webview oluştur
- `loadProvider` - Provider URL yükle
- `handleNavigation` - Sayfa geçişleri

**Dikkat:** Electron security — contextIsolation, sandbox — kritik.

---

### 4. Traffic Manager

**Dosya:** `src/js/modules/traffic-manager.ts`

**Rol:** State tracking. Kullanıcı işlemlerini ve AI yanıtlarını takip eder.

**Kritik Metodlar:**

- `trackRequest` - İstek takibi
- `trackResponse` - Yanıt takibi
- `getAnalytics` - İstatistikler

---

### 5. Provider'lar

**Konum:** `src/js/modules/webview/providers/`

Her AI için ayrı config:

- `chatgpt/config.ts` - ChatGPT ayarları
- `gemini/config.ts` - Gemini ayarları
- `grok/config.ts` - Grok ayarları

**Validation:**

```typescript
// Selector'ları test et
hev_validate_provider_selectors{ provider_name: "chatgpt" };
```

---

### 6. Scene Runtime, Theme Source ve Scene Editor

**Ana Dosyalar:**

- `shared/themes/castle/manifest.ts`
- `shared/themes/castle/maps/*.scene.json`
- `src/js/scene-system/index.ts`
- `src/js/scene-editor/index.ts`
- `src/styles/scene-system/index.css`
- `src/styles/scene-editor/index.css`

**Rol:** Theme source tek kaynaktır. Scene runtime bu kaynağı player gibi okur ve uygular. Scene editor aynı map dosyalarını draft + save-to-source akışıyla düzenler.

**Kurallar:**

- Theme asset, loading frame, character config ve room map verileri `shared/themes/<themeId>` altında tutulur.
- Scene runtime yalnızca `src/js/scene-system/*` üstünden theme okur; room geometry için ikinci bir kaynak tutulmaz.
- Scene editor yalnızca `src/js/scene-editor/*` üstünden çalışır; local draft ayrı, source save ayrı aksiyondur.
- `src/styles/design-system/*` classic theme alanıdır; scene shell `src/styles/scene-system`, debug/editor UI `src/styles/scene-editor` altında yaşar.

---

## 🔐 IPC — Inter-Process Communication

### Güvenlik Kuralı: `contextIsolation = true`

**Yapı:**

```
Renderer Process - Chromium
  ↕️ IPC
Main Process - Node.js
  ↕️ Native API
OS
```

### Önemli IPC Kanalları

| Kanal           | Yön   | Amaç             |
| --------------- | ----- | ---------------- |
| `app:ready`     | M→R   | Uygulama hazır   |
| `message:send`  | R→M→R | Mesaj gönder/al  |
| `settings:load` | R↔M   | Ayarları oku/yaz |
| `logger:write`  | R→M   | Log yaz          |

### Preload Script

**Dosya:** `electron/preload.cjs`

```javascript
// Doğru: Secure IPC
contextBridge.exposeInMainWorld "electronAPI", {
  sendMessage: channel, data => {
    // Sadece whitelist kanalları
    if validChannels.includes channel {
      ipcRenderer.invoke channel, data;
    }
  },
};
```

---

## 🗄️ Database — SQLite - Per-Account

### Konum

`electron/database/`

### Yapı

Her hesap için ayrı SQLite veritabanı:

```
data/
└── {email}_{provider}/                    # Hesap klasörü
    ├── archive.db                         # SQLite veritabanı
    └── {conversationId}/
        └── {messageId}/
            └── attachment.pdf             # Mesaj eklentileri
```

### Schema

```sql
-- conversations
CREATE TABLE conversations
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  web_url TEXT NOT NULL,
  provider TEXT,
  title TEXT,
  summary TEXT,
  message_count INTEGER DEFAULT 0,
  last_message_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
;

-- messages
CREATE TABLE messages
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  role TEXT, -- 'user' | 'assistant'
  author TEXT,
  content TEXT,
  dom_index INTEGER,
  dom_id TEXT,
  content_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY conversation_id REFERENCES conversations id ON DELETE CASCADE
;

-- attachments
CREATE TABLE attachments
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  original_name TEXT,
  stored_name TEXT,
  stored_path TEXT,
  mime_type TEXT,
  size INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY message_id REFERENCES messages id ON DELETE CASCADE
;
```

### Kullanım

```typescript
// Slot'a hesap atandığında veritabanı başlatılır
await window.electronAPI.initAccount{ accountId: "user@gmail.com_chatgpt" };

// Konuşmaları getir
const conversations = await window.electronAPI.dbGetConversations{
  accountId: "user@gmail.com_chatgpt"
};

// Mesajları senkronize et
await window.electronAPI.dbSyncMessages{
  accountId: "user@gmail.com_chatgpt",
  webUrl: "https://chatgpt.com/c/123",
  messages: [...]
};
```

### Dosya Yapısı

| Dosya                                 | Açıklama                           |
| ------------------------------------- | ---------------------------------- |
| `electron/database/index.ts`          | DatabaseManager - IPC handler'ları |
| `electron/database/sqlite-manager.ts` | Per-account DB factory             |
| `electron/database/sqlite-archive.ts` | ArchiveManager implementasyonu     |
| `electron/database/hash-utils.ts`     | Hash fonksiyonları                 |

---

## 📝 Log Sistemi

### 3-Tier Sistem

1. **Renderer Logger** - `src/js/modules/logger/Logger.ts`
2. **Main Logger** - `electron/logger/core/LoggerCore.ts`
3. **MCP Logger** - `mcp-server/utils/mcp-logger.ts`

### Log Formatı

```json
{
  "timestamp": "2026-02-01T14:30:15.123Z",
  "level": "error|warn|info|debug",
  "component": "SlotController",
  "message": "...",
  "context": { ... }
}
```

### Log Okuma

```typescript
// Son hataları oku
hev_read_electron_logs{ type: "error", limit: 50 };

// Belirli session
hev_get_session_summary{ session_id: "2026-02-01-143022" };

// Hata analizi
hev_get_error_hints{ error_message: "..." };
```

---

## 🎨 UI ve CSS

### Konum

- `src/ui/` - HTML templates
- `src/assets/css/` - Stil dosyaları

### Önemli Dosyalar

| Dosya          | Amaç           |
| -------------- | -------------- |
| `main.html`    | Ana pencere    |
| `sidebar.html` | Yan menü       |
| `chat.html`    | Sohbet arayüzü |
| `styles.css`   | Ana stiller    |

### CSS Merkezileştirme

Proje şu anda CSS merkezileştirme sürecinde. Yeni stiller `styles.css`'e eklenmeli.

---

## 🛠️ Geliştirme Scriptleri

### NPM Scripts

```bash
# Uygulamayı başlat
npm start

# Build
npm run build                  # Renderer build
npm run build:all              # 🆕 Tüm build - renderer + electron + mcp

# Test
npm run test

# Lint
npm run lint                   # Tüm proje - src + electron + mcp
npm run lint:fix               # Auto-fix

# TypeScript kontrol
npm run check-types            # Tüm proje kontrol

# Tüm kontroller - pre-commit
npm run check                  # lint + types
npm run ai:check               # 🆕 Unified check - AI development

# Clean
npm run clean                  # Dist temizle
npm run clean:all              # 🆕 Tümünü temizle
```

### MCP Server Commands

```bash
npm run mcp:build              # MCP build
npm run mcp:check              # 🆕 MCP kontrol - type + lint
npm run mcp:lint               # 🆕 MCP lint
npm run mcp:lint:fix           # 🆕 MCP auto-fix
```

---

## 🐛 Debug ve Test

### Electron Debug

```typescript
// Log okuma
hev_read_electron_logs{ type: "error", limit: 50 };

// CDP ile canlı debug
hev_check_electron_connection;
hev_send_command_to_electron{ command: "document.title" };
hev_take_cdp_screenshot;
hev_inspect_element{ selector: "#main-content" };
```

---

## 🏠 Room Package Contract

Room sistemi artık portable paket mantığıyla düşünülmelidir:

```text
rooms/<room-id>/
  manifest.json
  host/index.js
  ui/index.html
  ui/bootstrap.js
  ui/style.css
  shared/
    assets/
    data/
    host/
    ui/
    styles/
  main-functions/
    <feature-id>/
      assets/
      data/
      host/
      ui/
      styles/
      protocols/
```

Kurallar:

- `manifest.features[]` oda içindeki canonical `ana fonksiyon` listesidir.
- Core (`src/**`, `electron/**`) room-specific davranış bilmez; room-specific mantık room paketinde yaşar.
- `data/rooms/<room-id>` yalnızca kurulu portable room kopyasıdır.
- `data/room-storage/<room-id>` mutable runtime state, exports, caches, models, tool runtime payloads ve proje çıktıları içindir.
- Workspace altında üretilmiş artefact (`rooms/*/dist`, tool runtime binary, analysis output) bırakılmaz.
- Paket içinde kalıcı ama source-of-truth olmayan yardımcı veri ve room-local tooling metadata `shared/data/**` veya ilgili `main-functions/<feature>/data/**` altında tutulur.

Bu ayrım korunmadan yapılan room geliştirmeleri import/export portability ve multi-agent çalışma sınırlarını zayıflatır.

---

## ⚠️ Dikkat Edilmesi Gerekenler

### 1. TypeScript Strict Mode

- `any` kullanımı yasak
- Tüm fonksiyonlar return type belirtmeli
- Interface'ler eksiksiz olmalı

### 2. Electron Security

- `nodeIntegration: false` — varsayılan
- `contextIsolation: true` — zorunlu
- `sandbox: true` — tercih edilen

### 3. Memory Yönetimi

- Event listener'ları temizle
- Webview'ları destroy et
- Büyük objeleri null'la

### 4. Async/Await

- Tüm async işlemler try-catch ile
- Promise chain yerine await
- Hataları logla ve handle et

### 5. Naming Convention

- `camelCase` - değişkenler, fonksiyonlar
- `PascalCase` - class'lar, interface'ler
- `UPPER_SNAKE_CASE` - constant'lar
- `kebab-case` - dosya isimleri

---

## 🔗 Kritik Bağımlılıklar

### Yeni Provider Ekleme

1. `src/js/modules/webview/providers/<name>/config.ts` oluştur
2. `provider-registry.ts`'e kaydet
3. `electron/webview-manager.js`'e ekle
4. UI'a buton ekle
5. `hev_validate_provider_selectors` ile test et

---

## 📚 Önemli Kavramlar

| Kavram    | Dosya                               | Açıklama               |
| --------- | ----------------------------------- | ---------------------- |
| Settings  | `electron/settings-manager.ts`      | JSON config yönetimi   |
| IPC       | `electron/preload.cjs`              | `window.electronAPI.*` |
| Providers | `src/js/modules/webview/providers/` | AI entegrasyonları     |
| Database  | `electron/database/`                | SQLite wrapper         |
| CDP       | Chrome DevTools Protocol            | Canlı debug            |

---

## 🎯 Performans İpuçları

### IPC Optimizasyon

- Log'ları batch et — 50 log veya 100ms
- Büyük payload'ları chunk'la
- Throttle kullan — 1s

### Render Optimizasyon

- Debounce input handler'lar
- Lazy load modüller
- Virtual scroll uzun listelerde

---

**Versiyon:** 3.0  
**Son Güncelleme:** 2026-02-02  
**Sonraki Adım:** Artık hazırsın! İlk görevini `.rovo/03-WORKFLOWS.md`'den seç.
