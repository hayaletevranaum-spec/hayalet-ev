type GameRoomUnknownRecord = Record<string, unknown>;

type GameRoomTextResolver = (path: string[], fallback?: string) => string;
type GameRoomCreateElement = (
  tagName: string,
  className?: string | null,
  textContent?: string
) => HTMLElement;
type GameRoomSendRoomCommand = (command: string, payload: GameRoomUnknownRecord) => unknown;
type GameRoomUiGetState = () => GameRoomUiState;
type GameRoomFeatureRecord = { id: string; name: string; description: string };
type GameRoomBootstrapCopy = Record<string, Record<string, string>>;

interface GameRoomSlotRecord extends GameRoomUnknownRecord {
  label?: string;
  nickname?: string;
  avatar?: string | null;
  providerId?: string | null;
  accountId?: string | null;
  remoteUserId?: string;
  connected?: boolean;
}

interface GameRoomUiContextState extends GameRoomUnknownRecord {
  activeFeature?: {
    id?: unknown;
  } | null;
  features?: GameRoomFeatureRecord[] | null;
  room: {
    name: string;
  };
  user?: {
    nickname?: unknown;
    avatar?: unknown;
  };
  slots?: Record<string, GameRoomSlotRecord | GameRoomUnknownRecord>;
}

type GameRoomTeamTetrisRotationCell = [number, number];

interface GameRoomTeamTetrisCell {
  x: number;
  y: number;
}

interface GameRoomTeamTetrisPieceBounds {
  width: number;
  height: number;
}

interface GameRoomTeamTetrisBoardDefinition extends GameRoomUnknownRecord {
  width: number;
  height: number;
  seedLabel: string;
}

interface GameRoomTeamTetrisPieceSnapshot extends GameRoomUnknownRecord {
  pieceId: string;
  rotation: number;
  cells: GameRoomTeamTetrisCell[];
  placedBySeatId: string;
  placedByRole: string;
  placedBy: string;
}

interface GameRoomTeamTetrisBoardState extends GameRoomUnknownRecord {
  teamId: string;
  visibility: string;
  rows: string[];
  boardBeforePartnerPieceRows: string[];
  partnerLastPiece: GameRoomTeamTetrisPieceSnapshot | null;
}

interface GameRoomTeamTetrisBoardViewState extends GameRoomTeamTetrisBoardState {
  label: string;
}

interface GameRoomTeamTetrisRequiredSlots extends GameRoomUnknownRecord {
  ai1: boolean;
  ai2: boolean;
  us1: boolean;
}

interface GameRoomTeamTetrisTeamRecord extends GameRoomUnknownRecord {
  teamId: string;
  seatIds: string[];
}

interface GameRoomTeamTetrisTurnState extends GameRoomUnknownRecord {
  turnIndex: number;
  seatId: string;
  teamId: string;
  role: string;
  pieceId: string;
  legalRotations: number[];
  turnToken: string;
}

interface GameRoomTeamTetrisPendingTurn extends GameRoomUnknownRecord {
  turnIndex: number;
  turnToken: string;
  pieceId: string;
  legalRotations: number[];
  actingRole: string;
}

interface GameRoomTeamTetrisSeatViewSeat extends GameRoomUnknownRecord {
  seatId: string;
  teamId: string;
  role: string;
}

interface GameRoomTeamTetrisSeatTeamView extends GameRoomUnknownRecord {
  teamId: string;
  boardRows: string[];
  boardBeforePartnerPieceRows: string[];
  partnerLastPiece: GameRoomTeamTetrisPieceSnapshot | null;
}

interface GameRoomTeamTetrisSeatOpponentView extends GameRoomUnknownRecord {
  teamId: string;
  boardRows: string[];
}

interface GameRoomTeamTetrisSeatView extends GameRoomUnknownRecord {
  schemaVersion: number;
  matchId: string;
  seat: GameRoomTeamTetrisSeatViewSeat;
  hiddenPairs: boolean;
  revealedPairs: boolean;
  result: string;
  winnerTeamId: string | null;
  teams: GameRoomTeamTetrisTeamRecord[] | null;
  ownTeam: GameRoomTeamTetrisSeatTeamView;
  opponentTeam: GameRoomTeamTetrisSeatOpponentView;
  pendingTurn: GameRoomTeamTetrisPendingTurn | null;
}

