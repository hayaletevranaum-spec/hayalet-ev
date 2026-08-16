import assert from "node:assert/strict";
import test from "node:test";

import { evaluateGhostLoadingReadiness } from "../../ghost-agent/src/renderer/loading-readiness.ts";

void test("stays pending while URL is blank and still loading", () => {
  const result = evaluateGhostLoadingReadiness({
    nowMs: 1_000,
    startedAtMs: 0,
    firstNavigatedAtMs: null,
    url: "",
    isLoading: true,
    timeoutMs: 30_000,
    stableUrlMs: 1_500,
  });

  assert.equal(result.settle, "pending");
  assert.equal(result.firstNavigatedAtMs, null);
});

void test("resolves success when URL becomes stable even if isLoading stays true", () => {
  const result = evaluateGhostLoadingReadiness({
    nowMs: 4_000,
    startedAtMs: 0,
    firstNavigatedAtMs: 2_000,
    url: "https://opencode.ai/session/123",
    isLoading: true,
    timeoutMs: 30_000,
    stableUrlMs: 1_500,
  });

  assert.equal(result.settle, "success");
  assert.equal(result.reason, "url-stable");
});

void test("captures first navigation timestamp when URL appears", () => {
  const result = evaluateGhostLoadingReadiness({
    nowMs: 2_500,
    startedAtMs: 0,
    firstNavigatedAtMs: null,
    url: "https://opencode.ai/",
    isLoading: true,
    timeoutMs: 30_000,
    stableUrlMs: 1_500,
  });

  assert.equal(result.settle, "pending");
  assert.equal(result.firstNavigatedAtMs, 2_500);
});

void test("times out when maximum wait is exceeded", () => {
  const result = evaluateGhostLoadingReadiness({
    nowMs: 31_000,
    startedAtMs: 0,
    firstNavigatedAtMs: null,
    url: "about:blank",
    isLoading: true,
    timeoutMs: 30_000,
    stableUrlMs: 1_500,
  });

  assert.equal(result.settle, "timeout");
  assert.equal(result.reason, "timeout");
});
