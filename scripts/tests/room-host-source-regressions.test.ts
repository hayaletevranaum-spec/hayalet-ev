import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildRoomHostModuleBlobUrl,
  buildRoomHostModuleDataUrl,
  decodeRoomHostSource,
} from "../../src/js/modules/rooms/room-host-source.ts";
import { createRoomBuiltArtifact } from "./helpers/room-installed-copy.ts";

void test("decodeRoomHostSource decodes base64 room host source", () => {
  const rawSource = 'module.exports = function () { return { dispose() {} }; };';
  const encoded = Buffer.from(rawSource, "utf8").toString("base64");

  assert.equal(decodeRoomHostSource(encoded), rawSource);
});

void test("decodeRoomHostSource keeps plain javascript source unchanged", () => {
  const rawSource = 'module.exports = function () { return { dispose() {} }; };';

  assert.equal(decodeRoomHostSource(rawSource), rawSource);
});

void test("buildRoomHostModuleDataUrl can inline nested host dependencies for browser fallbacks", async () => {
  const entryPath = resolve("tmp-inline-room/host/index.js");
  const runtimePath = resolve("tmp-inline-room/host/runtime.js");
  const helperPath = resolve("tmp-inline-room/shared/helper.js");

  const sourceByPath = new Map<string, string>([
    [entryPath, 'import runtime from "./runtime.js";\nexport default runtime;\n'],
    [runtimePath, 'import { answer } from "../shared/helper.js";\nexport default { answer };\n'],
    [helperPath, "export const answer = 42;\n"],
  ]);

  const moduleUrl = await buildRoomHostModuleDataUrl(
    entryPath,
    async (filePath) => {
      const source = sourceByPath.get(filePath);
      if (source === undefined) {
        throw new Error(`Unexpected file read: ${filePath}`);
      }
      return source;
    },
    { inlineDependencies: true }
  );

  const encoded = moduleUrl.replace(/^data:text\/javascript;base64,/, "");
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const imported = (await import(`${moduleUrl}#inline-browser-fallback`)) as {
    default?: { answer?: unknown };
  };

  assert.match(moduleUrl, /^data:text\/javascript;base64,/);
  assert.doesNotMatch(decoded, /file:\/\//);
  assert.equal(imported.default?.answer, 42);
});

void test("buildRoomHostModuleBlobUrl rewrites nested host dependencies to blob-backed module urls", async () => {
  const entryPath = resolve("tmp-blob-room/host/index.js");
  const runtimePath = resolve("tmp-blob-room/host/runtime.js");
  const helperPath = resolve("tmp-blob-room/shared/helper.js");

  const sourceByPath = new Map<string, string>([
    [entryPath, 'import runtime from "./runtime.js";\nexport default runtime;\n'],
    [runtimePath, 'import { answer } from "../shared/helper.js";\nexport default { answer };\n'],
    [helperPath, "export const answer = 42;\n"],
  ]);

  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const createdUrls: string[] = [];
  const revokedUrls: string[] = [];

  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => {
      const objectUrl = `blob:room-host-${createdUrls.length + 1}`;
      createdUrls.push(objectUrl);
      return objectUrl;
    },
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: (objectUrl: string) => {
      revokedUrls.push(objectUrl);
    },
  });

  try {
    const blobModule = await buildRoomHostModuleBlobUrl(entryPath, async (filePath) => {
      const source = sourceByPath.get(filePath);
      if (source === undefined) {
        throw new Error(`Unexpected file read: ${filePath}`);
      }
      return source;
    });

    assert.match(blobModule.moduleUrl, /^blob:room-host-/);
    assert.equal(createdUrls.length, 3);

    blobModule.dispose();

    assert.deepEqual(revokedUrls, createdUrls.slice().reverse());
  } finally {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectURL,
    });
  }
});

void test("buildRoomHostModuleDataUrl imports mixed room host module graphs through data urls", async () => {
  const loadSource = async (filePath: string) => await readFile(filePath, "utf8");
  const laboratoryBuildArtifact = await createRoomBuiltArtifact("laboratory");
  const gameRoomBuildArtifact = await createRoomBuiltArtifact("game-room");

  try {
    const laboratoryModuleUrl = await buildRoomHostModuleDataUrl(
      `${laboratoryBuildArtifact.rootDir}/host/index.js`,
      loadSource
    );
    const gameRoomModuleUrl = await buildRoomHostModuleDataUrl(
      `${gameRoomBuildArtifact.rootDir}/host/index.js`,
      loadSource
    );

    const laboratoryModule = (await import(laboratoryModuleUrl)) as {
      default?: { activate?: unknown };
    };
    const gameRoomModule = (await import(gameRoomModuleUrl)) as {
      default?: unknown;
      teamTetrisEngine?: unknown;
    };

    assert.match(laboratoryModuleUrl, /^data:text\/javascript;base64,/);
    assert.match(gameRoomModuleUrl, /^data:text\/javascript;base64,/);
    assert.equal(typeof laboratoryModule.default?.activate, "function");
  assert.ok(gameRoomModule.default != null);
  assert.ok(gameRoomModule.teamTetrisEngine != null);
  } finally {
    await Promise.all([laboratoryBuildArtifact.cleanup(), gameRoomBuildArtifact.cleanup()]);
  }
});

void test("buildRoomHostModuleDataUrl rejects host imports that escape the room root", async () => {
  const entryPath = resolve("tmp-room/host/index.js");
  const loadSource = async (filePath: string) => {
    if (filePath === entryPath) {
      return 'import "../../outside.js";\nexport default { activate() {} };';
    }
    throw new Error(`Unexpected file read: ${filePath}`);
  };

  await assert.rejects(
    async () => {
      await buildRoomHostModuleDataUrl(entryPath, loadSource);
    },
    /escaped room root/i
  );
});