interface GameRoomTeamTetrisDraftPreview extends GameRoomUnknownRecord {
  success: true;
  x: number;
  y: number;
  rotation: number;
  cells: GameRoomTeamTetrisCell[];
  pathCells: GameRoomTeamTetrisCell[];
  pathComplete: boolean;
  autoDropDistance: number;
  blockedReason?: string;
  stepIndex?: number;
}

interface GameRoomTeamTetrisDraftReplayFailure extends GameRoomUnknownRecord {
  success: false;
  reason: string;
  stepIndex?: number;
  x?: number;
  y?: number;
  rotation?: number;
  cells?: GameRoomTeamTetrisCell[];
  pathCells?: GameRoomTeamTetrisCell[];
  pathComplete?: boolean;
  autoDropDistance?: number;
  blockedReason?: string;
}

type GameRoomTeamTetrisDraftReplayResult =
  GameRoomTeamTetrisDraftPreview | GameRoomTeamTetrisDraftReplayFailure;

type GameRoomTeamTetrisDraftStage = "positioning" | "route";
type GameRoomTeamTetrisRouteMode = "straight" | "bend-left" | "bend-right";
type GameRoomTeamTetrisInteractionMode = "positioning" | "route-row-picker" | "preview";

interface GameRoomTeamTetrisDraftState extends GameRoomUnknownRecord {
  matchId: string;
  turnIndex: number | null;
  turnToken: string;
  pieceId: string;
  rotation: number;
  rowShifts: number[];
  dragTargets: Record<number, number>;
  preview: GameRoomTeamTetrisDraftReplayResult | null;
  errorKey: string;
  dragActive: boolean;
  stage: GameRoomTeamTetrisDraftStage;
  stagedOriginX: number;
  routeMode: GameRoomTeamTetrisRouteMode;
  bendRow: number | null;
  interactionMode: GameRoomTeamTetrisInteractionMode;
}

interface GameRoomTeamTetrisState extends GameRoomUnknownRecord {
  active: boolean;
  result: string;
  hiddenPairs: boolean;
  revealPairsOnFinish: boolean;
  blockedReason: string;
  matchId: string | null;
  canStart: boolean;
  requiredSlots: GameRoomTeamTetrisRequiredSlots;
  board: GameRoomTeamTetrisBoardDefinition;
  boards: GameRoomTeamTetrisBoardState[];
  turnLoop: string[];
  currentTurn: GameRoomTeamTetrisTurnState | null;
  teams: GameRoomTeamTetrisTeamRecord[] | null;
  userView: GameRoomTeamTetrisSeatView | null;
  status: string;
}

interface GameRoomUiState extends GameRoomUnknownRecord {
  locale: string;
  translations: GameRoomUnknownRecord | null;
  context: GameRoomUiContextState;
  game?: unknown;
  teamTetris: GameRoomTeamTetrisState;
  teamTetrisDraft: GameRoomTeamTetrisDraftState;
  presentation: GameRoomUnknownRecord & {
    mode?: string;
    uiScale?: number;
  };
  preferences: GameRoomUnknownRecord & {
    target: string;
    teamTetrisHiddenPairs?: boolean;
    teamTetrisSelectedPartnerSeatId?: string | null;
  };
  lastCommandMessage: string;
}

interface GameRoomUiContextRuntimeLike {
  readPath(source: unknown, path: string[]): string | null;
  normalizePresentationMode(value: unknown): string;
  normalizeUiScale(value: unknown): number;
  resolveLocale(value: unknown): string;
  createContext(): GameRoomUiContextState;
  createSlot(...args: unknown[]): unknown;
  createInviteEntry(...args: unknown[]): unknown;
  normalizeSlot(...args: unknown[]): unknown;
  createElement: GameRoomCreateElement;
  normalizeContext(message: unknown): GameRoomUiContextState;
}

interface GameRoomUiScrollRuntimeLike {
  capture(root: HTMLElement): unknown;
  restore(root: HTMLElement, scrollState: unknown): void;
}

interface GameRoomUiFeatureContractLike {
  ROOM_ID?: unknown;
  FEATURE_ID?: unknown;
  TEAM_TETRIS_FEATURE_ID?: unknown;
  getBootstrapCopy?(): GameRoomBootstrapCopy;
  getFeatureRecords?(): GameRoomFeatureRecord[];
}

interface GameRoomBackgammonUiModule {
  createGameState(): unknown;
  renderBootstrap(root: HTMLElement): void;
  renderBackgammon(root: HTMLElement): void;
  sanitizeGameState?(candidate: unknown): unknown;
  syncPreferencesFromGame?(): void;
}

