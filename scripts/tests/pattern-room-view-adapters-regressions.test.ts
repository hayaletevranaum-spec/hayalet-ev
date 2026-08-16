import test from "node:test";
import assert from "node:assert/strict";

import {
  adaptArchiveViewModel,
  adaptBoardViewModel,
  adaptDeskViewModel,
  adaptDomainToViewModels,
  adaptOverviewViewModel,
  adaptReportViewModel,
  adaptTenthManViewModel,
  type PatternRoomDomainViewSource,
} from "../../rooms/pattern-room/shared/adapters/pattern-room-view-adapters.ts";
import { PATTERN_ROOM_DOMAIN_TEST_FIXTURE } from "../../rooms/pattern-room/shared/data/testing/pattern-room-domain.fixture.ts";
import {
  createLocalState,
  type PatternRoomLocalOverlay,
} from "../../rooms/pattern-room/shared/state/pattern-room-local-state.ts";
import {
  PATTERN_SOURCE_TYPES,
  type PatternSourceType,
} from "../../rooms/pattern-room/shared/types/pattern-room-domain.ts";
import type { PatternRoomWorkspaceModel } from "../../rooms/pattern-room/shared/types/pattern-room.ts";

const EXPECTED_SOURCE_TYPE_LABELS: Record<PatternSourceType, string> = {
  book: "Kitap / Metin",
  religious_text: "Dini metin",
  newspaper: "Gazete",
  subtitle_archive: "Altyazı arşivi",
  web_archive: "Web arşivi",
  visual: "Görsel kaynak",
  laboratory_result: "Laboratory sonucu",
  number_analysis: "Sayı analizi",
  personal_note: "Kişisel not",
  unknown: "Belirsiz kaynak",
};

function createDomainWithAllSourceTypes(): PatternRoomDomainViewSource {
  return {
    ...PATTERN_ROOM_DOMAIN_TEST_FIXTURE,
    sources: PATTERN_SOURCE_TYPES.map((sourceType, index) => {
      return {
        id: `source-${sourceType}`,
        topicId: PATTERN_ROOM_DOMAIN_TEST_FIXTURE.topic.id,
        label: `Source ${index + 1}`,
        sourceType,
        origin: "Synthetic adapter test source",
        reliability: "unknown",
        addedBy: "system",
        addedAt: "2026-05-20T11:30:00.000Z",
      };
    }),
  };
}

void test("pattern-room phase 3B adapter returns the existing UI mock shape", () => {
  const viewModels: PatternRoomWorkspaceModel = adaptDomainToViewModels(
    PATTERN_ROOM_DOMAIN_TEST_FIXTURE
  );

  assert.equal(viewModels.roomTitle, "İz Sürme Odası");
  assert.equal(viewModels.roomLabel, "Pattern Room");
  assert.equal(viewModels.subject, "Dünya’nın Şekli");
  assert.equal(viewModels.boardCategories.length, 4);
  assert.equal(viewModels.sources.length, 4);
  assert.equal(viewModels.claims.length > 0, true);
  assert.equal(viewModels.tenthManSession.status, "dummy");
  assert.equal(viewModels.reportSummary.sections.length > 0, true);
});

void test("pattern-room phase 3B focused adapters keep panel data non-empty", () => {
  assert.equal(adaptOverviewViewModel(PATTERN_ROOM_DOMAIN_TEST_FIXTURE).subject.length > 0, true);
  assert.equal(
    adaptBoardViewModel(PATTERN_ROOM_DOMAIN_TEST_FIXTURE).boardCategories.length > 0,
    true
  );
  assert.equal(adaptArchiveViewModel(PATTERN_ROOM_DOMAIN_TEST_FIXTURE).sources.length > 0, true);
  assert.equal(adaptDeskViewModel(PATTERN_ROOM_DOMAIN_TEST_FIXTURE).claims.length > 0, true);
  assert.equal(
    adaptTenthManViewModel(PATTERN_ROOM_DOMAIN_TEST_FIXTURE).tenthManSession.roles.length > 0,
    true
  );
  assert.equal(
    adaptReportViewModel(PATTERN_ROOM_DOMAIN_TEST_FIXTURE).reportSummary.sections.length > 0,
    true
  );
});

