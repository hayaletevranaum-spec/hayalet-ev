import type {
  PatternPanelActions,
  PatternReportItem,
  PatternReportSection,
  PatternRoomWorkspaceModel,
} from "../../shared/types/pattern-room.js";
import {
  createPatternWorkspaceTranslator,
  type PatternWorkspaceTranslator,
} from "../pattern-room-workspace-i18n.js";
import { createElement, createEmptyState, createPanelShell } from "./pattern-panel-utils.js";

const REPORT_META_SEPARATOR = " · ";

type PatternReportPriority = "primary" | "supporting" | "next";

type PatternReportPriorityDefinition = {
  readonly label: string;
  readonly description: string;
};

const REPORT_PRIORITY_ORDER: readonly PatternReportPriority[] = ["primary", "supporting", "next"];

const REPORT_PRIORITY_DEFINITIONS: Readonly<
  Record<PatternReportPriority, PatternReportPriorityDefinition>
> = {
  primary: {
    label: "Birincil bulgular",
    description: "Kaynak ve kanıt kayıtları raporun doğrulanabilir başlangıç yüzeyini oluşturur.",
  },
  supporting: {
    label: "Destekleyici izler",
    description: "Pano, bağlantı ve 10. Adam izleri bağlam sağlar; tek başına kesin hüküm üretmez.",
  },
  next: {
    label: "Sonraki çalışma",
    description: "Eksik bağlam ve takip edilmesi gereken araştırma notları burada tutulur.",
  },
};

function resolveReportPriority(sectionId: string): PatternReportPriority {
  if (sectionId === "report-source-summary" || sectionId === "report-evidence-notes") {
    return "primary";
  }
  if (sectionId === "report-next-research-notes") {
    return "next";
  }
  return "supporting";
}

function formatReportMetric(value: number, label: string): string {
  return `${String(value)} ${label}`;
}

function createReportMetrics(section: PatternReportSection): HTMLElement {
  const metrics = createElement("div", "pattern-room-report-section-metrics");
  metrics.dataset["patternReportMetrics"] = section.id;
  section.metrics.forEach((metric) => {
    const item = createElement(
      "span",
      "pattern-room-report-section-metric",
      formatReportMetric(metric.value, metric.label)
    );
    item.dataset["patternReportMetric"] = metric.id;
    metrics.append(item);
  });
  return metrics;
}

function formatReportOutlineMetrics(section: PatternReportSection): string {
  return section.metrics
    .map((metric) => formatReportMetric(metric.value, metric.label))
    .join(REPORT_META_SEPARATOR);
}

function createReportItem(item: PatternReportItem): HTMLElement {
  const entry = createElement("article", "pattern-room-report-entry");
  entry.dataset["patternReportItem"] = item.id;
  entry.append(createElement("h4", undefined, item.label));

  if (item.meta.length > 0) {
    entry.append(
      createElement("small", "pattern-room-report-meta", item.meta.join(REPORT_META_SEPARATOR))
    );
  }

  entry.append(createElement("p", "pattern-room-report-preview", item.body));

  if (item.detail !== null) {
    entry.append(createElement("p", "pattern-room-report-detail", item.detail));
  }

  return entry;
}

function appendReportSectionContent(card: HTMLElement, section: PatternReportSection): void {
  if (section.items.length === 0) {
    card.append(createEmptyState(section.emptyMessage, "complete-empty", { compact: true }));
    return;
  }

  const items = createElement("div", "pattern-room-report-items");
  section.items.forEach((item) => {
    items.append(createReportItem(item));
  });
  card.append(items);
}

function createReportInspectorSummary(data: PatternRoomWorkspaceModel): HTMLElement {
  const sections = data.reportSummary.sections;
  const itemCount = sections.reduce((count, section) => count + section.items.length, 0);
  const populatedSectionCount = sections.filter((section) => section.items.length > 0).length;
  const summary = createElement("section", "pattern-room-report-inspector-summary");
  summary.dataset["patternReportSummary"] = "true";

  const status = createElement("div", "pattern-room-report-inspector-status");
  status.append(
    createElement("span", "pattern-room-report-status-chip", "Taslak"),
    createElement("span", "pattern-room-report-status-chip secondary", "Yerel iz"),
    createElement("span", "pattern-room-report-status-chip secondary", "Salt okunur")
  );

  const metrics = createElement("div", "pattern-room-report-inspector-metrics");
  const metricValues: ReadonlyArray<readonly [string, number]> = [
    ["Bölüm", sections.length],
    ["Dolu bölüm", populatedSectionCount],
    ["Kayıt", itemCount],
  ];
  metricValues.forEach(([label, value]) => {
    const metric = createElement("div", "pattern-room-report-inspector-metric");
    metric.append(
      createElement("span", undefined, label),
      createElement("strong", undefined, String(value))
    );
    metrics.append(metric);
  });

  summary.append(
    status,
    createElement("h2", undefined, data.reportSummary.label),
    metrics,
    createElement(
      "p",
      "pattern-room-report-inspector-disclaimer",
      "Bu görünüm domain verisi ile yerel overlay izlerinin deterministik projeksiyonudur. Yerel kayıtlar doğrulanmış vaka gerçeği sayılmaz."
    )
  );
  return summary;
}

