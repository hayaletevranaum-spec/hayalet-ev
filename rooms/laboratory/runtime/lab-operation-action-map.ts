const LAB_OPERATION_UI_ACTION_TO_TRACKED_ACTION = {
  "timeline-export-clip": "export-timeline-clip",
  "timeline-stabilize-segment": "export-stabilized-clip",
  "timeline-grab-frame": "export-frame-grab",
  "timeline-extract-audio": "export-audio-track",
  "workspace-audio-cleanup-export": "export-clean-audio",
  "workspace-band-pass-voice-export": "export-band-pass-voice",
  "workspace-before-after-export": "export-before-after-variant",
  "workspace-comparison-finding-save": "save-comparison-finding",
  "workspace-comparison-moment-capture": "capture-comparison-moment",
  "workspace-enhanced-frame-export": "export-enhanced-frame",
  "workspace-image-comparison-export": "export-image-comparison",
  "workspace-selection-roi-export": "export-roi-image",
  "workspace-stem-separation-export": "export-stem-separation",
} as const;

export type LabOperationUiActionId = keyof typeof LAB_OPERATION_UI_ACTION_TO_TRACKED_ACTION;
export type LabTrackedOperationActionId =
  (typeof LAB_OPERATION_UI_ACTION_TO_TRACKED_ACTION)[LabOperationUiActionId];

export function getTrackedOperationActionId(actionId: string | null | undefined) {
  if (!actionId) {
    return null;
  }
  return LAB_OPERATION_UI_ACTION_TO_TRACKED_ACTION[actionId as LabOperationUiActionId] ?? null;
}
