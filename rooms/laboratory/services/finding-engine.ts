import { createLabEventId } from "../domain/lab-types.js";
import type { LabEventFeedItem, LabFindingProjection } from "../domain/lab-types.js";

function createDerivedFinding(
  moduleId: string,
  title: string,
  detail: string,
  level: string,
  evidenceCount: number
): LabFindingProjection {
  return {
    id: createLabEventId("finding"),
    moduleId,
    title,
    detail,
    level,
    confidence: evidenceCount > 1 ? "medium" : "low",
    kind: "derived",
    evidenceCount,
    artifactIds: [],
  };
}

function countMatchingEvents(events: LabEventFeedItem[], matcher: RegExp) {
  return events.filter(function (event) {
    return (
      matcher.test(event.message) ||
      matcher.test(event.detail || "") ||
      matcher.test(event.rawLine || "")
    );
  }).length;
}

function hasCompletedRun(events: LabEventFeedItem[]) {
  return events.some(function (event) {
    return event.scope === "run" && event.stage === "completed";
  });
}

function hasMeaningfulRunCoverage(events: LabEventFeedItem[]) {
  return events.some(function (event) {
    if (event.scope !== "run" || event.kind === "raw-log") {
      return false;
    }
    if (event.moduleId !== null) {
      return true;
    }
    return /kare analizi aktif|siyah sahne tespiti calisiyor|freeze analizi calisiyor|sessizlik segmenti bulundu/i.test(
      `${event.message} ${event.detail || ""}`
    );
  });
}

export function extractFindings(events: LabEventFeedItem[]): LabFindingProjection[] {
  const findings: LabFindingProjection[] = [];
  const blackSegments = countMatchingEvents(events, /siyah sahne segmenti bulundu/i);
  const freezeSegments = countMatchingEvents(events, /freeze segmenti bulundu/i);
  const silenceSegments = countMatchingEvents(events, /sessizlik segmenti bulundu/i);

  if (blackSegments > 0) {
    findings.push(
      createDerivedFinding(
        "motion",
        "Siyah sahne segmentleri bulundu",
        `${blackSegments} siyah sahne segmenti tespit edildi.`,
        blackSegments > 2 ? "high" : "medium",
        blackSegments
      )
    );
  }

  if (freezeSegments > 0) {
    findings.push(
      createDerivedFinding(
        "motion",
        "Freeze segmentleri bulundu",
        `${freezeSegments} freeze segmenti tespit edildi.`,
        freezeSegments > 2 ? "high" : "medium",
        freezeSegments
      )
    );
  }

  if (silenceSegments > 0) {
    findings.push(
      createDerivedFinding(
        "audio",
        "Sessizlik segmentleri bulundu",
        `${silenceSegments} sessizlik segmenti tespit edildi.`,
        silenceSegments > 3 ? "medium" : "low",
        silenceSegments
      )
    );
  }

  if (findings.length === 0 && hasCompletedRun(events) && hasMeaningfulRunCoverage(events)) {
    findings.push(
      createDerivedFinding(
        "report",
        "Belirgin anomali tespit edilmedi",
        "Calisma tamamlandi ve analiz akisinda belirgin bir anomali kaniti gorulmedi.",
        "low",
        0
      )
    );
  }

  return findings;
}