void test("pattern-room phase 3B adapter maps source type labels for archive cards", () => {
  const labels = adaptArchiveViewModel(PATTERN_ROOM_DOMAIN_TEST_FIXTURE).sources.map((source) => {
    return source.sourceTypeLabel;
  });

  assert.deepEqual(labels, ["Kitap / Metin", "Görsel kaynak", "Kişisel not", "Belirsiz kaynak"]);
});

void test("pattern-room phase 13D archive source previews stay compact while notes stay intact", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const longNote =
    "Uzun kaynak gövdesi arşiv kartında tam olarak basılmamalı. Bu gövde snapshot ve local state içinde korunur; kart ise kısa bir önizleme gösterir. Böylece uzun kitap, makale veya arşiv metinleri paneli aşağı doğru aşırı büyütmez ve mevcut kaynak kartı davranışı korunur.\n\n" +
    "Bu kuyruk state içinde kalmalı fakat Archive kart metninde görünmemelidir.";
  const expectedPreview = `${longNote.replace(/\s+/g, " ").trim().slice(0, 240).trimEnd()}…`;

  localState.addAuthoredSource("Uzun kaynak", "Arşiv", longNote);

  const viewModels = adaptDomainToViewModels(
    PATTERN_ROOM_DOMAIN_TEST_FIXTURE,
    localState.getOverlay()
  );
  const localSource = viewModels.sources.find((source) => {
    return source.id === "local-source-001";
  });
  const domainSource = adaptArchiveViewModel(PATTERN_ROOM_DOMAIN_TEST_FIXTURE).sources[0];

  assert.ok(localSource);
  assert.equal(localSource.note, longNote);
  assert.equal(localSource.notePreview, expectedPreview);
  assert.equal(localSource.notePreview.includes("Bu kuyruk"), false);
  assert.ok(domainSource);
  assert.equal(domainSource.notePreview, domainSource.note);
});

void test("pattern-room phase 4B adapter applies local overlay without mutating domain mock data", () => {
  const beforeDomain = JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);

  localState.sendToDesk("node-navigation-source");
  localState.pinSource("source-shadow-comparison", "evidence");
  localState.addToDebate("node-shadow-analysis");
  localState.addToDebate("source-shadow-comparison");
  localState.addLocalNote("Yerel smoke notu");

  const viewModels = adaptDomainToViewModels(
    PATTERN_ROOM_DOMAIN_TEST_FIXTURE,
    localState.getOverlay()
  );
  const evidenceCategory = viewModels.boardCategories.find((category) => {
    return category.id === "board-evidence";
  });
  const nextResearchSection = viewModels.reportSummary.sections.find((section) => {
    return section.id === "report-next-research-notes";
  });

  assert.ok(evidenceCategory);
  assert.ok(evidenceCategory.pins.some((pin) => pin.id === "source-shadow-comparison"));
  assert.ok(viewModels.claims.some((claim) => claim.id === "desk-local-node-navigation-source"));
  assert.ok(
    viewModels.tenthManSession.references.some((reference) => {
      return reference.label === "Golge acisi analizi";
    })
  );
  assert.ok(
    viewModels.tenthManSession.references.some((reference) => {
      return reference.label === "Golge karsilastirma gorseli";
    })
  );
  assert.ok(nextResearchSection);
  assert.deepEqual(
    nextResearchSection.items.map((item) => item.body),
    ["Yerel smoke notu"]
  );
  assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
});

void test("pattern-room phase 4B adapter silently skips stale overlay ids", () => {
  const overlay: PatternRoomLocalOverlay = {
    deskNodeIds: ["missing-node"],
    pinnedSourceIds: ["missing-source"],
    sourcePinnedLayerById: { "missing-source": "evidence" },
    debateReferenceIds: ["missing-node", "missing-source"],
    debatePhase: "idle",
    debateLocalTurns: [],
    debateRolesConnected: {
      AI0: false,
      AI1: false,
      AI2: false,
      US1: false,
    },
    debateLocalVerdict: null,
    localNotes: [
      {
        id: "local-note-missing",
        text: "Elle yazılmış not",
        createdAt: "2026-05-20T12:00:00.000Z",
      },
    ],
    localAuthoredNodes: [],
    localAuthoredSources: [],
    localAuthoredEvidence: [],
    localAuthoredEdges: [],
  };

  const viewModels = adaptDomainToViewModels(PATTERN_ROOM_DOMAIN_TEST_FIXTURE, overlay);
  const flattenedBoardPins = viewModels.boardCategories.flatMap((category) => {
    return category.pins;
  });

  assert.equal(
    flattenedBoardPins.some((pin) => pin.id === "missing-source"),
    false
  );
  assert.equal(
    viewModels.claims.some((claim) => claim.id.includes("missing-node")),
    false
  );
  assert.deepEqual(viewModels.tenthManSession.references, []);
  const nextResearchSection = viewModels.reportSummary.sections.find((section) => {
    return section.id === "report-next-research-notes";
  });
  assert.ok(nextResearchSection);
  assert.deepEqual(
    nextResearchSection.items.map((item) => item.body),
    ["Elle yazılmış not"]
  );
});

