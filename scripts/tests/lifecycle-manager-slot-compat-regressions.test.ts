import assert from "node:assert/strict";
import test from "node:test";

import { SlotController } from "../../src/js/modules/slot-controller.ts";
import { LifecycleManager } from "../../src/js/modules/webview/lifecycle-manager.ts";

type MockWebview = {
  style: { display: string };
  attrs: Map<string, string>;
  setAttribute: (key: string, value: string) => void;
  getAttribute: (key: string) => string | null;
  removeAttribute: (key: string) => void;
  addEventListener: (type: string, listener: () => void, capture?: boolean) => void;
  getURL: () => string;
};

function createWebview(): MockWebview {
  const attrs = new Map<string, string>();
  return {
    style: { display: "" },
    attrs,
    setAttribute: (key: string, value: string) => {
      attrs.set(key, value);
    },
    getAttribute: (key: string) => attrs.get(key) ?? null,
    removeAttribute: (key: string) => {
      attrs.delete(key);
    },
    addEventListener: () => {
      return;
    },
    getURL: () => "",
  };
}

function resetLifecycleState(): void {
  const lifecycleAny = LifecycleManager as unknown as {
    webviews: Record<string, unknown>;
    _lastActivity: Record<string, number>;
  };
  lifecycleAny.webviews = {};
  lifecycleAny._lastActivity = {};
}

void test("register delegates slot providers to SlotController", () => {
  const slotControllerAny = SlotController as unknown as {
    registerWebview: (slot: string, webview: HTMLElement) => void;
  };
  const lifecycleAny = LifecycleManager as unknown as {
    webviews: Record<string, unknown>;
  };
  const webview = createWebview();
  const originalRegister = slotControllerAny.registerWebview;

  let registerCalls = 0;

  try {
    resetLifecycleState();
    slotControllerAny.registerWebview = () => {
      registerCalls += 1;
    };

    LifecycleManager.register("ai1", webview as unknown as HTMLElement);

    assert.equal(registerCalls, 1);
    assert.equal(lifecycleAny.webviews["ai1"], undefined);
  } finally {
    slotControllerAny.registerWebview = originalRegister;
    resetLifecycleState();
  }
});

void test("attach delegates slot providers to SlotController helpers", () => {
  const slotControllerAny = SlotController as unknown as {
    registerWebview: (slot: string, webview: HTMLElement) => void;
    ensureWebviewMounted: (slot: string) => boolean;
    ensureWebviewAttached: (slot: string) => boolean;
    markActive: (slot: string) => boolean;
  };
  const webview = createWebview();

  const originalRegister = slotControllerAny.registerWebview;
  const originalEnsureMounted = slotControllerAny.ensureWebviewMounted;
  const originalEnsureAttached = slotControllerAny.ensureWebviewAttached;
  const originalMarkActive = slotControllerAny.markActive;

  let registerCalls = 0;
  let mountedCalls = 0;
  let attachedCalls = 0;
  let activeCalls = 0;

  try {
    slotControllerAny.registerWebview = () => {
      registerCalls += 1;
    };
    slotControllerAny.ensureWebviewMounted = () => {
      mountedCalls += 1;
      return true;
    };
    slotControllerAny.ensureWebviewAttached = () => {
      attachedCalls += 1;
      return true;
    };
    slotControllerAny.markActive = () => {
      activeCalls += 1;
      return true;
    };

    LifecycleManager.attach("ai2", webview as unknown as never);

    assert.equal(registerCalls, 1);
    assert.equal(mountedCalls, 1);
    assert.equal(attachedCalls, 1);
    assert.equal(activeCalls, 1);
  } finally {
    slotControllerAny.registerWebview = originalRegister;
    slotControllerAny.ensureWebviewMounted = originalEnsureMounted;
    slotControllerAny.ensureWebviewAttached = originalEnsureAttached;
    slotControllerAny.markActive = originalMarkActive;
  }
});

void test("detach delegates slot providers to SlotController parkWebview", () => {
  const slotControllerAny = SlotController as unknown as {
    parkWebview: ((slot: string) => boolean) | undefined;
  };

  const originalPark = slotControllerAny.parkWebview;
  let parkCalls = 0;

  try {
    slotControllerAny.parkWebview = () => {
      parkCalls += 1;
      return true;
    };

    LifecycleManager.detach("ai0");

    assert.equal(parkCalls, 1);
  } finally {
    slotControllerAny.parkWebview = originalPark;
  }
});

void test("destroy delegates slot providers to SlotController parkWebview", () => {
  const slotControllerAny = SlotController as unknown as {
    parkWebview: ((slot: string) => boolean) | undefined;
  };

  const originalPark = slotControllerAny.parkWebview;
  let parkCalls = 0;

  try {
    slotControllerAny.parkWebview = () => {
      parkCalls += 1;
      return true;
    };

    LifecycleManager.destroy("ai0");

    assert.equal(parkCalls, 1);
  } finally {
    slotControllerAny.parkWebview = originalPark;
  }
});

void test("markActive delegates slot providers to SlotController", () => {
  const slotControllerAny = SlotController as unknown as {
    markActive: (slot: string) => boolean;
  };

  const originalMarkActive = slotControllerAny.markActive;
  let markCalls = 0;

  try {
    slotControllerAny.markActive = () => {
      markCalls += 1;
      return true;
    };

    LifecycleManager.markActive("ai1");

    assert.equal(markCalls, 1);
  } finally {
    slotControllerAny.markActive = originalMarkActive;
  }
});
