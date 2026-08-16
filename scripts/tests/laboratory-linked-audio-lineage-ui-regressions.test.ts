import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createLabStore } from "../../rooms/laboratory/runtime/lab-store.ts";
import { renderLabSourcePanel } from "../../rooms/laboratory/ui/lab-source-panel.ts";

const sourcePresets = JSON.parse(
  readFileSync("rooms/laboratory/tools/source-presets.json", "utf8")
) as Record<string, unknown>;
const ytDlpForm = JSON.parse(
  readFileSync("rooms/laboratory/tools/yt-dlp.form.json", "utf8")
) as Record<string, unknown>;

function createLineageState(
  options: {
    startOffsetMs?: number;
  } = {}
) {
  const store = createLabStore();
  store.dispatch({
    type: "snapshot-received",
    payload: {
      featureId: "media-analysis",
      ready: true,
      activeProjectId: "project-1",
      projects: [{ id: "project-1", name: "lab-demo.mp4", hasSource: true }],
      activeProject: {
        id: "project-1",
        name: "lab-demo.mp4",
        createdAt: "2026-04-23T18:30:00.000Z",
        source: {
          status: "ready",
          kind: "video",
          mode: "local",
          previewUrl: "file:///tmp/lab-demo.mp4",
          storedFileName: "lab-demo.mp4",
          storedPath: "/tmp/lab-demo.mp4",
          routeLabel: "Local Copy",
          drafts: {
            urlInput: "",
            youtubeUrl: "",
            youtubePreset: "medium",
            youtubeCustom: {},
          },
          metadata: {
            durationSeconds: 1.4,
            sizeBytes: 2048,
          },
        },
        edit: {},
        profile: {
          preflight: {},
        },
        process: {
          records: {},
        },
        report: {
          records: {},
        },
        assets: [
          {
            id: "source-active",
            type: "source",
            name: "lab-demo.mp4",
            localPath: "/tmp/lab-demo.mp4",
            createdAt: 100,
            sourceId: "source-active",
            metadata: {
              storedFileName: "lab-demo.mp4",
            },
          },
          {
            id: "asset-audio-linked",
            type: "audio",
            name: "audio.wav",
            localPath: "/tmp/audio.wav",
            createdAt: 200,
            sourceId: "source-active",
            derivedFromAssetId: "source-active",
            derivedFromSourceId: "source-active",
            metadata: {
              durationMs: 1400,
              startOffsetMs: options.startOffsetMs ?? 0,
            },
          },
          {
            id: "asset-audio-linked-newer",
            type: "audio",
            name: "audio-newer.wav",
            localPath: "/tmp/audio-newer.wav",
            createdAt: 300,
            sourceId: "source-active",
            derivedFromAssetId: "source-active",
            derivedFromSourceId: "source-active",
            metadata: {
              durationMs: 1400,
              startOffsetMs: 0,
              ...(options.startOffsetMs === undefined ? {} : { startOffsetMs: options.startOffsetMs }),
            },
          },
        ],
      },
      workbench: {
        activeModuleId: "media-analysis",
        availableModuleIds: ["media-analysis"],
        selectedModuleIds: ["media-analysis"],
      },
      sourcePresets,
      ytDlpForm,
      toolRegistry: [],
      toolState: {
        tools: {},
      },
      sourceProbeStatus: "completed",
      profileModels: [],
      reports: {
        user: null,
        ai: null,
        emptyReason: "Rapor henüz üretilmedi.",
      },
      activityFeed: [],
    },
  });
  return store.getState();
}

void test("laboratory source panel renders linked source and sync label for audio assets", () => {
  const panelHtml = renderLabSourcePanel(createLineageState());

  assert.match(panelHtml, /audio\.wav/);
  assert.match(panelHtml, /data-lab-action="focus-source-preview"/);
  assert.match(panelHtml, /Kaynak: lab-demo\.mp4/);
  assert.match(panelHtml, /Senkron: ✓ Aynı zaman ekseni/);
});
