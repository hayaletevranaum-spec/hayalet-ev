(function (
  global: typeof globalThis & {
    GameRoomUiFactories?: GameRoomUiFactoriesRegistry;
    Konva?: unknown;
  }
) {
  type BackgammonSeat = "user" | "ai";
  type BackgammonOwner = BackgammonSeat | "";
  type BackgammonPoint = {
    point: number;
    owner: BackgammonOwner;
    count: number;
  };
  type BackgammonLocation =
    { type: "bar"; seat: BackgammonSeat } | { type: "off" } | { type: "point"; point: number };
  type BackgammonSubMove = {
    from: BackgammonLocation;
    to: BackgammonLocation;
    die: number;
    hit: boolean;
  };
  type BackgammonLegalMove = {
    id: string;
    label: string;
    moves: BackgammonSubMove[];
    diceUsed: number[];
    pass?: boolean;
  };
  type BackgammonGameState = {
    active: boolean;
    awaitingMoveFrom: "user" | "ai" | null;
    blockedReason: string;
    board: BackgammonPoint[];
    bar: Record<BackgammonSeat, number>;
    off: Record<BackgammonSeat, number>;
    dice: number[];
    legalMoves: BackgammonLegalMove[];
    turnIndex: number;
    turnToken: string;
    boardHash?: string;
  };
  type BackgammonStagePlayer = {
    name: string;
    avatar?: string | null;
    active: boolean;
  };
  type StagePoint = { x: number; y: number };
  type RectLike = { x: number; y: number; width: number; height: number };
  type StageLayout = {
    width: number;
    height: number;
    scale: number;
    offsetX: number;
    offsetY: number;
    signature: string;
  };
  type KonvaEvent = { target?: KonvaNode; evt?: Event };
  type KonvaNode = {
    add?: (...nodes: KonvaNode[]) => void;
    batchDraw?: () => void;
    draw?: () => void;
    destroy?: () => void;
    destroyChildren?: () => void;
    getPointerPosition?: () => StagePoint | null;
    height?: {
      (): number;
      (value: number): void;
    };
    moveToTop?: () => void;
    off?: (eventName?: string) => void;
    on?: (eventName: string, handler: (event: KonvaEvent) => void) => void;
    position?: {
      (): StagePoint;
      (value: StagePoint): void;
    };
    scale?: {
      (): StagePoint;
      (value: StagePoint): void;
    };
    to?: (config: Record<string, unknown>) => void;
    x?: {
      (): number;
      (value: number): void;
    };
    width?: {
      (): number;
      (value: number): void;
    };
    y?: {
      (): number;
      (value: number): void;
    };
  };
  type KonvaStage = KonvaNode & {
    add: (...nodes: KonvaNode[]) => void;
    batchDraw: () => void;
    draw?: () => void;
    destroy: () => void;
    destroyChildren: () => void;
    getPointerPosition: () => StagePoint | null;
    height: {
      (): number;
      (value: number): void;
    };
    on: (eventName: string, handler: (event: KonvaEvent) => void) => void;
    width: {
      (): number;
      (value: number): void;
    };
  };
  type KonvaLayer = KonvaNode & {
    add: (...nodes: KonvaNode[]) => void;
    destroyChildren: () => void;
  };
  type KonvaGroup = KonvaNode & {
    add: (...nodes: KonvaNode[]) => void;
    moveToTop: () => void;
    on: (eventName: string, handler: (event: KonvaEvent) => void) => void;
    position: {
      (): StagePoint;
      (value: StagePoint): void;
    };
    to: (config: Record<string, unknown>) => void;
  };
  type KonvaConstructor<T extends KonvaNode> = new (config?: Record<string, unknown>) => T;
  type KonvaNamespace = {
    Stage: new (config: { container: HTMLDivElement; height: number; width: number }) => KonvaStage;
    Layer: KonvaConstructor<KonvaLayer>;
    Group: KonvaConstructor<KonvaGroup>;
    Rect: KonvaConstructor<KonvaNode>;
    Line: KonvaConstructor<KonvaNode>;
    Circle: KonvaConstructor<KonvaNode>;
    Text: KonvaConstructor<KonvaNode>;
  };
  type BackgammonStageRuntimeDeps = {
    getState: () => { game: BackgammonGameState };
    createElement: (tagName: string, className?: string, textContent?: string) => HTMLElement;
    text: (path: string[]) => string;
    stateRuntime: {
      onLegalMove: (moveId: string) => void;
    };
  };
  type BackgammonStageRenderOptions = {
    canUserMove: boolean;
    game: BackgammonGameState;
    players: {
      user: BackgammonStagePlayer;
      opponent: BackgammonStagePlayer;
    };
  };
  type BackgammonStageRuntime = {
    destroy: () => void;
    renderBackgammonStage: (host: HTMLElement, options: BackgammonStageRenderOptions) => void;
  };
  type BackgammonStageRuntimeRegistry = GameRoomUiFactoriesRegistry & {
    createBackgammonStageRuntime?: (deps: BackgammonStageRuntimeDeps) => BackgammonStageRuntime;
  };
  type BoardSnapshot = {
    board: BackgammonPoint[];
    bar: Record<BackgammonSeat, number>;
    off: Record<BackgammonSeat, number>;
  };
  type BoardMetrics = {
    board: RectLike;
    bar: RectLike;
    offAi: RectLike;
    offUser: RectLike;
    dice: RectLike;
    pointRects: Record<number, RectLike>;
  };
  type StageRedrawMode = "full" | "preview" | "selection";
  type StageRenderModel = {
    metrics: BoardMetrics;
    snapshot: BoardSnapshot;
    candidates: BackgammonSubMove[];
    highlightedSources: BackgammonLocation[];
    selectedSourceForTargets: BackgammonLocation | null;
    selectedTargets: BackgammonLocation[];
  };
  type StageLayerSet = {
    board: KonvaLayer;
    highlight: KonvaLayer;
    checker: KonvaLayer;
    ui: KonvaLayer;
  };

  const registry = (global.GameRoomUiFactories ||
    (global.GameRoomUiFactories =
      {} as GameRoomUiFactoriesRegistry)) as BackgammonStageRuntimeRegistry;

  const WIDTH = 980;
  const HEIGHT = 600;
  const CHECKER_RADIUS = 18;
  const DEFAULT_STAGE_LAYOUT: StageLayout = {
    width: WIDTH,
    height: HEIGHT,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    signature: `${WIDTH}x${HEIGHT}:1:0:0`,
  };

  // Canvas drawing colors — read from CSS custom properties for design token compliance
  function cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  const COLORS = {
    userFill: cssVar("--game-bg-backgammon-user-fill"),
    userEdge: cssVar("--game-bg-backgammon-user-edge"),
    aiFill: cssVar("--game-bg-backgammon-ai-fill"),
    aiEdge: cssVar("--game-bg-backgammon-ai-edge"),
    boardBase: cssVar("--game-bg-backgammon-board-base"),
    boardInnerDark: cssVar("--game-bg-backgammon-board-inner-dark"),
    boardInnerMid: cssVar("--game-bg-backgammon-board-inner-mid"),
    boardInnerLight: cssVar("--game-bg-backgammon-board-inner-light"),
    pointEven: cssVar("--game-bg-backgammon-point-even"),
    pointOdd: cssVar("--game-bg-backgammon-point-odd"),
    offAiBg: cssVar("--game-bg-backgammon-off-ai"),
    dieFace: cssVar("--game-bg-backgammon-die-face"),
    dieStroke: cssVar("--game-bg-backgammon-die-stroke"),
    diePip: cssVar("--game-bg-backgammon-die-pip"),
    checkerUserHighlight: cssVar("--game-bg-backgammon-checker-user-highlight"),
    checkerAiHighlight: cssVar("--game-bg-backgammon-checker-ai-highlight"),
    checkerUserShadow: cssVar("--game-bg-backgammon-checker-user-shadow"),
    checkerAiShadow: cssVar("--game-bg-backgammon-checker-ai-shadow"),
    dieHighlight: cssVar("--game-bg-backgammon-die-highlight"),
    dieShadow: cssVar("--game-bg-backgammon-die-shadow"),
    passLabel: cssVar("--game-bg-backgammon-pass-label"),
    undoLabel: cssVar("--game-bg-backgammon-undo-label"),
  };
  const USER_COLOR = COLORS.userFill;
  const USER_EDGE = COLORS.userEdge;
  const AI_COLOR = COLORS.aiFill;
  const AI_EDGE = COLORS.aiEdge;

  function isKonvaNamespace(value: unknown): value is KonvaNamespace {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const source = value as Record<string, unknown>;
    return (
      typeof source["Stage"] === "function" &&
      typeof source["Layer"] === "function" &&
      typeof source["Group"] === "function" &&
      typeof source["Rect"] === "function" &&
      typeof source["Line"] === "function" &&
      typeof source["Circle"] === "function" &&
      typeof source["Text"] === "function"
    );
  }

  function readText(deps: BackgammonStageRuntimeDeps, path: string[], fallback: string): string {
    const value = deps.text(path);
    return value === path.join(".") ? fallback : value;
  }

  function clonePoint(point: BackgammonPoint): BackgammonPoint {
    return { point: point.point, owner: point.owner, count: Math.max(0, Math.trunc(point.count)) };
  }

  function cloneSnapshot(game: BackgammonGameState): BoardSnapshot {
    return {
      board: game.board.map(clonePoint),
      bar: { user: game.bar.user || 0, ai: game.bar.ai || 0 },
      off: { user: game.off.user || 0, ai: game.off.ai || 0 },
    };
  }

  function normalizeBoard(board: BackgammonPoint[]): BackgammonPoint[] {
    const points: BackgammonPoint[] = [];
    for (let point = 1; point <= 24; point += 1) {
      const indexed = board[point - 1];
      const candidate =
        indexed && indexed.point === point ? indexed : board.find((entry) => entry.point === point);
      points.push(candidate ? clonePoint(candidate) : { point, owner: "", count: 0 });
    }
    return points;
  }

  function getPoint(snapshot: BoardSnapshot, point: number): BackgammonPoint {
    return snapshot.board[point - 1] ?? { point, owner: "", count: 0 };
  }

  function sameLocation(left: BackgammonLocation, right: BackgammonLocation): boolean {
    if (left.type !== right.type) {
      return false;
    }
    if (left.type === "point" && right.type === "point") {
      return left.point === right.point;
    }
    if (left.type === "bar" && right.type === "bar") {
      return left.seat === right.seat;
    }
    return true;
  }

  function moveMatchesPrefix(move: BackgammonLegalMove, prefix: BackgammonSubMove[]): boolean {
    if (prefix.length > move.moves.length) {
      return false;
    }
    return prefix.every((subMove, index) => {
      const candidate = move.moves[index];
      return (
        candidate !== undefined &&
        sameLocation(subMove.from, candidate.from) &&
        sameLocation(subMove.to, candidate.to) &&
        subMove.die === candidate.die
      );
    });
  }

  function getNextSubMoves(
    legalMoves: BackgammonLegalMove[],
    prefix: BackgammonSubMove[]
  ): BackgammonSubMove[] {
    const seen = new Set<string>();
    const subMoves: BackgammonSubMove[] = [];
    legalMoves.forEach((move) => {
      if (move.pass === true || !moveMatchesPrefix(move, prefix)) {
        return;
      }
      const next = move.moves[prefix.length];
      if (next === undefined) {
        return;
      }
      const key = `${locationKey(next.from)}>${locationKey(next.to)}:${next.die}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      subMoves.push(next);
    });
    return subMoves;
  }

  function findCompletedMove(
    legalMoves: BackgammonLegalMove[],
    prefix: BackgammonSubMove[]
  ): BackgammonLegalMove | null {
    return (
      legalMoves.find(
        (move) =>
          move.pass !== true &&
          move.moves.length === prefix.length &&
          moveMatchesPrefix(move, prefix)
      ) ?? null
    );
  }

  function locationKey(location: BackgammonLocation): string {
    if (location.type === "point") {
      return `point:${location.point}`;
    }
    if (location.type === "bar") {
      return `bar:${location.seat}`;
    }
    return "off";
  }

  function locationsSignature(locations: BackgammonLocation[]): string {
    return locations.map(locationKey).join(",");
  }

  function subMoveSignature(subMove: BackgammonSubMove): string {
    return [
      locationKey(subMove.from),
      locationKey(subMove.to),
      subMove.die,
      subMove.hit ? "hit" : "move",
    ].join(">");
  }

  function subMovesSignature(moves: BackgammonSubMove[]): string {
    return moves.map(subMoveSignature).join(",");
  }

  function snapshotSignature(snapshot: BoardSnapshot): string {
    return [
      snapshot.board.map((point) => `${point.point}:${point.owner}:${point.count}`).join(","),
      `bar:${snapshot.bar.user}:${snapshot.bar.ai}`,
      `off:${snapshot.off.user}:${snapshot.off.ai}`,
    ].join("|");
  }

  function candidatesSignature(candidates: BackgammonSubMove[]): string {
    return candidates.map(subMoveSignature).join(",");
  }

  function playersSignature(players: BackgammonStageRenderOptions["players"]): string {
    return [
      players.user.name,
      players.user.avatar ?? "",
      players.user.active ? "1" : "0",
      players.opponent.name,
      players.opponent.avatar ?? "",
      players.opponent.active ? "1" : "0",
    ].join("|");
  }

  function decrementLocation(snapshot: BoardSnapshot, location: BackgammonLocation): void {
    if (location.type === "bar") {
      snapshot.bar[location.seat] = Math.max(0, snapshot.bar[location.seat] - 1);
      return;
    }
    if (location.type !== "point") {
      return;
    }
    const point = getPoint(snapshot, location.point);
    point.count = Math.max(0, point.count - 1);
    if (point.count === 0) {
      point.owner = "";
    }
  }

  function incrementDestination(snapshot: BoardSnapshot, destination: BackgammonLocation): void {
    if (destination.type === "off") {
      snapshot.off.user += 1;
      return;
    }
    if (destination.type !== "point") {
      return;
    }
    const point = getPoint(snapshot, destination.point);
    if (point.owner === "ai" && point.count === 1) {
      snapshot.bar.ai += 1;
      point.owner = "user";
      point.count = 1;
      return;
    }
    if (point.owner === "user") {
      point.count += 1;
      return;
    }
    point.owner = "user";
    point.count = 1;
  }

  function applySubMove(snapshot: BoardSnapshot, subMove: BackgammonSubMove): void {
    decrementLocation(snapshot, subMove.from);
    incrementDestination(snapshot, subMove.to);
  }

  function applyPreview(
    game: BackgammonGameState,
    stagedMoves: BackgammonSubMove[]
  ): BoardSnapshot {
    const snapshot = cloneSnapshot(game);
    snapshot.board = normalizeBoard(snapshot.board);
    stagedMoves.forEach((subMove) => applySubMove(snapshot, subMove));
    return snapshot;
  }

  function buildMetrics(): BoardMetrics {
    const board: RectLike = { x: 34, y: 42, width: 748, height: 496 };
    const innerPad = 18;
    const barWidth = 54;
    const pointWidth = (board.width - innerPad * 2 - barWidth) / 12;
    const halfHeight = (board.height - innerPad * 2) / 2;
    const innerX = board.x + innerPad;
    const topY = board.y + innerPad;
    const bottomY = topY + halfHeight;
    const pointRects: Record<number, RectLike> = {};

    for (let point = 1; point <= 24; point += 1) {
      const top = point >= 13;
      const visualIndex = top ? 24 - point : point - 1;
      const x = innerX + visualIndex * pointWidth + (visualIndex >= 6 ? barWidth : 0);
      pointRects[point] = {
        x,
        y: top ? topY : bottomY,
        width: pointWidth,
        height: halfHeight,
      };
    }

    return {
      board,
      bar: {
        x: innerX + pointWidth * 6,
        y: topY,
        width: barWidth,
        height: halfHeight * 2,
      },
      offAi: { x: 810, y: 76, width: 124, height: 182 },
      offUser: { x: 810, y: 322, width: 124, height: 182 },
      dice: { x: 808, y: 262, width: 130, height: 54 },
      pointRects,
    };
  }

  function getInitials(name: string): string {
    const trimmed = name.trim();
    if (trimmed === "") {
      return "??";
    }
    const parts = trimmed.split(/\s+/);
    return parts.length === 1
      ? trimmed.slice(0, 2).toUpperCase()
      : ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  }

  function truncateLabel(value: string, maxLength: number): string {
    const trimmed = value.trim();
    if (trimmed.length <= maxLength) {
      return trimmed;
    }
    return trimmed.slice(0, Math.max(0, maxLength - 1)) + "...";
  }

  function buildStageLayout(host: HTMLElement): StageLayout {
    const rect = host.getBoundingClientRect();
    const rawWidth = rect.width || host.clientWidth || WIDTH;
    const rawHeight = rect.height || host.clientHeight || HEIGHT;
    const width = Math.max(1, Math.round(rawWidth));
    const height = Math.max(1, Math.round(rawHeight));
    const scale = Math.min(width / WIDTH, height / HEIGHT) || 1;
    const drawWidth = WIDTH * scale;
    const drawHeight = HEIGHT * scale;
    const offsetX = Math.max(0, (width - drawWidth) / 2);
    const offsetY = Math.max(0, (height - drawHeight) / 2);
    return {
      width,
      height,
      scale,
      offsetX,
      offsetY,
      signature: [width, height, scale.toFixed(5), offsetX.toFixed(2), offsetY.toFixed(2)].join(
        "|"
      ),
    };
  }

  function syncStageSize(stage: KonvaStage, host: HTMLElement): StageLayout {
    const layout = buildStageLayout(host);
    if (stage.width() !== layout.width) {
      stage.width(layout.width);
    }
    if (stage.height() !== layout.height) {
      stage.height(layout.height);
    }
    return layout;
  }

  function createScaledLayer(Konva: KonvaNamespace, layout: StageLayout): KonvaLayer {
    return new Konva.Layer({
      x: layout.offsetX,
      y: layout.offsetY,
      scaleX: layout.scale,
      scaleY: layout.scale,
    });
  }

  function getPointRect(metrics: BoardMetrics, point: number): RectLike {
    return metrics.pointRects[point] ?? metrics.board;
  }

  function getLocationRect(metrics: BoardMetrics, location: BackgammonLocation): RectLike {
    if (location.type === "point") {
      return getPointRect(metrics, location.point);
    }
    if (location.type === "off") {
      return metrics.offUser;
    }
    return metrics.bar;
  }

  function getCheckerPosition(
    rect: RectLike,
    row: "top" | "bottom",
    stackIndex: number,
    total: number
  ): StagePoint {
    const visible = Math.min(total, 5);
    const overlap = Math.min(
      31,
      Math.max(22, (rect.height - CHECKER_RADIUS * 2) / Math.max(1, visible - 1))
    );
    const x = rect.x + rect.width / 2;
    if (row === "top") {
      return { x, y: rect.y + CHECKER_RADIUS + stackIndex * overlap };
    }
    return { x, y: rect.y + rect.height - CHECKER_RADIUS - stackIndex * overlap };
  }

  function sourceIsAvailable(source: BackgammonLocation, candidates: BackgammonSubMove[]): boolean {
    return candidates.some((candidate) => sameLocation(candidate.from, source));
  }

  function uniqueLocations(locations: BackgammonLocation[]): BackgammonLocation[] {
    const seen = new Set<string>();
    const unique: BackgammonLocation[] = [];
    locations.forEach((location) => {
      const key = locationKey(location);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      unique.push(location);
    });
    return unique;
  }

  function drawRoundedPanel(
    Konva: KonvaNamespace,
    layer: KonvaLayer,
    rect: RectLike,
    options: { fill: string; stroke?: string; shadow?: boolean }
  ): void {
    layer.add(
      new Konva.Rect({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        cornerRadius: 18,
        fill: options.fill,
        stroke: options.stroke ?? "rgba(255,255,255,0.12)",
        strokeWidth: 1,
        shadowColor: options.shadow === true ? "rgba(0,0,0,0.42)" : "transparent",
        shadowBlur: options.shadow === true ? 14 : 0,
        shadowOffsetY: options.shadow === true ? 6 : 0,
      })
    );
  }

  function drawBoardBase(Konva: KonvaNamespace, layer: KonvaLayer, metrics: BoardMetrics): void {
    // Outer board frame — dark wood
    drawRoundedPanel(Konva, layer, metrics.board, {
      fill: COLORS.boardBase,
      stroke: "rgba(246,219,168,0.36)",
      shadow: true,
    });
    // Inner felt — layered gradient for depth
    layer.add(
      new Konva.Rect({
        x: metrics.board.x + 10,
        y: metrics.board.y + 10,
        width: metrics.board.width - 20,
        height: metrics.board.height - 20,
        cornerRadius: 12,
        fillLinearGradientStartPoint: { x: 0, y: 0 },
        fillLinearGradientEndPoint: { x: metrics.board.width, y: metrics.board.height },
        fillLinearGradientColorStops: [
          0,
          COLORS.boardInnerMid,
          0.52,
          COLORS.boardInnerDark,
          1,
          COLORS.boardInnerLight,
        ],
        stroke: "rgba(255,255,255,0.08)",
        strokeWidth: 1,
      })
    );
    // Wood grain overlay — horizontal subtle lines
    for (
      let grainY = metrics.board.y + 18;
      grainY < metrics.board.y + metrics.board.height - 18;
      grainY += 74
    ) {
      layer.add(
        new Konva.Line({
          points: [
            metrics.board.x + 16,
            grainY + Math.sin(grainY * 0.07) * 3,
            metrics.board.x + metrics.board.width - 16,
            grainY + Math.cos(grainY * 0.05) * 2,
          ],
          stroke: "rgba(246,219,168,0.06)",
          strokeWidth: 1,
          listening: false,
        })
      );
    }
    // Bar — leather-textured divider
    layer.add(
      new Konva.Rect({
        x: metrics.bar.x,
        y: metrics.bar.y,
        width: metrics.bar.width,
        height: metrics.bar.height,
        fill: "rgba(57,35,23,0.78)",
        stroke: "rgba(246,219,168,0.22)",
        strokeWidth: 1,
      })
    );
    // Bar center line
    layer.add(
      new Konva.Line({
        points: [
          metrics.bar.x + metrics.bar.width / 2,
          metrics.bar.y + 12,
          metrics.bar.x + metrics.bar.width / 2,
          metrics.bar.y + metrics.bar.height - 12,
        ],
        stroke: "rgba(246,219,168,0.1)",
        strokeWidth: 1,
        dash: [6, 8],
        listening: false,
      })
    );
    // Off areas
    drawRoundedPanel(Konva, layer, metrics.offAi, {
      fill: "rgba(8,20,28,0.62)",
      stroke: "rgba(120,211,196,0.22)",
    });
    drawRoundedPanel(Konva, layer, metrics.offUser, {
      fill: "rgba(61,38,22,0.58)",
      stroke: "rgba(245,223,170,0.24)",
    });
  }

  function drawPoints(Konva: KonvaNamespace, layer: KonvaLayer, metrics: BoardMetrics): void {
    for (let point = 1; point <= 24; point += 1) {
      const rect = getPointRect(metrics, point);
      const top = point >= 13;
      const fill = point % 2 === 0 ? COLORS.pointEven : COLORS.pointOdd;
      const darkFill = point % 2 === 0 ? "rgba(168,136,72,0.85)" : "rgba(32,118,106,0.85)";
      const triPoints = top
        ? [
            rect.x + 5,
            rect.y + 4,
            rect.x + rect.width - 5,
            rect.y + 4,
            rect.x + rect.width / 2,
            rect.y + rect.height - 16,
          ]
        : [
            rect.x + 5,
            rect.y + rect.height - 4,
            rect.x + rect.width - 5,
            rect.y + rect.height - 4,
            rect.x + rect.width / 2,
            rect.y + 16,
          ];
      layer.add(
        new Konva.Line({
          points: triPoints,
          closed: true,
          fill,
          opacity: 0.76,
          stroke: darkFill,
          strokeWidth: 1,
          listening: false,
        })
      );
      layer.add(
        new Konva.Text({
          x: rect.x,
          y: top ? rect.y + rect.height - 20 : rect.y + 7,
          width: rect.width,
          align: "center",
          text: String(point),
          fontFamily: "IBM Plex Mono, JetBrains Mono, monospace",
          fontSize: 10,
          fill: "rgba(237,243,246,0.52)",
          listening: false,
        })
      );
    }
  }

  function drawTargetHighlight(
    Konva: KonvaNamespace,
    layer: KonvaLayer,
    metrics: BoardMetrics,
    location: BackgammonLocation,
    tone: "source" | "target"
  ): void {
    const rect = getLocationRect(metrics, location);
    const color = tone === "source" ? "rgba(245,223,170,0.42)" : "rgba(121,211,196,0.54)";
    layer.add(
      new Konva.Rect({
        x: rect.x + 4,
        y: rect.y + 4,
        width: rect.width - 8,
        height: rect.height - 8,
        cornerRadius: 10,
        stroke: color,
        strokeWidth: 2,
        dash: tone === "target" ? [8, 5] : [],
        fill: tone === "target" ? "rgba(121,211,196,0.08)" : "rgba(245,223,170,0.06)",
        listening: false,
      })
    );
  }

  function drawCheckers(
    Konva: KonvaNamespace,
    layer: KonvaLayer,
    snapshot: BoardSnapshot,
    metrics: BoardMetrics,
    candidates: BackgammonSubMove[],
    attachSelectionHandlers: (group: KonvaGroup, source: BackgammonLocation) => void
  ): void {
    snapshot.board.forEach((point) => {
      if (point.owner !== "user" && point.owner !== "ai") {
        return;
      }
      const rect = getPointRect(metrics, point.point);
      const row = point.point >= 13 ? "top" : "bottom";
      const visible = Math.min(point.count, 5);
      for (let index = 0; index < visible; index += 1) {
        const source: BackgammonLocation = { type: "point", point: point.point };
        const selectable =
          point.owner === "user" && index === visible - 1 && sourceIsAvailable(source, candidates);
        const position = getCheckerPosition(rect, row, index, point.count);
        const checker = createChecker(
          Konva,
          point.owner,
          position,
          selectable,
          index === visible - 1 ? point.count : 0
        );
        if (selectable) {
          attachSelectionHandlers(checker, source);
        }
        layer.add(checker);
      }
    });

    drawBarCheckers(Konva, layer, snapshot, metrics, candidates, attachSelectionHandlers);
    drawOffCheckers(Konva, layer, snapshot, metrics);
  }

  function createChecker(
    Konva: KonvaNamespace,
    owner: BackgammonSeat,
    position: StagePoint,
    selectable: boolean,
    total: number
  ): KonvaGroup {
    const group = new Konva.Group({
      x: position.x,
      y: position.y,
      draggable: false,
      cursor: selectable ? "pointer" : "default",
    });
    const isUser = owner === "user";
    const baseColor = isUser ? USER_COLOR : AI_COLOR;
    const edgeColor = isUser ? USER_EDGE : AI_EDGE;
    group.add(
      new Konva.Circle({
        x: 0,
        y: 0,
        radius: CHECKER_RADIUS,
        fill: baseColor,
        stroke: edgeColor,
        strokeWidth: 1.5,
        shadowColor: "rgba(0,0,0,0.34)",
        shadowBlur: 5,
        shadowOffsetY: 3,
      })
    );
    if (total > 5) {
      group.add(
        new Konva.Text({
          x: -CHECKER_RADIUS,
          y: -7,
          width: CHECKER_RADIUS * 2,
          align: "center",
          text: String(total),
          fontFamily: "IBM Plex Mono, JetBrains Mono, monospace",
          fontSize: 13,
          fontStyle: "bold",
          fill: isUser ? COLORS.offAiBg : COLORS.userFill,
          listening: false,
        })
      );
    }
    return group;
  }

  function drawBarCheckers(
    Konva: KonvaNamespace,
    layer: KonvaLayer,
    snapshot: BoardSnapshot,
    metrics: BoardMetrics,
    candidates: BackgammonSubMove[],
    attachSelectionHandlers: (group: KonvaGroup, source: BackgammonLocation) => void
  ): void {
    const barSource: BackgammonLocation = { type: "bar", seat: "user" };
    const userVisible = Math.min(snapshot.bar.user, 4);
    for (let index = 0; index < userVisible; index += 1) {
      const y = metrics.bar.y + metrics.bar.height - CHECKER_RADIUS - 12 - index * 30;
      const selectable = index === userVisible - 1 && sourceIsAvailable(barSource, candidates);
      const checker = createChecker(
        Konva,
        "user",
        { x: metrics.bar.x + metrics.bar.width / 2, y },
        selectable,
        index === userVisible - 1 ? snapshot.bar.user : 0
      );
      if (selectable) {
        attachSelectionHandlers(checker, barSource);
      }
      layer.add(checker);
    }
    const aiVisible = Math.min(snapshot.bar.ai, 4);
    for (let index = 0; index < aiVisible; index += 1) {
      layer.add(
        createChecker(
          Konva,
          "ai",
          {
            x: metrics.bar.x + metrics.bar.width / 2,
            y: metrics.bar.y + CHECKER_RADIUS + 12 + index * 30,
          },
          false,
          index === aiVisible - 1 ? snapshot.bar.ai : 0
        )
      );
    }
  }

  function drawOffCheckers(
    Konva: KonvaNamespace,
    layer: KonvaLayer,
    snapshot: BoardSnapshot,
    metrics: BoardMetrics
  ): void {
    drawOffStack(Konva, layer, metrics.offAi, "ai", snapshot.off.ai);
    drawOffStack(Konva, layer, metrics.offUser, "user", snapshot.off.user);
  }

  function drawOffStack(
    Konva: KonvaNamespace,
    layer: KonvaLayer,
    rect: RectLike,
    owner: BackgammonSeat,
    count: number
  ): void {
    const visible = Math.min(count, 5);
    for (let index = 0; index < visible; index += 1) {
      const y = rect.y + rect.height - 22 - index * 24;
      layer.add(
        createChecker(
          Konva,
          owner,
          { x: rect.x + rect.width / 2, y },
          false,
          index === visible - 1 ? count : 0
        )
      );
    }
  }

  function drawDice(
    Konva: KonvaNamespace,
    layer: KonvaLayer,
    metrics: BoardMetrics,
    dice: number[],
    animate: boolean
  ): void {
    const values = dice.length > 0 ? dice.slice(0, 2) : [];
    const group = new Konva.Group({ x: metrics.dice.x, y: metrics.dice.y });
    group.add(
      new Konva.Rect({
        x: 0,
        y: 0,
        width: metrics.dice.width,
        height: metrics.dice.height,
        cornerRadius: 14,
        fill: "rgba(5,14,21,0.58)",
        stroke: "rgba(246,219,168,0.18)",
        strokeWidth: 1,
      })
    );
    if (values.length === 0) {
      group.add(
        new Konva.Text({
          x: 0,
          y: 18,
          width: metrics.dice.width,
          text: "-",
          align: "center",
          fontSize: 18,
          fill: "rgba(237,243,246,0.55)",
        })
      );
      layer.add(group);
      return;
    }
    values.forEach((value, index) => {
      const die = createDie(Konva, value, 14 + index * 48, 8);
      group.add(die);
      if (animate) {
        try {
          die.to({ rotation: 360, duration: 0.42, easing: "EaseOut" });
        } catch (_error) {
          // Keep the die visible when Konva animations are unavailable in the webview.
        }
      }
    });
    if (dice.length > 2) {
      group.add(
        new Konva.Text({
          x: 102,
          y: 19,
          width: 24,
          text: "x4",
          align: "center",
          fontFamily: "IBM Plex Mono, JetBrains Mono, monospace",
          fontSize: 12,
          fontStyle: "bold",
          fill: COLORS.userFill,
        })
      );
    }
    layer.add(group);
  }

  function drawPlayerChips(
    Konva: KonvaNamespace,
    layer: KonvaLayer,
    metrics: BoardMetrics,
    players: BackgammonStageRenderOptions["players"]
  ): void {
    drawPlayerChip(Konva, layer, {
      player: players.opponent,
      owner: "ai",
      x: metrics.offAi.x,
      y: metrics.offAi.y - 38,
      width: metrics.offAi.width,
    });
    drawPlayerChip(Konva, layer, {
      player: players.user,
      owner: "user",
      x: metrics.offUser.x,
      y: metrics.offUser.y + metrics.offUser.height + 8,
      width: metrics.offUser.width,
    });
  }

  function drawPlayerChip(
    Konva: KonvaNamespace,
    layer: KonvaLayer,
    options: {
      player: BackgammonStagePlayer;
      owner: BackgammonSeat;
      x: number;
      y: number;
      width: number;
    }
  ): void {
    const height = 30;
    const group = new Konva.Group({ x: options.x, y: options.y });
    const isUser = options.owner === "user";
    const border = options.player.active
      ? isUser
        ? "rgba(245,223,170,0.68)"
        : "rgba(121,211,196,0.62)"
      : "rgba(246,219,168,0.2)";
    group.add(
      new Konva.Rect({
        x: 0,
        y: 0,
        width: options.width,
        height,
        cornerRadius: 15,
        fill: options.player.active ? "rgba(5,14,21,0.74)" : "rgba(5,14,21,0.54)",
        stroke: border,
        strokeWidth: options.player.active ? 1.6 : 1,
        shadowColor: "rgba(0,0,0,0.26)",
        shadowBlur: options.player.active ? 10 : 0,
        shadowOffsetY: 4,
      })
    );
    group.add(
      new Konva.Circle({
        x: 17,
        y: height / 2,
        radius: 10,
        fill: isUser ? USER_COLOR : AI_COLOR,
        stroke: isUser ? USER_EDGE : AI_EDGE,
        strokeWidth: 1,
      })
    );
    group.add(
      new Konva.Text({
        x: 7,
        y: 10,
        width: 20,
        align: "center",
        text: getInitials(options.player.name),
        fontFamily: "IBM Plex Mono, JetBrains Mono, monospace",
        fontSize: 8.5,
        fontStyle: "bold",
        fill: isUser ? COLORS.offAiBg : COLORS.userFill,
        listening: false,
      })
    );
    group.add(
      new Konva.Text({
        x: 34,
        y: 8,
        width: options.width - 42,
        text: truncateLabel(options.player.name || "Player", 13),
        fontFamily: "Avenir Next, Segoe UI, sans-serif",
        fontSize: 12,
        fontStyle: "bold",
        fill: "rgba(237,243,246,0.86)",
        listening: false,
      })
    );
    layer.add(group);
  }

  function createDie(Konva: KonvaNamespace, value: number, x: number, y: number): KonvaGroup {
    const group = new Konva.Group({ x: x + 19, y: y + 19, offsetX: 19, offsetY: 19 });
    // Die face with radial gradient for volume
    group.add(
      new Konva.Rect({
        x: 0,
        y: 0,
        width: 38,
        height: 38,
        cornerRadius: 8,
        fill: COLORS.dieFace,
        stroke: COLORS.dieStroke,
        strokeWidth: 1.2,
        shadowColor: "rgba(0,0,0,0.28)",
        shadowBlur: 5,
        shadowOffsetY: 2,
      })
    );
    const pipMap: Record<number, StagePoint[]> = {
      1: [{ x: 19, y: 19 }],
      2: [
        { x: 12, y: 12 },
        { x: 26, y: 26 },
      ],
      3: [
        { x: 11, y: 11 },
        { x: 19, y: 19 },
        { x: 27, y: 27 },
      ],
      4: [
        { x: 12, y: 12 },
        { x: 26, y: 12 },
        { x: 12, y: 26 },
        { x: 26, y: 26 },
      ],
      5: [
        { x: 12, y: 12 },
        { x: 26, y: 12 },
        { x: 19, y: 19 },
        { x: 12, y: 26 },
        { x: 26, y: 26 },
      ],
      6: [
        { x: 12, y: 11 },
        { x: 26, y: 11 },
        { x: 12, y: 19 },
        { x: 26, y: 19 },
        { x: 12, y: 27 },
        { x: 26, y: 27 },
      ],
    };
    const pips = pipMap[value] ?? pipMap[1] ?? [];
    pips.forEach((pip) => {
      group.add(
        new Konva.Circle({
          x: pip.x,
          y: pip.y,
          radius: 3.1,
          fill: COLORS.diePip,
          listening: false,
        })
      );
    });
    return group;
  }

  registry.createBackgammonStageRuntime = function createBackgammonStageRuntime(
    deps: BackgammonStageRuntimeDeps
  ): BackgammonStageRuntime {
    let stage: KonvaStage | null = null;
    let mountedHost: HTMLElement | null = null;
    let lastTurnSignature = "";
    let stagedMoves: BackgammonSubMove[] = [];
    let selectedSource: BackgammonLocation | null = null;
    let activeGame: BackgammonGameState | null = null;
    let activeCanUserMove = false;
    let activePlayers: BackgammonStageRenderOptions["players"] = {
      user: { name: "Player", avatar: null, active: false },
      opponent: { name: "Opponent", avatar: null, active: false },
    };
    let activeLayout = DEFAULT_STAGE_LAYOUT;
    let lastLayoutSignature = DEFAULT_STAGE_LAYOUT.signature;
    let cachedMetrics: BoardMetrics | null = null;
    let boardLayerRef: KonvaLayer | null = null;
    let highlightLayerRef: KonvaLayer | null = null;
    let checkerLayerRef: KonvaLayer | null = null;
    let uiLayerRef: KonvaLayer | null = null;
    let boardDrawn = false;
    let lastCheckerSignature = "";
    let lastHighlightSignature = "";
    let lastUiSignature = "";
    let resizeObserver: ResizeObserver | null = null;
    let resizeFramePending = false;

    function destroy(): void {
      if (resizeObserver !== null) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      resizeFramePending = false;
      if (stage !== null) {
        stage.destroy();
        stage = null;
      }
      mountedHost = null;
      boardLayerRef = null;
      highlightLayerRef = null;
      checkerLayerRef = null;
      uiLayerRef = null;
      boardDrawn = false;
      resetLayerSignatures();
      cachedMetrics = null;
      activeLayout = DEFAULT_STAGE_LAYOUT;
      lastLayoutSignature = DEFAULT_STAGE_LAYOUT.signature;
      selectedSource = null;
    }

    function resetLayerSignatures(): void {
      lastCheckerSignature = "";
      lastHighlightSignature = "";
      lastUiSignature = "";
    }

    function turnSignature(game: BackgammonGameState): string {
      return [
        game.turnIndex,
        game.turnToken,
        game.boardHash ?? "",
        game.dice.join("-"),
        game.awaitingMoveFrom ?? "none",
      ].join("|");
    }

    function resetStagedMovesIfNeeded(game: BackgammonGameState): boolean {
      const signature = turnSignature(game);
      const changed = signature !== lastTurnSignature;
      if (changed) {
        stagedMoves = [];
        selectedSource = null;
        lastTurnSignature = signature;
      }
      return changed;
    }

    function scheduleResizeRedraw(Konva: KonvaNamespace, host: HTMLElement): void {
      if (resizeFramePending) {
        return;
      }
      resizeFramePending = true;
      const schedulerHost = globalThis as typeof globalThis & {
        requestAnimationFrame?: (callback: FrameRequestCallback) => unknown;
        setTimeout?: (callback: () => void, delay: number) => unknown;
      };
      const flush = function (): void {
        resizeFramePending = false;
        if (mountedHost !== host || stage === null) {
          return;
        }
        const nextLayout = buildStageLayout(host);
        if (nextLayout.signature === activeLayout.signature) {
          return;
        }
        drawScene(Konva, false);
      };
      if (typeof schedulerHost.requestAnimationFrame === "function") {
        schedulerHost.requestAnimationFrame(flush);
        return;
      }
      if (typeof schedulerHost.setTimeout === "function") {
        schedulerHost.setTimeout(flush, 0);
        return;
      }
      flush();
    }

    function observeHostResize(Konva: KonvaNamespace, host: HTMLElement): void {
      if (resizeObserver !== null || typeof ResizeObserver !== "function") {
        return;
      }
      resizeObserver = new ResizeObserver(() => {
        if (mountedHost !== host || stage === null) {
          return;
        }
        scheduleResizeRedraw(Konva, host);
      });
      resizeObserver.observe(host);
    }

    function flushStageDraw(stageInstance: KonvaStage): void {
      if (typeof stageInstance.draw === "function") {
        stageInstance.draw();
        return;
      }
      stageInstance.batchDraw();
    }

    function syncLayerLayout(layer: KonvaLayer, layout: StageLayout): void {
      layer.position?.({ x: layout.offsetX, y: layout.offsetY });
      layer.scale?.({ x: layout.scale, y: layout.scale });
    }

    function ensureStageLayers(Konva: KonvaNamespace, layout: StageLayout): StageLayerSet | null {
      if (stage === null) {
        return null;
      }
      if (boardLayerRef === null) {
        boardLayerRef = createScaledLayer(Konva, layout);
        stage.add(boardLayerRef);
        boardDrawn = false;
      }
      if (highlightLayerRef === null) {
        highlightLayerRef = createScaledLayer(Konva, layout);
        stage.add(highlightLayerRef);
      }
      if (checkerLayerRef === null) {
        checkerLayerRef = createScaledLayer(Konva, layout);
        stage.add(checkerLayerRef);
      }
      if (uiLayerRef === null) {
        uiLayerRef = createScaledLayer(Konva, layout);
        stage.add(uiLayerRef);
      }
      const boardLayer = boardLayerRef;
      const highlightLayer = highlightLayerRef;
      const checkerLayer = checkerLayerRef;
      const uiLayer = uiLayerRef;
      syncLayerLayout(boardLayer, layout);
      syncLayerLayout(highlightLayer, layout);
      syncLayerLayout(checkerLayer, layout);
      syncLayerLayout(uiLayer, layout);
      highlightLayer.moveToTop?.();
      checkerLayer.moveToTop?.();
      uiLayer.moveToTop?.();
      return {
        board: boardLayer,
        highlight: highlightLayer,
        checker: checkerLayer,
        ui: uiLayer,
      };
    }

    function buildRenderModel(metrics: BoardMetrics): StageRenderModel | null {
      if (activeGame === null) {
        return null;
      }
      const snapshot = applyPreview(activeGame, stagedMoves);
      const candidates =
        activeCanUserMove === true ? getNextSubMoves(activeGame.legalMoves, stagedMoves) : [];
      if (selectedSource !== null && !sourceIsAvailable(selectedSource, candidates)) {
        selectedSource = null;
      }
      const selectedSourceForTargets = selectedSource;
      const selectedTargets =
        selectedSourceForTargets === null
          ? []
          : uniqueLocations(
              candidates
                .filter((candidate) => sameLocation(candidate.from, selectedSourceForTargets))
                .map((candidate) => candidate.to)
            );
      const highlightedSources =
        selectedSourceForTargets === null
          ? uniqueLocations(candidates.map((candidate) => candidate.from))
          : [];
      return {
        metrics,
        snapshot,
        candidates,
        highlightedSources,
        selectedSourceForTargets,
        selectedTargets,
      };
    }

    function getCheckerLayerSignature(model: StageRenderModel): string {
      return [snapshotSignature(model.snapshot), candidatesSignature(model.candidates)].join("|");
    }

    function getHighlightLayerSignature(model: StageRenderModel): string {
      return [
        locationsSignature(model.highlightedSources),
        model.selectedSourceForTargets === null ? "" : locationKey(model.selectedSourceForTargets),
        locationsSignature(model.selectedTargets),
      ].join("|");
    }

    function getUiLayerSignature(model: StageRenderModel): string {
      const passMove = activeGame?.legalMoves.find((move) => move.pass === true);
      return [
        activeGame?.dice.join("-") ?? "",
        activeGame?.awaitingMoveFrom ?? "none",
        activeGame?.blockedReason ?? "",
        activeCanUserMove ? "1" : "0",
        passMove?.id ?? "",
        locationsSignature(model.selectedTargets),
        subMovesSignature(stagedMoves),
        playersSignature(activePlayers),
      ].join("|");
    }

    function redrawBoard(Konva: KonvaNamespace, layer: KonvaLayer, metrics: BoardMetrics): void {
      layer.destroyChildren();
      drawBoardBase(Konva, layer, metrics);
      drawPoints(Konva, layer, metrics);
      boardDrawn = true;
    }

    function redrawHighlights(
      Konva: KonvaNamespace,
      layer: KonvaLayer,
      model: StageRenderModel
    ): void {
      layer.destroyChildren();
      model.highlightedSources.forEach((source) => {
        drawTargetHighlight(Konva, layer, model.metrics, source, "source");
      });
      if (model.selectedSourceForTargets !== null) {
        drawTargetHighlight(Konva, layer, model.metrics, model.selectedSourceForTargets, "source");
        model.selectedTargets.forEach((target) => {
          drawTargetHighlight(Konva, layer, model.metrics, target, "target");
        });
      }
    }

    function redrawCheckers(
      Konva: KonvaNamespace,
      layer: KonvaLayer,
      model: StageRenderModel
    ): void {
      layer.destroyChildren();
      drawCheckers(Konva, layer, model.snapshot, model.metrics, model.candidates, (group, source) =>
        attachSelectionHandlers(group, source, () => drawScene(Konva, false, "selection"))
      );
    }

    function redrawInteractiveUi(
      Konva: KonvaNamespace,
      layer: KonvaLayer,
      model: StageRenderModel,
      animateDice: boolean
    ): void {
      if (activeGame === null) {
        return;
      }
      layer.destroyChildren();
      model.selectedTargets.forEach((target) => {
        drawTargetClickArea(Konva, layer, model.metrics, target, (selectedTarget) =>
          selectTarget(selectedTarget, () => drawScene(Konva, false, "preview"))
        );
      });
      drawDice(Konva, layer, model.metrics, activeGame.dice, animateDice);
      drawPlayerChips(Konva, layer, model.metrics, activePlayers);
      drawUndoAction(Konva, layer, () => drawScene(Konva, false, "preview"));
      drawPassAction(Konva, layer, activeGame);
    }

    function attachSelectionHandlers(
      group: KonvaGroup,
      source: BackgammonLocation,
      redraw: () => void
    ): void {
      group.on("click tap", () => {
        selectedSource =
          selectedSource !== null && sameLocation(selectedSource, source) ? null : source;
        redraw();
      });
    }

    function selectTarget(target: BackgammonLocation, redraw: () => void): void {
      const game = activeGame;
      const source = selectedSource;
      if (game === null || source === null) {
        selectedSource = null;
        redraw();
        return;
      }
      const next = getNextSubMoves(game.legalMoves, stagedMoves).find(
        (candidate) => sameLocation(candidate.from, source) && sameLocation(candidate.to, target)
      );
      if (next === undefined) {
        selectedSource = null;
        redraw();
        return;
      }
      stagedMoves.push(next);
      selectedSource = null;
      const completedMove = findCompletedMove(game.legalMoves, stagedMoves);
      if (completedMove !== null) {
        const completedMoveId = completedMove.id;
        stagedMoves = [];
        deps.stateRuntime.onLegalMove(completedMoveId);
        return;
      }
      redraw();
    }

    function drawTargetClickArea(
      Konva: KonvaNamespace,
      layer: KonvaLayer,
      metrics: BoardMetrics,
      target: BackgammonLocation,
      onSelect: (target: BackgammonLocation) => void
    ): void {
      const rect = getLocationRect(metrics, target);
      const group = new Konva.Group({ cursor: "pointer" });
      group.add(
        new Konva.Rect({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          fill: "rgba(121,211,196,0.01)",
          stroke: "rgba(121,211,196,0)",
          strokeWidth: 1,
        })
      );
      group.on("click tap", () => onSelect(target));
      layer.add(group);
    }

    function drawPassAction(
      Konva: KonvaNamespace,
      layer: KonvaLayer,
      game: BackgammonGameState
    ): void {
      const passMove = game.legalMoves.find((move) => move.pass === true);
      if (passMove === undefined || activeCanUserMove !== true) {
        return;
      }
      const label = readText(deps, ["backgammon", "board", "passMove"], "Pass");
      const group = new Konva.Group({ x: 392, y: 258 });
      group.add(
        new Konva.Rect({
          x: 0,
          y: 0,
          width: 196,
          height: 68,
          cornerRadius: 18,
          fill: "rgba(5,14,21,0.82)",
          stroke: "rgba(121,211,196,0.52)",
          strokeWidth: 2,
          shadowColor: "rgba(0,0,0,0.34)",
          shadowBlur: 18,
        })
      );
      group.add(
        new Konva.Text({
          x: 0,
          y: 23,
          width: 196,
          align: "center",
          text: label,
          fontFamily: "IBM Plex Mono, JetBrains Mono, monospace",
          fontSize: 18,
          fontStyle: "bold",
          fill: COLORS.passLabel,
        })
      );
      group.on("click tap", () => {
        selectedSource = null;
        deps.stateRuntime.onLegalMove(passMove.id);
      });
      layer.add(group);
    }

    function drawUndoAction(Konva: KonvaNamespace, layer: KonvaLayer, redraw: () => void): void {
      if (stagedMoves.length === 0) {
        return;
      }
      const group = new Konva.Group({ x: 628, y: 540 });
      group.add(
        new Konva.Rect({
          x: 0,
          y: 0,
          width: 106,
          height: 32,
          cornerRadius: 10,
          fill: "rgba(5,14,21,0.78)",
          stroke: "rgba(245,223,170,0.34)",
          strokeWidth: 1,
        })
      );
      group.add(
        new Konva.Text({
          x: 0,
          y: 9,
          width: 106,
          align: "center",
          text: readText(deps, ["backgammon", "board", "undoStage"], "Undo"),
          fontFamily: "IBM Plex Mono, JetBrains Mono, monospace",
          fontSize: 11,
          fontStyle: "bold",
          fill: COLORS.undoLabel,
        })
      );
      group.on("click tap", () => {
        stagedMoves = [];
        selectedSource = null;
        redraw();
      });
      layer.add(group);
    }

    function drawScene(
      Konva: KonvaNamespace,
      animateDice: boolean,
      mode: StageRedrawMode = "full"
    ): void {
      if (stage === null || activeGame === null) {
        return;
      }
      const metrics = cachedMetrics || (cachedMetrics = buildMetrics());
      const layout =
        mountedHost !== null ? syncStageSize(stage, mountedHost) : DEFAULT_STAGE_LAYOUT;
      activeLayout = layout;
      if (layout.signature !== lastLayoutSignature) {
        lastLayoutSignature = layout.signature;
      }
      const layers = ensureStageLayers(Konva, layout);
      if (layers === null) {
        return;
      }

      if (!boardDrawn) {
        redrawBoard(Konva, layers.board, metrics);
      }

      const model = buildRenderModel(metrics);
      if (model === null) {
        return;
      }
      const checkerSignature = getCheckerLayerSignature(model);
      if (mode !== "selection" && checkerSignature !== lastCheckerSignature) {
        redrawCheckers(Konva, layers.checker, model);
        lastCheckerSignature = checkerSignature;
      }
      const highlightSignature = getHighlightLayerSignature(model);
      if (highlightSignature !== lastHighlightSignature) {
        redrawHighlights(Konva, layers.highlight, model);
        lastHighlightSignature = highlightSignature;
      }
      const uiSignature = getUiLayerSignature(model);
      if (animateDice || uiSignature !== lastUiSignature) {
        redrawInteractiveUi(Konva, layers.ui, model, animateDice);
        lastUiSignature = uiSignature;
      }
      flushStageDraw(stage);
    }

    function renderFallback(host: HTMLElement, options: BackgammonStageRenderOptions): void {
      const fallback = deps.createElement("div", "backgammon-board-stage__fallback", "");
      fallback.append(
        deps.createElement(
          "p",
          "backgammon-board-stage__fallback-text",
          readText(
            deps,
            ["backgammon", "board", "stageFallback"],
            "Visual board engine is loading."
          )
        )
      );
      const move = options.game.legalMoves[0];
      if (options.canUserMove && move !== undefined) {
        const button = deps.createElement(
          "button",
          "backgammon-button backgammon-button--primary",
          move.label
        );
        button.addEventListener("click", () => deps.stateRuntime.onLegalMove(move.id));
        fallback.append(button);
      }
      host.replaceChildren(fallback);
    }

    function renderBackgammonStage(host: HTMLElement, options: BackgammonStageRenderOptions): void {
      activeGame = options.game;
      activeCanUserMove = options.canUserMove;
      activePlayers = options.players;
      const diceChanged = resetStagedMovesIfNeeded(options.game);
      const Konva = global.Konva;
      if (!isKonvaNamespace(Konva)) {
        destroy();
        renderFallback(host, options);
        return;
      }

      if (stage !== null && mountedHost !== host) {
        destroy();
      }

      if (stage === null) {
        host.replaceChildren();
        activeLayout = buildStageLayout(host);
        lastLayoutSignature = activeLayout.signature;
        stage = new Konva.Stage({
          container: host as HTMLDivElement,
          width: activeLayout.width,
          height: activeLayout.height,
        });
        mountedHost = host;
        observeHostResize(Konva, host);
      } else {
        observeHostResize(Konva, host);
      }

      drawScene(Konva, diceChanged);
    }

    return {
      destroy,
      renderBackgammonStage,
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
