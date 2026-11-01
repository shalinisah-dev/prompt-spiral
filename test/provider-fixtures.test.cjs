const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({ console, globalThis: {} });
context.globalThis = context;
vm.runInContext(fs.readFileSync(path.join(root, "src/extraction.js"), "utf8"), context);
const { extractConversation } = context.PromptSpiralExtraction;

function node({ tagName = "DIV", attrs = {}, text = "", selectors = {}, position = 0 }) {
  return {
    tagName,
    innerText: text,
    textContent: text,
    hidden: false,
    getAttribute: (name) => attrs[name] ?? null,
    getClientRects: () => [{}],
    matches: (selector) => selector.split(", ").some((part) => selectors[part] === true),
    closest: (selector) => selectors[`closest:${selector}`] || null,
    querySelector: (selector) => selectors[selector] || null,
    compareDocumentPosition: (other) => position < other.position ? 4 : 2,
    position
  };
}

function documentFor(nodes) {
  return { querySelectorAll: () => nodes };
}

test("ChatGPT fixture preserves attributed turn order", () => {
  const user = node({ attrs: { "data-message-author-role": "user" }, text: "Create a Swift parser for comma-separated values.", position: 1 });
  const assistant = node({ attrs: { "data-message-author-role": "assistant" }, text: "Here is a parser implementation and a normal-input test.", position: 2 });
  const result = extractConversation(documentFor([user, assistant]), "chatgpt");
  assert.deepEqual(JSON.parse(JSON.stringify(result)), [
    { role: "user", text: "Create a Swift parser for comma-separated values." },
    { role: "assistant", text: "Here is a parser implementation and a normal-input test." }
  ]);
});

test("Claude fixture distinguishes user and assistant messages", () => {
  const user = node({ text: "Revise this draft to sound conversational, not formal.", selectors: { "[data-testid='user-message']": true }, position: 1 });
  const assistant = node({ text: "The revised formal draft follows with several transitions.", selectors: { "[data-testid='assistant-message']": true }, position: 2 });
  const result = extractConversation(documentFor([user, assistant]), "claude");
  assert.equal(result[0].role, "user");
  assert.equal(result[1].role, "assistant");
});

test("Gemini fixture extracts custom elements without unrelated page text", () => {
  const user = node({ tagName: "USER-QUERY", text: "Compare these plans using only the listed monthly prices.", position: 1 });
  const assistant = node({ tagName: "MODEL-RESPONSE", text: "Plan A is cheaper based on an annual estimate.", position: 2 });
  const result = extractConversation(documentFor([user, assistant]), "gemini");
  assert.equal(result.length, 2);
  assert.equal(result[0].text, "Compare these plans using only the listed monthly prices.");
});
