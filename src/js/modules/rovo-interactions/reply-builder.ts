import type {
  RovoInteractionChoiceQuestion,
  RovoInteractionQuestion,
  RovoPlanHarderLocalPayload,
} from "./types.js";

function normalizeAnswer(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function findChoiceLabel(question: RovoInteractionChoiceQuestion, value: string): string {
  const normalized = value.trim();
  if (normalized === "") {
    return "";
  }

  const match = question.options.find((option) => option.value === normalized);
  return match?.label ?? normalized;
}

export function getPlanQuestionAnswerLabel(
  question: RovoInteractionQuestion,
  answers: Record<string, string>
): string {
  const rawValue = normalizeAnswer(answers[question.id]);
  if (rawValue === "") {
    return "";
  }

  if (question.kind === "single-choice") {
    return findChoiceLabel(question, rawValue);
  }

  return rawValue;
}

export function findMissingRequiredPlanQuestions(
  payload: RovoPlanHarderLocalPayload,
  answers: Record<string, string>
): RovoInteractionQuestion[] {
  return payload.questions.filter((question) => {
    if (question.required !== true) {
      return false;
    }

    return getPlanQuestionAnswerLabel(question, answers) === "";
  });
}

function formatPlanAnswerLine(label: string, answer: string): string {
  if (!answer.includes("\n")) {
    return `- ${label}: ${answer}`;
  }

  const indented = answer
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line, index) => (index === 0 ? `- ${label}: ${line}` : `  ${line}`));

  return indented.join("\n");
}

export function buildPlanHarderLocalReply(
  payload: RovoPlanHarderLocalPayload,
  answers: Record<string, string>
): string {
  const answerLines: string[] = [];
  const responseTitle = payload.responseTitle?.trim() ?? "";
  const responsePreamble = payload.responsePreamble?.trim() ?? "";

  for (const question of payload.questions) {
    const answer = getPlanQuestionAnswerLabel(question, answers);
    if (answer === "") {
      continue;
    }

    answerLines.push(formatPlanAnswerLine(question.label, answer));
  }

  if (answerLines.length === 0) {
    return "";
  }

  const lines: string[] = [];
  if (responseTitle !== "") {
    lines.push(`[${responseTitle}]`);
  }

  if (responsePreamble !== "") {
    lines.push(responsePreamble);
  }

  lines.push(...answerLines);
  return lines.join("\n").trim();
}
