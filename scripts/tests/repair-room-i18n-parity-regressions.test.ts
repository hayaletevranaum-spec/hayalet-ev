import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const I18N_DIR = join(process.cwd(), "rooms/repair-room/i18n");

function collectKeyPaths(obj: Record<string, unknown>, prefix: string[] = []): Set<string> {
  const paths = new Set<string>();
  for (const [key, value] of Object.entries(obj)) {
    const path = [...prefix, key];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const sub of collectKeyPaths(value as Record<string, unknown>, path)) {
        paths.add(sub);
      }
    } else {
      paths.add(path.join("."));
    }
  }
  return paths;
}

function getPathValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => {
    if (typeof node !== "object" || node === null) return undefined;
    return (node as Record<string, unknown>)[key];
  }, obj);
}

void test("repair-room i18n catalog parity: en.json and tr.json share identical key paths", () => {
  const en = JSON.parse(readFileSync(join(I18N_DIR, "en.json"), "utf8")) as Record<string, unknown>;
  const tr = JSON.parse(readFileSync(join(I18N_DIR, "tr.json"), "utf8")) as Record<string, unknown>;

  const enKeys = collectKeyPaths(en);
  const trKeys = collectKeyPaths(tr);

  const missingInTr = [...enKeys].filter((k) => !trKeys.has(k));
  const missingInEn = [...trKeys].filter((k) => !enKeys.has(k));

  assert.equal(
    missingInTr.length,
    0,
    `Keys present in en.json but missing in tr.json (${missingInTr.length}):\n  ${missingInTr.join("\n  ")}`
  );
  assert.equal(
    missingInEn.length,
    0,
    `Keys present in tr.json but missing in en.json (${missingInEn.length}):\n  ${missingInEn.join("\n  ")}`
  );
  assert.equal(enKeys.size, trKeys.size, `Key count mismatch: en=${enKeys.size} tr=${trKeys.size}`);
});

void test("repair-room Turkish catalog covers visible Repair Room chrome", () => {
  const tr = JSON.parse(readFileSync(join(I18N_DIR, "tr.json"), "utf8")) as Record<string, unknown>;
  const expected = new Map<string, string>([
    ["statusbar.version", "Tamir Odası v0.1.0"],
    ["statusbar.setup", "Kurulum"],
    ["workbench.noImage", "Kart görseli gerekli"],
    ["workbench.tools.select.label", "Seç"],
    ["workbench.tools.pan.label", "Kaydır"],
    ["workbench.tools.rect.label", "Kutu"],
    ["workbench.tools.freehand.label", "Çiz"],
    ["workbench.tools.text.label", "Metin"],
    ["workbench.toolbar.aiMarks", "Asistan AI İşaretleri"],
    ["workbench.guidance.benchReady", "Tezgah hazır."],
    ["workbench.guidance.openRepairSession", "Bir tamir oturumu aç."],
    ["workbench.guidance.phase.observe", "gözlem"],
    ["timeline.title", "Onarım Anları"],
    ["timeline.latest", "Son kayıt"],
    ["timeline.cleanSnapshot", "Temiz snapshot al"],
    ["timeline.labels.assistantState", "Asistan durumu"],
    ["sync.title", "Oda Eşitleme"],
    ["sync.status.liveEdge", "Canlı kenar"],
    ["sync.inspector.selected", "seçili"],
    ["tacticalFeed.title", "Tamir Akışı"],
    ["tacticalFeed.composer", "Tamir asistanına sor..."],
    ["tacticalFeed.send", "Gönder"],
    ["measurement.manualEntry", "Manuel Okuma"],
    ["panelChips.timeline", "Onarım Anları"],
    ["panelChips.state", "Durum"],
  ]);

  for (const [path, value] of expected) {
    assert.equal(getPathValue(tr, path), value, path);
  }
});

void test("repair-room persistent UI chrome refreshes when host locale context changes", () => {
  const runtimeSource = readFileSync(
    join(process.cwd(), "rooms/repair-room/ui/repair-room-ui-runtime.ts"),
    "utf8"
  );

  assert.match(runtimeSource, /translationRevision/);
  assert.match(runtimeSource, /syncPersistentShellText/);
  assert.match(runtimeSource, /found = false/);
  assert.match(runtimeSource, /panelElements\.clear\(\)/);
  assert.match(runtimeSource, /panelSignatures\.clear\(\)/);
  assert.match(runtimeSource, /buildRepairPanelSignature\(\{ meta, panelId, state \}\)/);
});

void test("repair-room workbench layer toolbar labels come from i18n", () => {
  const workbenchSource = readFileSync(
    join(process.cwd(), "rooms/repair-room/ui/panels/workbench-stage-panel.ts"),
    "utf8"
  );

  assert.match(workbenchSource, /labelKey: "aiMarks"/);
  assert.match(workbenchSource, /text\(\["workbench", "toolbar", layer\.labelKey\]/);
  assert.match(workbenchSource, /createLayerButton\(documentRef, state, layer, text\)/);
});
