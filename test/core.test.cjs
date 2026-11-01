const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({ console, Date, Set, Math, globalThis: {} });
context.globalThis = context;
for (const file of ["src/extraction.js", "src/rewrite.js", "src/detector.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}

const extraction = context.PromptSpiralExtraction;
const rewrite = context.PromptSpiralRewrite;
const detector = context.PromptSpiralDetector;

test("recognizes only supported provider hosts", () => {
  assert.equal(extraction.providerForHost("chatgpt.com"), "chatgpt");
  assert.equal(extraction.providerForHost("claude.ai"), "claude");
  assert.equal(extraction.providerForHost("gemini.google.com"), "gemini");
  assert.equal(extraction.providerForHost("evilchatgpt.com"), null);
});

test("carries an original goal and buried correction into the suggestion", () => {
  const messages = [
    { role: "user", text: "Write a concise launch email for the beta release to existing customers." },
    { role: "assistant", text: "We are thrilled to announce an extraordinary new chapter in our journey together." },
    { role: "user", text: "Make it less formal and keep it under one hundred words." },
    { role: "assistant", text: "It is with great pleasure that we unveil our beta release." },
    { role: "user", text: "It is still too formal. Keep the release date and remove generic motivational language." }
  ];
  const suggestion = rewrite.generateSuggestion(messages);
  assert.match(suggestion, /launch email/);
  assert.match(suggestion, /under one hundred words/);
  assert.match(suggestion, /still too formal/);
  assert.doesNotMatch(suggestion, /\[[^\]]+\]|TODO|insert X/i);
});

test("fails closed when visible context is insufficient", () => {
  assert.equal(rewrite.generateSuggestion([{ role: "user", text: "Please update this response with my requirements." }]), null);
  assert.equal(rewrite.generateSuggestion([
    { role: "user", text: "Please update this response with my requirements." },
    { role: "assistant", text: "What should I change in the response for you?" }
  ]), null);
});

test("detection requires repeated overlap and explicit corrections", () => {
  const now = Date.now();
  const observations = [
    { role: "user", text: "Build the Swift parser and include tests for empty arrays", observedAt: now - 3000 },
    { role: "user", text: "The Swift parser still fails on empty arrays, fix the tests", observedAt: now - 2000 },
    { role: "user", text: "It still fails: keep the Swift parser but handle empty arrays", observedAt: now - 1000 }
  ];
  assert.equal(detector.shouldOffer(observations, now), true);
  assert.equal(detector.shouldOffer([
    { role: "user", text: "Explain photosynthesis in one paragraph", observedAt: now - 3000 },
    { role: "user", text: "Now compare two laptop models", observedAt: now - 2000 },
    { role: "user", text: "Write a birthday invitation", observedAt: now - 1000 }
  ], now), false);
});

test("dismissal applies a thirty minute cooldown and daily suppression", () => {
  const state = detector.createSuppressionState();
  const now = Date.now();
  assert.equal(detector.canShow(state, "episode-a", now), true);
  detector.dismiss(state, now);
  assert.equal(detector.canShow(state, "episode-b", now + 29 * 60 * 1000), false);
  assert.equal(detector.canShow(state, "episode-b", now + 31 * 60 * 1000), true);
  detector.dismiss(state, now + 31 * 60 * 1000);
  detector.dismiss(state, now + 62 * 60 * 1000);
  assert.equal(detector.canShow(state, "episode-c", now + 93 * 60 * 1000), false);
});

test("suggestions remain bounded and never contain placeholder tokens", () => {
  const oversized = "Keep the same goal but remove the repeated section and use the concise format. ".repeat(30);
  const suggestion = rewrite.generateSuggestion([
    { role: "user", text: "Create a complete comparison of the three plans using the supplied price details." },
    { role: "assistant", text: "Here is a long comparison that repeats each plan description several times." },
    { role: "user", text: oversized }
  ]);
  assert.ok(suggestion.length <= 1600);
  assert.doesNotMatch(suggestion, /\[[^\]]+\]|TODO|insert X/i);
});
