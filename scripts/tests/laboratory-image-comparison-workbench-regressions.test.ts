import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeLabOperationSettings } from "../../rooms/laboratory/domain/lab-capabilities.ts";
import {
  buildLabFaceAlignmentAnchors,
  buildLabFaceLandmarkMetrics,
} from "../../rooms/laboratory/domain/lab-face-landmark-geometry.ts";
import type { LabFaceLandmarkPoint } from "../../rooms/laboratory/domain/lab-face-landmark-geometry.ts";
import { LAB_OPERATION_SETTINGS_FIELDS } from "../../rooms/laboratory/domain/lab-operation-settings.ts";
import {
  buildImageComparisonTransformCss,
  getImageComparisonMarkerMetrics,
  readImageComparisonGeometry,
} from "../../rooms/laboratory/domain/lab-image-comparison-workbench.ts";
import { renderLabSettingsFields } from "../../rooms/laboratory/ui/lab-settings-controls.ts";

function buildSyntheticFaceLandmarks() {
  const points: LabFaceLandmarkPoint[] = Array.from({ length: 478 }, function () {
    return { x: 0.5, y: 0.5, z: 0 };
  });
  const set = function (index: number, x: number, y: number) {
    points[index] = { x, y, z: 0 };
  };
  set(10, 0.5, 0.1);
  set(152, 0.5, 0.9);
  set(234, 0.2, 0.5);
  set(454, 0.8, 0.5);
  set(33, 0.32, 0.35);
  set(133, 0.42, 0.35);
  set(362, 0.58, 0.35);
  set(263, 0.68, 0.35);
  set(159, 0.37, 0.34);
  set(386, 0.63, 0.34);
  set(105, 0.37, 0.29);
  set(334, 0.63, 0.29);
  set(168, 0.5, 0.38);
  set(1, 0.5, 0.52);
  set(2, 0.5, 0.58);
  set(98, 0.46, 0.54);
  set(327, 0.54, 0.54);
  set(61, 0.42, 0.66);
  set(291, 0.58, 0.66);
  set(13, 0.5, 0.64);
  set(14, 0.5, 0.68);
  set(172, 0.3, 0.72);
  set(397, 0.7, 0.72);
  return points;
}

test("image comparison settings expose independent A/B geometry and half-face composition", function () {
  const settings = normalizeLabOperationSettings("image-comparison", {
    primaryZoom: 2,
    primaryAspectLock: true,
    primaryScaleX: 3,
    primaryScaleY: 0.5,
    primaryOffsetX: 12,
    primaryOffsetY: -8,
    primaryRotation: 4,
    referenceZoom: 1.25,
    referenceAspectLock: false,
    referenceScaleX: 1.2,
    referenceScaleY: 0.8,
    compositeMode: "reference-left-primary-right",
    showImageFrames: false,
  });
  const geometry = readImageComparisonGeometry(settings);

  assert.equal(geometry.compositeMode, "reference-left-primary-right");
  assert.equal(settings["showImageFrames"], false);
  assert.equal(geometry.transforms.primary.aspectLocked, true);
  assert.equal(geometry.transforms.reference.aspectLocked, false);
  assert.match(buildImageComparisonTransformCss(geometry.transforms.primary), /scale\(6, 6\)/);
  assert.match(buildImageComparisonTransformCss(geometry.transforms.primary), /translate\(12%, -8%\)/);
  assert.match(buildImageComparisonTransformCss(geometry.transforms.primary), /rotate\(4deg\)/);
  assert.match(buildImageComparisonTransformCss(geometry.transforms.reference), /scale\(1\.5, 1\)/);
});

