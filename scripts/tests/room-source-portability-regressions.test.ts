import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]s)$/;
const CORE_ROOTS = [resolve("src"), resolve("electron")];
const ROOMS_ROOT = resolve("rooms");

async function walkSourceFiles(baseDir: string): Promise<string[]> {
  const entries = await readdir(baseDir, { withFileTypes: true });
  const results = await Promise.all(
    entries
      .filter((entry) => entry.name !== ".build")
      .map(async (entry) => {
        const absolutePath = join(baseDir, entry.name);
        if (entry.isDirectory()) {
          return await walkSourceFiles(absolutePath);
        }
        return SOURCE_FILE_PATTERN.test(entry.name) ? [absolutePath] : [];
      })
  );
  return results.flat().sort((left, right) => left.localeCompare(right));
}

function collectModuleSpecifiers(source: string): string[] {
  const specifiers = new Set<string>();
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]?.trim();
      if (specifier) {
        specifiers.add(specifier);
      }
    }
  }

  return [...specifiers].sort((left, right) => left.localeCompare(right));
}

function normalizedRelative(fromDir: string, targetPath: string): string {
  return relative(fromDir, targetPath).replace(/\\/g, "/");
}

function escapesRoot(rootDir: string, targetPath: string): boolean {
  const relativePath = normalizedRelative(rootDir, targetPath);
  return relativePath === ".." || relativePath.startsWith("../");
}

function isInsideRoot(rootDir: string, targetPath: string): boolean {
  return escapesRoot(rootDir, targetPath) === false;
}

function isCoreAlias(specifier: string): boolean {
  return (
    specifier === "@shared" ||
    specifier.startsWith("@shared/") ||
    specifier === "@src" ||
    specifier.startsWith("@src/") ||
    specifier === "@electron" ||
    specifier.startsWith("@electron/") ||
    specifier.startsWith("src/") ||
    specifier.startsWith("electron/")
  );
}

function isRoomAlias(specifier: string): boolean {
  return (
    specifier === "@rooms" ||
    specifier.startsWith("@rooms/") ||
    specifier.startsWith("rooms/")
  );
}

function collectTextKeys(value: unknown, result: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextKeys(item, result);
    }
    return result;
  }

  if (value === null || typeof value !== "object") {
    return result;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "textKey" && typeof child === "string" && child.trim() !== "") {
      result.push(child.trim());
      continue;
    }
    collectTextKeys(child, result);
  }
  return result;
}

void test("room source modules stay inside their own room boundary", async () => {
  const roomEntries = (await readdir(ROOMS_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name !== ".build")
    .sort((left, right) => left.name.localeCompare(right.name));
  const findings: string[] = [];

  for (const roomEntry of roomEntries) {
    const roomRoot = join(ROOMS_ROOT, roomEntry.name);
    const files = await walkSourceFiles(roomRoot);
    for (const filePath of files) {
      const source = await readFile(filePath, "utf8");
      for (const specifier of collectModuleSpecifiers(source)) {
        if (isCoreAlias(specifier)) {
          findings.push(
            `${normalizedRelative(ROOMS_ROOT, filePath)} imports core alias ${specifier}`
          );
          continue;
        }
        if (!specifier.startsWith(".")) {
          continue;
        }

        const targetPath = resolve(filePath, "..", specifier);
        if (escapesRoot(roomRoot, targetPath)) {
          findings.push(
            `${normalizedRelative(ROOMS_ROOT, filePath)} escapes ${roomEntry.name} via ${specifier}`
          );
        }
      }
    }
  }

  assert.deepEqual(
    findings,
    [],
    `Room source boundary violations:\n${findings.map((finding) => `  - ${finding}`).join("\n")}`
  );
});

void test("core production modules do not import concrete room implementations", async () => {
  const findings: string[] = [];

  for (const coreRoot of CORE_ROOTS) {
    const files = await walkSourceFiles(coreRoot);
    for (const filePath of files) {
      const source = await readFile(filePath, "utf8");
      for (const specifier of collectModuleSpecifiers(source)) {
        if (isRoomAlias(specifier)) {
          findings.push(
            `${normalizedRelative(resolve("."), filePath)} imports room alias ${specifier}`
          );
          continue;
        }
        if (!specifier.startsWith(".")) {
          continue;
        }

        const targetPath = resolve(filePath, "..", specifier);
        if (isInsideRoot(ROOMS_ROOT, targetPath)) {
          const roomRelativePath = normalizedRelative(ROOMS_ROOT, targetPath);
          if (roomRelativePath !== ".build" && !roomRelativePath.startsWith(".build/")) {
            findings.push(
              `${normalizedRelative(resolve("."), filePath)} imports concrete room source via ${specifier}`
            );
          }
        }
      }
    }
  }

  assert.deepEqual(
    findings,
    [],
    `Core-to-room boundary violations:\n${findings.map((finding) => `  - ${finding}`).join("\n")}`
  );
});

void test("room manifest scene translations stay in the room-local i18n namespace", async () => {
  const roomEntries = (await readdir(ROOMS_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name !== ".build")
    .sort((left, right) => left.name.localeCompare(right.name));
  const findings: string[] = [];

  for (const roomEntry of roomEntries) {
    const manifestPath = join(ROOMS_ROOT, roomEntry.name, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    const roomId = typeof manifest["id"] === "string" ? manifest["id"].trim() : roomEntry.name;
    const expectedPrefix = `rooms.${roomId}.`;

    for (const textKey of collectTextKeys(manifest)) {
      if (!textKey.startsWith(expectedPrefix)) {
        findings.push(`${roomEntry.name}/manifest.json uses non-room textKey ${textKey}`);
      }
    }
  }

  assert.deepEqual(
    findings,
    [],
    `Room manifest i18n boundary violations:\n${findings.map((finding) => `  - ${finding}`).join("\n")}`
  );
});
