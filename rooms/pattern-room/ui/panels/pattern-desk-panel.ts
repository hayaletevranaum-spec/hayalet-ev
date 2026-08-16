import type {
  PatternClaim,
  PatternConnection,
  PatternConnectionOption,
  PatternPanelActions,
  PatternRoomWorkspaceModel,
} from "../../shared/types/pattern-room.js";
import {
  createPatternWorkspaceTranslator,
  type PatternWorkspaceTranslator,
} from "../pattern-room-workspace-i18n.js";
import { createElement, createEmptyState, createPanelShell } from "./pattern-panel-utils.js";

type PatternGraphNodeKind = PatternConnectionOption["kind"];

type PatternGraphNodeDraft = {
  readonly id: string;
  readonly label: string;
  readonly kind: PatternGraphNodeKind;
  readonly isLocal: boolean;
  readonly claim: PatternClaim | null;
};

type PatternGraphNode = PatternGraphNodeDraft & {
  readonly x: number;
  readonly y: number;
};

type PatternGraphLayout = {
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly PatternGraphNode[];
  readonly nodesById: ReadonlyMap<string, PatternGraphNode>;
};

const GRAPH_LAYOUT_VERSION = "layered-v1";
const GRAPH_SCENE_WIDTH = 1080;
const GRAPH_NODE_WIDTH = 240;
const GRAPH_NODE_HEIGHT = 104;
const GRAPH_ROW_GAP = 150;
const GRAPH_TOP = 90;
const GRAPH_MIN_HEIGHT = 560;
const GRAPH_ZOOM_MIN = 0.75;
const GRAPH_ZOOM_MAX = 1.5;
const GRAPH_ZOOM_STEP = 0.25;

const GRAPH_COLUMN_X: Readonly<Record<PatternGraphNodeKind, number>> = {
  source: 70,
  evidence: 420,
  node: 770,
};

const GRAPH_COLUMN_LABELS: Readonly<Record<PatternGraphNodeKind, string>> = {
  source: "Kaynaklar",
  evidence: "Kanıtlar",
  node: "İddialar ve notlar",
};

const GRAPH_NODE_KIND_LABELS: Readonly<Record<PatternGraphNodeKind, string>> = {
  source: "Kaynak",
  evidence: "Kanıt",
  node: "Pano öğesi",
};

function normalizeClaimNodeId(claimId: string): string {
  return claimId.startsWith("claim-") ? claimId.slice("claim-".length) : claimId;
}

function compareGraphNodes(left: PatternGraphNodeDraft, right: PatternGraphNodeDraft): number {
  const labelComparison = left.label.localeCompare(right.label, "tr");
  return labelComparison === 0 ? left.id.localeCompare(right.id, "tr") : labelComparison;
}

function createGraphNodeDrafts(data: PatternRoomWorkspaceModel): readonly PatternGraphNodeDraft[] {
  const optionsById = new Map(
    data.connectionOptions.map((option) => {
      return [option.id, option] as const;
    })
  );
  const claimsByNodeId = new Map<string, PatternClaim>();
  data.claims.forEach((claim) => {
    claimsByNodeId.set(claim.id, claim);
    claimsByNodeId.set(normalizeClaimNodeId(claim.id), claim);
  });

  const nodesById = new Map<string, PatternGraphNodeDraft>();
  const ensureNode = (id: string, fallbackLabel: string): void => {
    const option = optionsById.get(id);
    const claim = claimsByNodeId.get(id) ?? claimsByNodeId.get(`claim-${id}`) ?? null;
    const existing = nodesById.get(id);
    const next: PatternGraphNodeDraft = {
      id,
      label: option?.label ?? claim?.label ?? fallbackLabel,
      kind: option?.kind ?? "node",
      isLocal: option?.isLocal ?? id.startsWith("local-"),
      claim,
    };
    if (existing === undefined || (existing.claim === null && next.claim !== null)) {
      nodesById.set(id, next);
    }
  };

  data.connections.forEach((connection) => {
    ensureNode(connection.sourceId, connection.sourceLabel);
    ensureNode(connection.targetId, connection.targetLabel);
  });
  data.claims.forEach((claim) => {
    ensureNode(normalizeClaimNodeId(claim.id), claim.label);
  });

  return [...nodesById.values()];
}