test("manual comparison markers produce normalized geometry without identity scoring", function () {
  const settings = normalizeLabOperationSettings("image-comparison", {
    marker1Enabled: true,
    marker1Side: "primary",
    marker1X: 10,
    marker1Y: 10,
    marker2Enabled: true,
    marker2Side: "primary",
    marker2X: 40,
    marker2Y: 50,
    marker3Enabled: true,
    marker3Side: "primary",
    marker3X: 70,
    marker3Y: 10,
    referenceZoom: 1,
  });
  const metrics = getImageComparisonMarkerMetrics(settings);

  assert.equal(metrics.primary.count, 3);
  assert.equal(Number(metrics.primary.d12?.toFixed(2)), 50);
  assert.equal(Number(metrics.primary.d23?.toFixed(2)), 50);
  assert.equal(Number(metrics.primary.d13?.toFixed(2)), 60);
  assert.equal(metrics.reference.count, 0);
});

test("face landmarks produce geometry ratios and alignment anchors without identity scoring", function () {
  const landmarks = buildSyntheticFaceLandmarks();
  const metrics = buildLabFaceLandmarkMetrics(landmarks, 1000, 1000);
  const anchors = buildLabFaceAlignmentAnchors(landmarks, 1000, 1000);

  assert.ok(metrics);
  assert.ok(anchors);
  assert.equal(metrics.faceAspectRatio, 0.75);
  assert.equal(Number(metrics.interEyePercent.toFixed(3)), 43.333);
  assert.equal(Number(metrics.mouthWidthPercent.toFixed(3)), 26.667);
  assert.equal(metrics.eyeLineAngleDeg, 0);
  assert.equal(metrics.faceAxisAngleDeg, 0);
  assert.equal(metrics.symmetryDeltaPercent, 0);
  assert.equal(Number(anchors.eyeMidpoint.x.toFixed(3)), 0.5);
  assert.equal(Number(anchors.eyeMidpoint.y.toFixed(3)), 0.35);
  assert.equal(anchors.eyeLineAngleDeg, 0);
});

