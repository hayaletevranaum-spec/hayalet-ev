import assert from "node:assert/strict";
import test from "node:test";

import { splitLines } from "../lib/wrapper-supervisor.mjs";
import { createUserMessage, formatCommand, isNoiseLogLine } from "../lib/wrapper-events.mjs";

function createTranslator(dictionary: Record<string, string>) {
  return (key: string, params: Record<string, string | number | null | undefined> = {}) => {
    const template = dictionary[key] ?? key;
    return String(template).replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, token) => {
      const value = params[token as string];
      return value === null || value === undefined ? "" : String(value);
    });
  };
}

void test("wrapper event helpers keep user lane terse", () => {
  const t = createTranslator({
    "shell.wrapper.events.viteReset": "Vite yeniden başlatılıyor.",
    "shell.wrapper.events.transitionRouted": "Geçiş {{surface}} yönüne yönlendirildi.",
    "shell.wrapper.surfaces.ghost": "hayalet-ajan modu",
  });

  assert.equal(createUserMessage("vite.reset", {}, t), "Vite yeniden başlatılıyor.");
  assert.equal(
    createUserMessage("cycle.to-ghost", { uiMode: "ghost-agent", sceneDebug: false }, t),
    "Geçiş hayalet-ajan modu yönüne yönlendirildi."
  );
  assert.equal(formatCommand("npm", ["run", "electron:build"]), "npm run electron:build");
});

void test("wrapper event helpers resolve surface labels from ui mode", () => {
  const t = createTranslator({
    "shell.wrapper.events.surfacePreparing": "{{surface}} hazırlanıyor.",
    "shell.wrapper.events.transitionRouted": "Geçiş {{surface}} yönüne yönlendirildi.",
    "shell.wrapper.events.ghostCrashRecovery":
      "Hata: {{surface}} {{code}} kodu ile kapandı. {{recoverySurface}} yeniden açılmaya çalışılacak.",
    "shell.wrapper.surfaces.main": "hayalet-ev",
    "shell.wrapper.surfaces.scene": "sahne modu",
    "shell.wrapper.surfaces.sceneDebug": "sahne:editör modu",
    "shell.wrapper.surfaces.ghost": "hayalet-ajan modu",
  });

  assert.equal(
    createUserMessage("main.prepare", { uiMode: "scene", sceneDebug: true }, t),
    "sahne:editör modu hazırlanıyor."
  );
  assert.equal(
    createUserMessage("cycle.to-app", { uiMode: "scene", sceneDebug: false }, t),
    "Geçiş sahne modu yönüne yönlendirildi."
  );
  assert.equal(
    createUserMessage(
      "ghost.crash",
      {
        code: 9,
        recoveryUiMode: "classic",
        recoverySceneDebug: false,
      },
      t
    ),
    "Hata: hayalet-ajan modu 9 kodu ile kapandı. hayalet-ev yeniden açılmaya çalışılacak."
  );
});

void test("wrapper event helpers only suppress blank log lines", () => {
  assert.equal(isNoiseLogLine("xapp-gtk3-module warning"), false);
  assert.equal(isNoiseLogLine("Cannot start http server for devtools"), false);
  assert.equal(isNoiseLogLine("   "), true);
  assert.equal(isNoiseLogLine("vite ready in 250 ms"), false);
});

void test("splitLines keeps trailing partial data in remainder", () => {
  const first = splitLines(Buffer.from("line-1\npart"), "");
  assert.deepEqual(first.lines, ["line-1"]);
  assert.equal(first.remainder, "part");

  const second = splitLines(Buffer.from("ial\nline-2\n"), first.remainder);
  assert.deepEqual(second.lines, ["partial", "line-2"]);
  assert.equal(second.remainder, "");
});
