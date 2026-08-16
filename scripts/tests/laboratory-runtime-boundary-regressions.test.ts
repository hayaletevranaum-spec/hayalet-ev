import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import test from "node:test";

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(function (entry) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return listTypeScriptFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
  });
}

void test("laboratory runtime has no direct UI dependencies", () => {
  const repoRoot = process.cwd();
  const laboratoryRoot = resolve(repoRoot, "rooms/laboratory");
  const runtimeRoot = resolve(laboratoryRoot, "runtime");
  const uiRoot = `${resolve(laboratoryRoot, "ui")}/`;
  const offenders: string[] = [];
  const importPattern = /\bfrom\s+["']([^"']+)["']/g;

  for (const filePath of listTypeScriptFiles(runtimeRoot)) {
    const content = readFileSync(filePath, "utf8");
    for (const match of content.matchAll(importPattern)) {
      const specifier = match[1];
      if (!specifier?.startsWith(".")) {
        continue;
      }
      const resolvedImport = resolve(dirname(filePath), specifier);
      if (`${resolvedImport}/`.startsWith(uiRoot) || resolvedImport.startsWith(uiRoot)) {
        offenders.push(relative(repoRoot, filePath));
        break;
      }
    }
  }

  assert.deepEqual(offenders.sort(), []);
});