interface GameRoomTeamTetrisUiModule {
  createTeamTetrisState(): GameRoomTeamTetrisState;
  createTeamTetrisDraft(): GameRoomTeamTetrisDraftState;
  renderTeamTetris(root: HTMLElement): void;
  getTestBridge(): GameRoomTeamTetrisUiTestBridge;
  sanitizeTeamTetrisState(candidate: unknown): GameRoomTeamTetrisState;
  syncTeamTetrisPreferencesFromState(): void;
  syncTeamTetrisDraftFromState(): void;
}

interface GameRoomBackgammonUiModuleDeps extends GameRoomUnknownRecord {
  getState: GameRoomUiGetState;
  roomId: string;
  featureId: string;
  createSlot(...args: unknown[]): unknown;
  createInviteEntry(...args: unknown[]): unknown;
  normalizeSlot(...args: unknown[]): unknown;
  bootstrapText(key: string): string;
  text: GameRoomTextResolver;
  statusText(key: string): string;
  createElement: GameRoomCreateElement;
  render(): void;
  sendRoomCommand: GameRoomSendRoomCommand;
  isRoomApiAvailable(): boolean;
  getFeatureLabel(featureId: string): string;
}

interface GameRoomTeamTetrisUiModuleDeps extends GameRoomUnknownRecord {
  getState: GameRoomUiGetState;
  featureId: string;
  createSlot(...args: unknown[]): unknown;
  createElement: GameRoomCreateElement;
  text: GameRoomTextResolver;
  render(): void;
  sendRoomCommand: GameRoomSendRoomCommand;
  getFeatureLabel(featureId: string): string;
}

interface GameRoomTeamTetrisUiStateShapeRuntime {
  createTeamTetrisBoard(teamId: string, visibility: string): GameRoomTeamTetrisBoardState;
  createTeamTetrisDraft(): GameRoomTeamTetrisDraftState;
  createTeamTetrisState(): GameRoomTeamTetrisState;
  sanitizeTeamTetrisRows(rows: unknown): string[];
  sanitizeTeamTetrisState(candidate: unknown): GameRoomTeamTetrisState;
}

interface GameRoomTeamTetrisUiStateViewRuntimeDeps {
  getState: GameRoomUiGetState;
  text: GameRoomTextResolver;
  createTeamTetrisBoard(teamId: string, visibility: string): GameRoomTeamTetrisBoardState;
}

interface GameRoomTeamTetrisPlayerDisplay {
  avatarUrl: string | null;
  label: string;
  isAnonymous: boolean;
}

interface GameRoomTeamTetrisUiStateViewRuntime {
  syncTeamTetrisPreferencesFromState(): void;
  getTeamTetrisView(): GameRoomTeamTetrisSeatView | null;
  getTeamTetrisBoardLabel(teamId: string): string;
  getTeamTetrisSeatDisplayLabel(seatId: string): string;
  getTeamTetrisPlayerDisplay(seatId: string): GameRoomTeamTetrisPlayerDisplay;
  getTeamTetrisPendingTurn(): GameRoomTeamTetrisPendingTurn | null;
  getTeamTetrisOwnBoardState(): GameRoomTeamTetrisBoardViewState;
  getTeamTetrisOpponentBoardState(): GameRoomTeamTetrisBoardViewState;
  getTeamTetrisPlacedByLabel(
    pieceSnapshot: GameRoomTeamTetrisPieceSnapshot | null | undefined
  ): string;
  getTeamTetrisPartnerRoleLabel(): string;
  getTeamTetrisTurnLabel(): string;
  getTeamTetrisResultLabel(): string;
  getTeamTetrisDraftStatusText(): string;
  getTeamTetrisStatusText(): string;
}

interface GameRoomTeamTetrisUiDraftRuntimeDeps {
  createTeamTetrisDraft(): GameRoomTeamTetrisDraftState;
  getState: GameRoomUiGetState;
  render(): void;
  sendRoomCommand: GameRoomSendRoomCommand;
  sanitizeTeamTetrisRows(rows: unknown): string[];
  getTeamTetrisOwnBoardState(): GameRoomTeamTetrisBoardViewState;
  getTeamTetrisPendingTurn(): GameRoomTeamTetrisPendingTurn | null;
}

