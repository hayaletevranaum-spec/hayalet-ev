import {
  buildLabFaceAlignmentAnchors,
  buildLabFaceLandmarkMetrics,
} from "../domain/lab-face-landmark-geometry.js";
import type {
  LabFaceAlignmentAnchors,
  LabFaceLandmarkMetrics,
  LabFaceLandmarkPoint,
} from "../domain/lab-face-landmark-geometry.js";

const MEDIAPIPE_VERSION = "1.0.0";
const MEDIAPIPE_MODULE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/+esm`;
const MEDIAPIPE_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const FACE_LANDMARK_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const OPERATION_FIELD_PREFIX = "operationSettings.image-comparison.";
const SVG_NS = "http://www.w3.org/2000/svg";

type LabFaceLandmarkSide = "primary" | "reference";
type LabFaceLandmarkViewMode = "keypoints" | "points" | "contours" | "mesh";
type LabFaceAlignmentMode = "eyes" | "nose" | "mouth" | "face";

type MediaPipeConnection = {
  end: number;
  start: number;
};

type MediaPipeFaceLandmarkerResult = {
  faceLandmarks?: LabFaceLandmarkPoint[][];
};

type MediaPipeFaceLandmarkerInstance = {
  detect(image: HTMLImageElement): MediaPipeFaceLandmarkerResult;
};

type MediaPipeFaceLandmarkerFactory = {
  FACE_LANDMARKS_CONTOURS?: readonly MediaPipeConnection[];
  FACE_LANDMARKS_TESSELATION?: readonly MediaPipeConnection[];
  createFromOptions(
    fileset: unknown,
    options: {
      baseOptions: { modelAssetPath: string };
      minFaceDetectionConfidence: number;
      minFacePresenceConfidence: number;
      minTrackingConfidence: number;
      numFaces: number;
      outputFaceBlendshapes: boolean;
      outputFacialTransformationMatrixes: boolean;
      runningMode: "IMAGE";
    }
  ): Promise<MediaPipeFaceLandmarkerInstance>;
};

type MediaPipeVisionModule = {
  FaceLandmarker: MediaPipeFaceLandmarkerFactory;
  FilesetResolver: {
    forVisionTasks(basePath: string): Promise<unknown>;
  };
};

type CachedFaceRecord = {
  anchors: LabFaceAlignmentAnchors;
  cacheKey: string;
  height: number;
  landmarks: LabFaceLandmarkPoint[];
  metrics: LabFaceLandmarkMetrics;
  width: number;
};

type FaceRuntimeSettings = {
  autoDetect: boolean;
  enabled: boolean;
  opacity: number;
  pointScale: number;
  showLabels: boolean;
  viewMode: LabFaceLandmarkViewMode;
};

const KEYPOINTS: ReadonlyArray<{ index: number; label: string }> = [
  { index: 10, label: "Alın" },
  { index: 152, label: "Çene" },
  { index: 234, label: "Yüz L" },
  { index: 454, label: "Yüz R" },
  { index: 33, label: "Göz R dış" },
  { index: 133, label: "Göz R iç" },
  { index: 362, label: "Göz L iç" },
  { index: 263, label: "Göz L dış" },
  { index: 1, label: "Burun" },
  { index: 61, label: "Ağız L" },
  { index: 291, label: "Ağız R" },
];

const METRIC_ROWS: ReadonlyArray<{
  key: keyof LabFaceLandmarkMetrics;
  label: string;
  unit: "%" | "°" | "oran";
}> = [
  { key: "faceAspectRatio", label: "Yüz en / boy", unit: "oran" },
  { key: "interEyePercent", label: "Gözler arası / yüz eni", unit: "%" },
  { key: "rightEyeWidthPercent", label: "Sağ göz / yüz eni", unit: "%" },
  { key: "leftEyeWidthPercent", label: "Sol göz / yüz eni", unit: "%" },
  { key: "noseWidthPercent", label: "Burun eni / yüz eni", unit: "%" },
  { key: "noseLengthPercent", label: "Burun uzunluğu / yüz boyu", unit: "%" },
  { key: "mouthWidthPercent", label: "Ağız eni / yüz eni", unit: "%" },
  { key: "lipHeightPercent", label: "Dudak yüksekliği / yüz boyu", unit: "%" },
  { key: "lowerFaceWidthPercent", label: "Alt yüz eni / yüz eni", unit: "%" },
  { key: "browEyePercent", label: "Kaş-göz / yüz boyu", unit: "%" },
  { key: "eyeNosePercent", label: "Göz-burun / yüz boyu", unit: "%" },
  { key: "noseMouthPercent", label: "Burun-ağız / yüz boyu", unit: "%" },
  { key: "mouthChinPercent", label: "Ağız-çene / yüz boyu", unit: "%" },
  { key: "symmetryDeltaPercent", label: "Sol-sağ simetri farkı", unit: "%" },
  { key: "eyeLineAngleDeg", label: "Göz hattı açısı", unit: "°" },
  { key: "faceAxisAngleDeg", label: "Yüz ekseni açısı", unit: "°" },
];

const cache = new Map<string, CachedFaceRecord | null>();
const settings: FaceRuntimeSettings = {
  autoDetect: true,
  enabled: true,
  opacity: 0.88,
  pointScale: 1,
  showLabels: false,
  viewMode: "contours",
};

let bound = false;
let detectionRunning = false;
let faceLandmarkerPromise: Promise<MediaPipeFaceLandmarkerInstance> | null = null;
let faceLandmarkerFactory: MediaPipeFaceLandmarkerFactory | null = null;
let lastError: string | null = null;
let lastInfo = "Yüz landmark aracı hazır.";
let syncQueued = false;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function resolveVisionModule(value: unknown): MediaPipeVisionModule {
  const root = asRecord(value);
  const fallback = root === null ? null : asRecord(root["default"]);
  const candidate = root ?? fallback;
  const faceLandmarker = candidate?.["FaceLandmarker"] ?? fallback?.["FaceLandmarker"];
  const filesetResolver = candidate?.["FilesetResolver"] ?? fallback?.["FilesetResolver"];
  if (typeof faceLandmarker !== "function" && asRecord(faceLandmarker) === null) {
    throw new Error("MediaPipe FaceLandmarker modülü bulunamadı.");
  }
  if (typeof filesetResolver !== "function" && asRecord(filesetResolver) === null) {
    throw new Error("MediaPipe FilesetResolver modülü bulunamadı.");
  }
  return {
    FaceLandmarker: faceLandmarker as MediaPipeFaceLandmarkerFactory,
    FilesetResolver: filesetResolver as MediaPipeVisionModule["FilesetResolver"],
  };
}

async function loadFaceLandmarker() {
  if (faceLandmarkerPromise !== null) {
    return faceLandmarkerPromise;
  }
  faceLandmarkerPromise = (async function () {
    const importedModule = (await import(/* @vite-ignore */ MEDIAPIPE_MODULE_URL)) as unknown;
    const vision = resolveVisionModule(importedModule);
    const fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
    faceLandmarkerFactory = vision.FaceLandmarker;
    return vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: FACE_LANDMARK_MODEL_URL,
      },
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      runningMode: "IMAGE",
    });
  })().catch(function (error: unknown) {
    faceLandmarkerPromise = null;
    throw error;
  });
  return faceLandmarkerPromise;
}

function getComparisonPopover() {
  return document.querySelector<HTMLElement>(
    '.labx-icon-rail-popover[data-slot="image-comparison"]'
  );
}

function isFaceToolActive() {
  return getComparisonPopover()?.dataset["comparisonTool"] === "face-landmarks";
}

function getComparisonImage(side: LabFaceLandmarkSide) {
  return document.querySelector<HTMLImageElement>(
    `[data-lab-preserve-media="workspace-comparison-${side}"]`
  );
}

function getCacheKey(image: HTMLImageElement) {
  return `${image.currentSrc || image.src}|${String(image.naturalWidth)}x${String(image.naturalHeight)}`;
}

async function ensureImageDecoded(image: HTMLImageElement) {
  if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
    return;
  }
  if (typeof image.decode === "function") {
    await image.decode();
    return;
  }
  await new Promise<void>(function (resolve, reject) {
    image.addEventListener(
      "load",
      function () {
        resolve();
      },
      { once: true }
    );
    image.addEventListener(
      "error",
      function () {
        reject(new Error("Görsel yüklenemedi."));
      },
      { once: true }
    );
  });
}

function buildRecord(image: HTMLImageElement, landmarks: LabFaceLandmarkPoint[]) {
  const metrics = buildLabFaceLandmarkMetrics(landmarks, image.naturalWidth, image.naturalHeight);
  const anchors = buildLabFaceAlignmentAnchors(landmarks, image.naturalWidth, image.naturalHeight);
  if (metrics === null || anchors === null) {
    return null;
  }
  return {
    anchors,
    cacheKey: getCacheKey(image),
    height: image.naturalHeight,
    landmarks,
    metrics,
    width: image.naturalWidth,
  } satisfies CachedFaceRecord;
}

async function detectImage(image: HTMLImageElement, force: boolean) {
  await ensureImageDecoded(image);
  const key = getCacheKey(image);
  if (!force && cache.has(key)) {
    return cache.get(key) ?? null;
  }
  const landmarker = await loadFaceLandmarker();
  const result = landmarker.detect(image);
  const landmarks = result.faceLandmarks?.[0] ?? null;
  const record = landmarks === null ? null : buildRecord(image, landmarks);
  cache.set(key, record);
  return record;
}

async function detectCurrentPair(force: boolean) {
  if (detectionRunning) {
    return;
  }
  const primary = getComparisonImage("primary");
  const reference = getComparisonImage("reference");
  if (primary === null || reference === null) {
    lastInfo = "Karşılaştırma için iki görsel gerekli.";
    queueSync();
    return;
  }
  detectionRunning = true;
  lastError = null;
  lastInfo = "MediaPipe yüz modeli yükleniyor ve A/B yüzleri ölçülüyor…";
  queueSync();
  try {
    const primaryRecord = await detectImage(primary, force);
    const referenceRecord = await detectImage(reference, force);
    if (primaryRecord === null && referenceRecord === null) {
      lastInfo = "A ve B görsellerinde yüz bulunamadı.";
    } else if (primaryRecord === null) {
      lastInfo = "A görselinde yüz bulunamadı; B yüzü hazır.";
    } else if (referenceRecord === null) {
      lastInfo = "B görselinde yüz bulunamadı; A yüzü hazır.";
    } else {
      lastInfo = "A ve B yüz landmarkları hazır.";
    }
  } catch (error: unknown) {
    lastError = error instanceof Error ? error.message : String(error);
    lastInfo = "Yüz landmark modeli çalıştırılamadı.";
  } finally {
    detectionRunning = false;
    queueSync();
  }
}

function getCachedRecord(side: LabFaceLandmarkSide) {
  const image = getComparisonImage(side);
  if (image === null || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    return null;
  }
  return cache.get(getCacheKey(image)) ?? null;
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(name: K) {
  return document.createElementNS(SVG_NS, name);
}

function getConnectionSet(mode: LabFaceLandmarkViewMode) {
  if (faceLandmarkerFactory === null) {
    return [] as readonly MediaPipeConnection[];
  }
  if (mode === "mesh") {
    return faceLandmarkerFactory.FACE_LANDMARKS_TESSELATION ?? [];
  }
  if (mode === "contours") {
    return faceLandmarkerFactory.FACE_LANDMARKS_CONTOURS ?? [];
  }
  return [];
}

function getOverlayHost(image: HTMLImageElement) {
  return image.parentElement instanceof HTMLElement ? image.parentElement : null;
}

function getContainedRect(
  hostWidth: number,
  hostHeight: number,
  imageWidth: number,
  imageHeight: number
) {
  if (hostWidth <= 0 || hostHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return null;
  }
  const scale = Math.min(hostWidth / imageWidth, hostHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    height,
    left: (hostWidth - width) / 2,
    top: (hostHeight - height) / 2,
    width,
  };
}

function getPointPosition(
  point: LabFaceLandmarkPoint,
  contained: { height: number; left: number; top: number; width: number }
) {
  return {
    x: contained.left + point.x * contained.width,
    y: contained.top + point.y * contained.height,
  };
}

function appendConnections(
  svg: SVGSVGElement,
  points: readonly LabFaceLandmarkPoint[],
  connections: readonly MediaPipeConnection[],
  contained: { height: number; left: number; top: number; width: number }
) {
  connections.forEach(function (connection) {
    const start = points[connection.start];
    const end = points[connection.end];
    if (start === undefined || end === undefined) {
      return;
    }
    const a = getPointPosition(start, contained);
    const b = getPointPosition(end, contained);
    const line = createSvgElement("line");
    line.setAttribute("x1", String(a.x));
    line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x));
    line.setAttribute("y2", String(b.y));
    line.setAttribute("vector-effect", "non-scaling-stroke");
    line.classList.add("labx-face-landmark-overlay__line");
    svg.append(line);
  });
}

function appendPoint(
  svg: SVGSVGElement,
  point: LabFaceLandmarkPoint,
  contained: { height: number; left: number; top: number; width: number },
  options: { label?: string; prominent?: boolean }
) {
  const position = getPointPosition(point, contained);
  const circle = createSvgElement("circle");
  circle.setAttribute("cx", String(position.x));
  circle.setAttribute("cy", String(position.y));
  circle.setAttribute("r", String((options.prominent ? 2.7 : 1.45) * settings.pointScale));
  circle.setAttribute("vector-effect", "non-scaling-stroke");
  circle.classList.add("labx-face-landmark-overlay__point");
  if (options.prominent) {
    circle.classList.add("labx-face-landmark-overlay__point--key");
  }
  svg.append(circle);
  if (settings.showLabels && options.label) {
    const text = createSvgElement("text");
    text.setAttribute("x", String(position.x + 5));
    text.setAttribute("y", String(position.y - 5));
    text.setAttribute("vector-effect", "non-scaling-stroke");
    text.classList.add("labx-face-landmark-overlay__label");
    text.textContent = options.label;
    svg.append(text);
  }
}

function renderOverlay(
  side: LabFaceLandmarkSide,
  image: HTMLImageElement,
  record: CachedFaceRecord
) {
  const host = getOverlayHost(image);
  if (host === null) {
    return;
  }
  const contained = getContainedRect(
    host.clientWidth,
    host.clientHeight,
    image.naturalWidth,
    image.naturalHeight
  );
  if (contained === null) {
    return;
  }
  const signature = [
    record.cacheKey,
    settings.viewMode,
    settings.opacity,
    settings.pointScale,
    settings.showLabels,
    host.clientWidth,
    host.clientHeight,
  ].join("|");
  let svg = host.querySelector<SVGSVGElement>(
    `:scope > .labx-face-landmark-overlay[data-side="${side}"]`
  );
  if (svg?.dataset["renderSignature"] === signature) {
    return;
  }
  if (svg === null) {
    svg = createSvgElement("svg");
    svg.classList.add("labx-face-landmark-overlay");
    svg.dataset["side"] = side;
    host.append(svg);
  }
  svg.replaceChildren();
  svg.dataset["renderSignature"] = signature;
  svg.setAttribute("viewBox", `0 0 ${String(host.clientWidth)} ${String(host.clientHeight)}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.style.opacity = String(settings.opacity);
  const clipPath = getComputedStyle(image).clipPath;
  svg.style.clipPath = clipPath === "none" ? "" : clipPath;

  if (settings.viewMode === "points") {
    record.landmarks.forEach(function (point) {
      appendPoint(svg, point, contained, {});
    });
  } else if (settings.viewMode === "contours" || settings.viewMode === "mesh") {
    appendConnections(svg, record.landmarks, getConnectionSet(settings.viewMode), contained);
  }

  KEYPOINTS.forEach(function (entry) {
    const point = record.landmarks[entry.index];
    if (point !== undefined) {
      appendPoint(svg, point, contained, { label: entry.label, prominent: true });
    }
  });
}