function createPriorityOverview(data: PatternRoomWorkspaceModel): HTMLElement {
  const overview = createElement("div", "pattern-room-report-priority-overview");
  overview.dataset["patternReportPriorityOverview"] = "true";
  REPORT_PRIORITY_ORDER.forEach((priority) => {
    const sections = data.reportSummary.sections.filter(
      (section) => resolveReportPriority(section.id) === priority
    );
    const itemCount = sections.reduce((count, section) => count + section.items.length, 0);
    const definition = REPORT_PRIORITY_DEFINITIONS[priority];
    const card = createElement("section", `pattern-room-report-priority-summary ${priority}`);
    card.dataset["patternReportPrioritySummary"] = priority;
    card.append(
      createElement("span", undefined, definition.label),
      createElement("strong", undefined, String(itemCount)),
      createElement("small", undefined, `${String(sections.length)} bölüm`)
    );
    overview.append(card);
  });
  return overview;
}

function createPriorityGroup(priority: PatternReportPriority): {
  readonly group: HTMLElement;
  readonly body: HTMLElement;
} {
  const definition = REPORT_PRIORITY_DEFINITIONS[priority];
  const group = createElement("section", `pattern-room-report-priority-group ${priority}`);
  group.dataset["patternReportPriority"] = priority;
  const header = createElement("header", "pattern-room-report-priority-header");
  header.append(
    createElement("span", "pattern-room-list-eyebrow", "Bilgi önceliği"),
    createElement("h3", undefined, definition.label),
    createElement("p", undefined, definition.description)
  );
  const body = createElement("div", "pattern-room-report-priority-body");
  group.append(header, body);
  return { group, body };
}

export function createReportPanel(
  data: PatternRoomWorkspaceModel,
  _actions: PatternPanelActions,
  onBack: () => void,
  text: PatternWorkspaceTranslator = createPatternWorkspaceTranslator("tr", null)
): HTMLElement {
  const shell = createPanelShell("report", text("nav.report.label"), onBack);
  shell.classList.add("pattern-room-report-panel");
  const workspace = createElement("div", "pattern-room-report-workspace");
  const outline = createElement("aside", "pattern-room-report-outline");
  outline.dataset["patternReportOutline"] = "true";
  outline.ariaLabel = text("report.outlineLabel");
  outline.append(
    createReportInspectorSummary(data),
    createElement("span", "pattern-room-context-inspector-label", text("report.outlineLabel"))
  );
  const outlineNavigation = createElement("nav", "pattern-room-report-outline-navigation");
  outlineNavigation.ariaLabel = text("report.outlineLabel");
  const outlineButtons: HTMLButtonElement[] = [];

  const report = createElement("article", "pattern-room-report pattern-room-report-document");
  report.dataset["patternReportDocument"] = "true";
  report.ariaLabel = text("report.documentLabel");
  const reportHeader = createElement("header", "pattern-room-report-document-header");
  reportHeader.append(
    createElement("span", "pattern-room-kicker", "Taslak / Yerel iz"),
    createElement("h2", undefined, data.reportSummary.label),
    createElement(
      "p",
      undefined,
      "Taslak rapor; kullanıcı tarafından eklenen ve henüz doğrulanmamış yerel izlerden deterministik görünüm hazırlar."
    ),
    createPriorityOverview(data)
  );
  report.append(reportHeader);

  const list = createElement("div", "pattern-room-report-list");
  const priorityGroups = new Map<PatternReportPriority, ReturnType<typeof createPriorityGroup>>();
  REPORT_PRIORITY_ORDER.forEach((priority) => {
    const priorityGroup = createPriorityGroup(priority);
    priorityGroups.set(priority, priorityGroup);
    list.append(priorityGroup.group);
  });

  data.reportSummary.sections.forEach((section, index) => {
    const item = createElement("section", `pattern-room-report-card ${section.tone}`);
    item.dataset["patternReportSection"] = section.id;
    item.tabIndex = -1;
    const sectionHeader = createElement("header", "pattern-room-report-section-header");
    sectionHeader.append(
      createElement("span", "pattern-room-list-eyebrow", "Taslak bölümü"),
      createReportMetrics(section),
      createElement("h3", undefined, section.label),
      createElement("p", undefined, section.note)
    );
    item.append(sectionHeader);
    appendReportSectionContent(item, section);
    priorityGroups.get(resolveReportPriority(section.id))?.body.append(item);

    const jump = createElement("button", "pattern-room-report-outline-button");
    jump.type = "button";
    jump.dataset["patternReportJump"] = section.id;
    jump.ariaLabel = text("report.jumpLabel", { section: section.label });
    jump.append(
      createElement("span", "pattern-room-report-outline-index", String(index + 1)),
      createElement("span", undefined, section.label),
      createElement("small", undefined, formatReportOutlineMetrics(section))
    );
    jump.addEventListener("click", () => {
      outlineButtons.forEach((button) => {
        button.classList.remove("active");
        button.ariaCurrent = null;
      });
      jump.classList.add("active");
      jump.ariaCurrent = "location";
      item.focus();
      item.scrollIntoView({ block: "start" });
    });
    outlineButtons.push(jump);
    outlineNavigation.append(jump);
  });

  outlineButtons[0]?.classList.add("active");
  if (outlineButtons[0] !== undefined) {
    outlineButtons[0].ariaCurrent = "location";
  }
  outline.append(outlineNavigation);
  report.append(list);
  workspace.append(outline, report);
  shell.append(workspace);
  return shell;
}
