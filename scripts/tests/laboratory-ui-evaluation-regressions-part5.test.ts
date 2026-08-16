import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { renderLabWaveformTimeline } from "../../rooms/laboratory/ui/lab-waveform-timeline.ts";
import { createLabI18n } from "../../rooms/laboratory/ui/lab-i18n.ts";
import {
  formatLabUserActionDisplayText,
  translateLabRuntimeText,
} from "../../rooms/laboratory/ui/lab-runtime-i18n.ts";
import { readCssWithImports } from "./helpers/css-imports.ts";
import type { LabWaveformTimelineModel } from "../../rooms/laboratory/ui/lab-waveform-timeline-types.ts";

function readLabThemeSource() {
  return readCssWithImports("rooms/laboratory/ui/lab-theme.css");
}

class ElementStub {
  private innerHtmlValue = "";
  scrollTop = 0;
  dataset: Record<string, string> = {};
  classList = {
    add() {},
    remove() {},
    toggle() {},
  };

  get innerHTML(): string {
    return this.innerHtmlValue;
  }

  set innerHTML(value: string) {
    this.innerHtmlValue = value;
  }

  querySelector(_selector?: string): null {
    return null;
  }

  querySelectorAll(_selector?: string): [] {
    return [];
  }

  addEventListener(): void {}

  removeEventListener(): void {}

  replaceChildren(): void {}
}

class MountedRootElement extends ElementStub {
  layoutWrites: string[] = [];
  mountedQueriesEnabled = false;
  private mountedInnerHtmlValue = "";

  override get innerHTML(): string {
    return this.mountedInnerHtmlValue;
  }

  override set innerHTML(value: string) {
    this.layoutWrites.push(value);
    this.mountedInnerHtmlValue = value;
  }

  clearLayoutWrites(): void {
    this.layoutWrites = [];
  }

  setShellAttribute(name: string, value: string): void {
    const shellMatch = this.mountedInnerHtmlValue.match(/<div class="labx-shell"([^>]*)>/);
    if (!shellMatch) {
      return;
    }
    const shellTag = shellMatch[0];
    const attributePattern = new RegExp(`${name}="[^"]*"`);
    const nextTag = attributePattern.test(shellTag)
      ? shellTag.replace(attributePattern, `${name}="${value}"`)
      : shellTag.replace(/>$/, ` ${name}="${value}">`);
    this.mountedInnerHtmlValue = this.mountedInnerHtmlValue.replace(shellTag, nextTag);
  }

  override querySelector(selector?: string): null {
    if (this.mountedQueriesEnabled !== true) {
      return null;
    }
    if (selector === ".labx-shell" && this.innerHTML.includes('class="labx-shell"')) {
      return new MountedQueryElement(this, selector) as unknown as null;
    }
    return null;
  }
}

class MountedQueryElement extends ElementStub {
  constructor(
    private readonly root: MountedRootElement,
    private readonly selector: string
  ) {
    super();
  }

  getAttribute(name: string): string | null {
    if (this.selector !== ".labx-shell") {
      return null;
    }
    const shellMatch = this.root.innerHTML.match(/<div class="labx-shell"([^>]*)>/);
    const shellAttributes = shellMatch?.[1] ?? "";
    const attributeMatch = shellAttributes.match(new RegExp(`${name}="([^"]*)"`));
    return attributeMatch?.[1] ?? null;
  }

  removeAttribute(): void {}

  hasAttribute(name: string): boolean {
    return this.getAttribute(name) !== null;
  }

  getAttributeNames(): string[] {
    return [];
  }

  insertAdjacentHTML(_position: InsertPosition, html: string): void {
    this.root.innerHTML += html;
  }

  setAttribute(name: string, value: string): void {
    if (this.selector === ".labx-shell") {
      this.root.setShellAttribute(name, value);
    }
  }
}