void test("pattern-room phase 5B local debate state machine stays overlay-only", () => {
  const beforeDomain = JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);

  localState.prepareDebate();
  assert.equal(localState.getOverlay().debatePhase, "idle");

  localState.addToDebate("node-navigation-source");
  localState.prepareDebate();
  assert.equal(localState.getOverlay().debatePhase, "preparation");

  localState.assignDebateRoles();
  assert.equal(localState.getOverlay().debatePhase, "role_assignment");
  assert.equal(
    Object.values(localState.getOverlay().debateRolesConnected).every((connected) => connected),
    true
  );

  localState.startDebate();
  localState.advanceDebatePhase();
  localState.advanceDebatePhase();
  localState.advanceDebatePhase();
  localState.advanceDebatePhase();
  assert.equal(localState.getOverlay().debatePhase, "judge_mapping");
  assert.deepEqual(
    localState.getOverlay().debateLocalTurns.map((turn) => turn.actorId),
    ["AI0", "AI2", "AI1", "AI2", "US1"]
  );

  localState.completeDebate();
  localState.reflectDebateToReport();
  localState.reflectDebateToReport();

  const viewModels = adaptDomainToViewModels(
    PATTERN_ROOM_DOMAIN_TEST_FIXTURE,
    localState.getOverlay()
  );
  const nextResearchSection = viewModels.reportSummary.sections.find((section) => {
    return section.id === "report-next-research-notes";
  });

  assert.equal(viewModels.tenthManSession.status, "completed");
  assert.equal(viewModels.tenthManSession.phase, "completed");
  assert.equal(viewModels.tenthManSession.turns?.length, 5);
  assert.match(viewModels.tenthManSession.verdict ?? "", /Gerçek AI, provider veya relay/);
  assert.ok(nextResearchSection);
  assert.equal(nextResearchSection.items.length, 1);
  assert.match(nextResearchSection.items[0]?.body ?? "", /10\. Adam local oturum özeti/);
  assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
});

