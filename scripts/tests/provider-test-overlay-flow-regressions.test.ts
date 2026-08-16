import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const entrancePath = "src/js/pages/entrance/webview-panel.ts";
const assistantPath = "src/js/pages/assistant/assistant.ts";
const providerTesterPath = "electron/provider-tester/index.ts";
const entranceHtmlPath = "src/pages/entrance.html";
const assistantHtmlPath = "src/pages/assistant.html";

void test("entrance scenario completion keeps results in the overlay instead of reopening the modal", () => {
  const content = readFileSync(entrancePath, "utf8");

  assert.doesNotMatch(content, /this\.showTestResultsModal\(results\);/);
});

void test("assistant scenario completion keeps results in the side panel instead of reopening the modal", () => {
  const content = readFileSync(assistantPath, "utf8");

  assert.doesNotMatch(content, /await openTestResultsModal\(results\);/);
});

void test("provider tester collapses entrance settings instead of opening them for the scenario", () => {
  const content = readFileSync(providerTesterPath, "utf8");

  assert.doesNotMatch(content, /classList\.remove\('open'\)/);
  assert.doesNotMatch(content, /classList\.add\('open'\)/);
});

void test("entrance test button click collapses the settings accordion before opening the launcher", () => {
  const content = readFileSync(entrancePath, "utf8");

  assert.match(content, /collapseSettingsAccordion\(\);/);
});

