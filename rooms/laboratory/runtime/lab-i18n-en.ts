export const labI18nEn = {
  "posture.proceed": "Proceed",
  "posture.caution": "Proceed with caution",
  "posture.reconsider": "Reconsider",
  "descriptor.view": "Descriptor view",
  "readiness.view": "Readiness view",
  "bridge.view": "Execution bridge",
  "coherence.view": "Coherence view",
  "coherence.aligned": "Signals are aligned toward a stable path",
  "coherence.mixed": "Signals are mixed, with trade-offs between stability and coverage",
  "coherence.conflicted": "Signals are conflicted, indicating a high-risk and unstable path",
  "coherence.neutral": "Neutral signal",
  "projection.increase": "better projection",
  "projection.decrease": "worse projection",
  "projection.stable": "neutral projection",
  "projection.expected.stability.higher": "higher",
  "projection.expected.stability.lower": "lower",
  "projection.expected.stability.similar": "similar",
  "projection.expected.alignment.better": "better",
  "projection.expected.alignment.worse": "worse",
  "projection.expected.alignment.similar": "similar",
  "projection.expected.coverage.increase": "increase",
  "projection.expected.coverage.decrease": "decrease",
  "projection.expected.coverage.stable": "stable",
  "projection.summary":
    "Projected outcome suggests {stability} stability, {alignment} alignment, and {coverage} coverage.",
  "readiness.level.steady": "steady",
  "readiness.level.guarded": "guarded",
  "readiness.level.strained": "strained",
  "readiness.pressure.low": "low",
  "readiness.pressure.medium": "medium",
  "readiness.pressure.high": "high",
  "readiness.pattern.neutral": "neutral",
  "readiness.pattern.weak": "weak",
  "readiness.pattern.strong": "strong",
  "readiness.confidence.unknown": "unknown",
  "readiness.confidence.low": "low",
  "readiness.confidence.medium": "medium",
  "readiness.confidence.high": "high",
  "status.readiness.ready": "ready",
  "status.readiness.needs-review": "needs-review",
  "status.readiness.blocked": "blocked",
  "status.reflection.proceed": "proceed",
  "status.reflection.review": "review",
  "status.reflection.avoid": "avoid",
  "status.simulationRisk.low": "low",
  "status.simulationRisk.medium": "medium",
  "status.simulationRisk.high": "high",
  "readiness.alignment.matches-simulation": "matched alignment",
  "readiness.alignment.deviates": "deviating alignment",
  "readiness.alignment.partial": "partial alignment",
  "readiness.alignment.none": "unmeasured alignment",
  "readiness.advisory":
    "{view}: {level} signal from {pressure} pressure, {pattern} pattern, {alignment}, {confidence} alternative confidence, and {projection}.",
  "adaptive.hint.highWeak": "This path has historically underperformed under similar conditions.",
  "adaptive.hint.high": "Current execution feedback indicates this path needs careful review.",
  "adaptive.hint.medium": "Alternative strategies may yield more stable results.",
  "adaptive.guidance.high": "A more stable alternative under current conditions is: {label}.",
  "adaptive.guidance.medium": "A softer alternative to compare next is: {label}.",
  "adaptive.guidance.candidate": "Consider comparing {label} for steadier context.",
  "candidate.summary.viable": "This path is structurally ready for execution.",
  "candidate.summary.unstable": "This path may require refinement before execution.",
  "candidate.summary.not-viable": "This path is not structurally suitable for execution.",
  "candidate.notes.readinessStatus": "Readiness status is {status}.",
  "candidate.notes.reflectionDecision": "Reflection decision is {decision}.",
  "candidate.notes.payloadAligned":
    "Payload preview is structurally aligned with the readiness signal.",
  "candidate.notes.payloadMismatch": "Payload preview still reports a readiness mismatch.",
  "candidate.notes.alternativesDocumented":
    "Alternative paths are documented for comparison without changing state.",
  "candidate.notes.alternativePressure":
    "Alternative tradeoffs materially affect this candidate assessment.",
  "candidate.uncertainty.readinessBlocker": "Readiness blocker: {blocker}",
  "candidate.uncertainty.simulationWarning": "Simulation warning: {warning}",
  "candidate.uncertainty.payloadMismatch": "Payload preview does not yet pass its readiness check.",
  "candidate.uncertainty.simulationRisk": "Simulation risk remains {risk}.",
  "candidate.uncertainty.lowConfidence":
    "Upstream confidence is low enough to keep structural uncertainty.",
  "candidate.uncertainty.alternativeTradeoffs":
    "Alternative paths expose meaningful tradeoffs for this route.",
  "reflection.summary.proceed": "This path appears stable as a passive dry-run decision.",
  "reflection.summary.review":
    "This path may require additional review before it is carried further.",
  "reflection.summary.avoid": "This path is not recommended in its current form.",
  "reflection.reasoning.proceed":
    "Readiness and simulation signals align with a stable dry-run path.",
  "reflection.reasoning.payloadPassing": "Payload preview reports a passing readiness signal.",
  "reflection.reasoning.payloadReview":
    "Payload preview asks for additional review before this path is carried further.",
  "reflection.reasoning.readinessStatus": "Readiness status is {status}.",
  "reflection.reasoning.readinessBlocker": "Readiness blocker: {blocker}",
  "reflection.reasoning.reviewNote": "Review note: {note}",
  "reflection.reasoning.simulationWarning": "Simulation warning: {warning}",
  "reflection.reasoning.simulationRisk": "Simulation risk is {risk}.",
  "reflection.reasoning.selectionTooNarrow":
    "Selection window may be too narrow for reliable interpretation.",
  "reflection.reasoning.selectionBroad":
    "Selection window is broad enough to trade precision for context.",
  "reflection.reasoning.roiTight":
    "ROI coverage is tight and may leave limited surrounding context.",
  "reflection.reasoning.roiSufficient": "ROI coverage is sufficient for focused inspection.",
  "reflection.reasoning.roiBroad": "ROI coverage is broad and may dilute local detail.",
  "reflection.reasoning.roiExtreme":
    "ROI aspect ratio is extreme enough to affect framing judgment.",
  "reflection.reasoning.default": "The dry-run path has enough context for a passive decision.",
  "reflection.tradeoff.inspect-audio":
    "Audio-focused review can expose signal detail while amplifying preview bias.",
  "reflection.tradeoff.focus-region":
    "Region focus improves local detail while reducing surrounding scene context.",
  "reflection.tradeoff.inspect-motion":
    "Motion review clarifies continuity while depending heavily on playback cadence.",
  "reflection.tradeoff.analyze-segment":
    "Segment review balances anomaly coverage against selection precision.",
  "reflection.tradeoff.wideSelection":
    "A wider selection keeps context but can reduce decision precision.",
  "reflection.tradeoff.smallRoi": "A smaller ROI increases focus but can hide nearby evidence.",
  "reflection.tradeoff.stableAdvisory":
    "The path is stable, but the reflection remains advisory rather than executable.",
  "reflection.alternative.expandSelection": "Expand selection range",
  "reflection.alternative.narrowSelection": "Narrow selection range",
  "reflection.alternative.refineRoi": "Refine ROI boundaries",
  "reflection.alternative.reducePlayback": "Reduce playback rate",
  "reflection.alternative.lowerGain": "Lower preview gain",
  "reflection.alternative.reviewNotes":
    "Review the selection and dry-run notes before carrying this path further",
  "alternatives.item.broadSegment.label": "Broader segment review",
  "alternatives.item.broadSegment.summary":
    "An alternative approach would evaluate the full selected window before narrowing the evidence.",
  "alternatives.item.broadSegment.tradeoff":
    "This path would trade local clarity for higher contextual coverage.",
  "alternatives.item.focusedRegion.label.withRoi": "Region-focused inspection",
  "alternatives.item.focusedRegion.label.withoutRoi": "Region-first inspection",
  "alternatives.item.focusedRegion.summary.withRoi":
    "An alternative approach would isolate the active ROI and compare local detail against the selected span.",
  "alternatives.item.focusedRegion.summary.withoutRoi":
    "An alternative approach would define a smaller visual region before comparing local detail.",
  "alternatives.item.focusedRegion.tradeoff":
    "This path would trade broad coverage for higher spatial precision.",
  "alternatives.item.audioInspection.label": "Spectral audio inspection",
  "alternatives.item.audioInspection.summary":
    "An alternative approach would shift attention from the current path into frequency and transient behavior.",
  "alternatives.item.audioInspection.tradeoff":
    "This path would trade cross-modal coverage for clearer signal detail.",
  "alternatives.item.narrowedInspection.label": "Narrowed inspection window",
  "alternatives.item.narrowedInspection.summary":
    "An alternative approach would reduce the reviewed span before comparing the evidence again.",
  "alternatives.item.narrowedInspection.tradeoff":
    "This path would trade coverage for a more precise, lower-noise comparison.",
  "alternatives.item.slowerPlayback.label": "Slower temporal inspection",
  "alternatives.item.slowerPlayback.summary":
    "An alternative approach would slow preview review to make transient or motion detail easier to compare.",
  "alternatives.item.slowerPlayback.tradeoff":
    "This path would trade speed for temporal clarity and steadier interpretation.",
  "alternatives.item.motionInspection.label": "Motion continuity inspection",
  "alternatives.item.motionInspection.summary":
    "An alternative approach would compare frame-to-frame continuity instead of prioritizing static detail.",
  "alternatives.item.motionInspection.tradeoff":
    "This path would trade still-frame clarity for motion stability evidence.",
  "alternatives.item.visualClarity.label": "Visual clarity comparison",
  "alternatives.item.visualClarity.summary":
    "An alternative approach would emphasize visual readability before deeper comparison.",
  "alternatives.item.visualClarity.tradeoff":
    "This path would trade neutral observation for clearer local structure.",
  "alternatives.item.stabilization.label": "Stability-first comparison",
  "alternatives.item.stabilization.summary":
    "An alternative approach would align the inspected frames before judging detail or motion.",
  "alternatives.item.stabilization.tradeoff":
    "This path would trade immediacy for a more stable comparison surface.",
  "alternatives.item.semanticReview.label": "Semantic pre-review",
  "alternatives.item.semanticReview.summary":
    "An alternative approach would inspect the selected range for meaning before treating it as a handoff candidate.",
  "alternatives.item.semanticReview.tradeoff":
    "This path would trade speed for lower risk and better context.",
  "alternatives.item.genericNarrow.label": "Narrowed evidence pass",
  "alternatives.item.genericNarrow.summary":
    "An alternative approach would reduce the evidence window and compare fewer signals at once.",
  "alternatives.item.genericNarrow.tradeoff":
    "This path would trade breadth for a simpler interpretation surface.",
  "alternatives.summary.adaptiveHigh":
    "Adaptive decision pressure is high; alternatives should be evaluated before continuing this route.",
  "alternatives.summary.historicalWeak":
    "Historical execution feedback shows similar paths have been weak; alternative paths should be treated as stronger next routes.",
  "alternatives.summary.goalFailed":
    "Goal evaluation indicates the current result missed its intended outcome; alternative paths should be treated as stronger next routes.",
  "alternatives.summary.goalSuccessfulStrong":
    "Historical execution feedback reinforces this successful path; alternatives remain light comparative backups.",
  "alternatives.summary.goalSuccessfulDeviates":
    "Goal evaluation indicates the intended outcome was achieved, but execution still diverges from simulation; alternatives remain comparative safeguards.",
  "alternatives.summary.goalSuccessful":
    "Goal evaluation indicates the intended outcome was achieved; alternatives remain comparative backup routes.",
  "alternatives.summary.feedbackWeak":
    "Execution feedback suggests alternative paths may yield better outcomes than the current route.",
  "alternatives.summary.feedbackStable":
    "Execution feedback reinforces current path stability; alternatives remain comparative backup routes.",
  "alternatives.summary.feedbackMixed":
    "Execution feedback is mixed; alternatives may clarify coverage or alignment before carrying the result further.",
  "alternatives.summary.reflectionProceed":
    "The selected path appears stable; alternatives mainly trade precision, coverage, or tempo against that stable baseline.",
  "alternatives.summary.reflectionReview":
    "The selected path still needs review; alternatives may reduce uncertainty or add context before carrying it further.",
  "alternatives.summary.reflectionAvoid":
    "The selected path is not recommended in its current form; alternatives outline safer comparison routes.",
  "alternatives.comparison.adaptiveHigh":
    "Compared to this route, the alternatives provide safer evidence checks before carrying it further.",
  "alternatives.comparison.historicalWeak":
    "Compared to historically weak similar results, these alternatives may recover coverage or reduce repeat failure.",
  "alternatives.comparison.goalFailed":
    "Compared to the current result, these alternatives are better positioned to recover coverage or reduce divergence.",
  "alternatives.comparison.goalSuccessfulStrong":
    "Compared to the current result, these alternatives are backup routes against an already stable pattern.",
  "alternatives.comparison.goalSuccessfulDeviates":
    "Compared to the current result, these alternatives can validate the achieved outcome against the remaining divergence.",
  "alternatives.comparison.goalSuccessful":
    "Compared to the current result, these alternatives are backup routes rather than stronger paths.",
  "alternatives.comparison.feedbackWeak":
    "Compared to the current result, these alternatives may improve coverage or reduce divergence.",
  "alternatives.comparison.feedbackStable":
    "Compared to the current result, these alternatives are backup routes rather than stronger paths.",
  "alternatives.comparison.feedbackMixed":
    "Compared to the current result, these alternatives can clarify the mixed execution signal.",
  "alternatives.comparison.reflectionProceed":
    "Compared to the selected path, these alternatives can expose different evidence at the cost of changing the current balance.",
  "alternatives.comparison.reflectionReview":
    "Compared to the selected path, these alternatives trade the current uncertainty for clearer scope or steadier context.",
  "alternatives.comparison.reflectionAvoid":
    "Compared to the selected path, these alternatives lower risk by changing scope, method, or intensity before any future handoff.",
  "alternatives.comparison.preferred": "{base} {label} is the clearest comparison point.",
} as const;