function removeOverlays(side?: LabFaceLandmarkSide) {
  const selector =
    side === undefined
      ? ".labx-face-landmark-overlay"
      : `.labx-face-landmark-overlay[data-side="${side}"]`;
  document.querySelectorAll<SVGSVGElement>(selector).forEach(function (overlay) {
    overlay.remove();
  });
}

function renderOverlays() {
  if (!settings.enabled) {
    removeOverlays();
    return;
  }
  (["primary", "reference"] as const).forEach(function (side) {
    const image = getComparisonImage(side);
    const record = getCachedRecord(side);
    if (image !== null && record !== null) {
      renderOverlay(side, image, record);
    } else {
      removeOverlays(side);
    }
  });
}

function formatMetric(value: number | null, unit: "%" | "°" | "oran") {
  if (value === null) {
    return "—";
  }
  const formatted = value.toFixed(unit === "oran" ? 3 : 2);
  return unit === "oran" ? formatted : `${formatted}${unit}`;
}

function renderMetricsMarkup() {
  const primary = getCachedRecord("primary")?.metrics ?? null;
  const reference = getCachedRecord("reference")?.metrics ?? null;
  if (primary === null && reference === null) {
    return '<p class="labx-face-landmark-panel__empty">Ölçüm için önce A ve B yüzlerini algılayın.</p>';
  }
  return `
    <div class="labx-face-landmark-metrics__head"><span>Ölçü</span><span>A</span><span>B</span><span>|Δ|</span></div>
    ${METRIC_ROWS.map(function (row) {
      const a = primary?.[row.key] ?? null;
      const b = reference?.[row.key] ?? null;
      const delta = a === null || b === null ? null : Math.abs(a - b);
      return `<div class="labx-face-landmark-metrics__row"><strong>${row.label}</strong><span>${formatMetric(a, row.unit)}</span><span>${formatMetric(b, row.unit)}</span><span>${formatMetric(delta, row.unit)}</span></div>`;
    }).join("")}
  `;
}

