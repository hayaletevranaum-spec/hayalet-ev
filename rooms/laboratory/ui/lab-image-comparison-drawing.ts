type Side = "primary" | "reference";
type Mode = "pen" | "circle";
type Point = { x: number; y: number };
type Mark =
  | { id: string; side: Side; kind: "pen"; color: string; width: number; points: Point[] }
  | {
      id: string;
      side: Side;
      kind: "circle";
      color: string;
      width: number;
      cx: number;
      cy: number;
      rx: number;
      ry: number;
    };

const PANEL = '[data-comparison-tool-panel="draw"]';
const STAGE = ".labx-workspace-comparison__media-stage, .labx-workspace-comparison__split";
const TILE = 720;
const marks: Record<Side, Mark[]> = { primary: [], reference: [] };
let active = false;
let bound = false;
let mode: Mode = "pen";
let color = getDrawingDefaultColor();
let width = 4;
let draft: Mark | null = null;
let pointerId: number | null = null;
let pairKey = "";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
function getDrawingDefaultColor(): string {
  if (typeof document === "undefined" || typeof getComputedStyle === "undefined") {
    return "rgb(255, 59, 48)";
  }
  const style = getComputedStyle(document.documentElement);
  const token = style.getPropertyValue("--lab-drawing").trim();
  return token || "rgb(255, 59, 48)";
}
function image(side: Side) {
  return document.querySelector<HTMLImageElement>(
    `.labx-workspace-comparison__image[data-lab-preserve-media="workspace-comparison-${side}"]`
  );
}
function pairSignature() {
  const a = image("primary");
  const b = image("reference");
  return `${a?.currentSrc || a?.src || ""}|${b?.currentSrc || b?.src || ""}`;
}
function syncPair() {
  const next = pairSignature();
  if (next === "|") return;
  if (pairKey !== "" && pairKey !== next) {
    marks.primary = [];
    marks.reference = [];
    draft = null;
  }
  pairKey = next;
}
function sideTransform(side: Side) {
  return side === "primary"
    ? "var(--lab-comparison-primary-transform, none)"
    : "var(--lab-comparison-reference-transform, none)";
}
function overlayHost(side: Side) {
  const target = image(side);
  return (
    target?.closest<HTMLElement>(".labx-workspace-comparison__media-frame") ||
    target?.closest<HTMLElement>(".labx-workspace-comparison__split") ||
    null
  );
}
function svg<K extends keyof SVGElementTagNameMap>(name: K) {
  return document.createElementNS("http://www.w3.org/2000/svg", name);
}
function syncOverlayBox(
  target: SVGSVGElement,
  host: HTMLElement,
  source: HTMLImageElement,
  side: Side
) {
  target.style.transform = sideTransform(side);
  if (!host.classList.contains("labx-workspace-comparison__split")) {
    Object.assign(target.style, { inset: "0", left: "0", top: "0", width: "100%", height: "100%" });
    return;
  }
  const hw = Math.max(1, host.clientWidth);
  const hh = Math.max(1, host.clientHeight);
  const nw = Math.max(1, source.naturalWidth);
  const nh = Math.max(1, source.naturalHeight);
  const scale = Math.min(hw / nw, hh / nh);
  const w = nw * scale;
  const h = nh * scale;
  Object.assign(target.style, {
    inset: "auto",
    left: `${String((hw - w) / 2)}px`,
    top: `${String((hh - h) / 2)}px`,
    width: `${String(w)}px`,
    height: `${String(h)}px`,
  });
}
function ensureOverlay(side: Side): SVGSVGElement | null {
  const host = overlayHost(side);
  const source = image(side);
  if (!host || !source) return null;
  let target = Array.from(
    host.querySelectorAll<SVGSVGElement>(".labx-comparison-drawing-overlay")
  ).find((entry) => entry.dataset["side"] === side && entry.parentElement === host);
  if (!target) {
    target = svg("svg");
    target.classList.add("labx-comparison-drawing-overlay");
    target.dataset["side"] = side;
    target.setAttribute("viewBox", "0 0 1000 1000");
    target.setAttribute("preserveAspectRatio", "none");
    target.setAttribute("aria-hidden", "true");
    Object.assign(target.style, {
      position: "absolute",
      pointerEvents: "none",
      overflow: "visible",
      transformOrigin: "center center",
      zIndex: "9",
    });
    host.append(target);
  }
  syncOverlayBox(target, host, source, side);
  render(side, target);
  return target;
}
function stroke(el: SVGPathElement | SVGEllipseElement, mark: Mark) {
  el.setAttribute("fill", "none");
  el.setAttribute("stroke", mark.color);
  el.setAttribute("stroke-width", String(mark.width));
  el.setAttribute("stroke-linecap", "round");
  el.setAttribute("stroke-linejoin", "round");
  el.setAttribute("vector-effect", "non-scaling-stroke");
}
function renderMark(target: SVGSVGElement, mark: Mark) {
  if (mark.kind === "pen") {
    if (mark.points.length === 0) return;
    const el = svg("path");
    el.setAttribute(
      "d",
      mark.points
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x * 1000} ${point.y * 1000}`)
        .join(" ")
    );
    stroke(el, mark);
    target.append(el);
    return;
  }
  const el = svg("ellipse");
  el.setAttribute("cx", String(mark.cx * 1000));
  el.setAttribute("cy", String(mark.cy * 1000));
  el.setAttribute("rx", String(mark.rx * 1000));
  el.setAttribute("ry", String(mark.ry * 1000));
  stroke(el, mark);
  target.append(el);
}
function render(side: Side, existing?: SVGSVGElement | null) {
  const target = existing || ensureOverlay(side);
  if (!target) return;
  target.replaceChildren();
  marks[side].forEach((mark) => renderMark(target, mark));
  if (draft?.side === side) renderMark(target, draft);
}
function activeSide(): Side {
  const split = document.querySelector<HTMLElement>(
    ".labx-workspace-comparison__split[data-active-side]"
  );
  if (split?.dataset["activeSide"] === "reference") return "reference";
  const pane = document.querySelector<HTMLElement>(
    '.labx-workspace-comparison__pane[data-active="true"][data-side]'
  );
  return pane?.dataset["side"] === "reference" ? "reference" : "primary";
}
function stageSide(stage: HTMLElement): Side {
  const explicit = stage.dataset["labComparisonRoiSide"];
  if (explicit === "primary" || explicit === "reference") return explicit;
  return stage.closest<HTMLElement>("[data-side]")?.dataset["side"] === "reference"
    ? "reference"
    : activeSide();
}
function normalizedPoint(target: SVGSVGElement, event: PointerEvent): Point | null {
  const matrix = target.getScreenCTM();
  if (!matrix) return null;
  const point = target.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const local = point.matrixTransform(matrix.inverse());
  return { x: clamp(local.x / 1000, 0, 1), y: clamp(local.y / 1000, 0, 1) };
}
function pointerDown(event: PointerEvent) {
  if (!active || event.button !== 0 || !(event.target instanceof Element)) return;
  const stage = event.target.closest<HTMLElement>(STAGE);
  if (!stage) return;
  const side = stageSide(stage);
  const target = ensureOverlay(side);
  if (!target) return;
  const point = normalizedPoint(target, event);
  if (!point) return;
  event.preventDefault();
  event.stopPropagation();
  pointerId = event.pointerId;
  const base = {
    id: `draw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    side,
    color,
    width,
  };
  draft =
    mode === "circle"
      ? { ...base, kind: "circle", cx: point.x, cy: point.y, rx: 0, ry: 0 }
      : { ...base, kind: "pen", points: [point] };
  stage.setPointerCapture(event.pointerId);
  render(side, target);
}
function pointerMove(event: PointerEvent) {
  if (!draft || pointerId !== event.pointerId) return;
  const target = ensureOverlay(draft.side);
  if (!target) return;
  const point = normalizedPoint(target, event);
  if (!point) return;
  event.preventDefault();
  if (draft.kind === "circle") {
    draft.rx = Math.abs(point.x - draft.cx);
    draft.ry = Math.abs(point.y - draft.cy);
  } else if (draft.points.length < 640) {
    const last = draft.points[draft.points.length - 1];
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= 0.002) draft.points.push(point);
  }
  render(draft.side, target);
}
function pointerUp(event: PointerEvent) {
  if (!draft || pointerId !== event.pointerId) return;
  event.preventDefault();
  const mark = draft;
  draft = null;
  pointerId = null;
  const valid = mark.kind === "pen" ? mark.points.length > 1 : mark.rx >= 0.003 || mark.ry >= 0.003;
  if (valid) {
    marks[mark.side].push(mark);
    if (marks[mark.side].length > 200) marks[mark.side].splice(0, marks[mark.side].length - 200);
  }
  render(mark.side);
  syncPanelState();
}
function cancelDraft() {
  const side = draft?.side;
  draft = null;
  pointerId = null;
  if (side) render(side);
}
function panelMarkup() {
  return `
    <div class="labx-face-landmark-panel__align-grid">
      <button type="button" data-lab-drawing-action="pen">Kalem</button>
      <button type="button" data-lab-drawing-action="circle">Daire</button>
    </div>
    <div class="labx-face-landmark-panel__controls">
      <label><span>Renk</span><input type="color" value="${color}" data-lab-drawing-color aria-label="Çizim rengi" /></label>
      <label><span>Çizgi boyu <strong data-lab-drawing-width-value>${String(width)}</strong></span><input type="range" min="1" max="16" step="1" value="${String(width)}" data-lab-drawing-width aria-label="Çizgi boyu" /></label>
    </div>
    <div class="labx-face-landmark-panel__align-grid">
      <button type="button" data-lab-drawing-action="clear-active">Aktif tarafı temizle</button>
      <button type="button" data-lab-drawing-action="clear-all">Tümünü temizle</button>
    </div>
    <p class="labx-face-landmark-panel__status" data-lab-drawing-status></p>`;
}
function syncPanelState() {
  const panel = document.querySelector<HTMLElement>(PANEL);
  if (!panel) return;
  panel.querySelectorAll<HTMLButtonElement>("[data-lab-drawing-action]").forEach((button) => {
    const selected = button.dataset["labDrawingAction"] === mode;
    if (
      button.dataset["labDrawingAction"] === "pen" ||
      button.dataset["labDrawingAction"] === "circle"
    ) {
      button.dataset["active"] = selected ? "true" : "false";
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      button.style.borderColor = selected ? "var(--lab-accent)" : "";
      button.style.background = selected ? "var(--lab-accent-bg)" : "";
    }
  });
  const value = panel.querySelector<HTMLElement>("[data-lab-drawing-width-value]");
  const nextWidth = String(width);
  if (value && value.textContent !== nextWidth) value.textContent = nextWidth;
  const status = panel.querySelector<HTMLElement>("[data-lab-drawing-status]");
  const nextStatus = `A: ${marks.primary.length} işaret · B: ${marks.reference.length} işaret`;
  if (status && status.textContent !== nextStatus) status.textContent = nextStatus;
}
function syncPanel() {
  const popover = document.querySelector<HTMLElement>(
    '.labx-icon-rail-popover[data-slot="image-comparison"]'
  );
  const settings = popover?.querySelector<HTMLElement>(".labx-image-comparison-settings");
  let panel = document.querySelector<HTMLElement>(PANEL);
  if (!active || !settings) {
    panel?.remove();
    return;
  }
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "labx-face-landmark-panel";
    panel.dataset["comparisonToolPanel"] = "draw";
    panel.style.display = "grid";
    panel.style.gap = "var(--lab-space-2)";
    panel.innerHTML = panelMarkup();
  }
  if (panel.parentElement !== settings) settings.prepend(panel);
  syncPanelState();
}
function drawingClick(event: Event) {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>("[data-lab-drawing-action]");
  if (!button) return;
  const action = button.dataset["labDrawingAction"];
  if (action === "pen" || action === "circle") mode = action;
  else if (action === "clear-active") marks[activeSide()] = [];
  else if (action === "clear-all") {
    marks.primary = [];
    marks.reference = [];
  } else return;
  cancelDraft();
  render("primary");
  render("reference");
  syncPanelState();
}
function drawingInput(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return;
  if (event.target.matches("[data-lab-drawing-color]")) {
    color = /^#[0-9a-f]{6}$/i.test(event.target.value)
      ? event.target.value
      : getDrawingDefaultColor();
  } else if (event.target.matches("[data-lab-drawing-width]")) {
    const next = Number(event.target.value);
    width = Number.isFinite(next) ? Math.round(clamp(next, 1, 16)) : 4;
    syncPanelState();
  }
}
function containedRect(source: HTMLImageElement, tileX: number) {
  const nw = source.naturalWidth || 1;
  const nh = source.naturalHeight || 1;
  const scale = Math.min(TILE / nw, TILE / nh);
  const w = nw * scale;
  const h = nh * scale;
  return { x: tileX + (TILE - w) / 2, y: (TILE - h) / 2, width: w, height: h };
}
function paint(
  context: CanvasRenderingContext2D,
  mark: Mark,
  rect: ReturnType<typeof containedRect>
) {
  context.save();
  context.strokeStyle = mark.color;
  context.lineWidth = mark.width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  if (mark.kind === "pen") {
    const first = mark.points[0];
    if (first) {
      context.moveTo(rect.x + first.x * rect.width, rect.y + first.y * rect.height);
      mark.points
        .slice(1)
        .forEach((point) =>
          context.lineTo(rect.x + point.x * rect.width, rect.y + point.y * rect.height)
        );
    }
  } else {
    context.ellipse(
      rect.x + mark.cx * rect.width,
      rect.y + mark.cy * rect.height,
      mark.rx * rect.width,
      mark.ry * rect.height,
      0,
      0,
      Math.PI * 2
    );
  }
  context.stroke();
  context.restore();
}

