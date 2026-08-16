import { readdir, stat } from "fs/promises";
import { join } from "path";
import type { FolderEntry } from "../../types/index-mcp.js";
import { IGNORE_DIRS } from "./constants.js";

export async function readFolderStructure(
  folderPath: string,
  maxDepth: number = 3,
  currentDepth: number = 0
): Promise<FolderEntry[]> {
  if (currentDepth >= maxDepth) {
    return [];
  }

  try {
    const entries = await readdir(folderPath, { withFileTypes: true });
    const result: FolderEntry[] = [];

    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of sorted) {
      if (entry.isDirectory() && IGNORE_DIRS.has(entry.name)) {
        continue;
      }

      const fullPath = join(folderPath, entry.name);

      if (entry.isDirectory()) {
        // eslint-disable-next-line no-await-in-loop
        const children = await readFolderStructure(fullPath, maxDepth, currentDepth + 1);
        result.push({
          name: entry.name,
          type: "directory",
          path: fullPath,
          children,
        });
      } else {
        // eslint-disable-next-line no-await-in-loop
        const stats = await stat(fullPath);
        result.push({
          name: entry.name,
          type: "file",
          path: fullPath,
          size: stats.size,
        });
      }
    }

    return result;
  } catch {
    return [];
  }
}

export function formatFolderStructure(entries: FolderEntry[], indent: string = ""): string {
  const lines: string[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    const isLast = i === entries.length - 1;
    const prefix = indent + (isLast ? "└── " : "├── ");
    const childIndent = indent + (isLast ? "    " : "│   ");

    if (entry.type === "directory") {
      lines.push(`${prefix}${entry.name}/`);
      if (entry.children && entry.children.length > 0) {
        lines.push(formatFolderStructure(entry.children, childIndent));
      }
    } else {
      const sizeStr = entry.size != null ? ` (${formatSize(entry.size)})` : "";
      lines.push(`${prefix}${entry.name}${sizeStr}`);
    }
  }

  return lines.join("\n");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
