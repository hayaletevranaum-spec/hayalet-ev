# 02-MCP-ESSENTIALS.md

> **Temel MCP Tool Rehberi**
>
> ⚠️ Built-in dosya toolları YASAK — detaylar `AGENTS.md` #1 Kural'da.
> Tool keşfi: `hev_mcp_health` → durum, `hev_list_tools` → liste, `hev_suggest_tool{ intent }` → keşif

---

## ⭐ Session Başlangıç — Adaptive

| Durum | Tool | Amaç |
|------|------|------|
| Base | `hev_mcp_health` | MCP çalışıyor mu? Versiyon + tool sayısı |
| Base | `hev_memory_bootstrap_policy{ namespace: "policy" }` | Session başında 1 kez |
| İhtiyaç | `hev_list_tools` | MCP tool kullanacaksan |
| İhtiyaç | `hev_suggest_tool{ intent: "..." }` | Intent belirsizse |
| İhtiyaç | `hev_fs_read{ file_path }` | Dosya/bağlam gerektiğinde |

> **MCP çalışmazsa:** Built-in toollar aktif olur — RİSKLİ. Kullanıcıyı bilgilendir.

---

## ✏️ Dosya İşlemleri — Tier Sistemi

> Built-in → MCP mapping tablosu için bkz: `AGENTS.md` #1 Kural

| Tier | Tool | Ne Zaman? |
|------|------|-----------|
| 1 | `hev_fs_edit` | Pattern-based find/replace |
| 2 | `hev_dev_edit_lines` | Satır bazlı düzenleme — ÖNERİLEN |
| 3 | `hev_dev_smart_insert` | Doğal dil ile pozisyon bulma — `"after function X"` |
| 4 | `hev_dev_safe_batch_refactor` | Toplu refactor — auto-rollback destekli |

### Güvenli Edit Akışı — 3 Adım, ZORUNLU

```
1. hev_fs_read{ file_path }              → Oku, satır numaralarını öğren
2. hev_fs_edit{ file_path, edits }       → Değişikliği yap
   VEYA hev_dev_edit_lines{ ... }        → Satır bazlı düzenleme
3. hev_dev_check_syntax{ file_path }     → Doğrula - ZORUNLU
```

---

## 🔧 TypeScript Düzeltme Akışı

```
1. hev_dev_typescript_dashboard                    → Hata analizi + öneriler
2. hev_dev_fix_typescript_batch{ file_path, ... }  → Otomatik toplu düzeltme
3. hev_dev_check_syntax{ file_path }               → Doğrulama
```

> Detaylı senaryo: `AGENTS.md` → "Hardcoded Workflow Senaryoları" → `typescript-fix-large`

---

## 🔍 Arama ve Analiz

| Tool | Amaç |
|------|------|
| `grep{ pattern }` | Projede regex arama - built-in OK |
| `hev_dev_search_symbol{ symbol, type }` | Fonksiyon/class/interface ara |
| `hev_dev_find_references{ ... }` | Cross-file kullanım etkisini gör |
| `hev_dev_eslint_dashboard` | ESLint hata analizi + dashboard |

---

## 🛡️ Güvenlik ve Doğrulama

| Tool | Amaç |
|------|------|
| `hev_dev_check_syntax{ file_path }` | Parantez + ESLint + TS kontrol |
| `hev_dev_ts_diagnostics{ file_path }` | Tek dosya için derin TS tanısı |
| `hev_take_cdp_screenshot` | UI debug için ekran görüntüsü al |

---

## 💻 Shell ve Test

```
bash{ command: "npm run check-types" }   → TypeScript kontrol
bash{ command: "npm run lint" }          → ESLint
bash{ command: "npm run ai:check" }      → Unified check
git diff                                 → Değişiklikleri gör
gh pr create                             → Gerekirse PR oluştur
```

> ⚠️ Riskli komutlar — rm -rf, git push — için önce plan onayı al.

---

## 📚 Daha Fazla Tool Keşfet

```
hev_list_tools                           → Tüm tool'ları kategorize listele
hev_suggest_tool{ intent: "..." }        → Amaca göre tool önerisi
AGENTS.md → "Hardcoded Workflow Senaryoları" bölümü → Senaryo bazlı workflow kaynağı
mcp__hayalet_ev__get_tool_schema{ tool_name: "..." } → Detaylı parametre şeması
```

---

**Versiyon:** 5.1 — AGENTS.md sync
**Son Güncelleme:** 2026-02-14
**Sonraki Adım:** `AGENTS.md` içindeki "Hardcoded Workflow Senaryoları" bölümünü oku
