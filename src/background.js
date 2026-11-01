"use strict";

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "PROMPT_SPIRAL_MANUAL" });
  } catch {
    // Unsupported pages intentionally receive no injected script.
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ passiveDisabled: false }, (settings) => {
    chrome.storage.local.set({ passiveDisabled: Boolean(settings.passiveDisabled) });
  });
});

function suppressionKey(tabId) {
  return `suppression:${tabId}`;
}

function freshSuppression() {
  return { dismissedAt: 0, dismissalsToday: 0, day: new Date().toDateString(), shownEpisodes: [] };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (!tabId || !message?.type?.startsWith("PROMPT_SPIRAL_SUPPRESSION_")) return false;
  const key = suppressionKey(tabId);
  chrome.storage.session.get({ [key]: freshSuppression() }, (stored) => {
    const state = stored[key];
    const today = new Date().toDateString();
    if (state.day !== today) Object.assign(state, freshSuppression());

    if (message.type === "PROMPT_SPIRAL_SUPPRESSION_SHOWN" && message.episode) {
      state.shownEpisodes = Array.from(new Set([...state.shownEpisodes, message.episode])).slice(-12);
      chrome.storage.session.set({ [key]: state }, () => sendResponse(state));
      return;
    }
    if (message.type === "PROMPT_SPIRAL_SUPPRESSION_DISMISS") {
      state.dismissedAt = Date.now();
      state.dismissalsToday += 1;
      chrome.storage.session.set({ [key]: state }, () => sendResponse(state));
      return;
    }
    sendResponse(state);
  });
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(suppressionKey(tabId));
});
