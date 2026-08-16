import test from "node:test";
import assert from "node:assert/strict";

import { renderOperatorProfilePanel } from "../../rooms/repair-room/ui/panels/operator-profile-panel.ts";
import { normalizeRepairHostMessage } from "../../rooms/repair-room/shared/ui/host-messages.ts";
import { createInitialRepairRuntimeState } from "../../rooms/repair-room/host/state/repair-runtime-state.ts";
import { createRepairUiSnapshot } from "../../rooms/repair-room/host/state/repair-selectors.ts";

class FakeElement {
  children: FakeElement[] = [];
  dataset: Record<string, string> = {};
  parentElement: FakeElement | null = null;
  className = "";
  placeholder = "";
  selected = false;
  style: Record<string, string> = {};
  textContent = "";
  title = "";
  type = "";
  value = "";

  constructor(readonly tagName: string) {}

  append(...children: FakeElement[]): void {
    children.forEach((child) => {
      child.parentElement = this;
      this.children.push(child);
    });
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children = [];
    this.append(...children);
  }
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName.toLowerCase());
  }
}

function walk(root: FakeElement, visit: (element: FakeElement) => void): void {
  visit(root);
  root.children.forEach((child) => { walk(child, visit); });
}

function findAll(root: FakeElement, predicate: (element: FakeElement) => boolean): FakeElement[] {
  const matches: FakeElement[] = [];
  walk(root, (element) => {
    if (predicate(element)) matches.push(element);
  });
  return matches;
}

void test("repair-room host message normalization covers context and capture ingress payloads", () => {
  const context = normalizeRepairHostMessage({
    type: "host-context",
    payload: {
      locale: "tr",
      translations: { operatorProfile: { tabTools: "Araçlar" } },
    },
  });
  assert.equal(context?.type, "host-context");
  assert.equal(context.locale, "tr");
  assert.deepEqual(context.translations, { operatorProfile: { tabTools: "Araçlar" } });

  const media = normalizeRepairHostMessage({
    type: "capture-media-ingress",
    payload: {
      requestId: "repair-room:camera:test",
      createdAt: "2026-06-16T00:00:00.000Z",
      source: "android-bridge",
      target: "room:repair-room",
      asset: {
        name: "frame.jpg",
        originalName: "frame.jpg",
        path: "/tmp/frame.jpg",
        importedAt: 1,
      },
      metadata: { route: "camera" },
    },
  });
  assert.equal(media?.type, "capture-media-ingress");
  assert.equal(media.asset.path, "/tmp/frame.jpg");
  assert.equal(media.metadata?.["route"], "camera");

  const transcript = normalizeRepairHostMessage({
    type: "transcript-ingress",
    payload: {
      requestId: "repair-room:dictation:test",
      text: "Measure U14 VCC",
      source: "android-bridge",
      target: "room:repair-room",
      isFinal: true,
      createdAt: "2026-06-16T00:00:01.000Z",
      metadata: null,
    },
  });
  assert.equal(transcript?.type, "transcript-ingress");
  assert.equal(transcript.text, "Measure U14 VCC");
  assert.equal(transcript.isFinal, true);
});

void test("repair-room operator profile panel emits behavior-ready update actions", () => {
  const state = createRepairUiSnapshot(createInitialRepairRuntimeState("2026-06-16T00:00:00.000Z"));
  const documentRef = new FakeDocument() as unknown as Document;

  const toolsPanel = renderOperatorProfilePanel(documentRef, state, (_path, fallback) => fallback);
  const tabs = findAll(
    toolsPanel as unknown as FakeElement,
    (element) => element.dataset["repairAction"] === "operator-profile-tab"
  );
  assert.deepEqual(tabs.map((element) => element.dataset["tabId"]), [
    "tools",
    "skills",
    "preferences",
    "controls",
  ]);

  const addToolActions = findAll(
    toolsPanel as unknown as FakeElement,
    (element) => element.dataset["repairAction"] === "operator-profile-add-tool"
  );
  assert.equal(addToolActions.length, 1);

  const toolActions = findAll(
    toolsPanel as unknown as FakeElement,
    (element) => element.dataset["repairAction"] === "operator-profile-update"
  );
  assert.equal(toolActions.length, 0);

  const skillsPanel = renderOperatorProfilePanel(
    documentRef,
    {
      ...state,
      layout: { ...state.layout, operatorProfileTabId: "skills" },
    },
    (_path, fallback) => fallback
  );
  const addSkillActions = findAll(
    skillsPanel as unknown as FakeElement,
    (element) => element.dataset["repairAction"] === "operator-profile-add-skill"
  );
  assert.equal(addSkillActions.length, 1);

  const preferencesPanel = renderOperatorProfilePanel(
    documentRef,
    {
      ...state,
      layout: { ...state.layout, operatorProfileTabId: "preferences" },
    },
    (_path, fallback) => fallback
  );
  const preferenceActions = findAll(
    preferencesPanel as unknown as FakeElement,
    (element) => element.dataset["profileKind"] === "preference"
  );
  assert.ok(
    preferenceActions.some(
      (element) =>
        element.dataset["repairAction"] === "operator-profile-field" &&
        element.dataset["preferenceKey"] === "measurementSystem"
    )
  );
  assert.equal(
    preferenceActions.filter(
      (element) => element.dataset["preferenceKey"] === "annotationDefaultStrokeWidth"
    ).length,
    2
  );
  assert.equal(
    preferenceActions.filter((element) => element.dataset["preferenceKey"] === "riskTolerance").length,
    3
  );
  assert.equal(
    preferenceActions.filter((element) => element.dataset["preferenceKey"] === "aiVerbosity").length,
    3
  );
});