void test("renderers use generic scenario APIs for webview-test launch and progress", () => {
  const entranceContent = readFileSync(entrancePath, "utf8");
  const assistantContent = readFileSync(assistantPath, "utf8");

  assert.match(entranceContent, /const scenarioRequest =/);
  assert.match(entranceContent, /syncMode: state\.syncMode/);
  assert.match(entranceContent, /runProviderScenario\(scenarioRequest\)/);
  assert.match(entranceContent, /onProgress\(handler\)/);
  assert.match(
    assistantContent,
    /runProviderScenario\(\{\s*slot: "ai0",\s*scenarioId: state\.scenarioId/s
  );
  assert.match(assistantContent, /onProviderScenarioProgress\(handler\)/);
});

void test("renderers expose stop controls wired to cancel the active scenario run", () => {
  const entranceContent = readFileSync(entrancePath, "utf8");
  const assistantContent = readFileSync(assistantPath, "utf8");

  assert.match(entranceContent, /scenario-overlay__stop/);
  assert.match(entranceContent, /void this\.stopScenarioTest\(\)/);
  assert.match(entranceContent, /cancelScenario\(\{\s*runId\s*\}\)/);

  assert.match(assistantContent, /assistant-test-panel__stop/);
  assert.match(assistantContent, /void this\._stopScenarioTest\(\)/);
  assert.match(assistantContent, /cancelProviderScenario\(\{\s*runId: state\.runId\s*\}\)/);
});

void test("renderers dismiss scenario surfaces when the tested slot becomes unavailable", () => {
  const entranceContent = readFileSync(entrancePath, "utf8");
  const assistantContent = readFileSync(assistantPath, "utf8");

  assert.match(entranceContent, /dismissScenarioOverlayForUnavailableSlot/);
  assert.match(entranceContent, /shouldDismissScenarioOverlayForSlotState\(testedState\)/);
  assert.match(entranceContent, /shouldDismissScenarioOverlayForSlotState\(hostState\)/);
  assert.match(entranceContent, /cancelActiveRun: overlayState\.phase === "running"/);

  assert.match(assistantContent, /_dismissScenarioPanelForUnavailableSlot/);
  assert.match(assistantContent, /const shouldDismissScenarioPanel = !hasAccount \|\| \(!isConnected && !isConnecting\)/);
  assert.match(assistantContent, /this\._dismissScenarioPanelForUnavailableSlot\(\);/);
});

void test("scenario JSON copy uses guarded helper flows instead of raw clipboard writes", () => {
  const entranceContent = readFileSync(entrancePath, "utf8");
  const assistantContent = readFileSync(assistantPath, "utf8");

  assert.match(entranceContent, /copyScenarioSuiteJson/);
  assert.match(assistantContent, /_copyScenarioSuiteJson/);
});

void test("entrance overlay exposes an Assistant delivery action for completed webview-test results", () => {
  const entranceContent = readFileSync(entrancePath, "utf8");

  assert.match(entranceContent, /scenario-overlay__send-assistant/);
  assert.match(entranceContent, /state\.scenarioId === "webview-test"/);
  assert.match(entranceContent, /deliverScenarioResultsToAssistant/);
  assert.match(entranceContent, /deliverToAssistant\(\{/);
});

void test("only entrance page exposes sync buttons beside test buttons", () => {
  const entranceHtml = readFileSync(entranceHtmlPath, "utf8");
  const assistantHtml = readFileSync(assistantHtmlPath, "utf8");

  assert.match(entranceHtml, /id="ai1-sync-btn"/);
  assert.match(entranceHtml, /id="ai2-sync-btn"/);
  assert.doesNotMatch(assistantHtml, /id="ai0-sync-btn"/);
});

void test("only entrance renderer wires sync buttons to the webview-sync launcher flow", () => {
  const entranceContent = readFileSync(entrancePath, "utf8");
  const assistantContent = readFileSync(assistantPath, "utf8");

  assert.match(entranceContent, /handleSyncClick\("ai1"\)/);
  assert.match(entranceContent, /handleSyncClick\("ai2"\)/);
  assert.match(entranceContent, /openScenarioLauncher\(slot, "webview-sync"\)/);

  assert.doesNotMatch(assistantContent, /_handleSyncClick\(\)/);
  assert.doesNotMatch(assistantContent, /_openScenarioPanel\("webview-sync", "webview-sync"\)/);
});

void test("entrance renderer only enables sync for verified provider configs", () => {
  const entranceContent = readFileSync(entrancePath, "utf8");

  assert.match(entranceContent, /webviewSync\?\.readiness === "verified"/);
});

void test("overlay and panel styles keep the result list scrollable", () => {
  const entranceCss = readFileSync("src/styles/entrance/test.css", "utf8");
  const assistantCss = readFileSync("src/styles/assistant.css", "utf8");
  const slotCss = readFileSync("src/styles/entrance/slot.css", "utf8");

  assert.match(entranceCss, /\.scenario-overlay__steps\s*\{[^}]*overflow:\s*auto/s);
  assert.match(entranceCss, /\.scenario-overlay\s*\{[^}]*margin:\s*0/s);
  assert.match(entranceCss, /\.scenario-slot-overlay\s*\{/);
  assert.match(assistantCss, /\.assistant-test-panel__steps\s*\{[^}]*overflow:\s*auto/s);
  assert.match(slotCss, /\.slot-card\s*\{[^}]*position:\s*relative/s);
});

void test("entrance overlay auto-scrolls scenario results to the latest row", () => {
  const entranceContent = readFileSync(entrancePath, "utf8");

  assert.match(entranceContent, /scrollScenarioOverlayToBottom\(overlayEl\);/);
  assert.match(entranceContent, /`\$\{state\.hostSlot\}-scenario-overlay`/);
  assert.match(entranceContent, /stepsEl\.scrollTop\s*=\s*stepsEl\.scrollHeight/);
  assert.match(entranceContent, /requestAnimationFrame\(scrollToBottom\)/);
});

void test("entrance page provides dedicated scenario overlay hosts for full-slot coverage", () => {
  const entranceHtml = readFileSync(entranceHtmlPath, "utf8");

  assert.match(entranceHtml, /id="ai1-scenario-overlay"/);
  assert.match(entranceHtml, /id="ai2-scenario-overlay"/);
});

void test("entrance overlay renders a structured session preview list for sync results", () => {
  const entranceContent = readFileSync(entrancePath, "utf8");
  const entranceCss = readFileSync("src/styles/entrance/test.css", "utf8");

  assert.match(entranceContent, /sessionPreview\?\.sessions\.length/);
  assert.match(entranceContent, /sessionPreview\.sessions\s*\.map/s);
  assert.match(entranceContent, /scenario-step__preview-list/);
  assert.match(entranceCss, /\.scenario-step__preview-list\s*\{/);
  assert.match(entranceCss, /\.scenario-step__preview-item\s*\{/);
});

void test("entrance overlay gives sync URL progress messages dedicated styling", () => {
  const entranceContent = readFileSync(entrancePath, "utf8");
  const entranceCss = readFileSync("src/styles/entrance/test.css", "utf8");

  assert.match(entranceContent, /scenario-step__message--sync-progress/);
  assert.match(entranceContent, /row\.id\.startsWith\("navigate-session"\)/);
  assert.match(entranceContent, /row\.id\.startsWith\("sync-session"\)/);
  assert.match(entranceCss, /\.scenario-step__message--sync-progress\s*\{/);
  assert.match(entranceCss, /overflow-wrap:\s*anywhere/);
});

void test("entrance overlay offers soft full clean mode selection for webview-sync", () => {
  const entranceContent = readFileSync(entrancePath, "utf8");
  const entranceCss = readFileSync("src/styles/entrance/test.css", "utf8");

  assert.match(entranceContent, /syncMode:\s*"full"/);
  assert.match(entranceContent, /data-sync-mode="soft"/);
  assert.match(entranceContent, /data-sync-mode="full"/);
  assert.match(entranceContent, /data-sync-mode="clean"/);
  assert.match(entranceContent, /scenario-sync-mode/);
  assert.match(entranceCss, /\.scenario-sync-mode\s*\{/);
  assert.match(entranceCss, /\.scenario-sync-mode__option\.is-active\s*\{/);
});