function createExecutionReadinessTimelineModel(
  overrides: Record<string, unknown> = {}
): LabWaveformTimelineModel {
  return {
    activeSelection: {
      id: "selection-1",
      startMs: 1000,
      endMs: 3000,
      type: "clip",
      createdAt: 1,
    },
    bookmarks: [],
    durationMs: 4000,
    endMs: 3000,
    startMs: 1000,
    waveformSourceLabel: "Embedded audio",
    waveformSyncLabel: "Preview and waveform share the same master axis.",
    waveformWindowDurationMs: 4000,
    waveformWindowStartMs: 0,
    ...overrides,
  };
}

void test("laboratory accepted selection renders selected action feedback without helper panels", () => {
  const markup = renderLabWaveformTimeline(
    createExecutionReadinessTimelineModel({
      activeExecutionIntent: {
        id: "audio-inspect",
        label: "Inspect audio",
        actionType: "inspect-audio",
        confidence: 0.82,
      },
      activeSuggestionPreview: null,
      selectionSuggestions: [],
    })
  );

  assert.match(markup, /Selected action/);
  assert.match(markup, /Inspect audio/);
  assert.match(markup, /data-lab-execution-intent-clear="true"/);
  assert.doesNotMatch(markup, /data-lab-execution-plan="true"/);
  assert.doesNotMatch(markup, /data-lab-execution-simulation="true"/);
  assert.doesNotMatch(markup, /data-lab-execution-readiness="true"/);
  assert.doesNotMatch(markup, /data-lab-execution-payload-preview="true"/);
  assert.doesNotMatch(markup, /data-lab-execution-reflection="true"/);
  assert.doesNotMatch(markup, /data-lab-execution-alternatives="true"/);
  assert.doesNotMatch(markup, /data-lab-execution-candidate="true"/);
  assert.doesNotMatch(markup, /data-lab-execution-commitment="true"/);
  assert.doesNotMatch(markup, /data-lab-execution-staging="true"/);
  assert.doesNotMatch(markup, /data-lab-execution-details-overlay="true"/);
  assert.doesNotMatch(markup, /Simulation preview|Execution payload|Execution candidate/);
});

void test("laboratory phase 4.95 renders room-local selection labels without execution detail copy", () => {
  const enTranslations = JSON.parse(readFileSync("rooms/laboratory/i18n/en.json", "utf8")) as Record<string, unknown>;
  const trTranslations = JSON.parse(readFileSync("rooms/laboratory/i18n/tr.json", "utf8")) as Record<string, unknown>;
  const enCopy = createLabI18n({ locale: "en", translations: enTranslations });
  const trCopy = createLabI18n({ locale: "tr", translations: trTranslations });

  const enMarkup = renderLabWaveformTimeline(
    createExecutionReadinessTimelineModel({
      activeExecutionIntent: {
        id: "audio-inspect",
        label: "Inspect audio",
        actionType: "inspect-audio",
        confidence: 0.82,
      },
      copy: enCopy,
    })
  );
  const trMarkup = renderLabWaveformTimeline(
    createExecutionReadinessTimelineModel({
      activeExecutionIntent: {
        id: "audio-inspect",
        label: "Ses incele",
        actionType: "inspect-audio",
        confidence: 0.82,
      },
      copy: trCopy,
    })
  );

  assert.match(enMarkup, /Selection/);
  assert.match(enMarkup, /Type/);
  assert.match(enMarkup, /Selected action/);
  assert.match(enMarkup, /Inspect audio/);
  assert.match(trMarkup, /Secim/);
  assert.match(trMarkup, /Tip/);
  assert.match(trMarkup, /Secili aksiyon/);
  assert.match(trMarkup, /Ses incele/);
  assert.doesNotMatch(
    enMarkup,
    /View details|Execution details|Simulation preview|Execution candidate/
  );
  assert.doesNotMatch(
    trMarkup,
    /Detaylari gor|Calistirma detaylari|Simulasyon onizlemesi|Calistirma adayi/
  );
});

