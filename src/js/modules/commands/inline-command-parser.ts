export interface InlineCommandMatch {
  prefix: string;
  commandName: string;
  args: string;
  raw: string;
  startIndex: number;
  endIndex: number;
}

interface InlineCommandParseOptions {
  prefix?: string;
}

function isCommandNameChar(value: string): boolean {
  return /[A-Za-z0-9_]/.test(value);
}

function scanInlineCommand(
  text: string,
  startIndex: number,
  prefix: string
): InlineCommandMatch | null {
  const normalizedPrefix = prefix.trim();
  if (normalizedPrefix === "") {
    return null;
  }

  const marker = `++${normalizedPrefix}:`;
  if (text.startsWith(marker, startIndex) !== true) {
    return null;
  }

  let cursor = startIndex + marker.length;
  let commandName = "";

  while (cursor < text.length) {
    const next = text[cursor] ?? "";
    if (!isCommandNameChar(next)) {
      break;
    }
    commandName += next;
    cursor += 1;
  }

  if (commandName === "" || text[cursor] !== "(") {
    return null;
  }

  const argsStart = cursor + 1;
  let depth = 1;
  let quote: '"' | "'" | "`" | null = null;
  let escaped = false;
  cursor = argsStart;

  while (cursor < text.length) {
    const next = text[cursor] ?? "";

    if (escaped) {
      escaped = false;
      cursor += 1;
      continue;
    }

    if (quote !== null) {
      if (next === "\\") {
        escaped = true;
      } else if (next === quote) {
        quote = null;
      }
      cursor += 1;
      continue;
    }

    if (next === '"' || next === "'" || next === "`") {
      quote = next;
      cursor += 1;
      continue;
    }

    if (next === "(") {
      depth += 1;
      cursor += 1;
      continue;
    }

    if (next === ")") {
      depth -= 1;
      if (depth === 0) {
        const endIndex = cursor + 1;
        return {
          prefix: normalizedPrefix,
          commandName,
          args: text.slice(argsStart, cursor),
          raw: text.slice(startIndex, endIndex),
          startIndex,
          endIndex,
        };
      }
      cursor += 1;
      continue;
    }

    cursor += 1;
  }

  return null;
}

export function parseInlineCommands(
  text: string,
  options: InlineCommandParseOptions = {}
): InlineCommandMatch[] {
  const source = typeof text === "string" ? text : "";
  const prefix =
    typeof options.prefix === "string" && options.prefix.trim() !== ""
      ? options.prefix.trim()
      : "cmd";
  const matches: InlineCommandMatch[] = [];

  let cursor = 0;
  while (cursor < source.length) {
    const next = scanInlineCommand(source, cursor, prefix);
    if (next === null) {
      cursor += 1;
      continue;
    }
    matches.push(next);
    cursor = next.endIndex;
  }

  return matches;
}

export function parseExactInlineCommand(
  text: string,
  options: InlineCommandParseOptions = {}
): InlineCommandMatch | null {
  const source = typeof text === "string" ? text : "";
  const trimmed = source.trim();
  if (trimmed === "") {
    return null;
  }

  const parsed = parseInlineCommands(trimmed, options);
  if (parsed.length !== 1) {
    return null;
  }

  const [match] = parsed;
  if (match === undefined) {
    return null;
  }

  return match.startIndex === 0 && match.endIndex === trimmed.length ? match : null;
}

export function stripInlineCommandsFromText(
  text: string,
  options: InlineCommandParseOptions = {}
): string {
  const matches = parseInlineCommands(text, options);
  if (matches.length === 0) {
    return text;
  }

  let cursor = 0;
  let output = "";
  for (const match of matches) {
    output += text.slice(cursor, match.startIndex);
    cursor = match.endIndex;
  }
  output += text.slice(cursor);
  return output;
}
