import assert from "node:assert/strict";
import test from "node:test";

import {
  createVisibleTerminalLaunchers,
  PACKAGED_SURFACE_FLAG,
  shouldLaunchVisibleTerminal,
  WRAPPER_TERMINAL_ENV_KEY,
} from "../../electron/packaged-wrapper-launcher.ts";

void test("visible terminal launch requires wrapper surface and non-tty output", () => {
  assert.equal(
    shouldLaunchVisibleTerminal({
      surface: "main",
      platform: "win32",
      stdoutIsTTY: false,
      env: {},
    }),
    false
  );

  assert.equal(
    shouldLaunchVisibleTerminal({
      surface: "wrapper",
      platform: "win32",
      stdoutIsTTY: true,
      env: {},
    }),
    false
  );

  assert.equal(
    shouldLaunchVisibleTerminal({
      surface: "wrapper",
      platform: "win32",
      stdoutIsTTY: false,
      env: {
        [WRAPPER_TERMINAL_ENV_KEY]: "1",
      },
    }),
    false
  );
});

void test("linux visible terminal launch still requires a desktop session", () => {
  assert.equal(
    shouldLaunchVisibleTerminal({
      surface: "wrapper",
      platform: "linux",
      stdoutIsTTY: false,
      env: {},
    }),
    false
  );

  assert.equal(
    shouldLaunchVisibleTerminal({
      surface: "wrapper",
      platform: "linux",
      stdoutIsTTY: false,
      env: {
        DISPLAY: ":0",
      },
    }),
    true
  );
});

void test("windows launchers open a visible cmd wrapper and preserve user flags", () => {
  const executablePath = String.raw`C:\Portable Apps\Hayalet Ev\Hayalet Ev.exe`;
  const rootDir = String.raw`C:\Portable Apps\Hayalet Ev`;
  const resourcesPath = String.raw`C:\Users\test-user\AppData\Local\Temp\hayalet-ev\resources`;

  const launchers = createVisibleTerminalLaunchers({
    platform: "win32",
    executablePath,
    rootDir,
    resourcesPath,
    argv: [
      executablePath,
      `${PACKAGED_SURFACE_FLAG}=wrapper`,
      "--start-page=assistant",
      "--auto-connect",
    ],
  });

  assert.equal(launchers.length, 1);
  assert.equal(launchers[0]?.command, "cmd");
  assert.deepEqual(launchers[0].args.slice(0, 7), [
    "/d",
    "/c",
    "start",
    '"Hayalet Ev Wrapper"',
    "cmd",
    "/d",
    "/k",
  ]);
  assert.match(
    launchers[0].args[7] ?? "",
    /cd \/d "C:\\Portable Apps\\Hayalet Ev" && set ELECTRON_RUN_AS_NODE=1 && "C:\\Portable Apps\\Hayalet Ev\\Hayalet Ev\.exe" C:\\Users\\test-user\\AppData\\Local\\Temp\\hayalet-ev\\resources\\app\.asar\\dist\\electron\\packaged-wrapper-cli\.js --start-page=assistant --auto-connect/
  );
  assert.doesNotMatch(launchers[0].args[7] ?? "", /--packaged-surface=wrapper/);
});