function createPanel() {
  const panel = document.createElement("section");
  panel.className = "labx-comparison-toolbox labx-face-landmark-panel";
  panel.dataset["comparisonToolPanel"] = "face-landmarks";
  panel.dataset["labFaceLandmarkPanel"] = "true";
  panel.innerHTML = `
    <div class="labx-face-landmark-panel__actions">
      <button type="button" data-lab-face-landmark-action="detect">Yüzleri Algıla / Yenile</button>
    </div>
    <p class="labx-face-landmark-panel__status" data-lab-face-landmark-status="true"></p>
    <div class="labx-face-landmark-panel__controls">
      <label><span>Overlay</span><input type="checkbox" data-lab-face-landmark-setting="enabled" /></label>
      <label><span>Otomatik algıla</span><input type="checkbox" data-lab-face-landmark-setting="autoDetect" /></label>
      <label><span>Görünüm</span><select data-lab-face-landmark-setting="viewMode"><option value="keypoints">Ana noktalar</option><option value="contours">Kontur</option><option value="mesh">Mesh</option><option value="points">Tüm noktalar</option></select></label>
      <label><span>Opaklık</span><input type="number" min="0.1" max="1" step="0.05" data-lab-face-landmark-setting="opacity" /></label>
      <label><span>Nokta ölçeği</span><input type="number" min="0.5" max="2.5" step="0.1" data-lab-face-landmark-setting="pointScale" /></label>
      <label><span>Etiketler</span><input type="checkbox" data-lab-face-landmark-setting="showLabels" /></label>
    </div>
    <div class="labx-face-landmark-panel__align">
      <span class="labx-card__eyebrow">B'yi A'ya hizala</span>
      <div class="labx-face-landmark-panel__align-grid">
        <button type="button" data-lab-face-landmark-action="align-eyes">Göz hattı</button>
        <button type="button" data-lab-face-landmark-action="align-nose">Burun ucu</button>
        <button type="button" data-lab-face-landmark-action="align-mouth">Ağız merkezi</button>
        <button type="button" data-lab-face-landmark-action="align-face">Yüz merkezi</button>
      </div>
    </div>
    <div class="labx-face-landmark-metrics" data-lab-face-landmark-metrics="true"></div>
    <p class="labx-operation-card__reason">Geometrik oranlar kimlik doğrulama veya “aynı kişi” skoru değildir.</p>
    <p class="labx-operation-card__reason">İlk model/WASM yüklemesi internet erişimi gerektirir; görüntü analizi MediaPipe tarafından cihaz üzerinde çalıştırılır.</p>
  `;
  return panel;
}