export function createLabImageComparisonAnnotationOverlayDataUrl(): string | null {
  syncPair();
  if (marks.primary.length === 0 && marks.reference.length === 0) return null;
  const a = image("primary");
  const b = image("reference");
  if (!a || !b || a.naturalWidth <= 0 || b.naturalWidth <= 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = TILE * 2;
  canvas.height = TILE;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const aRect = containedRect(a, 0);
  const bRect = containedRect(b, TILE);
  marks.primary.forEach((mark) => paint(context, mark, aRect));
  marks.reference.forEach((mark) => paint(context, mark, bRect));
  return canvas.toDataURL("image/png");
}

export function syncLabImageComparisonDrawingUi(nextActive: boolean) {
  active = nextActive;
  syncPair();
  ensureOverlay("primary");
  ensureOverlay("reference");
  syncPanel();
}

export function ensureLabImageComparisonDrawingBound() {
  if (bound || typeof document === "undefined") return;
  bound = true;
  document.addEventListener("pointerdown", pointerDown, true);
  window.addEventListener("pointermove", pointerMove, true);
  window.addEventListener("pointerup", pointerUp, true);
  window.addEventListener("pointercancel", cancelDraft, true);
  window.addEventListener("resize", () => {
    ensureOverlay("primary");
    ensureOverlay("reference");
  });
  document.addEventListener("click", drawingClick, true);
  document.addEventListener("input", drawingInput, true);
}
