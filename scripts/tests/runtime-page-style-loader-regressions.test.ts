import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimePageStyleRegistry } from "../../src/js/app/runtime-page-styles.ts";

void test("runtime page style loader retries after a rejected request", async () => {
  let attempts = 0;
  const registry = createRuntimePageStyleRegistry({
    archives: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("simulated archives style failure");
      }
      return {};
    },
    whisper: async () => ({}),
  });

  await assert.rejects(
    registry.ensureStyles("archives"),
    /simulated archives style failure/
  );
  await assert.doesNotReject(registry.ensureStyles("archives"));
  assert.equal(attempts, 2);
});

void test("runtime page style loader shares a single in-flight request per style key", async () => {
  let attempts = 0;
  let resolveLoader: (() => void) | null = null;
  const loaderReady = new Promise<void>((resolve) => {
    resolveLoader = resolve;
  });

  const registry = createRuntimePageStyleRegistry({
    archives: async () => {
      attempts += 1;
      await loaderReady;
      return {};
    },
    whisper: async () => ({}),
  });

  const firstRequest = registry.ensureStyles("archives");
  const secondRequest = registry.ensureStyles("archives");

  assert.equal(attempts, 1);
  (resolveLoader as unknown as () => void)();
  await Promise.all([firstRequest, secondRequest]);
  await registry.ensureStyles("archives");
  assert.equal(attempts, 1);
});
