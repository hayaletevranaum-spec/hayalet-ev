import type { SceneLabelFontPreset } from "./schema.js";

const SCENE_HOTSPOT_LABEL_FONT_FAMILIES: Record<SceneLabelFontPreset, string> = {
  display: "var(--font-scene-display)",
  inscription: "var(--font-scene-inscription)",
  classic: "var(--font-scene-classic)",
  sans: "var(--font-scene-sans)",
  rounded: "var(--font-scene-rounded)",
  condensed: "var(--font-scene-condensed)",
  mono: "var(--font-scene-mono)",
};

export function getSceneHotspotLabelFontFamily(fontPreset: SceneLabelFontPreset): string {
  return SCENE_HOTSPOT_LABEL_FONT_FAMILIES[fontPreset];
}
