/* global window */

(function (global: GameRoomUiGlobal) {
  const registry: GameRoomUiFeatureContractLike =
    global.GameRoomUiFeatureContract || (global.GameRoomUiFeatureContract = {});

  const FEATURE_ID = "backgammon";
  const TEAM_TETRIS_FEATURE_ID = "team-tetris";

  const FEATURE_RECORDS: GameRoomFeatureRecord[] = [
    {
      id: FEATURE_ID,
      name: "Tavla",
      description: "",
    },
    {
      id: TEAM_TETRIS_FEATURE_ID,
      name: "Team Tetris",
      description: "",
    },
  ];

  const BOOTSTRAP_COPY: GameRoomBootstrapCopy = {
    en: {
      roomTitle: "Game Room",
      loadingTitle: "Loading Game Room",
      loadingBody: "Waiting for room context and translations.",
      userLabel: "User",
      roomApiUnavailable: "Room API bridge is not connected.",
      commandSendFailed: "The command could not be sent to the room host.",
    },
    tr: {
      roomTitle: "Oyun Odasi",
      loadingTitle: "Oyun Odasi Yukleniyor",
      loadingBody: "Oda baglami ve ceviriler bekleniyor.",
      userLabel: "Kullanici",
      roomApiUnavailable: "Room API koprusu bagli degil.",
      commandSendFailed: "Komut oda host'una gonderilemedi.",
    },
  };

  function cloneFeatureRecords(): GameRoomFeatureRecord[] {
    return FEATURE_RECORDS.map((feature) => ({ ...feature }));
  }

  function cloneBootstrapCopy(): GameRoomBootstrapCopy {
    return {
      en: { ...BOOTSTRAP_COPY["en"] },
      tr: { ...BOOTSTRAP_COPY["tr"] },
    };
  }

  registry.ROOM_ID = "game-room";
  registry.FEATURE_ID = FEATURE_ID;
  registry.TEAM_TETRIS_FEATURE_ID = TEAM_TETRIS_FEATURE_ID;
  registry.getFeatureRecords = function getFeatureRecords() {
    return cloneFeatureRecords();
  };
  registry.getBootstrapCopy = function getBootstrapCopy() {
    return cloneBootstrapCopy();
  };
})(window as unknown as GameRoomUiGlobal);
