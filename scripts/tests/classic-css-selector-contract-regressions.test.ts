import assert from "node:assert/strict";
import test from "node:test";

import {
  RUNTIME_SELECTOR_CONTRACTS,
  readRepoFile,
} from "../lib/classic-css-contract.mjs";

function buildSelectorPattern(selector: string): RegExp {
  if (selector.includes(" ")) {
    return new RegExp(
      selector
        .split(/\s+/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("[\\s\\S]*")
    );
  }
  return new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

void test("runtime-generated selector families stay backed by CSS contracts", () => {
  for (const contract of RUNTIME_SELECTOR_CONTRACTS) {
    const producerSource = readRepoFile(contract.producer);
    const backingCss = contract.backingCss.map((filePath) => readRepoFile(filePath)).join("\n");

    for (const selector of contract.selectors) {
      const pattern = buildSelectorPattern(selector);
      assert.match(producerSource, pattern, `${contract.name} producer drifted for ${selector}`);
      assert.match(backingCss, pattern, `${contract.name} css drifted for ${selector}`);
    }
  }
});