function createGraphLayout(data: PatternRoomWorkspaceModel): PatternGraphLayout {
  const drafts = createGraphNodeDrafts(data);
  const grouped: Record<PatternGraphNodeKind, PatternGraphNodeDraft[]> = {
    source: [],
    evidence: [],
    node: [],
  };
  drafts.forEach((node) => {
    grouped[node.kind].push(node);
  });
  Object.values(grouped).forEach((nodes) => {
    nodes.sort(compareGraphNodes);
  });

  const largestColumn = Math.max(
    grouped.source.length,
    grouped.evidence.length,
    grouped.node.length,
    1
  );
  const height = Math.max(GRAPH_MIN_HEIGHT, GRAPH_TOP + largestColumn * GRAPH_ROW_GAP + 70);
  const nodes: PatternGraphNode[] = [];
  (["source", "evidence", "node"] as const).forEach((kind) => {
    const column = grouped[kind];
    const verticalOffset = ((largestColumn - column.length) * GRAPH_ROW_GAP) / 2;
    column.forEach((node, index) => {
      nodes.push({
        ...node,
        x: GRAPH_COLUMN_X[kind],
        y: GRAPH_TOP + verticalOffset + index * GRAPH_ROW_GAP,
      });
    });
  });

  return {
    width: GRAPH_SCENE_WIDTH,
    height,
    nodes,
    nodesById: new Map(
      nodes.map((node) => {
        return [node.id, node] as const;
      })
    ),
  };
}

function createGraphNode(node: PatternGraphNode, index: number): HTMLElement {
  const card = createElement(
    "article",
    `pattern-room-graph-node ${node.kind} ${node.isLocal ? "local" : "domain"}${
      node.claim === null ? "" : ` ${node.claim.stance}`
    }`
  );
  card.dataset["patternGraphNode"] = node.id;
  card.dataset["patternGraphNodeKind"] = node.kind;
  card.dataset["patternGraphNodeScope"] = node.isLocal ? "local" : "domain";
  card.setAttribute("style", `left:${String(node.x)}px;top:${String(node.y)}px;`);
  if (node.claim !== null) {
    card.dataset["patternConnectionClaim"] = node.claim.id;
    card.dataset["patternClaimCard"] = node.claim.id;
  }

  const summary =
    node.claim?.summary ??
    `${GRAPH_NODE_KIND_LABELS[node.kind]} bağlantı ucu; ayrıntılar kaynak ve pano görünümlerinde korunur.`;
  card.append(
    createElement("span", "pattern-room-list-eyebrow", GRAPH_NODE_KIND_LABELS[node.kind]),
    createElement("span", "pattern-room-connection-node-index", String(index + 1)),
    createElement("h3", undefined, node.label),
    createElement("p", undefined, summary),
    createElement("small", undefined, node.isLocal ? "Yerel vaka izi" : "Domain vaka izi")
  );
  return card;
}

function createGraphColumnLabel(kind: PatternGraphNodeKind): HTMLElement {
  const label = createElement("div", `pattern-room-graph-column-label ${kind}`);
  label.dataset["patternGraphColumn"] = kind;
  label.setAttribute("style", `left:${String(GRAPH_COLUMN_X[kind])}px;`);
  label.append(
    createElement("span", undefined, GRAPH_NODE_KIND_LABELS[kind]),
    createElement("strong", undefined, GRAPH_COLUMN_LABELS[kind])
  );
  return label;
}

function createGraphEdge(
  connection: PatternConnection,
  source: PatternGraphNode,
  target: PatternGraphNode,
  index: number,
  onSelect: (connectionId: string) => void
): HTMLButtonElement {
  const sourceX = source.x + GRAPH_NODE_WIDTH / 2;
  const sourceY = source.y + GRAPH_NODE_HEIGHT / 2;
  const targetX = target.x + GRAPH_NODE_WIDTH / 2;
  const targetY = target.y + GRAPH_NODE_HEIGHT / 2;
  const deltaX = targetX - sourceX;
  const deltaY = targetY - sourceY;
  const length = Math.max(Math.hypot(deltaX, deltaY), 72);
  const angle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
  const parallelOffset = ((index % 3) - 1) * 10;
  const radians = (angle * Math.PI) / 180;
  const offsetX = -Math.sin(radians) * parallelOffset;
  const offsetY = Math.cos(radians) * parallelOffset;

  const button = createElement(
    "button",
    `pattern-room-connection-card pattern-room-graph-edge ${connection.scope}`
  );
  button.type = "button";
  button.dataset["patternConnectionEdge"] = connection.id;
  button.dataset["patternGraphEdge"] = connection.id;
  button.dataset["patternGraphEdgeScope"] = connection.scope;
  button.ariaPressed = "false";
  button.ariaLabel = `${connection.sourceLabel} → ${connection.edgeTypeLabel} → ${connection.targetLabel}`;
  button.title = button.ariaLabel;
  button.setAttribute(
    "style",
    `left:${String(sourceX + offsetX)}px;top:${String(sourceY + offsetY)}px;width:${String(
      length
    )}px;transform:rotate(${String(angle)}deg);`
  );

  const label = createElement(
    "span",
    "pattern-room-connection-edge-label pattern-room-graph-edge-label",
    connection.edgeTypeLabel
  );
  label.setAttribute("style", `transform:translate(-50%,-50%) rotate(${String(-angle)}deg);`);
  button.append(
    createElement("span", "pattern-room-graph-edge-line"),
    label,
    createElement(
      "span",
      "pattern-room-visually-hidden",
      `${connection.sourceLabel} → ${connection.edgeTypeLabel} → ${connection.targetLabel}. ${
        connection.scope === "local" ? "Yerel bağlantı" : "Domain bağlantısı"
      }${connection.note === null ? "" : `. Not: ${connection.note}`}`
    )
  );
  button.addEventListener("click", () => {
    onSelect(connection.id);
  });
  return button;
}

