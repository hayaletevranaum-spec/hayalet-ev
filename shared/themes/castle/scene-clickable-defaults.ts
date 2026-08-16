export const SCENE_CLICKABLE_DEFAULTS =
{
  "object": {
    "glowHueShiftDeg": 120,
    "glowAlphaScale": 2.5,
    "frame": {
      "depthRem": 18,
      "insetRem": 0.4,
      "borderAlpha": 0.54,
      "innerRingAlpha": 0.73,
      "liftPx": 2,
      "shadowYPx": 84,
      "shadowBlurPx": 108
    },
    "label": {
      "visible": true,
      "fontPresetOverride": "display",
      "fontScale": 1,
      "trackingScale": 1,
      "padYRem": 1,
      "padXRem": 0.42,
      "borderAlpha": 0,
      "backgroundAlpha": 0,
      "activeBackgroundAlpha": 0,
      "activeRingAlpha": 0
    }
  },
  "back": {
    "glowHueShiftDeg": 110,
    "glowAlphaScale": 1,
    "arrowShiftRem": 0.2,
    "label": {
      "visible": true,
      "fontPresetOverride": null,
      "fontScale": 1.8,
      "trackingScale": 1,
      "padYRem": 0.3,
      "padXRem": 0.72,
      "borderAlpha": 0.18,
      "backgroundAlpha": 0.92,
      "activeBackgroundAlpha": 0,
      "activeRingAlpha": 0
    }
  }
} as const;