void test("pattern-room phase 7B local authoring appears in board, archive, desk, report, and debate views", () => {
  const beforeDomain = JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);

  localState.addAuthoredClaim("Yerel iddia", "Kullanıcının local iddia notu.");
  localState.addAuthoredInspiration("Yerel ilham", "Analiz katmanına düşen fikir.");
  localState.addAuthoredUncertainty("Yerel belirsizlik", "Belirsizlik katmanında izlenecek soru.");
  localState.addAuthoredEvidence("Yerel kanıt", "Local alıntı", "Local yorum");
  localState.addAuthoredSource("Yerel kaynak", "Kullanıcı not defteri", "Sadece overlay kaynağı.");

  localState.addToDebate("local-node-001");
  localState.addToDebate("local-source-001");
  localState.addToDebate("local-evidence-001");
  localState.addToDebate("local-node-999");

  const viewModels = adaptDomainToViewModels(
    PATTERN_ROOM_DOMAIN_TEST_FIXTURE,
    localState.getOverlay()
  );
  const interpretationCategory = viewModels.boardCategories.find((category) => {
    return category.id === "board-interpretation";
  });
  const analysisCategory = viewModels.boardCategories.find((category) => {
    return category.id === "board-analysis";
  });
  const uncertaintyCategory = viewModels.boardCategories.find((category) => {
    return category.id === "board-uncertainty";
  });
  const evidenceCategory = viewModels.boardCategories.find((category) => {
    return category.id === "board-evidence";
  });
  const localSource = viewModels.sources.find((source) => {
    return source.id === "local-source-001";
  });
  const localEvidenceSection = viewModels.reportSummary.sections.find((section) => {
    return section.id === "report-evidence-notes";
  });

  assert.ok(interpretationCategory);
  assert.ok(
    interpretationCategory.pins.some((pin) => {
      return pin.id === "local-node-001" && pin.isLocal && pin.layer === "interpretation";
    })
  );
  assert.ok(analysisCategory);
  assert.ok(
    analysisCategory.pins.some((pin) => {
      return pin.id === "local-node-002" && pin.isLocal && pin.layer === "analysis";
    })
  );
  assert.ok(uncertaintyCategory);
  assert.ok(
    uncertaintyCategory.pins.some((pin) => {
      return pin.id === "local-node-003" && pin.isLocal && pin.layer === "uncertainty";
    })
  );
  assert.ok(evidenceCategory);
  assert.ok(
    evidenceCategory.pins.some((pin) => {
      return pin.id === "local-evidence-001" && pin.kind === "evidence" && pin.isLocal;
    })
  );
  assert.ok(localSource);
  assert.equal(localSource.sourceTypeLabel, "Yerel Kaynak");
  assert.equal(localSource.isLocal, true);
  assert.ok(
    viewModels.claims.some((claim) => {
      return claim.id === "claim-local-node-001" && claim.label === "Yerel iddia";
    })
  );
  assert.ok(localEvidenceSection);
  assert.deepEqual(
    localEvidenceSection.items.map((item) => {
      return {
        body: item.body,
        detail: item.detail,
        label: item.label,
      };
    }),
    [
      {
        body: "Local alıntı",
        detail: "Yorum: Local yorum",
        label: "Yerel kanıt",
      },
    ]
  );
  assert.deepEqual(localState.getOverlay().debateReferenceIds, [
    "local-node-001",
    "local-source-001",
    "local-evidence-001",
  ]);
  assert.deepEqual(
    viewModels.tenthManSession.references.map((reference) => reference.kind),
    ["node", "source", "evidence"]
  );
  assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
});

void test("pattern-room phase 13F local evidence can expose source labels in board and report", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.addAuthoredSource("Kaynaklı arşiv", "Kullanıcı arşivi", "Tam kaynak metni.");
  localState.addAuthoredEvidence(
    "Kaynaklı kanıt",
    "Kaynaklı alıntı",
    "Kaynaklı yorum",
    "evidence",
    {
      sourceId: "local-source-001",
      sourceLabel: "Kaynaklı arşiv",
    }
  );

  const viewModels = adaptDomainToViewModels(
    PATTERN_ROOM_DOMAIN_TEST_FIXTURE,
    localState.getOverlay()
  );
  const evidenceCategory = viewModels.boardCategories.find((category) => {
    return category.id === "board-evidence";
  });
  const localEvidenceSection = viewModels.reportSummary.sections.find((section) => {
    return section.id === "report-evidence-notes";
  });
  const evidencePin = evidenceCategory?.pins.find((pin) => {
    return pin.id === "local-evidence-001";
  });

  assert.ok(evidencePin);
  assert.equal(evidencePin.sourceId, "local-source-001");
  assert.equal(evidencePin.sourceLabel, "Kaynaklı arşiv");
  assert.ok(localEvidenceSection);
  assert.equal(localEvidenceSection.items[0]?.body, "Kaynaklı alıntı");
  assert.equal(localEvidenceSection.items[0].detail, "Yorum: Kaynaklı yorum");
  assert.ok(localEvidenceSection.items[0].meta.includes("Kaynak: Kaynaklı arşiv"));
});

