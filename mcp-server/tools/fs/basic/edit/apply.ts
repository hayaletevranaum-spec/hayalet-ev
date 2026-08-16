import { findAllPositions } from "./conflict.js";
import { escapeRegex, findMatchInfo, findMatchInfoRegex } from "./match.js";
import { filterByScope } from "./scope.js";
import type { ApplyEditResult, EditMatchInfo, FileEdit, MatchScope } from "./types.js";

export function applyEdit(
  content: string,
  edit: FileEdit,
  index: number,
  ignoreWhitespace: boolean,
  scope: MatchScope | number[]
): ApplyEditResult {
  const { old_text: oldText } = edit;

  if (oldText === "") {
    return {
      index,
      edit,
      replacements: 0,
      success: false,
      errorKey: "apply.emptyOldText",
      error: "old_text cannot be empty",
    };
  }

  if (ignoreWhitespace) {
    return applyEditWhitespaceInsensitive(content, edit, index, scope);
  }

  return applyEditExact(content, edit, index, scope);
}

function applyEditExact(
  content: string,
  edit: FileEdit,
  index: number,
  scope: MatchScope | number[]
): ApplyEditResult {
  const { old_text: oldText, new_text: newText } = edit;
  const allMatches = findMatchInfo(content, oldText);
  const totalMatches = allMatches.length;

  if (totalMatches === 0) {
    return {
      index,
      edit,
      replacements: 0,
      success: false,
      errorKey: "apply.patternNotFoundExact",
      error: "Pattern not found (exact match)",
    };
  }

  const selectedIndices = filterByScope(totalMatches, scope);
  if (selectedIndices.length === 0) {
    return {
      index,
      edit,
      replacements: 0,
      success: false,
      errorKey: "apply.scopeNoMatch",
      errorParams: {
        totalMatches,
        scope: JSON.stringify(scope),
      },
      error: `No occurrences matched the scope (total ${totalMatches} matches, scope: ${JSON.stringify(scope)})`,
    };
  }

  let newContent = "";
  let lastEnd = 0;
  let replaced = 0;
  const positions = findAllPositions(content, oldText);

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    if (pos === undefined) continue;
    if (selectedIndices.includes(i)) {
      newContent += content.slice(lastEnd, pos) + newText;
      replaced++;
    } else {
      newContent += content.slice(lastEnd, pos) + oldText;
    }
    lastEnd = pos + oldText.length;
  }
  newContent += content.slice(lastEnd);

  return {
    index,
    edit,
    replacements: replaced,
    success: true,
    newContent,
    matches: selectedIndices
      .map((i) => allMatches[i])
      .filter((m): m is EditMatchInfo => m !== undefined),
  };
}

function applyEditWhitespaceInsensitive(
  content: string,
  edit: FileEdit,
  index: number,
  scope: MatchScope | number[]
): ApplyEditResult {
  const { old_text: oldText, new_text: newText } = edit;

  const pattern = escapeRegex(oldText).replace(/\\s\+/g, "\\s+").replace(/\s+/g, "\\s+");
  const regex = new RegExp(pattern, "g");

  const allMatches = findMatchInfoRegex(content, regex);
  const totalMatches = allMatches.length;

  if (totalMatches === 0) {
    return {
      index,
      edit,
      replacements: 0,
      success: false,
      errorKey: "apply.patternNotFoundWhitespace",
      error: "Pattern not found (whitespace-insensitive)",
    };
  }

  const selectedIndices = filterByScope(totalMatches, scope);
  if (selectedIndices.length === 0) {
    return {
      index,
      edit,
      replacements: 0,
      success: false,
      errorKey: "apply.scopeNoMatch",
      errorParams: {
        totalMatches,
        scope: JSON.stringify(scope),
      },
      error: `No occurrences matched the scope (total ${totalMatches} matches, scope: ${JSON.stringify(scope)})`,
    };
  }

  let matchIndex = 0;
  let replaced = 0;
  const newContent = content.replace(regex, (matched, offset) => {
    const currentIndex = matchIndex++;
    if (!selectedIndices.includes(currentIndex)) {
      return matched;
    }
    replaced++;

    const offsetNumber = typeof offset === "number" ? offset : 0;
    const beforeMatch = content.slice(0, offsetNumber);
    const lastNewline = beforeMatch.lastIndexOf("\n");
    const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
    const leadingIndent = content.slice(lineStart, offsetNumber).match(/^(\s*)/)?.[1] ?? "";

    if (newText.includes("\n")) {
      const oldIndent = oldText.match(/^(\s*)/)?.[1] ?? "";
      const lines = newText.split("\n");
      const adjusted = lines.map((line, i) => {
        if (i === 0) return line;
        if (line.startsWith(oldIndent)) {
          return leadingIndent + line.slice(oldIndent.length);
        }
        return leadingIndent + line;
      });
      return adjusted.join("\n");
    }

    return newText;
  });

  return {
    index,
    edit,
    replacements: replaced,
    success: true,
    newContent,
    matches: selectedIndices
      .map((i) => allMatches[i])
      .filter((m): m is EditMatchInfo => m !== undefined),
  };
}
