import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const deliveryModulePath = "src/js/modules/assistant-delivery.ts";
const assistantIndexPath = "src/js/pages/assistant/assistant.ts";

void test("shared delivery module navigates to assistant before delegating the send flow", () => {
  const content = readFileSync(deliveryModulePath, "utf8");

  assert.match(content, /showPage\("assistant"\)/);
  assert.match(content, /registerAssistantDeliveryHandler/);
  assert.match(content, /activeAssistantDeliveryHandler/);
});

void test("assistant controller registers a delivery handler and routes delivery through slot bridge", () => {
  const content = readFileSync(assistantIndexPath, "utf8");

  assert.match(
    content,
    /registerAssistantDeliveryHandler\(this\._handleDeliveryRequest\.bind\(this\)\)/
  );
  assert.match(content, /dispatchInternalSlotBridge\(/);
  assert.match(content, /action: "message\.send"/);
  assert.match(content, /toSlot: "ai0"/);
  assert.match(content, /provider: "user"/);
  assert.match(content, /fromSlot: "user"/);
  assert.doesNotMatch(content, /_ensureReadyForDelivery/);
  assert.doesNotMatch(content, /WebviewManager\.send\(/);
});