void test("pattern-room phase 8B local authored connections appear only in the report", () => {
  const beforeDomain = JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);

  localState.addAuthoredEdge("supports", "node-navigation-source", "source-shadow-comparison");
  localState.addAuthoredEdge("supports", "node-navigation-source", "node-navigation-source");

  const viewModels = adaptDomainToViewModels(
    PATTERN_ROOM_DOMAIN_TEST_FIXTURE,
    localState.getOverlay()
  );
  const flattenedBoardPins = viewModels.boardCategories.flatMap((category) => {
    return category.pins;
  });
  const connectionsSection = viewModels.reportSummary.sections.find((section) => {
    return section.id === "report-local-connections";
  });

  assert.equal(
    flattenedBoardPins.some((pin) => pin.id === "local-edge-001"),
    false
  );
  assert.ok(connectionsSection);
  assert.equal(connectionsSection.label, "Yerel Bağlantılar");
  assert.equal(connectionsSection.tone, "analysis");
  assert.equal(
    connectionsSection.note,
    "Oda içinde kurulan yerel bağlantılar kesin hüküm üretmeden gösterilir."
  );
  assert.deepEqual(
    connectionsSection.items.map((item) => item.body),
    ["Seyir defteri kaynagi → destekliyor → Golge karsilastirma gorseli"]
  );
  assert.equal(localState.getOverlay().localAuthoredEdges.length, 1);
  assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
});

void test("pattern-room phase 8B board adapter exposes connection options without edge pins", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);

  localState.addAuthoredClaim("Yerel bağlantı iddiası", "Yerel node seçeneği.");
  localState.addAuthoredSource("Yerel bağlantı kaynağı", "Yerel arşiv", "");
  localState.addAuthoredEvidence("Yerel bağlantı kanıtı", "Yerel alıntı", "");
  localState.addAuthoredEdge("questions", "local-node-001", "local-evidence-001");

  const boardViewModel = adaptBoardViewModel(
    PATTERN_ROOM_DOMAIN_TEST_FIXTURE,
    localState.getOverlay()
  );
  const connectionOptionIds = boardViewModel.connectionOptions.map((option) => option.id);
  const flattenedBoardPins = boardViewModel.boardCategories.flatMap((category) => {
    return category.pins;
  });

  assert.ok(connectionOptionIds.includes("node-navigation-source"));
  assert.ok(connectionOptionIds.includes("source-shadow-comparison"));
  assert.ok(connectionOptionIds.includes("local-node-001"));
  assert.ok(connectionOptionIds.includes("local-source-001"));
  assert.ok(connectionOptionIds.includes("local-evidence-001"));
  assert.equal(
    flattenedBoardPins.some((pin) => pin.id === "local-edge-001"),
    false
  );
});

void test("pattern-room phase 3B adapter maps every source type label", () => {
  const labels = adaptArchiveViewModel(createDomainWithAllSourceTypes()).sources.map((source) => {
    return source.sourceTypeLabel;
  });

  assert.deepEqual(
    labels,
    PATTERN_SOURCE_TYPES.map((sourceType) => {
      return EXPECTED_SOURCE_TYPE_LABELS[sourceType];
    })
  );
});

void test("pattern-room phase 3B adapter maps interpretation layer to commentary tone", () => {
  const interpretationCategory = adaptBoardViewModel(
    PATTERN_ROOM_DOMAIN_TEST_FIXTURE
  ).boardCategories.find((category) => category.label === "Yorum");

  assert.ok(interpretationCategory);
  assert.equal(interpretationCategory.tone, "commentary");
});

void test("pattern-room phase 3B adapter maps debate roles for the tenth-man panel", () => {
  const labels = adaptTenthManViewModel(PATTERN_ROOM_DOMAIN_TEST_FIXTURE).tenthManSession.roles.map(
    (role) => role.label
  );

  assert.deepEqual(labels, [
    "AI0 — Araştırmacı",
    "AI1 — Savunucu",
    "AI2 — 10. Adam / Karşıt",
    "US1 — Hakem / Uzak kullanıcı",
  ]);
});

void test("pattern-room phase 3B report adapter creates cautious report sections", () => {
  const reportSummary = adaptReportViewModel(PATTERN_ROOM_DOMAIN_TEST_FIXTURE).reportSummary;

  assert.deepEqual(
    reportSummary.sections.map((section) => section.label),
    [
      "Kaynak Özeti",
      "Kanıt Notları",
      "Pano Notları",
      "Yerel Bağlantılar",
      "10. Adam İzleri",
      "Sonraki Araştırma Notları",
    ]
  );
  assert.equal(
    reportSummary.sections.every((section) => section.bullets.length > 0),
    true
  );
});

