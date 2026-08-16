import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const tscCliPath = resolve(projectRoot, "node_modules", "typescript", "bin", "tsc");

void test("electron typecheck has no TS2375 in log-reader", () => {
  const result = spawnSync(
    process.execPath,
    [tscCliPath, "--noEmit", "-p", "electron/tsconfig.electron.json"],
    {
      cwd: projectRoot,
      encoding: "utf-8",
    }
  );

  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(
    result.status,
    0,
    `Expected tsc to pass for electron/tsconfig.electron.json.\nOutput:\n${output}`
  );
  assert.doesNotMatch(output, /electron\/logger\/log-reader\.ts\(\d+,\d+\): error TS2375/);
});

void test("renderer and main loggers persist the active locale at write time", () => {
  const rendererSource = readFileSync("src/js/modules/logger/Logger.ts", "utf8");
  const mainSource = readFileSync("electron/logger/core/LoggerCore.ts", "utf8");

  assert.match(rendererSource, /locale:\s*metadata\?\.locale\s*\?\?\s*AppI18n\.getLocale\(\)/);
  assert.match(rendererSource, /messageKey:\s*key/);
  assert.match(mainSource, /locale:\s*entry\.locale\s*\?\?\s*readElectronAppLanguageSync\(\)/);
  assert.match(mainSource, /messageKey:\s*key/);
});

void test("log reader preserves stored locale metadata without retranslation", () => {
  const source = readFileSync("electron/logger/log-reader.ts", "utf8");

  assert.match(source, /const localeRaw = parsed\["locale"\]/);
  assert.match(source, /typeof localeRaw === "string" \? \{ locale: localeRaw \} : \{\}/);
  assert.doesNotMatch(source, /translateCatalog|createElectronTranslator|AppI18n\.t/);
});