interface GameRoomTeamTetrisUiDraftRuntime {
  getTeamTetrisRotationCells(pieceId: string, rotation: number): GameRoomTeamTetrisRotationCell[];
  getTeamTetrisPieceBounds(pieceId: string, rotation: number): GameRoomTeamTetrisPieceBounds;
  getTeamTetrisSpawnPosition(pieceId: string, rotation: number): GameRoomTeamTetrisCell;
  replayTeamTetrisDraft(
    rows: string[],
    pieceId: string,
    rotation: number,
    rowShifts: number[]
  ): GameRoomTeamTetrisDraftReplayResult;
  compileStageToRowShifts(
    stagedOriginX: number,
    rotation: number,
    pieceId: string,
    routeMode: GameRoomTeamTetrisRouteMode,
    bendRow: number | null
  ): number[];
  buildTeamTetrisRowShiftsFromTargets(
    pieceId: string,
    rotation: number,
    dragTargets: Record<number, number>
  ): number[];
  getTeamTetrisOriginFromCell(pieceId: string, rotation: number, cellX: number): number;
  syncTeamTetrisDraftFromState(): void;
  startTeamTetrisDrag(cellX: number, cellY: number): void;
  updateTeamTetrisDraftTarget(cellX: number, cellY: number): void;
  finishTeamTetrisDrag(): void;
  onTeamTetrisRotationSelect(rotation: number): void;
  onTeamTetrisRotate(): void;
  onTeamTetrisRotateCcw(): void;
  onTeamTetrisClearDraft(): void;
  onTeamTetrisSubmit(): void;
  onTeamTetrisMoveLeft(): void;
  onTeamTetrisMoveRight(): void;
  onTeamTetrisConfirmPosition(): void;
  onTeamTetrisBackToPosition(): void;
  onTeamTetrisRouteModeSelect(mode: GameRoomTeamTetrisRouteMode): void;
  onTeamTetrisBoardColumnSelect(column: number): void;
  onTeamTetrisBendRowSelect(row: number): void;
}

interface GameRoomTeamTetrisUiStateRuntimeDeps {
  getState: GameRoomUiGetState;
  render(): void;
  sendRoomCommand: GameRoomSendRoomCommand;
  text: GameRoomTextResolver;
}

interface GameRoomTeamTetrisUiStateRuntime
  extends
    GameRoomTeamTetrisUiStateShapeRuntime,
    GameRoomTeamTetrisUiStateViewRuntime,
    GameRoomTeamTetrisUiDraftRuntime {
  onTeamTetrisStart(): void;
  onTeamTetrisReset(): void;
}

interface GameRoomTeamTetrisUiModuleCardRuntimeDeps {
  getState: GameRoomUiGetState;
  createSlot(...args: unknown[]): unknown;
  createElement: GameRoomCreateElement;
  text: GameRoomTextResolver;
  getTeamTetrisRotationCells(pieceId: string, rotation: number): GameRoomTeamTetrisRotationCell[];
  getTeamTetrisPieceBounds(pieceId: string, rotation: number): GameRoomTeamTetrisPieceBounds;
  sanitizeTeamTetrisRows(rows: unknown): string[];
  startTeamTetrisDrag(columnIndex: number, rowIndex: number): void;
  updateTeamTetrisDraftTarget(columnIndex: number, rowIndex: number): void;
  finishTeamTetrisDrag(): void;
  onTeamTetrisBoardColumnSelect(column: number): void;
  onTeamTetrisBendRowSelect(row: number): void;
}

interface GameRoomTeamTetrisBoardCardOptions extends GameRoomUnknownRecord {
  interactive?: boolean;
  boardInteractionMode?: GameRoomTeamTetrisInteractionMode;
  overlayCells?: GameRoomTeamTetrisCell[];
  overlayTone?: string;
  overlayPieceId?: string;
  pathCells?: GameRoomTeamTetrisCell[];
  pathTone?: string;
  pathTurnCell?: GameRoomTeamTetrisCell | null;
  pathTurnTone?: string;
  tone?: string;
  meta?: string;
  context?: HTMLElement[];
}

interface GameRoomTeamTetrisUiModuleCardRuntime {
  createTeamTetrisMetric(label: string, value: string): HTMLElement;
  createTeamTetrisPieceCard(
    title: string,
    pieceId: string,
    rotation: number,
    subtitle: string
  ): HTMLElement;
  createTeamTetrisRequirementCard(slotId: string, ready: boolean): HTMLElement;
  createTeamTetrisSnapshotCard(title: string, rows: unknown): HTMLElement;
  renderTeamTetrisBoardCard(
    boardState: GameRoomTeamTetrisBoardViewState,
    options: GameRoomTeamTetrisBoardCardOptions
  ): HTMLElement;
}

