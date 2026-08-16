import test from "node:test";
import assert from "node:assert/strict";

import { getCoverSceneProjection } from "../../src/js/scene/projection.ts";

void test("getCoverSceneProjection keeps cover scaling centered", () => {
  const projection = getCoverSceneProjection({
    surfaceWidth: 1600,
    surfaceHeight: 900,
    referenceWidth: 1280,
    referenceHeight: 720,
  });

  assert.deepEqual(projection, {
    offsetX: 0,
    offsetY: 0,
    scale: 1.25,
  });
});

void test("getCoverSceneProjection keeps vertical overflow centered", () => {
  const projection = getCoverSceneProjection({
    surfaceWidth: 1200,
    surfaceHeight: 900,
    referenceWidth: 1000,
    referenceHeight: 500,
  });

  assert.equal(projection.scale, 1.8);
  assert.equal(projection.offsetX, -300);
  assert.equal(projection.offsetY, 0);
});

void test("getCoverSceneProjection falls back for invalid geometry", () => {
  const projection = getCoverSceneProjection({
    surfaceWidth: 0,
    surfaceHeight: 900,
    referenceWidth: 1000,
    referenceHeight: 500,
  });

  assert.deepEqual(projection, {
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  });
});
