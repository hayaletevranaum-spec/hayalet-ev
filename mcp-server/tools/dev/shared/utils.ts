import { readFileSync, existsSync } from "fs";
import { readdir } from "fs/promises";
import { join, relative } from "path";
import { DEV_CONFIG } from "./config.js";

export async function getAllFiles(
  dir: string,
  projectRoot: string,
  files: string[] = []
): Promise<string[]> {
  const fullDir = join(projectRoot, dir);
  if (!existsSync(fullDir)) return files;

  const entries = await readdir(fullDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(fullDir, entry.name);
    const relativePath = relative(projectRoot, fullPath);

    if (entry.isDirectory()) {
      if (!DEV_CONFIG.ignoreDirs.includes(entry.name)) {
        // eslint-disable-next-line no-await-in-loop
        await getAllFiles(relativePath, projectRoot, files);
      }
    } else if (entry.isFile() && DEV_CONFIG.extensions.some((ext) => entry.name.endsWith(ext))) {
      files.push(relativePath);
    }
  }

  return files;
}

export function countLines(filePath: string): number {
  try {
    const content = readFileSync(filePath, "utf-8");
    return content.split("\n").length;
  } catch {
    return 0;
  }
}
