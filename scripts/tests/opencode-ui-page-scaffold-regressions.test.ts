import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

void test("opencode-ui page scaffold exposes required shell ids and script path", () => {
  const pagePath = "src/pages/opencode-ui.html";

  assert.equal(existsSync(pagePath), true, "Expected opencode-ui page file to exist");

  const html = readFileSync(pagePath, "utf8");

  assert.match(html, /id="session-list"/);
  assert.match(html, /id="chat-input"/);
  assert.match(html, /\/js\/pages\/opencode-ui\/app\.ts/);
});
