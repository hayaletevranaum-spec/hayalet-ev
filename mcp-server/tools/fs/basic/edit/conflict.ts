import type { ConflictInfo, FileEdit } from "./types.js";

export function detectConflicts(content: string, edits: FileEdit[]): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];

  for (let i = 0; i < edits.length; i++) {
    const editA = edits[i];
    if (!editA) continue;

    for (let j = i + 1; j < edits.length; j++) {
      const editB = edits[j];
      if (!editB) continue;

      if (editA.old_text === editB.old_text) {
        const preview = `${editA.old_text.slice(0, 40)}${editA.old_text.length > 40 ? "..." : ""}`;
        conflicts.push({
          editA: i,
          editB: j,
          reasonKey: "conflicts.sameTarget",
          reasonParams: {
            preview,
          },
          reason: `The same old_text target was selected: "${preview}"`,
        });
        continue;
      }

      if (editA.old_text.includes(editB.old_text)) {
        conflicts.push({
          editA: i,
          editB: j,
          reasonKey: "conflicts.subsetOfA",
          reasonParams: {
            childEdit: j + 1,
            parentEdit: i + 1,
          },
          reason: `Edit ${j + 1} old_text is a subset of Edit ${i + 1} old_text`,
        });
        continue;
      }

      if (editB.old_text.includes(editA.old_text)) {
        conflicts.push({
          editA: i,
          editB: j,
          reasonKey: "conflicts.subsetOfB",
          reasonParams: {
            childEdit: i + 1,
            parentEdit: j + 1,
          },
          reason: `Edit ${i + 1} old_text is a subset of Edit ${j + 1} old_text`,
        });
        continue;
      }

      const positionsA = findAllPositions(content, editA.old_text);
      const positionsB = findAllPositions(content, editB.old_text);

      for (const posA of positionsA) {
        for (const posB of positionsB) {
          const endA = posA + editA.old_text.length;
          const endB = posB + editB.old_text.length;
          if (posA < endB && posB < endA) {
            conflicts.push({
              editA: i,
              editB: j,
              reasonKey: "conflicts.overlappingRanges",
              reasonParams: {
                editA: i + 1,
                startA: posA,
                endA,
                editB: j + 1,
                startB: posB,
                endB,
              },
              reason: `Overlapping ranges: Edit ${i + 1} [${posA}:${endA}] vs Edit ${j + 1} [${posB}:${endB}]`,
            });
          }
        }
      }
    }
  }

  return conflicts;
}

export function findAllPositions(content: string, search: string): number[] {
  const positions: number[] = [];
  let idx = content.indexOf(search);
  while (idx !== -1) {
    positions.push(idx);
    idx = content.indexOf(search, idx + 1);
  }
  return positions;
}
