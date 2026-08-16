import type { MatchScope } from "./types.js";

export function filterByScope(totalMatches: number, scope: MatchScope | number[]): number[] {
  if (Array.isArray(scope)) {
    return scope.filter((i) => i >= 0 && i < totalMatches);
  }

  switch (scope) {
    case "first":
      return totalMatches > 0 ? [0] : [];
    case "last":
      return totalMatches > 0 ? [totalMatches - 1] : [];
    case "all":
      return Array.from({ length: totalMatches }, (_, i) => i);
    default:
      return [];
  }
}
