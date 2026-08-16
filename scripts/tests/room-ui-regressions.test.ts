import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { InstalledRoomRecord } from "../../src/types/rooms.ts";
import {
  buildRoomNavMarkup,
  buildRoomPageMarkup,
  getRoomPageName,
} from "../../src/js/modules/rooms/room-markup.ts";

const room: InstalledRoomRecord = {
  id: "game-room",
  name: "Game Room",
  version: "2.1.0",
  icon: "GM",
  iconPath: "/workspace/rooms/.build/game-room/runtime/shared/assets/nav-icon.svg",
  sourceDir: "/workspace/rooms/game-room",
  installedDir: "/workspace/rooms/.build/game-room/runtime",
  manifestPath: "/workspace/rooms/.build/game-room/runtime/manifest.json",
  runtimeEntryPath: "/workspace/rooms/.build/game-room/runtime/ui/index.html",
  hostEntryPath: "/workspace/rooms/.build/game-room/runtime/host/index.js",
  defaultFeatureId: "backgammon",
  features: [{ id: "backgammon", name: "Tavla" }],
  installedAt: "2026-03-08T00:00:00.000Z",
  updatedAt: "2026-03-08T00:00:00.000Z",
};

const workshopRoom: InstalledRoomRecord = {
  id: "workshop",
  name: "Workshop",
  version: "1.0.0",
  sourceDir: "/workspace/rooms/workshop",
  installedDir: "/workspace/rooms/.build/workshop/runtime",
  manifestPath: "/workspace/rooms/.build/workshop/runtime/manifest.json",
  runtimeEntryPath: "/workspace/rooms/.build/workshop/runtime/ui/index.html",
  hostEntryPath: "/workspace/rooms/.build/workshop/runtime/host/index.js",
  defaultFeatureId: "assembler",
  features: [{ id: "assembler", name: "Assembler" }],
  installedAt: "2026-03-22T00:00:00.000Z",
  updatedAt: "2026-03-22T00:00:00.000Z",
};

void test("getRoomPageName derives deterministic page names", () => {
  assert.equal(getRoomPageName("game-room"), "room-game-room");
});

void test("buildRoomNavMarkup renders room nav button metadata", () => {
  const markup = buildRoomNavMarkup(room);
  assert.match(markup, /data-room-nav="true"/);
  assert.match(markup, /data-page="room-game-room"/);
  assert.match(markup, /data-side-nav-icon-fallback="GM"/);
  assert.match(
    markup,
    /data-side-nav-icon-src="\/workspace\/rooms\/\.build\/game-room\/runtime\/shared\/assets\/nav-icon\.svg"/
  );
  assert.match(markup, /Game Room/);
});

void test("buildRoomPageMarkup renders room page shell id", () => {
  const markup = buildRoomPageMarkup(room);
  assert.match(markup, /id="page-room-game-room"/);
  assert.match(markup, /data-room-page="true"/);
  assert.match(markup, /data-room-id="game-room"/);
});

void test("secondary room markup renders deterministic nav and page metadata", () => {
  const navMarkup = buildRoomNavMarkup(workshopRoom);
  const pageMarkup = buildRoomPageMarkup(workshopRoom);

  assert.equal(getRoomPageName("workshop"), "room-workshop");
  assert.match(navMarkup, /data-page="room-workshop"/);
  assert.match(navMarkup, /Workshop/);
  assert.match(pageMarkup, /id="page-room-workshop"/);
  assert.match(pageMarkup, /data-room-id="workshop"/);
});

void test("room webview preload delays the fallback room-ready signal when runtimes self-report readiness", () => {
  const preloadSource = readFileSync("electron/room-webview-preload.cjs", "utf8");

  assert.match(preloadSource, /let pendingAutoRoomReadyTimer = null;/);
  assert.match(preloadSource, /let explicitRoomReadySent = false;/);
  assert.match(preloadSource, /explicitRoomReadySent = true;/);
  assert.match(preloadSource, /clearPendingAutoRoomReady\(\);/);
  assert.match(preloadSource, /pendingAutoRoomReadyTimer = globalThis\.setTimeout\(/);
  assert.match(preloadSource, /if \(explicitRoomReadySent\) \{\s*return;\s*\}/);
  assert.match(preloadSource, /exposeInMainWorld\("electronAPI"/);
  assert.match(
    preloadSource,
    /showOpenDialog: \(options\) => ipcRenderer\.invoke\("show-open-dialog", options\)/
  );
  assert.match(preloadSource, /openPath: \(path\) => ipcRenderer\.invoke\("open-path", path\)/);
});
