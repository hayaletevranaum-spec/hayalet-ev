import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  CAPABILITY_FAMILIES,
  LAB_ANALYSIS_MODULE_SETTINGS_FIELDS,
  LAB_OPERATION_CAPABILITIES,
  LAB_OPERATION_SETTINGS_FIELDS,
  getModuleIdsForCapabilityFamily,
} from "../../rooms/laboratory/domain/lab-types.ts";
import { labI18nEn } from "../../rooms/laboratory/runtime/lab-i18n-en.ts";
import { labI18nTr } from "../../rooms/laboratory/runtime/lab-i18n-tr.ts";

type CatalogRecord = Record<string, unknown>;

const LABORATORY_ROOT = "rooms/laboratory";
const EN_CATALOG_PATH = "rooms/laboratory/i18n/en.json";
const TR_CATALOG_PATH = "rooms/laboratory/i18n/tr.json";

function readCatalog(filePath: string): CatalogRecord {
  return JSON.parse(readFileSync(filePath, "utf8")) as CatalogRecord;
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "i18n") {
        return [];
      }
      return listSourceFiles(fullPath);
    }
    if (!entry.isFile() || !/\.(?:ts|js|json|html|md)$/.test(entry.name)) {
      return [];
    }
    return [fullPath];
  });
}

function flattenCatalog(value: unknown, prefix = ""): Map<string, string> {
  const result = new Map<string, string>();
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return result;
  }

  Object.entries(value as CatalogRecord).forEach(([key, entry]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof entry === "string") {
      result.set(path, entry);
      return;
    }
    flattenCatalog(entry, path).forEach((leafValue, leafPath) => {
      result.set(leafPath, leafValue);
    });
  });

  return result;
}

function hasCatalogPath(catalog: CatalogRecord, key: string): boolean {
  const parts = key.split(".").filter(Boolean);
  let current: unknown = catalog;
  for (const part of parts) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return false;
    }
    if (Object.prototype.hasOwnProperty.call(current, part) !== true) {
      return false;
    }
    current = (current as CatalogRecord)[part];
  }
  return typeof current === "string";
}

function hasCatalogNamespace(catalog: CatalogRecord, key: string): boolean {
  const parts = key.split(".").filter(Boolean);
  let current: unknown = catalog;
  for (const part of parts) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return false;
    }
    if (Object.prototype.hasOwnProperty.call(current, part) !== true) {
      return false;
    }
    current = (current as CatalogRecord)[part];
  }
  return current !== null && typeof current === "object" && Array.isArray(current) === false;
}

function getLineNumber(source: string, index: number): number {
  return source.slice(0, Math.max(0, index)).split("\n").length;
}

void test("laboratory room catalogs stay structurally aligned across EN and TR", () => {
  const enLeaves = flattenCatalog(readCatalog(EN_CATALOG_PATH));
  const trLeaves = flattenCatalog(readCatalog(TR_CATALOG_PATH));

  assert.deepEqual([...trLeaves.keys()].sort(), [...enLeaves.keys()].sort());
});

void test("laboratory operation catalog labels are available in room i18n", () => {
  const enCatalog = readCatalog(EN_CATALOG_PATH);
  const trCatalog = readCatalog(TR_CATALOG_PATH);
  const issues: string[] = [];
  const outputKinds = new Set<string>();

  LAB_OPERATION_CAPABILITIES.forEach(function (capability) {
    ["label", "description"].forEach(function (field) {
      const key = `mediaAnalysis.operations.capabilities.${capability.id}.${field}`;
      if (!hasCatalogPath(enCatalog, key) || !hasCatalogPath(trCatalog, key)) {
        issues.push(key);
      }
    });
    capability.outputKinds.forEach(function (kind) {
      outputKinds.add(kind);
    });
  });

  outputKinds.forEach(function (kind) {
    const key = `mediaAnalysis.operations.outputs.${kind}`;
    if (!hasCatalogPath(enCatalog, key) || !hasCatalogPath(trCatalog, key)) {
      issues.push(key);
    }
  });

  assert.equal(issues.length, 0, `Missing Laboratory operation i18n keys:\n${issues.join("\n")}`);
});

void test("laboratory analysis preparation modules resolve through room i18n catalogs", () => {
  const enCatalog = readCatalog(EN_CATALOG_PATH);
  const trCatalog = readCatalog(TR_CATALOG_PATH);
  const issues: string[] = [];

  CAPABILITY_FAMILIES.forEach(function (family) {
    const reportSectionKey = `mediaAnalysis.drawer.setup.reportSections.${family.id}`;
    if (!hasCatalogPath(enCatalog, reportSectionKey) || !hasCatalogPath(trCatalog, reportSectionKey)) {
      issues.push(reportSectionKey);
    }

    const moduleNamespace =
      family.id === "visual-structure" || family.id === "visual-forensics"
        ? "visualAnalysis.catalog.modules"
        : "audioAnalysis.catalog.modules";
    getModuleIdsForCapabilityFamily(family.id).forEach(function (moduleId) {
      const titleKey = `${moduleNamespace}.${moduleId}.title`;
      if (!hasCatalogPath(enCatalog, titleKey) || !hasCatalogPath(trCatalog, titleKey)) {
        issues.push(titleKey);
      }
    });
  });

  assert.equal(issues.length, 0, `Missing Laboratory analysis-prep i18n keys:\n${issues.join("\n")}`);
});

