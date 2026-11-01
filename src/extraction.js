(function (root) {
  "use strict";

  const MAX_MESSAGE_CHARS = 4_000;
  const MAX_TOTAL_CHARS = 24_000;
  const MAX_MESSAGES = 30;

  const PROVIDERS = {
    chatgpt: {
      hosts: ["chatgpt.com", "chat.openai.com"],
      containers: ["[data-message-author-role]", "article[data-testid^='conversation-turn-']"],
      composer: ["#prompt-textarea", "textarea[data-testid='prompt-textarea']", "form textarea", "main [contenteditable='true']"]
    },
    claude: {
      hosts: ["claude.ai"],
      containers: ["[data-testid='user-message']", "[data-testid='assistant-message']", "[data-is-streaming]"],
      composer: ["fieldset [contenteditable='true']", "main [contenteditable='true']", "textarea"]
    },
    gemini: {
      hosts: ["gemini.google.com"],
      containers: ["user-query", "model-response"],
      composer: ["rich-textarea [contenteditable='true']", ".ql-editor[contenteditable='true']", "textarea"]
    }
  };

  function providerForHost(hostname) {
    const host = String(hostname || "").toLowerCase();
    return Object.keys(PROVIDERS).find((key) =>
      PROVIDERS[key].hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`))
    ) || null;
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function isVisible(element) {
    if (!element || element.hidden || element.getAttribute?.("aria-hidden") === "true") return false;
    if (typeof element.getClientRects === "function" && element.getClientRects().length === 0) return false;
    return true;
  }

  function uniqueNodes(documentRef, selectors) {
    const seen = new Set();
    const nodes = [];
    for (const selector of selectors) {
      for (const node of documentRef.querySelectorAll(selector)) {
        const canonical = node.closest?.("[data-message-author-role], article[data-testid^='conversation-turn-'], user-query, model-response") || node;
        if (!seen.has(canonical)) {
          seen.add(canonical);
          nodes.push(canonical);
        }
      }
    }
    return nodes.sort((a, b) => {
      if (a === b) return 0;
      const relation = a.compareDocumentPosition?.(b) || 0;
      return relation & 4 ? -1 : 1;
    });
  }

  function roleForNode(provider, node) {
    const explicit = node.getAttribute?.("data-message-author-role") ||
      node.querySelector?.("[data-message-author-role]")?.getAttribute?.("data-message-author-role");
    if (explicit === "user" || explicit === "assistant") return explicit;

    if (provider === "claude") {
      if (node.matches?.("[data-testid='user-message']") || node.querySelector?.("[data-testid='user-message']")) return "user";
      if (node.matches?.("[data-testid='assistant-message'], [data-is-streaming]") || node.querySelector?.("[data-testid='assistant-message'], [data-is-streaming]")) return "assistant";
    }
    if (provider === "gemini") {
      const tag = String(node.tagName || "").toLowerCase();
      if (tag === "user-query" || node.closest?.("user-query")) return "user";
      if (tag === "model-response" || node.closest?.("model-response")) return "assistant";
    }
    return null;
  }

  function textForNode(provider, role, node) {
    const preferred = provider === "gemini"
      ? (role === "user" ? node.querySelector?.(".query-text") : node.querySelector?.(".model-response-text, .markdown"))
      : provider === "chatgpt"
        ? node.querySelector?.("[data-message-author-role] .markdown, [data-message-author-role] .whitespace-pre-wrap, [data-message-author-role]")
        : node.querySelector?.(".font-claude-message, .prose, [data-testid='user-message']") || node;
    return normalizeText((preferred || node).innerText || (preferred || node).textContent).slice(0, MAX_MESSAGE_CHARS);
  }

  function extractConversation(documentRef, provider) {
    if (!documentRef || !PROVIDERS[provider]) return [];
    const messages = [];
    let total = 0;
    for (const node of uniqueNodes(documentRef, PROVIDERS[provider].containers)) {
      if (!isVisible(node)) continue;
      const role = roleForNode(provider, node);
      if (!role) continue;
      const text = textForNode(provider, role, node);
      if (!text || text.length < 2) continue;
      if (messages.at(-1)?.role === role && messages.at(-1)?.text === text) continue;
      if (total + text.length > MAX_TOTAL_CHARS) break;
      messages.push({ role, text });
      total += text.length;
      if (messages.length >= MAX_MESSAGES) break;
    }
    return messages;
  }

  function findComposer(documentRef, provider) {
    for (const selector of PROVIDERS[provider]?.composer || []) {
      const candidates = Array.from(documentRef.querySelectorAll(selector));
      const element = candidates.find((candidate) => isVisible(candidate) && !candidate.disabled);
      if (element) return element;
    }
    return null;
  }

  function isStreaming(documentRef, provider) {
    const selectors = {
      chatgpt: ["button[data-testid='stop-button']", "[data-testid='stop-button']"],
      claude: ["[data-is-streaming='true']", "button[aria-label*='Stop']"],
      gemini: ["button[aria-label*='Stop response']", ".loading-indicator"]
    };
    return (selectors[provider] || []).some((selector) =>
      Array.from(documentRef.querySelectorAll(selector)).some(isVisible)
    );
  }

  root.PromptSpiralExtraction = {
    MAX_MESSAGE_CHARS,
    MAX_TOTAL_CHARS,
    PROVIDERS,
    providerForHost,
    normalizeText,
    extractConversation,
    findComposer,
    isStreaming
  };
})(globalThis);