interface GameRoomTeamTetrisUiModuleShellRuntimeDeps {
  getState: GameRoomUiGetState;
  featureId?: string;
  createElement: GameRoomCreateElement;
  text: GameRoomTextResolver;
  render(): void;
  getFeatureLabel(featureId: string): string;
  createTeamTetrisMetric(label: string, value: string): HTMLElement;
  createTeamTetrisPieceCard(
    title: string,
    pieceId: string,
    rotation: number,
    subtitle: string
  ): HTMLElement;
  createTeamTetrisRequirementCard(slotId: string, ready: boolean): HTMLElement;
  createTeamTetrisSnapshotCard(title: string, rows: unknown): HTMLElement;
  renderTeamTetrisBoardCard(
    boardState: GameRoomTeamTetrisBoardViewState,
    options: GameRoomTeamTetrisBoardCardOptions
  ): HTMLElement;
  getTeamTetrisView(): GameRoomTeamTetrisSeatView | null;
  getTeamTetrisBoardLabel(teamId: string): string;
  getTeamTetrisSeatDisplayLabel(seatId: string): string;
  getTeamTetrisPendingTurn(): GameRoomTeamTetrisPendingTurn | null;
  getTeamTetrisOwnBoardState(): GameRoomTeamTetrisBoardViewState;
  getTeamTetrisOpponentBoardState(): GameRoomTeamTetrisBoardViewState;
  getTeamTetrisPlacedByLabel(
    pieceSnapshot: GameRoomTeamTetrisPieceSnapshot | null | undefined
  ): string;
  getTeamTetrisPartnerRoleLabel(): string;
  getTeamTetrisTurnLabel(): string;
  getTeamTetrisResultLabel(): string;
  getTeamTetrisDraftStatusText(): string;
  getTeamTetrisStatusText(): string;
  onTeamTetrisRotationSelect(rotation: number): void;
  onTeamTetrisRotate(): void;
  onTeamTetrisRotateCcw(): void;
  onTeamTetrisClearDraft(): void;
  onTeamTetrisSubmit(): void;
  onTeamTetrisMoveLeft(): void;
  onTeamTetrisMoveRight(): void;
  onTeamTetrisConfirmPosition(): void;
  onTeamTetrisBackToPosition(): void;
  onTeamTetrisRouteModeSelect(mode: GameRoomTeamTetrisRouteMode): void;
  onTeamTetrisBendRowSelect(row: number): void;
  onTeamTetrisStart(): void;
  onTeamTetrisReset(): void;
  getTeamTetrisPlayerDisplay(seatId: string): GameRoomTeamTetrisPlayerDisplay;
  compileStageToRowShifts(
    stagedOriginX: number,
    rotation: number,
    pieceId: string,
    routeMode: GameRoomTeamTetrisRouteMode,
    bendRow: number | null
  ): number[];
}

interface GameRoomTeamTetrisUiModuleShellRuntime {
  renderTeamTetris(root: HTMLElement): void;
}

interface GameRoomTeamTetrisUiTestBridge {
  replayDraft(
    rows: string[],
    pieceId: string,
    rotation: number,
    rowShifts: number[]
  ): GameRoomTeamTetrisDraftReplayResult;
  buildRowShiftsFromTargets(
    pieceId: string,
    rotation: number,
    dragTargets: Record<number, number>
  ): number[];
  getOriginFromCell(pieceId: string, rotation: number, cellX: number): number;
  getSpawnPosition(pieceId: string, rotation: number): GameRoomTeamTetrisCell;
}

interface GameRoomUiBootstrapRuntimeOptions {
  document?: Document;
  navigator?: Navigator;
  render?: () => void;
}

interface GameRoomUiBootstrapRuntime {
  roomId: string;
  featureId: string;
  teamTetrisFeatureId: string;
  contextRuntime: GameRoomUiContextRuntimeLike;
  scrollRuntime: GameRoomUiScrollRuntimeLike;
  stateRef: {
    current: GameRoomUiState | null;
  };
  getState: GameRoomUiGetState;
  backgammonUi: GameRoomBackgammonUiModule;
  teamTetrisUi: GameRoomTeamTetrisUiModule;
  bootstrapText(key: string): string;
  applyPresentationMode(presentation: unknown): void;
  applyLocale(locale: unknown): void;
  getActiveFeatureId(): string;
  getFeatureLabel(featureId: string): string;
}

