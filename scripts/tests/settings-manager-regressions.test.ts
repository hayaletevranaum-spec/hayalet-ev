import assert from "node:assert/strict";
import test from "node:test";

import { SettingsManager } from "../../src/js/modules/settings-manager.ts";

void test("no-op save should not persist or emit settings updates", async () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const globalWithWindow = globalThis as {
    window?: {
      electronAPI?: {
        loadSettings?: () => Promise<unknown>;
        saveSettings?: (settings: Record<string, unknown>) => Promise<boolean>;
      };
    };
  };

  let saveCalls = 0;
  let emittedEvents = 0;

  globalWithWindow.window = {
    electronAPI: {
      loadSettings: async () => SettingsManager.getSnapshot(),
      saveSettings: async (_settings: Record<string, unknown>) => {
        saveCalls += 1;
        return true;
      },
    },
  };

  const unsubscribe = SettingsManager.subscribe(() => {
    emittedEvents += 1;
  });

  try {
    const snapshot = SettingsManager.getSnapshot();
    await SettingsManager.save(snapshot);

    assert.equal(saveCalls, 0, "no-op save should not write settings to disk");
    assert.equal(emittedEvents, 0, "no-op save should not emit global settings updates");
  } finally {
    unsubscribe();

    if (originalWindow === undefined) {
      delete globalWithWindow.window;
    } else {
      globalWithWindow.window = originalWindow as {
        electronAPI?: {
          loadSettings?: () => Promise<unknown>;
          saveSettings?: (settings: Record<string, unknown>) => Promise<boolean>;
        };
      };
    }

    const manager = SettingsManager as unknown as { _stopBroadcast?: () => void };
    manager._stopBroadcast?.();
  }
});