function updateGraphScale(
  stage: HTMLElement,
  scene: HTMLElement,
  zoomValue: HTMLElement,
  zoomOut: HTMLButtonElement,
  zoomIn: HTMLButtonElement,
  layout: PatternGraphLayout,
  zoom: number
): void {
  stage.setAttribute(
    "style",
    `width:${String(Math.round(layout.width * zoom))}px;height:${String(
      Math.round(layout.height * zoom)
    )}px;`
  );
  scene.setAttribute(
    "style",
    `width:${String(layout.width)}px;height:${String(layout.height)}px;transform:scale(${String(
      zoom
    )});`
  );
  zoomValue.textContent = `${String(Math.round(zoom * 100))}%`;
  zoomOut.disabled = zoom <= GRAPH_ZOOM_MIN;
  zoomIn.disabled = zoom >= GRAPH_ZOOM_MAX;
}

function createGraphToolbar(
  nodeCount: number,
  connectionCount: number,
  onZoomChange: (direction: "in" | "out" | "reset") => void
): {
  readonly toolbar: HTMLElement;
  readonly zoomValue: HTMLElement;
  readonly zoomOut: HTMLButtonElement;
  readonly zoomIn: HTMLButtonElement;
} {
  const toolbar = createElement("div", "pattern-room-graph-toolbar");
  toolbar.dataset["patternGraphToolbar"] = "true";
  const metrics = createElement("div", "pattern-room-graph-metrics");
  metrics.append(
    createElement("span", undefined, `${String(nodeCount)} düğüm`),
    createElement("span", undefined, `${String(connectionCount)} bağlantı`),
    createElement("span", undefined, "Deterministik yerleşim")
  );

  const controls = createElement("div", "pattern-room-graph-zoom-controls");
  controls.ariaLabel = "Grafik yakınlaştırma";
  const zoomOut = createElement("button", "pattern-room-graph-zoom-button", "−");
  zoomOut.type = "button";
  zoomOut.dataset["patternGraphZoom"] = "out";
  zoomOut.ariaLabel = "Uzaklaştır";
  const zoomValue = createElement("span", "pattern-room-graph-zoom-value", "100%");
  zoomValue.dataset["patternGraphZoomValue"] = "true";
  const reset = createElement("button", "pattern-room-graph-zoom-button reset", "Sıfırla");
  reset.type = "button";
  reset.dataset["patternGraphZoom"] = "reset";
  reset.ariaLabel = "Yakınlaştırmayı sıfırla";
  const zoomIn = createElement("button", "pattern-room-graph-zoom-button", "+");
  zoomIn.type = "button";
  zoomIn.dataset["patternGraphZoom"] = "in";
  zoomIn.ariaLabel = "Yakınlaştır";
  zoomOut.addEventListener("click", () => {
    onZoomChange("out");
  });
  reset.addEventListener("click", () => {
    onZoomChange("reset");
  });
  zoomIn.addEventListener("click", () => {
    onZoomChange("in");
  });
  controls.append(zoomOut, zoomValue, reset, zoomIn);
  toolbar.append(metrics, controls);
  return { toolbar, zoomValue, zoomOut, zoomIn };
}

