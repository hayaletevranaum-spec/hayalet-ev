import type { LabI18nKey } from "./lab-i18n.js";

export const labI18nTr: Record<LabI18nKey, string> = {
  "posture.proceed": "Devam et",
  "posture.caution": "Dikkatle ilerle",
  "posture.reconsider": "Yeniden değerlendir",
  "descriptor.view": "Tanımlayıcı görünümü",
  "readiness.view": "Hazırlık görünümü",
  "bridge.view": "Yürütme köprüsü",
  "coherence.view": "Tutarlılık görünümü",
  "coherence.aligned": "Sinyaller kararlı bir yola doğru uyumlu",
  "coherence.mixed": "Sinyaller karışık, kararlılık ve kapsama arasında ödünleşim var",
  "coherence.conflicted": "Sinyaller çatışmalı, yüksek riskli ve kararsız bir yolu gösteriyor",
  "coherence.neutral": "Nötr sinyal",
  "projection.increase": "iyileşen projeksiyon",
  "projection.decrease": "kötüleşen projeksiyon",
  "projection.stable": "durağan projeksiyon",
  "projection.expected.stability.higher": "daha yüksek",
  "projection.expected.stability.lower": "daha düşük",
  "projection.expected.stability.similar": "benzer",
  "projection.expected.alignment.better": "daha iyi",
  "projection.expected.alignment.worse": "daha kötü",
  "projection.expected.alignment.similar": "benzer",
  "projection.expected.coverage.increase": "artan",
  "projection.expected.coverage.decrease": "azalan",
  "projection.expected.coverage.stable": "durağan",
  "projection.summary":
    "Öngörülen sonuç {stability} kararlılık, {alignment} uyum ve {coverage} kapsama işaret ediyor.",
  "readiness.level.steady": "kararlı",
  "readiness.level.guarded": "temkinli",
  "readiness.level.strained": "zorlanan",
  "readiness.pressure.low": "düşük",
  "readiness.pressure.medium": "orta",
  "readiness.pressure.high": "yüksek",
  "readiness.pattern.neutral": "nötr",
  "readiness.pattern.weak": "zayıf",
  "readiness.pattern.strong": "güçlü",
  "readiness.confidence.unknown": "belirsiz",
  "readiness.confidence.low": "düşük",
  "readiness.confidence.medium": "orta",
  "readiness.confidence.high": "yüksek",
  "status.readiness.ready": "hazır",
  "status.readiness.needs-review": "inceleme gerekli",
  "status.readiness.blocked": "engelli",
  "status.reflection.proceed": "devam",
  "status.reflection.review": "inceleme",
  "status.reflection.avoid": "kaçın",
  "status.simulationRisk.low": "düşük",
  "status.simulationRisk.medium": "orta",
  "status.simulationRisk.high": "yüksek",
  "readiness.alignment.matches-simulation": "eşleşen uyum",
  "readiness.alignment.deviates": "sapan uyum",
  "readiness.alignment.partial": "kısmi uyum",
  "readiness.alignment.none": "ölçülmemiş uyum",
  "readiness.advisory":
    "{view}: {pressure} baskıdan gelen {level} sinyal; {pattern} örüntü, {alignment}, {confidence} alternatif güveni ve {projection}.",
  "adaptive.hint.highWeak": "Bu yol benzer koşullarda geçmişte zayıf performans gösterdi.",
  "adaptive.hint.high": "Güncel yürütme geri bildirimi bu yolun dikkatli incelenmesini istiyor.",
  "adaptive.hint.medium": "Alternatif stratejiler daha kararlı sonuçlar verebilir.",
  "adaptive.guidance.high": "Mevcut koşullarda daha kararlı alternatif: {label}.",
  "adaptive.guidance.medium": "Sonraki karşılaştırma için daha yumuşak alternatif: {label}.",
  "adaptive.guidance.candidate": "Daha dengeli bağlam için {label} ile karşılaştırmayı düşün.",
  "candidate.summary.viable": "Bu yol yürütme için yapısal olarak hazır.",
  "candidate.summary.unstable": "Bu yol yürütmeden önce iyileştirme gerektirebilir.",
  "candidate.summary.not-viable": "Bu yol yürütme için yapısal olarak uygun değil.",
  "candidate.notes.readinessStatus": "Hazırlık durumu {status}.",
  "candidate.notes.reflectionDecision": "Değerlendirme kararı {decision}.",
  "candidate.notes.payloadAligned": "Payload önizlemesi hazırlık sinyaliyle yapısal olarak uyumlu.",
  "candidate.notes.payloadMismatch": "Payload önizlemesi hâlâ hazırlık uyumsuzluğu bildiriyor.",
  "candidate.notes.alternativesDocumented":
    "Alternatif yollar durum değiştirmeden karşılaştırma için belgelendi.",
  "candidate.notes.alternativePressure":
    "Alternatif ödünleşimleri bu aday değerlendirmesini anlamlı biçimde etkiliyor.",
  "candidate.uncertainty.readinessBlocker": "Hazırlık engeli: {blocker}",
  "candidate.uncertainty.simulationWarning": "Simülasyon uyarısı: {warning}",
  "candidate.uncertainty.payloadMismatch": "Payload önizlemesi hazırlık kontrolünü henüz geçmiyor.",
  "candidate.uncertainty.simulationRisk": "Simülasyon riski {risk} kalıyor.",
  "candidate.uncertainty.lowConfidence":
    "Yukarı akış güveni yapısal belirsizliği koruyacak kadar düşük.",
  "candidate.uncertainty.alternativeTradeoffs":
    "Alternatif yollar bu rota için anlamlı ödünleşimler açığa çıkarıyor.",
  "reflection.summary.proceed": "Bu yol pasif dry-run kararı olarak kararlı görünüyor.",
  "reflection.summary.review": "Bu yol ilerletilmeden önce ek inceleme gerektirebilir.",
  "reflection.summary.avoid": "Bu yol mevcut haliyle önerilmiyor.",
  "reflection.reasoning.proceed":
    "Hazırlık ve simülasyon sinyalleri kararlı bir dry-run yoluyla uyumlu.",
  "reflection.reasoning.payloadPassing":
    "Payload önizlemesi geçen bir hazırlık sinyali bildiriyor.",
  "reflection.reasoning.payloadReview":
    "Payload önizlemesi bu yol ilerletilmeden önce ek inceleme istiyor.",
  "reflection.reasoning.readinessStatus": "Hazırlık durumu {status}.",
  "reflection.reasoning.readinessBlocker": "Hazırlık engeli: {blocker}",
  "reflection.reasoning.reviewNote": "İnceleme notu: {note}",
  "reflection.reasoning.simulationWarning": "Simülasyon uyarısı: {warning}",
  "reflection.reasoning.simulationRisk": "Simülasyon riski {risk}.",
  "reflection.reasoning.selectionTooNarrow":
    "Seçim penceresi güvenilir yorum için fazla dar olabilir.",
  "reflection.reasoning.selectionBroad":
    "Seçim penceresi bağlam uğruna hassasiyetten ödün verecek kadar geniş.",
  "reflection.reasoning.roiTight": "ROI kapsamı sıkı ve çevre bağlamı sınırlı bırakabilir.",
  "reflection.reasoning.roiSufficient": "ROI kapsamı odaklı inceleme için yeterli.",
  "reflection.reasoning.roiBroad": "ROI kapsamı geniş ve yerel ayrıntıyı seyreltebilir.",
  "reflection.reasoning.roiExtreme": "ROI en-boy oranı çerçeveleme kararını etkileyecek kadar uç.",
  "reflection.reasoning.default": "Dry-run yolu pasif karar için yeterli bağlama sahip.",
  "reflection.tradeoff.inspect-audio":
    "Ses odaklı inceleme sinyal ayrıntısını açığa çıkarırken önizleme yanlılığını büyütebilir.",
  "reflection.tradeoff.focus-region":
    "Bölge odağı yerel ayrıntıyı iyileştirirken çevre sahne bağlamını azaltır.",
  "reflection.tradeoff.inspect-motion":
    "Hareket incelemesi sürekliliği netleştirir ancak oynatma temposuna güçlü biçimde bağlıdır.",
  "reflection.tradeoff.analyze-segment":
    "Segment incelemesi anomali kapsamını seçim hassasiyetiyle dengeler.",
  "reflection.tradeoff.wideSelection":
    "Daha geniş seçim bağlamı korur ama karar hassasiyetini azaltabilir.",
  "reflection.tradeoff.smallRoi": "Daha küçük ROI odağı artırır ama yakın kanıtları gizleyebilir.",
  "reflection.tradeoff.stableAdvisory":
    "Yol kararlı, ancak değerlendirme yürütülebilir değil danışma amaçlı kalır.",
  "reflection.alternative.expandSelection": "Seçim aralığını genişlet",
  "reflection.alternative.narrowSelection": "Seçim aralığını daralt",
  "reflection.alternative.refineRoi": "ROI sınırlarını iyileştir",
  "reflection.alternative.reducePlayback": "Oynatma hızını azalt",
  "reflection.alternative.lowerGain": "Önizleme kazancını düşür",
  "reflection.alternative.reviewNotes":
    "Bu yolu ilerletmeden önce seçim ve dry-run notlarını incele",
  "alternatives.item.broadSegment.label": "Daha geniş segment incelemesi",
  "alternatives.item.broadSegment.summary":
    "Alternatif yaklaşım, kanıtı daraltmadan önce seçili pencerenin tamamını değerlendirir.",
  "alternatives.item.broadSegment.tradeoff":
    "Bu yol yerel netliği daha yüksek bağlamsal kapsama karşı takas eder.",
  "alternatives.item.focusedRegion.label.withRoi": "Bölge odaklı inceleme",
  "alternatives.item.focusedRegion.label.withoutRoi": "Önce bölge incelemesi",
  "alternatives.item.focusedRegion.summary.withRoi":
    "Alternatif yaklaşım aktif ROI'yi yalıtır ve yerel ayrıntıyı seçili aralıkla karşılaştırır.",
  "alternatives.item.focusedRegion.summary.withoutRoi":
    "Alternatif yaklaşım yerel ayrıntıyı karşılaştırmadan önce daha küçük bir görsel bölge tanımlar.",
  "alternatives.item.focusedRegion.tradeoff":
    "Bu yol geniş kapsamı daha yüksek mekânsal hassasiyete karşı takas eder.",
  "alternatives.item.audioInspection.label": "Spektral ses incelemesi",
  "alternatives.item.audioInspection.summary":
    "Alternatif yaklaşım dikkati mevcut yoldan frekans ve geçici davranışa taşır.",
  "alternatives.item.audioInspection.tradeoff":
    "Bu yol çapraz-modal kapsamı daha net sinyal ayrıntısına karşı takas eder.",
  "alternatives.item.narrowedInspection.label": "Daraltılmış inceleme penceresi",
  "alternatives.item.narrowedInspection.summary":
    "Alternatif yaklaşım kanıtı yeniden karşılaştırmadan önce incelenen aralığı azaltır.",
  "alternatives.item.narrowedInspection.tradeoff":
    "Bu yol kapsamı daha hassas, daha düşük gürültülü bir karşılaştırmaya karşı takas eder.",
  "alternatives.item.slowerPlayback.label": "Daha yavaş zamansal inceleme",
  "alternatives.item.slowerPlayback.summary":
    "Alternatif yaklaşım geçici ya da hareket ayrıntısını karşılaştırmayı kolaylaştırmak için önizleme incelemesini yavaşlatır.",
  "alternatives.item.slowerPlayback.tradeoff":
    "Bu yol hızı zamansal netlik ve daha kararlı yorumlamaya karşı takas eder.",
  "alternatives.item.motionInspection.label": "Hareket sürekliliği incelemesi",
  "alternatives.item.motionInspection.summary":
    "Alternatif yaklaşım statik ayrıntıyı öncelemek yerine kareler arası sürekliliği karşılaştırır.",
  "alternatives.item.motionInspection.tradeoff":
    "Bu yol sabit kare netliğini hareket kararlılığı kanıtına karşı takas eder.",
  "alternatives.item.visualClarity.label": "Görsel netlik karşılaştırması",
  "alternatives.item.visualClarity.summary":
    "Alternatif yaklaşım daha derin karşılaştırmadan önce görsel okunabilirliği vurgular.",
  "alternatives.item.visualClarity.tradeoff":
    "Bu yol nötr gözlemi daha net yerel yapıya karşı takas eder.",
  "alternatives.item.stabilization.label": "Kararlılık öncelikli karşılaştırma",
  "alternatives.item.stabilization.summary":
    "Alternatif yaklaşım ayrıntı ya da hareket kararı vermeden önce incelenen kareleri hizalar.",
  "alternatives.item.stabilization.tradeoff":
    "Bu yol anındalığı daha kararlı bir karşılaştırma yüzeyine karşı takas eder.",
  "alternatives.item.semanticReview.label": "Semantik ön inceleme",
  "alternatives.item.semanticReview.summary":
    "Alternatif yaklaşım seçili aralığı devir adayı gibi ele almadan önce anlam açısından inceler.",
  "alternatives.item.semanticReview.tradeoff":
    "Bu yol hızı daha düşük risk ve daha iyi bağlama karşı takas eder.",
  "alternatives.item.genericNarrow.label": "Daraltılmış kanıt geçişi",
  "alternatives.item.genericNarrow.summary":
    "Alternatif yaklaşım kanıt penceresini azaltır ve aynı anda daha az sinyali karşılaştırır.",
  "alternatives.item.genericNarrow.tradeoff":
    "Bu yol genişliği daha sade bir yorumlama yüzeyine karşı takas eder.",
  "alternatives.summary.adaptiveHigh":
    "Uyarlanabilir karar baskısı yüksek; bu rotaya devam etmeden önce alternatifler değerlendirilmeli.",
  "alternatives.summary.historicalWeak":
    "Geçmiş yürütme geri bildirimi benzer yolların zayıf olduğunu gösteriyor; alternatif yollar daha güçlü sonraki rota olarak ele alınmalı.",
  "alternatives.summary.goalFailed":
    "Hedef değerlendirmesi mevcut sonucun amaçlanan çıktıyı kaçırdığını gösteriyor; alternatif yollar daha güçlü sonraki rota olarak ele alınmalı.",
  "alternatives.summary.goalSuccessfulStrong":
    "Geçmiş yürütme geri bildirimi bu başarılı yolu güçlendiriyor; alternatifler hafif karşılaştırmalı yedekler olarak kalır.",
  "alternatives.summary.goalSuccessfulDeviates":
    "Hedeflenen sonuç elde edildi, ancak yürütme hâlâ simülasyondan sapıyor; alternatifler karşılaştırmalı güvence olarak kalır.",
  "alternatives.summary.goalSuccessful":
    "Hedeflenen sonuç elde edildi; alternatifler karşılaştırmalı yedek rotalar olarak kalır.",
  "alternatives.summary.feedbackWeak":
    "Yürütme geri bildirimi alternatif yolların mevcut rotadan daha iyi sonuç verebileceğini gösteriyor.",
  "alternatives.summary.feedbackStable":
    "Yürütme geri bildirimi mevcut yol kararlılığını güçlendiriyor; alternatifler karşılaştırmalı yedek rotalar olarak kalır.",
  "alternatives.summary.feedbackMixed":
    "Yürütme geri bildirimi karışık; alternatifler sonuç ilerletilmeden önce kapsamı ya da uyumu netleştirebilir.",
  "alternatives.summary.reflectionProceed":
    "Seçili yol kararlı görünüyor; alternatifler ağırlıklı olarak hassasiyet, kapsam ya da tempoyu bu kararlı temele karşı takas eder.",
  "alternatives.summary.reflectionReview":
    "Seçili yol hâlâ inceleme istiyor; alternatifler belirsizliği azaltabilir ya da ilerletmeden önce bağlam ekleyebilir.",
  "alternatives.summary.reflectionAvoid":
    "Seçili yol mevcut haliyle önerilmiyor; alternatifler daha güvenli karşılaştırma rotalarını çizer.",
  "alternatives.comparison.adaptiveHigh":
    "Bu rotaya kıyasla alternatifler ilerletmeden önce daha güvenli kanıt kontrolleri sağlar.",
  "alternatives.comparison.historicalWeak":
    "Geçmişte zayıf kalan benzer sonuçlara kıyasla bu alternatifler kapsamı geri kazanabilir ya da tekrar hatasını azaltabilir.",
  "alternatives.comparison.goalFailed":
    "Mevcut sonuca kıyasla bu alternatifler kapsamı geri kazanmak ya da sapmayı azaltmak için daha iyi konumlanır.",
  "alternatives.comparison.goalSuccessfulStrong":
    "Mevcut sonuca kıyasla bu alternatifler zaten kararlı olan örüntüye karşı yedek rotalardır.",
  "alternatives.comparison.goalSuccessfulDeviates":
    "Mevcut sonuca kıyasla bu alternatifler elde edilen sonucu kalan sapmaya karşı doğrulayabilir.",
  "alternatives.comparison.goalSuccessful":
    "Mevcut sonuca kıyasla bu alternatifler daha güçlü yollar değil, yedek rotalardır.",
  "alternatives.comparison.feedbackWeak":
    "Mevcut sonuca kıyasla bu alternatifler kapsamı iyileştirebilir ya da sapmayı azaltabilir.",
  "alternatives.comparison.feedbackStable":
    "Mevcut sonuca kıyasla bu alternatifler daha güçlü yollar değil, yedek rotalardır.",
  "alternatives.comparison.feedbackMixed":
    "Mevcut sonuca kıyasla bu alternatifler karışık yürütme sinyalini netleştirebilir.",
  "alternatives.comparison.reflectionProceed":
    "Seçili yola kıyasla bu alternatifler mevcut dengeyi değiştirme pahasına farklı kanıt açığa çıkarabilir.",
  "alternatives.comparison.reflectionReview":
    "Seçili yola kıyasla bu alternatifler mevcut belirsizliği daha net kapsam ya da daha kararlı bağlamla takas eder.",
  "alternatives.comparison.reflectionAvoid":
    "Seçili yola kıyasla bu alternatifler gelecekteki herhangi bir devirden önce kapsamı, yöntemi ya da yoğunluğu değiştirerek riski azaltır.",
  "alternatives.comparison.preferred": "{base} En net karşılaştırma noktası {label}.",
};
