export interface SceneAlphaWindowBounds {
  sourceWidth: number;
  sourceHeight: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SceneAlphaWindowFrameInsets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const MIN_WIDTH_COVERAGE = 0.18;
const MIN_HEIGHT_COVERAGE = 0.14;
const MAX_COVERAGE = 0.98;
const MIN_DENSITY = 0.68;

const alphaWindowBoundsCache = new Map<string, Promise<SceneAlphaWindowBounds | null>>();

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clearSceneAlphaWindowFrameVariables(target: HTMLElement, prefix: string): void {
  target.style.removeProperty(`--${prefix}-frame-left`);
  target.style.removeProperty(`--${prefix}-frame-top`);
  target.style.removeProperty(`--${prefix}-frame-right`);
  target.style.removeProperty(`--${prefix}-frame-bottom`);
}

function applyFrameVariables(
  target: HTMLElement,
  prefix: string,
  frame: SceneAlphaWindowFrameInsets
): void {
  target.style.setProperty(`--${prefix}-frame-left`, `${frame.left}%`);
  target.style.setProperty(`--${prefix}-frame-top`, `${frame.top}%`);
  target.style.setProperty(`--${prefix}-frame-right`, `${frame.right}%`);
  target.style.setProperty(`--${prefix}-frame-bottom`, `${frame.bottom}%`);
}

export function projectSceneAlphaWindowBoundsToCoverFrame(
  container: HTMLElement,
  bounds: SceneAlphaWindowBounds
): SceneAlphaWindowFrameInsets | null {
  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;
  if (containerWidth <= 0 || containerHeight <= 0) {
    return null;
  }

  const scale = Math.max(
    containerWidth / bounds.sourceWidth,
    containerHeight / bounds.sourceHeight
  );
  const renderedWidth = bounds.sourceWidth * scale;
  const renderedHeight = bounds.sourceHeight * scale;
  const offsetX = (containerWidth - renderedWidth) / 2;
  const offsetY = (containerHeight - renderedHeight) / 2;

  const leftPx = clamp(offsetX + bounds.left * scale, 0, containerWidth);
  const topPx = clamp(offsetY + bounds.top * scale, 0, containerHeight);
  const rightPx = clamp(offsetX + bounds.right * scale, 0, containerWidth);
  const bottomPx = clamp(offsetY + bounds.bottom * scale, 0, containerHeight);

  if (rightPx - leftPx < 1 || bottomPx - topPx < 1) {
    return null;
  }

  return {
    left: (leftPx / containerWidth) * 100,
    top: (topPx / containerHeight) * 100,
    right: ((containerWidth - rightPx) / containerWidth) * 100,
    bottom: ((containerHeight - bottomPx) / containerHeight) * 100,
  };
}

function scanTransparentBounds(
  pixels: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  alphaThreshold: number
): SceneAlphaWindowBounds | null {
  let left = sourceWidth;
  let top = sourceHeight;
  let right = -1;
  let bottom = -1;
  let transparentCount = 0;

  for (let y = 0; y < sourceHeight; y += 1) {
    for (let x = 0; x < sourceWidth; x += 1) {
      const alpha = pixels[(y * sourceWidth + x) * 4 + 3] ?? 255;
      if (alpha > alphaThreshold) {
        continue;
      }

      transparentCount += 1;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (
    transparentCount === 0 ||
    right < left ||
    bottom < top ||
    transparentCount === sourceWidth * sourceHeight
  ) {
    return null;
  }

  const width = right - left + 1;
  const height = bottom - top + 1;
  const density = transparentCount / (width * height);
  const widthCoverage = width / sourceWidth;
  const heightCoverage = height / sourceHeight;

  if (
    widthCoverage < MIN_WIDTH_COVERAGE ||
    heightCoverage < MIN_HEIGHT_COVERAGE ||
    widthCoverage > MAX_COVERAGE ||
    heightCoverage > MAX_COVERAGE ||
    density < MIN_DENSITY
  ) {
    return null;
  }

  return {
    sourceWidth,
    sourceHeight,
    left,
    top,
    right: right + 1,
    bottom: bottom + 1,
  };
}

async function loadAlphaWindowBounds(
  src: string,
  alphaThreshold: number
): Promise<SceneAlphaWindowBounds | null> {
  const bounds = await new Promise<SceneAlphaWindowBounds | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = (): void => {
      const sourceWidth = image.naturalWidth > 0 ? image.naturalWidth : image.width;
      const sourceHeight = image.naturalHeight > 0 ? image.naturalHeight : image.height;
      if (sourceWidth <= 0 || sourceHeight <= 0) {
        resolve(null);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = sourceWidth;
      canvas.height = sourceHeight;

      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context === null) {
        resolve(null);
        return;
      }

      context.clearRect(0, 0, sourceWidth, sourceHeight);
      context.drawImage(image, 0, 0, sourceWidth, sourceHeight);
      const imageData = context.getImageData(0, 0, sourceWidth, sourceHeight);
      resolve(scanTransparentBounds(imageData.data, sourceWidth, sourceHeight, alphaThreshold));
    };

    image.onerror = (): void => {
      resolve(null);
    };

    image.src = src;
  });

  return bounds;
}

export async function detectSceneAlphaWindowBounds(
  src: string,
  alphaThreshold: number
): Promise<SceneAlphaWindowBounds | null> {
  const cacheKey = `${alphaThreshold}:${src}`;
  const cached = alphaWindowBoundsCache.get(cacheKey);
  if (cached !== undefined) {
    const bounds = await cached;
    return bounds;
  }

  const promise = loadAlphaWindowBounds(src, alphaThreshold);
  alphaWindowBoundsCache.set(cacheKey, promise);
  const bounds = await promise;
  return bounds;
}

export function invalidateSceneAlphaWindowBoundsCache(src?: string): void {
  if (src === undefined || src.trim() === "") {
    alphaWindowBoundsCache.clear();
    return;
  }

  const normalizedSrc = src.trim();
  for (const key of [...alphaWindowBoundsCache.keys()]) {
    if (key.endsWith(`:${normalizedSrc}`)) {
      alphaWindowBoundsCache.delete(key);
    }
  }
}

export function applySceneAlphaWindowBoundsToTarget(options: {
  bounds: SceneAlphaWindowBounds | null;
  container: HTMLElement;
  target: HTMLElement;
  variablePrefix: string;
}): void {
  const { bounds, container, target, variablePrefix } = options;
  if (bounds === null) {
    clearSceneAlphaWindowFrameVariables(target, variablePrefix);
    return;
  }

  const frame = projectSceneAlphaWindowBoundsToCoverFrame(container, bounds);
  if (frame === null) {
    clearSceneAlphaWindowFrameVariables(target, variablePrefix);
    return;
  }

  applyFrameVariables(target, variablePrefix, frame);
}