export function createDeskPanel(
  data: PatternRoomWorkspaceModel,
  actions: PatternPanelActions,
  onBack: () => void,
  text: PatternWorkspaceTranslator = createPatternWorkspaceTranslator("tr", null)
): HTMLElement {
  const shell = createPanelShell("desk", text("connections.title"), onBack);
  const layout = createElement(
    "div",
    "pattern-room-desk-layout pattern-room-connections-workspace pattern-room-connections-canvas-only"
  );

  const workSurface = createElement("section", "pattern-room-desk-surface");
  workSurface.ariaLabel = text("connections.title");
  const surfaceHeader = createElement("header", "pattern-room-desk-header");
  surfaceHeader.append(
    createElement("span", "pattern-room-kicker", text("connections.kicker")),
    createElement("h2", undefined, data.subject),
    createElement("p", undefined, text("connections.intro"))
  );

  const connectionMap = createElement("div", "pattern-room-connection-map pattern-room-graph-map");
  connectionMap.dataset["patternConnectionMap"] = "true";
  const graphLayout = createGraphLayout(data);
  const stage = createElement("div", "pattern-room-graph-stage");
  stage.dataset["patternGraphStage"] = "true";
  const scene = createElement("div", "pattern-room-graph-scene");
  scene.dataset["patternGraphScene"] = "true";
  scene.dataset["patternGraphLayout"] = GRAPH_LAYOUT_VERSION;
  const columnLabels = createElement("div", "pattern-room-graph-column-labels");
  columnLabels.append(
    createGraphColumnLabel("source"),
    createGraphColumnLabel("evidence"),
    createGraphColumnLabel("node")
  );

  const relationship = createElement(
    "div",
    "pattern-room-connection-list pattern-room-graph-edges"
  );
  relationship.dataset["patternConnectionList"] = "true";
  const graphNodes = createElement("div", "pattern-room-claim-objects pattern-room-graph-nodes");
  const connectionButtons: HTMLButtonElement[] = [];
  const updateSelectedConnection = (connectionId: string | null): void => {
    connectionButtons.forEach((button) => {
      const isSelected = button.dataset["patternConnectionEdge"] === connectionId;
      button.ariaPressed = isSelected ? "true" : "false";
      if (isSelected) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }
    });
  };

  [...data.connections]
    .sort((left, right) => left.id.localeCompare(right.id, "tr"))
    .forEach((connection, index) => {
      const source = graphLayout.nodesById.get(connection.sourceId);
      const target = graphLayout.nodesById.get(connection.targetId);
      if (source === undefined || target === undefined) {
        return;
      }
      const button = createGraphEdge(connection, source, target, index, (connectionId) => {
        actions.selectConnection(connectionId);
        updateSelectedConnection(connectionId);
      });
      connectionButtons.push(button);
      relationship.append(button);
    });
  graphLayout.nodes.forEach((node, index) => {
    graphNodes.append(createGraphNode(node, index));
  });
  updateSelectedConnection(actions.getSelectedConnectionId());
  scene.append(columnLabels, relationship, graphNodes);
  stage.append(scene);

  const viewport = createElement("div", "pattern-room-graph-viewport");
  viewport.dataset["patternGraphViewport"] = "true";
  viewport.tabIndex = 0;
  viewport.ariaLabel = "Kaydırılabilir ilişki grafiği";
  viewport.append(stage);

  let zoom = 1;
  const toolbarElements = createGraphToolbar(
    graphLayout.nodes.length,
    data.connections.length,
    (direction) => {
      zoom =
        direction === "reset"
          ? 1
          : direction === "in"
            ? Math.min(GRAPH_ZOOM_MAX, zoom + GRAPH_ZOOM_STEP)
            : Math.max(GRAPH_ZOOM_MIN, zoom - GRAPH_ZOOM_STEP);
      updateGraphScale(
        stage,
        scene,
        toolbarElements.zoomValue,
        toolbarElements.zoomOut,
        toolbarElements.zoomIn,
        graphLayout,
        zoom
      );
    }
  );
  updateGraphScale(
    stage,
    scene,
    toolbarElements.zoomValue,
    toolbarElements.zoomOut,
    toolbarElements.zoomIn,
    graphLayout,
    zoom
  );

  connectionMap.append(toolbarElements.toolbar, viewport);
  if (graphLayout.nodes.length === 0) {
    connectionMap.append(
      createEmptyState("Grafikte gösterilecek iddia veya karşı iz yok.", "data-empty")
    );
  } else if (data.connections.length === 0) {
    connectionMap.append(
      createEmptyState(
        "Henüz seçilebilir bir bağlantı yok. Sağ panelden yeni bağlantı kurabilirsiniz.",
        "data-empty",
        { compact: true, className: "pattern-room-connection-empty" }
      )
    );
  }

  const hint = createElement(
    "p",
    "pattern-room-graph-hint",
    "Grafiği kaydırarak gezebilirsiniz. Yakınlaştırma yalnız bu görünümü etkiler; vaka ve overlay verisini değiştirmez."
  );
  workSurface.append(surfaceHeader, connectionMap, hint);
  layout.append(workSurface);
  shell.append(layout);
  return shell;
}