void test("laboratory settings field metadata has localized labels and options", () => {
  const enCatalog = readCatalog(EN_CATALOG_PATH);
  const trCatalog = readCatalog(TR_CATALOG_PATH);
  const issues: string[] = [];
  const fieldIds = new Set<string>();
  const optionValues = new Set<string>();

  Object.values(LAB_OPERATION_SETTINGS_FIELDS)
    .concat(Object.values(LAB_ANALYSIS_MODULE_SETTINGS_FIELDS))
    .forEach(function (fields) {
      fields.forEach(function (field) {
        fieldIds.add(field.id);
        (field.options ?? []).forEach(function (option) {
          optionValues.add(option.value);
        });
      });
    });

  fieldIds.forEach(function (fieldId) {
    const key = `mediaAnalysis.settings.fields.${fieldId}`;
    if (!hasCatalogPath(enCatalog, key) || !hasCatalogPath(trCatalog, key)) {
      issues.push(key);
    }
  });

  optionValues.forEach(function (optionValue) {
    if (/^\d/.test(optionValue)) {
      return;
    }
    const key = `mediaAnalysis.settings.options.${optionValue}`;
    if (!hasCatalogPath(enCatalog, key) || !hasCatalogPath(trCatalog, key)) {
      issues.push(key);
    }
  });

  assert.equal(issues.length, 0, `Missing Laboratory settings i18n keys:\n${issues.join("\n")}`);
});

void test("laboratory Turkish catalog does not keep known visible English leftovers", () => {
  const trLeaves = flattenCatalog(readCatalog(TR_CATALOG_PATH));
  const visibleKeys = [
    "workbench.readinessTitle",
    "workbench.operationsMeta.transferLabel",
    "mediaAnalysis.strip.rawLog",
    "mediaAnalysis.shared.codec",
    "mediaAnalysis.shared.format",
    "mediaAnalysis.shared.preset",
    "mediaAnalysis.audioFocus.filters.lowpass",
    "mediaAnalysis.audioFocus.filters.highpass",
    "mediaAnalysis.audioFocus.filters.bandpass",
    "mediaAnalysis.processPanel.empty.pipelineResolving",
    "mediaAnalysis.processPanel.sections.pipeline",
  ];
  const issues = visibleKeys.filter(function (key) {
    return /Readiness|Transfer|Raw log|Codec|Preset|Lowpass|Highpass|Bandpass|Pipeline/.test(
      trLeaves.get(key) ?? ""
    );
  });

  assert.equal(issues.length, 0, `Visible Turkish leaves still look English:\n${issues.join("\n")}`);
});

void test("laboratory runtime advisory catalogs stay aligned across EN and TR", () => {
  assert.deepEqual(Object.keys(labI18nTr).sort(), Object.keys(labI18nEn).sort());
  assert.doesNotMatch(
    [
      labI18nTr["candidate.summary.unstable"],
      labI18nTr["reflection.reasoning.payloadReview"],
      labI18nTr["alternatives.summary.reflectionReview"],
      labI18nTr["alternatives.item.broadSegment.label"],
    ].join(" "),
    /This path|Payload preview|The selected path|Broader segment review/
  );
});

void test("laboratory static i18n references resolve in both room catalogs", () => {
  const enCatalog = readCatalog(EN_CATALOG_PATH);
  const trCatalog = readCatalog(TR_CATALOG_PATH);
  const issues: string[] = [];
  const fallbackOnlyKeys = new Set([
    "mediaAnalysis.timeline.noSelection",
    "mediaAnalysis.toolManager.labels.details",
    "mediaAnalysis.topBar.deleteProject",
    "mediaAnalysis.topBar.selection",
    "mediaAnalysis.topBar.sourcePanelExpand",
    "mediaAnalysis.topBar.sourcePanelCollapse",
  ]);
  const referenceRegex =
    /["']((?:mediaAnalysis|audioAnalysis|workbench|visualAnalysis)\.[A-Za-z0-9_.-]+)["']/g;

  for (const file of listSourceFiles(LABORATORY_ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(referenceRegex)) {
      const key = match[1] ?? "";
      if (fallbackOnlyKeys.has(key)) {
        continue;
      }
      if (hasCatalogPath(enCatalog, key) && hasCatalogPath(trCatalog, key)) {
        continue;
      }
      issues.push(`${file}:${getLineNumber(source, match.index)}`);
    }
  }

  assert.equal(issues.length, 0, `Missing Laboratory i18n keys:\n${issues.join("\n")}`);
});

void test("laboratory dynamic copy.t namespaces resolve in both room catalogs", () => {
  const enCatalog = readCatalog(EN_CATALOG_PATH);
  const trCatalog = readCatalog(TR_CATALOG_PATH);
  const issues: string[] = [];
  const dynamicCopyRegex = /\.t\(\s*`([^`]*\$\{[^`]+)`/g;

  for (const file of listSourceFiles(LABORATORY_ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(dynamicCopyRegex)) {
      const template = match[1] ?? "";
      const staticPrefix = template.split("${")[0]?.replace(/\.$/, "") ?? "";
      if (
        staticPrefix !== "" &&
        hasCatalogNamespace(enCatalog, staticPrefix) &&
        hasCatalogNamespace(trCatalog, staticPrefix)
      ) {
        continue;
      }
      issues.push(`${file}:${getLineNumber(source, match.index)}`);
    }
  }

  assert.equal(issues.length, 0, `Missing Laboratory dynamic i18n namespaces:\n${issues.join("\n")}`);
});
