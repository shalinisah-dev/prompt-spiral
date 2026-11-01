(function (root) {
  "use strict";

  const WINDOW_MS = 10 * 60 * 1000;
  const COOLDOWN_MS = 30 * 60 * 1000;

  function tokens(text) {
    const stop = new Set(["a", "an", "and", "are", "for", "i", "in", "is", "it", "of", "on", "the", "this", "to", "with", "you"]);
    return new Set(String(text || "").toLowerCase().match(/[a-z0-9_]{3,}/g)?.filter((word) => !stop.has(word)) || []);
  }

  function similarity(left, right) {
    const a = tokens(left);
    const b = tokens(right);
    if (!a.size || !b.size) return 0;
    let intersection = 0;
    for (const token of a) if (b.has(token)) intersection += 1;
    return intersection / Math.min(a.size, b.size);
  }

  function shouldOffer(observations, now = Date.now()) {
    const recent = (observations || []).filter((entry) =>
      entry.role === "user" && entry.observedAt >= now - WINDOW_MS
    );
    if (recent.length < 3) return false;
    const finalTurns = recent.slice(-4);
    const correctionPattern = root.PromptSpiralRewrite?.CORRECTION_PATTERN || /\b(?:again|but|fix|instead|not|still)\b/i;
    const corrections = finalTurns.filter((entry) => correctionPattern.test(entry.text));
    if (corrections.length < 2) return false;
    let overlappingPairs = 0;
    for (let index = 1; index < finalTurns.length; index += 1) {
      if (similarity(finalTurns[index - 1].text, finalTurns[index].text) >= 0.32) overlappingPairs += 1;
    }
    return overlappingPairs >= 1;
  }

  function episodeKey(messages) {
    const text = (messages || []).filter((message) => message.role === "user").slice(-3).map((message) => message.text).join("|");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function createSuppressionState() {
    return { dismissedAt: 0, dismissalsToday: 0, day: new Date().toDateString(), shownEpisodes: new Set() };
  }

  function canShow(state, episode, now = Date.now()) {
    const day = new Date(now).toDateString();
    if (state.day !== day) {
      state.day = day;
      state.dismissalsToday = 0;
      state.shownEpisodes.clear();
    }
    return now - state.dismissedAt >= COOLDOWN_MS && state.dismissalsToday < 3 && !state.shownEpisodes.has(episode);
  }

  function dismiss(state, now = Date.now()) {
    state.dismissedAt = now;
    state.dismissalsToday += 1;
  }

  root.PromptSpiralDetector = {
    WINDOW_MS,
    COOLDOWN_MS,
    tokens,
    similarity,
    shouldOffer,
    episodeKey,
    createSuppressionState,
    canShow,
    dismiss
  };
})(globalThis);
