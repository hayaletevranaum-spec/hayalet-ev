export type LabFaceLandmarkPoint = {
  x: number;
  y: number;
  z?: number;
};

export type LabFaceLandmarkMetrics = {
  browEyePercent: number;
  eyeLineAngleDeg: number;
  eyeNosePercent: number;
  faceAspectRatio: number;
  faceAxisAngleDeg: number;
  interEyePercent: number;
  leftEyeWidthPercent: number;
  lipHeightPercent: number;
  lowerFaceWidthPercent: number;
  mouthChinPercent: number;
  mouthWidthPercent: number;
  noseLengthPercent: number;
  noseMouthPercent: number;
  noseWidthPercent: number;
  rightEyeWidthPercent: number;
  symmetryDeltaPercent: number;
};

export type LabFaceAlignmentAnchors = {
  eyeDistancePx: number;
  eyeLineAngleDeg: number;
  eyeMidpoint: LabFaceLandmarkPoint;
  faceCenter: LabFaceLandmarkPoint;
  mouthCenter: LabFaceLandmarkPoint;
  noseTip: LabFaceLandmarkPoint;
};

type PixelPoint = {
  x: number;
  y: number;
};

const FACE_INDEX = {
  browLeft: 334,
  browRight: 105,
  chin: 152,
  faceLeft: 234,
  faceRight: 454,
  forehead: 10,
  leftEyeInner: 362,
  leftEyeOuter: 263,
  leftEyeUpper: 386,
  lowerFaceLeft: 172,
  lowerFaceRight: 397,
  lowerLip: 14,
  mouthLeft: 61,
  mouthRight: 291,
  noseBase: 2,
  noseBridge: 168,
  noseLeft: 98,
  noseRight: 327,
  noseTip: 1,
  rightEyeInner: 133,
  rightEyeOuter: 33,
  rightEyeUpper: 159,
  upperLip: 13,
} as const;

function getPoint(points: readonly LabFaceLandmarkPoint[], index: number) {
  return points[index] ?? null;
}

function pixelPoint(
  point: LabFaceLandmarkPoint,
  imageWidth: number,
  imageHeight: number
): PixelPoint {
  return {
    x: point.x * imageWidth,
    y: point.y * imageHeight,
  };
}

