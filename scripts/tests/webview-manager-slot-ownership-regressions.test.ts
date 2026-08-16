import assert from "node:assert/strict";
import test from "node:test";

import { SlotController } from "../../src/js/modules/slot-controller.ts";
import { WebviewManager } from "../../src/js/modules/webview-manager.ts";

type MockStyle = {
  position: string;
  top: string;
  left: string;
  width: string;
  height: string;
  display: string;
};

type MockWebview = {
  style: MockStyle;
  attrs: Map<string, string>;
  classes: Set<string>;
  classList: {
    add: (value: string) => void;
    remove: (value: string) => void;
    contains: (value: string) => boolean;
  };
  setAttribute: (key: string, value: string) => void;
  getAttribute: (key: string) => string | null;
  removeAttribute: (key: string) => void;
};

function createWebview(): MockWebview {
  const attrs = new Map<string, string>();
  const classes = new Set<string>();
  return {
    style: {
      position: "",
      top: "",
      left: "",
      width: "",
      height: "",
      display: "",
    },
    attrs,
    classes,
    classList: {
      add: (value: string) => {
        classes.add(value);
      },
      remove: (value: string) => {
        classes.delete(value);
      },
      contains: (value: string) => classes.has(value),
    },
    setAttribute: (key: string, value: string) => {
      attrs.set(key, value);
    },
    getAttribute: (key: string) => attrs.get(key) ?? null,
    removeAttribute: (key: string) => {
      attrs.delete(key);
    },
  };
}

function resetSlot(slot: "ai0" | "ai1" | "ai2"): void {
  const slots = (SlotController as unknown as { _slots: Record<string, Record<string, unknown>> })._slots;
  const slotState = slots[slot];
  if (!slotState) return;

  slotState["state"] = "empty";
  slotState["webview"] = null;
  slotState["webviewRegistered"] = false;
  slotState["domReady"] = false;
  slotState["currentUrl"] = "";
  slotState["urlExcluded"] = false;
  slotState["lastActivity"] = Date.now();
}

void test("resolveWebview returns SlotController-owned webview when lifecycle cache is not used", () => {
  const webview = createWebview();

  resetSlot("ai1");
  SlotController.registerWebview("ai1", webview as unknown as HTMLElement);

  const resolved = WebviewManager.resolveWebview("ai1");

  assert.equal(resolved, webview);

  resetSlot("ai1");
});

void test("cleanupInactiveWebviews detaches stale disconnected slot webview", () => {
  const webview = createWebview();
  webview.setAttribute("src", "https://example.test");

  resetSlot("ai2");
  SlotController.registerWebview("ai2", webview as unknown as HTMLElement);

  const slots = (SlotController as unknown as { _slots: Record<string, Record<string, unknown>> })._slots;
  const slotState = slots["ai2"];
  assert.ok(slotState);
  slotState["state"] = "assigned";
  slotState["lastActivity"] = Date.now() - 31 * 60 * 1000;

  WebviewManager.cleanupInactiveWebviews();

  assert.equal(webview.getAttribute("data-detached"), "1");
  assert.equal(webview.getAttribute("src"), null);
  assert.equal(webview.classList.contains("is-hidden"), true);

  resetSlot("ai2");
});

void test("attach routes slot lifecycle through SlotController helpers", () => {
  const webview = createWebview();
  const slotControllerAny = SlotController as unknown as {
    registerWebview: (slot: string, value: HTMLElement) => void;
    ensureWebviewMounted: (slot: string) => boolean;
    ensureWebviewAttached: (slot: string) => boolean;
    markActive: (slot: string) => boolean;
  };

  const originalRegisterWebview = slotControllerAny.registerWebview;
  const originalEnsureMounted = slotControllerAny.ensureWebviewMounted;
  const originalEnsureAttached = slotControllerAny.ensureWebviewAttached;
  const originalMarkActive = slotControllerAny.markActive;

  let registerCalls = 0;
  let ensureMountedCalls = 0;
  let ensureAttachedCalls = 0;
  let markActiveCalls = 0;

  try {
    slotControllerAny.registerWebview = () => {
      registerCalls += 1;
    };
    slotControllerAny.ensureWebviewMounted = () => {
      ensureMountedCalls += 1;
      return true;
    };
    slotControllerAny.ensureWebviewAttached = () => {
      ensureAttachedCalls += 1;
      return true;
    };
    slotControllerAny.markActive = () => {
      markActiveCalls += 1;
      return true;
    };

    WebviewManager.attach("ai1", webview as unknown as never);

    assert.equal(registerCalls, 1);
    assert.equal(ensureMountedCalls, 1);
    assert.equal(ensureAttachedCalls, 1);
    assert.equal(markActiveCalls, 1);
  } finally {
    slotControllerAny.registerWebview = originalRegisterWebview;
    slotControllerAny.ensureWebviewMounted = originalEnsureMounted;
    slotControllerAny.ensureWebviewAttached = originalEnsureAttached;
    slotControllerAny.markActive = originalMarkActive;
  }
});

void test("detach routes slot lifecycle through SlotController parking", () => {
  const slotControllerAny = SlotController as unknown as {
    parkWebview: (slot: string) => boolean;
  };

  const originalParkWebview = slotControllerAny.parkWebview;
  let parkCalls = 0;

  try {
    slotControllerAny.parkWebview = () => {
      parkCalls += 1;
      return true;
    };

    WebviewManager.detach("ai2");

    assert.equal(parkCalls, 1);
  } finally {
    slotControllerAny.parkWebview = originalParkWebview;
  }
});

void test("destroyWebview routes slot lifecycle through SlotController parking", () => {
  const slotControllerAny = SlotController as unknown as {
    parkWebview: (slot: string) => boolean;
  };

  const originalParkWebview = slotControllerAny.parkWebview;
  let parkCalls = 0;

  try {
    slotControllerAny.parkWebview = () => {
      parkCalls += 1;
      return true;
    };

    WebviewManager.destroyWebview("ai0");

    assert.equal(parkCalls, 1);
  } finally {
    slotControllerAny.parkWebview = originalParkWebview;
  }
});
