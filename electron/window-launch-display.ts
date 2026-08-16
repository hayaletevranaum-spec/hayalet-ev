type PointLike = {
  x: number;
  y: number;
};

type RectangleLike = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LaunchDisplay = {
  id: number;
  bounds: RectangleLike;
  workArea: RectangleLike;
};

function pointIsInsideRectangle(point: PointLike, rect: RectangleLike): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

function distanceToRectangleSquared(point: PointLike, rect: RectangleLike): number {
  const dx =
    point.x < rect.x
      ? rect.x - point.x
      : point.x > rect.x + rect.width
        ? point.x - (rect.x + rect.width)
        : 0;
  const dy =
    point.y < rect.y
      ? rect.y - point.y
      : point.y > rect.y + rect.height
        ? point.y - (rect.y + rect.height)
        : 0;
  return dx * dx + dy * dy;
}

export function resolveLaunchDisplay(
  displays: readonly LaunchDisplay[],
  primaryDisplay: LaunchDisplay,
  cursorPoint: PointLike,
  options: { displayId?: number | null } = {}
): LaunchDisplay {
  if (options.displayId !== undefined && options.displayId !== null) {
    const matchedDisplay = displays.find((display) => display.id === options.displayId);
    if (matchedDisplay !== undefined) {
      return matchedDisplay;
    }
  }

  const directCursorDisplay = displays.find((display) =>
    pointIsInsideRectangle(cursorPoint, display.bounds)
  );
  if (directCursorDisplay !== undefined) {
    return directCursorDisplay;
  }

  if (displays.length === 0) {
    return primaryDisplay;
  }

  return displays.reduce((closestDisplay, display) => {
    return distanceToRectangleSquared(cursorPoint, display.bounds) <
      distanceToRectangleSquared(cursorPoint, closestDisplay.bounds)
      ? display
      : closestDisplay;
  }, primaryDisplay);
}