void test("pattern-room phase 15A report adapter drafts local evidence without verdict language", () => {
  const beforeDomain = JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);

  localState.addAuthoredSource("Uzun kaynak başlığı", "Kullanıcı arşivi", "Uzun kaynak gövdesi.");
  localState.addAuthoredClaim("Yerel iddia", "Kullanıcı tarafından eklenen iddia.");
  localState.addAuthoredInspiration("Yerel ilham", "Kullanıcı tarafından eklenen ilham.");
  localState.addAuthoredUncertainty("Eksik bağlam", "Sonraki araştırma için belirsizlik.");
  localState.addAuthoredEvidence(
    "Kaynaklı kanıt",
    "Kaynak detayından seçilen kısa pasaj.",
    "Kullanıcı yorumu ayrı kalır.",
    "evidence",
    { sourceId: "local-source-001", sourceLabel: "Uzun kaynak başlığı" }
  );
  localState.addAuthoredEdge("supports", "local-node-001", "local-evidence-001", "Bağ notu.");
  localState.addLocalNote("Kullanıcı takip notu.");
  localState.addToDebate("local-node-001");
  localState.prepareDebate();
  localState.assignDebateRoles();
  localState.startDebate();
  localState.advanceDebatePhase();
  localState.advanceDebatePhase();
  localState.advanceDebatePhase();
  localState.advanceDebatePhase();
  localState.completeDebate();

  const baseOverlay = localState.getOverlay();
  const firstSource = baseOverlay.localAuthoredSources[0];
  assert.ok(firstSource);
  const overlay: PatternRoomLocalOverlay = {
    ...baseOverlay,
    localAuthoredSources: [
      {
        ...firstSource,
        segments: [
          { id: "segment-001", label: "Segment 1", order: 0, text: "İlk segment." },
          { id: "segment-002", label: "Segment 2", order: 1, text: "İkinci segment." },
        ],
      },
    ],
  };

  const reportSummary = adaptReportViewModel(
    PATTERN_ROOM_DOMAIN_TEST_FIXTURE,
    overlay
  ).reportSummary;
  const sourceSection = reportSummary.sections.find((section) => {
    return section.id === "report-source-summary";
  });
  const evidenceSection = reportSummary.sections.find((section) => {
    return section.id === "report-evidence-notes";
  });
  const boardSection = reportSummary.sections.find((section) => {
    return section.id === "report-board-notes";
  });
  const connectionSection = reportSummary.sections.find((section) => {
    return section.id === "report-local-connections";
  });
  const tenthManSection = reportSummary.sections.find((section) => {
    return section.id === "report-tenth-man-traces";
  });
  const nextResearchSection = reportSummary.sections.find((section) => {
    return section.id === "report-next-research-notes";
  });

  assert.ok(sourceSection);
  assert.equal(sourceSection.note, "Archive sayımı: 4 domain kaynak, 1 yerel kaynak.");
  assert.equal(sourceSection.items[4]?.label, "Uzun kaynak başlığı");
  assert.ok(sourceSection.items[4].meta.includes("Segment: 2"));

  assert.ok(evidenceSection);
  assert.equal(evidenceSection.items[0]?.label, "Kaynaklı kanıt");
  assert.equal(evidenceSection.items[0].body, "Kaynak detayından seçilen kısa pasaj.");
  assert.equal(evidenceSection.items[0].detail, "Yorum: Kullanıcı yorumu ayrı kalır.");
  assert.ok(evidenceSection.items[0].meta.includes("Kaynak: Uzun kaynak başlığı"));

  assert.ok(boardSection);
  assert.deepEqual(
    boardSection.items.map((item) => item.meta.find((meta) => meta.startsWith("Tür:"))),
    ["Tür: İddia", "Tür: İlham", "Tür: Belirsizlik"]
  );

  assert.ok(connectionSection);
  assert.equal(connectionSection.items[0]?.body, "Yerel iddia → destekliyor → Kaynaklı kanıt");
  assert.equal(connectionSection.items[0].detail, "Not: Bağ notu.");

  assert.ok(tenthManSection);
  assert.equal(tenthManSection.items.length > 0, true);
  assert.equal(
    tenthManSection.items.some((item) => item.label === "Yerel tartışma özeti"),
    true
  );

  assert.ok(nextResearchSection);
  assert.ok(nextResearchSection.items.some((item) => item.body === "Kullanıcı takip notu."));
  assert.ok(nextResearchSection.items.some((item) => item.label === "Eksik bağlam"));

  const reportCopy = reportSummary.sections
    .flatMap((section) => [section.label, section.note, section.emptyMessage, ...section.bullets])
    .join(" ");
  assert.doesNotMatch(
    reportCopy,
    /kesin cevap|kesin sonuç|kanıtlandı|doğrulandı|ispatlandı|AI sonucu|nihai rapor|provider|relay|final verdict|truth score/i
  );
  assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
});

