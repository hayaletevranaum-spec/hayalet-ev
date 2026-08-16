export interface SceneProjection {
  offsetX: number;
  offsetY: number;
  scale: number;
}

interface CoverSceneProjectionInput {
  surfaceWidth: number;
  surfaceHeight: number;
  referenceWidth: number;
  referenceHeight: number;
}

interface SceneReferenceSize {
  width: number;
  height: number;
}

export function getCoverSceneProjection(input: CoverSceneProjectionInput): SceneProjection {
  const { surfaceWidth, surfaceHeight, referenceWidth, referenceHeight } = input;

  if (surfaceWidth <= 0 || surfaceHeight <= 0 || referenceWidth <= 0 || referenceHeight <= 0) {
    return { offsetX: 0, offsetY: 0, scale: 1 };
  }

  const scale = Math.max(surfaceWidth / referenceWidth, surfaceHeight / referenceHeight);

  return {
    offsetX: (surfaceWidth - referenceWidth * scale) / 2,
    offsetY: (surfaceHeight - referenceHeight * scale) / 2,
    scale,
  };
}

export function getCoverSceneProjectionFromElement(
  element: HTMLElement | null | undefined,
  referenceSize: SceneReferenceSize
): SceneProjection {
  return getCoverSceneProjection({
    surfaceWidth: element?.clientWidth ?? 0,
    surfaceHeight: element?.clientHeight ?? 0,
    referenceWidth: referenceSize.width,
    referenceHeight: referenceSize.height,
  });
}
