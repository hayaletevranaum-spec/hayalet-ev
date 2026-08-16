import { readFile, writeFile } from "fs/promises";
import { createMcpTranslatorSync } from "../i18n/index.js";

function findReplaceT(key: string, params?: Record<string, string | number>): string {
  return createMcpTranslatorSync()(`mcpServer.fileUtils.findReplace.${key}`, params);
}

export async function findAndReplace(
  filePath: string,
  find: string,
  replace: string,
  options?: {
    ignoreWhitespace?: boolean;
    dryRun?: boolean;
  }
): Promise<{ success: boolean; replacements: number; error?: string; preview?: string }> {
  try {
    const content = await readFile(filePath, "utf-8");
    let searchPattern = find;

    if (options?.ignoreWhitespace === true) {
      searchPattern = find
        .trim()
        .split(/\s+/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("\\s+");

      searchPattern = searchPattern.replace(/\\n/g, "\\s+");
    }

    let occurrences = 0;
    let newContent = content;

    if (options?.ignoreWhitespace === true) {
      const regex = new RegExp(searchPattern, "g");
      const matches = content.match(regex);
      occurrences = matches ? matches.length : 0;

      if (occurrences > 0) {
        newContent = content.replace(regex, replace);
      }
    } else {
      occurrences = content.split(find).length - 1;

      if (occurrences > 0) {
        newContent = content.split(find).join(replace);
      }
    }

    if (occurrences === 0) {
      const lines = content.split("\n");
      const suggestions: string[] = [];
      const searchTerms = find.split("\n");
      const firstSearchTerm = searchTerms[0]?.trim();

      if (firstSearchTerm != null && firstSearchTerm.length > 0) {
        const searchWords = firstSearchTerm.toLowerCase().split(/\s+/);

        for (let i = 0; i < lines.length && suggestions.length < 5; i++) {
          const line = lines[i];
          if (line == null || line.length === 0) continue;
          const lineLower = line.toLowerCase();
          const lineNormalized = line.replace(/\s+/g, " ").trim().toLowerCase();
          const searchNormalized = firstSearchTerm.replace(/\s+/g, " ").toLowerCase();

          if (lineNormalized.includes(searchNormalized)) {
            suggestions.push(`Line ${i + 1}: ${line}`);
          } else {
            const matchCount = searchWords.filter((word) => lineLower.includes(word)).length;
            if (matchCount >= Math.ceil(searchWords.length * 0.7)) {
              suggestions.push(`Line ${i + 1}: ${line} (partial match)`);
            }
          }
        }
      }

      const errorMsg =
        suggestions.length > 0
          ? findReplaceT("patternNotFoundWithSuggestions", {
              suggestions: suggestions.join("\n"),
            })
          : findReplaceT("patternNotFoundLineMissing", {
              term: firstSearchTerm?.substring(0, 50) ?? find.substring(0, 50),
            });

      return { success: false, replacements: 0, error: errorMsg };
    }

    if (options?.dryRun === true) {
      const lines = content.split("\n");
      const previewLines: string[] = [];
      let changeCount = 0;

      for (let i = 0; i < lines.length && changeCount < 3; i++) {
        const oldLine = lines[i];
        if (oldLine == null || oldLine.length === 0) continue;
        const newLine =
          options.ignoreWhitespace === true
            ? oldLine.replace(new RegExp(searchPattern, "g"), replace)
            : oldLine.split(find).join(replace);

        if (oldLine !== newLine) {
          changeCount++;
          previewLines.push(`Line ${i + 1}:`);
          previewLines.push(`- ${oldLine}`);
          previewLines.push(`+ ${newLine}`);
          previewLines.push("");
        }
      }

      return {
        success: true,
        replacements: occurrences,
        preview:
          previewLines.join("\n") + `\n(${findReplaceT("previewTotal", { count: occurrences })})`,
      };
    }

    await writeFile(filePath, newContent, "utf-8");
    return { success: true, replacements: occurrences };
  } catch (error) {
    return { success: false, replacements: 0, error: (error as Error).message };
  }
}
