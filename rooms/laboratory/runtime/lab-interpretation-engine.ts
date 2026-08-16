import type {
  LabAudioFocusSettings,
  LabInspectionMode,
  LabInterpretationItem,
  LabSelection,
} from "../domain/lab-types.js";

type InterpretationContext = {
  activeSelection: LabSelection | null;
  audioFocus: LabAudioFocusSettings;
  inspectionMode: LabInspectionMode;
  sourceKind: string;
};

function createInterpretation(item: LabInterpretationItem): LabInterpretationItem {
  return item;
}

function pushInterpretation(items: LabInterpretationItem[], item: LabInterpretationItem) {
  if (items.some((entry) => entry.id === item.id)) {
    return;
  }
  items.push(item);
}

function sourceSupportsAudioInterpretation(sourceKind: string) {
  return sourceKind === "audio" || sourceKind === "video";
}

export function buildInterpretationItems(context: InterpretationContext): LabInterpretationItem[] {
  const items: LabInterpretationItem[] = [];
  const selection = context.activeSelection;
  const audioFocus = context.audioFocus;
  const audioContextAvailable = sourceSupportsAudioInterpretation(context.sourceKind);
  const selectionRoi = selection?.roi;
  const selectionRoiArea =
    selectionRoi !== undefined ? selectionRoi.width * selectionRoi.height : 0;
  const selectionRoiAspectRatio =
    selectionRoi !== undefined && selectionRoi.height > 0
      ? selectionRoi.width / selectionRoi.height
      : null;

  if (audioContextAvailable && audioFocus.gain > 1.5) {
    pushInterpretation(
      items,
      createInterpretation({
        id: "audio-high-gain",
        type: "warning",
        message: "High gain may introduce clipping or noise amplification",
        confidence: 0.88,
        recommendation: "Reduce gain or apply EQ balancing",
        severity: "high",
        relatedAction: "inspect-audio",
      })
    );
  }

  if (audioContextAvailable && audioFocus.playbackRate < 0.5) {
    pushInterpretation(
      items,
      createInterpretation({
        id: "audio-slow-playback",
        type: "hint",
        message: "Slow playback can reveal temporal anomalies",
        confidence: 0.82,
        recommendation: "Use slow playback to inspect transient details",
        severity: "medium",
      })
    );
  }

  if (audioContextAvailable && audioFocus.playbackRate > 1.5) {
    pushInterpretation(
      items,
      createInterpretation({
        id: "audio-fast-playback",
        type: "hint",
        message: "Fast playback helps detect repetitive patterns",
        confidence: 0.8,
        recommendation: "Use fast playback to detect repetition patterns",
        severity: "medium",
      })
    );
  }

  if (
    audioContextAvailable &&
    audioFocus.filterType === "lowpass" &&
    audioFocus.filterFrequency <= 1200
  ) {
    pushInterpretation(
      items,
      createInterpretation({
        id: "audio-lowpass-suppressed-highs",
        type: "info",
        message: "High frequencies are suppressed",
        confidence: 0.76,
        recommendation: "Try increasing cutoff to restore clarity",
        severity: "low",
        relatedAction: "inspect-audio",
      })
    );
  }

  if (audioContextAvailable && audioFocus.eqBands.some((band) => band.gain > 8)) {
    pushInterpretation(
      items,
      createInterpretation({
        id: "audio-extreme-eq-boost",
        type: "warning",
        message: "Extreme EQ boost may distort signal perception",
        confidence: 0.84,
        recommendation: "Reduce boost to avoid distortion",
        severity: "high",
        relatedAction: "inspect-audio",
      })
    );
  }

  if (selection !== null && selection.endMs > selection.startMs) {
    const durationMs = selection.endMs - selection.startMs;
    if (context.sourceKind !== "image" && durationMs < 500) {
      pushInterpretation(
        items,
        createInterpretation({
          id: "selection-short-context",
          type: "hint",
          message: "Very short segment; context may be insufficient",
          confidence: 0.75,
          recommendation: "Expand selection for better context",
          severity: "medium",
        })
      );
    }
    if (context.sourceKind !== "image" && durationMs > 10_000) {
      pushInterpretation(
        items,
        createInterpretation({
          id: "selection-wide-context",
          type: "info",
          message: "Wide selection; consider narrowing focus",
          confidence: 0.72,
          recommendation: "Narrow selection for focused analysis",
          severity: "low",
        })
      );
    }
  }

  if (selectionRoi !== undefined) {
    if (selectionRoiArea < 0.05) {
      pushInterpretation(
        items,
        createInterpretation({
          id: "selection-roi-limited-context",
          type: "hint",
          message: "Very small region; local context may be very limited",
          confidence: 0.74,
          recommendation: "Expand the region slightly to include surrounding context",
          severity: "medium",
        })
      );
    }
    if (selectionRoiArea > 0.6) {
      pushInterpretation(
        items,
        createInterpretation({
          id: "selection-roi-wide-focus",
          type: "info",
          message: "Large region selected; consider narrowing focus",
          confidence: 0.72,
          recommendation: "Reduce the region to emphasize the most relevant area",
          severity: "low",
        })
      );
    }
    if (
      selectionRoiAspectRatio !== null &&
      (selectionRoiAspectRatio >= 3 || selectionRoiAspectRatio <= 1 / 3)
    ) {
      pushInterpretation(
        items,
        createInterpretation({
          id: "selection-roi-extreme-aspect",
          type: "info",
          message: "Extreme region aspect ratio may introduce framing distortion",
          confidence: 0.71,
          recommendation: "Consider a more balanced crop if shape is biasing the inspection view",
          severity: "low",
        })
      );
    }
    if (context.sourceKind === "video" && audioFocus.playbackRate > 1.5) {
      pushInterpretation(
        items,
        createInterpretation({
          id: "selection-roi-motion-ambiguity",
          type: "hint",
          message: "Fast playback can make region motion harder to judge",
          confidence:
            context.inspectionMode === "motion" || context.inspectionMode === "visual"
              ? 0.77
              : 0.73,
          recommendation: "Slow playback may reduce motion ambiguity inside the selected region",
          severity: "medium",
        })
      );
    }
  }

  return items;
}
