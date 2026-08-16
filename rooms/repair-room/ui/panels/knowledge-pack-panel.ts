import type { RepairUiState } from "../../shared/ui/state.js";
import type { RepairKnowledgePackResource } from "../../shared/types/index.js";
import { resolveRepairAssetUrl } from "../repair-asset-url.js";
import { createRepairPanel } from "./panel-shell.js";

type TextFn = (path: string[], fallback: string) => string;

function getResourceUrl(resource: RepairKnowledgePackResource): string | null {
  return resource.sourceUrl ?? resource.downloadUrl ?? resource.src;
}

function isPreviewableImageResource(resource: RepairKnowledgePackResource): boolean {
  const src = resource.src ?? getResourceUrl(resource);
  if (src === null) return false;
  if (resource.kind === "board-image") return true;
  return /(?:^data:image\/|[.](?:apng|avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$)/i.test(src);
}

function getResourceKindLabel(resource: RepairKnowledgePackResource, text?: TextFn): string {
  if (text !== undefined) {
    if (resource.kind === "board-image")
      return text(["knowledgePack", "resourceKinds", "boardImage"], "Kart görseli");
    if (resource.kind === "datasheet")
      return text(["knowledgePack", "resourceKinds", "datasheet"], "Veri sayfası");
    if (resource.kind === "schematic")
      return text(["knowledgePack", "resourceKinds", "schematic"], "Şema");
    if (resource.kind === "thread")
      return text(["knowledgePack", "resourceKinds", "thread"], "Konu");
    return text(["knowledgePack", "resourceKinds", "note"], "Not");
  }
  if (resource.kind === "board-image") return "Board image";
  if (resource.kind === "datasheet") return "Datasheet";
  if (resource.kind === "schematic") return "Schematic";
  if (resource.kind === "thread") return "Thread";
  return "Note";
}

export function renderKnowledgePackPanel(
  documentRef: Document,
  state: RepairUiState,
  text: TextFn
): HTMLElement {
  const body = documentRef.createElement("div");
  body.className = "repair-panel__body";

  const kp = state.knowledgePack;
  const hasSession = state.sessions.activeId !== null && state.sessions.detail !== null;

  if (kp.pack === null) {
    return createRepairPanel(documentRef, {
      panelId: "knowledge-pack",
      eyebrow: text(["knowledgePack", "eyebrow"], "BİLGİ PAKETİ"),
      title: text(["knowledgePack", "title"], "Asistan AI Sonuçları"),
      statusDot: "idle",
      collapsed: state.layout.collapsedPanels["knowledge-pack"],
      noPanelControls: true,
      body,
    });
  }

  const pack = kp.pack;

  // -- Header
  const header = documentRef.createElement("div");
  header.className = "repair-pack-header";

  const model = documentRef.createElement("div");
  model.className = "repair-pack-header__model";
  model.textContent = pack.modelNumber;
  header.append(model);

  const device = documentRef.createElement("div");
  device.className = "repair-pack-header__device";
  device.textContent = pack.deviceLabel;
  header.append(device);

  body.append(header);

  // -- Stats
  const stats = documentRef.createElement("div");
  stats.className = "repair-pack-stats";

  const statEntries: Array<[string, number]> = [
    [text(["knowledgePack", "schematics"], "Şemalar"), pack.stats.schematics],
    [text(["knowledgePack", "boardImages"], "Kart Görselleri"), pack.stats.boardImages],
    [text(["knowledgePack", "commonFailures"], "Yaygın Arızalar"), pack.stats.commonFailures],
    [text(["knowledgePack", "repairNotes"], "Onarım Notları"), pack.stats.repairNotes],
    [text(["knowledgePack", "testPoints"], "Test Noktaları"), pack.stats.testPoints],
  ];

  for (const [label, value] of statEntries) {
    const row = documentRef.createElement("div");
    row.className = "repair-pack-stat";

    const labelEl = documentRef.createElement("span");
    labelEl.textContent = label;
    row.append(labelEl);

    const valueEl = documentRef.createElement("span");
    valueEl.className = "repair-pack-stat__value";
    valueEl.textContent = String(value);
    row.append(valueEl);

    stats.append(row);
  }

  body.append(stats);

  const tabs = documentRef.createElement("div");
  tabs.className = "repair-tabs";
  tabs.style.marginTop = "8px";

  const tabItems = [
    {
      id: "schematic-preview",
      label: text(["knowledgePack", "tabSchematic"], "Şema"),
    },
    { id: "board-view", label: text(["knowledgePack", "tabBoard"], "Kart fotoğrafları") },
    { id: "notes", label: text(["knowledgePack", "tabNotes"], "Onarım notları") },
  ];

  for (const tab of tabItems) {
    const tabEl = documentRef.createElement("div");
    tabEl.className = `repair-tab${
      hasSession && kp.previewTabId === tab.id ? " repair-tab--active" : ""
    }`;
    tabEl.textContent = tab.label;
    tabEl.dataset["repairAction"] = "knowledge-pack-tab";
    tabEl.dataset["tabId"] = tab.id;
    tabs.append(tabEl);
  }

  body.append(tabs);

  const preview = documentRef.createElement("div");
  preview.className = "repair-pack-preview";
  if (kp.previewTabId === "schematic-preview") {
    const resources = pack.resources
      .filter((resource) => resource.kind === "schematic" || resource.kind === "datasheet")
      .slice(0, 3);
    appendPreviewImage(
      documentRef,
      preview,
      resources.find(isPreviewableImageResource) ?? null,
      text(["knowledgePack", "tabSchematic"], "Şema")
    );
    resources.forEach((resource) => {
      appendResourcePreviewRow(documentRef, preview, resource, text);
    });
  } else if (kp.previewTabId === "board-view") {
    const resources = pack.resources
      .filter((resource) => resource.kind === "board-image")
      .slice(0, 4);
    appendPreviewImage(
      documentRef,
      preview,
      resources.find(isPreviewableImageResource) ?? null,
      text(["knowledgePack", "tabBoard"], "Kart fotoğrafları")
    );
    resources.forEach((resource) => {
      appendResourcePreviewRow(documentRef, preview, resource, text);
    });
  } else {
    pack.notes.slice(0, 4).forEach((note) => {
      const row = documentRef.createElement("div");
      row.className = "repair-pack-preview__row";
      row.textContent = note;
      preview.append(row);
    });
  }
  body.append(preview);

  const spatialList = documentRef.createElement("div");
  spatialList.className = "repair-knowledge-spatial-list";
  pack.commonFailures.slice(0, 3).forEach((failure) => {
    if (failure.spatialRef === null || failure.spatialRef === undefined) return;
    const card = documentRef.createElement("button");
    card.className = `repair-knowledge-spatial${
      hasSession && kp.focusedSpatialRefId === failure.id ? " repair-knowledge-spatial--active" : ""
    }`;
    card.type = "button";
    card.dataset["repairAction"] = "knowledge-spatial-focus";
    card.dataset["spatialRefId"] = failure.id;
    card.textContent = `${text(["knowledgePack", "spatial", "likelyFault"], "Muhtemel arıza")}: ${failure.label}`;
    spatialList.append(card);
  });
  pack.testPoints.slice(0, 4).forEach((point) => {
    const card = documentRef.createElement("button");
    card.className = `repair-knowledge-spatial${
      hasSession && kp.focusedSpatialRefId === point.id ? " repair-knowledge-spatial--active" : ""
    }`;
    card.type = "button";
    card.dataset["repairAction"] = "knowledge-spatial-focus";
    card.dataset["spatialRefId"] = point.id;
    card.textContent = `${text(["knowledgePack", "spatial", "probe"], "Prob")}: ${point.label} • ${point.expectedValue}${point.unit}`;
    spatialList.append(card);
  });
  if (kp.focusedSpatialRefId !== null) {
    const promote = documentRef.createElement("button");
    promote.className = "repair-knowledge-spatial repair-knowledge-spatial--promote";
    promote.type = "button";
    promote.dataset["repairAction"] = "knowledge-spatial-promote";
    promote.dataset["spatialRefId"] = kp.focusedSpatialRefId;
    promote.textContent = text(["knowledgePack", "pinToWorkbench"], "Bu alanı tezgâha sabitle");
    spatialList.append(promote);
  }
  body.append(spatialList);

  // -- CTA
  if (kp.attachedToSessionId === null) {
    const cta = documentRef.createElement("button");
    cta.className = "repair-cta-btn";
    cta.type = "button";
    cta.textContent = text(["knowledgePack", "addToSession"], "Bu tamirde kullan");
    cta.dataset["repairAction"] = "attach-knowledge-pack";
    cta.dataset["packId"] = pack.id;
    body.append(cta);
  }

  return createRepairPanel(documentRef, {
    panelId: "knowledge-pack",
    eyebrow: text(["knowledgePack", "eyebrow"], "BİLGİ PAKETİ"),
    title: text(["knowledgePack", "title"], "Asistan AI Sonuçları"),
    statusDot: kp.attachedToSessionId !== null ? "live" : "idle",
    collapsed: state.layout.collapsedPanels["knowledge-pack"],
    noPanelControls: true,
    body,
  });
}

function appendPreviewImage(
  documentRef: Document,
  preview: HTMLElement,
  resource: RepairKnowledgePackResource | null,
  alt: string
): void {
  const src = resource === null ? null : resource.src;
  if (src === null) return;
  if (resource !== null && !isPreviewableImageResource(resource)) return;
  const resolvedSrc = resolveRepairAssetUrl(src) ?? src;
  const image = documentRef.createElement("img");
  image.className = "repair-pack-preview__image";
  image.src = resolvedSrc;
  image.alt = resource?.label ?? alt;
  preview.append(image);
}

function appendResourcePreviewRow(
  documentRef: Document,
  preview: HTMLElement,
  resource: RepairKnowledgePackResource,
  text: TextFn
): void {
  const row = documentRef.createElement("div");
  row.className = "repair-pack-preview__row repair-pack-preview__row--resource";

  const body = documentRef.createElement("div");
  body.className = "repair-pack-preview__resource-body";

  const title = documentRef.createElement("strong");
  title.textContent = resource.label;
  body.append(title);

  const meta = documentRef.createElement("span");
  meta.textContent = `${getResourceKindLabel(resource, text)} • ${resource.source} • ${Math.round(
    resource.confidence * 100
  )}%`;
  body.append(meta);
  row.append(body);

  const url = getResourceUrl(resource);
  if (url !== null) {
    const actions = documentRef.createElement("div");
    actions.className = "repair-pack-preview__actions";

    const previewLink = documentRef.createElement("a");
    previewLink.className = "repair-pack-preview__link";
    previewLink.href = resolveRepairAssetUrl(url) ?? url;
    previewLink.target = "_blank";
    previewLink.rel = "noopener noreferrer";
    previewLink.textContent = text(["knowledgePack", "preview"], "Preview");
    actions.append(previewLink);

    const downloadUrl = resource.downloadUrl ?? url;
    const downloadLink = documentRef.createElement("a");
    downloadLink.className = "repair-pack-preview__link";
    downloadLink.href = resolveRepairAssetUrl(downloadUrl) ?? downloadUrl;
    downloadLink.target = "_blank";
    downloadLink.rel = "noopener noreferrer";
    downloadLink.download = "";
    downloadLink.textContent = text(["knowledgePack", "download"], "Download");
    actions.append(downloadLink);

    row.append(actions);
  }

  preview.append(row);
}
