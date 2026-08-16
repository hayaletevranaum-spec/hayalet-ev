import type {
  LabActionSuggestion,
  LabInspectionMode,
  LabSelection,
  LabSuggestionPreview,
} from "../domain/lab-types.js";

type SelectionSuggestionContext = {
  expandedTaxonomy?: boolean;
  inspectionMode?: LabInspectionMode;
  sourceKind: string;
};

function sourceSupportsClipSuggestion(sourceKind: string): boolean {
  return sourceKind === "video";
}

function sourceSupportsAudioSuggestion(sourceKind: string): boolean {
  return sourceKind === "audio" || sourceKind === "video";
}

function sourceSupportsVisualSuggestion(sourceKind: string): boolean {
  return sourceKind === "image" || sourceKind === "video";
}

function sourceSupportsFocusSuggestion(sourceKind: string): boolean {
  return sourceKind === "image" || sourceKind === "video";
}

export function getSelectionSuggestionsForContext(
  activeSelection: LabSelection | null,
  context: SelectionSuggestionContext
): LabActionSuggestion[] {
  if (activeSelection === null || activeSelection.endMs <= activeSelection.startMs) {
    return [];
  }

  const sourceKind = context.sourceKind;
  const inspectionMode = context.inspectionMode ?? "none";
  const hasSelectionRoi = activeSelection.roi !== undefined;
  const suggestions: LabActionSuggestion[] = [];

  function pushSuggestion(suggestion: LabActionSuggestion) {
    if (suggestions.some((entry) => entry.id === suggestion.id)) {
      return;
    }
    suggestions.push(suggestion);
  }

  if (sourceKind === "audio" || sourceKind === "video" || sourceKind === "image") {
    pushSuggestion({
      id: "analyze-anomaly",
      label: "Anomaliyi analiz et",
      actionType: "analyze-segment",
      confidence: hasSelectionRoi ? 0.94 : 0.9,
    });
  }

  if (sourceKind === "video") {
    pushSuggestion({
      id: "motion-check",
      label: "Hareket tutarliligini incele",
      ...(hasSelectionRoi ? { toolHint: "Inspect motion" } : {}),
      actionType: "analyze-segment",
      confidence: hasSelectionRoi || inspectionMode === "motion" ? 0.92 : 0.85,
    });
  }

  if (sourceSupportsAudioSuggestion(sourceKind)) {
    pushSuggestion({
      id: "audio-inspect",
      label: "Ses detaylarini incele",
      actionType: "inspect-audio",
      confidence: inspectionMode === "audio" ? 0.93 : 0.9,
    });
  }

  if (sourceSupportsVisualSuggestion(sourceKind)) {
    pushSuggestion({
      id: "enhance-visual",
      label: "Goruntuyu iyilestir",
      ...(hasSelectionRoi ? { toolHint: "Enhance clarity" } : {}),
      actionType: "enhance-visual",
      confidence: hasSelectionRoi || inspectionMode === "visual" ? 0.86 : 0.8,
    });
  }

  if (hasSelectionRoi && sourceSupportsFocusSuggestion(sourceKind)) {
    pushSuggestion({
      id: "inspect-region",
      label: "Secili bolgeyi incele",
      toolHint: "Focus region",
      actionType: "focus-region",
      confidence: inspectionMode === "motion" || inspectionMode === "visual" ? 0.88 : 0.82,
    });
  }

  if (hasSelectionRoi && sourceKind === "video") {
    if (
      suggestions.some(function (entry) {
        return entry.toolHint === "Inspect motion";
      }) !== true
    ) {
      pushSuggestion({
        id: "inspect-motion-region",
        label: "Bolgedeki hareketi incele",
        toolHint: "Inspect motion",
        actionType: "inspect-motion",
        confidence: inspectionMode === "motion" ? 0.9 : 0.84,
      });
    }
    pushSuggestion({
      id: "stabilize-region",
      label: "Segmenti stabilize et",
      toolHint: "Stabilize segment",
      actionType: "stabilize-segment",
      confidence: 0.72,
    });
  }

  if (hasSelectionRoi && sourceSupportsVisualSuggestion(sourceKind)) {
    if (
      suggestions.some(function (entry) {
        return entry.toolHint === "Enhance clarity";
      }) !== true
    ) {
      pushSuggestion({
        id: "enhance-region-clarity",
        label: "Bolge netligini artir",
        toolHint: "Enhance clarity",
        actionType: "enhance-visual",
        confidence: inspectionMode === "visual" ? 0.83 : 0.76,
      });
    }
  }

  if (sourceSupportsClipSuggestion(sourceKind)) {
    pushSuggestion({
      id: "extract-clip",
      label: "Bu bolumu kes",
      actionType: "extract-clip",
      confidence: suggestions.length > 0 ? 0.6 : 0.68,
    });
  } else if (sourceKind === "audio" && suggestions.length === 0) {
    pushSuggestion({
      id: "audio-inspect",
      label: "Ses detaylarini incele",
      actionType: "inspect-audio",
      confidence: inspectionMode === "audio" ? 0.93 : 0.68,
    });
  } else if (sourceSupportsFocusSuggestion(sourceKind) && hasSelectionRoi !== true) {
    pushSuggestion({
      id: "focus-region",
      label: "Bolgeye odaklan",
      actionType: "focus-region",
      confidence: suggestions.length > 0 ? 0.58 : 0.66,
    });
  }

  if (context.expandedTaxonomy !== true) {
    return suggestions;
  }

  const expandedSuggestions: LabActionSuggestion[] = suggestions.map(function (suggestion) {
    switch (suggestion.actionType) {
      case "extract-clip":
        return {
          ...suggestion,
          flowKind: "operation-result" as const,
          operationCapabilityId: "clip-export" as const,
          outputKind: "clip" as const,
          toolIds: ["ffmpeg"],
        };
      case "enhance-visual":
        return {
          ...suggestion,
          flowKind: "operation-result" as const,
          operationCapabilityId: "enhanced-frame" as const,
          outputKind: "frame" as const,
          toolIds: ["ffmpeg"],
        };
      case "stabilize-segment":
        return {
          ...suggestion,
          flowKind: "operation-result" as const,
          operationCapabilityId: "segment-stabilization" as const,
          outputKind: "clip" as const,
          toolIds: ["ffmpeg"],
        };
      case "inspect-audio":
        return {
          ...suggestion,
          analysisCapabilityId: "audio-signal" as const,
          flowKind: "analysis-report" as const,
          toolIds: ["ffmpeg"],
        };
      case "inspect-motion":
        return {
          ...suggestion,
          analysisCapabilityId: "visual-structure" as const,
          flowKind: "analysis-report" as const,
          toolIds: ["ffmpeg"],
        };
      case "focus-region":
        return {
          ...suggestion,
          analysisCapabilityId: "visual-forensics" as const,
          flowKind: "analysis-report" as const,
          toolIds: ["ffmpeg"],
        };
      default:
        return {
          ...suggestion,
          analysisCapabilityId: "visual-forensics" as const,
          flowKind: "analysis-report" as const,
          toolIds: ["ffmpeg"],
        };
    }
  });

  function pushExpandedSuggestion(suggestion: LabActionSuggestion) {
    if (expandedSuggestions.some((entry) => entry.id === suggestion.id)) {
      return;
    }
    expandedSuggestions.push(suggestion);
  }

  if (hasSelectionRoi && sourceSupportsVisualSuggestion(sourceKind)) {
    pushExpandedSuggestion({
      id: "crop-region",
      label: "Bolgeyi kirp",
      actionType: "crop-region",
      confidence: inspectionMode === "visual" ? 0.84 : 0.78,
      flowKind: "operation-result",
      operationCapabilityId: "roi-crop",
      outputKind: "image",
      toolIds: ["ffmpeg"],
    });
    pushExpandedSuggestion({
      id: "ocr-region",
      label: "Bolgede OCR tara",
      actionType: "ocr-region",
      confidence: 0.62,
      flowKind: "analysis-report",
      analysisCapabilityId: "visual-forensics",
      outputKind: "artifact",
      toolIds: ["tesseract"],
    });
  }

  if (sourceSupportsAudioSuggestion(sourceKind)) {
    pushExpandedSuggestion({
      id: "clean-audio",
      label: "Sesi temizle",
      actionType: "clean-audio",
      confidence: inspectionMode === "audio" ? 0.74 : 0.66,
      flowKind: "operation-result",
      operationCapabilityId: "audio-cleanup",
      outputKind: "audio",
      toolIds: ["ffmpeg"],
    });
    pushExpandedSuggestion({
      id: "separate-stems",
      label: "Kaynaklari ayir",
      actionType: "separate-stems",
      confidence: 0.58,
      flowKind: "operation-result",
      operationCapabilityId: "stem-separation",
      outputKind: "stem",
      toolIds: ["demucs", "ffmpeg"],
    });
  }

  pushExpandedSuggestion({
    id: "metadata-audit",
    label: "Metadata kontrolu",
    actionType: "metadata-audit",
    confidence: 0.55,
    flowKind: "analysis-report",
    analysisCapabilityId: sourceSupportsVisualSuggestion(sourceKind)
      ? "visual-forensics"
      : "audio-signal",
    outputKind: "artifact",
    toolIds: ["exiftool", "mediainfo"],
  });

  if (sourceKind === "video") {
    pushExpandedSuggestion({
      id: "detect-scenes",
      label: "Sahne gecislerini tara",
      actionType: "detect-scenes",
      confidence: 0.61,
      flowKind: "analysis-report",
      analysisCapabilityId: "visual-structure",
      outputKind: "artifact",
      toolIds: ["pyscenedetect"],
    });
  }

  if (sourceSupportsVisualSuggestion(sourceKind)) {
    pushExpandedSuggestion({
      id: "detect-objects",
      label: "Nesne ve bolge ipuclari",
      actionType: "detect-objects",
      confidence: 0.57,
      flowKind: "analysis-report",
      analysisCapabilityId: "visual-structure",
      outputKind: "artifact",
      toolIds: ["opencv", "yolo", "mediapipe"],
    });
  }

  return expandedSuggestions;
}

