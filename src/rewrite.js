(function (root) {
  "use strict";

  const CORRECTION_PATTERN = /\b(?:again|but|change|correct|doesn['’]?t|don['’]?t|failed|fix|instead|keep|missing|must|no\b|not\b|remove|still|too\s|use\s|without|wrong)\b/i;

  function compact(text, limit = 520) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (normalized.length <= limit) return normalized;
    const clipped = normalized.slice(0, limit);
    const boundary = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("; "), clipped.lastIndexOf(", "));
    return `${clipped.slice(0, boundary > limit * 0.55 ? boundary + 1 : limit).trim()}…`;
  }

  function isSubstantive(text) {
    const words = String(text || "").trim().split(/\s+/).filter(Boolean);
    return words.length >= 4 && String(text).length >= 20;
  }

  function selectContext(messages) {
    const clean = (messages || []).filter((message) =>
      (message.role === "user" || message.role === "assistant") && isSubstantive(message.text)
    );
    const userMessages = clean.filter((message) => message.role === "user");
    if (userMessages.length < 2) return null;

    const original = userMessages.find((message) => !CORRECTION_PATTERN.test(message.text)) || userMessages[0];
    const originalIndex = clean.indexOf(original);
    const laterUsers = clean.slice(originalIndex + 1).filter((message) => message.role === "user");
    const explicitCorrections = laterUsers.filter((message) => CORRECTION_PATTERN.test(message.text));
    const corrections = (explicitCorrections.length ? explicitCorrections : laterUsers).slice(-3);
    if (!corrections.length) return null;

    const lastAssistant = [...clean].reverse().find((message) => message.role === "assistant") || null;
    return { original, corrections, lastAssistant };
  }

  function taskKind(text) {
    if (/\b(?:bug|code|function|class|compile|test|swift|javascript|typescript|python|java|api|sql|error)\b/i.test(text)) return "solution";
    if (/\b(?:draft|rewrite|essay|email|copy|tone|paragraph|article|post|writing)\b/i.test(text)) return "draft";
    if (/\b(?:design|layout|screen|interface|ui|ux|mockup)\b/i.test(text)) return "design";
    return "response";
  }

  function quote(text) {
    return `“${compact(text).replace(/[“”]/g, '"')}”`;
  }

  function generateSuggestion(messages) {
    const context = selectContext(messages);
    if (!context) return null;
    const goal = compact(context.original.text, 640);
    const corrections = context.corrections.map((message) => compact(message.text, 360));
    if (!goal || corrections.some((text) => !text)) return null;

    const kind = taskKind(`${goal} ${corrections.join(" ")}`);
    const correctionText = corrections.map(quote).join("; ");
    return compact(
      `Revise the last ${kind} while preserving the original goal: ${quote(goal)}. Incorporate these latest corrections exactly where they apply: ${correctionText}. Preserve any parts that already satisfy the request, and return the complete updated ${kind}.`,
      1_600
    );
  }

  root.PromptSpiralRewrite = {
    CORRECTION_PATTERN,
    compact,
    selectContext,
    taskKind,
    generateSuggestion
  };
})(globalThis);
