import { countBracketsContextAware } from "../../../dev/structure-visualizer.js";
import type { BracketDifference } from "./types.js";

export function checkBracketBalance(content: string): {
  ok: boolean;
  differences?: BracketDifference[];
} {
  const result = countBracketsContextAware(content);

  if (result.balanced) {
    return { ok: true };
  }

  const differences: BracketDifference[] = [];
  const pairs: Array<{ open: string; close: string; name: string }> = [
    { open: "(", close: ")", name: "parentheses" },
    { open: "{", close: "}", name: "curlyBraces" },
    { open: "[", close: "]", name: "squareBrackets" },
  ];

  for (const pair of pairs) {
    const openCount = result.open[pair.open]?.length ?? 0;
    const closeCount = result.close[pair.close]?.length ?? 0;
    if (openCount !== closeCount) {
      differences.push({
        pair: pair.name as BracketDifference["pair"],
        difference: Math.abs(openCount - closeCount),
        missingToken: openCount > closeCount ? pair.close : pair.open,
        state: openCount > closeCount ? "missing" : "extra",
      });
    }
  }

  return { ok: false, differences };
}