test("comparison settings expose separate precision blocks for move resize and zoom", function () {
  const settings = normalizeLabOperationSettings("image-comparison", {
    showImageFrames: false,
  });
  const markup = renderLabSettingsFields({
    fields: LAB_OPERATION_SETTINGS_FIELDS["image-comparison"],
    prefix: "operationSettings.image-comparison",
    resetAction: "operation-settings-reset",
    resetValue: "image-comparison",
    settings,
    title: "Settings",
    variant: "inline",
  });

  assert.match(markup, /data-comparison-tool-panel="move"/);
  assert.match(markup, /data-comparison-tool-panel="resize"/);
  assert.match(markup, /data-comparison-tool-panel="zoom"/);
  assert.match(markup, /primaryOffsetX/);
  assert.match(markup, /referenceScaleY/);
  assert.match(markup, /primaryZoom/);
  assert.match(markup, /referenceZoom/);
  assert.match(markup, /showImageFrames/);
  assert.doesNotMatch(markup, /showImageFrames"[^>]*checked/);
  assert.doesNotMatch(markup, /data-lab-comparison-tool-mode/);
});

test("comparison renderer keeps transforms declarative and shares them with face overlays", function () {
  const surface = readFileSync(
    new URL("../../rooms/laboratory/ui/workspace-surface.ts", import.meta.url),
    "utf8"
  );
  const operationSettings = readFileSync(
    new URL("../../rooms/laboratory/domain/lab-operation-settings.ts", import.meta.url),
    "utf8"
  );
  const styles = readFileSync(
    new URL(
      "../../rooms/laboratory/ui/styles/lab-image-comparison-tools.css",
      import.meta.url
    ),
    "utf8"
  );
  const controls = readFileSync(
    new URL("../../rooms/laboratory/ui/workspace-operation-controls.ts", import.meta.url),
    "utf8"
  );
  const mouseTools = readFileSync(
    new URL("../../rooms/laboratory/ui/lab-image-comparison-mouse-tools.ts", import.meta.url),
    "utf8"
  );
  const toolbar = readFileSync(
    new URL("../../rooms/laboratory/ui/lab-image-comparison-toolbar.ts", import.meta.url),
    "utf8"
  );
  const faceRuntime = readFileSync(
    new URL("../../rooms/laboratory/ui/lab-face-landmark-runtime.ts", import.meta.url),
    "utf8"
  );

  assert.match(surface, /buildImageComparisonTransformCss/);
  assert.match(surface, /--lab-comparison-primary-transform/);
  assert.match(surface, /--lab-comparison-reference-transform/);
  assert.match(surface, /data-composite-mode=/);
  assert.match(surface, /labx-workspace-comparison__image--left/);
  assert.match(surface, /labx-workspace-comparison__marker/);
  assert.match(surface, /toolSettings: imageComparisonSettings/);
  assert.doesNotMatch(surface, /data-comparison-transform/);
  assert.match(operationSettings, /primaryAspectLock/);
  assert.match(operationSettings, /referenceAspectLock/);
  assert.match(operationSettings, /primaryOffsetX/);
  assert.match(operationSettings, /referenceRotation/);
  assert.match(operationSettings, /primary-left-reference-right/);
  assert.match(operationSettings, /reference-left-primary-right/);
  assert.match(operationSettings, /marker3Y/);
  assert.match(styles, /labx-workspace-comparison__center-guide/);
  assert.match(styles, /labx-operation-card__geometry-metrics/);
  assert.match(styles, /showImageFrames/);
  assert.match(styles, /data-comparison-tool="move"/);
  assert.match(styles, /data-comparison-tool="resize"/);
  assert.match(styles, /data-comparison-tool="zoom"/);
  assert.match(styles, /data-comparison-tool="face-landmarks"/);
  assert.match(styles, /workspace-comparison-primary/);
  assert.match(styles, /workspace-comparison-reference/);
  assert.match(styles, /var\(--lab-comparison-primary-transform, none\)/);
  assert.match(styles, /var\(--lab-comparison-reference-transform, none\)/);
  assert.match(styles, /labx-face-landmark-overlay\[data-side="primary"\]/);
  assert.match(styles, /labx-face-landmark-overlay\[data-side="reference"\]/);
  assert.match(controls, /data-lab-comparison-manual-metrics/);
  assert.match(controls, /kimlik doğrulama skoru değildir/);
  assert.match(mouseTools, /getActiveLabImageComparisonToolbarTool/);
  assert.match(mouseTools, /handleWheel/);
  assert.match(mouseTools, /activeTool !== "move"/);
  assert.doesNotMatch(mouseTools, /data-comparison-transform/);
  assert.doesNotMatch(mouseTools, /image\.style\.transform/);
  assert.doesNotMatch(mouseTools, /labx-face-landmark-overlay/);
  assert.doesNotMatch(mouseTools, /MutationObserver/);
  assert.match(toolbar, /label: "Taşı"/);
  assert.match(toolbar, /label: "Boyutlandır"/);
  assert.match(toolbar, /label: "Yakınlaştır"/);
  assert.match(toolbar, /label: "Yüz Landmark"/);
  assert.match(toolbar, /data-lab-comparison-toolbar-tool/);
  assert.match(toolbar, /workspace-comparison-moment-capture/);
  assert.doesNotMatch(toolbar, /workspace-image-comparison-export/);
  assert.match(toolbar, /Yan Yana Dışa Aktar/);
  assert.match(toolbar, /single-image/);
  assert.match(toolbar, /WORKSPACE_TIMELINE_SELECTOR/);
  assert.match(toolbar, /singleImageSuppressedTimelines/);
  assert.match(toolbar, /timeline\.hidden = true/);
  assert.match(faceRuntime, /MEDIAPIPE_VERSION = "1\.0\.0"/);
  assert.match(faceRuntime, /FaceLandmarker\.createFromOptions|createFromOptions\(fileset/);
  assert.match(faceRuntime, /runningMode: "IMAGE"/);
  assert.match(faceRuntime, /numFaces: 1/);
  assert.match(faceRuntime, /data-lab-face-landmark-action="align-eyes"/);
  assert.match(faceRuntime, /kimlik doğrulama veya “aynı kişi” skoru değildir/);
  assert.doesNotMatch(faceRuntime, /svg\.style\.transform\s*=/);
});
