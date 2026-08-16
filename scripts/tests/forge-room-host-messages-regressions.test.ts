import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeForgeRoomSnapshot } from "../../rooms/forge-room/shared/ui/host-messages.ts";

void test("forge-room host message normalization ignores legacy hot-air run override seams", () => {
  const snapshot = sanitizeForgeRoomSnapshot({
    runOverride: {
      tools: {
        hotAir: true,
      },
    },
  });

  assert.equal(snapshot.runOverride, null);
});
