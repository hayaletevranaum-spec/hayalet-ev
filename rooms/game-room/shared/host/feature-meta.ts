export const ROOM_ID = "game-room";
export const PAGE_ID = "room:game-room:backgammon";
export const FEATURE_ID = "backgammon";
export const TEAM_TETRIS_FEATURE_ID = "team-tetris";
export const TEAM_TETRIS_PAGE_ID = "room:game-room:team-tetris";

interface FeatureCatalogEntry {
  id: string;
  name: string;
  description?: string;
}

const FEATURE_CATALOG: FeatureCatalogEntry[] = [
  {
    id: FEATURE_ID,
    name: "Tavla",
  },
  {
    id: TEAM_TETRIS_FEATURE_ID,
    name: "Team Tetris",
  },
];

export function getFeatureName(featureId: string): string {
  const feature = FEATURE_CATALOG.find((entry) => entry.id === featureId);
  return feature ? feature.name : "Tavla";
}

export function normalizeFeatureId(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  return FEATURE_CATALOG.some((entry) => entry.id === normalized) ? normalized : FEATURE_ID;
}

export function sanitizeFeatureRecord(
  candidate: unknown,
  fallbackId: string
): { id: string; name: string; description: string } {
  const source =
    candidate && typeof candidate === "object" && Array.isArray(candidate) === false
      ? (candidate as Record<string, unknown>)
      : {};
  const featureId = normalizeFeatureId(source["id"] ?? fallbackId);
  const name =
    typeof source["name"] === "string" && source["name"].trim() !== ""
      ? source["name"].trim()
      : getFeatureName(featureId);
  const description = typeof source["description"] === "string" ? source["description"].trim() : "";

  return {
    id: featureId,
    name,
    description,
  };
}

export function getDefaultFeatureRecords(): Array<{
  id: string;
  name: string;
  description: string;
}> {
  return FEATURE_CATALOG.map((feature) => sanitizeFeatureRecord(feature, feature.id));
}
