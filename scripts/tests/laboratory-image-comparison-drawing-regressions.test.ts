import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeLabOperationSettings } from "../../rooms/laboratory/domain/lab-capabilities.ts";

test("comparison drawing tool exposes pen, circle, color, width and clear controls", function () {
  const toolbar = readFileSync(
    new URL("../../rooms/laboratory/ui/lab-image-comparison-toolbar.ts", import.meta.url),
    "utf8"
  );
  const drawingRuntime = readFileSync(
    new URL("../../rooms/laboratory/ui/lab-image-comparison-drawing.ts", import.meta.url),
    "utf8"
  );

  assert.match(toolbar, /id: "draw"/);
  assert.match(toolbar, /label: "Çizim"/);
  assert.match(toolbar, /createLabImageComparisonAnnotationOverlayDataUrl/);
  assert.match(toolbar, /drawingQuickExport/);
  assert.match(toolbar, /annotationOverlayDataUrl/);
  assert.match(drawingRuntime, /data-lab-drawing-action="pen"/);
  assert.match(drawingRuntime, /data-lab-drawing-action="circle"/);
  assert.match(drawingRuntime, /data-lab-drawing-action="clear-active"/);
  assert.match(drawingRuntime, /data-lab-drawing-action="clear-all"/);
  assert.match(drawingRuntime, /type="color"/);
  assert.match(drawingRuntime, /type="range"/);
  assert.match(drawingRuntime, /getScreenCTM/);
  assert.match(drawingRuntime, /canvas\.toDataURL\("image\/png"\)/);
});

test("comparison drawing quick export keeps the annotation overlay transient and emits one PNG", function () {
  const annotationExport = readFileSync(
    new URL(
      "../../rooms/laboratory/features/media-analysis/host/action-handlers-annotation-export.ts",
      import.meta.url
    ),
    "utf8"
  );
  const actionHandlers = readFileSync(
    new URL(
      "../../rooms/laboratory/features/media-analysis/host/action-handlers.ts",
      import.meta.url
    ),
    "utf8"
  );
  const capabilities = readFileSync(
    new URL("../../rooms/laboratory/domain/lab-capabilities.ts", import.meta.url),
    "utf8"
  );

  const normalized = normalizeLabOperationSettings("image-comparison", {
    drawingQuickExport: true,
    annotationOverlayDataUrl: "data:image/png;base64,AAAA",
  });

  assert.equal(normalized["drawingQuickExport"], true);
  assert.equal(normalized["annotationOverlayDataUrl"], "data:image/png;base64,AAAA");
  assert.match(capabilities, /readTransientPngDataUrl/);
  assert.match(annotationExport, /drawingQuickExport/);
  assert.match(annotationExport, /fmTempPath/);
  assert.match(annotationExport, /fmWriteFileAtomic/);
  assert.match(annotationExport, /commandCleanupTemp/);
  assert.match(annotationExport, /hstack=inputs=2/);
  assert.match(annotationExport, /overlay=0:0:format=auto/);
  assert.match(annotationExport, /comparison-side-by-side-/);
  assert.match(annotationExport, /delete settingsUsed\["annotationOverlayDataUrl"\]/);
  assert.match(actionHandlers, /createMediaAnnotationExportActionRuntime/);
  assert.match(actionHandlers, /\.\.\.mediaAnnotationExportActionRuntime/);
});
