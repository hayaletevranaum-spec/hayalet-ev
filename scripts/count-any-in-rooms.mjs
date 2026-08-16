import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

async function collectTypeScriptFiles(root) {
  const result = [];
  async function visit(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await visit(fullPath);
          return;
        }
        if (entry.isFile() && entry.name.endsWith(".ts")) {
          result.push(fullPath);
        }
      })
    );
  }

  try {
    if ((await stat(root)).isDirectory()) {
      await visit(root);
    }
  } catch {
    return result;
  }
  return result;
}

const files = await collectTypeScriptFiles("rooms");
let count = 0;
for (const file of files) {
  const content = await readFile(file, "utf-8");
  count += content.match(/\bany\b/g)?.length ?? 0;
}
process.stdout.write(`${String(count)}\n`);
