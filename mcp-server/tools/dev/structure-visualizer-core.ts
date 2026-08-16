export function countBracketsContextAware(content: string): {
  open: { [key: string]: Array<{ line: number; col: number }> };
  close: { [key: string]: Array<{ line: number; col: number }> };
  balanced: boolean;
} {
  const lines = content.split("\n");
  const open: { [key: string]: Array<{ line: number; col: number }> } = {
    "(": [],
    "{": [],
    "[": [],
  };
  const close: { [key: string]: Array<{ line: number; col: number }> } = {
    ")": [],
    "}": [],
    "]": [],
  };

  let inString = false;
  let stringChar = "";
  let inRegex = false;
  let inSingleLineComment: boolean;
  let inMultiLineComment = false;

  const templateLiteralStack: number[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (line == null || line === "") continue;
    inSingleLineComment = false;

    for (let col = 0; col < line.length; col++) {
      const char = line[col];
      const nextChar = col < line.length - 1 ? line[col + 1] : "";

      if (inSingleLineComment) continue;

      if (!inString && !inRegex && char === "/" && nextChar === "*") {
        inMultiLineComment = true;
        col++;
        continue;
      }
      if (inMultiLineComment && char === "*" && nextChar === "/") {
        inMultiLineComment = false;
        col++;
        continue;
      }
      if (inMultiLineComment) continue;

      if (!inString && !inRegex && char === "/" && nextChar === "/") {
        inSingleLineComment = true;
        continue;
      }

      if ((char === '"' || char === "'" || char === "`") && !inRegex) {
        let bsCount = 0;
        let bsPos = col - 1;
        while (bsPos >= 0 && line[bsPos] === "\\") {
          bsCount++;
          bsPos--;
        }
        const isEscapedQuote = bsCount % 2 === 1;

        if (!isEscapedQuote) {
          if (!inString) {
            inString = true;
            stringChar = char;
          } else if (char === stringChar) {
            inString = false;
            stringChar = "";
          }
        }
        continue;
      }

      if (inString && stringChar === "`") {
        if (char === "$" && nextChar === "{") {
          templateLiteralStack.push(0);
          inString = false;
          stringChar = "";
          col++;
          continue;
        }
        continue;
      }

      if (inString) continue;

      if (templateLiteralStack.length > 0) {
        if (char === "{") {
          const lastIdx = templateLiteralStack.length - 1;
          templateLiteralStack[lastIdx] = (templateLiteralStack[lastIdx] ?? 0) + 1;
          open[char]?.push({ line: lineIdx + 1, col: col + 1 });
          continue;
        }
        if (char === "}") {
          const lastIdx = templateLiteralStack.length - 1;
          const depth = templateLiteralStack[lastIdx] ?? 0;
          if (depth === 0) {
            templateLiteralStack.pop();
            inString = true;
            stringChar = "`";
            continue;
          }
          templateLiteralStack[lastIdx] = depth - 1;
          close[char]?.push({ line: lineIdx + 1, col: col + 1 });
          continue;
        }
      }

      if (char === "/" && !inRegex) {
        let backslashCount = 0;
        let checkPos = col - 1;
        while (checkPos >= 0 && line[checkPos] === "\\") {
          backslashCount++;
          checkPos--;
        }
        const isEscaped = backslashCount % 2 === 1;

        if (!isEscaped) {
          let prevTokenEnd = col - 1;
          while (
            prevTokenEnd >= 0 &&
            line[prevTokenEnd] != null &&
            line[prevTokenEnd] !== "" &&
            /\s/.test(line[prevTokenEnd] ?? "")
          ) {
            prevTokenEnd--;
          }

          const prevTokenChar =
            prevTokenEnd >= 0 && line[prevTokenEnd] != null && line[prevTokenEnd] !== ""
              ? line[prevTokenEnd]
              : "";
          const isDivision =
            prevTokenChar != null && prevTokenChar !== "" ? /[\w$)\]]/.test(prevTokenChar) : false;

          if (!isDivision) {
            const beforeChars = [
              "=",
              "(",
              ",",
              ":",
              "[",
              "{",
              ";",
              "!",
              "&",
              "|",
              "?",
              "+",
              "-",
              "*",
              "%",
              "~",
              "^",
            ];
            const prevChar = prevTokenEnd >= 0 ? line[prevTokenEnd] : undefined;
            const charBefore = typeof prevChar === "string" ? prevChar : "";
            const isRegexStart =
              col === 0 || (charBefore !== "" && beforeChars.includes(charBefore));

            if (isRegexStart) {
              inRegex = true;
              continue;
            }
          }
        }
      } else if (char === "/" && inRegex) {
        let backslashCount = 0;
        let checkPos = col - 1;
        while (checkPos >= 0 && line[checkPos] === "\\") {
          backslashCount++;
          checkPos--;
        }
        const isEscaped = backslashCount % 2 === 1;

        if (!isEscaped) {
          const regexFlags = ["i", "g", "m", "s", "u", "y", ".", " ", ")", ";", ",", "}", "]"];
          const isRegexEnd =
            (nextChar != null && nextChar !== "" && regexFlags.includes(nextChar)) ||
            col === line.length - 1;

          if (isRegexEnd) {
            inRegex = false;
            continue;
          }
        }
      }

      if (inRegex) continue;

      let isGenericType = false;
      if (char === "<" || char === ">") {
        const prevWord = line.substring(Math.max(0, col - 10), col).match(/[A-Za-z_$][\w$]*$/);
        const nextWord = line
          .substring(col + 1, Math.min(line.length, col + 11))
          .match(/^[A-Za-z_$][\w$]*/);

        if ((prevWord ?? nextWord) || (char === ">" && line[col + 1] === ">")) {
          isGenericType = true;
        }
      }

      if (!isGenericType) {
        if (char === "(" || char === "{" || char === "[") {
          open[char]?.push({ line: lineIdx + 1, col: col + 1 });
        } else if (char === ")" || char === "}" || char === "]") {
          close[char]?.push({ line: lineIdx + 1, col: col + 1 });
        }
      }
    }
  }

  const balanced =
    (open["("]?.length ?? 0) === (close[")"]?.length ?? 0) &&
    (open["{"]?.length ?? 0) === (close["}"]?.length ?? 0) &&
    (open["["]?.length ?? 0) === (close["]"]?.length ?? 0);

  return { open, close, balanced };
}