function syncPanelControls(panel: HTMLElement) {
  const enabled = panel.querySelector<HTMLInputElement>(
    '[data-lab-face-landmark-setting="enabled"]'
  );
  const autoDetect = panel.querySelector<HTMLInputElement>(
    '[data-lab-face-landmark-setting="autoDetect"]'
  );
  const viewMode = panel.querySelector<HTMLSelectElement>(
    '[data-lab-face-landmark-setting="viewMode"]'
  );
  const opacity = panel.querySelector<HTMLInputElement>(
    '[data-lab-face-landmark-setting="opacity"]'
  );
  const pointScale = panel.querySelector<HTMLInputElement>(
    '[data-lab-face-landmark-setting="pointScale"]'
  );
  const showLabels = panel.querySelector<HTMLInputElement>(
    '[data-lab-face-landmark-setting="showLabels"]'
  );
  if (enabled !== null && enabled.checked !== settings.enabled) enabled.checked = settings.enabled;
  if (autoDetect !== null && autoDetect.checked !== settings.autoDetect) {
    autoDetect.checked = settings.autoDetect;
  }
  if (viewMode !== null && viewMode.value !== settings.viewMode) viewMode.value = settings.viewMode;
  if (opacity !== null && opacity.value !== String(settings.opacity)) {
    opacity.value = String(settings.opacity);
  }
  if (pointScale !== null && pointScale.value !== String(settings.pointScale)) {
    pointScale.value = String(settings.pointScale);
  }
  if (showLabels !== null && showLabels.checked !== settings.showLabels) {
    showLabels.checked = settings.showLabels;
  }
}

