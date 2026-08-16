import analyzeMap from "./maps/analyze.scene.json";
import assistantMap from "./maps/assistant.scene.json";
import entranceMap from "./maps/entrance.scene.json";
import roomsMap from "./maps/rooms.scene.json";
import serverMap from "./maps/server.scene.json";
import settingsMap from "./maps/settings.scene.json";

export const CASTLE_SCENE_THEME_ID = "castle";

export const CASTLE_SCENE_LAYOUTS = {
  entrance: entranceMap,
  analyze: analyzeMap,
  assistant: assistantMap,
  server: serverMap,
  rooms: roomsMap,
  settings: settingsMap,
} as const;
