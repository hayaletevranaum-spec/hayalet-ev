import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

async function readProjectFile(relativePath: string): Promise<string> {
  return await readFile(path.join(ROOT, relativePath), "utf8");
}

void test("assistant connection UI talks to the shared status controller without legacy overlay adapter methods", async () => {
  const connectionUi = await readProjectFile("src/js/pages/assistant/connection-ui.ts");
  const assistantController = await readProjectFile("src/js/pages/assistant/assistant.ts");

  assert.match(connectionUi, /setWebviewStatusOverlayState/);
  assert.match(assistantController, /setWebviewStatusOverlayState/);
  assert.doesNotMatch(connectionUi, /_updateOverlay/);
  assert.doesNotMatch(connectionUi, /_hideOverlay/);
  assert.doesNotMatch(assistantController, /_updateOverlay/);
  assert.doesNotMatch(assistantController, /_hideOverlay/);
});

void test("analyze read modal uses the shared modal runtime and no longer keeps a local modal shell", async () => {
  const analyzeContextMenu = await readProjectFile("src/js/pages/analyze/context-menu.ts");
  const analyzeHtml = await readProjectFile("src/pages/analyze.html");

  assert.match(analyzeContextMenu, /ModalManager\.open/);
  assert.match(analyzeContextMenu, /containerClassName: "modal-document modal-read"/);
  assert.doesNotMatch(analyzeContextMenu, /createHiddenClassOverlayController/);
  assert.doesNotMatch(analyzeHtml, /id="read-modal"/);
});