function ensurePanel() {
  const popover = getComparisonPopover();
  if (popover === null) {
    return null;
  }
  const settingsRoot = popover.querySelector<HTMLElement>(".labx-image-comparison-settings");
  if (settingsRoot === null) {
    return null;
  }
  let panel = settingsRoot.querySelector<HTMLElement>('[data-lab-face-landmark-panel="true"]');
  if (panel === null) {
    panel = createPanel();
    settingsRoot.append(panel);
  }
  syncPanelControls(panel);
  return panel;
}

function updatePanel() {
  const panel = ensurePanel();
  if (panel === null) {
    return;
  }
  const status = panel.querySelector<HTMLElement>('[data-lab-face-landmark-status="true"]');
  if (status !== null) {
    const nextState = lastError !== null ? "error" : detectionRunning ? "loading" : "ready";
    const nextText = lastError === null ? lastInfo : `${lastInfo} ${lastError}`;
    if (status.dataset["state"] !== nextState) {
      status.dataset["state"] = nextState;
    }
    if (status.textContent !== nextText) {
      status.textContent = nextText;
    }
  }
  const metrics = panel.querySelector<HTMLElement>('[data-lab-face-landmark-metrics="true"]');
  if (metrics !== null) {
    const nextMarkup = renderMetricsMarkup();
    if (metrics.innerHTML !== nextMarkup) {
      metrics.innerHTML = nextMarkup;
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function queryOperationField(key: string) {
  return document.querySelector<HTMLInputElement>(
    `[data-lab-field="${OPERATION_FIELD_PREFIX}${key}"]`
  );
}

function readOperationNumber(key: string, fallback: number) {
  const input = queryOperationField(key);
  const value = input === null ? Number.NaN : Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function writeOperationNumber(key: string, value: number) {
  const input = queryOperationField(key);
  if (input === null) {
    return;
  }
  const nextValue = String(Math.round(value * 100) / 100);
  if (input.value === nextValue) {
    return;
  }
  input.value = nextValue;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function getAlignmentPoint(record: CachedFaceRecord, mode: LabFaceAlignmentMode) {
  if (mode === "eyes") return record.anchors.eyeMidpoint;
  if (mode === "nose") return record.anchors.noseTip;
  if (mode === "mouth") return record.anchors.mouthCenter;
  return record.anchors.faceCenter;
}

async function alignReference(mode: LabFaceAlignmentMode) {
  if (getCachedRecord("primary") === null || getCachedRecord("reference") === null) {
    await detectCurrentPair(false);
  }
  const primary = getCachedRecord("primary");
  const reference = getCachedRecord("reference");
  if (primary === null || reference === null) {
    lastInfo = "Hizalama için A ve B görsellerinde de yüz bulunmalı.";
    queueSync();
    return;
  }
  const primaryPoint = getAlignmentPoint(primary, mode);
  const referencePoint = getAlignmentPoint(reference, mode);
  const currentOffsetX = readOperationNumber("referenceOffsetX", 0);
  const currentOffsetY = readOperationNumber("referenceOffsetY", 0);
  writeOperationNumber(
    "referenceOffsetX",
    clamp(currentOffsetX + (primaryPoint.x - referencePoint.x) * 100, -100, 100)
  );
  writeOperationNumber(
    "referenceOffsetY",
    clamp(currentOffsetY + (primaryPoint.y - referencePoint.y) * 100, -100, 100)
  );
  if (mode === "eyes") {
    const primaryEyeFraction = primary.anchors.eyeDistancePx / primary.width;
    const referenceEyeFraction = reference.anchors.eyeDistancePx / reference.width;
    if (primaryEyeFraction > 0 && referenceEyeFraction > 0) {
      const currentZoom = readOperationNumber("referenceZoom", 1);
      writeOperationNumber(
        "referenceZoom",
        clamp(currentZoom * (primaryEyeFraction / referenceEyeFraction), 0.25, 4)
      );
    }
    const currentRotation = readOperationNumber("referenceRotation", 0);
    writeOperationNumber(
      "referenceRotation",
      clamp(
        currentRotation + primary.anchors.eyeLineAngleDeg - reference.anchors.eyeLineAngleDeg,
        -180,
        180
      )
    );
  }
  const labels: Record<LabFaceAlignmentMode, string> = {
    eyes: "göz hattına",
    face: "yüz merkezine",
    mouth: "ağız merkezine",
    nose: "burun ucuna",
  };
  lastInfo = `B görseli A görselinin ${labels[mode]} göre hizalandı.`;
  queueSync();
}

function updateSetting(target: HTMLInputElement | HTMLSelectElement) {
  const key = target.dataset["labFaceLandmarkSetting"];
  if (key === "enabled" && target instanceof HTMLInputElement) {
    settings.enabled = target.checked;
  } else if (key === "autoDetect" && target instanceof HTMLInputElement) {
    settings.autoDetect = target.checked;
  } else if (key === "showLabels" && target instanceof HTMLInputElement) {
    settings.showLabels = target.checked;
  } else if (key === "viewMode" && target instanceof HTMLSelectElement) {
    const value = target.value;
    if (value === "keypoints" || value === "points" || value === "contours" || value === "mesh") {
      settings.viewMode = value;
    }
  } else if (key === "opacity" && target instanceof HTMLInputElement) {
    settings.opacity = clamp(Number(target.value) || settings.opacity, 0.1, 1);
  } else if (key === "pointScale" && target instanceof HTMLInputElement) {
    settings.pointScale = clamp(Number(target.value) || settings.pointScale, 0.5, 2.5);
  }
  document
    .querySelectorAll<SVGSVGElement>(".labx-face-landmark-overlay")
    .forEach(function (overlay) {
      overlay.removeAttribute("data-render-signature");
    });
  queueSync();
}

function handleInput(event: Event) {
  const target = event.target;
  if (
    (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) &&
    target.dataset["labFaceLandmarkSetting"]
  ) {
    updateSetting(target);
  }
}

function handleClick(event: Event) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const button = target.closest<HTMLElement>("[data-lab-face-landmark-action]");
  if (button === null) {
    return;
  }
  const action = button.dataset["labFaceLandmarkAction"];
  event.preventDefault();
  event.stopImmediatePropagation();
  if (action === "detect") {
    void detectCurrentPair(true);
  } else if (action === "align-eyes") {
    void alignReference("eyes");
  } else if (action === "align-nose") {
    void alignReference("nose");
  } else if (action === "align-mouth") {
    void alignReference("mouth");
  } else if (action === "align-face") {
    void alignReference("face");
  }
}

function syncRuntime() {
  syncQueued = false;
  updatePanel();
  renderOverlays();
  if (!isFaceToolActive()) {
    return;
  }
  if (!detectionRunning && settings.autoDetect) {
    const primary = getComparisonImage("primary");
    const reference = getComparisonImage("reference");
    if (primary !== null && reference !== null) {
      const primaryReady = cache.has(getCacheKey(primary));
      const referenceReady = cache.has(getCacheKey(reference));
      if (!primaryReady || !referenceReady) {
        void detectCurrentPair(false);
      }
    }
  }
}

function queueSync() {
  if (syncQueued) {
    return;
  }
  syncQueued = true;
  queueMicrotask(syncRuntime);
}

export function ensureLabFaceLandmarkRuntimeBound() {
  if (
    bound ||
    typeof document === "undefined" ||
    typeof window === "undefined" ||
    typeof MutationObserver === "undefined"
  ) {
    return;
  }
  bound = true;
  document.addEventListener("click", handleClick, true);
  document.addEventListener("input", handleInput, true);
  document.addEventListener("change", handleInput, true);
  window.addEventListener("resize", queueSync);
  new MutationObserver(queueSync).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  queueSync();
}