void test("laboratory runtime status copy resolves through room-local i18n catalogs", () => {
  const enTranslations = JSON.parse(readFileSync("rooms/laboratory/i18n/en.json", "utf8")) as Record<string, unknown>;
  const trTranslations = JSON.parse(readFileSync("rooms/laboratory/i18n/tr.json", "utf8")) as Record<string, unknown>;
  const enCopy = createLabI18n({ locale: "en", translations: enTranslations });
  const trCopy = createLabI18n({ locale: "tr", translations: trTranslations });

  assert.equal(
    translateLabRuntimeText("Kaynak henüz hazır değil.", enCopy),
    "Source is not ready yet."
  );
  assert.equal(translateLabRuntimeText("Eksik araç: ffmpeg", enCopy), "Missing tool: ffmpeg");
  assert.equal(translateLabRuntimeText("Eksik araç: ffmpeg", trCopy), "Eksik araç: ffmpeg");
  assert.equal(
    formatLabUserActionDisplayText(
      {
        id: "action-1",
        type: "extract-audio",
        label: "Ses çıkarılıyor",
        status: "success",
        startedAt: 1,
        message: "Ses çıkarıldı",
        sourceAction: "export-audio-track",
      },
      enCopy
    ),
    "Audio extracted"
  );
});

void test("laboratory phase 4.95 i18n keys keep English and Turkish catalog parity", () => {
  const enTranslations = JSON.parse(readFileSync("rooms/laboratory/i18n/en.json", "utf8")) as Record<string, unknown>;
  const trTranslations = JSON.parse(readFileSync("rooms/laboratory/i18n/tr.json", "utf8")) as Record<string, unknown>;
  const phaseKeys = [
    "mediaAnalysis.processSummary",
    "mediaAnalysis.rightContext",
    "mediaAnalysis.timeline",
    "mediaAnalysis.topBar",
    "mediaAnalysis.sourcePanel",
    "mediaAnalysis.projectImport",
  ];

  function readPath(record: Record<string, unknown>, key: string): unknown {
    return key.split(".").reduce<unknown>(function (current, part) {
      return current != null && typeof current === "object"
        ? (current as Record<string, unknown>)[part]
        : undefined;
    }, record);
  }

  function collectKeys(value: unknown, prefix = ""): string[] {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      return [prefix];
    }
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .flatMap(function (key) {
        const nextPrefix = prefix === "" ? key : `${prefix}.${key}`;
        return collectKeys((value as Record<string, unknown>)[key], nextPrefix);
      });
  }

  phaseKeys.forEach(function (key) {
    assert.deepEqual(
      collectKeys(readPath(enTranslations, key)),
      collectKeys(readPath(trTranslations, key))
    );
  });
});

void test("laboratory process layer is single-source and old right panel is retired", () => {
  const surfaceSource = readFileSync("rooms/laboratory/ui/workspace-surface.ts", "utf8");
  const drawerSource = readFileSync("rooms/laboratory/ui/lab-drawer.ts", "utf8");
  const drawerResultExploreSource = readFileSync(
    "rooms/laboratory/ui/lab-drawer-result-explore.ts",
    "utf8"
  );
  const processStripSource = readFileSync("rooms/laboratory/ui/lab-process-strip.ts", "utf8");
  const themeSource = readLabThemeSource();

  assert.doesNotMatch(surfaceSource, /data-lab-global-process="true"/);
  assert.doesNotMatch(surfaceSource, /renderWorkspaceProcessPanel/);
  assert.equal(existsSync("rooms/laboratory/ui/workspace-process-panel.ts"), false);
  assert.match(drawerResultExploreSource, /getLaboratoryRightPanelContext/);
  assert.match(processStripSource, /getLaboratoryProcessSummary/);
  assert.doesNotMatch(drawerSource, /labx-process-panel/);
  assert.doesNotMatch(themeSource, /labx-process-panel|labx-intent-map|labx-output-trace/);
});
