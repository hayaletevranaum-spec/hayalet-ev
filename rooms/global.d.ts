interface RoomApiBridge {
  ready?: (payload: Record<string, unknown>) => void;
  onHostMessage?: (handler: (message: Record<string, unknown>) => void) => void;
  sendCommand?: (command: string, payload?: Record<string, unknown>) => boolean;
  sendEvent?: (type: string, payload?: Record<string, unknown>) => boolean;
  close?: () => boolean;
}

interface Window {
  GameRoomUiFactories?: GameRoomUiFactoriesRegistry;
  GameRoomUiContextRuntime?: GameRoomUiContextRuntimeRegistry;
  GameRoomUiFeatureContract?: GameRoomUiFeatureContractLike;
  GameRoomUiScrollRuntime?: GameRoomUiScrollRuntimeRegistry;
  GameRoomUiRuntime?: GameRoomUiRuntimeRegistry;
  __gameRoomTeamTetrisTest__?: Record<string, unknown>;
  roomAPI?: RoomApiBridge;
  electronAPI?: Record<string, unknown>;
  webkitAudioContext?: typeof AudioContext;
}
