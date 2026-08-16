import assert from "node:assert/strict";
import test from "node:test";

import { formatConnectionIndicatorText } from "../../src/js/pages/assistant/connection-indicator.ts";

void test("shows connected state with port", () => {
  const text = formatConnectionIndicatorText({
    isConnected: true,
    isServerRunning: true,
    port: 4110,
  });

  assert.equal(text, "Bağlı Port: 4110");
});

void test("shows disconnected passive state when server is not running", () => {
  const text = formatConnectionIndicatorText({
    isConnected: false,
    isServerRunning: false,
  });

  assert.equal(text, "Bağlı Değil: <sunucu pasif>");
});

void test("shows disconnected server port when server is running", () => {
  const text = formatConnectionIndicatorText({
    isConnected: false,
    isServerRunning: true,
    port: 18765,
  });

  assert.equal(text, "Bağlı Değil: sunucu:18765");
});
