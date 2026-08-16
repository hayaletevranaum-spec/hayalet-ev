import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

async function cleanPath(targetPath) {
  await rm(targetPath, { recursive: true, force: true });
}

async function cleanContents(targetPath) {
  let entries;
  try {
    entries = await readdir(targetPath);
  } catch {
    return;
  }
  await Promise.all(entries.map(async (entry) => cleanPath(join(targetPath, entry))));
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--contents") {
    await Promise.all(args.slice(1).map((targetPath) => cleanContents(targetPath)));
    return;
  }
  await Promise.all(args.map((targetPath) => cleanPath(targetPath)));
}

main().catch((error) => {
  console.error("clean failed:", error);
  process.exitCode = 1;
});
