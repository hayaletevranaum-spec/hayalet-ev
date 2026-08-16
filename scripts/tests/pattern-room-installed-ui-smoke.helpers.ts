import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { PATTERN_ROOM_DOMAIN_TEST_FIXTURE } from "../../rooms/pattern-room/shared/data/testing/pattern-room-domain.fixture.ts";
import type { PatternRoomSessionSnapshot } from "../../rooms/pattern-room/shared/types/pattern-room-snapshot.js";

type PatternRoomInstalledUiRuntime = {
  start: () => void;
  dispose: () => void;
  createSnapshot: () => PatternRoomSessionSnapshot;
};

type PatternRoomInstalledUiRuntimeModule = {
  createPatternRoomUiRuntime: (options: {
    readonly domain: typeof PATTERN_ROOM_DOMAIN_TEST_FIXTURE;
  }) => PatternRoomInstalledUiRuntime;
};

let importSequence = 0;

export async function startPatternRoomInstalledUi(
  installedRootDir: string
): Promise<PatternRoomInstalledUiRuntime> {
  importSequence += 1;
  const moduleUrl = `${
    pathToFileURL(resolve(installedRootDir, "ui/pattern-room-ui-runtime.js")).href
  }?smoke=${Date.now()}-${importSequence}`;
  const runtimeModule = (await import(moduleUrl)) as PatternRoomInstalledUiRuntimeModule;
  const runtime = runtimeModule.createPatternRoomUiRuntime({
    domain: PATTERN_ROOM_DOMAIN_TEST_FIXTURE,
  });
  runtime.start();
  return runtime;
}