interface GameRoomUiStateMessageRuntime {
  handleBackgammonState(message: unknown): void;
  handleTeamTetrisState(message: unknown): void;
  handleCommandResult(message: unknown): void;
}

interface GameRoomUiRuntimeHandle {
  getState(): GameRoomUiState;
  handleHostMessage(message: unknown): void;
  render(): void;
  start(): void;
}

interface GameRoomRoomApi {
  close?(): boolean;
  onHostMessage?(handler: (message: unknown) => void): void;
  ready?(payload: GameRoomUnknownRecord): void;
  sendCommand?(command: string, payload: GameRoomUnknownRecord): boolean;
  sendEvent?(type: string, payload?: GameRoomUnknownRecord): boolean;
}

interface GameRoomUiBootstrapRuntimeRegistry {
  createGameRoomUiBootstrapRuntime?: (
    options: GameRoomUiBootstrapRuntimeOptions
  ) => GameRoomUiBootstrapRuntime;
}

interface GameRoomUiStateMessageRuntimeRegistry {
  createGameRoomUiStateMessageRuntime?: (options: {
    stateRef: {
      current: GameRoomUiState | null;
    };
    backgammonUi: GameRoomBackgammonUiModule;
    teamTetrisUi: GameRoomTeamTetrisUiModule;
    render: () => void;
    scheduleRender?: () => void;
  }) => GameRoomUiStateMessageRuntime;
}

interface GameRoomUiRuntimeRegistry {
  createGameRoomUiRuntime?: () => GameRoomUiRuntimeHandle;
}

interface GameRoomUiContextRuntimeRegistry {
  createGameRoomUiContextRuntime?: (options: GameRoomUnknownRecord) => GameRoomUiContextRuntimeLike;
}

interface GameRoomUiScrollRuntimeRegistry {
  createGameRoomUiScrollRuntime?: () => GameRoomUiScrollRuntimeLike;
}

interface GameRoomUiFactoriesRegistry {
  createBackgammonUiModule?: (deps: GameRoomBackgammonUiModuleDeps) => GameRoomBackgammonUiModule;
  createTeamTetrisUiStateShapeRuntime?: () => GameRoomTeamTetrisUiStateShapeRuntime;
  createTeamTetrisUiStateViewRuntime?: (
    deps: GameRoomTeamTetrisUiStateViewRuntimeDeps
  ) => GameRoomTeamTetrisUiStateViewRuntime;
  createTeamTetrisUiDraftRuntime?: (
    deps: GameRoomTeamTetrisUiDraftRuntimeDeps
  ) => GameRoomTeamTetrisUiDraftRuntime;
  createTeamTetrisUiStateRuntime?: (
    deps: GameRoomTeamTetrisUiStateRuntimeDeps
  ) => GameRoomTeamTetrisUiStateRuntime;
  createTeamTetrisUiModuleCardRuntime?: (
    deps: GameRoomTeamTetrisUiModuleCardRuntimeDeps
  ) => GameRoomTeamTetrisUiModuleCardRuntime;
  createTeamTetrisUiModuleShellRuntime?: (
    deps: GameRoomTeamTetrisUiModuleShellRuntimeDeps
  ) => GameRoomTeamTetrisUiModuleShellRuntime;
  createTeamTetrisUiModule?: (deps: GameRoomTeamTetrisUiModuleDeps) => GameRoomTeamTetrisUiModule;
}

interface GameRoomUiGlobal {
  GameRoomUiFeatureContract?: GameRoomUiFeatureContractLike;
  GameRoomUiFactories?: GameRoomUiFactoriesRegistry;
  GameRoomUiContextRuntime?: GameRoomUiContextRuntimeRegistry;
  GameRoomUiScrollRuntime?: GameRoomUiScrollRuntimeRegistry;
  GameRoomUiRuntime?: GameRoomUiRuntimeRegistry;
  GameRoomUiBootstrapRuntime?: GameRoomUiBootstrapRuntimeRegistry;
  GameRoomUiStateMessageRuntime?: GameRoomUiStateMessageRuntimeRegistry;
  roomAPI?: GameRoomRoomApi;
  __gameRoomTeamTetrisTest__?: GameRoomTeamTetrisUiTestBridge;
}