void test("pattern-room truthful report metrics separate sources, references, turns, and summaries", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.addAuthoredSource("Yerel kaynak A", "Kullanıcı arşivi", "Kaynak A notu.");
  localState.addAuthoredSource("Yerel kaynak B", "Kullanıcı arşivi", "Kaynak B notu.");
  localState.addToDebate("local-source-001");
  localState.addToDebate("local-source-002");

  const beforeSession = adaptReportViewModel(
    PATTERN_ROOM_DOMAIN_TEST_FIXTURE,
    localState.getOverlay()
  ).reportSummary;
  const sourceSection = beforeSession.sections.find((section) => {
    return section.id === "report-source-summary";
  });
  const tenthManSection = beforeSession.sections.find((section) => {
    return section.id === "report-tenth-man-traces";
  });

  assert.ok(sourceSection);
  assert.equal(sourceSection.items.length, PATTERN_ROOM_DOMAIN_TEST_FIXTURE.sources.length + 2);
  assert.deepEqual(sourceSection.metrics, [
    {
      id: "sources",
      label: "kaynak",
      value: PATTERN_ROOM_DOMAIN_TEST_FIXTURE.sources.length + 2,
    },
  ]);
  assert.doesNotMatch(
    sourceSection.items.map((item) => item.label).join(" "),
    /Archive kaynak sayımı/
  );
  assert.ok(tenthManSection);
  assert.deepEqual(tenthManSection.metrics, [
    { id: "references", label: "referans", value: 2 },
    { id: "turns", label: "tur", value: 0 },
    { id: "summary", label: "özet", value: 0 },
  ]);
  assert.equal(
    tenthManSection.items.filter((item) => item.id.startsWith("report-tenth-reference-")).length,
    2
  );

  localState.prepareDebate();
  localState.assignDebateRoles();
  localState.startDebate();
  localState.advanceDebatePhase();
  localState.advanceDebatePhase();
  localState.advanceDebatePhase();
  localState.advanceDebatePhase();
  localState.completeDebate();

  const completedSection = adaptReportViewModel(
    PATTERN_ROOM_DOMAIN_TEST_FIXTURE,
    localState.getOverlay()
  ).reportSummary.sections.find((section) => {
    return section.id === "report-tenth-man-traces";
  });
  assert.ok(completedSection);
  assert.deepEqual(completedSection.metrics, [
    { id: "references", label: "referans", value: 2 },
    { id: "turns", label: "tur", value: 5 },
    { id: "summary", label: "özet", value: 1 },
  ]);
});

void test("pattern-room local connection editing projects selectable graph details", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.addAuthoredEdge(
    "supports",
    "node-navigation-source",
    "source-shadow-comparison",
    "İlk bağlantı notu."
  );

  assert.equal(
    localState.updateLocalEdge("local-edge-001", "contradicts", "Güncel bağlantı notu."),
    true
  );
  assert.equal(
    localState.updateLocalEdge("local-edge-001", "contradicts", "Güncel bağlantı notu."),
    false
  );

  const viewModels = adaptDomainToViewModels(
    PATTERN_ROOM_DOMAIN_TEST_FIXTURE,
    localState.getOverlay()
  );
  const localConnection = viewModels.connections.find((connection) => {
    return connection.id === "local-edge-001";
  });
  const domainConnection = viewModels.connections.find((connection) => {
    return connection.scope === "domain";
  });

  assert.ok(localConnection);
  assert.equal(localConnection.edgeType, "contradicts");
  assert.equal(localConnection.edgeTypeLabel, "çelişiyor");
  assert.equal(localConnection.note, "Güncel bağlantı notu.");
  assert.equal(localConnection.scope, "local");
  assert.equal(localConnection.editable, true);
  assert.ok(domainConnection);
  assert.equal(domainConnection.editable, false);
});