function distancePixels(
  first: LabFaceLandmarkPoint,
  second: LabFaceLandmarkPoint,
  imageWidth: number,
  imageHeight: number
) {
  const a = pixelPoint(first, imageWidth, imageHeight);
  const b = pixelPoint(second, imageWidth, imageHeight);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function midpoint(first: LabFaceLandmarkPoint, second: LabFaceLandmarkPoint): LabFaceLandmarkPoint {
  const base = {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
  return typeof first.z === "number" && typeof second.z === "number"
    ? { ...base, z: (first.z + second.z) / 2 }
    : base;
}

function angleDegrees(
  first: LabFaceLandmarkPoint,
  second: LabFaceLandmarkPoint,
  imageWidth: number,
  imageHeight: number
) {
  const a = pixelPoint(first, imageWidth, imageHeight);
  const b = pixelPoint(second, imageWidth, imageHeight);
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function verticalAxisDegrees(
  top: LabFaceLandmarkPoint,
  bottom: LabFaceLandmarkPoint,
  imageWidth: number,
  imageHeight: number
) {
  const a = pixelPoint(top, imageWidth, imageHeight);
  const b = pixelPoint(bottom, imageWidth, imageHeight);
  return (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI;
}

function asPercent(value: number, basis: number) {
  return basis > 0 ? (value / basis) * 100 : 0;
}

function roundMetric(value: number) {
  return Math.round(value * 1000) / 1000;
}

function requiredPoints(points: readonly LabFaceLandmarkPoint[]) {
  const entries = Object.entries(FACE_INDEX).map(
    ([key, index]) => [key, getPoint(points, index)] as const
  );
  if (entries.some(([, point]) => point === null)) {
    return null;
  }
  return Object.fromEntries(entries) as Record<keyof typeof FACE_INDEX, LabFaceLandmarkPoint>;
}

export function buildLabFaceAlignmentAnchors(
  points: readonly LabFaceLandmarkPoint[],
  imageWidth: number,
  imageHeight: number
): LabFaceAlignmentAnchors | null {
  const face = requiredPoints(points);
  if (face === null || imageWidth <= 0 || imageHeight <= 0) {
    return null;
  }
  const leftEyeCenter = midpoint(face.leftEyeOuter, face.leftEyeInner);
  const rightEyeCenter = midpoint(face.rightEyeOuter, face.rightEyeInner);
  return {
    eyeDistancePx: distancePixels(leftEyeCenter, rightEyeCenter, imageWidth, imageHeight),
    eyeLineAngleDeg: angleDegrees(rightEyeCenter, leftEyeCenter, imageWidth, imageHeight),
    eyeMidpoint: midpoint(leftEyeCenter, rightEyeCenter),
    faceCenter: midpoint(face.forehead, face.chin),
    mouthCenter: midpoint(face.upperLip, face.lowerLip),
    noseTip: face.noseTip,
  };
}

export function buildLabFaceLandmarkMetrics(
  points: readonly LabFaceLandmarkPoint[],
  imageWidth: number,
  imageHeight: number
): LabFaceLandmarkMetrics | null {
  const face = requiredPoints(points);
  if (face === null || imageWidth <= 0 || imageHeight <= 0) {
    return null;
  }
  const faceWidth = distancePixels(face.faceLeft, face.faceRight, imageWidth, imageHeight);
  const faceHeight = distancePixels(face.forehead, face.chin, imageWidth, imageHeight);
  if (faceWidth <= 0 || faceHeight <= 0) {
    return null;
  }
  const leftEyeCenter = midpoint(face.leftEyeOuter, face.leftEyeInner);
  const rightEyeCenter = midpoint(face.rightEyeOuter, face.rightEyeInner);
  const eyeMidpoint = midpoint(leftEyeCenter, rightEyeCenter);
  const mouthCenter = midpoint(face.upperLip, face.lowerLip);
  const browEye =
    (distancePixels(face.browRight, face.rightEyeUpper, imageWidth, imageHeight) +
      distancePixels(face.browLeft, face.leftEyeUpper, imageWidth, imageHeight)) /
    2;
  const leftNoseDistance = distancePixels(face.noseTip, face.faceLeft, imageWidth, imageHeight);
  const rightNoseDistance = distancePixels(face.noseTip, face.faceRight, imageWidth, imageHeight);

  return {
    browEyePercent: roundMetric(asPercent(browEye, faceHeight)),
    eyeLineAngleDeg: roundMetric(
      angleDegrees(rightEyeCenter, leftEyeCenter, imageWidth, imageHeight)
    ),
    eyeNosePercent: roundMetric(
      asPercent(distancePixels(eyeMidpoint, face.noseTip, imageWidth, imageHeight), faceHeight)
    ),
    faceAspectRatio: roundMetric(faceWidth / faceHeight),
    faceAxisAngleDeg: roundMetric(
      verticalAxisDegrees(face.forehead, face.chin, imageWidth, imageHeight)
    ),
    interEyePercent: roundMetric(
      asPercent(distancePixels(rightEyeCenter, leftEyeCenter, imageWidth, imageHeight), faceWidth)
    ),
    leftEyeWidthPercent: roundMetric(
      asPercent(
        distancePixels(face.leftEyeOuter, face.leftEyeInner, imageWidth, imageHeight),
        faceWidth
      )
    ),
    lipHeightPercent: roundMetric(
      asPercent(distancePixels(face.upperLip, face.lowerLip, imageWidth, imageHeight), faceHeight)
    ),
    lowerFaceWidthPercent: roundMetric(
      asPercent(
        distancePixels(face.lowerFaceLeft, face.lowerFaceRight, imageWidth, imageHeight),
        faceWidth
      )
    ),
    mouthChinPercent: roundMetric(
      asPercent(distancePixels(mouthCenter, face.chin, imageWidth, imageHeight), faceHeight)
    ),
    mouthWidthPercent: roundMetric(
      asPercent(distancePixels(face.mouthLeft, face.mouthRight, imageWidth, imageHeight), faceWidth)
    ),
    noseLengthPercent: roundMetric(
      asPercent(distancePixels(face.noseBridge, face.noseBase, imageWidth, imageHeight), faceHeight)
    ),
    noseMouthPercent: roundMetric(
      asPercent(distancePixels(face.noseTip, mouthCenter, imageWidth, imageHeight), faceHeight)
    ),
    noseWidthPercent: roundMetric(
      asPercent(distancePixels(face.noseLeft, face.noseRight, imageWidth, imageHeight), faceWidth)
    ),
    rightEyeWidthPercent: roundMetric(
      asPercent(
        distancePixels(face.rightEyeOuter, face.rightEyeInner, imageWidth, imageHeight),
        faceWidth
      )
    ),
    symmetryDeltaPercent: roundMetric(
      asPercent(Math.abs(leftNoseDistance - rightNoseDistance), faceWidth)
    ),
  };
}
