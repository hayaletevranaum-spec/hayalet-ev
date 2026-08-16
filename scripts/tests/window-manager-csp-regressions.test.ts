import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

void test("window manager CSP allows room host data module fallbacks", () => {
  const source = readFileSync("electron/window-manager.ts", "utf8");

  assert.match(source, /script-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:/);
  assert.match(source, /script-src 'self' 'unsafe-inline' data: blob:/);
});
