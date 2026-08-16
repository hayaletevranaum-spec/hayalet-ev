import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

async function readProjectFile(relativePath: string): Promise<string> {
  return await readFile(path.join(ROOT, relativePath), "utf8");
}

void test("overlay presets expose shared factories for status, scenario, assistant tool, and active-class overlays", async () => {
  const presets = await readProjectFile("src/js/ui/overlay-presets.ts");

  assert.match(presets, /createSharedWebviewStatusOverlayController/);
  assert.match(presets, /createSharedScenarioOverlayController/);
  assert.match(presets, /createSharedAssistantToolOverlayController/);
  assert.match(presets, /createSharedActiveClassOverlayController/);
  assert.match(presets, /openSharedAssistantToolModal/);
});

void test("assistant and entrance flows use shared overlay presets instead of ad-hoc overlay wiring", async () => {
  const entrancePanel = await readProjectFile("src/js/pages/entrance/webview-panel.ts");
  const assistantController = await readProjectFile("src/js/pages/assistant/assistant.ts");
  const memoryOverlay = await readProjectFile("src/js/pages/assistant/memory-overlay.ts");
  const characterOverlay = await readProjectFile("src/js/pages/assistant/character-overlay.ts");

  assert.match(entrancePanel, /createSharedWebviewStatusOverlayController/);
  assert.match(entrancePanel, /createSharedScenarioOverlayController/);
  assert.match(assistantController, /createSharedWebviewStatusOverlayController/);
  assert.match(assistantController, /createSharedAssistantToolOverlayController/);
  assert.match(memoryOverlay, /createSharedAssistantToolOverlayController/);
  assert.match(characterOverlay, /createSharedAssistantToolOverlayController/);
});

void test("assistant test overlay and opencode ui modals share centralized overlay surfaces", async () => {
  const assistantPage = await readProjectFile("src/pages/assistant.html");
  const assistantStyles = await readProjectFile("src/styles/assistant.css");
  const quickPromptPanel = await readProjectFile("src/js/pages/opencode-ui/tools-prompts.ts");
  const modelSettings = await readProjectFile("src/js/pages/opencode-ui/model-settings-overlay.ts");
  const presets = await readProjectFile("src/js/ui/overlay-presets.ts");
  const opencodeDoctor = await readProjectFile("src/js/pages/assistant/opencode-doctor.ts");

  assert.match(assistantPage, /id="ai0-test-side-panel"/);
  assert.match(assistantPage, /id="ai0-test-panel-body"/);
  assert.match(assistantStyles, /\.assistant-test-modal/);
  assert.match(quickPromptPanel, /createSharedActiveClassOverlayController/);
  assert.match(modelSettings, /createSharedActiveClassOverlayController/);
  assert.match(presets, /mountElementInOverlayHostLayer\(options\.element, OVERLAY_SURFACE_FAMILIES\.assistantTool\)/);
  assert.match(opencodeDoctor, /openSharedAssistantToolModal/);
  assert.doesNotMatch(opencodeDoctor, /ModalManager\.open/);
});
