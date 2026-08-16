import test from "node:test";
import assert from "node:assert/strict";
import {
  getTranscriptModelDescriptor,
  normalizeTranscriptBackend,
  resolveTranscriptModelId,
  resolveTranscriptSupportedLanguage,
} from "../../shared/transcript/model-catalog.ts";

void test("transcript model policy keeps TR light/full on multilingual models", () => {
  assert.equal(resolveTranscriptModelId("tr", "light"), "tiny");
  assert.equal(resolveTranscriptModelId("tr", "full"), "base");

  const lightDescriptor = getTranscriptModelDescriptor("tiny");
  const fullDescriptor = getTranscriptModelDescriptor("base");
  assert.ok(lightDescriptor);
  assert.ok(fullDescriptor);

  assert.equal(lightDescriptor.englishOnly, false);
  assert.equal(fullDescriptor.englishOnly, false);
});

void test("transcript model policy keeps EN light/full on english-only models", () => {
  assert.equal(resolveTranscriptModelId("en", "light"), "tiny.en");
  assert.equal(resolveTranscriptModelId("en", "full"), "base.en");

  const lightDescriptor = getTranscriptModelDescriptor("tiny.en");
  const fullDescriptor = getTranscriptModelDescriptor("base.en");
  assert.ok(lightDescriptor);
  assert.ok(fullDescriptor);

  assert.equal(lightDescriptor.englishOnly, true);
  assert.equal(fullDescriptor.englishOnly, true);
});

void test("transcript locale fallback normalizes unknown locales to english support", () => {
  assert.equal(resolveTranscriptSupportedLanguage("tr-TR"), "tr");
  assert.equal(resolveTranscriptSupportedLanguage("en-US"), "en");
  assert.equal(resolveTranscriptSupportedLanguage("de-DE"), "en");
});

void test("transcript model policy can resolve Vosk side-by-side with whisper.cpp", () => {
  assert.equal(normalizeTranscriptBackend("vosk"), "vosk");
  assert.equal(normalizeTranscriptBackend("other"), "whisper.cpp");
  assert.equal(resolveTranscriptModelId("tr", "full", "vosk"), "vosk-small-tr");
  assert.equal(resolveTranscriptModelId("en", "light", "vosk"), "vosk-small-en");
  assert.equal(resolveTranscriptModelId("en", "full", "vosk"), "vosk-full-en");

  const turkishDescriptor = getTranscriptModelDescriptor("vosk-small-tr");
  const englishDescriptor = getTranscriptModelDescriptor("vosk-small-en");
  const fullEnglishDescriptor = getTranscriptModelDescriptor("vosk-full-en");
  assert.ok(turkishDescriptor);
  assert.ok(englishDescriptor);
  assert.ok(fullEnglishDescriptor);

  assert.equal(turkishDescriptor.backend, "vosk");
  assert.equal(turkishDescriptor.archiveFormat, "zip-directory");
  assert.equal(turkishDescriptor.expectedSha1, "1bc2391ea03d6091c39c4ff42b627c811501d41f");
  assert.equal(englishDescriptor.backend, "vosk");
  assert.equal(englishDescriptor.archiveFormat, "zip-directory");
  assert.equal(fullEnglishDescriptor.backend, "vosk");
  assert.equal(fullEnglishDescriptor.variant, "full");
  assert.equal(fullEnglishDescriptor.expectedSha1, "5c763fc6d527af15197b542e47c5221a09da25b6");
});
