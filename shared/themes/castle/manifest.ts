import analyzeArchivePanel from "./assets/analyze/analyze_archive.webp";
import analyzeBackground from "./assets/analyze/analyze_main_bg.webp";
import analyzeTablePanel from "./assets/analyze/analyze_table.webp";
import assistantBackground from "./assets/assistant/assistant_bg_main.webp";
import assistantScreen from "./assets/assistant/assistant_screen.webp";
import aiBodyBase from "./assets/characters/ai/ai_body_base.webp";
import assistantBodyBase from "./assets/characters/assistant/assistant_body_base.webp";
import humanBodyBase from "./assets/characters/human/human_body_base.webp";
import userBodyBase from "./assets/characters/user/user_body_base.webp";
import entranceBackground from "./assets/entrance/entrance_bg_main.webp";
import entranceWhisperBackground from "./assets/entrance/entrance_whisper.webp";
import loadingDoor01 from "./assets/loading/loading_door_01.webp";
import loadingDoor02 from "./assets/loading/loading_door_02.webp";
import loadingDoor03 from "./assets/loading/loading_door_03.webp";
import loadingDoor04 from "./assets/loading/loading_door_04.webp";
import roomsBackground from "./assets/rooms/rooms_bg_main.webp";
import serverBackground from "./assets/server/server_bg_main.webp";
import serverTerminalPanel from "./assets/server/server_terminal.webp";
import settingsAccountsPanel from "./assets/settings/settings_accounts.webp";
import settingsBackupPanel from "./assets/settings/settings_backup.webp";
import settingsBackground from "./assets/settings/settings_bg_main.webp";
import settingsLogViewPanel from "./assets/settings/settings_log_view.webp";
import settingsRoomsPanel from "./assets/settings/settings_rooms.webp";
import settingsThemePanel from "./assets/settings/settings_theme.webp";
import settingsTranslatePanel from "./assets/settings/settings_translate.webp";
import { SCENE_CLICKABLE_DEFAULTS } from "./scene-clickable-defaults.js";
import { CASTLE_SCENE_LAYOUTS, CASTLE_SCENE_THEME_ID } from "./scene-layouts.js";

export const CASTLE_THEME_SOURCE = {
  themeId: CASTLE_SCENE_THEME_ID,
  loading: {
    frameDurationMs: 180,
    frames: [loadingDoor01, loadingDoor02, loadingDoor03, loadingDoor04],
  },
  characters: {
    roles: {
      ai: {
        bodySrc: aiBodyBase,
        bodyScale: 0.8,
        headTopPct: 31,
        headLeftPct: 50,
        headSizePct: 60,
        avatarScale: 1,
      },
      assistant: {
        bodySrc: assistantBodyBase,
        bodyScale: 0.8,
        headTopPct: 33,
        headLeftPct: 50,
        headSizePct: 38,
        avatarScale: 1,
      },
      human: {
        bodySrc: humanBodyBase,
        bodyScale: 1.2,
        headTopPct: 16,
        headLeftPct: 50,
        headSizePct: 70,
        avatarScale: 1,
      },
      user: {
        bodySrc: userBodyBase,
        bodyScale: 1.2,
        headTopPct: 13,
        headLeftPct: 50,
        headSizePct: 25,
        avatarScale: 1,
      },
    },
    fallbackRole: "ai",
  },
  clickableDefaults: SCENE_CLICKABLE_DEFAULTS,
  rooms: {
    entrance: {
      backgroundSrc: entranceBackground,
      views: {
        whisper: {
          backgroundSrc: entranceWhisperBackground,
        },
      },
    },
    analyze: {
      backgroundSrc: analyzeBackground,
      panels: {
        archive: analyzeArchivePanel,
        table: analyzeTablePanel,
      },
    },
    assistant: {
      backgroundSrc: assistantBackground,
      views: {
        primary: {
          panelArtSrc: assistantScreen,
        },
      },
    },
    server: {
      backgroundSrc: serverBackground,
      views: {
        primary: {
          panelArtSrc: serverTerminalPanel,
        },
      },
    },
    rooms: {
      backgroundSrc: roomsBackground,
    },
    settings: {
      backgroundSrc: settingsBackground,
      panels: {
        theme: settingsThemePanel,
        accounts: settingsAccountsPanel,
        capture: settingsLogViewPanel,
        backup: settingsBackupPanel,
        rooms: settingsRoomsPanel,
        "live-log": settingsLogViewPanel,
        languages: settingsTranslatePanel,
      },
    },
  },
  maps: CASTLE_SCENE_LAYOUTS,
} as const;
