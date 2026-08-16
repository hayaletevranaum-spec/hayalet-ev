import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

void test("cdp eval helper uses repo-native WebSocket CDP client", () => {
  const script = readFileSync(new URL("../cdp-eval.mjs", import.meta.url), "utf8");

  assert.match(script, /\/json\/list/);
  assert.match(script, /new WebSocket/);
  assert.match(script, /Runtime\.evaluate/);
  assert.doesNotMatch(script, /chrome-remote-interface/);
});

void test("package.json exposes the cdp eval helper", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8")
  ) as {
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.scripts?.["cdp:eval"], "node scripts/cdp-eval.mjs");
});
