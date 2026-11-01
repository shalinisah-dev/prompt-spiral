(function () {
  "use strict";

  const extraction = globalThis.PromptSpiralExtraction;
  const rewrite = globalThis.PromptSpiralRewrite;
  const detector = globalThis.PromptSpiralDetector;
  const provider = extraction.providerForHost(location.hostname);
  if (!provider) return;

  const suppression = detector.createSuppressionState();
  const observations = [];
  const observedTexts = new Set();
  let host = null;
  let autoHideTimer = null;
  let passiveDisabled = false;
  let suppressionReady = false;
  let typingUntil = 0;
  let evaluationTimer = null;

  chrome.storage.local.get({ passiveDisabled: false }, (settings) => {
    passiveDisabled = Boolean(settings.passiveDisabled);
  });
  chrome.runtime.sendMessage({ type: "PROMPT_SPIRAL_SUPPRESSION_GET" }).then((saved) => {
    if (saved) {
      suppression.dismissedAt = saved.dismissedAt || 0;
      suppression.dismissalsToday = saved.dismissalsToday || 0;
      suppression.day = saved.day || suppression.day;
      suppression.shownEpisodes = new Set(saved.shownEpisodes || []);
    }
  }).catch(() => {}).finally(() => {
    suppressionReady = true;
    scheduleEvaluation();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.passiveDisabled) passiveDisabled = Boolean(changes.passiveDisabled.newValue);
  });

  function messages() {
    return extraction.extractConversation(document, provider);
  }

  function observeUserTurns(currentMessages) {
    const now = Date.now();
    for (const [index, message] of currentMessages.filter((item) => item.role === "user").entries()) {
      const key = `${index}:${message.text}`;
      if (!observedTexts.has(key)) {
        observedTexts.add(key);
        observations.push({ ...message, observedAt: now });
      }
    }
    while (observations.length > 12) observations.shift();
  }

  function removeUi() {
    clearTimeout(autoHideTimer);
    host?.remove();
    host = null;
  }

  function dismissUi() {
    removeUi();
    detector.dismiss(suppression);
    chrome.runtime.sendMessage({ type: "PROMPT_SPIRAL_SUPPRESSION_DISMISS" }).catch(() => {});
  }

  function positionHost(element) {
    const composer = extraction.findComposer(document, provider);
    const rect = composer?.getBoundingClientRect?.();
    const width = Math.min(380, window.innerWidth - 24);
    element.style.setProperty("--ps-width", `${Math.max(260, width)}px`);
    if (rect && rect.width) {
      element.style.setProperty("--ps-right", `${Math.max(12, window.innerWidth - rect.right)}px`);
      element.style.setProperty("--ps-bottom", `${Math.max(12, window.innerHeight - rect.top + 10)}px`);
    } else {
      element.style.setProperty("--ps-right", "16px");
      element.style.setProperty("--ps-bottom", "88px");
    }
  }

  function constrainHostToViewport(element) {
    const rect = element.getBoundingClientRect();
    const currentBottom = Number.parseFloat(getComputedStyle(element).bottom) || 12;
    const currentRight = Number.parseFloat(getComputedStyle(element).right) || 12;
    if (rect.top < 12) {
      element.style.setProperty("--ps-bottom", `${Math.max(12, currentBottom - (12 - rect.top))}px`);
    } else if (rect.bottom > window.innerHeight - 12) {
      element.style.setProperty("--ps-bottom", `${currentBottom + rect.bottom - (window.innerHeight - 12)}px`);
    }
    if (rect.left < 12) {
      element.style.setProperty("--ps-right", `${Math.max(12, currentRight - (12 - rect.left))}px`);
    }
  }

  function createHost() {
    removeUi();
    host = document.createElement("div");
    host.id = "prompt-spiral-root";
    host.setAttribute("data-prompt-spiral", "true");
    positionHost(host);
    document.documentElement.appendChild(host);
    return host;
  }

  function closeButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ps-close";
    button.setAttribute("aria-label", "Close");
    button.textContent = "×";
    button.addEventListener("click", dismissUi);
    return button;
  }

  function showPill(currentMessages) {
    const episode = detector.episodeKey(currentMessages);
    if (!detector.canShow(suppression, episode)) return;
    suppression.shownEpisodes.add(episode);
    chrome.runtime.sendMessage({ type: "PROMPT_SPIRAL_SUPPRESSION_SHOWN", episode }).catch(() => {});
    const element = createHost();
    const pill = document.createElement("div");
    pill.className = "ps-pill";
    pill.setAttribute("role", "group");
    const open = document.createElement("button");
    open.type = "button";
    open.className = "ps-pill-open";
    open.textContent = "✦ Another angle?";
    open.addEventListener("click", () => showSuggestion(currentMessages));
    pill.append(open, closeButton());
    element.appendChild(pill);
    constrainHostToViewport(element);
    autoHideTimer = setTimeout(removeUi, 15_000);
  }

  function dispatchInput(element, value) {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      setter?.call(element, value);
    } else if (element.isContentEditable) {
      element.textContent = value;
    } else {
      return false;
    }
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.focus({ preventScroll: true });
    return true;
  }

  async function useSuggestion(value, button) {
    const composer = extraction.findComposer(document, provider);
    if (composer && dispatchInput(composer, value)) {
      removeUi();
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Not available for this chat";
      button.disabled = true;
    }
  }

  function showUnavailable() {
    const element = createHost();
    const card = document.createElement("section");
    card.className = "ps-card ps-unavailable";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "false");
    const text = document.createElement("p");
    text.textContent = "Not available for this chat";
    card.append(text, closeButton());
    element.appendChild(card);
    constrainHostToViewport(element);
  }

  function showSuggestion(currentMessages = messages()) {
    clearTimeout(autoHideTimer);
    const suggestion = rewrite.generateSuggestion(currentMessages);
    if (!suggestion) {
      showUnavailable();
      return;
    }
    const element = createHost();
    const card = document.createElement("section");
    card.className = "ps-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "false");
    card.setAttribute("aria-labelledby", "ps-title");

    const header = document.createElement("header");
    const title = document.createElement("h2");
    title.id = "ps-title";
    title.textContent = "✦ Another angle?";
    header.append(title, closeButton());

    const prompt = document.createElement("p");
    prompt.className = "ps-suggestion";
    prompt.textContent = suggestion;

    const actions = document.createElement("div");
    actions.className = "ps-actions";
    const use = document.createElement("button");
    use.type = "button";
    use.className = "ps-primary";
    use.textContent = "Use this";
    use.addEventListener("click", () => useSuggestion(prompt.textContent, use));
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => {
      if (prompt.contentEditable === "true") return;
      prompt.contentEditable = "true";
      prompt.setAttribute("role", "textbox");
      prompt.setAttribute("aria-multiline", "true");
      prompt.focus();
      const selection = window.getSelection();
      selection?.selectAllChildren(prompt);
      selection?.collapseToEnd();
    });
    actions.append(use, edit);
    card.append(header, prompt, actions);
    element.appendChild(card);
    constrainHostToViewport(element);
  }

  function safeToInterrupt() {
    const composer = extraction.findComposer(document, provider);
    return Date.now() > typingUntil && document.activeElement !== composer && !extraction.isStreaming(document, provider);
  }

  function evaluate() {
    if (!suppressionReady || passiveDisabled || host || !safeToInterrupt()) return;
    const currentMessages = messages();
    observeUserTurns(currentMessages);
    if (detector.shouldOffer(observations)) {
      const suggestion = rewrite.generateSuggestion(currentMessages);
      if (suggestion) showPill(currentMessages);
    }
  }

  function scheduleEvaluation() {
    clearTimeout(evaluationTimer);
    evaluationTimer = setTimeout(evaluate, 1_200);
  }

  document.addEventListener("input", (event) => {
    const composer = extraction.findComposer(document, provider);
    if (composer && (event.target === composer || composer.contains?.(event.target))) {
      typingUntil = Date.now() + 2_500;
      removeUi();
    }
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && host) {
      event.stopPropagation();
      dismissUi();
    }
  }, true);

  window.addEventListener("resize", () => host && positionHost(host), { passive: true });
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "PROMPT_SPIRAL_MANUAL") showSuggestion();
  });

  const observer = new MutationObserver(scheduleEvaluation);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleEvaluation();
})();
