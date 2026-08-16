import type { EditMatchInfo } from "./types.js";

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findMatchInfo(content: string, search: string): EditMatchInfo[] {
  const matches: EditMatchInfo[] = [];
  let idx = content.indexOf(search);
  while (idx !== -1) {
    const before = content.slice(0, idx);
    const line = (before.match(/\n/g) ?? []).length + 1;
    const lastNewline = before.lastIndexOf("\n");
    const column = idx - (lastNewline === -1 ? 0 : lastNewline + 1) + 1;
    matches.push({ line, column, length: search.length });
    idx = content.indexOf(search, idx + 1);
  }
  return matches;
}

export function findMatchInfoRegex(content: string, regex: RegExp): EditMatchInfo[] {
  const matches: EditMatchInfo[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");

  while ((match = re.exec(content)) !== null) {
    const before = content.slice(0, match.index);
    const line = (before.match(/\n/g) ?? []).length + 1;
    const lastNewline = before.lastIndexOf("\n");
    const column = match.index - (lastNewline === -1 ? 0 : lastNewline + 1) + 1;
    matches.push({ line, column, length: match[0].length });
  }

  return matches;
}
