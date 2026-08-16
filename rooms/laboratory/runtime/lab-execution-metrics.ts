type SelectionRange = {
  endMs: number;
  startMs: number;
};

type SelectionRoi = {
  height: number;
  width: number;
};

type SelectionWithRoi = {
  roi?: SelectionRoi;
};

export function clampLabConfidence(value: number, minimum = 0.25, maximum = 0.98) {
  return Math.max(minimum, Math.min(maximum, Number(value.toFixed(2))));
}

export function getLabSelectionDurationMs(selection: SelectionRange, minimum = 0) {
  return Math.max(minimum, selection.endMs - selection.startMs);
}

export function getLabRoiArea(roi: SelectionRoi | undefined) {
  return roi ? roi.width * roi.height : 0;
}

export function getLabSelectionRoiArea(selection: SelectionWithRoi) {
  return getLabRoiArea(selection.roi);
}

export function getLabSelectionRoiAspectRatio(selection: SelectionWithRoi) {
  if (selection.roi === undefined) {
    return null;
  }
  const { height, width } = selection.roi;
  if (height <= 0 || width <= 0) {
    return Infinity;
  }
  return Math.max(width / height, height / width);
}

export function pushUniqueString(target: string[], value: string) {
  if (!target.includes(value)) {
    target.push(value);
  }
}