export function buildSelectionSuggestionPreview(
  suggestion: LabActionSuggestion,
  selection: LabSelection
): LabSuggestionPreview {
  const durationMs = Math.max(0, selection.endMs - selection.startMs);
  const durationLabel =
    durationMs <= 0
      ? "Secilen zaman araligi"
      : durationMs < 1000
        ? `${durationMs}ms secim`
        : `${(durationMs / 1000).toFixed(1)}s secim`;
  const preparationStep = `${durationLabel} hazirlanacak`;

  switch (suggestion.actionType) {
    case "analyze-segment":
      return {
        suggestionId: suggestion.id,
        title: "Segment analiz edilecek",
        steps: [
          preparationStep,
          "Gorsel ve/veya ses sinyalleri ayristirilacak",
          "Anomali veya tutarsizlik incelemesi hazirlanacak",
        ],
        expectedOutputs: [
          "Analiz raporu",
          "Tespit edilen bulgular",
          "Ilgili frame veya segment referanslari",
        ],
        estimatedCost: "medium",
      };
    case "inspect-audio":
      return {
        suggestionId: suggestion.id,
        title: "Ses analizi yapilacak",
        steps: [
          preparationStep,
          "Ses track izole edilecek",
          "Frekans ve yogunluk taramasi hazirlanacak",
          "Ani degisim noktalarina bakilacak",
        ],
        expectedOutputs: ["Ses analizi raporu", "Olasi anomali noktalari"],
        estimatedCost: "low",
      };
    case "extract-clip":
      return {
        suggestionId: suggestion.id,
        title: "Clip olusturulacak",
        steps: [preparationStep, "Secilen segment yeni bir clip olarak hazirlanacak"],
        expectedOutputs: ["Video clip"],
        estimatedCost: "low",
      };
    case "focus-region":
      return {
        suggestionId: suggestion.id,
        title: "Bolge incelemesi hazirlanacak",
        steps: [
          preparationStep,
          "Secili goruntu bolgesi izole edilecek",
          "Bolgeye odakli gorsel inceleme hazirlanacak",
        ],
        expectedOutputs: ["Bolge odakli notlar", "Ilgili goruntu referanslari"],
        estimatedCost: "low",
      };
    case "inspect-motion":
      return {
        suggestionId: suggestion.id,
        title: "Bolgedeki hareket incelemesi hazirlanacak",
        steps: [
          preparationStep,
          "Secili goruntu bolgesi hareket odakli izole edilecek",
          "Frame seviyesinde hareket belirsizligi ve akis okunabilirligi gozden gecirilecek",
        ],
        expectedOutputs: ["Hareket odakli notlar", "Frame referanslari"],
        estimatedCost: "low",
      };
    case "crop-region":
      return {
        suggestionId: suggestion.id,
        title: "Bolge kirpma onizlemesi hazirlanacak",
        steps: [preparationStep, "Secili ROI yeni bir goruntu varligi olarak hazirlanacak"],
        expectedOutputs: ["Kirpilmis goruntu", "ROI metadata"],
        estimatedCost: "low",
      };
    case "clean-audio":
      return {
        suggestionId: suggestion.id,
        title: "Ses temizleme onizlemesi hazirlanacak",
        steps: [
          preparationStep,
          "Ses penceresi temizleme veya band-pass varyanti icin hazirlanacak",
        ],
        expectedOutputs: ["Temizlenmis ses varyanti", "Filtre metadata"],
        estimatedCost: "medium",
      };
    case "separate-stems":
      return {
        suggestionId: suggestion.id,
        title: "Kaynak ayirma onizlemesi hazirlanacak",
        steps: [preparationStep, "Secili ses penceresi stem ayirma icin paketlenecek"],
        expectedOutputs: ["Izole stem varliklari", "Stem kanit ozeti"],
        estimatedCost: "high",
      };
    case "ocr-region":
      return {
        suggestionId: suggestion.id,
        title: "OCR analizi hazirlanacak",
        steps: [preparationStep, "Secili goruntu bolgesi metin taramasi icin hazirlanacak"],
        expectedOutputs: ["OCR metni", "Guven ozeti"],
        estimatedCost: "medium",
      };
    case "metadata-audit":
      return {
        suggestionId: suggestion.id,
        title: "Metadata kontrolu hazirlanacak",
        steps: [preparationStep, "Kaynak metadata ve provenance sinyalleri rapor icin okunacak"],
        expectedOutputs: ["Metadata raporu", "Provenance notlari"],
        estimatedCost: "low",
      };
    case "detect-scenes":
      return {
        suggestionId: suggestion.id,
        title: "Sahne gecisi analizi hazirlanacak",
        steps: [preparationStep, "Secili aralik sahne sinirlari icin taranacak"],
        expectedOutputs: ["Sahne sinirlari", "Zaman cizelgesi isaretleri"],
        estimatedCost: "medium",
      };
    case "detect-objects":
      return {
        suggestionId: suggestion.id,
        title: "Nesne analizi hazirlanacak",
        steps: [preparationStep, "Goruntu bolgesi nesne ve poz ipuclari icin taranacak"],
        expectedOutputs: ["Nesne/bolge ipuclari", "Frame referanslari"],
        estimatedCost: "medium",
      };
    default:
      if (suggestion.actionType === "stabilize-segment") {
        return {
          suggestionId: suggestion.id,
          title: "Stabilizasyon onizlemesi hazirlanacak",
          steps: [
            preparationStep,
            "Secilen bolge ve segment sabitlenmis bir inceleme gorunumu icin hazirlanacak",
            "Goruntu akisi karsilastirmali olarak gozden gecirilecek",
          ],
          expectedOutputs: ["Stabilizasyon notlari", "Karsilastirmali goruntu referanslari"],
          estimatedCost: "low",
        };
      }
      return {
        suggestionId: suggestion.id,
        title: "Islem hazirlaniyor",
        steps: ["Bu islem icin detayli plan henuz tanimli degil"],
        expectedOutputs: [],
        estimatedCost: "low",
      };
  }
}
