import { readFile, readdir } from "fs/promises";
import { basename, extname, join } from "path";
import type { GrepMatch } from "../../types/index-mcp.js";
import { BINARY_EXTENSIONS, IGNORE_DIRS } from "./constants.js";

export async function grepFile(
  filePath: string,
  pattern: RegExp,
  maxMatches: number = 100
): Promise<GrepMatch[]> {
  try {
    const ext = extname(filePath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      return [];
    }

    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");
    const matches: GrepMatch[] = [];

    for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
      const line = lines[i];
      if (line == null || line.length === 0) continue;
      const match = pattern.exec(line);
      if (match) {
        matches.push({
          file: filePath,
          line: i + 1,
          content: line.trim(),
          matchStart: match.index,
          matchEnd: match.index + match[0].length,
        });
      }
    }

    return matches;
  } catch {
    return [];
  }
}

export async function grepDirectory(
  dirPath: string,
  contentPattern: RegExp | null,
  pathGlob: string | null,
  maxResults: number = 500
): Promise<GrepMatch[]> {
  const allMatches: GrepMatch[] = [];

  async function searchDir(currentPath: string): Promise<void> {
    if (allMatches.length >= maxResults) return;

    try {
      const entries = await readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (allMatches.length >= maxResults) break;

        const fullPath = join(currentPath, entry.name);

        if (entry.isDirectory()) {
          if (!IGNORE_DIRS.has(entry.name)) {
            // eslint-disable-next-line no-await-in-loop
            await searchDir(fullPath);
          }
        } else {
          if (pathGlob != null && pathGlob.length > 0 && !matchGlob(fullPath, pathGlob)) {
            continue;
          }

          if (contentPattern) {
            // eslint-disable-next-line no-await-in-loop
            const matches = await grepFile(
              fullPath,
              contentPattern,
              maxResults - allMatches.length
            );
            allMatches.push(...matches);
          } else {
            allMatches.push({
              file: fullPath,
              line: 0,
              content: "",
              matchStart: 0,
              matchEnd: 0,
            });
          }
        }
      }
    } catch {
      // NOTE: Continue when an entry cannot be accessed.
    }
  }

  await searchDir(dirPath);
  return allMatches;
}

export function matchGlob(path: string, pattern: string): boolean {
  const placeholder = "\x00GLOBSTAR\x00";
  const regexPattern = pattern
    .replace(/\*\*/g, placeholder)
    .replace(/\./g, "\\.")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".")
    .replace(new RegExp(placeholder, "g"), ".*");

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path) || regex.test(basename(path));
}
