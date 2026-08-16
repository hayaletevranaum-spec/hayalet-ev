import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

async function readProjectFile(relativePath: string): Promise<string> {
  return await readFile(path.join(ROOT, relativePath), "utf8");
}

void test("shell index declares one canonical overlay host with shared surface lanes", async () => {
  const indexHtml = await readProjectFile("src/index.html");

  assert.match(indexHtml, /id="app-overlay-host"/);
  assert.match(indexHtml, /data-overlay-layer="workspace-tool"/);
  assert.match(indexHtml, /data-overlay-layer="assistant-tool"/);
  assert.match(indexHtml, /data-overlay-layer="modal"/);
  assert.match(indexHtml, /data-overlay-layer="status"/);
  assert.match(indexHtml, /data-overlay-layer="scenario"/);
  assert.match(indexHtml, /data-overlay-layer="loading"/);
});

void test("overlay runtime exposes central families, host init, and surface metadata", async () => {
  const overlayRuntime = await readProjectFile("src/js/ui/overlay-system.ts");

  assert.match(overlayRuntime, /OVERLAY_SURFACE_FAMILIES/);
  assert.match(overlayRuntime, /APP_OVERLAY_HOST_ID/);
  assert.match(overlayRuntime, /function initAppOverlayHost/);
  assert.match(overlayRuntime, /function getDefaultOverlaySurfaceFamily/);
  assert.match(overlayRuntime, /function mountElementInOverlayHostLayer/);
  assert.match(overlayRuntime, /surfaceFamily/);
  assert.match(overlayRuntime, /overlayActiveFamilies/);
});

void test("app bootstrap initializes the overlay host and styles define shared layers for classic and scene", async () => {
  const appIndex = await readProjectFile("src/js/app/index.ts");
  const mainCss = await readProjectFile("src/styles/main.css");
  const sceneCss = await readProjectFile("src/styles/scene-system/shell.css");

  assert.match(appIndex, /initAppOverlayHost\(\)/);
  assert.match(mainCss, /\.app-overlay-host\s*\{/);
  assert.match(mainCss, /data-overlay-layer="workspace-tool"/);
  assert.match(mainCss, /data-overlay-layer="assistant-tool"/);
  assert.match(mainCss, /data-overlay-layer="modal"/);
  assert.match(sceneCss, /app-overlay-host__layer\[data-overlay-layer="workspace-tool"\]/);
  assert.match(sceneCss, /app-overlay-host__layer\[data-overlay-layer="status"\]/);
  assert.doesNotMatch(mainCss, /\.app-overlay-host__layer\.is-active\s*\{[^}]*pointer-events:\s*auto;/s);
  assert.match(mainCss, /\.app-overlay-host__layer\.is-active\s*>\s*\*\s*\{[^}]*pointer-events:\s*auto;/s);
});
