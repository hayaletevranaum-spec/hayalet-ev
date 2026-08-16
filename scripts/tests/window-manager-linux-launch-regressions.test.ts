import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

void test("linux launch path restores windowed bounds via maximize and clamps overflow", () => {
  const source = readFileSync("electron/window-manager.ts", "utf8");

  assert.match(
    source,
    /const SHOULD_USE_LINUX_WINDOW_MANAGER_MAXIMIZE = process\.platform === "linux";/
  );
  assert.match(source, /function restoreWindowedBounds\(win: BrowserWindow\): void \{/);
  assert.match(source, /function constrainWindowToVisibleWorkArea\(win: BrowserWindow\): void \{/);
  assert.match(source, /const LINUX_VISIBLE_WORK_AREA_GUARD = \{\s*width: 2,\s*height: 1,/s);
  assert.match(source, /function resolveVisibleWorkArea\(workArea: Electron\.Rectangle\)/);
  assert.match(source, /execFileSync\("xprop", \["-root", "_NET_WORKAREA"/);
  assert.match(source, /parseLinuxEwmhWorkArea/);
  assert.match(source, /intersectWorkAreas\(workArea, ewmhWorkArea\)/);
  assert.match(
    source,
    /if \(SHOULD_USE_LINUX_WINDOW_MANAGER_MAXIMIZE\) \{\s*win\.setResizable\(true\);\s*win\.maximize\(\);\s*constrainWindowToVisibleWorkArea\(win\);/s
  );
  assert.match(source, /resizable: SHOULD_USE_LINUX_WINDOW_MANAGER_MAXIMIZE,/);
  assert.match(source, /maximizable: SHOULD_USE_LINUX_WINDOW_MANAGER_MAXIMIZE,/);
  assert.match(source, /win\.on\("maximize", \(\) => \{\s*win\.setResizable\(false\);/s);
  assert.match(
    source,
    /win\.once\("ready-to-show", \(\) => \{\s*if \(SHOULD_USE_LINUX_WINDOW_MANAGER_MAXIMIZE\) \{\s*restoreWindowedBounds\(win\);\s*\}\s*win\.show\(\);\s*if \(SHOULD_USE_LINUX_WINDOW_MANAGER_MAXIMIZE\) \{\s*setTimeout\(\(\) => \{\s*constrainWindowToVisibleWorkArea\(win\);/s
  );
  assert.match(
    source,
    /if \(isFull\) \{\s*_mainWindow\.setFullScreen\(false\);\s*restoreWindowedBounds\(_mainWindow\);/s
  );
  assert.doesNotMatch(source, /primeLinuxLaunchGeometry/);
  assert.doesNotMatch(source, /SHOULD_PRIME_LINUX_LAUNCH_GEOMETRY/);
});
